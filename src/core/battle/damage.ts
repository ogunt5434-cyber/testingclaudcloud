// Damage formula (SPEC §3 "Damage"). Pure functions of the two units plus rng rolls.
import {
  ARMOR_CAP,
  ARMOR_K_BASE,
  ARMOR_K_PER_LEVEL,
  CRIT_BASE_MULT,
  DAMAGE_VARIANCE,
  DMG_REDUCE_CAP,
  FACTION_DMG_BONUS,
  FACTION_HIT_BONUS,
  hasFactionAdvantage,
} from '../constants';
import type { Rng } from '../rng';
import type { StatusKind } from '../types';
import { hasStatus, stat, type BattleUnit } from './unit';

export const MAX_DODGE_CHANCE = 0.75;

export interface HitOptions {
  multiplier: number;
  /** Active skill damage (applies the attacker's skillDmg). */
  isSkill: boolean;
  ignoreArmor?: number;
  bonusVsStatus?: { status: StatusKind; multiplier: number };
}

export type HitRoll = { dodged: true } | { dodged: false; amount: number; crit: boolean };

export function dodgeChance(targetDodge: number, attackerHit: number, advantage: boolean): number {
  const chance = targetDodge - attackerHit - (advantage ? FACTION_HIT_BONUS : 0);
  return Math.min(MAX_DODGE_CHANCE, Math.max(0, chance));
}

/** Fraction of damage removed by armor. `penetration` = attacker armorBreak + effect ignoreArmor. */
export function armorReduction(armor: number, penetration: number, attackerLevel: number): number {
  const effArmor = armor * Math.max(0, 1 - penetration);
  if (effArmor <= 0) return 0;
  return Math.min(ARMOR_CAP, effArmor / (effArmor + ARMOR_K_BASE + ARMOR_K_PER_LEVEL * attackerLevel));
}

function varianceFactor(rng: Rng): number {
  return 1 - DAMAGE_VARIANCE + 2 * DAMAGE_VARIANCE * rng.next();
}

/** Rolls dodge, crit and variance (in that order) and returns the final damage before HP clamping. */
export function rollHit(rng: Rng, attacker: BattleUnit, target: BattleUnit, opts: HitOptions): HitRoll {
  const advantage = hasFactionAdvantage(attacker.def.faction, target.def.faction);
  if (rng.chance(dodgeChance(stat(target, 'dodge'), stat(attacker, 'hit'), advantage))) return { dodged: true };

  let raw = stat(attacker, 'atk') * opts.multiplier;
  if (opts.bonusVsStatus && hasStatus(target, opts.bonusVsStatus.status)) raw *= opts.bonusVsStatus.multiplier;
  if (opts.isSkill) raw *= 1 + stat(attacker, 'skillDmg');
  const crit = rng.chance(stat(attacker, 'crit'));
  if (crit) raw *= CRIT_BASE_MULT + stat(attacker, 'critDmg');

  const penetration = stat(attacker, 'armorBreak') + (opts.ignoreArmor ?? 0);
  const reduction = armorReduction(stat(target, 'armor'), penetration, attacker.level);
  const factionMult = advantage ? 1 + FACTION_DMG_BONUS : 1;
  const reduceMult = 1 - Math.min(DMG_REDUCE_CAP, stat(target, 'dmgReduce'));
  const dmg = raw * (1 - reduction) * factionMult * reduceMult * varianceFactor(rng);
  return { dodged: false, amount: Math.max(1, Math.round(dmg)), crit };
}
