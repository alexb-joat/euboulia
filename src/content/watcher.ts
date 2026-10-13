import { classify } from '../analyser/classify';
import { decide } from '../analyser/decide';
import { explain } from '../analyser/explain';
import { learnBiases } from '../analyser/learn';
import { scoreCandidates } from '../analyser/score';
import { candidatesElsewhere, candidatesFor } from '../catalog/index';
import { resolveModelLabel } from '../catalog/aliases';
import { debounce } from '../shared/debounce';
import type { Catalog, ObservedMap, Prefs, Rule, Suggestion, UsageEvent } from '../shared/types';
import type { ComposerHandle, SiteAdapter } from '../sites/adapter';
import { Badge } from './badge';
import type { Cloud } from './cloud';
import { detectSend } from './send';
import { readTheme } from './theme';
import { record } from './usage';

export const IDLE_MS = 400;

export interface Shared {
  catalog: Catalog; prefs: Prefs; rules: Rule[]; adapter: SiteAdapter; cloud: Cloud; serviceId: string;
  observed: ObservedMap;      // models seen in each service's picker
  usage: UsageEvent[];        // local outcome/feedback history for learned biases
}

/** One per composer: listens to typing, runs the pipeline, owns a badge. */
export class ComposerWatcher {
  readonly badge: Badge;
  private suggestion?: Suggestion;
  private stopSend: () => void;
  private run = debounce(() => this.analyse(), IDLE_MS);
  private voted = false;

  constructor(readonly c: ComposerHandle, private shared: Shared) {
    const theme = readTheme(c.element, c.container);
    this.badge = new Badge(shared.adapter.anchor(c), theme);
    this.badge.onWhy(() => this.toggleCloud());
    for (const ev of ['input', 'keyup', 'paste', 'focus']) c.element.addEventListener(ev, this.run);
    this.stopSend = detectSend(c, () => this.onSent());
    this.analyse();
  }

  refreshTheme(): void {
    const t = readTheme(this.c.element, this.c.container);
    this.badge.setTheme(t);
    this.shared.cloud.setTheme(t);
  }

  /** Re-run after prefs, rules or catalog changed. */
  reanalyse(): void { this.suggestion = undefined; this.analyse(); }

  private analyse(): void {
    const { adapter, catalog, prefs, rules, serviceId, observed, usage } = this.shared;
    const text = adapter.readText(this.c).trim();
    const attachments = adapter.attachments(this.c);
    if (!text && !attachments.some(a => a.kind === 'image')) { this.badge.hide(); this.suggestion = undefined; if (this.shared.cloud.isOpen) this.shared.cloud.close(); return; }
    const cls = classify(text, attachments);
    const currentLabel = adapter.currentModel(this.c);
    const current = resolveModelLabel(catalog, serviceId, currentLabel) ?? undefined;
    const labelOf = (id: string) => catalog.services[serviceId]?.models.find(m => m.modelId === id)?.label ?? catalog.models[id]?.name ?? id;
    const biases = learnBiases(usage, serviceId, cls.primary, labelOf);
    let here = scoreCandidates(cls, candidatesFor(catalog, serviceId, prefs, observed), prefs, rules, serviceId, biases);
    let elsewhere = scoreCandidates(cls, candidatesElsewhere(catalog, serviceId, prefs, observed), prefs, rules, serviceId);
    if (!here.length && !(serviceId in catalog.services)) {
      // Unknown site (generic adapter): rank the services the user enabled instead.
      here = elsewhere; elsewhere = [];
    }
    const trusted = new Set(Object.entries(prefs.services).filter(([, s]) => s.trusted).map(([id]) => id));
    const s = decide({ here, elsewhere, current, previous: this.suggestion, classification: cls, trustedServices: trusted, crossService: prefs.crossService });
    if (!s) { this.badge.hide(); return; }
    if (this.suggestion?.here.modelId !== s.here.modelId) this.voted = false;
    this.suggestion = s;
    this.badge.update(s, catalog, serviceId);
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
    const content = adapter.contentColumn(this.c).getBoundingClientRect();
    const composer = this.c.container.getBoundingClientRect();
    cloud.open(explain(s, catalog), content, composer);
  }

  private onSent(): void {
    const s = this.suggestion;
    if (!s) return;
    const selected = resolveModelLabel(this.shared.catalog, this.shared.serviceId, this.shared.adapter.currentModel(this.c)) ?? undefined;
    record({ kind: 'outcome', site: this.shared.serviceId, task: s.classification.primary, suggested: s.here.modelId, selected, followed: selected !== undefined ? selected === s.here.modelId : undefined });
    this.shared.cloud.close();
    this.suggestion = undefined;
    setTimeout(() => this.analyse(), 300);
  }

  destroy(): void {
    this.run.cancel();
    for (const ev of ['input', 'keyup', 'paste', 'focus']) this.c.element.removeEventListener(ev, this.run);
    this.stopSend();
    this.badge.destroy();
  }
}
