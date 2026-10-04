// Stat computation (SPEC §2): hero stats from level/stars/innate, flat equipment bonuses and a display "power".
import { LEVEL_GROWTH, MAX_STARS, SPD_PER_STAR, STAR_MULT } from './constants';
import { applyPassiveStats } from './battle/unit';
import { getEquipDef, isEquipId } from '../data/equipment';
import { getHeroDef } from '../data/heroes';
import type { BattleUnitSetup, HeroDef, HeroInstance, StatKey, Stats } from './types';

export const STAT_KEYS: readonly StatKey[] = [
  'hp', 'atk', 'armor', 'spd', 'crit', 'critDmg', 'hit', 'dodge', 'skillDmg', 'dmgReduce', 'controlImmune', 'armorBreak',
];

export function emptyStats(): Stats {
  return { hp: 0, atk: 0, armor: 0, spd: 0, crit: 0, critDmg: 0, hit: 0, dodge: 0, skillDmg: 0, dmgReduce: 0, controlImmune: 0, armorBreak: 0 };
}

/** Adds every defined key of `bonus` to `target` (mutates and returns `target`). */
export function addStats(target: Stats, bonus: Partial<Stats>): Stats {
  for (const key of STAT_KEYS) target[key] += bonus[key] ?? 0;
  return target;
}

function clampStars(stars: number): number {
  return Math.min(MAX_STARS, Math.max(1, Math.floor(stars)));
}

/** Multiplier applied to base hp/atk/armor at a level & star count. */
export function growthMultiplier(level: number, stars: number): number {
  return (1 + LEVEL_GROWTH * (Math.max(1, level) - 1)) * STAR_MULT[clampStars(stars)];
}

/** base * (1 + LEVEL_GROWTH*(level-1)) * STAR_MULT[stars] for hp/atk/armor; spd = base.spd + SPD_PER_STAR*(stars-1); plus innate. */
export function heroBaseStats(def: HeroDef, level: number, stars: number): Stats {
  const mult = growthMultiplier(level, stars);
  const stats = emptyStats();
  stats.hp = Math.round(def.base.hp * mult);
  stats.atk = Math.round(def.base.atk * mult);
  stats.armor = Math.round(def.base.armor * mult);
  stats.spd = def.base.spd + SPD_PER_STAR * (clampStars(stars) - 1);
  return addStats(stats, def.innate ?? {});
}

/** Sum of flat equipment bonuses. Unknown ids are ignored. */
export function equipmentStats(equipment: HeroInstance['equipment']): Partial<Stats> {
  const total = emptyStats();
  for (const id of Object.values(equipment)) {
    if (id && isEquipId(id)) addStats(total, getEquipDef(id).stats);
  }
  const out: Partial<Stats> = {};
  for (const key of STAT_KEYS) if (total[key] !== 0) out[key] = total[key];
  return out;
}

/** Base + equipment. Passive stats are NOT included (the battle engine applies them). */
export function heroStats(hero: HeroInstance): Stats {
  const stats = heroBaseStats(getHeroDef(hero.heroId), hero.level, hero.stars);
  return addStats(stats, equipmentStats(hero.equipment));
}

/** Single "power" number for display & matchmaking (monotonic in every stat). */
export function statsPower(stats: Stats): number {
  const fractions =
    stats.crit + stats.dodge + stats.hit + stats.skillDmg + stats.dmgReduce + stats.armorBreak + stats.controlImmune;
  return Math.round(stats.hp * 0.1 + stats.atk + stats.armor * 0.6 + stats.spd * 2 + 1000 * fractions + 500 * stats.critDmg);
}

/** Power of a battle unit including its passive stat bonuses (what it really fights with). */
export function unitPower(unit: BattleUnitSetup): number {
  return statsPower(applyPassiveStats(unit.stats, getHeroDef(unit.heroId)));
}

export function heroPower(hero: HeroInstance): number {
  return unitPower(toBattleUnit(hero));
}

/** Sum of unit powers of a team (null slots count 0). */
export function teamPowerOf(units: readonly (BattleUnitSetup | null)[]): number {
  return units.reduce((sum, u) => sum + (u ? unitPower(u) : 0), 0);
}

export function toBattleUnit(hero: HeroInstance): BattleUnitSetup {
  return { heroId: hero.heroId, level: hero.level, stars: hero.stars, stats: heroStats(hero) };
}
