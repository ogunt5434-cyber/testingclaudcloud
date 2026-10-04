// Playback pacing: how long to wait after an event before showing the next one (at speed ×1),
// plus the choreography beats the side-view battle is built around (all in ms at ×1; ×2 / ×4 divide).
import type { BattleEvent } from '../../core/types';

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/**
 * Basic attack: time from the `action` event to the moment the hit lands (the following `damage` event).
 * Melee heroes dash in and strike exactly then; ranged heroes release a projectile that arrives then.
 */
export const IMPACT_BASIC_MS = 330;
/** Active skill: cast pose, name ribbon and screen dim, then the big effect lands after this long. */
export const IMPACT_SKILL_MS = 620;
/** Melee dash: time to reach the target, and time to run back after the strike. */
export const DASH_OUT_MS = 210;
export const DASH_BACK_MS = 220;
/** How long the striker stays next to its target after the impact before running back. */
export const DASH_HOLD_MS = 110;
/** Floating numbers stay readable this long. */
export const FLOAT_MS = 1050;
/** Entrance: both teams run in before round 1 starts. */
export const ENTRANCE_MS = 760;

/**
 * Base pause after each event kind, in ms at ×1. Tuned so an early campaign fight (stage 1-1, ~5 rounds)
 * plays in under half a minute at ×1; ×2 / ×4 divide everything.
 */
function baseDelay(ev: BattleEvent): number {
  switch (ev.t) {
    case 'roundStart':
      return 560;
    case 'action':
      return ev.kind === 'skill' ? IMPACT_SKILL_MS : IMPACT_BASIC_MS;
    case 'damage':
      // Several hits of one skill land almost together (an AoE reads as one blow); DoT ticks are separate beats.
      return ev.kind === 'dot' ? 170 : ev.kind === 'passive' ? 110 : ev.kind === 'skill' ? 55 : 70;
    case 'dodge':
      return 70;
    case 'heal':
      return ev.source ? 60 : 110;
    case 'status':
      return ev.on ? 50 : 0;
    case 'buff':
      return 30;
    case 'buffEnd':
    case 'energy':
      return 0;
    case 'passive':
      return 220;
    case 'skip':
      return 380;
    case 'death':
      return 380;
    case 'battleEnd':
      return 0;
  }
}

/** Extra beat (ms at ×1) before a new turn starts: the striker runs back while the numbers are read. */
export const TURN_GAP_MS = 140;

/** True when `next` starts a new turn (or round / the end). */
export function isTurnBoundary(next: BattleEvent | undefined): boolean {
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
