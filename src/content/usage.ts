import { send } from '../shared/messages';
import type { UsageEvent } from '../shared/types';

export function record(e: Omit<UsageEvent, 'at'>): void {
  send({ type: 'usage', event: { ...e, at: new Date().toISOString() } }).catch(() => { /* background asleep or unavailable */ });
}
