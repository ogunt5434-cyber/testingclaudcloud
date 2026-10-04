import { describe, expect, it } from 'vitest';
import { HEROIC_PITY, LEVEL_CAP, TEAM_SIZE } from '../src/core/constants';
import { Rng } from '../src/core/rng';
import {
  deserialize,
  loadGame,
  newGameState,
  SAVE_KEY,
  SAVE_VERSION,
  saveGame,
  serialize,
  STARTING_RESOURCES,
} from '../src/core/save';
import { getHeroDef } from '../src/data/heroes';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

/** Storage whose every method throws, like Safari private mode or a disabled storage. */
const throwingStorage = new Proxy({} as Storage, {
  get() {
    throw new Error('storage disabled');
  },
});

const NOW = 1_700_000_000_000;

function mutated(fn: (raw: Record<string, unknown>) => void): string {
  const raw = JSON.parse(serialize(newGameState(NOW)));
  fn(raw);
  return JSON.stringify(raw);
}

describe('newGameState', () => {
  const state = newGameState(NOW);

  it('starts with the starter heroes in formation (tanks in front)', () => {
    expect(state.heroes).toHaveLength(5);
    const formationIds = state.formation.map((uid) => state.heroes.find((h) => h.uid === uid)?.heroId ?? null);
    expect(formationIds).toEqual(['batur', 'arslan', 'barutcu', 'cakmak', 'alevnur', null]);
    expect(formationIds.slice(0, 2).every((id) => getHeroDef(id!).heroClass === 'warrior')).toBe(true);
    expect(state.heroes.some((h) => getHeroDef(h.heroId).heroClass === 'priest')).toBe(true);
    for (const h of state.heroes) {
      expect(h.level).toBe(1);
      expect(h.stars).toBe(getHeroDef(h.heroId).rarity);
    }
    expect(new Set(state.heroes.map((h) => h.stars))).toEqual(new Set([2, 3]));
  });

  it('has the SPEC starting resources and timers', () => {
    expect(state.resources).toEqual({ gold: 20000, spirit: 8000, gems: 900, basicScroll: 10, heroicScroll: 3 });
    expect(state.campaign).toEqual({ cleared: 0, idleSince: NOW });
    expect(state.tower).toEqual({ cleared: 0 });
    expect(state.summon).toEqual({ heroicPity: 0, totalPulls: 0 });
    expect(state.player).toMatchObject({ level: 1, exp: 0 });
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.createdAt).toBe(NOW);
    expect(state.heroes.every((h) => Number(h.uid.slice(1)) < state.nextUid)).toBe(true);
  });
});

