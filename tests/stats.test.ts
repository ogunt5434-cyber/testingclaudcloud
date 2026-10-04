import { describe, expect, it } from 'vitest';
import { LEVEL_GROWTH, SPD_PER_STAR, STAR_MULT } from '../src/core/constants';
import {
  emptyStats,
  equipmentStats,
  heroBaseStats,
  heroPower,
  heroStats,
  statsPower,
  toBattleUnit,
  unitPower,
} from '../src/core/stats';
import { getHeroDef, HEROES } from '../src/data/heroes';
import type { HeroInstance, Stats } from '../src/core/types';

function hero(heroId: string, level = 1, stars = getHeroDef(heroId).rarity, equipment = {}): HeroInstance {
  return { uid: 'h1', heroId, level, stars, equipment, locked: false };
}

describe('heroBaseStats', () => {
  it('follows the SPEC formula for hp/atk/armor and spd', () => {
    const def = getHeroDef('batur');
    const s = heroBaseStats(def, 10, 3);
    const mult = (1 + LEVEL_GROWTH * 9) * STAR_MULT[3];
    expect(s.hp).toBe(Math.round(def.base.hp * mult));
    expect(s.atk).toBe(Math.round(def.base.atk * mult));
    expect(s.armor).toBe(Math.round(def.base.armor * mult));
    expect(s.spd).toBe(def.base.spd + SPD_PER_STAR * 2);
  });

  it('is exactly the base values at level 1, 1 star', () => {
    for (const def of HEROES) {
      const s = heroBaseStats(def, 1, 1);
      expect([s.hp, s.atk, s.armor, s.spd]).toEqual([def.base.hp, def.base.atk, def.base.armor, def.base.spd]);
    }
  });

  it('adds innate secondary stats', () => {
    const def = HEROES.find((h) => h.innate && Object.keys(h.innate).length > 0)!;
    const s = heroBaseStats(def, 5, 3);
    for (const [key, value] of Object.entries(def.innate!)) expect(s[key as keyof Stats]).toBeCloseTo(value as number);
  });

  it('grows with level and stars', () => {
    const def = getHeroDef('alevnur');
    expect(heroBaseStats(def, 2, 3).hp).toBeGreaterThan(heroBaseStats(def, 1, 3).hp);
    expect(heroBaseStats(def, 1, 4).hp).toBeGreaterThan(heroBaseStats(def, 1, 3).hp);
    expect(heroBaseStats(def, 1, 4).spd).toBeGreaterThan(heroBaseStats(def, 1, 3).spd);
    expect(heroBaseStats(def, 50, 3).spd).toBe(heroBaseStats(def, 1, 3).spd);
  });
});

describe('equipment & hero stats', () => {
  it('sums flat equipment bonuses and ignores unknown ids', () => {
    const total = equipmentStats({ weapon: 'weapon_t4', armor: 'armor_t1', helmet: 'nope' });
    expect(total).toEqual({ atk: 117, crit: 0.02, hp: 200, armor: 8 });
    expect(equipmentStats({})).toEqual({});
  });

  it('heroStats = base + equipment (no passive stats)', () => {
    const plain = heroStats(hero('batur', 5));
    const geared = heroStats(hero('batur', 5, 3, { weapon: 'weapon_t1', boots: 'boots_t2' }));
    expect(geared.atk - plain.atk).toBe(20);
    expect(geared.spd - plain.spd).toBe(5);
    expect(geared.hp - plain.hp).toBe(145);
    expect(plain).toEqual(heroBaseStats(getHeroDef('batur'), 5, 3));
  });

  it('toBattleUnit carries level, stars and heroStats', () => {
    const h = hero('kozhan', 12, 5, { armor: 'armor_t2' });
    expect(toBattleUnit(h)).toEqual({ heroId: 'kozhan', level: 12, stars: 5, stats: heroStats(h) });
  });
});

describe('power', () => {
  it('statsPower matches the SPEC formula', () => {
    const s: Stats = { ...emptyStats(), hp: 1000, atk: 100, armor: 50, spd: 100, crit: 0.1, critDmg: 0.2 };
    expect(statsPower(s)).toBe(Math.round(100 + 100 + 30 + 200 + 100 + 100));
    expect(statsPower(emptyStats())).toBe(0);
  });

  it('is monotonic in every stat', () => {
    const base: Stats = { ...emptyStats(), hp: 1000, atk: 100, armor: 30, spd: 100 };
    for (const key of Object.keys(base) as (keyof Stats)[]) {
      expect(statsPower({ ...base, [key]: base[key] + 10 })).toBeGreaterThan(statsPower(base));
    }
  });

  it('heroPower includes passive stats and grows with level, stars and gear', () => {
    const h = hero('demirkol', 10, 5);
    expect(heroPower(h)).toBe(unitPower(toBattleUnit(h)));
    expect(heroPower(h)).toBeGreaterThanOrEqual(statsPower(heroStats(h)));
    expect(heroPower(hero('demirkol', 11, 5))).toBeGreaterThan(heroPower(h));
    expect(heroPower(hero('batur', 10, 4))).toBeGreaterThan(heroPower(hero('batur', 10, 3)));
    expect(heroPower(hero('demirkol', 10, 5, { weapon: 'weapon_t1' }))).toBeGreaterThan(heroPower(h));
  });
});
