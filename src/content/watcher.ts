import { classify } from '../analyser/classify';
import { decide } from '../analyser/decide';
import { explain } from '../analyser/explain';
import { scoreCandidates } from '../analyser/score';
import { candidatesElsewhere, candidatesFor } from '../catalog/index';
import { resolveModelLabel, resolveOptionKey } from '../catalog/aliases';
import { debounce } from '../shared/debounce';
import type { Catalog, ObservedMap, Prefs, Rule, Suggestion } from '../shared/types';
import type { ComposerHandle, SiteAdapter } from '../sites/adapter';
import { SwitchError, waitFor, type SwitchTarget } from '../sites/drive';
import { Badge } from './badge';
import type { Cloud } from './cloud';
import { watchSend, type SendWatch } from './send';
import { readTheme } from './theme';
import { record } from './usage';

export const IDLE_MS = 400;
/** How long "Choose for me" may spend on the site's menu before it sends unchanged. */
export const SWITCH_MS = 1500;
/** How long the "Sent with … · Switch back" line stays. */
export const NOTICE_MS = 15000;

/** What the last held send did. Kept on Shared: the site often re-renders the composer after a send. */
export interface Notice {
  kind: 'switched' | 'failed';
  sentWith: string;           // label of the option the message went with
  beforeKey?: string;         // option the picker had before the switch, for "Switch back"
  beforeLabel?: string;
  reason?: string;            // SwitchError reason when it failed
  until: number;              // Date.now() value when the notice expires
}

export interface Shared {
  catalog: Catalog; prefs: Prefs; rules: Rule[]; adapter: SiteAdapter; cloud: Cloud; serviceId: string;
  observed: ObservedMap;      // models seen in each service's picker
  notice?: Notice;
}

/** Chats (location.pathname) where the person chose "Don't switch in this chat"; per tab, never stored. */
const optedOut = new Set<string>();

const REASONS: Record<string, string> = {
  'no-picker': "the model menu wasn't found",
  'not-offered': "the menu doesn't offer it",
  timeout: 'the menu took too long',
  mismatch: 'the menu shows something else',
  error: 'something went wrong',
};

/** One per composer: listens to typing, runs the pipeline, owns a badge. */
export class ComposerWatcher {
  readonly badge: Badge;
  private suggestion?: Suggestion;
  private send: SendWatch;
  private run = debounce(() => this.analyse(), IDLE_MS);
  private voted = false;
  private busy = false;                   // a held send or a switch back is driving the menu
  private holding = false;                // a held send waits for its release
  private baseline: string | null;        // picker label after the last send: a change since then is the person's own pick
  private lastLabel: string | null = null;
  private switched?: 'switched' | 'failed';

  constructor(readonly c: ComposerHandle, private shared: Shared) {
    const theme = readTheme(c.element, c.container);
    this.badge = new Badge(shared.adapter.anchor(c), theme);
    this.badge.onWhy(() => this.toggleCloud());
    for (const ev of ['input', 'keyup', 'paste', 'focus']) c.element.addEventListener(ev, this.run);
    this.baseline = shared.adapter.currentModel(c);
    this.send = watchSend(c, shared.adapter, { hold: () => this.hold(), holding: () => this.holding, sent: () => this.onSent() });
    this.analyse();
    this.showNotice();
  }

  refreshTheme(): void {
    const t = readTheme(this.c.element, this.c.container);
    this.badge.setTheme(t);
    this.shared.cloud.setTheme(t);
  }

  /** Re-run after prefs, rules or catalog changed. */
  reanalyse(): void { this.suggestion = undefined; this.analyse(); }

  /** After a DOM change: when the picker now reads something else (the person picked), refresh the pill. */
  syncPicker(): void {
    if (this.suggestion && !this.busy && this.shared.adapter.currentModel(this.c) !== this.lastLabel) this.analyse();
  }

