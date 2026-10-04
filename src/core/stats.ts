// Stat computation. CONTRACT STUB — to be implemented.
import type { BattleUnitSetup, HeroDef, HeroInstance, Stats } from './types';

export function emptyStats(): Stats {
  return { hp: 0, atk: 0, armor: 0, spd: 0, crit: 0, critDmg: 0, hit: 0, dodge: 0, skillDmg: 0, dmgReduce: 0, controlImmune: 0, armorBreak: 0 };
}

/** base * (1 + LEVEL_GROWTH*(level-1)) * STAR_MULT[stars] for hp/atk/armor; spd = base.spd + SPD_PER_STAR*(stars-1); plus innate. */
export function heroBaseStats(_def: HeroDef, _level: number, _stars: number): Stats {
  throw new Error('not implemented');
}
/** Sum of flat equipment bonuses. */
export function equipmentStats(_equipment: HeroInstance['equipment']): Partial<Stats> {
  throw new Error('not implemented');
}
/** Base + equipment. Passive stats are NOT included (the battle engine applies them). */
export function heroStats(_hero: HeroInstance): Stats {
  throw new Error('not implemented');
}
/** Single "power" number for display & matchmaking. */
export function statsPower(_stats: Stats): number {
  throw new Error('not implemented');
}
export function heroPower(_hero: HeroInstance): number {
  throw new Error('not implemented');
}
export function toBattleUnit(_hero: HeroInstance): BattleUnitSetup {
  throw new Error('not implemented');
}
