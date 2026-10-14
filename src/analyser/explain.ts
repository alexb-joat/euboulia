import type { Catalog, Ranked, Suggestion, TaskType } from '../shared/types';
import { TASK_LABELS } from '../shared/types';
import { formatCost, formatUsd } from './cost';

export interface ExplainRow {
  key: string; modelId: string; label: string; serviceName: string; fit: number; cost: string; apiCost?: string; isWinner: boolean; isCurrent?: boolean;
}

export interface Explanation {
  taskLabel: string;
  signals: string[];
  tokens: number;
  sensitive: string[];
  rows: ExplainRow[];
  more: ExplainRow[];          // every other model that can take the prompt, best first
  why: string;
  elsewhere?: { label: string; serviceName: string; cost: string; why: string };
  isCurrent: boolean;
}

export function planName(catalog: Catalog, r: Ranked): string | undefined {
  const svc = catalog.services[r.serviceId];
  return r.plan ? (svc?.plans?.[r.plan]?.name ?? r.plan) : undefined;
}

function costStrings(catalog: Catalog, r: Ranked): { cost: string; apiCost?: string } {
  const cost = formatCost(r.cost, planName(catalog, r));
  const apiCost = r.cost.kind === 'included' && r.cost.apiUsd !== undefined
    ? `API equivalent ${formatUsd(r.cost.apiUsd)}` : undefined;
  return { cost, apiCost };
}

function dominantReason(s: Suggestion, catalog: Catalog): string {
  const w = s.here;
  const runnerUp = s.ranked.find(r => r.key !== w.key);
  const task = TASK_LABELS[s.classification.primary];
  const parts: string[] = [];
  if (w.reasons.length) parts.push(w.reasons[0]!);
  if (!runnerUp) {
    parts.push(`the only model here that can take this ${task} prompt`);
  } else {
    const fitGap = w.fit - runnerUp.fit;
    const costGap = w.costScore - runnerUp.costScore;
    if (s.isCurrent && Math.abs(w.total - runnerUp.total) <= 0.02) {
      parts.push(`your current pick is as good as any for ${task}`);
    } else if (fitGap >= 0.05 && costGap >= 0) {
      parts.push(`best fit for ${task} (${w.fit.toFixed(2)}) and no dearer than the alternatives`);
    } else if (fitGap >= 0.05) {
      parts.push(`best fit for ${task} (${w.fit.toFixed(2)}); worth the extra cost at your setting`);
    } else if (costGap > 0) {
      const wu = w.cost.kind === 'api' ? w.cost.usd : w.cost.kind === 'included' ? w.cost.apiUsd : undefined;
      const ru = runnerUp.cost.kind === 'api' ? runnerUp.cost.usd : runnerUp.cost.kind === 'included' ? runnerUp.cost.apiUsd : undefined;
      const ratio = wu !== undefined && ru !== undefined && wu > 0 ? Math.round(ru / wu) : undefined;
      parts.push(ratio && ratio >= 2
        ? `about ${ratio}× cheaper than ${runnerUp.label} for a ${s.classification.size} ${task} prompt, with similar fit`
        : `cheaper than ${runnerUp.label} with similar fit for ${task}`);
    } else {
      parts.push(`best balance of fit and cost for ${task}`);
    }
  }
  if (s.classification.sensitive.length) parts.push('sensitive data detected: kept on this service');
  return parts.join('; ') + '.';
}

export function explain(s: Suggestion, catalog: Catalog): Explanation {
  const toRow = (r: Ranked): ExplainRow => ({
    key: r.key, modelId: r.modelId, label: r.label,
    serviceName: catalog.services[r.serviceId]?.name ?? r.serviceId,
    fit: r.fit, ...costStrings(catalog, r), isWinner: r.key === s.here.key, isCurrent: s.current === r.key,
  });
  const rows: ExplainRow[] = s.ranked.slice(0, 3).map(toRow);
  const shown = new Set(rows.map(r => r.key));
  if (!rows.some(r => r.isWinner)) {
    const w = s.here;
    shown.delete(rows[2]!.key);
    rows.splice(2, 1, toRow(w));
    shown.add(w.key);
  }
  const more = s.ranked.filter(r => !shown.has(r.key)).map(toRow);
  const signals = s.classification.signals
    .map(x => x.startsWith('kw:') ? `"${x.slice(3)}"` : x.startsWith('pattern:') ? `${x.slice(8)} pattern` : x.replace(':', ' '))
    .slice(0, 8);
  const e = s.elsewhere;
  return {
    taskLabel: TASK_LABELS[s.classification.primary as TaskType],
    signals, tokens: s.classification.tokensIn, sensitive: s.classification.sensitive,
    rows, more, why: dominantReason(s, catalog), isCurrent: s.isCurrent,
    elsewhere: e ? {
      label: e.label, serviceName: catalog.services[e.serviceId]?.name ?? e.serviceId,
      cost: costStrings(catalog, e).cost, why: e.reasons[e.reasons.length - 1] ?? '',
    } : undefined,
  };
}
