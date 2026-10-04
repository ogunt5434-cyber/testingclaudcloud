import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeIdleRewards, HOUR_MS } from '../src/core/campaign';
import { Game } from '../src/core/game';
import { deserialize, newGameState, SAVE_KEY } from '../src/core/save';
import { heroPower } from '../src/core/stats';
import { getHeroDef } from '../src/data/heroes';
import type { GameState } from '../src/core/types';

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

const START = 1_700_000_000_000;

interface Harness {
  game: Game;
  storage: MemoryStorage;
  clock: { t: number };
  notifications: () => number;
  saved: () => GameState | null;
}

function setup(mutate?: (state: GameState) => void): Harness {
  const storage = new MemoryStorage();
  const clock = { t: START };
  const state = newGameState(START);
  mutate?.(state);
  const game = new Game(state, { storage, now: () => clock.t });
  let count = 0;
  game.subscribe(() => count++);
  return {
    game,
    storage,
    clock,
    notifications: () => count,
    saved: () => deserialize(storage.getItem(SAVE_KEY), START),
  };
}

function rich(state: GameState): void {
  state.resources = { gold: 1e9, spirit: 1e9, gems: 1e6, basicScroll: 100, heroicScroll: 100 };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Game basics', () => {
  it('exposes the state, clock and queries', () => {
    const { game, clock } = setup();
    expect(game.state.heroes).toHaveLength(5);
    expect(game.now()).toBe(START);
    clock.t += 5;
    expect(game.now()).toBe(START + 5);
    const uid = game.state.formation[0]!;
    expect(game.hero(uid)?.heroId).toBe('batur');
    expect(game.heroStats(uid).hp).toBeGreaterThan(0);
    expect(game.heroStats('missing').hp).toBe(0);
    expect(game.heroPower('missing')).toBe(0);
    expect(game.formationHeroes().map((h) => h?.heroId ?? null)).toEqual([
      'batur', 'arslan', 'barutcu', 'cakmak', 'alevnur', null,
    ]);
    expect(game.teamPower()).toBe(game.state.heroes.reduce((s, h) => s + heroPower(h), 0));
    const sorted = game.sortedHeroes().map((h) => heroPower(h));
    expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
  });

  it('subscribe returns an unsubscribe function and survives throwing listeners', () => {
    const { game } = setup();
    const calls: string[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    game.subscribe(() => {
      throw new Error('boom');
    });
    const off = game.subscribe(() => calls.push('a'));
    game.toggleLock(game.state.heroes[0].uid);
    off();
    game.toggleLock(game.state.heroes[0].uid);
    expect(calls).toEqual(['a']);
  });

  it('loads from storage, or starts a new game', () => {
    const storage = new MemoryStorage();
    const first = Game.load({ storage, now: () => START });
    expect(first.state.heroes).toHaveLength(5);
    first.levelUp(first.state.formation[0]!, 3);
    const second = Game.load({ storage, now: () => START + 1000 });
    expect(second.state.heroes.find((h) => h.uid === first.state.formation[0])!.level).toBe(4);
  });

  it('works without localStorage', () => {
    vi.stubGlobal('localStorage', undefined);
    const game = Game.load({ now: () => START });
    expect(game.levelUp(game.state.formation[0]!, 1).ok).toBe(true);
  });

  it('works when touching localStorage throws (e.g. blocked storage)', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      const game = Game.load({ now: () => START });
      expect(game.levelUp(game.state.formation[0]!, 1).ok).toBe(true);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });

  it('uses localStorage by default when available', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const game = Game.load({ now: () => START });
    game.toggleLock(game.state.heroes[0].uid);
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
  });
});

