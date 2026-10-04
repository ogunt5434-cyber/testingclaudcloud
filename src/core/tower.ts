// Tower mode (SPEC §5): always a full enemy team, a steeper curve than the campaign, gem rewards and a
// scroll bonus every 5th floor.
import { TEAM_SIZE } from './constants';
import { strengthCurve } from './campaign';
import { buildEnemyTeam } from './enemies';
import { hashSeed } from './rng';
import { teamPowerOf } from './stats';
import type { BattleUnitSetup, Resources, Rewards } from './types';

// ---------------------------------------------------------------------------
// Tuning (validated by tests/balance.test.ts)
// ---------------------------------------------------------------------------

/** Floor F fights like campaign stage TOWER_STAGE_OFFSET + TOWER_STAGE_RATE * F, times TOWER_MULT. */
const TOWER_STAGE_OFFSET = 1;
const TOWER_STAGE_RATE = 1.5;
const TOWER_MULT = 1.1;
export const TOWER_BONUS_EVERY = 5;

function normFloor(floor: number): number {
  return Math.max(1, Math.floor(Number.isFinite(floor) ? floor : 1));
}

export function isTowerBonusFloor(floor: number): boolean {
  return normFloor(floor) % TOWER_BONUS_EVERY === 0;
}

/** Enemy strength multiplier of a floor (always above the campaign stage with the same number). */
export function towerStrength(floor: number): number {
  return strengthCurve(TOWER_STAGE_OFFSET + TOWER_STAGE_RATE * normFloor(floor)) * TOWER_MULT;
}

export function towerEnemies(floor: number): (BattleUnitSetup | null)[] {
  const f = normFloor(floor);
  return buildEnemyTeam(hashSeed('tower', f), towerStrength(f), TEAM_SIZE);
}

export function towerPower(floor: number): number {
  return teamPowerOf(towerEnemies(floor));
}

export function towerRewards(floor: number): Rewards {
  const f = normFloor(floor);
  const resources: Partial<Resources> = {
    gold: 1500 + 400 * f,
    spirit: 900 + 240 * f,
    gems: 30 + 3 * f,
  };
  if (isTowerBonusFloor(f)) {
    resources.gems! += 100;
    resources.heroicScroll = 1;
    resources.basicScroll = 2;
  }
  return { resources, playerExp: 40 + 6 * f };
}
