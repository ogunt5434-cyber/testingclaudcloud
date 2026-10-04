import { describe, expect, it } from 'vitest';
import { GEMS_PER_HEROIC_PULL, GEMS_PER_HEROIC_TEN, HEROIC_PITY, MAX_HEROES } from '../src/core/constants';
import { Rng } from '../src/core/rng';
import { newGameState } from '../src/core/save';
import {
  createHero,
  heroSummonChance,
  SUMMON_RATES,
  summon,
  summonCostOptions,
  summonPool,
  type SummonType,
  UID_LIMIT,
} from '../src/core/summon';
import { getHeroDef, HEROES } from '../src/data/heroes';
import type { GameState } from '../src/core/types';

function richState(): GameState {
  const state = newGameState(0);
  state.resources.basicScroll = 1_000_000;
  state.resources.heroicScroll = 1_000_000;
  return state;
}

/** Rarity histogram of `pulls` single pulls (roster trimmed so the hero cap never interferes). */
function rarityHistogram(type: SummonType, pulls: number, seed: number): Record<number, number> {
  const state = richState();
  const rng = new Rng(seed);
  const counts: Record<number, number> = { 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let i = 0; i < pulls / 10; i++) {
    const res = summon(state, type, 10, rng);
    if (!res.ok) throw new Error(res.error);
    for (const h of res.value) counts[getHeroDef(h.heroId).rarity]++;
    state.heroes = state.heroes.slice(0, 5);
  }
  return counts;
}

