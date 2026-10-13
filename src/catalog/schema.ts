import type { Catalog, CatalogModel, CatalogService, TaskType } from '../shared/types';
import { TASK_TYPES } from '../shared/types';

const MAX_SELECTOR = 200;

function fail(msg: string): never { throw new Error(`catalog: ${msg}`); }

function isObj(x: unknown): x is Record<string, unknown> { return !!x && typeof x === 'object' && !Array.isArray(x); }

export function selectorOk(sel: string): boolean {
  if (typeof sel !== 'string' || !sel || sel.length > MAX_SELECTOR) return false;
  if (typeof document !== 'undefined') {
    try { document.createDocumentFragment().querySelector(sel); return true; } catch { return false; }
  }
  // No DOM (validation script, unit tests): a structural sanity check.
  const count = (c: string) => sel.split(c).length - 1;
  return count('[') === count(']') && count('(') === count(')') && count('"') % 2 === 0 && count("'") % 2 === 0 && !/[\[(]\s*$/.test(sel);
}

function checkModel(id: string, m: unknown): asserts m is CatalogModel {
  if (!isObj(m)) fail(`models.${id} must be an object`);
  if (typeof m.provider !== 'string' || !m.provider) fail(`models.${id}.provider missing`);
  if (typeof m.name !== 'string' || !m.name) fail(`models.${id}.name missing`);
  if (!isObj(m.strengths)) fail(`models.${id}.strengths missing`);
  for (const [t, v] of Object.entries(m.strengths)) {
    if (!TASK_TYPES.includes(t as TaskType)) fail(`models.${id}.strengths.${t} is not a task type`);
    if (typeof v !== 'number' || v < 0 || v > 1) fail(`models.${id}.strengths.${t} must be 0..1`);
  }
  if (m.price !== undefined) {
    if (!isObj(m.price) || typeof m.price.input !== 'number' || typeof m.price.output !== 'number'
      || m.price.input < 0 || m.price.output < 0) fail(`models.${id}.price must be {input, output} >= 0`);
  }
  if (typeof m.context !== 'number' || m.context <= 0) fail(`models.${id}.context must be a positive number`);
  if (!Array.isArray(m.capabilities) || !m.capabilities.every(c => typeof c === 'string')) fail(`models.${id}.capabilities must be a string list`);
  if (m.sources !== undefined) {
    if (!Array.isArray(m.sources)) fail(`models.${id}.sources must be a list`);
    for (const s of m.sources) {
      if (!isObj(s) || typeof s.url !== 'string' || typeof s.date !== 'string') fail(`models.${id}.sources entries need url and date`);
    }
  }
}

function checkService(id: string, s: unknown, models: Record<string, unknown>): asserts s is CatalogService {
  if (!isObj(s)) fail(`services.${id} must be an object`);
  if (typeof s.name !== 'string' || !s.name) fail(`services.${id}.name missing`);
  if (!Array.isArray(s.hosts) || !s.hosts.length || !s.hosts.every(h => typeof h === 'string')) fail(`services.${id}.hosts must be a non-empty string list`);
  if (s.selectors !== undefined) {
    if (!isObj(s.selectors)) fail(`services.${id}.selectors must be an object`);
    for (const [k, list] of Object.entries(s.selectors)) {
      if (!Array.isArray(list)) fail(`services.${id}.selectors.${k} must be a list`);
      for (const sel of list) if (!selectorOk(sel as string)) fail(`services.${id}.selectors.${k}: bad selector ${JSON.stringify(sel)}`);
    }
  }
  if (s.plans !== undefined) {
    if (!isObj(s.plans)) fail(`services.${id}.plans must be an object`);
    for (const [p, v] of Object.entries(s.plans)) {
      if (!isObj(v) || typeof v.price !== 'number' || v.price < 0) fail(`services.${id}.plans.${p}.price must be >= 0`);
    }
  }
  if (!Array.isArray(s.models)) fail(`services.${id}.models must be a list`);
  for (const m of s.models) {
    if (!isObj(m) || typeof m.modelId !== 'string' || typeof m.label !== 'string') fail(`services.${id}.models entries need modelId and label`);
    if (!(m.modelId in models)) fail(`services.${id}: model ${m.modelId} not in models`);
    if (m.plans !== undefined) {
      if (!Array.isArray(m.plans)) fail(`services.${id}.models.${m.modelId}.plans must be a list`);
      for (const p of m.plans) if (!isObj(s.plans) || !(String(p) in s.plans)) fail(`services.${id}.models.${m.modelId}: unknown plan ${p}`);
    }
    if (m.capWeight !== undefined && (typeof m.capWeight !== 'number' || m.capWeight < 0)) fail(`services.${id}.models.${m.modelId}.capWeight must be >= 0`);
  }
}

export function validateCatalog(x: unknown): Catalog {
  if (!isObj(x)) fail('must be an object');
  if (x.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (typeof x.generatedAt !== 'string') fail('generatedAt missing');
  if (!isObj(x.models) || !Object.keys(x.models).length) fail('models missing');
  if (!isObj(x.services) || !Object.keys(x.services).length) fail('services missing');
  for (const [id, m] of Object.entries(x.models)) checkModel(id, m);
  for (const [id, s] of Object.entries(x.services)) checkService(id, s, x.models);
  return x as unknown as Catalog;
}
