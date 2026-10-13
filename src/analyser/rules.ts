import type { Classification, Rule, TaskType } from '../shared/types';
import { TASK_TYPES } from '../shared/types';

export interface RuleContext { cls: Classification; site: string }

export function ruleApplies(r: Rule, ctx: RuleContext): boolean {
  const w = r.when;
  if (w.task && w.task !== ctx.cls.primary) return false;
  if (w.site && w.site !== ctx.site) return false;
  if (w.sensitive !== undefined && w.sensitive !== ctx.cls.sensitive.length > 0) return false;
  if (w.minTokens !== undefined && ctx.cls.tokensIn < w.minTokens) return false;
  if (w.maxTokens !== undefined && ctx.cls.tokensIn > w.maxTokens) return false;
  return true;
}

export interface RuleEffects { excluded: Set<string>; boosts: Map<string, { boost: number; ruleId: string }> }

export function applyRules(rules: Rule[], ctx: RuleContext): RuleEffects {
  const excluded = new Set<string>();
  const boosts = new Map<string, { boost: number; ruleId: string }>();
  for (const r of rules) {
    if (!ruleApplies(r, ctx)) continue;
    for (const id of r.then.exclude ?? []) excluded.add(id);
    if (r.then.prefer) {
      const prev = boosts.get(r.then.prefer)?.boost ?? 0;
      boosts.set(r.then.prefer, { boost: prev + (r.then.boost ?? 0.15), ruleId: r.id });
    }
  }
  return { excluded, boosts };
}

export function validateRule(x: unknown): Rule {
  if (!x || typeof x !== 'object') throw new Error('rule must be an object');
  const r = x as Record<string, any>;
  if (typeof r.id !== 'string' || !r.id) throw new Error('rule.id must be a non-empty string');
  const when = r.when ?? {};
  const then = r.then ?? {};
  if (typeof when !== 'object' || typeof then !== 'object') throw new Error(`rule ${r.id}: when/then must be objects`);
  if (when.task !== undefined && !TASK_TYPES.includes(when.task as TaskType)) throw new Error(`rule ${r.id}: unknown task ${when.task}`);
  if (when.site !== undefined && typeof when.site !== 'string') throw new Error(`rule ${r.id}: site must be a string`);
  if (when.sensitive !== undefined && typeof when.sensitive !== 'boolean') throw new Error(`rule ${r.id}: sensitive must be boolean`);
  for (const k of ['minTokens', 'maxTokens']) {
    if (when[k] !== undefined && !(Number.isFinite(when[k]) && when[k] >= 0)) throw new Error(`rule ${r.id}: ${k} must be a non-negative number`);
  }
  if (then.prefer !== undefined && typeof then.prefer !== 'string') throw new Error(`rule ${r.id}: prefer must be a model id`);
  if (then.exclude !== undefined && !(Array.isArray(then.exclude) && then.exclude.every((s: unknown) => typeof s === 'string'))) throw new Error(`rule ${r.id}: exclude must be a list of model ids`);
  if (then.boost !== undefined && !(Number.isFinite(then.boost) && Math.abs(then.boost) <= 1)) throw new Error(`rule ${r.id}: boost must be between -1 and 1`);
  if (!then.prefer && !then.exclude) throw new Error(`rule ${r.id}: needs prefer or exclude`);
  return { id: r.id, when: { ...when }, then: { ...then } };
}
