// Shared data shapes. The catalog types double as the contract for the
// crawler project that will publish catalog.json later.

export type TaskType =
  | 'code' | 'reasoning' | 'writing' | 'chat' | 'summarise'
  | 'translate' | 'data' | 'vision' | 'long_context';

export const TASK_TYPES: readonly TaskType[] = [
  'code', 'reasoning', 'writing', 'chat', 'summarise', 'translate', 'data', 'vision', 'long_context',
];

export const TASK_LABELS: Record<TaskType, string> = {
  code: 'code', reasoning: 'reasoning', writing: 'writing', chat: 'quick chat',
  summarise: 'summarising', translate: 'translation', data: 'data work',
  vision: 'image understanding', long_context: 'long context',
};

export interface Price {
  input: number; output: number;   // USD per 1M tokens
  /** Higher rates once the prompt exceeds `threshold` input tokens (Haiku 5.5 above 100k, GPT-6 above 272k). */
  longContext?: { threshold: number; input: number; output: number };
}

export type ModelStatus = 'active' | 'legacy' | 'deprecated' | 'retired';

export interface CatalogSource { url: string; date: string; field?: string }

export interface CatalogModel {
  provider: string;
  name: string;
  apiId?: string;                                  // the provider's own model id
  status?: ModelStatus;                            // from the provider's deprecations page; retired models are never offered
  retiresAt?: string;                              // date or "not before <date>"
  maxOutput?: number;
  efforts?: string[];                              // API effort ids the model accepts (low … max); absent = no effort control
  defaultEffort?: string;
  strengths: Partial<Record<TaskType, number>>;   // 0..1
  price?: Price;
  context: number;
  capabilities: string[];                          // 'vision' | 'tools' | ...
  released?: string;
  sources?: CatalogSource[];
}

export interface ServicePlan {
  name?: string;
  price: number;              // USD per month, 0 for free
  capUnit?: string;
  note?: string;
}

export interface ServiceModel {
  modelId: string;            // key into Catalog.models
  label: string;              // as shown in the site's picker
  aliases?: string[];
  plans?: string[];           // plan ids that include this model
  capWeight?: number;         // how hard it hits the plan's cap (1 = reference)
  efforts?: string[];         // ids from CatalogService.efforts this model offers; absent = no effort setting
  legacy?: boolean;           // listed under the site's "More models" / older models
  surface?: string;           // where the site offers it when it has several pickers (ChatGPT: "chat" | "work")
  note?: string;
}

/**
 * A reasoning-effort setting a service offers on some models (e.g. Claude's Low … Max).
 * Higher effort spends more output (thinking) tokens and plan cap, and fits hard tasks a little better.
 */
export interface EffortLevel {
  id: string;                                       // the provider's API value (low, medium, high, xhigh, max, none)
  label: string;                                    // as shown in the picker
  aliases?: string[];
  outputMultiplier: number;                         // output tokens relative to the default effort
  capMultiplier?: number;                           // plan cap use relative to the default (defaults to outputMultiplier)
  fitDelta?: Partial<Record<TaskType, number>>;     // added to the model's strengths, clamped to 0..1
}

export interface ServiceSelectors {
  composer?: string[];
  sendButton?: string[];
  modelPicker?: string[];
  pickerOpen?: string[];
  attachments?: string[];
  contentColumn?: string[];
}

export interface CatalogService {
  name: string;
  hosts: string[];
  url?: string;               // where to open a new chat
  selectors?: ServiceSelectors;
  plans?: Record<string, ServicePlan>;
  efforts?: EffortLevel[];
  models: ServiceModel[];
}

export interface Catalog {
  schemaVersion: 1;
  generatedAt: string;
  factsGeneratedAt?: string;  // date of the provider documentation the prices and statuses were read from
  services: Record<string, CatalogService>;
  models: Record<string, CatalogModel>;
}

export interface CatalogMeta {
  url?: string;
  etag?: string;
  fetchedAt?: string;
  generatedAt?: string;
  lastError?: string;
  source: 'bundled' | 'remote';
}

export interface Attachment { kind: 'image' | 'file'; name?: string }

export interface Classification {
  primary: TaskType;
  weights: Partial<Record<TaskType, number>>;
  tokensIn: number;
  size: 'short' | 'medium' | 'long';
  signals: string[];          // names only, never matched text
  sensitive: string[];        // detector names
}

export type CostEstimate =
  | { kind: 'api'; usd: number; tokensOut: number }
  | { kind: 'included'; plan: string; capWeight: number; apiUsd?: number; tokensOut: number }
  | { kind: 'unknown'; tokensOut: number };

export interface Candidate {
  key: string;                // modelId, plus "@effort" when an effort level applies: the identity of an option
  modelId: string;
  serviceId: string;
  label: string;              // picker label, plus " · <effort>" when an effort level applies
  effort?: EffortLevel;
  model: CatalogModel;
  plan?: string;              // plan the user has on this service, if the model is in it
  capWeight?: number;
}

export interface Ranked extends Candidate {
  fit: number;
  cost: CostEstimate;
  costScore: number;
  total: number;
  reasons: string[];
}

export interface Suggestion {
  id: string;
  here: Ranked;
  elsewhere?: Ranked;
  isCurrent: boolean;
  current?: string;           // key of the option selected in the picker, if recognised
  classification: Classification;
  ranked: Ranked[];
}

export interface Rule {
  id: string;
  when: { task?: TaskType; site?: string; sensitive?: boolean; minTokens?: number; maxTokens?: number };
  then: { prefer?: string; exclude?: string[]; boost?: number };
}

export interface ServicePrefs {
  enabled: boolean;           // takes part in cross-service suggestions
  plan?: string;              // plan id from the catalog
  trusted?: boolean;          // may receive prompts with sensitive data
}

export interface Prefs {
  costWeight: number;         // 0 = best quality, 1 = cheapest
  crossService: boolean;
  cloudCollapsedByDefault: boolean;
  services: Record<string, ServicePrefs>;
  catalogUrl?: string;
}

export const DEFAULT_PREFS: Prefs = {
  costWeight: 0.35,
  crossService: true,
  cloudCollapsedByDefault: false,
  services: {},
};

export interface UsageEvent {
  at: string;
  kind: 'outcome' | 'feedback';
  site: string;
  task: TaskType;
  suggested: string;
  selected?: string;
  followed?: boolean;
  vote?: 'up' | 'down';
}

export interface Registration { pattern: string; adapter: 'generic' | 'openwebui' }

/** Model ids seen in a service's open picker: they are available on the user's plan whatever the catalog says. */
export interface Observed { models: string[]; at: string }
export type ObservedMap = Record<string, Observed>;