describe('Game actions save and notify', () => {
  it('claimIdle adds idle rewards, resets the timer, saves and notifies', () => {
    const { game, clock, notifications, saved } = setup();
    clock.t += 2 * HOUR_MS;
    const preview = game.idlePreview();
    expect(preview).toEqual(computeIdleRewards(game.state as GameState, clock.t));
    const gold = game.state.resources.gold;
    const rewards = game.claimIdle();
    expect(rewards).toEqual(preview);
    expect(game.state.resources.gold).toBe(gold + rewards.resources.gold!);
    expect(game.state.campaign.idleSince).toBe(clock.t);
    expect(notifications()).toBe(1);
    expect(saved()!.resources.gold).toBe(game.state.resources.gold);
    expect(saved()!.lastSeen).toBe(clock.t);
  });

  it('setFormation validates and applies', () => {
    const { game, notifications } = setup();
    const [a, b] = game.state.heroes.map((h) => h.uid);
    for (const bad of [[a], [a, a, null, null, null, null], ['ghost', null, null, null, null, null], Array(6).fill(null)]) {
      const res = game.setFormation(bad);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/[a-zçğıöşü]/i);
    }
    expect(notifications()).toBe(0);
    expect(game.setFormation([b, null, null, a, null, null])).toEqual({ ok: true, value: undefined });
    expect(game.state.formation).toEqual([b, null, null, a, null, null]);
    expect(notifications()).toBe(1);
  });

  it('autoFormation picks the 6 strongest with warriors in front', () => {
    const { game, notifications } = setup((s) => rich(s));
    expect(game.summon('heroic', 10).ok).toBe(true);
    game.autoFormation();
    const team = game.formationHeroes().filter((h) => h !== null);
    expect(team).toHaveLength(6);
    const strongest = game.sortedHeroes().slice(0, 6).map((h) => h.uid);
    expect(new Set(team.map((h) => h!.uid))).toEqual(new Set(strongest));
    const front = game.formationHeroes().slice(0, 2);
    const warriorsInTeam = team.filter((h) => getHeroDef(h!.heroId).heroClass === 'warrior').length;
    const warriorsInFront = front.filter((h) => getHeroDef(h!.heroId).heroClass === 'warrior').length;
    expect(warriorsInFront).toBe(Math.min(2, warriorsInTeam));
    expect(notifications()).toBe(2);
  });

  it('fightCampaign: a win grants first-clear rewards and advances without touching the idle timer', () => {
    const { game, notifications, saved } = setup();
    const res = game.fightCampaign();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.level).toBe(1);
    expect(res.value.result.winner).toBe('attacker');
    expect(res.value.rewards?.resources.gold).toBeGreaterThan(0);
    expect(game.state.campaign.cleared).toBe(1);
    expect(game.state.campaign.idleSince).toBe(START);
    expect(notifications()).toBe(1);
    expect(saved()!.campaign.cleared).toBe(1);
  });

  it('fightCampaign: a loss gives no rewards and retries use different seeds', () => {
    const { game } = setup((s) => (s.campaign.cleared = 300));
    const first = game.fightCampaign();
    const second = game.fightCampaign();
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.rewards).toBeNull();
    expect(first.value.level).toBe(301);
    expect(game.state.campaign.cleared).toBe(300);
    expect(JSON.stringify(first.value.result.events)).not.toBe(JSON.stringify(second.value.result.events));
  });

  it('fights fail with an empty formation', () => {
    const { game } = setup((s) => (s.formation = [null, null, null, null, null, null]));
    expect(game.fightCampaign().ok).toBe(false);
    expect(game.fightTower().ok).toBe(false);
  });

  it('fightTower advances the tower on a win', () => {
    const { game } = setup((s) => rich(s));
    for (const uid of game.state.formation) if (uid) game.levelUp(uid, 30);
    const res = game.fightTower();
    expect(res.ok && res.value.level).toBe(1);
    if (!res.ok) return;
    expect(res.value.result.winner).toBe('attacker');
    expect(res.value.rewards?.resources.gems).toBeGreaterThan(0);
    expect(game.state.tower.cleared).toBe(1);
  });

  it('summon adds heroes and only notifies on success', () => {
    const { game, notifications, saved } = setup();
    const res = game.summon('basic', 10);
    expect(res.ok && res.value).toHaveLength(10);
    expect(game.state.heroes).toHaveLength(15);
    expect(notifications()).toBe(1);
    expect(saved()!.heroes).toHaveLength(15);
    const fail = game.summon('basic', 10);
    expect(fail.ok).toBe(false);
    expect(notifications()).toBe(1);
  });

  it('summons differ between calls at the same timestamp', () => {
    const { game } = setup((s) => rich(s));
    const a = game.summon('heroic', 10);
    const b = game.summon('heroic', 10);
    if (!a.ok || !b.ok) throw new Error('summon failed');
    expect(a.value.map((h) => h.heroId)).not.toEqual(b.value.map((h) => h.heroId));
  });

  it('levelUp / starUp / dismiss / equipBest / unequip / toggleLock persist and notify', () => {
    const { game, notifications, saved } = setup((s) => {
      rich(s);
      s.equipment = { weapon_t2: 1 };
    });
    const uid = game.state.formation[0]!;
    expect(game.levelUp(uid, 5).ok).toBe(true);
    expect(saved()!.heroes.find((h) => h.uid === uid)!.level).toBe(6);

    expect(game.equipBest(uid)).toEqual({ ok: true, value: { changed: 1 } });
    expect(game.equipBest(uid).ok).toBe(false);
    expect(game.unequip(uid, 'weapon').ok).toBe(true);
    expect(game.equip(uid, 'weapon_t2').ok).toBe(true);
    expect(saved()!.heroes.find((h) => h.uid === uid)!.equipment.weapon).toBe('weapon_t2');

    game.toggleLock(uid);
    expect(saved()!.heroes.find((h) => h.uid === uid)!.locked).toBe(true);
    game.toggleLock('missing');

    const before = notifications();
    expect(game.dismiss(uid).ok).toBe(false); // in formation & locked
    expect(game.starUp(uid).ok).toBe(false); // not at level cap
    expect(notifications()).toBe(before);
    expect(notifications()).toBe(5); // levelUp, equipBest, unequip, equip, toggleLock
  });

  it('starUp auto-picks fodder; dismiss removes a bench hero', () => {
    const { game } = setup((s) => {
      rich(s);
      s.heroes.push(
        { uid: 'f1', heroId: 'arslan', level: 5, stars: 2, equipment: {}, locked: false },
        { uid: 'f2', heroId: 'arslan', level: 1, stars: 2, equipment: {}, locked: false },
        { uid: 'f3', heroId: 'arslan', level: 1, stars: 2, equipment: {}, locked: false },
      );
    });
    const arslan = game.formationHeroes()[1]!;
    game.levelUp(arslan.uid, 100);
    expect(game.starUp(arslan.uid).ok).toBe(true);
    expect(game.hero(arslan.uid)!.stars).toBe(3);
    expect(game.state.heroes.map((h) => h.uid)).toContain('f1'); // highest-level fodder kept
    const res = game.dismiss('f1');
    expect(res.ok && res.value.resources.gold).toBeGreaterThan(0);
    expect(game.hero('f1')).toBeUndefined();
  });

  it('reset wipes the save and starts over', () => {
    const { game, storage, notifications } = setup();
    game.fightCampaign();
    const oldState = game.state;
    game.reset();
    expect(game.state).not.toBe(oldState);
    expect(game.state.campaign.cleared).toBe(0);
    expect(deserialize(storage.getItem(SAVE_KEY), START)!.campaign.cleared).toBe(0);
    expect(notifications()).toBe(2);
  });

  it('setPlayerName validates, normalises whitespace, saves and notifies', () => {
    const { game, notifications, saved } = setup();
    expect(game.setPlayerName('  Kara   Şahin ')).toEqual({ ok: true, value: undefined });
    expect(game.state.player.name).toBe('Kara Şahin');
    expect(saved()!.player.name).toBe('Kara Şahin');
    expect(notifications()).toBe(1);

    for (const bad of ['', ' x ', 'Ç'.repeat(17)]) {
      const res = game.setPlayerName(bad);
      expect(res.ok).toBe(false);
      expect(!res.ok && res.error).toMatch(/karakter/);
    }
    expect(game.state.player.name).toBe('Kara Şahin');
    expect(notifications()).toBe(1);
  });
});
