// Campaign stages & idle rewards. CONTRACT STUB — to be implemented.
import type { BattleUnitSetup, GameState, Rewards } from './types';

export const STAGES_PER_CHAPTER = 10;
/** e.g. stage 23 -> "3-3" */
export function stageLabel(_stage: number): string { throw new Error('not implemented'); }
/** Deterministic enemy team for a stage (6 slots, may contain nulls in early stages). */
export function campaignEnemies(_stage: number): (BattleUnitSetup | null)[] { throw new Error('not implemented'); }
export function stagePower(_stage: number): number { throw new Error('not implemented'); }
export function stageFirstClearRewards(_stage: number): Rewards { throw new Error('not implemented'); }
/** Idle income per hour given the highest cleared stage. */
export function idleRatePerHour(_cleared: number): Rewards { throw new Error('not implemented'); }
/** Rewards accumulated between state.campaign.idleSince and now (capped at IDLE_CAP_HOURS). Deterministic. */
export function computeIdleRewards(_state: GameState, _now: number): Rewards { throw new Error('not implemented'); }
/** Adds computeIdleRewards to state and resets idleSince = now. */
export function claimIdleRewards(_state: GameState, _now: number): Rewards { throw new Error('not implemented'); }
