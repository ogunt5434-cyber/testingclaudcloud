// Pure UI logic: number/time formatting, reward rows, battle replay model and playback pacing.
import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/core/battle/engine';
import { affordableLevels, levelUpCost } from '../src/core/progression';
import { newGameState } from '../src/core/save';
import { Rng } from '../src/core/rng';
import { toBattleUnit } from '../src/core/stats';
import type { BattleEvent, BattleUnitSetup, UnitSnapshot } from '../src/core/types';
import { HEROES } from '../src/data/heroes';
import { BattleModel, refKey, replayAll } from '../src/ui/battle/model';
import { delayAfter, totalDuration } from '../src/ui/battle/timing';
import { fmtBuff, fmtDuration, fmtNum, fmtPercent, fraction, rewardEntries, rewardSummary } from '../src/ui/format';
import { bestStockTier } from '../src/ui/modals/heroEquipment';

describe('format', () => {
  it('formats compact numbers', () => {
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(999)).toBe('999');
    expect(fmtNum(9999)).toBe('9999');
    expect(fmtNum(12_345)).toBe('12.3K');
    expect(fmtNum(20_000)).toBe('20K');
    expect(fmtNum(123_456)).toBe('123K');
    expect(fmtNum(4_500_000)).toBe('4.5M');
    expect(fmtNum(1_250_000_000)).toBe('1.2B');
    expect(fmtNum(-15_500)).toBe('-15.5K');
    expect(fmtNum(Number.NaN)).toBe('0');
  });

  it('formats Turkish percents', () => {
    expect(fmtPercent(0.2)).toBe('%20');
    expect(fmtPercent(0.155)).toBe('%15.5');
    expect(fmtPercent(0.005, 2)).toBe('%0.5');
    expect(fmtPercent(0.095, 2)).toBe('%9.5');
    expect(fmtPercent(-0.1)).toBe('-%10');
  });

  it('formats durations as hh:mm:ss', () => {
    expect(fmtDuration(0)).toBe('00:00:00');
    expect(fmtDuration(3_725_000)).toBe('01:02:05');
    expect(fmtDuration(12 * 3_600_000)).toBe('12:00:00');
    expect(fmtDuration(-5)).toBe('00:00:00');
  });

  it('formats buffs with percent semantics for hp/atk/armor', () => {
    expect(fmtBuff('atk', 0.2)).toBe('+%20 Saldırı');
    expect(fmtBuff('spd', -15)).toBe('-15 Hız');
    expect(fmtBuff('crit', 0.1)).toBe('+%10 Kritik Şansı');
  });

  it('flattens rewards in a stable order and skips zero / unknown entries', () => {
    const rows = rewardEntries({
      resources: { gems: 20, gold: 500, spirit: 0 },
      playerExp: 35,
      equipment: { weapon_t3: 2, nonsense_t9: 1, boots_t1: 0 },
    });
    expect(rows.map((r) => r.key)).toEqual(['gold', 'gems', 'playerExp', 'weapon_t3']);
    expect(rows[3].color).toBeTruthy();
    expect(rewardEntries(null)).toEqual([]);
    expect(rewardSummary({ resources: { gold: 12_345 } })).toBe('🪙 12.3K');
  });

  it('clamps fractions', () => {
    expect(fraction(5, 10)).toBe(0.5);
    expect(fraction(20, 10)).toBe(1);
    expect(fraction(1, 0)).toBe(0);
  });
});

describe('hero helpers', () => {
  it('counts affordable levels without passing the cap (the "Maks" button)', () => {
    // The level card uses the store's affordableLevels with an unlimited request.
    const rich = { gold: 1e12, spirit: 1e12, gems: 0, basicScroll: 0, heroicScroll: 0 };
    const state = newGameState(0);
    const hero = { ...state.heroes[0], stars: 1, level: 1 };
    const maxGain = (resources: typeof rich, level = 1) => affordableLevels({ ...state, resources }, { ...hero, level }, Infinity).gained;
    expect(maxGain(rich)).toBe(19);
    expect(maxGain(rich, 20)).toBe(0);
    const one = levelUpCost(1);
    expect(maxGain({ ...rich, gold: one.gold, spirit: one.spirit })).toBe(1);
    expect(maxGain({ ...rich, gold: 0 })).toBe(0);
  });

  it('finds the best stocked tier per slot', () => {
    const stock = { weapon_t2: 1, weapon_t4: 0, weapon_t3: 2, armor_t1: 1, junk: 5 };
    expect(bestStockTier(stock, 'weapon')).toBe(3);
    expect(bestStockTier(stock, 'armor')).toBe(1);
    expect(bestStockTier(stock, 'boots')).toBe(0);
  });
});

