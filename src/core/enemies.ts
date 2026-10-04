// Deterministic enemy teams for PvE modes (campaign, tower), built from real hero defs.
// A team's difficulty is a single "strength" = the hp/atk/armor multiplier a player hero gets from
// level & stars (see growthMultiplier). It is converted back into a plausible (stars, level) pair so
// enemies are exactly as strong as a player hero of that level & star count.
import { LEVEL_CAP, LEVEL_GROWTH, MAX_STARS, STAR_MULT, TEAM_SIZE } from './constants';
import { Rng } from './rng';
import { growthMultiplier, heroBaseStats } from './stats';
import { HEROES } from '../data/heroes';
import type { BattleUnitSetup, HeroDef } from './types';

const MIN_ENEMY_STARS = 2;

/** Lowest star count whose level cap can reach `strength`, and the level that matches it. */
export function enemyRank(strength: number): { stars: number; level: number } {
  let stars = MIN_ENEMY_STARS;
  while (stars < MAX_STARS && growthMultiplier(LEVEL_CAP[stars], stars) < strength) stars++;
  const level = Math.max(1, Math.round((strength / STAR_MULT[stars] - 1) / LEVEL_GROWTH + 1));
  return { stars, level };
}

function byBaseHpDesc(a: HeroDef, b: HeroDef): number {
  return b.base.hp - a.base.hp;
}

/** Picks distinct heroes: warriors (then the tankiest) for the front, random others for the back. */
function pickTeamDefs(rng: Rng, pool: HeroDef[], count: number): { front: HeroDef[]; back: HeroDef[] } {
  const shuffled = rng.shuffle(pool);
  const frontCount = count >= 4 ? 2 : 1;
  const warriors = shuffled.filter((h) => h.heroClass === 'warrior');
  const others = shuffled.filter((h) => h.heroClass !== 'warrior').sort(byBaseHpDesc);
  const front = [...warriors, ...others].slice(0, frontCount);
  const back = shuffled.filter((h) => !front.includes(h)).slice(0, count - frontCount);
  return { front, back };
}

function enemyUnit(def: HeroDef, stars: number, level: number): BattleUnitSetup {
  return { heroId: def.id, level, stars, stats: heroBaseStats(def, level, stars) };
}

/**
 * 6 slots: front row 0-1, back row 2-5; unused slots are null.
 * `count` enemies (1..6) of the given strength, chosen deterministically from `seed`.
 */
export function buildEnemyTeam(seed: number, strength: number, count: number): (BattleUnitSetup | null)[] {
  const n = Math.min(TEAM_SIZE, Math.max(1, Math.floor(count)));
  const { stars, level } = enemyRank(strength);
  const pool = HEROES.filter((h) => h.rarity <= stars);
  const { front, back } = pickTeamDefs(new Rng(seed), pool, n);
  const slots: (BattleUnitSetup | null)[] = Array.from({ length: TEAM_SIZE }, () => null);
  front.forEach((def, i) => (slots[i] = enemyUnit(def, stars, level)));
  back.forEach((def, i) => (slots[2 + i] = enemyUnit(def, stars, level)));
  return slots;
}
