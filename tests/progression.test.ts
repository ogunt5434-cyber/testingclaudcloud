import { describe, expect, it } from 'vitest';
import { LEVEL_CAP, MAX_STARS, STAR_UP_FODDER } from '../src/core/constants';
import {
  addRewards,
  canAfford,
  dismissHero,
  dismissRewards,
  equipBest,
  equipItem,
  findStarUpFodder,
  levelCap,
  levelRangeCost,
  levelUpCost,
  levelUpHero,
  playerExpToNext,
  playerLevelGems,
  spend,
  starUpHero,
  starUpRequirement,
  unequip,
} from '../src/core/progression';
import { newGameState } from '../src/core/save';
import { createHero } from '../src/core/summon';
import type { GameState, HeroInstance } from '../src/core/types';

function freshState(): GameState {
  const state = newGameState(0);
  state.resources.gold = 1_000_000;
  state.resources.spirit = 1_000_000;
  return state;
}

/** A bench (non-formation) hero. */
function benchHero(state: GameState, heroId: string, stars?: number, level = 1): HeroInstance {
  const h = createHero(state, heroId, stars);
  h.level = level;
  return h;
}

const snapshot = (state: GameState) => JSON.parse(JSON.stringify(state));

describe('level costs', () => {
  it('has the SPEC level caps', () => {
    for (let s = 1; s <= MAX_STARS; s++) expect(levelCap(s)).toBe(LEVEL_CAP[s]);
  });

  it('is cheap early and grows ~level^1.6', () => {
    expect(levelUpCost(1)).toEqual({ gold: 100, spirit: 60 });
    expect(levelUpCost(10).gold / levelUpCost(1).gold).toBeCloseTo(Math.pow(10, 1.6), 0);
    for (let l = 1; l < 100; l++) expect(levelUpCost(l + 1).gold).toBeGreaterThan(levelUpCost(l).gold);
  });

  it('levelRangeCost sums single steps', () => {
    expect(levelRangeCost(5, 5)).toEqual({ gold: 0, spirit: 0 });
    const a = levelUpCost(3);
    const b = levelUpCost(4);
    expect(levelRangeCost(3, 5)).toEqual({ gold: a.gold + b.gold, spirit: a.spirit + b.spirit });
  });
});

describe('levelUpHero', () => {
  it('levels up and pays the exact cost', () => {
    const state = freshState();
    const uid = state.formation[0]!;
    const before = { ...state.resources };
    const res = levelUpHero(state, uid, 10);
    expect(res).toEqual({ ok: true, value: { gained: 10 } });
    const cost = levelRangeCost(1, 11);
    expect(state.resources.gold).toBe(before.gold - cost.gold);
    expect(state.resources.spirit).toBe(before.spirit - cost.spirit);
    expect(state.heroes.find((h) => h.uid === uid)!.level).toBe(11);
  });

  it('stops at the level cap', () => {
    const state = freshState();
    const hero = state.heroes.find((h) => h.stars === 2)!;
    const res = levelUpHero(state, hero.uid, 1000);
    expect(res.ok && res.value.gained).toBe(LEVEL_CAP[2] - 1);
    expect(hero.level).toBe(LEVEL_CAP[2]);
    const again = levelUpHero(state, hero.uid, 1);
    expect(again.ok).toBe(false);
  });

  it('gains only what is affordable', () => {
    const state = newGameState(0);
    state.resources.gold = levelRangeCost(1, 4).gold + 1;
    const uid = state.formation[0]!;
    expect(levelUpHero(state, uid, 10)).toEqual({ ok: true, value: { gained: 3 } });
  });

  it('fails atomically with Turkish errors', () => {
    const state = newGameState(0);
    state.resources.gold = 0;
    const before = snapshot(state);
    for (const res of [
      levelUpHero(state, state.formation[0]!, 1),
      levelUpHero(state, 'missing', 1),
      levelUpHero(state, state.formation[0]!, 0),
    ]) {
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.length).toBeGreaterThan(5);
    }
    expect(state).toEqual(before);
  });
});