function randomTeam(rng: Rng, size: number): (BattleUnitSetup | null)[] {
  const team: (BattleUnitSetup | null)[] = [null, null, null, null, null, null];
  const slots = rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, size);
  for (const slot of slots) {
    const def = rng.pick(HEROES);
    const stars = rng.int(def.rarity, 5);
    team[slot] = toBattleUnit({ uid: `u${slot}`, heroId: def.id, level: rng.int(1, 60), stars, equipment: {}, locked: false });
  }
  return team;
}

function expectMatchesFinal(model: BattleModel, final: UnitSnapshot[]): void {
  for (const snap of final) {
    const unit = model.units.get(refKey(snap.ref));
    expect(unit, refKey(snap.ref)).toBeDefined();
    expect(unit?.hp).toBe(snap.hp);
    expect(unit?.energy).toBe(snap.energy);
    expect(unit?.alive).toBe(snap.hp > 0);
    if (snap.hp <= 0) expect(unit?.statuses.size).toBe(0);
  }
}

describe('battle replay model', () => {
  it('reproduces the engine final state for many real battles', () => {
    const rng = new Rng(1234);
    for (let i = 0; i < 150; i++) {
      const result = simulateBattle({ attackers: randomTeam(rng, rng.int(1, 6)), defenders: randomTeam(rng, rng.int(1, 6)), seed: i });
      const model = replayAll(result);
      expectMatchesFinal(model, result.final);
      expect(model.winner).toBe(result.winner);
      expect(model.round).toBe(result.rounds);
    }
  });

  it('expires turn buffs after round r+N-1 and round-end buffs after r+N', () => {
    const a0 = { side: 'attacker' as const, pos: 0 };
    const d0 = { side: 'defender' as const, pos: 0 };
    const snap = (ref: typeof a0 | typeof d0): UnitSnapshot => ({ ref, heroId: 'batur', level: 1, stars: 3, maxHp: 100, hp: 100, energy: 50 });
    const model = new BattleModel([snap(a0), snap(d0)]);
    const apply = (...events: BattleEvent[]): void => events.forEach((ev) => model.apply(ev));

    apply({ t: 'buff', target: a0, stat: 'spd', amount: 15, duration: 2 }); // battleStart counts as round end of round 0
    apply({ t: 'roundStart', round: 1 });
    apply({ t: 'action', actor: a0, kind: 'skill', skillName: 'x', targets: [a0] });
    apply({ t: 'buff', target: a0, stat: 'atk', amount: 0.2, duration: 1 }); // during turns -> lasts through round 1
    apply({ t: 'action', actor: d0, kind: 'basic', targets: [a0] });
    apply({ t: 'buff', target: d0, stat: 'armor', amount: -0.1, duration: 1 }); // round end -> lasts through round 2
    expect(model.units.get('a0')?.buffs).toHaveLength(2);

    apply({ t: 'roundStart', round: 2 });
    expect(model.units.get('a0')?.buffs.map((b) => b.stat)).toEqual(['spd']);
    expect(model.units.get('d0')?.buffs).toHaveLength(1);

    apply({ t: 'roundStart', round: 3 });
    expect(model.units.get('a0')?.buffs).toHaveLength(0);
    expect(model.units.get('d0')?.buffs).toHaveLength(0);
  });

  it('tracks statuses and death', () => {
    const d1 = { side: 'defender' as const, pos: 1 };
    const model = new BattleModel([{ ref: d1, heroId: 'batur', level: 1, stars: 3, maxHp: 100, hp: 100, energy: 50 }]);
    model.apply({ t: 'status', target: d1, status: 'burn', on: true, duration: 2 });
    expect(model.units.get('d1')?.statuses.get('burn')).toBe(2);
    model.apply({ t: 'damage', source: null, target: d1, amount: 100, crit: false, kind: 'dot', hpAfter: 0 });
    model.apply({ t: 'death', target: d1 });
    model.apply({ t: 'status', target: d1, status: 'burn', on: false, duration: 0 });
    const unit = model.units.get('d1');
    expect(unit?.alive).toBe(false);
    expect(unit?.hp).toBe(0);
    expect(unit?.statuses.size).toBe(0);
  });
});

describe('playback pacing', () => {
  it('adds a beat between turns and keeps energy updates instant', () => {
    const a0 = { side: 'attacker' as const, pos: 0 };
    const action: BattleEvent = { t: 'action', actor: a0, kind: 'basic', targets: [] };
    const energy: BattleEvent = { t: 'energy', target: a0, energyAfter: 100 };
    expect(delayAfter(energy, energy)).toBe(0);
    expect(delayAfter(energy, action)).toBeGreaterThan(0);
  });

  it('keeps a full 6v6 battle watchable at ×1', () => {
    const rng = new Rng(99);
    const result = simulateBattle({ attackers: randomTeam(rng, 6), defenders: randomTeam(rng, 6), seed: 5 });
    const ms = totalDuration(result.events);
    expect(ms).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(15 * 60_000);
  });
});