describe('serialize / deserialize', () => {
  it('round-trips a state exactly', () => {
    const state = newGameState(NOW);
    state.heroes[0].equipment = { weapon: 'weapon_t3' };
    state.heroes[1].locked = true;
    state.equipment = { boots_t2: 3 };
    state.campaign.cleared = 42;
    state.tower.cleared = 7;
    state.summon = { heroicPity: 12, totalPulls: 99 };
    state.player = { name: 'Ayşe', level: 9, exp: 120 };
    expect(deserialize(serialize(state), 0)).toEqual(state);
  });

  it.each([null, '', 'not json', '42', '"text"', 'null', '[]', '{}', '{"heroes":"x"}', '{"heroes":[{"uid":1}]}'])(
    'returns null for corrupt input %s',
    (raw) => {
      expect(deserialize(raw as string | null, NOW)).toBeNull();
    },
  );

  it('fills missing fields with safe defaults', () => {
    const raw = mutated((r) => {
      delete r.resources;
      delete r.campaign;
      delete r.tower;
      delete r.summon;
      delete r.player;
      delete r.equipment;
      delete r.createdAt;
      delete r.nextUid;
    });
    const state = deserialize(raw, NOW)!;
    expect(state.resources).toEqual({ gold: 0, spirit: 0, gems: 0, basicScroll: 0, heroicScroll: 0 });
    expect(state.campaign).toEqual({ cleared: 0, idleSince: NOW });
    expect(state.tower).toEqual({ cleared: 0 });
    expect(state.summon).toEqual({ heroicPity: 0, totalPulls: 0 });
    expect(state.player).toEqual({ name: 'Kahraman', level: 1, exp: 0 });
    expect(state.equipment).toEqual({});
    expect(state.createdAt).toBe(NOW);
    expect(state.nextUid).toBeGreaterThan(Math.max(...state.heroes.map((h) => Number(h.uid.slice(1)))));
  });

  it('sanitizes invalid values', () => {
    const raw = mutated((r) => {
      const heroes = r.heroes as Record<string, unknown>[];
      heroes[0].level = 999;
      heroes[0].equipment = { weapon: 'armor_t1', armor: 'armor_t2', boots: 'nope' };
      heroes[1].stars = 42;
      heroes.push({ uid: heroes[2].uid, heroId: 'batur', level: 1, stars: 3 }); // duplicate uid
      heroes.push({ uid: 'x1', heroId: 'unknown_hero', level: 1, stars: 3 });
      (heroes as unknown[]).push('garbage');
      r.resources = { gold: -50, spirit: 'lots', gems: 12.9, basicScroll: Infinity, heroicScroll: 2 };
      r.equipment = { weapon_t1: 2, fake: 3, helmet_t2: -1 };
      r.summon = { heroicPity: 10_000, totalPulls: -3 };
      r.player = { name: '   ', level: 0, exp: -1 };
    });
    const state = deserialize(raw, NOW)!;
    expect(state.heroes).toHaveLength(5);
    expect(state.heroes[0].level).toBe(LEVEL_CAP[state.heroes[0].stars]);
    expect(state.heroes[0].equipment).toEqual({ armor: 'armor_t2' });
    expect(state.heroes[1].stars).toBe(5);
    expect(state.resources).toEqual({ gold: 0, spirit: 0, gems: 12, basicScroll: 0, heroicScroll: 2 });
    expect(state.equipment).toEqual({ weapon_t1: 2 });
    expect(state.summon).toEqual({ heroicPity: HEROIC_PITY - 1, totalPulls: 0 });
    expect(state.player).toEqual({ name: 'Kahraman', level: 1, exp: 0 });
  });

  it('repairs the formation', () => {
    const dupes = mutated((r) => {
      const f = r.formation as (string | null)[];
      r.formation = [f[0], f[0], 'ghost', null, 7, f[4]];
    });
    const state = deserialize(dupes, NOW)!;
    expect(state.formation).toHaveLength(TEAM_SIZE);
    expect(state.formation.filter((x) => x !== null)).toHaveLength(2);
    const empty = deserialize(mutated((r) => (r.formation = 'nope')), NOW)!;
    expect(empty.formation.filter((x) => x !== null)).toHaveLength(5);
  });

  it('never throws on random garbage', () => {
    const rng = new Rng(9);
    const junk = (depth: number): unknown => {
      const kind = rng.int(0, depth > 2 ? 4 : 6);
      if (kind === 0) return rng.int(-5, 5) * 1e6 * rng.next();
      if (kind === 1) return rng.pick(['', 'h1', 'batur', 'weapon_t1', 'x']);
      if (kind === 2) return rng.chance(0.5);
      if (kind === 3) return null;
      if (kind === 4) return undefined;
      if (kind === 5) return Array.from({ length: rng.int(0, 6) }, () => junk(depth + 1));
      const keys = ['heroes', 'formation', 'resources', 'uid', 'heroId', 'level', 'stars', 'equipment', 'campaign'];
      return Object.fromEntries(keys.filter(() => rng.chance(0.5)).map((k) => [k, junk(depth + 1)]));
    };
    const base = JSON.parse(serialize(newGameState(NOW)));
    for (let i = 0; i < 500; i++) {
      const candidate = rng.chance(0.5) ? junk(0) : { ...base, [rng.pick(Object.keys(base))]: junk(1) };
      const raw = JSON.stringify(candidate) ?? 'undefined';
      expect(() => deserialize(raw, NOW)).not.toThrow();
      const state = deserialize(raw, NOW);
      if (state) expect(deserialize(serialize(state), NOW)).toEqual(state);
    }
  });
});

describe('storage', () => {
  it('saves and loads through Storage', () => {
    const storage = new MemoryStorage();
    const state = newGameState(NOW);
    state.campaign.cleared = 5;
    saveGame(storage, state);
    expect(storage.getItem(SAVE_KEY)).toBe(serialize(state));
    expect(loadGame(storage, NOW + 1)).toEqual(state);
  });

  it('creates a new game when storage is null, empty, corrupt or throwing', () => {
    const fresh = newGameState(NOW);
    expect(loadGame(null, NOW)).toEqual(fresh);
    expect(loadGame(new MemoryStorage(), NOW)).toEqual(fresh);
    const corrupt = new MemoryStorage();
    corrupt.setItem(SAVE_KEY, '{broken');
    expect(loadGame(corrupt, NOW)).toEqual(fresh);
    expect(loadGame(throwingStorage, NOW)).toEqual(fresh);
  });

  it('saveGame never throws', () => {
    const state = newGameState(NOW);
    expect(() => saveGame(null, state)).not.toThrow();
    expect(() => saveGame(throwingStorage, state)).not.toThrow();
    const full = new MemoryStorage();
    full.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => saveGame(full, state)).not.toThrow();
  });

  it('keeps starting resources separate from saves', () => {
    const state = newGameState(NOW);
    state.resources.gold = 1;
    expect(STARTING_RESOURCES.gold).toBe(20000);
    expect(newGameState(NOW).resources.gold).toBe(20000);
  });
});
