import { sameOption } from '../catalog/aliases';
import type { Classification, Ranked, Suggestion } from '../shared/types';

export const TIE = 0.02;
export const HYSTERESIS = 0.03;
export const CROSS_TOTAL_GAIN = 0.15;
export const CROSS_FIT_GAIN = 0.10;
export const CROSS_COST_RATIO = 0.4;
export const CROSS_FIT_LOSS = 0.05;

function usdOf(r: Ranked): number | undefined {
  return r.cost.kind === 'api' ? r.cost.usd : r.cost.kind === 'included' ? r.cost.apiUsd : undefined;
}

export interface DecideInput {
  here: Ranked[];
  elsewhere: Ranked[];
  current?: string;
  previous?: Suggestion;
  classification: Classification;
  trustedServices: Set<string>;
  crossService: boolean;
}

let counter = 0;

export function decide(input: DecideInput): Suggestion | undefined {
  const { here, elsewhere, current, previous, classification } = input;
  if (!here.length) return undefined;

  // Tie set: within TIE of the top. Prefer the current model, then cheaper, then fitter.
  const top = here[0]!.total;
  const ties = here.filter(r => top - r.total <= TIE);
  let winner = ties.find(r => sameOption(current, r.key)) ?? ties.slice().sort((a, b) => {
    const ca = usdOf(a) ?? Infinity, cb = usdOf(b) ?? Infinity;
    if (ca !== cb) return ca - cb;
    return b.fit - a.fit;
  })[0]!;

  // Hysteresis: keep the previous winner unless beaten clearly or gone.
  if (previous && previous.here.key !== winner.key) {
    const prev = here.find(r => r.key === previous.here.key);
    if (prev && winner.total - prev.total < HYSTERESIS) winner = prev;
  }

  let other: Ranked | undefined;
  if (input.crossService && elsewhere.length) {
    const sensitive = classification.sensitive.length > 0;
    const e = elsewhere.find(r => !sensitive || input.trustedServices.has(r.serviceId));
    if (e) {
      const eu = usdOf(e), hu = usdOf(winner);
      const better =
        e.total - winner.total >= CROSS_TOTAL_GAIN ||
        (e.fit - winner.fit >= CROSS_FIT_GAIN && e.costScore >= winner.costScore) ||
        (eu !== undefined && hu !== undefined && hu > 0 && eu <= CROSS_COST_RATIO * hu && winner.fit - e.fit <= CROSS_FIT_LOSS);
      if (better) {
        e.reasons.push(e.total - winner.total >= CROSS_TOTAL_GAIN ? 'clearly better value overall'
          : e.fit - winner.fit >= CROSS_FIT_GAIN ? 'noticeably better fit at no extra cost'
          : 'much cheaper for about the same fit');
        other = e;
      }
    }
  }

  return {
    id: `s${Date.now().toString(36)}${(counter++).toString(36)}`,
    here: winner, elsewhere: other,
    // "Good pick" only when the exact option is selected; a picker that hides the effort level gets a suggestion.
    isCurrent: current !== undefined && current === winner.key,
    current, classification, ranked: here,
  };
}