  private analyse(): void {
    const { adapter, catalog, prefs, rules, serviceId, observed } = this.shared;
    const text = adapter.readText(this.c).trim();
    const attachments = adapter.attachments(this.c);
    if (!text && !attachments.some(a => a.kind === 'image')) { this.badge.hide(); this.suggestion = undefined; if (this.shared.cloud.isOpen) this.shared.cloud.close(); return; }
    const cls = classify(text, attachments);
    const currentLabel = adapter.currentModel(this.c);
    this.lastLabel = currentLabel;
    if (this.baseline === null) this.baseline = currentLabel;   // the picker rendered after the composer
    const current = resolveOptionKey(catalog, serviceId, currentLabel) ?? undefined;
    // What you picked or voted before never enters the ranking: it rests on the prompt and the documented facts.
    let here = scoreCandidates(cls, candidatesFor(catalog, serviceId, prefs, observed), prefs, rules, serviceId);
    let elsewhere = scoreCandidates(cls, candidatesElsewhere(catalog, serviceId, prefs, observed), prefs, rules, serviceId);
    if (!here.length && !(serviceId in catalog.services)) {
      // Unknown site (generic adapter): rank the services the user enabled instead.
      here = elsewhere; elsewhere = [];
    }
    const trusted = new Set(Object.entries(prefs.services).filter(([, s]) => s.trusted).map(([id]) => id));
    const s = decide({ here, elsewhere, current, previous: this.suggestion, classification: cls, trustedServices: trusted, crossService: prefs.crossService });
    if (!s) { this.badge.hide(); return; }
    if (this.suggestion?.here.key !== s.here.key) this.voted = false;
    this.suggestion = s;
    this.badge.update(s, catalog, serviceId, !!this.switchTarget(s));
    if (this.shared.cloud.isOpen) this.openCloud();
  }

  private toggleCloud(): void {
    if (this.shared.cloud.isOpen) this.shared.cloud.close(); else this.openCloud();
  }

  private openCloud(): void {
    const s = this.suggestion;
    if (!s) return;
    const { cloud, catalog, adapter } = this.shared;
    cloud.onFeedback(v => {
      if (this.voted) return;
      this.voted = true;
      record({ kind: 'feedback', site: this.shared.serviceId, task: s.classification.primary, suggested: s.here.modelId, vote: v });
    });
    cloud.open(explain(s, catalog), () => ({
      content: adapter.contentColumn(this.c).getBoundingClientRect(),
      composer: this.c.container.getBoundingClientRect(),
    }));
  }

  // --- Choose for me -------------------------------------------------------------------------------------------

  /** The option to switch to before this send, or null when the send goes as it is. */
  private switchTarget(s = this.suggestion): SwitchTarget | null {
    const { prefs, adapter, serviceId } = this.shared;
    if (!prefs.autoSwitch || !adapter.switchTo || !s || s.isCurrent || s.here.serviceId !== serviceId) return null;
    if (optedOut.has(location.pathname)) return null;
    if (adapter.currentModel(this.c) !== this.baseline) return null;   // the person picked since the last send: theirs wins
    const apiId = s.here.model.apiId;
    return apiId ? { apiId, effortId: s.here.effort?.id } : null;
  }

  /** True when the picker's label reads the option key (a key without an effort matches any effort of that model). */
  private reads(key: string): boolean {
    const { catalog, serviceId, adapter } = this.shared;
    const cur = resolveOptionKey(catalog, serviceId, adapter.currentModel(this.c));
    return !!cur && (cur === key || (!key.includes('@') && cur.split('@')[0] === key));
  }

  private labelFor(key: string | null | undefined, fallback: string | null): string {
    return (key && this.suggestion?.ranked.find(r => r.key === key)?.label) || fallback || 'the model shown';
  }

  /** SendGate.hold: hold the send when the suggestion differs from the picker; never let a second send through. */
  private hold(): boolean {
    if (this.holding) return true;
    if (this.busy) return false;   // a switch back is running: this send goes with whatever the menu shows
    this.run.cancel();
    this.analyse();   // the last keystrokes may not have been analysed yet
    const s = this.suggestion;
    const t = this.switchTarget(s);
    if (!s || !t) return false;
    this.busy = this.holding = true;
    void this.switchThenSend(s, t);
    return true;
  }

