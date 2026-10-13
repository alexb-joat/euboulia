import type { Candidate, CatalogModel, Classification, Prefs, TaskType } from '../../src/shared/types';
import { DEFAULT_PREFS } from '../../src/shared/types';

export function model(over: Partial<CatalogModel> & { strengths?: Partial<Record<TaskType, number>> } = {}): CatalogModel {
  return {
    provider: 'test', name: 'Test', context: 200000, capabilities: ['vision', 'tools'],
    strengths: { code: 0.7, reasoning: 0.7, writing: 0.7, chat: 0.9, summarise: 0.8, translate: 0.8, data: 0.7, vision: 0.7, long_context: 0.8 },
    price: { input: 1, output: 5 }, ...over,
  };
}

export function cand(modelId: string, over: Partial<CatalogModel> = {}, serviceId = 'svc', extra: Partial<Candidate> = {}): Candidate {
  return { modelId, serviceId, label: modelId, model: model({ name: modelId, ...over }), ...extra };
}

export function cls(primary: TaskType = 'code', tokensIn = 200, over: Partial<Classification> = {}): Classification {
  return { primary, weights: { [primary]: 1 }, tokensIn, size: 'short', signals: [], sensitive: [], ...over };
}

export const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, services: {}, ...over });