describe('star up', () => {
  it('reports requirements', () => {
    const state = freshState();
    const hero = benchHero(state, 'batur', 3);
    expect(starUpRequirement(hero)).toEqual({ fodderCount: STAR_UP_FODDER[3], levelRequired: LEVEL_CAP[3] });
    expect(starUpRequirement({ ...hero, stars: MAX_STARS })).toBeNull();
  });

  it('finds valid fodder only, lowest level first', () => {
    const state = freshState();
    const target = benchHero(state, 'tilki', 2, 40);
    const high = benchHero(state, 'tilki', 2, 9);
    const low = benchHero(state, 'tilki', 2, 3);
    benchHero(state, 'tilki', 3); // different stars
    benchHero(state, 'ninni', 2); // different hero
    benchHero(state, 'tilki', 2).locked = true; // locked
    const inTeam = benchHero(state, 'tilki', 2);
    state.formation[5] = inTeam.uid; // in formation
    expect(findStarUpFodder(state, target.uid)).toEqual([low.uid, high.uid]);
  });

  it('consumes fodder, refunds its levels, returns its gear and adds a star', () => {
    const state = freshState();
    const target = benchHero(state, 'tilki', 2, 40);
    const f1 = benchHero(state, 'tilki', 2, 12);
    const f2 = benchHero(state, 'tilki', 2, 1);
    f1.equipment = { weapon: 'weapon_t2' };
    const gold = state.resources.gold;
    const spirit = state.resources.spirit;
    expect(starUpHero(state, target.uid)).toEqual({ ok: true, value: undefined });
    expect(target.stars).toBe(3);
    expect(target.level).toBe(40);
    expect(state.heroes.some((h) => h.uid === f1.uid || h.uid === f2.uid)).toBe(false);
    const refund = levelRangeCost(1, 12);
    expect(state.resources.gold).toBe(gold + refund.gold);
    expect(state.resources.spirit).toBe(spirit + refund.spirit);
    expect(state.equipment.weapon_t2).toBe(1);
  });

  it('fails atomically below the level cap', () => {
    const state = freshState();
    const target = benchHero(state, 'tilki', 2, 39);
    benchHero(state, 'tilki', 2);
    benchHero(state, 'tilki', 2);
    const before = snapshot(state);
    expect(starUpHero(state, target.uid).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('fails atomically when short of fodder', () => {
    const state = freshState();
    const target = benchHero(state, 'tilki', 2, 40);
    benchHero(state, 'tilki', 2);
    const before = snapshot(state);
    const res = starUpHero(state, target.uid);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('Tilki');
    expect(state).toEqual(before);
  });

  it('validates explicitly chosen fodder', () => {
    const state = freshState();
    const target = benchHero(state, 'tilki', 2, 40);
    const a = benchHero(state, 'tilki', 2);
    const b = benchHero(state, 'tilki', 2);
    const wrong = benchHero(state, 'ninni', 2);
    const before = snapshot(state);
    expect(starUpHero(state, target.uid, [a.uid, wrong.uid]).ok).toBe(false);
    expect(starUpHero(state, target.uid, [a.uid, a.uid]).ok).toBe(false);
    expect(starUpHero(state, target.uid, [a.uid]).ok).toBe(false);
    expect(state).toEqual(before);
    expect(starUpHero(state, target.uid, [b.uid, a.uid]).ok).toBe(true);
  });

  it('cannot go past max stars', () => {
    const state = freshState();
    const hero = benchHero(state, 'kozhan', 5, 100);
    expect(starUpHero(state, hero.uid).ok).toBe(false);
  });
});

describe('dismiss', () => {
  it('refunds level costs plus a star-based reward and returns gear', () => {
    const state = freshState();
    const hero = benchHero(state, 'batur', 3, 10);
    hero.equipment = { armor: 'armor_t1' };
    const rewards = dismissRewards(hero);
    const refund = levelRangeCost(1, 10);
    expect(rewards.resources.gold!).toBeGreaterThan(refund.gold);
    expect(rewards.resources.spirit!).toBeGreaterThan(refund.spirit);
    expect(rewards.equipment).toEqual({ armor_t1: 1 });
    expect(dismissRewards({ ...hero, level: 1, stars: 5, equipment: {} }).resources.spirit!).toBeGreaterThan(
      dismissRewards({ ...hero, level: 1, stars: 2, equipment: {} }).resources.spirit!,
    );

    const gold = state.resources.gold;
    const res = dismissHero(state, hero.uid);
    expect(res).toEqual({ ok: true, value: rewards });
    expect(state.heroes.some((h) => h.uid === hero.uid)).toBe(false);
    expect(state.resources.gold).toBe(gold + rewards.resources.gold!);
    expect(state.equipment.armor_t1).toBe(1);
  });

  it('refuses locked, formation and last heroes without changing anything', () => {
    const state = freshState();
    const locked = benchHero(state, 'batur');
    locked.locked = true;
    const before = snapshot(state);
    expect(dismissHero(state, locked.uid).ok).toBe(false);
    expect(dismissHero(state, state.formation[0]!).ok).toBe(false);
    expect(dismissHero(state, 'missing').ok).toBe(false);
    expect(state).toEqual(before);

    const solo = newGameState(0);
    solo.heroes = solo.heroes.slice(0, 1);
    solo.formation = [null, null, null, null, null, null];
    expect(dismissHero(solo, solo.heroes[0].uid).ok).toBe(false);
  });
});

describe('equipment', () => {
  it('equips from stock and swaps the old item back', () => {
    const state = freshState();
    const uid = state.formation[0]!;
    state.equipment = { weapon_t1: 1, weapon_t2: 1 };
    expect(equipItem(state, uid, 'weapon_t1').ok).toBe(true);
    expect(state.equipment).toEqual({ weapon_t2: 1 });
    expect(equipItem(state, uid, 'weapon_t2').ok).toBe(true);
    expect(state.equipment).toEqual({ weapon_t1: 1 });
    expect(state.heroes.find((h) => h.uid === uid)!.equipment.weapon).toBe('weapon_t2');
  });

  it('rejects missing stock, unknown items and re-equipping', () => {
    const state = freshState();
    const uid = state.formation[0]!;
    state.equipment = { boots_t1: 1 };
    equipItem(state, uid, 'boots_t1');
    const before = snapshot(state);
    expect(equipItem(state, uid, 'boots_t3').ok).toBe(false);
    expect(equipItem(state, uid, 'laser_t9').ok).toBe(false);
    expect(equipItem(state, 'missing', 'boots_t1').ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('unequips to stock', () => {
    const state = freshState();
    const uid = state.formation[0]!;
    state.equipment = { helmet_t3: 1 };
    equipItem(state, uid, 'helmet_t3');
    expect(unequip(state, uid, 'helmet').ok).toBe(true);
    expect(state.equipment).toEqual({ helmet_t3: 1 });
    expect(unequip(state, uid, 'helmet').ok).toBe(false);
  });

  it('equipBest picks the highest tier per slot and errors when nothing improves', () => {
    const state = freshState();
    const uid = state.formation[0]!;
    state.equipment = { weapon_t1: 2, weapon_t3: 1, armor_t2: 1, boots_t1: 1 };
    const res = equipBest(state, uid);
    expect(res).toEqual({ ok: true, value: { changed: 3 } });
    expect(state.heroes.find((h) => h.uid === uid)!.equipment).toEqual({
      weapon: 'weapon_t3',
      armor: 'armor_t2',
      boots: 'boots_t1',
    });
    expect(state.equipment).toEqual({ weapon_t1: 2 });
    expect(equipBest(state, uid).ok).toBe(false);
  });
});

describe('player level & resources', () => {
  it('levels the player up with gem rewards', () => {
    const state = newGameState(0);
    const gems = state.resources.gems;
    const need = playerExpToNext(1) + playerExpToNext(2);
    addRewards(state, { resources: {}, playerExp: need + 5 });
    expect(state.player.level).toBe(3);
    expect(state.player.exp).toBe(5);
    expect(state.resources.gems).toBe(gems + playerLevelGems(2) + playerLevelGems(3));
  });

  it('adds resources and equipment, ignoring junk', () => {
    const state = newGameState(0);
    const gold = state.resources.gold;
    addRewards(state, { resources: { gold: 150.7, basicScroll: 2 }, equipment: { boots_t2: 2, junk: 3 } });
    expect(state.resources.gold).toBe(gold + 150);
    expect(state.resources.basicScroll).toBe(12);
    expect(state.equipment).toEqual({ boots_t2: 2 });
  });

  it('canAfford / spend are all-or-nothing', () => {
    const state = newGameState(0);
    expect(canAfford(state, { gold: 20000, gems: 900 })).toBe(true);
    expect(canAfford(state, { gold: 20001 })).toBe(false);
    const before = { ...state.resources };
    expect(spend(state, { gold: 100, gems: 901 })).toBe(false);
    expect(state.resources).toEqual(before);
    expect(spend(state, { gold: 100, gems: 900 })).toBe(true);
    expect(state.resources.gold).toBe(before.gold - 100);
    expect(state.resources.gems).toBe(0);
  });
});
