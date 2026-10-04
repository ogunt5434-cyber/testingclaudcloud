// Validates the hero roster and equipment catalogue against SPEC section 4, plus a deterministic
// simulation guard (real battle engine) that catches kits which dominate, stall or do nothing.
import { beforeAll, describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/core/battle/engine';
import { FACTIONS } from '../src/core/constants';
import { hashSeed, Rng } from '../src/core/rng';
import { addStats, equipmentStats, heroBaseStats } from '../src/core/stats';
import { EQUIP_SLOTS } from '../src/core/types';
import type {
  BattleResult,
  BattleUnitSetup,
  EquipSlot,
  HeroClass,
  HeroDef,
  PassiveDef,
  PassiveTrigger,
  Side,
  SkillEffect,
  SkillTarget,
  StatKey,
  StatusKind,
  TargetSelector,
} from '../src/core/types';
import {
  HEROES,
  STARTER_HERO_IDS,
  getHeroDef,
  heroesByFaction,
  heroesByRarity,
  isHeroId,
} from '../src/data/heroes';
import { EQUIPMENT, MAX_EQUIP_TIER, equipmentFor, getEquipDef, isEquipId } from '../src/data/equipment';

// ---------------------------------------------------------------------------
// Rule tables (from SPEC §4)
// ---------------------------------------------------------------------------

type BaseKey = 'hp' | 'atk' | 'armor' | 'spd';
type Range = readonly [min: number, max: number];

const BASE_RANGES: Record<HeroClass, Record<BaseKey, Range>> = {
  warrior: { hp: [900, 1100], atk: [60, 75], armor: [25, 35], spd: [85, 95] },
  mage: { hp: [600, 750], atk: [85, 100], armor: [12, 18], spd: [95, 105] },
  ranger: { hp: [650, 800], atk: [85, 100], armor: [15, 20], spd: [100, 110] },
  assassin: { hp: [600, 720], atk: [90, 105], armor: [12, 18], spd: [105, 115] },
  priest: { hp: [700, 850], atk: [65, 80], armor: [15, 22], spd: [95, 105] },
};
const BASE_KEYS: readonly BaseKey[] = ['hp', 'atk', 'armor', 'spd'];

type DamageCategory = 'aoe' | 'row' | 'multi2' | 'multi3' | 'single';
/** Per-target multiplier range of one damage "chain" (an effect plus its 'previous' follow-ups). */
const DAMAGE_RANGES: Record<DamageCategory, Range> = {
  aoe: [0.8, 1.3],
  row: [1.2, 1.8],
  multi3: [1.2, 1.8],
  multi2: [1.5, 2.4],
  single: [2.5, 4.0],
};

type HealCategory = 'aoe' | 'multi' | 'single';
const HEAL_RANGES: Record<HealCategory, Range> = {
  aoe: [0.4, 0.8],
  multi: [0.6, 1.2],
  single: [1.0, 2.0],
};

const PASSIVE_COUNT_BY_RARITY: Record<number, number> = { 2: 1, 3: 2, 4: 2, 5: 3 };

const ENEMY_SELECTORS: readonly TargetSelector[] = [
  'defaultEnemy',
  'randomEnemies',
  'allEnemies',
  'frontEnemies',
  'backEnemies',
  'lowestHpEnemy',
  'highestAtkEnemy',
];
const ALLY_SELECTORS: readonly TargetSelector[] = ['self', 'allAllies', 'lowestHpAlly', 'randomAllies'];
const ALL_SELECTORS: readonly TargetSelector[] = [...ENEMY_SELECTORS, ...ALLY_SELECTORS, 'previous'];

const STAT_KEYS: readonly StatKey[] = [
  'hp',
  'atk',
  'armor',
  'spd',
  'crit',
  'critDmg',
  'hit',
  'dodge',
  'skillDmg',
  'dmgReduce',
  'controlImmune',
  'armorBreak',
];
const TRIGGERS: readonly PassiveTrigger[] = ['battleStart', 'roundEnd', 'onAttack', 'onHit', 'onAllyDeath', 'onDeath'];
const DOT_STATUSES: readonly StatusKind[] = ['burn', 'poison', 'bleed'];
const CONTROL_STATUSES: readonly StatusKind[] = ['stun', 'freeze', 'petrify', 'silence'];

/** Max magnitude for timed buffs/debuffs and permanent passive stats (spd is flat, others fractions). */
const MAX_BUFF_FRACTION = 0.3;
const MAX_BUFF_SPD = 20;
const MAX_PASSIVE_SPD = 10;
const MAX_ENERGY_EFFECT = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inRange = (value: number, [min, max]: Range): boolean => value >= min - 1e-9 && value <= max + 1e-9;
const pct = (x: number): string => `%${Math.round(Math.abs(x) * 100)}`;
const isInt = (x: number): boolean => Number.isInteger(x);

function damageCategory(target: SkillTarget): DamageCategory {
  switch (target.selector) {
    case 'allEnemies':
      return 'aoe';
    case 'frontEnemies':
    case 'backEnemies':
      return 'row';
    case 'randomEnemies': {
      const count = target.count ?? 1;
      if (count >= 3) return 'multi3';
      return count === 2 ? 'multi2' : 'single';
    }
    default:
      return 'single';
  }
}

function healCategory(target: SkillTarget): HealCategory {
  if (target.selector === 'allAllies') return 'aoe';
  if (target.selector === 'randomAllies' && (target.count ?? 1) >= 2) return 'multi';
  return 'single';
}

/** Index of the effect whose selector a 'previous' chain ultimately resolves to (-1 if invalid). */
function rootIndices(effects: readonly SkillEffect[]): number[] {
  const roots: number[] = [];
  effects.forEach((effect, i) => {
    if (effect.target.selector !== 'previous') roots.push(i);
    else roots.push(i === 0 ? -1 : roots[i - 1]);
  });
  return roots;
}

/** Numbers that must literally appear in the Turkish description for this effect. */
function effectTokens(effect: SkillEffect): string[] {
  const tokens: string[] = [];
  const count = effect.target.count ?? 1;
  if (count > 1) tokens.push(String(count));
  switch (effect.type) {
    case 'damage':
      tokens.push(pct(effect.multiplier));
      if (effect.bonusVsStatus) tokens.push(pct(effect.bonusVsStatus.multiplier - 1));
      if (effect.ignoreArmor) tokens.push(pct(effect.ignoreArmor));
      break;
    case 'heal':
      tokens.push(pct(effect.multiplier));
      break;
    case 'buff':
      tokens.push(effect.stat === 'spd' ? String(Math.abs(effect.amount)) : pct(effect.amount));
      tokens.push(`${effect.duration} tur`);
      if (effect.chance !== undefined && effect.chance < 1) tokens.push(pct(effect.chance));
      break;
    case 'status':
      tokens.push(`${effect.duration} tur`);
      if (effect.chance < 1) tokens.push(pct(effect.chance));
      if (effect.value !== undefined) tokens.push(pct(effect.value));
      break;
    case 'energy':
      tokens.push(String(Math.abs(effect.amount)));
      break;
  }
  return tokens;
}

function passiveTokens(passive: PassiveDef): string[] {
  const tokens: string[] = [];
  for (const [key, value] of Object.entries(passive.stats ?? {})) {
    tokens.push(key === 'spd' ? String(value) : pct(value));
  }
  if (passive.chance !== undefined && passive.chance < 1) tokens.push(pct(passive.chance));
  for (const effect of passive.effects ?? []) tokens.push(...effectTokens(effect));
  return tokens;
}

function missingTokens(description: string, tokens: readonly string[]): string[] {
  return tokens.filter((t) => !description.includes(t));
}

/** Problems with a single effect, independent of its neighbours. */
function effectShapeProblems(effect: SkillEffect, isEnemyTarget: boolean): string[] {
  const problems: string[] = [];
  const { selector, count } = effect.target;
  if (!ALL_SELECTORS.includes(selector)) problems.push(`unknown selector ${selector}`);
  if (count !== undefined) {
    if (selector !== 'randomEnemies' && selector !== 'randomAllies') problems.push(`count on ${selector}`);
    if (!isInt(count) || count < 1 || count > 6) problems.push(`bad count ${count}`);
  }

  switch (effect.type) {
    case 'damage':
      if (!(effect.multiplier > 0)) problems.push('damage multiplier must be > 0');
      if (!isEnemyTarget) problems.push('damage must target enemies');
      if (effect.bonusVsStatus) {
        const { status, multiplier } = effect.bonusVsStatus;
        if (![...DOT_STATUSES, ...CONTROL_STATUSES].includes(status)) problems.push(`bad bonus status ${status}`);
        if (!(multiplier > 1 && multiplier <= 2)) problems.push(`bonusVsStatus multiplier ${multiplier} not in (1, 2]`);
      }
      if (effect.ignoreArmor !== undefined && !(effect.ignoreArmor > 0 && effect.ignoreArmor <= 1)) {
        problems.push(`ignoreArmor ${effect.ignoreArmor} not in (0, 1]`);
      }
      break;
    case 'heal':
      if (!(effect.multiplier > 0)) problems.push('heal multiplier must be > 0');
      if (isEnemyTarget) problems.push('heal must target allies');
      break;
    case 'buff': {
      if (!STAT_KEYS.includes(effect.stat)) problems.push(`unknown stat ${effect.stat}`);
      if (effect.stat === 'hp') problems.push("timed buff on 'hp' is not allowed");
      if (effect.amount === 0) problems.push('buff amount is 0');
      const cap = effect.stat === 'spd' ? MAX_BUFF_SPD : MAX_BUFF_FRACTION;
      if (Math.abs(effect.amount) > cap + 1e-9) problems.push(`buff ${effect.stat} ${effect.amount} exceeds ${cap}`);
      if (effect.amount > 0 === isEnemyTarget) problems.push('buffs must target allies and debuffs enemies');
      if (!isInt(effect.duration) || effect.duration < 1) problems.push(`bad buff duration ${effect.duration}`);
      if (effect.chance !== undefined && !(effect.chance > 0 && effect.chance <= 1)) problems.push('bad buff chance');
      break;
    }
    case 'status': {
      const isDot = DOT_STATUSES.includes(effect.status);
      if (!isDot && !CONTROL_STATUSES.includes(effect.status)) problems.push(`unknown status ${effect.status}`);
      if (!isEnemyTarget) problems.push('statuses must target enemies');
      if (!(effect.chance > 0 && effect.chance <= 1)) problems.push(`status chance ${effect.chance} not in (0, 1]`);
      if (!isInt(effect.duration) || effect.duration < 1) problems.push(`bad status duration ${effect.duration}`);
      if (isDot) {
        if (!(effect.value !== undefined && effect.value > 0 && effect.value <= 0.5)) {
          problems.push(`DoT ${effect.status} needs value in (0, 0.5]`);
        }
        if (effect.duration > 3) problems.push('DoT duration > 3');
      } else {
        if (effect.value !== undefined) problems.push('control status must not have a value');
        if (effect.duration > 2) problems.push('control duration > 2');
      }
      break;
    }
    case 'energy':
      if (effect.amount === 0 || !isInt(effect.amount)) problems.push(`bad energy amount ${effect.amount}`);
      if (Math.abs(effect.amount) > MAX_ENERGY_EFFECT) problems.push('energy amount too large');
      if (effect.amount > 0 === isEnemyTarget) problems.push('energy gain must target allies and drain enemies');
      break;
  }
  return problems;
}

/**
 * Validates an effect list (active skill or triggered passive): shapes, 'previous' placement and
 * multiplier budgets. `enforceMinimums` applies SPEC minimums to the first damage / heal chain.
 */
function effectListProblems(effects: readonly SkillEffect[], enforceMinimums: boolean): string[] {
  const problems: string[] = [];
  const roots = rootIndices(effects);
  const damageTotals = new Map<number, number>();
  const healTotals = new Map<number, number>();

  effects.forEach((effect, i) => {
    const root = roots[i];
    if (root < 0) {
      problems.push(`effect ${i}: 'previous' used without an earlier effect`);
      return;
    }
    const rootSelector = effects[root].target.selector;
    const prefix = `effect ${i} (${effect.type})`;
    problems.push(...effectShapeProblems(effect, ENEMY_SELECTORS.includes(rootSelector)).map((p) => `${prefix}: ${p}`));
    if (effect.type === 'damage') damageTotals.set(root, (damageTotals.get(root) ?? 0) + effect.multiplier);
    if (effect.type === 'heal') healTotals.set(root, (healTotals.get(root) ?? 0) + effect.multiplier);
  });

  const checkTotals = (totals: Map<number, number>, rangeOf: (root: number) => [string, Range]): void => {
    [...totals.entries()].forEach(([root, total], n) => {
      const [category, [min, max]] = rangeOf(root);
      if (total > max + 1e-9) problems.push(`${category} chain at effect ${root} totals ${total} > ${max}`);
      if (enforceMinimums && n === 0 && total < min - 1e-9) {
        problems.push(`${category} chain at effect ${root} totals ${total} < ${min}`);
      }
    });
  };
  checkTotals(damageTotals, (root) => {
    const category = damageCategory(effects[root].target);
    return [`damage/${category}`, DAMAGE_RANGES[category]];
  });
  checkTotals(healTotals, (root) => {
    const category = healCategory(effects[root].target);
    return [`heal/${category}`, HEAL_RANGES[category]];
  });
  return problems;
}

function passiveProblems(passive: PassiveDef): string[] {
  const problems: string[] = [];
  if (!passive.name.trim()) problems.push('empty name');
  if (!passive.description.trim()) problems.push('empty description');
  const hasStats = passive.stats !== undefined && Object.keys(passive.stats).length > 0;
  const hasEffects = passive.effects !== undefined && passive.effects.length > 0;
  if (!hasStats && !hasEffects) problems.push('passive does nothing');
  if (hasEffects && !passive.trigger) problems.push('effects without a trigger');
  if (passive.trigger && !TRIGGERS.includes(passive.trigger)) problems.push(`unknown trigger ${passive.trigger}`);
  if (passive.trigger && !hasEffects) problems.push('trigger without effects');
  if (passive.chance !== undefined && !(passive.chance > 0 && passive.chance <= 1)) problems.push('bad chance');

  for (const [key, value] of Object.entries(passive.stats ?? {})) {
    if (!STAT_KEYS.includes(key as StatKey)) problems.push(`unknown stat ${key}`);
    const cap = key === 'spd' ? MAX_PASSIVE_SPD : MAX_BUFF_FRACTION;
    if (!(value > 0 && value <= cap + 1e-9)) problems.push(`passive stat ${key}=${value} not in (0, ${cap}]`);
  }
  if (hasEffects) problems.push(...effectListProblems(passive.effects ?? [], false));

  const missing = missingTokens(passive.description, passiveTokens(passive));
  if (missing.length) problems.push(`description misses numbers ${missing.join(', ')}`);
  return problems;
}

function heroProblems(hero: HeroDef): string[] {
  const problems: string[] = [];
  const { active } = hero;
  if (!active.name.trim() || !active.description.trim()) problems.push('active: empty name/description');
  if (active.effects.length === 0) problems.push('active: no effects');
  problems.push(...effectListProblems(active.effects, true).map((p) => `active: ${p}`));
  const missing = missingTokens(active.description, active.effects.flatMap(effectTokens));
  if (missing.length) problems.push(`active: description misses numbers ${missing.join(', ')}`);

  hero.passives.forEach((passive) => {
    problems.push(...passiveProblems(passive).map((p) => `passive "${passive.name}": ${p}`));
  });
  return problems.map((p) => `${hero.id}: ${p}`);
}

/** 0..1 score of where a hero's base stats sit inside its class ranges. */
function baseScore(hero: HeroDef): number {
  const ranges = BASE_RANGES[hero.heroClass];
  const parts = BASE_KEYS.map((key) => {
    const [min, max] = ranges[key];
    return (hero.base[key] - min) / (max - min);
  });
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

// ---------------------------------------------------------------------------
// Hero tests
// ---------------------------------------------------------------------------

describe('hero roster', () => {
  it('has 30 heroes with unique snake_case ids, names and emojis', () => {
    expect(HEROES).toHaveLength(30);
    const ids = HEROES.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
    expect(new Set(HEROES.map((h) => h.name)).size).toBe(HEROES.length);
    expect(new Set(HEROES.map((h) => h.emoji)).size).toBe(HEROES.length);
  });

  it('has non-empty Turkish name, title and emoji for every hero', () => {
    for (const hero of HEROES) {
      expect(hero.name.trim(), hero.id).not.toBe('');
      expect(hero.title.trim(), hero.id).not.toBe('');
      expect(hero.emoji.trim(), hero.id).not.toBe('');
    }
  });

  it('has exactly 5 heroes per faction with rarities [2, 3, 4, 5, 5]', () => {
    for (const faction of FACTIONS) {
      const heroes = heroesByFaction(faction);
      expect(heroes, faction).toHaveLength(5);
      expect(heroes.map((h) => h.rarity).sort(), faction).toEqual([2, 3, 4, 5, 5]);
    }
  });

  it('gives every faction at least one warrior and one priest', () => {
    for (const faction of FACTIONS) {
      const classes = heroesByFaction(faction).map((h) => h.heroClass);
      expect(classes, faction).toContain('warrior');
      expect(classes, faction).toContain('priest');
    }
  });

  it('has the expected rarity distribution', () => {
    expect(heroesByRarity(2)).toHaveLength(6);
    expect(heroesByRarity(3)).toHaveLength(6);
    expect(heroesByRarity(4)).toHaveLength(6);
    expect(heroesByRarity(5)).toHaveLength(12);
  });

  it('keeps base stats within the SPEC class ranges', () => {
    const outOfRange = HEROES.flatMap((hero) =>
      BASE_KEYS.filter((key) => !inRange(hero.base[key], BASE_RANGES[hero.heroClass][key])).map(
        (key) => `${hero.id}.${key}=${hero.base[key]}`,
      ),
    );
    expect(outOfRange).toEqual([]);
  });

  it('gives higher-rarity heroes better base stats within a class', () => {
    const inversions: string[] = [];
    for (const a of HEROES) {
      for (const b of HEROES) {
        if (a.heroClass === b.heroClass && a.rarity < b.rarity && baseScore(a) >= baseScore(b)) {
          inversions.push(`${a.id}(${a.rarity}) >= ${b.id}(${b.rarity})`);
        }
      }
    }
    expect(inversions).toEqual([]);
  });

  it('keeps innate secondary stats small and valid', () => {
    for (const hero of HEROES) {
      for (const [key, value] of Object.entries(hero.innate ?? {})) {
        expect(STAT_KEYS, hero.id).toContain(key);
        expect(['hp', 'atk', 'armor', 'spd'], `${hero.id} innate ${key}`).not.toContain(key);
        expect(value > 0 && value <= 0.2, `${hero.id} innate ${key}=${value}`).toBe(true);
      }
    }
  });

  it('has the right number of passives per rarity', () => {
    for (const hero of HEROES) {
      expect(hero.passives.length, hero.id).toBe(PASSIVE_COUNT_BY_RARITY[hero.rarity]);
    }
  });

  it('has structurally valid skills and passives whose descriptions state the real numbers', () => {
    expect(HEROES.flatMap(heroProblems)).toEqual([]);
  });

  it('gives rarity-5 heroes more complex actives than rarity-2 heroes', () => {
    for (const hero of heroesByRarity(5)) expect(hero.active.effects.length, hero.id).toBeGreaterThanOrEqual(3);
    for (const hero of heroesByRarity(2)) expect(hero.active.effects.length, hero.id).toBeLessThanOrEqual(2);
  });

  it('uses unique skill and passive names', () => {
    const activeNames = HEROES.map((h) => h.active.name);
    expect(new Set(activeNames).size).toBe(activeNames.length);
    const passiveNames = HEROES.flatMap((h) => h.passives.map((p) => p.name));
    expect(new Set(passiveNames).size).toBe(passiveNames.length);
  });

  it('uses every control and DoT status somewhere', () => {
    const used = new Set(
      HEROES.flatMap((h) => [...h.active.effects, ...h.passives.flatMap((p) => p.effects ?? [])])
        .filter((e) => e.type === 'status')
        .map((e) => (e.type === 'status' ? e.status : '')),
    );
    for (const status of [...CONTROL_STATUSES, ...DOT_STATUSES]) expect(used, status).toContain(status);
  });

  it("does not spend stat budget on 'hit' (it only counters dodge, which few heroes have)", () => {
    const usesHit = HEROES.flatMap((hero) => {
      const found: string[] = [];
      if (hero.innate?.hit) found.push('innate');
      for (const p of hero.passives) if (p.stats?.hit) found.push(`passive "${p.name}" stats`);
      const effects = [...hero.active.effects, ...hero.passives.flatMap((p) => p.effects ?? [])];
      if (effects.some((e) => e.type === 'buff' && e.stat === 'hit' && e.amount > 0)) found.push('hit buff');
      return found.map((f) => `${hero.id}: ${f}`);
    });
    expect(usesHit).toEqual([]);
  });

  it('applies a status before any damage of the same skill that has a bonus against it', () => {
    // A bonus against a status the skill itself applies only afterwards almost never triggers.
    const late = HEROES.flatMap((hero) =>
      [hero.active, ...hero.passives].flatMap((skill) => {
        const effects = skill.effects ?? [];
        return effects.flatMap((effect, i) => {
          if (effect.type !== 'damage' || !effect.bonusVsStatus) return [];
          const status = effect.bonusVsStatus.status;
          const appliedLater = effects.slice(i + 1).some((e) => e.type === 'status' && e.status === status);
          return appliedLater ? [`${hero.id} "${skill.name}": ${status} applied after its bonus hit`] : [];
        });
      }),
    );
    expect(late).toEqual([]);
  });
});

describe('hero lookups', () => {
  it('finds every hero by id and throws on unknown ids', () => {
    for (const hero of HEROES) {
      expect(getHeroDef(hero.id)).toBe(hero);
      expect(isHeroId(hero.id)).toBe(true);
    }
    expect(() => getHeroDef('yok_boyle_biri')).toThrow();
    expect(isHeroId('yok_boyle_biri')).toBe(false);
  });

  it('recommends 5 valid low-rarity starters including a warrior and a priest', () => {
    expect(STARTER_HERO_IDS).toHaveLength(5);
    const starters = STARTER_HERO_IDS.map(getHeroDef);
    for (const hero of starters) expect([2, 3], hero.id).toContain(hero.rarity);
    const classes = starters.map((h) => h.heroClass);
    expect(classes).toContain('warrior');
    expect(classes).toContain('priest');
  });
});

// ---------------------------------------------------------------------------
// Equipment tests
// ---------------------------------------------------------------------------

const PRIMARY_STAT: Record<EquipSlot, StatKey> = { weapon: 'atk', armor: 'hp', helmet: 'hp', boots: 'spd' };
const TIER1_BALLPARK: Record<EquipSlot, Partial<Record<StatKey, number>>> = {
  weapon: { atk: 20 },
  armor: { hp: 200, armor: 8 },
  helmet: { hp: 150, armor: 6 },
  boots: { spd: 3, hp: 80 },
};

describe('equipment catalogue', () => {
  it('has 24 items: exactly one per slot per tier, with consistent ids', () => {
    expect(EQUIPMENT).toHaveLength(24);
    expect(MAX_EQUIP_TIER).toBe(6);
    expect(new Set(EQUIPMENT.map((e) => e.id)).size).toBe(24);
    for (const slot of EQUIP_SLOTS) {
      for (let tier = 1; tier <= MAX_EQUIP_TIER; tier++) {
        const matches = EQUIPMENT.filter((e) => e.slot === slot && e.tier === tier);
        expect(matches, `${slot} t${tier}`).toHaveLength(1);
        expect(matches[0].id).toBe(`${slot}_t${tier}`);
        expect(equipmentFor(slot, tier)).toBe(matches[0]);
        expect(getEquipDef(matches[0].id)).toBe(matches[0]);
        expect(isEquipId(matches[0].id)).toBe(true);
      }
    }
  });

  it('has unique non-empty Turkish names', () => {
    const names = EQUIPMENT.map((e) => e.name.trim());
    for (const name of names) expect(name).not.toBe('');
    expect(new Set(names).size).toBe(names.length);
  });

  it('matches the SPEC tier-1 ballpark (±10%)', () => {
    for (const slot of EQUIP_SLOTS) {
      const t1 = equipmentFor(slot, 1).stats;
      for (const [stat, expected] of Object.entries(TIER1_BALLPARK[slot])) {
        const actual = t1[stat as StatKey] ?? 0;
        expect(Math.abs(actual - expected) / expected, `${slot}.${stat}`).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('increases the primary stat every tier and never lowers any stat', () => {
    for (const slot of EQUIP_SLOTS) {
      const primary = PRIMARY_STAT[slot];
      for (let tier = 2; tier <= MAX_EQUIP_TIER; tier++) {
        const prev = equipmentFor(slot, tier - 1).stats;
        const cur = equipmentFor(slot, tier).stats;
        expect(cur[primary] ?? 0, `${slot} t${tier} ${primary}`).toBeGreaterThan(prev[primary] ?? 0);
        for (const stat of STAT_KEYS) {
          expect(cur[stat] ?? 0, `${slot} t${tier} ${stat}`).toBeGreaterThanOrEqual(prev[stat] ?? 0);
        }
      }
    }
  });

  it('grows hp/atk/armor roughly ×1.8 per tier', () => {
    for (const item of EQUIPMENT.filter((e) => e.tier > 1)) {
      const prev = equipmentFor(item.slot, item.tier - 1).stats;
      for (const stat of ['hp', 'atk', 'armor'] as const) {
        const before = prev[stat];
        const after = item.stats[stat];
        if (before === undefined || after === undefined) continue;
        expect(after / before, `${item.id}.${stat}`).toBeGreaterThan(1.6);
        expect(after / before, `${item.id}.${stat}`).toBeLessThan(2.0);
      }
    }
  });

  it('throws on unknown ids and tiers', () => {
    expect(() => getEquipDef('weapon_t7')).toThrow();
    expect(() => equipmentFor('weapon', 0)).toThrow();
    expect(isEquipId('weapon_t7')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Simulation guard: the real engine with fixed seeds, every hero at level 60 / 5★ unless noted.
// Thresholds leave room for sampling noise but fail on the outliers this guard was written for
// (a drain kit soft-locking enemy casters, self-healing tanks out-healing priests, passives worth 0).
// ---------------------------------------------------------------------------

type Slots = (BattleUnitSetup | null)[];

const GUARD_LEVEL = 60;
const GUARD_STARS = 5;
/** Shared 5-hero contexts per hero pair in the paired one-slot swap (2 mirrored battles each). */
const PAIR_CONTEXTS = 10;
const RANDOM_BATTLES = 2000;
const GEAR_BATTLES = 400;
/** Contexts per passive in the head-to-head "hero vs hero without that passive" check. */
const PASSIVE_CONTEXTS = 500;

function guardUnit(def: HeroDef, level: number, tier: number): BattleUnitSetup {
  const stats = heroBaseStats(def, level, GUARD_STARS);
  if (tier > 0) {
    const gear: Partial<Record<EquipSlot, string>> = {};
    for (const slot of EQUIP_SLOTS) gear[slot] = `${slot}_t${tier}`;
    addStats(stats, equipmentStats(gear));
  }
  return { heroId: def.id, level, stars: GUARD_STARS, stats };
}

/** Like the auto formation: warriors (then the highest hp) take the 2 front slots. */
function guardTeam(defs: readonly HeroDef[], level = GUARD_LEVEL, tier = 0): Slots {
  const units = defs.map((def) => ({ def, unit: guardUnit(def, level, tier) }));
  const isWarrior = (u: (typeof units)[number]) => Number(u.def.heroClass === 'warrior');
  const front = units
    .slice()
    .sort((a, b) => isWarrior(b) - isWarrior(a) || b.unit.stats.hp - a.unit.stats.hp)
    .slice(0, 2);
  const slots: Slots = [...front, ...units.filter((u) => !front.includes(u))].map((u) => u.unit);
  while (slots.length < 6) slots.push(null);
  return slots;
}

const isTimeout = (res: BattleResult): boolean =>
  res.final.some((u) => u.ref.side === 'attacker' && u.hp > 0) && res.final.some((u) => u.ref.side === 'defender' && u.hp > 0);

/** X's win rate against every other hero Y when the two teams differ only in that one slot (mirrored sides). */
function pairedRatings(roster: readonly HeroDef[]): Map<string, number> {
  const wins = new Map(roster.map((h) => [h.id, 0]));
  const games = new Map(roster.map((h) => [h.id, 0]));
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const x = roster[i];
      const y = roster[j];
      const pool = roster.filter((h) => h !== x && h !== y);
      const rng = new Rng(hashSeed('guard-pair', i, j));
      for (let c = 0; c < PAIR_CONTEXTS; c++) {
        const shared = rng.shuffle(pool).slice(0, 5);
        const withX = guardTeam([...shared, x]);
        const withY = guardTeam([...shared, y]);
        const r1 = simulateBattle({ attackers: withX, defenders: withY, seed: hashSeed('guard-pair', i, j, c) });
        const r2 = simulateBattle({ attackers: withY, defenders: withX, seed: hashSeed('guard-pair-rev', i, j, c) });
        const xWins = (r1.winner === 'attacker' ? 1 : 0) + (r2.winner === 'defender' ? 1 : 0);
        wins.set(x.id, wins.get(x.id)! + xWins);
        wins.set(y.id, wins.get(y.id)! + 2 - xWins);
        games.set(x.id, games.get(x.id)! + 2);
        games.set(y.id, games.get(y.id)! + 2);
      }
    }
  }
  return new Map(roster.map((h) => [h.id, wins.get(h.id)! / games.get(h.id)!]));
}

interface HeroSample {
  games: number;
  survived: number;
  damage: number;
  healing: number;
  /** Skill casts / turns (casts, basics and skips) of the opposing team in this hero's battles. */
  enemyCasts: number;
  enemyTurns: number;
  defenderGames: number;
  defenderTimeouts: number;
}

interface RandomSample {
  battles: number;
  timeouts: number;
  shortBattles: number;
  casts: number;
  turns: number;
  unitBattles: number;
  /** Unit-battles in which a unit skipped 3+ turns in a row. */
  longSkipRuns: number;
  maxSkipRun: number;
  heroes: Map<string, HeroSample>;
}

/** Random 6v6 battles between distinct-hero teams. */
function randomSample(roster: readonly HeroDef[]): RandomSample {
  const sample: RandomSample = {
    battles: 0,
    timeouts: 0,
    shortBattles: 0,
    casts: 0,
    turns: 0,
    unitBattles: 0,
    longSkipRuns: 0,
    maxSkipRun: 0,
    heroes: new Map(),
  };
  for (let i = 0; i < RANDOM_BATTLES; i++) {
    const rng = new Rng(hashSeed('guard-random', i));
    const res = simulateBattle({
      attackers: guardTeam(rng.shuffle(roster).slice(0, 6)),
      defenders: guardTeam(rng.shuffle(roster).slice(0, 6)),
      seed: hashSeed('guard-random-seed', i),
    });
    const timeout = isTimeout(res);
    sample.battles++;
    if (timeout) sample.timeouts++;
    if (res.rounds <= 2) sample.shortBattles++;

    const casts: Record<Side, number> = { attacker: 0, defender: 0 };
    const turns: Record<Side, number> = { attacker: 0, defender: 0 };
    const skipRun = new Map<string, number>();
    const longestRun = new Map<string, number>();
    for (const e of res.events) {
      if (e.t === 'action') {
        turns[e.actor.side]++;
        if (e.kind === 'skill') casts[e.actor.side]++;
        skipRun.set(e.actor.side + e.actor.pos, 0);
      } else if (e.t === 'skip') {
        const key = e.actor.side + e.actor.pos;
        const run = (skipRun.get(key) ?? 0) + 1;
        turns[e.actor.side]++;
        skipRun.set(key, run);
        longestRun.set(key, Math.max(longestRun.get(key) ?? 0, run));
      }
    }
    sample.casts += casts.attacker + casts.defender;
    sample.turns += turns.attacker + turns.defender;
    for (const run of longestRun.values()) {
      if (run >= 3) sample.longSkipRuns++;
      sample.maxSkipRun = Math.max(sample.maxSkipRun, run);
    }

    for (const unit of res.final) {
      const side = unit.ref.side;
      const enemy: Side = side === 'attacker' ? 'defender' : 'attacker';
      const record = res.unitStats.find((s) => s.ref.side === side && s.ref.pos === unit.ref.pos)!;
      let h = sample.heroes.get(unit.heroId);
      if (!h) {
        h = { games: 0, survived: 0, damage: 0, healing: 0, enemyCasts: 0, enemyTurns: 0, defenderGames: 0, defenderTimeouts: 0 };
        sample.heroes.set(unit.heroId, h);
      }
      sample.unitBattles++;
      h.games++;
      if (unit.hp > 0) h.survived++;
      h.damage += record.damageDealt;
      h.healing += record.healingDone;
      h.enemyCasts += casts[enemy];
      h.enemyTurns += turns[enemy];
      if (side === 'defender') {
        h.defenderGames++;
        if (timeout) h.defenderTimeouts++;
      }
    }
  }
  return sample;
}

/** Fully geared L100 teams (gear tier `tier`) attacking bare L100 teams that contain all of `sustain`. */
function gearedWinRateAgainst(roster: readonly HeroDef[], sustain: readonly HeroDef[], tier: number): number {
  const others = roster.filter((h) => !sustain.includes(h));
  let wins = 0;
  for (let i = 0; i < GEAR_BATTLES; i++) {
    const rng = new Rng(hashSeed('guard-gear', i));
    const attackers = guardTeam(rng.shuffle(roster).slice(0, 6), 100, tier);
    const defenders = guardTeam([...sustain, ...rng.shuffle(others).slice(0, 6 - sustain.length)], 100, 0);
    if (simulateBattle({ attackers, defenders, seed: hashSeed('guard-gear-seed', i) }).winner === 'attacker') wins++;
  }
  return wins / GEAR_BATTLES;
}

/** Win rate of team(shared + hero) against team(shared + hero without `passiveName`), mirrored. */
function passiveHeadToHead(roster: readonly HeroDef[], heroId: string, passiveName: string): number {
  const hero = roster.find((h) => h.id === heroId)!;
  expect(hero.passives.map((p) => p.name), heroId).toContain(passiveName);
  const without: HeroDef = {
    ...hero,
    id: `${hero.id}__without`,
    passives: hero.passives.filter((p) => p.name !== passiveName),
  };
  const pool = roster.filter((h) => h !== hero);
  HEROES.push(without);
  try {
    let wins = 0;
    for (let c = 0; c < PASSIVE_CONTEXTS; c++) {
      const rng = new Rng(hashSeed('guard-passive', heroId, c));
      const shared = rng.shuffle(pool).slice(0, 5);
      const a = guardTeam([...shared, hero]);
      const b = guardTeam([...shared, without]);
      if (simulateBattle({ attackers: a, defenders: b, seed: hashSeed('guard-passive', heroId, c, 1) }).winner === 'attacker') wins++;
      if (simulateBattle({ attackers: b, defenders: a, seed: hashSeed('guard-passive', heroId, c, 2) }).winner === 'defender') wins++;
    }
    return wins / (2 * PASSIVE_CONTEXTS);
  } finally {
    HEROES.splice(HEROES.indexOf(without), 1);
  }
}

describe('roster balance (simulation guard)', () => {
  const roster = HEROES.slice();
  const byId = (id: string) => roster.find((h) => h.id === id)!;
  let ratings = new Map<string, number>();
  let sample: RandomSample;
  const hero = (id: string): HeroSample => sample.heroes.get(id)!;
  const perGame = (id: string, key: 'damage' | 'healing' | 'survived') => hero(id)[key] / hero(id).games;

  beforeAll(() => {
    ratings = pairedRatings(roster);
    sample = randomSample(roster);
  }, 120_000);

  const rarityMeans = () =>
    [2, 3, 4, 5].map((r) => {
      const group = roster.filter((h) => h.rarity === r);
      return group.reduce((sum, h) => sum + ratings.get(h.id)!, 0) / group.length;
    });

  it('keeps every hero within ±12pp of its rarity mean in a paired one-slot swap', () => {
    const means = rarityMeans();
    const outliers = roster
      .map((h) => ({ h, dev: ratings.get(h.id)! - means[h.rarity - 2] }))
      .filter(({ dev }) => Math.abs(dev) > 0.12)
      .map(({ h, dev }) => `${h.id} ${(100 * dev).toFixed(1)}pp`);
    expect(outliers).toEqual([]);
  });

  it('orders rarities without a cliff at 5★ (equal level and stars)', () => {
    const means = rarityMeans();
    const steps = means.slice(1).map((m, i) => m - means[i]);
    for (const step of steps) expect(step).toBeGreaterThan(0.04);
    expect(steps[2], `rarity means ${means.map((m) => (100 * m).toFixed(1)).join(' / ')}`).toBeLessThan(0.2);
  });

  it('ends random battles neither by timeout too often nor within 2 rounds', () => {
    expect(sample.timeouts / sample.battles).toBeLessThan(0.12);
    expect(sample.shortBattles / sample.battles).toBeLessThan(0.02);
  });

  it('has no stun-locks: long runs of skipped turns are rare', () => {
    expect(sample.longSkipRuns / sample.unitBattles).toBeLessThan(0.01);
    expect(sample.maxSkipRun).toBeLessThanOrEqual(8);
  });

  it('keeps energy drain from soft-locking enemy casters', () => {
    const globalCastRate = sample.casts / sample.turns;
    for (const id of ['aycalan', 'kefen']) {
      const castRate = hero(id).enemyCasts / hero(id).enemyTurns;
      expect(castRate / globalCastRate, id).toBeGreaterThan(0.92);
    }
  });

  it('keeps self-healing tanks from outlasting every other tank and stalling defences', () => {
    const otherTanks = roster.filter((h) => h.rarity === 5 && h.heroClass === 'warrior' && h.id !== 'kemikkiran');
    const bestOther = Math.max(...otherTanks.map((h) => perGame(h.id, 'survived')));
    expect(perGame('kemikkiran', 'survived') - bestOther).toBeLessThan(0.1);
    expect(hero('kemikkiran').defenderTimeouts / hero('kemikkiran').defenderGames).toBeLessThan(0.13);
  });

  it('lets every priest heal more than any self-healing non-priest', () => {
    const priests = roster.filter((h) => h.heroClass === 'priest');
    const others = roster.filter((h) => h.heroClass !== 'priest');
    const weakestPriest = Math.min(...priests.map((h) => perGame(h.id, 'healing')));
    const best = others.reduce((a, b) => (perGame(a.id, 'healing') >= perGame(b.id, 'healing') ? a : b));
    expect(weakestPriest, `best non-priest healer: ${best.id}`).toBeGreaterThan(perGame(best.id, 'healing'));
  });

  it('keeps the strongest healer and damage dealer within reach of their peers', () => {
    expect(perGame('kokbilge', 'healing') / perGame('tanyeri', 'healing')).toBeLessThan(1.6);
    expect(perGame('kozhan', 'damage') / perGame('yildizhan', 'damage')).toBeLessThan(1.22);
  });

  it('lets full endgame gear beat sustain-heavy enemy teams', () => {
    const sustain = [byId('kemikkiran'), byId('kokbilge')];
    expect(gearedWinRateAgainst(roster, sustain, 6)).toBeGreaterThan(0.8);
  });

  it('gives formerly inert passives a measurable effect', () => {
    const pieces: [string, string][] = [
      ['yildizhan', 'Kutup Yıldızı'],
      ['sisgoz', 'Sis Perdesi'],
      ['simsek', 'Statik Yük'],
      ['alevnur', 'Ocak Bekçisi'],
      ['demirkol', 'Son Siper'],
    ];
    const rates = pieces.map(([id, name]) => passiveHeadToHead(roster, id, name));
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    expect(mean, rates.map((r, i) => `${pieces[i][1]} ${(100 * r).toFixed(1)}%`).join(', ')).toBeGreaterThan(0.54);
  }, 60_000);
});
