// Shared type contracts for the whole game. Every module codes against these.
// Keep this file free of runtime logic (only types and tiny literal tables).

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------

export type Faction = 'shadow' | 'fortress' | 'abyss' | 'forest' | 'dark' | 'light';
export type HeroClass = 'warrior' | 'mage' | 'ranger' | 'assassin' | 'priest';

/**
 * Combat stats.
 * - hp, atk, armor, spd: flat values.
 * - crit, critDmg, hit, dodge, skillDmg, dmgReduce, controlImmune, armorBreak: fractions (0.15 = 15%).
 *   critDmg is the BONUS on top of the base 1.5x crit multiplier.
 *   armorBreak ignores that fraction of the target's armor.
 */
export interface Stats {
  hp: number;
  atk: number;
  armor: number;
  spd: number;
  crit: number;
  critDmg: number;
  hit: number;
  dodge: number;
  skillDmg: number;
  dmgReduce: number;
  controlImmune: number;
  armorBreak: number;
}
export type StatKey = keyof Stats;

/** Stats that passives/buffs modify as a PERCENTAGE of base (0.2 = +20%). All other keys are additive. */
export const PERCENT_STATS: readonly StatKey[] = ['hp', 'atk', 'armor'];

export type TargetSelector =
  | 'self'
  | 'defaultEnemy' // a random alive FRONT enemy; if none alive, a random alive back enemy
  | 'randomEnemies' // `count` distinct random alive enemies
  | 'allEnemies'
  | 'frontEnemies'
  | 'backEnemies'
  | 'lowestHpEnemy' // lowest current HP fraction
  | 'highestAtkEnemy'
  | 'allAllies' // includes self
  | 'lowestHpAlly' // lowest current HP fraction, includes self
  | 'randomAllies'
  | 'previous'; // the targets selected by the previous effect in the same skill

export interface SkillTarget {
  selector: TargetSelector;
  /** Used by randomEnemies / randomAllies. Default 1. */
  count?: number;
}

export type ControlStatus = 'stun' | 'freeze' | 'petrify' | 'silence';
export type DotStatus = 'burn' | 'poison' | 'bleed';
export type StatusKind = ControlStatus | DotStatus;

export type SkillEffect =
  | {
      type: 'damage';
      target: SkillTarget;
      /** Multiplier of caster ATK. */
      multiplier: number;
      /** Extra multiplier applied when target has the given status (e.g. +100% vs burning). */
      bonusVsStatus?: { status: StatusKind; multiplier: number };
      /** Fraction of target armor ignored for this hit (stacks additively with armorBreak stat). */
      ignoreArmor?: number;
    }
  | {
      type: 'heal';
      target: SkillTarget;
      /** Multiplier of caster ATK. */
      multiplier: number;
    }
  | {
      /** Timed stat modifier. Negative amount = debuff. Percent semantics follow PERCENT_STATS. */
      type: 'buff';
      target: SkillTarget;
      stat: StatKey;
      amount: number;
      /** Rounds. A buff applied with duration N lasts through the end of the N-th round-end tick. */
      duration: number;
      chance?: number;
    }
  | {
      type: 'status';
      target: SkillTarget;
      status: StatusKind;
      /** 0..1 */
      chance: number;
      duration: number;
      /** For DoTs: damage per round = value * caster ATK (ignores armor). */
      value?: number;
    }
  | {
      type: 'energy';
      target: SkillTarget;
      /** Positive gives energy, negative drains. */
      amount: number;
    };

export interface SkillDef {
  name: string;
  description: string;
  effects: SkillEffect[];
}

export type PassiveTrigger =
  | 'battleStart' // once, before round 1
  | 'roundEnd' // at the end of every round while alive
  | 'onAttack' // after this unit finishes a basic attack or active skill
  | 'onHit' // after this unit takes damage from an enemy attack/skill (not DoT)
  | 'onAllyDeath' // when an ally dies
  | 'onDeath'; // when this unit dies

export interface PassiveDef {
  name: string;
  description: string;
  /** Permanent stat bonuses applied when the battle unit is built. */
  stats?: Partial<Stats>;
  trigger?: PassiveTrigger;
  /** 0..1, default 1. */
  chance?: number;
  effects?: SkillEffect[];
}

export interface HeroDef {
  id: string;
  name: string;
  /** Short Turkish epithet shown under the name, e.g. "Alev Büyücüsü". */
  title: string;
  faction: Faction;
  heroClass: HeroClass;
  /** Natural rarity 2..5 (the star count it is summoned at). */
  rarity: number;
  /** Level 1, 1-star base values. */
  base: { hp: number; atk: number; armor: number; spd: number };
  /** Innate secondary stats (crit, dodge...). */
  innate?: Partial<Stats>;
  active: SkillDef;
  passives: PassiveDef[];
  /** Placeholder art: a single emoji. */
  emoji: string;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type EquipSlot = 'weapon' | 'armor' | 'helmet' | 'boots';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'armor', 'helmet', 'boots'];

