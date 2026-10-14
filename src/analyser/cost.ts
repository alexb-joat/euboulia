import type { CatalogModel, CostEstimate, TaskType } from '../shared/types';

export function outputTokensFor(task: TaskType, tokensIn: number): number {
  switch (task) {
    case 'chat': return 150;
    case 'summarise': return Math.min(Math.max(80, Math.round(tokensIn * 0.25)), 800);
    case 'translate': return Math.max(50, tokensIn);
    case 'code': return 700;
    case 'reasoning': return 1500;
    case 'writing': return 600;
    case 'data': return 500;
    case 'vision': return 400;
    case 'long_context': return 800;
  }
}

export function apiUsd(model: CatalogModel, tokensIn: number, tokensOut: number): number | undefined {
  if (!model.price) return undefined;
  return (tokensIn * model.price.input + tokensOut * model.price.output) / 1e6;
}

export function estimateCost(
  model: CatalogModel, tokensIn: number, task: TaskType, plan?: string, capWeight?: number, outputMultiplier = 1,
): CostEstimate {
  const tokensOut = Math.round(outputTokensFor(task, tokensIn) * outputMultiplier);
  const usd = apiUsd(model, tokensIn, tokensOut);
  if (plan) return { kind: 'included', plan, capWeight: capWeight ?? 1, apiUsd: usd, tokensOut };
  if (usd === undefined) return { kind: 'unknown', tokensOut };
  return { kind: 'api', usd, tokensOut };
}

export function formatUsd(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.0005) return '<$0.001';
  if (usd < 0.01) return `~$${usd.toFixed(3)}`;
  if (usd < 1) return `~$${usd.toFixed(2)}`;
  return `~$${usd.toFixed(1)}`;
}

export function formatCost(c: CostEstimate, planName?: string): string {
  switch (c.kind) {
    case 'api': return formatUsd(c.usd);
    case 'included': return `included (${planName ?? c.plan})`;
    case 'unknown': return 'price unknown';
  }
}
