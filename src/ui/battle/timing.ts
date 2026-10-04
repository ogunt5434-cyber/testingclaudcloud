// Playback pacing: how long to wait after an event before showing the next one (at speed ×1).
import type { BattleEvent } from '../../core/types';

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/**
 * Base pause after each event kind, in ms at ×1. Tuned so an early campaign fight (stage 1-1, ~5 rounds)
 * plays in under half a minute at ×1; ×2 / ×4 divide everything.
 */
function baseDelay(ev: BattleEvent): number {
  switch (ev.t) {
    case 'roundStart':
      return 520;
    case 'action':
      return ev.kind === 'skill' ? 480 : 170;
    case 'damage':
      return ev.kind === 'dot' ? 190 : ev.kind === 'passive' ? 110 : 80;
    case 'dodge':
      return 80;
    case 'heal':
      return ev.source ? 80 : 110;
    case 'status':
      return ev.on ? 60 : 0;
    case 'buff':
      return 40;
    case 'buffEnd':
    case 'energy':
      return 0;
    case 'passive':
      return 280;
    case 'skip':
      return 360;
    case 'death':
      return 300;
    case 'battleEnd':
      return 0;
  }
}

/** Extra beat (ms at ×1) before a new turn starts so the previous numbers can be read. */
const TURN_GAP_MS = 150;

/** True when `next` starts a new turn (or round / the end). */
function isTurnBoundary(next: BattleEvent | undefined): boolean {
  return !!next && (next.t === 'action' || next.t === 'skip' || next.t === 'roundStart' || next.t === 'battleEnd');
}

export function delayAfter(ev: BattleEvent, next: BattleEvent | undefined): number {
  const gap = isTurnBoundary(next) && ev.t !== 'roundStart' ? TURN_GAP_MS : 0;
  return baseDelay(ev) + gap;
}

/** Estimated playback length in ms at ×1 (for tests / tuning). */
export function totalDuration(events: readonly BattleEvent[]): number {
  return events.reduce((sum, ev, i) => sum + delayAfter(ev, events[i + 1]), 0);
}
