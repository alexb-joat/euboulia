// Simple local learning from the usage ring buffer: when you keep overriding
// the suggestion with the same model for a given site and task, nudge that
// model up a little; when you keep giving the suggested model a thumbs-down,
// nudge it down. Pure function, no prompt text involved.
import type { TaskType, UsageEvent } from '../shared/types';
import { TASK_LABELS } from '../shared/types';

export interface Bias { modelId: string; boost: number; reason: string }

export const LEARN_MIN = 3;        // events before a habit counts
export const LEARN_SHARE = 0.6;    // share of sends that went to the same model
export const LEARN_BOOST = 0.05;
export const LEARN_WINDOW = 300;   // most recent events considered

export function learnBiases(
  events: UsageEvent[], site: string, task: TaskType, labelOf: (modelId: string) => string = id => id,
): Bias[] {
  const recent = events.slice(-LEARN_WINDOW).filter(e => e.site === site && e.task === task);
  const out: Bias[] = [];

  // Habit: the model you actually send with, when it differs from what we suggested.
  const sends = recent.filter(e => e.kind === 'outcome' && e.selected);
  if (sends.length >= LEARN_MIN) {
    const counts = new Map<string, number>();
    for (const e of sends) counts.set(e.selected!, (counts.get(e.selected!) ?? 0) + 1);
    const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const overrides = sends.filter(e => e.selected === top && e.suggested !== top).length;
    if (n / sends.length >= LEARN_SHARE && overrides >= LEARN_MIN) {
      out.push({ modelId: top, boost: LEARN_BOOST, reason: `you usually pick ${labelOf(top)} for ${TASK_LABELS[task]} here` });
    }
  }

  // Votes: net thumbs per suggested model.
  const votes = new Map<string, number>();
  for (const e of recent) if (e.kind === 'feedback' && e.vote) votes.set(e.suggested, (votes.get(e.suggested) ?? 0) + (e.vote === 'up' ? 1 : -1));
  for (const [id, net] of votes) {
    if (net <= -LEARN_MIN && !out.some(b => b.modelId === id)) {
      out.push({ modelId: id, boost: -LEARN_BOOST, reason: `you gave ${labelOf(id)} a thumbs-down for ${TASK_LABELS[task]}` });
    }
  }
  return out;
}