describe('summon costs', () => {
  it('basic uses basic scrolls; heroic prefers scrolls, then gems', () => {
    expect(summonCostOptions('basic', 1)).toEqual([{ basicScroll: 1 }]);
    expect(summonCostOptions('basic', 10)).toEqual([{ basicScroll: 10 }]);
    expect(summonCostOptions('heroic', 1)).toEqual([{ heroicScroll: 1 }, { gems: GEMS_PER_HEROIC_PULL }]);
    expect(summonCostOptions('heroic', 10)).toEqual([{ heroicScroll: 10 }, { gems: GEMS_PER_HEROIC_TEN }]);
  });

  it('pays heroic scrolls first and falls back to gems', () => {
    const state = newGameState(0);
    state.resources.heroicScroll = 1;
    state.resources.gems = 400;
    const rng = new Rng(1);
    expect(summon(state, 'heroic', 1, rng).ok).toBe(true);
    expect(state.resources).toMatchObject({ heroicScroll: 0, gems: 400 });
    expect(summon(state, 'heroic', 1, rng).ok).toBe(true);
    expect(state.resources).toMatchObject({ heroicScroll: 0, gems: 100 });
  });

  it('fails without resources and changes nothing', () => {
    const state = newGameState(0);
    state.resources.basicScroll = 9;
    state.resources.heroicScroll = 0;
    state.resources.gems = GEMS_PER_HEROIC_TEN - 1;
    const before = JSON.stringify(state);
    expect(summon(state, 'basic', 10, new Rng(1)).ok).toBe(false);
    expect(summon(state, 'heroic', 10, new Rng(1)).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('respects the hero limit', () => {
    const state = richState();
    while (state.heroes.length < MAX_HEROES - 5) createHero(state, 'ninni');
    const before = JSON.stringify(state);
    const res = summon(state, 'basic', 10, new Rng(1));
    expect(res.ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
    expect(summon(state, 'basic', 1, new Rng(1)).ok).toBe(true);
    while (state.heroes.length < MAX_HEROES) createHero(state, 'ninni');
    expect(() => createHero(state, 'ninni')).toThrow();
  });
});

describe('createHero', () => {
  it('creates level-1 heroes at natural rarity with unique uids', () => {
    const state = newGameState(0);
    const next = state.nextUid;
    const a = createHero(state, 'kozhan');
    const b = createHero(state, 'kozhan', 3);
    expect(a).toMatchObject({ heroId: 'kozhan', level: 1, stars: 5, locked: false, equipment: {} });
    expect(b.stars).toBe(3);
    expect(a.uid).not.toBe(b.uid);
    expect(state.nextUid).toBe(next + 2);
    expect(new Set(state.heroes.map((h) => h.uid)).size).toBe(state.heroes.length);
  });

  it('skips uids that are already taken', () => {
    const state = newGameState(0);
    state.heroes[0].uid = `h${state.nextUid}`;
    const h = createHero(state, 'ninni');
    expect(state.heroes.filter((x) => x.uid === h.uid)).toHaveLength(1);
  });

  it('restarts a broken uid counter instead of stalling (counter must keep moving)', () => {
    const state = newGameState(0);
    for (const bad of [2 ** 53, 2 ** 53 + 2, 1e300, Number.NaN, Number.POSITIVE_INFINITY, -4, 2.5, UID_LIMIT]) {
      state.nextUid = bad;
      createHero(state, 'ninni');
      expect(Number.isSafeInteger(state.nextUid)).toBe(true);
      expect(state.nextUid).toBeLessThan(UID_LIMIT);
      createHero(state, 'ninni');
    }
    expect(new Set(state.heroes.map((h) => h.uid)).size).toBe(state.heroes.length);
  });

  it('throws on an unknown hero id', () => {
    expect(() => createHero(newGameState(0), 'nobody')).toThrow();
  });
});

describe('summon rates', () => {
  it.each(['basic', 'heroic'] as SummonType[])('%s rarities match SUMMON_RATES over 10k pulls', (type) => {
    const pulls = 10_000;
    const counts = rarityHistogram(type, pulls, type === 'basic' ? 11 : 22);
    for (const [rarity, p] of Object.entries(SUMMON_RATES[type])) {
      const expected = p * pulls;
      const sigma = Math.sqrt(pulls * p * (1 - p));
      expect(Math.abs(counts[Number(rarity)] - expected)).toBeLessThan(4 * sigma + 3);
    }
    if (type === 'heroic') expect(counts[2]).toBe(0);
  });

  it('gives light/dark 5★ heroes half the weight', () => {
    const pool = new Map(summonPool(5));
    expect(pool.size).toBe(HEROES.filter((h) => h.rarity === 5).length);
    for (const [id, weight] of pool) {
      const { faction } = getHeroDef(id);
      expect(weight).toBe(faction === 'light' || faction === 'dark' ? 0.5 : 1);
    }
    expect(heroSummonChance('heroic', 'tanyeri') * 2).toBeCloseTo(heroSummonChance('heroic', 'kozhan'));
    const total = HEROES.reduce((sum, h) => sum + heroSummonChance('heroic', h.id), 0);
    expect(total).toBeCloseTo(1);
  });

  it('light/dark 5★ heroes drop about half as often in practice', () => {
    const rng = new Rng(5);
    const counts = new Map<string, number>();
    for (let i = 0; i < 20_000; i++) {
      const id = rng.weighted(summonPool(5));
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const lightDark = ['yildizhan', 'tanyeri', 'kefen', 'kemikkiran'].map((id) => counts.get(id) ?? 0);
    const others = ['aycalan', 'kozhan', 'dikenok', 'demirkol'].map((id) => counts.get(id) ?? 0);
    const ratio = lightDark.reduce((a, b) => a + b) / others.reduce((a, b) => a + b);
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });
});

describe('heroic pity', () => {
  it('guarantees a 5★ on the HEROIC_PITY-th pull without one', () => {
    const state = richState();
    state.summon.heroicPity = HEROIC_PITY - 1;
    const res = summon(state, 'heroic', 1, new Rng(1));
    expect(res.ok && getHeroDef(res.value[0].heroId).rarity).toBe(5);
    expect(state.summon.heroicPity).toBe(0);
  });

  it('counts heroic pulls since the last 5★ and never exceeds the limit', () => {
    const state = richState();
    const rng = new Rng(77);
    let sinceFive = 0;
    for (let i = 0; i < 300; i++) {
      const res = summon(state, 'heroic', 10, rng);
      if (!res.ok) throw new Error(res.error);
      for (const h of res.value) {
        sinceFive = getHeroDef(h.heroId).rarity === 5 ? 0 : sinceFive + 1;
        expect(sinceFive).toBeLessThan(HEROIC_PITY);
      }
      expect(state.summon.heroicPity).toBe(sinceFive);
      state.heroes = state.heroes.slice(0, 5);
    }
  });

  it('basic pulls do not touch heroic pity; totalPulls counts everything', () => {
    const state = richState();
    state.summon.heroicPity = 7;
    summon(state, 'basic', 10, new Rng(3));
    expect(state.summon.heroicPity).toBe(7);
    expect(state.summon.totalPulls).toBe(10);
  });
});