  private async switchThenSend(s: Suggestion, t: SwitchTarget): Promise<void> {
    const { adapter, catalog, serviceId } = this.shared;
    const beforeLabel = adapter.currentModel(this.c);
    const beforeKey = resolveOptionKey(catalog, serviceId, beforeLabel) ?? undefined;
    this.badge.status(`Switching to ${s.here.label}…`, [], 0, true);
    let reason: string | undefined;
    try {
      const deadline = Date.now() + SWITCH_MS;
      await adapter.switchTo!(this.c, t, deadline);
      await waitFor(() => this.reads(s.here.key), deadline + 300, 'label').catch(() => { throw new SwitchError('mismatch'); });
    } catch (e) {
      reason = e instanceof SwitchError ? e.reason : 'error';
    }
    this.switched = reason ? 'failed' : 'switched';
    this.c.element.focus();
    this.holding = false;
    this.send.release();
    this.busy = false;
    const nowKey = resolveOptionKey(catalog, serviceId, adapter.currentModel(this.c));
    this.shared.notice = reason
      ? { kind: 'failed', sentWith: this.labelFor(nowKey, adapter.currentModel(this.c)), reason, until: Date.now() + NOTICE_MS }
      : { kind: 'switched', sentWith: s.here.label, beforeKey, beforeLabel: this.labelFor(beforeKey, beforeLabel), until: Date.now() + NOTICE_MS };
    this.showNotice();
  }

  /** Render the shared notice on this composer's badge (a re-rendered composer picks it up too). */
  private showNotice(): void {
    const n = this.shared.notice;
    const left = n ? n.until - Date.now() : 0;
    if (!n || left <= 0) return;
    if (n.kind === 'failed') {
      this.badge.status(`Couldn't switch (${REASONS[n.reason ?? 'error']}), sent with ${n.sentWith}`, [], left);
      return;
    }
    const back = n.beforeKey && this.shared.catalog.models[n.beforeKey.split('@')[0]!]?.apiId;
    this.badge.status(`Sent with ${n.sentWith}`, back ? [{
      label: 'Switch back',
      title: `Set the menu back to ${n.beforeLabel} for your next message`,
      run: () => { void this.switchBack(n); },
    }] : [], left);
  }

  private async switchBack(n: Notice): Promise<void> {
    const { adapter, catalog } = this.shared;
    const [modelId, effortId] = n.beforeKey!.split('@');
    const apiId = catalog.models[modelId!]?.apiId;
    if (!apiId || this.busy || !adapter.switchTo) return;
    this.busy = true;
    this.shared.notice = undefined;
    this.badge.status(`Switching back to ${n.beforeLabel}…`, [], 0, true);
    let ok = true;
    try {
      const deadline = Date.now() + SWITCH_MS;
      await adapter.switchTo(this.c, { apiId, effortId }, deadline);
      await waitFor(() => this.reads(n.beforeKey!), deadline + 300, 'label');
    } catch { ok = false; }
    this.busy = false;
    this.c.element.focus();
    // The picker now differs from the baseline, so the next message goes with it: the person's pick wins.
    if (!ok) { this.badge.status(`Couldn't switch back; pick ${n.beforeLabel} in the model menu`, [], NOTICE_MS); return; }
    this.badge.status(`Back on ${n.beforeLabel} for your next message`, [{
      label: "Don't switch in this chat",
      title: 'Euboulia keeps suggesting here but leaves the model menu alone until you reload the tab',
      run: () => { optedOut.add(location.pathname); this.analyse(); this.badge.status("Won't switch in this chat", [], 4000); },
    }], NOTICE_MS);
    this.analyse();
  }

  private onSent(): void {
    const s = this.suggestion;
    const how = this.switched;
    this.switched = undefined;
    this.baseline = this.shared.adapter.currentModel(this.c);
    if (!how && this.badge.statusText && !this.busy) { this.shared.notice = undefined; this.badge.clearStatus(); }
    if (!s) return;
    const selected = resolveModelLabel(this.shared.catalog, this.shared.serviceId, this.shared.adapter.currentModel(this.c)) ?? undefined;
    record({ kind: 'outcome', site: this.shared.serviceId, task: s.classification.primary, suggested: s.here.modelId, selected, followed: selected !== undefined ? selected === s.here.modelId : undefined, ...(how ? { autoSwitch: how } : {}) });
    this.shared.cloud.close();
    this.suggestion = undefined;
    this.badge.hide();   // the suggestion was for the message just sent; the status line stays
    setTimeout(() => this.analyse(), 300);
  }

  destroy(): void {
    this.run.cancel();
    for (const ev of ['input', 'keyup', 'paste', 'focus']) this.c.element.removeEventListener(ev, this.run);
    this.send.stop();
    this.badge.destroy();
  }
}
