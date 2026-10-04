import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeIdleRewards, HOUR_MS } from '../src/core/campaign';
import { EXTRA_WARRIOR_WEIGHT } from '../src/core/formation';
import { Game } from '../src/core/game';
import { mergeRewards } from '../src/core/progression';
import { deserialize, newGameState, SAVE_KEY, serialize } from '../src/core/save';
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
const DAY = 24 * HOUR_MS;

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

  it('autoFormation picks the 6 strongest (extra warriors weighted down) with warriors in front', () => {
    const { game, notifications } = setup((s) => rich(s));
    expect(game.summon('heroic', 10).ok).toBe(true);
    game.autoFormation();
    const team = game.formationHeroes().filter((h) => h !== null);
    expect(team).toHaveLength(6);
    const isWarrior = (uid: string) => getHeroDef(game.hero(uid)!.heroId).heroClass === 'warrior';
    const byPower = game.sortedHeroes().map((h) => h.uid);
    const frontWarriors = byPower.filter(isWarrior).slice(0, 2);
    const value = (uid: string) =>
      game.heroPower(uid) * (isWarrior(uid) && !frontWarriors.includes(uid) ? EXTRA_WARRIOR_WEIGHT : 1);
    const strongest = byPower
      .map((uid, i) => ({ uid, i }))
      .sort((a, b) => value(b.uid) - value(a.uid) || a.i - b.i)
      .slice(0, 6)
      .map((x) => x.uid);
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

describe('idle chest and the clock', () => {
  it('clearing stages before collecting keeps the hours already earned at the old stage rate', () => {
    const { game, clock, storage } = setup((s) => {
      for (const h of s.heroes) {
        h.stars = 5;
        h.level = 100;
        h.equipment = { weapon: 'weapon_t6', armor: 'armor_t6', helmet: 'helmet_t6', boots: 'boots_t6' };
      }
      s.campaign.cleared = 20;
    });
    clock.t += 6 * HOUR_MS;
    const before = game.idlePreview();
    for (let i = 0; i < 10; i++) expect(game.fightCampaign().ok).toBe(true);
    expect(game.state.campaign.cleared).toBe(30);
    expect(game.idlePreview()).toEqual(before);
    expect(game.state.campaign.idleSince).toBe(START);

    // Hours after the wins pay at the new stage's rate.
    const wonAt = clock.t;
    clock.t += 2 * HOUR_MS;
    const afterWins = newGameState(wonAt);
    afterWins.campaign.cleared = 30;
    const expected = mergeRewards(before, computeIdleRewards(afterWins, clock.t));
    expect(game.idlePreview()).toEqual(expected);
    expect(Game.load({ storage, now: () => clock.t }).idlePreview()).toEqual(expected);

    const gold = game.state.resources.gold;
    expect(game.claimIdle()).toEqual(expected);
    expect(game.state.resources.gold).toBe(gold + expected.resources.gold!);
    expect(game.idlePreview().resources.gold).toBe(0);
  });

  it('a chest timer left in the future (device clock was ahead) restarts on load instead of freezing', () => {
    const storage = new MemoryStorage();
    const ahead = newGameState(START);
    ahead.campaign.idleSince = START + 30 * DAY;
    ahead.campaign.idlePaidUntil = START + 30 * DAY;
    storage.setItem(SAVE_KEY, serialize(ahead));
    const clock = { t: START };
    const game = Game.load({ storage, now: () => clock.t });
    expect(game.state.campaign.idleSince).toBe(START);
    expect(deserialize(storage.getItem(SAVE_KEY), START)!.campaign.idleSince).toBe(START);
    expect(game.saveProblem).toBeNull();
    clock.t += 3 * HOUR_MS;
    const expected = computeIdleRewards(newGameState(START), clock.t);
    expect(expected.resources.gold).toBeGreaterThan(0);
    expect(game.idlePreview()).toEqual(expected);
    expect(game.claimIdle()).toEqual(expected);
  });

  it('a clock corrected backwards while the game is open restarts the chest instead of freezing it', () => {
    const storage = new MemoryStorage();
    const clock = { t: START + 30 * DAY };
    const game = new Game(newGameState(START), { storage, now: () => clock.t });
    clock.t += 2 * HOUR_MS;
    game.claimIdle(); // collected while the device clock was 30 days ahead
    clock.t = START + HOUR_MS; // the clock gets fixed
    expect(game.idlePreview().resources.gold).toBe(0); // the live chest notices the jump...
    expect(deserialize(storage.getItem(SAVE_KEY), START)!.campaign.idleSince).toBe(START + HOUR_MS);
    clock.t += 3 * HOUR_MS; // ...and fills again from then on
    expect(game.idlePreview()).toEqual(computeIdleRewards(newGameState(START + HOUR_MS), clock.t));
    for (const days of [1, 7, 29]) {
      clock.t = START + days * DAY;
      game.claimIdle();
      clock.t += 3 * HOUR_MS;
      const expected = computeIdleRewards(newGameState(START + days * DAY), clock.t);
      expect(expected.resources.gold).toBeGreaterThan(0);
      expect(game.claimIdle()).toEqual(expected);
    }
  });
});

describe('several open instances (tabs) on one save', () => {
  it('a stale instance cannot overwrite newer progress (no undoing pulls from another tab)', () => {
    const storage = new MemoryStorage();
    const now = () => START;
    const tabA = Game.load({ storage, now });
    const tabB = Game.load({ storage, now });
    for (let i = 0; i < 4; i++) expect(tabA.summon('heroic', 1).ok).toBe(true);
    expect(tabA.state.resources.gems).toBe(600);

    let notified = 0;
    tabB.subscribe(() => notified++);
    const hero = tabB.state.heroes[0];
    tabB.toggleLock(hero.uid);
    expect(hero.locked).toBe(false);
    expect(tabB.saveProblem).toBe('conflict');
    expect(tabB.saveWarning()).toMatch(/başka bir sekmede/);
    expect(notified).toBe(1);
    const res = tabB.summon('heroic', 1);
    expect(res).toEqual({ ok: false, error: tabB.saveWarning() });
    expect(tabB.levelUp(hero.uid, 1).ok).toBe(false);
    expect(tabB.claimIdle()).toEqual({ resources: {} });
    tabB.save(); // e.g. pagehide of the old tab

    const reloaded = Game.load({ storage, now });
    expect(reloaded.state.heroes).toHaveLength(9);
    expect(reloaded.state.resources).toMatchObject({ gems: 600, heroicScroll: 0 });

    // The up-to-date instance keeps saving normally.
    expect(tabA.saveProblem).toBeNull();
    const uid = tabA.state.formation[0]!;
    expect(tabA.levelUp(uid, 2).ok).toBe(true);
    expect(Game.load({ storage, now }).hero(uid)!.level).toBe(3);
  });

  it('refreshSaveStatus notices another tab\'s save without an action, and notifies once', () => {
    const storage = new MemoryStorage();
    const now = () => START;
    const tabA = Game.load({ storage, now });
    const tabB = Game.load({ storage, now });
    let notified = 0;
    tabB.subscribe(() => notified++);
    expect(tabB.refreshSaveStatus()).toBeNull();
    expect(notified).toBe(0);

    expect(tabA.summon('heroic', 1).ok).toBe(true); // the other tab writes (a `storage` event in a browser)
    expect(tabB.refreshSaveStatus()).toBe('conflict');
    expect(notified).toBe(1);
    expect(tabB.refreshSaveStatus()).toBe('conflict');
    expect(notified).toBe(1);
    expect(tabA.refreshSaveStatus()).toBeNull();

    // A game without storage reports 'unavailable' and never turns stale.
    const offline = new Game(newGameState(START), { storage: null, now });
    expect(offline.refreshSaveStatus()).toBe('unavailable');
  });

  it('reset from a stale instance wins and makes the other instance stale', () => {
    const storage = new MemoryStorage();
    const now = () => START;
    const tabA = Game.load({ storage, now });
    const tabB = Game.load({ storage, now });
    expect(tabA.levelUp(tabA.state.formation[0]!, 5).ok).toBe(true);
    expect(tabB.levelUp(tabB.state.formation[0]!, 1).ok).toBe(false);
    tabB.reset();
    expect(tabB.saveProblem).toBeNull();
    expect(Game.load({ storage, now }).state.heroes.every((h) => h.level === 1)).toBe(true);
    expect(tabA.levelUp(tabA.state.formation[0]!, 1).ok).toBe(false);
    expect(tabA.saveProblem).toBe('conflict');
    expect(Game.load({ storage, now }).state.heroes.every((h) => h.level === 1)).toBe(true);
  });
});

describe('save failures', () => {
  it('reports when progress cannot be written, and recovers when storage works again', () => {
    const storage = new MemoryStorage();
    const write = storage.setItem.bind(storage);
    let full = true;
    storage.setItem = (key: string, value: string) => {
      if (full) throw new DOMException('quota', 'QuotaExceededError');
      write(key, value);
    };
    const game = Game.load({ storage, now: () => START });
    expect(game.saveProblem).toBeNull();
    expect(game.summon('heroic', 1).ok).toBe(true);
    expect(game.saveProblem).toBe('unavailable');
    expect(game.saveWarning()).toMatch(/Kayıt yapılamıyor/);
    full = false;
    expect(game.levelUp(game.state.formation[0]!, 1).ok).toBe(true);
    expect(game.saveProblem).toBeNull();
    expect(game.saveWarning()).toBeNull();
    expect(Game.load({ storage, now: () => START }).state.heroes).toHaveLength(6);
  });

  it('flags a game that has no storage at all', () => {
    const game = new Game(newGameState(START), { storage: null, now: () => START });
    expect(game.saveProblem).toBe('unavailable');
    expect(game.levelUp(game.state.formation[0]!, 1).ok).toBe(true);
    expect(game.saveProblem).toBe('unavailable');
  });
});
