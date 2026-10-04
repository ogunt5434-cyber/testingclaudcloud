// Playback pacing: how long to wait after an event before showing the next one (at speed ×1).
import type { BattleEvent } from '../../core/types';

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** Base pause after each event kind, in ms at ×1. */
function baseDelay(ev: BattleEvent): number {
  switch (ev.t) {
    case 'roundStart':
      return 700;
    case 'action':
      return ev.kind === 'skill' ? 800 : 260;
    case 'damage':
      return ev.kind === 'dot' ? 280 : ev.kind === 'passive' ? 160 : 110;
    case 'dodge':
      return 110;
    case 'heal':
      return ev.source ? 110 : 160;
    case 'status':
      return ev.on ? 90 : 0;
    case 'buff':
      return 60;
    case 'energy':
      return 0;
    case 'passive':
      return 420;
    case 'skip':
      return 560;
    case 'death':
      return 420;
    case 'battleEnd':
      return 0;
  }
}

/** Extra beat before a new turn starts so the previous numbers can be read. */
function isTurnBoundary(next: BattleEvent | undefined): boolean {
  return !!next && (next.t === 'action' || next.t === 'skip' || next.t === 'roundStart' || next.t === 'battleEnd');
}

export function delayAfter(ev: BattleEvent, next: BattleEvent | undefined): number {
  const gap = isTurnBoundary(next) && ev.t !== 'roundStart' ? 330 : 0;
  return baseDelay(ev) + gap;
}

/** Estimated playback length in ms at ×1 (for tests / tuning). */
export function totalDuration(events: readonly BattleEvent[]): number {
  return events.reduce((sum, ev, i) => sum + delayAfter(ev, events[i + 1]), 0);
}