export interface EquipDef {
  id: string;
  name: string;
  slot: EquipSlot;
  /** 1..6 */
  tier: number;
  /** FLAT bonuses (hp/atk/armor/spd are flat numbers, others fractions). */
  stats: Partial<Stats>;
}

// ---------------------------------------------------------------------------
// Player state
// ---------------------------------------------------------------------------

export interface HeroInstance {
  uid: string;
  heroId: string;
  level: number;
  stars: number;
  /** slot -> EquipDef.id */
  equipment: Partial<Record<EquipSlot, string>>;
  locked: boolean;
}

export interface Resources {
  gold: number;
  /** Hero experience currency ("Ruh Özü"). */
  spirit: number;
  gems: number;
  basicScroll: number;
  heroicScroll: number;
}
export type ResourceKey = keyof Resources;

export interface Rewards {
  resources: Partial<Resources>;
  playerExp?: number;
  /** EquipDef.id -> count */
  equipment?: Record<string, number>;
}

export interface GameState {
  version: number;
  createdAt: number;
  /** Last time the game was open (ms epoch). */
  lastSeen: number;
  player: { name: string; level: number; exp: number };
  resources: Resources;
  heroes: HeroInstance[];
  /** Unequipped equipment stock: EquipDef.id -> count. */
  equipment: Record<string, number>;
  /** 6 slots of hero uids. Index 0-1 front row, 2-5 back row. */
  formation: (string | null)[];
  campaign: {
    /** Highest cleared stage; 0 = none. The next battle is stage + 1. */
    cleared: number;
    /** Timestamp idle rewards are accumulating from. */
    idleSince: number;
    /**
     * Idle income earned in [idleSince, until] at an earlier (lower) stage's rate, banked when a stage
     * was cleared and paid out with the next claim. Absent when nothing is banked.
     */
    idleBank?: { until: number; rewards: Rewards };
    /** Clock high-water mark: idle time up to here was already paid out or banked. Never decreases. */
    idlePaidUntil?: number;
  };
  tower: { cleared: number };
  summon: {
    /** Heroic pulls since the last 5-star. */
    heroicPity: number;
    totalPulls: number;
  };
  nextUid: number;
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

export type Side = 'attacker' | 'defender';
export interface UnitRef {
  side: Side;
  /** 0..5; 0-1 front, 2-5 back. */
  pos: number;
}

export interface BattleUnitSetup {
  heroId: string;
  level: number;
  stars: number;
  /** Final stats (level, stars, equipment applied — NOT passive stats, the engine adds those). */
  stats: Stats;
}

export interface BattleSetup {
  /** Exactly 6 entries; null = empty slot. */
  attackers: (BattleUnitSetup | null)[];
  defenders: (BattleUnitSetup | null)[];
  seed: number;
  /** Default 15. If nobody wins by then, the defender wins. */
  maxRounds?: number;
}

export interface UnitSnapshot {
  ref: UnitRef;
  heroId: string;
  level: number;
  stars: number;
  maxHp: number;
  hp: number;
  energy: number;
}

export type BattleEvent =
  | { t: 'roundStart'; round: number }
  | { t: 'action'; actor: UnitRef; kind: 'basic' | 'skill'; skillName?: string; targets: UnitRef[] }
  | {
      t: 'damage';
      source: UnitRef | null;
      target: UnitRef;
      amount: number;
      crit: boolean;
      kind: 'basic' | 'skill' | 'dot' | 'passive';
      hpAfter: number;
    }
  | { t: 'dodge'; source: UnitRef; target: UnitRef }
  | { t: 'heal'; source: UnitRef | null; target: UnitRef; amount: number; hpAfter: number }
  | { t: 'energy'; target: UnitRef; energyAfter: number }
  | { t: 'status'; target: UnitRef; status: StatusKind; on: boolean; duration: number }
  | { t: 'buff'; target: UnitRef; stat: StatKey; amount: number; duration: number }
  /** A buff (same target/stat/amount as an earlier `buff` event) expired at round end or was cleared by death. */
  | { t: 'buffEnd'; target: UnitRef; stat: StatKey; amount: number }
  | { t: 'passive'; actor: UnitRef; name: string }
  | { t: 'skip'; actor: UnitRef; reason: ControlStatus }
  | { t: 'death'; target: UnitRef }
  | { t: 'battleEnd'; winner: Side };

export interface UnitBattleStats {
  ref: UnitRef;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
}

export interface BattleResult {
  winner: Side;
  rounds: number;
  /** Unit state before round 1 (after battleStart passives are NOT yet applied). */
  initial: UnitSnapshot[];
  events: BattleEvent[];
  /** Unit state at the end. */
  final: UnitSnapshot[];
  unitStats: UnitBattleStats[];
}

// ---------------------------------------------------------------------------
// Generic action result for game-store mutations
// ---------------------------------------------------------------------------

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
