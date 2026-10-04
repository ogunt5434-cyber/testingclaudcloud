// Validates the hero roster and equipment catalogue against SPEC section 4.
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/core/constants';
import { EQUIP_SLOTS } from '../src/core/types';
import type {
  EquipSlot,
  HeroClass,
  HeroDef,
  PassiveDef,
  PassiveTrigger,
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
