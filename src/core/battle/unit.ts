// Battle unit model: building units from a setup, effective stats with buffs, snapshots.
import { BACK_ROW, ENERGY_START, FRONT_ROW } from '../constants';
import { getHeroDef } from '../../data/heroes';
import type {
  BattleUnitSetup,
  ControlStatus,
  DotStatus,
  HeroDef,
  Side,
  StatKey,
  Stats,
  StatusKind,
  UnitBattleStats,
  UnitRef,
  UnitSnapshot,
} from '../types';
import { PERCENT_STATS } from '../types';

export interface ActiveBuff {
  stat: StatKey;
  amount: number;
  /** Round-end ticks left. */
  remaining: number;
  /** Applied during the current round-end phase: skips this round's decrement. */
  fresh: boolean;
}

export interface ActiveDot {
  status: DotStatus;
  /** Round-end ticks left. */
  remaining: number;
  /** Damage per tick, fixed at application time. */
  perTick: number;
  caster: BattleUnit;
  fresh: boolean;
}

export interface BattleUnit {
  ref: UnitRef;
  def: HeroDef;
  level: number;
  stars: number;
  /** Setup stats with passive stats applied (before buffs). */
  base: Stats;
  maxHp: number;
  hp: number;
  energy: number;
  /** Control status -> remaining own turns. */
  controls: Map<ControlStatus, number>;
  dots: ActiveDot[];
  buffs: ActiveBuff[];
  record: UnitBattleStats;
}

const STAT_KEYS: readonly StatKey[] = [
  'hp', 'atk', 'armor', 'spd', 'crit', 'critDmg', 'hit', 'dodge', 'skillDmg', 'dmgReduce', 'controlImmune', 'armorBreak',
];

/** Sane ranges for effective stats. Negative hit / dmgReduce act as debuffs (miss more / take more damage). */
const STAT_LIMITS: Record<StatKey, readonly [number, number]> = {
  hp: [1, Infinity],
  atk: [0, Infinity],
  armor: [0, Infinity],
  spd: [0, Infinity],
  crit: [0, 1],
  critDmg: [0, 5],
  hit: [-1, 1],
  dodge: [0, 1],
  skillDmg: [-0.9, 5],
  dmgReduce: [-1, 1],
  controlImmune: [0, 1],
  armorBreak: [0, 1],
};

export const HARD_CONTROLS: readonly ControlStatus[] = ['stun', 'freeze', 'petrify'];

function finite(v: number | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function clampStat(key: StatKey, value: number): number {
  const [lo, hi] = STAT_LIMITS[key];
  return Math.min(hi, Math.max(lo, value));
}

export function isPercentStat(key: StatKey): boolean {
  return PERCENT_STATS.includes(key);
}

/** Setup stats + passive stats (percent of setup value for hp/atk/armor, additive otherwise). */
export function applyPassiveStats(setupStats: Stats, def: HeroDef): Stats {
  const pctSum: Partial<Record<StatKey, number>> = {};
  const addSum: Partial<Record<StatKey, number>> = {};
  for (const passive of def.passives) {
    for (const key of STAT_KEYS) {
      const v = finite(passive.stats?.[key]);
      if (v === 0) continue;
      const bucket = isPercentStat(key) ? pctSum : addSum;
      bucket[key] = (bucket[key] ?? 0) + v;
    }
  }
  const out = {} as Stats;
  for (const key of STAT_KEYS) {
    const raw = finite(setupStats[key]);
    out[key] = isPercentStat(key) ? raw * (1 + (pctSum[key] ?? 0)) : raw + (addSum[key] ?? 0);
  }
  return out;
}

export function buildUnit(setup: BattleUnitSetup, side: Side, pos: number): BattleUnit {
  const def = getHeroDef(setup.heroId);
  const base = applyPassiveStats(setup.stats, def);
  const maxHp = Math.max(1, Math.round(base.hp));
  const ref = { side, pos };
  return {
    ref,
    def,
    level: Math.max(1, finite(setup.level)),
    stars: finite(setup.stars),
    base,
    maxHp,
    hp: maxHp,
    energy: ENERGY_START,
    controls: new Map(),
    dots: [],
    buffs: [],
    record: { ref: { ...ref }, damageDealt: 0, damageTaken: 0, healingDone: 0 },
  };
}

/** Current stat including active buffs, clamped to its sane range. */
export function stat(unit: BattleUnit, key: StatKey): number {
  if (key === 'hp') return unit.maxHp;
  let sum = 0;
  for (const buff of unit.buffs) if (buff.stat === key) sum += buff.amount;
  const base = unit.base[key];
  return clampStat(key, isPercentStat(key) ? base * (1 + sum) : base + sum);
}

export function isAlive(unit: BattleUnit): boolean {
  return unit.hp > 0;
}

export function isFront(unit: BattleUnit): boolean {
  return FRONT_ROW.includes(unit.ref.pos);
}

export function isBack(unit: BattleUnit): boolean {
  return BACK_ROW.includes(unit.ref.pos);
}

export function hpFraction(unit: BattleUnit): number {
  return unit.hp / unit.maxHp;
}

const CONTROL_STATUSES: readonly StatusKind[] = ['stun', 'freeze', 'petrify', 'silence'];

export function isControlStatus(status: StatusKind): status is ControlStatus {
  return CONTROL_STATUSES.includes(status);
}

export function hasStatus(unit: BattleUnit, status: StatusKind): boolean {
  return isControlStatus(status) ? unit.controls.has(status) : unit.dots.some((d) => d.status === status);
}

/** The hard control (stun > freeze > petrify) that makes the unit skip its turn, if any. */
export function activeHardControl(unit: BattleUnit): ControlStatus | null {
  return HARD_CONTROLS.find((c) => unit.controls.has(c)) ?? null;
}

export function snapshot(unit: BattleUnit): UnitSnapshot {
  return {
    ref: { ...unit.ref },
    heroId: unit.def.id,
    level: unit.level,
    stars: unit.stars,
    maxHp: unit.maxHp,
    hp: unit.hp,
    energy: unit.energy,
  };
}

export function sameRef(a: UnitRef, b: UnitRef): boolean {
  return a.side === b.side && a.pos === b.pos;
}
