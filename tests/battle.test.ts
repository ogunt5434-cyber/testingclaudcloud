import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BattleContext } from '../src/core/battle/context';
import { armorReduction, dodgeChance, rollHit } from '../src/core/battle/damage';
import { simulateBattle } from '../src/core/battle/engine';
import { selectTargets } from '../src/core/battle/targeting';
import { buildUnit, stat } from '../src/core/battle/unit';
import { ARMOR_CAP, ENERGY_START, FACTION_DMG_BONUS, MAX_ROUNDS } from '../src/core/constants';
import { Rng } from '../src/core/rng';
import type { BattleEvent, BattleResult, BattleSetup, SkillDef, SkillEffect, UnitRef } from '../src/core/types';
import { checkInvariants, fixtureHero, passive, registerHeroes, team, unitSetup } from './battle-fixtures';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const selfBuff = (stat: 'atk' | 'armor' | 'spd', amount: number, duration = 1): SkillEffect => ({
  type: 'buff',
  target: { selector: 'self' },
  stat,
  amount,
  duration,
});

const STRIKE: SkillDef = {
  name: 'Ağır Darbe',
  description: 'Öndeki düşmana %300 saldırı hasarı.',
  effects: [{ type: 'damage', target: { selector: 'defaultEnemy' }, multiplier: 3 }],
};
const HEAL_ALL: SkillDef = {
  name: 'Şifa Yağmuru',
  description: 'Tüm müttefikleri %1000 saldırı kadar iyileştirir.',
  effects: [{ type: 'heal', target: { selector: 'allAllies' }, multiplier: 10 }],
};

const burnAll = (duration: number, value: number): SkillEffect => ({
  type: 'status',
  target: { selector: 'allEnemies' },
  status: 'burn',
  chance: 1,
  duration,
  value,
});
const spdBuff = (selector: 'self' | 'allAllies' | 'allEnemies', amount: number, duration: number): SkillEffect => ({
  type: 'buff',
  target: { selector },
  stat: 'spd',
  amount,
  duration,
});

/** Heroes that change spd from every phase (skill, onAttack, onHit, roundEnd, battleStart, onAllyDeath). */
const SPD_FIXTURES = [
  fixtureHero('test_spd_caster', {
    active: {
      name: 'Rüzgâr Darbesi',
      description: '-',
      effects: [{ type: 'damage', target: { selector: 'defaultEnemy' }, multiplier: 1.5 }, spdBuff('self', 60, 1)],
    },
  }),
  fixtureHero('test_spd_slower', {
    passives: [passive('Ağır Hava', { trigger: 'onAttack', effects: [spdBuff('allEnemies', -40, 2)] })],
  }),
  fixtureHero('test_spd_rally', {
    passives: [passive('Toparlan', { trigger: 'roundEnd', chance: 0.5, effects: [spdBuff('self', 35, 1)] })],
  }),
  fixtureHero('test_spd_flinch', {
    passives: [passive('İrkilme', { trigger: 'onHit', effects: [spdBuff('self', 20, 1)] })],
  }),
  fixtureHero('test_spd_mourn', {
    passives: [
      passive('Hazırlık', { trigger: 'battleStart', effects: [spdBuff('allAllies', 10, 2)] }),
      passive('Yas Hızı', { trigger: 'onAllyDeath', effects: [spdBuff('allAllies', 70, 1)] }),
    ],
  }),
];

const FIXTURES = [
  fixtureHero('test_dummy'),
  fixtureHero('test_brute', { active: STRIKE }),
  fixtureHero('test_healer', { heroClass: 'priest', active: HEAL_ALL }),
  fixtureHero('test_stunner', {
    passives: [
      passive('Taş Bakış', {
        trigger: 'battleStart',
        effects: [{ type: 'status', target: { selector: 'defaultEnemy' }, status: 'stun', chance: 1, duration: 2 }],
      }),
    ],
  }),
  fixtureHero('test_silencer', {
    passives: [
      passive('Sessiz Yemin', {
        trigger: 'battleStart',
        effects: [{ type: 'status', target: { selector: 'allEnemies' }, status: 'silence', chance: 1, duration: 3 }],
      }),
    ],
  }),
  fixtureHero('test_burner', {
    passives: [
      passive('Kor Dokunuşu', {
        trigger: 'battleStart',
        effects: [{ type: 'status', target: { selector: 'allEnemies' }, status: 'burn', chance: 1, duration: 2, value: 0.5 }],
      }),
    ],
  }),
  fixtureHero('test_statpassive', {
    passives: [
      passive('Demir Beden', { stats: { hp: 0.5, atk: 0.2, crit: 0.1, spd: 5 } }),
      passive('Keskin Göz', { stats: { atk: 0.1, hit: 0.05 } }),
    ],
  }),
  fixtureHero('test_triggers', {
    passives: [
      passive('Başlangıç', { trigger: 'battleStart', effects: [selfBuff('atk', 0.01)] }),
      passive('Darbe', { trigger: 'onHit', effects: [selfBuff('armor', 0.01)] }),
      passive('Saldırı', { trigger: 'onAttack', effects: [selfBuff('atk', 0.01)] }),
      passive('Tur Sonu', { trigger: 'roundEnd', effects: [selfBuff('armor', 0.01)] }),
      passive('Ölüm', { trigger: 'onDeath', effects: [{ type: 'heal', target: { selector: 'allAllies' }, multiplier: 0.5 }] }),
      passive('Yas', { trigger: 'onAllyDeath', effects: [selfBuff('atk', 0.1)] }),
    ],
  }),
  fixtureHero('test_never', {
    passives: [passive('Asla', { trigger: 'battleStart', chance: 0, effects: [selfBuff('atk', 1)] })],
  }),
  fixtureHero('test_thorns', {
    passives: [
      passive('Diken', {
        trigger: 'onHit',
        effects: [{ type: 'damage', target: { selector: 'defaultEnemy' }, multiplier: 0.5 }],
      }),
    ],
  }),
  fixtureHero('test_hastener', {
    passives: [passive('Ani Atılım', { trigger: 'battleStart', effects: [selfBuff('spd', 100)] })],
  }),
  fixtureHero('test_rally', {
    passives: [passive('Toparlanma', { trigger: 'roundEnd', effects: [selfBuff('spd', 100)] })],
  }),
  fixtureHero('test_abyss', { faction: 'abyss' }),
  fixtureHero('test_forest', { faction: 'forest' }),
  // Round-end DoT reapplication.
  fixtureHero('test_reburn', {
    passives: [passive('Süren Kor', { trigger: 'roundEnd', effects: [burnAll(1, 0.1)] })],
  }),
  fixtureHero('test_plainburner', {
    passives: [passive('İlk Kor', { trigger: 'battleStart', effects: [burnAll(2, 0.1)] })],
  }),
  fixtureHero('test_avenger', {
    passives: [
      passive('İlk Kor', { trigger: 'battleStart', effects: [burnAll(2, 0.1)] }),
      passive('İntikam Koru', { trigger: 'onAllyDeath', effects: [burnAll(3, 0.1)] }),
    ],
  }),
  fixtureHero('test_killburner', {
    passives: [passive('Ölümcül Kor', { trigger: 'battleStart', effects: [burnAll(1, 100)] })],
  }),
  fixtureHero('test_finisher', {
    passives: [passive('Son Söz', { trigger: 'roundEnd', effects: [{ type: 'damage', target: { selector: 'allEnemies' }, multiplier: 100 }] })],
  }),
  fixtureHero('test_faintburner', {
    passives: [passive('Kıvılcım', { trigger: 'battleStart', effects: [burnAll(1, 0.01)] })],
  }),
  // Buff expiry (buffEnd) timing.
  fixtureHero('test_selfspd', {
    active: { name: 'Hızlan', description: 'Kendine 1 tur +100 hız.', effects: [selfBuff('spd', 100)] },
  }),
  ...SPD_FIXTURES,
];

let unregister: () => void = () => {};
beforeAll(() => {
  unregister = registerHeroes(FIXTURES);
});
afterAll(() => unregister());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const A0: UnitRef = { side: 'attacker', pos: 0 };
const A1: UnitRef = { side: 'attacker', pos: 1 };
const A2: UnitRef = { side: 'attacker', pos: 2 };
const D0: UnitRef = { side: 'defender', pos: 0 };

const is = (a: UnitRef | null | undefined, b: UnitRef): boolean => !!a && a.side === b.side && a.pos === b.pos;

/** Runs a battle and asserts the generic invariants before returning it. */
function run(setup: BattleSetup): BattleResult {
  const result = simulateBattle(setup);
  expect(checkInvariants(setup, result)).toEqual([]);
  return result;
}

/** 'skip' | 'basic' | 'skill' for each of the unit's turns, in order. */
function turnsOf(result: BattleResult, ref: UnitRef): string[] {
  return result.events.flatMap((e) => {
    if (e.t === 'skip' && is(e.actor, ref)) return ['skip'];
    if (e.t === 'action' && is(e.actor, ref)) return [e.kind];
    return [];
  });
}

/** Round number each event belongs to (0 = before round 1). */
function roundOfEvents(events: BattleEvent[]): number[] {
  let round = 0;
  return events.map((e) => (e.t === 'roundStart' ? (round = e.round) : round));
}

/** Round of each DoT tick on `target`, in order. */
function dotTickRounds(result: BattleResult, target: UnitRef): number[] {
  const rounds = roundOfEvents(result.events);
  return result.events.flatMap((e, i) => (e.t === 'damage' && e.kind === 'dot' && is(e.target, target) ? [rounds[i]] : []));
}

/** Rng returning a constant: 0.5 makes the damage variance factor exactly 1. */
class FixedRng extends Rng {
  constructor(private readonly value: number) {
    super(0);
  }
  override next(): number {
    return this.value;
  }
}

function duel(attacker: ReturnType<typeof unitSetup>, defender: ReturnType<typeof unitSetup>, seed = 1, maxRounds?: number): BattleSetup {
  return { attackers: team({ 0: attacker }), defenders: team({ 0: defender }), seed, maxRounds };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('simulateBattle: determinism & termination', () => {
  const setup: BattleSetup = {
    attackers: team({ 0: unitSetup('test_brute', { crit: 0.3, dodge: 0.2 }), 3: unitSetup('test_burner') }),
    defenders: team({ 1: unitSetup('test_healer', { hp: 3000 }), 4: unitSetup('test_thorns', { crit: 0.2 }) }),
    seed: 42,
  };

  it('same seed => identical result, setup untouched', () => {
    const before = structuredClone(setup);
    const a = run(setup);
    const b = run(setup);
    expect(a).toEqual(b);
    expect(setup).toEqual(before);
  });

  it('different seeds can produce different battles', () => {
    const logs = new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(simulateBattle({ ...setup, seed }).events)));
    expect(logs.size).toBeGreaterThan(1);
  });

  it('defender wins at maxRounds when nobody dies (two tanky healers)', () => {
    const tank = unitSetup('test_healer', { hp: 1e7, atk: 1 });
    const result = run(duel(tank, tank));
    expect(result.winner).toBe('defender');
    expect(result.rounds).toBe(MAX_ROUNDS);
    expect(result.events.filter((e) => e.t === 'roundStart')).toHaveLength(MAX_ROUNDS);
    expect(result.events.some((e) => e.t === 'death')).toBe(false);
    expect(run(duel(tank, tank, 1, 3)).rounds).toBe(3);
  });

  it('a decisive battle ends early with the surviving side winning', () => {
    const result = run(duel(unitSetup('test_brute', { atk: 5000 }), unitSetup('test_dummy', { hp: 500 })));
    expect(result.winner).toBe('attacker');
    expect(result.rounds).toBe(1);
    expect(result.final.find((s) => is(s.ref, D0))?.hp).toBe(0);
  });
});

describe('simulateBattle: energy', () => {
  it('first skill on the 2nd own turn when unhit, energy resets to 0', () => {
    // Brute sits in the back row behind a front-line dummy, so the enemy never hits it.
    const setup: BattleSetup = {
      attackers: team({ 0: unitSetup('test_dummy', { hp: 1e7 }), 2: unitSetup('test_brute') }),
      defenders: team({ 0: unitSetup('test_dummy', { hp: 1e8, atk: 1 }) }),
      seed: 3,
      maxRounds: 6,
    };
    const result = run(setup);
    expect(result.initial.every((s) => s.energy === ENERGY_START)).toBe(true);
    expect(turnsOf(result, A2)).toEqual(['basic', 'skill', 'basic', 'basic', 'skill', 'basic']);
    const energies = result.events.flatMap((e) => (e.t === 'energy' && is(e.target, A2) ? [e.energyAfter] : []));
    expect(energies).toEqual([100, 0, 50, 100, 0, 50]);
    // The reset is announced right before the skill action.
    const skillIdx = result.events.findIndex((e) => e.t === 'action' && e.kind === 'skill' && is(e.actor, A2));
    expect(result.events[skillIdx - 1]).toEqual({ t: 'energy', target: A2, energyAfter: 0 });
  });

  it('a hit target gains energy right after the damage event', () => {
    const result = run(duel(unitSetup('test_dummy'), unitSetup('test_dummy', { hp: 1e6 }), 1, 1));
    const dmgIdx = result.events.findIndex((e) => e.t === 'damage' && is(e.target, D0));
    expect(result.events[dmgIdx + 1]).toEqual({ t: 'energy', target: D0, energyAfter: ENERGY_START + 10 });
  });
});

describe('simulateBattle: statuses', () => {
  it('stun makes the target skip exactly `duration` turns', () => {
    const result = run(duel(unitSetup('test_stunner', { hp: 1e7, atk: 1 }), unitSetup('test_dummy', { hp: 1e7, atk: 1 }), 5, 4));
    // Hits while stunned still give energy: 50 + 10 + 10, basic -> 130 (+hit), so turn 4 casts.
    expect(turnsOf(result, D0)).toEqual(['skip', 'skip', 'basic', 'skill']);
    const skips = result.events.filter((e) => e.t === 'skip');
    expect(skips.every((e) => e.t === 'skip' && e.reason === 'stun')).toBe(true);
    const statusEvents = result.events.filter((e) => e.t === 'status');
    expect(statusEvents).toEqual([
      { t: 'status', target: D0, status: 'stun', on: true, duration: 2 },
      { t: 'status', target: D0, status: 'stun', on: false, duration: 0 },
    ]);
    const secondSkip = result.events.findIndex((e, i) => e.t === 'skip' && i > result.events.indexOf(skips[0]));
    expect(result.events[secondSkip + 1]).toEqual(statusEvents[1]);
  });

  it('controlImmune 1 blocks control statuses', () => {
    const result = run(duel(unitSetup('test_stunner'), unitSetup('test_dummy', { hp: 1e7, controlImmune: 1 }), 5, 3));
    expect(turnsOf(result, D0)).toEqual(['basic', 'skill', 'basic']);
    expect(result.events.some((e) => e.t === 'status')).toBe(false);
  });

  it('silence blocks skills but not basic attacks, and wears off after its turns', () => {
    const result = run(duel(unitSetup('test_silencer', { hp: 1e7, atk: 1 }), unitSetup('test_brute', { hp: 1e7, atk: 1 }), 9, 5));
    expect(turnsOf(result, D0)).toEqual(['basic', 'basic', 'basic', 'skill', 'basic']);
    const rounds = roundOfEvents(result.events);
    const offIdx = result.events.findIndex((e) => e.t === 'status' && e.status === 'silence' && !e.on);
    expect(rounds[offIdx]).toBe(3);
  });

  it('DoT ticks at round end for value × caster ATK, credits the caster, then expires', () => {
    for (const atk of [100, 250]) {
      const result = run(duel(unitSetup('test_burner', { atk, hp: 1e7 }), unitSetup('test_dummy', { hp: 1e7, atk: 1 }), 2, 4));
      const rounds = roundOfEvents(result.events);
      const dots = result.events.flatMap((e, i) => (e.t === 'damage' && e.kind === 'dot' ? [{ e, i }] : []));
      expect(dots.map(({ e }) => e.t === 'damage' && e.amount)).toEqual([atk * 0.5, atk * 0.5]);
      expect(dots.map(({ i }) => rounds[i])).toEqual([1, 2]);
      for (const { e, i } of dots) {
        expect(e.t === 'damage' && is(e.source, A0) && is(e.target, D0)).toBe(true);
        // Ticks come after every action of the round.
        const laterAction = result.events.findIndex((x, j) => j > i && x.t === 'action');
        expect(rounds[laterAction]).toBe(rounds[i] + 1);
      }
      const offIdx = result.events.findIndex((e) => e.t === 'status' && e.status === 'burn' && !e.on);
      expect(rounds[offIdx]).toBe(2);
      expect(offIdx).toBeGreaterThan(dots[1].i);
      const burnerStats = result.unitStats.find((s) => is(s.ref, A0))!;
      expect(burnerStats.damageDealt).toBeGreaterThanOrEqual(atk);
    }
  });
});

describe('simulateBattle: DoT reapplied during round end', () => {
  it('a 1-round DoT reapplied by a roundEnd passive ticks every round (equal duration is not lost)', () => {
    const result = run(duel(unitSetup('test_reburn', { hp: 1e7, atk: 1 }), unitSetup('test_dummy', { hp: 1e7, atk: 1 }), 1, 6));
    // First applied at the end of round 1 (starts next round), then refreshed at every round end.
    expect(dotTickRounds(result, D0)).toEqual([2, 3, 4, 5, 6]);
    const burnEvents = result.events.filter((e) => e.t === 'status' && e.status === 'burn' && is(e.target, D0));
    expect(burnEvents.filter((e) => e.t === 'status' && !e.on)).toEqual([]);
  });

  it('refreshing an existing DoT during round end (before its tick) keeps this round\'s tick and extends it', () => {
    const setup = (burnerId: string): BattleSetup => ({
      attackers: team({
        0: unitSetup(burnerId, { hp: 1e7, atk: 10, spd: 100 }),
        1: unitSetup('test_dummy', { hp: 50, atk: 1, spd: 200 }), // dies to the defender's burn first at round 1 end
      }),
      defenders: team({ 0: unitSetup('test_killburner', { hp: 1e7, atk: 1, spd: 150 }) }),
      seed: 3,
      maxRounds: 5,
    });
    const plain = run(setup('test_plainburner'));
    expect(dotTickRounds(plain, D0)).toEqual([1, 2]);

    const avenged = run(setup('test_avenger'));
    const rounds = roundOfEvents(avenged.events);
    const death = avenged.events.findIndex((e) => e.t === 'death' && is(e.target, A1));
    const reapply = avenged.events.findIndex((e, i) => i > death && e.t === 'status' && e.status === 'burn' && e.on);
    const d0Tick = avenged.events.findIndex((e) => e.t === 'damage' && e.kind === 'dot' && is(e.target, D0));
    expect(rounds[death]).toBe(1);
    expect(reapply).toBeLessThan(d0Tick); // refreshed before D0's own round-1 tick
    // The battleStart burn still ticks in round 1, then 3 more rounds from the onAllyDeath refresh.
    expect(dotTickRounds(avenged, D0)).toEqual([1, 2, 3, 4]);
  });

  it('a battle ended by a roundEnd passive emits nothing after battleEnd (no duration decrement)', () => {
    const setup = duel(unitSetup('test_finisher', { hp: 1e6, atk: 100, spd: 50 }), unitSetup('test_faintburner', { hp: 5000, atk: 1, spd: 100 }), 1, 3);
    const result = run(setup);
    expect(result.rounds).toBe(1);
    expect(result.events.slice(-3)).toEqual([
      expect.objectContaining({ t: 'damage', kind: 'passive', target: D0, hpAfter: 0 }),
      { t: 'death', target: D0 },
      { t: 'battleEnd', winner: 'attacker' },
    ]);
  });
});

describe('simulateBattle: healing', () => {
  it('heals are capped at max HP and never revive', () => {
    const setup: BattleSetup = {
      attackers: team({ 0: unitSetup('test_dummy', { hp: 1, atk: 1 }), 2: unitSetup('test_healer', { hp: 5000 }) }),
      defenders: team({ 0: unitSetup('test_brute', { hp: 1e7, atk: 150 }) }),
      seed: 11,
      maxRounds: 8,
    };
    const result = run(setup);
    const deathIdx = result.events.findIndex((e) => e.t === 'death' && is(e.target, A0));
    expect(deathIdx).toBeGreaterThan(-1);
    const heals = result.events.filter((e): e is Extract<BattleEvent, { t: 'heal' }> => e.t === 'heal');
    expect(heals.length).toBeGreaterThan(0);
    expect(heals.some((h) => is(h.target, A0))).toBe(false);
    expect(heals.every((h) => h.hpAfter <= 5000)).toBe(true);
    // The first heal lands on a healthy healer: fully capped.
    expect(heals[0]).toMatchObject({ target: A2, amount: 0, hpAfter: 5000 });
    expect(result.final.find((s) => is(s.ref, A0))?.hp).toBe(0);
  });
});

describe('damage formula', () => {
  const build = (heroId: string, stats: Parameters<typeof unitSetup>[1], side: 'attacker' | 'defender' = 'attacker', level = 1) =>
    buildUnit(unitSetup(heroId, stats, level), side, 0);
  const hit = (attacker: ReturnType<typeof build>, target: ReturnType<typeof build>, isSkill = false, multiplier = 1) =>
    rollHit(new FixedRng(0.5), attacker, target, { multiplier, isSkill });

  it('armor reduction matches the formula and cap', () => {
    expect(armorReduction(100, 0, 10)).toBeCloseTo(100 / 350, 10);
    expect(armorReduction(100, 0.5, 10)).toBeCloseTo(50 / 300, 10);
    expect(armorReduction(100, 1.5, 10)).toBe(0);
    expect(armorReduction(1e6, 0, 1)).toBe(ARMOR_CAP);
    const attacker = build('test_dummy', { atk: 1000 }, 'attacker', 10);
    expect(hit(attacker, build('test_dummy', { armor: 100 }, 'defender'))).toEqual({
      dodged: false,
      amount: Math.round(1000 * (1 - 100 / 350)),
      crit: false,
    });
  });

  it('dmgReduce is capped, crit multiplies by 1.5 + critDmg', () => {
    const attacker = build('test_dummy', { atk: 1000 });
    expect(hit(attacker, build('test_dummy', { dmgReduce: 0.9 }, 'defender'))).toMatchObject({ amount: 400 });
    const critter = build('test_dummy', { atk: 1000, crit: 1, critDmg: 0.5 });
    expect(hit(critter, build('test_dummy', {}, 'defender'))).toEqual({ dodged: false, amount: 2000, crit: true });
  });

  it('skillDmg applies only to skills', () => {
    const attacker = build('test_dummy', { atk: 1000, skillDmg: 0.5 });
    const target = build('test_dummy', {}, 'defender');
    expect(hit(attacker, target, false)).toMatchObject({ amount: 1000 });
    expect(hit(attacker, target, true)).toMatchObject({ amount: 1500 });

    // In a real battle: same seed, only skillDmg differs -> identical basics, doubled first skill hit.
    const battle = (skillDmg: number) =>
      run(duel(unitSetup('test_brute', { hp: 1e7, skillDmg }), unitSetup('test_dummy', { hp: 1e7, atk: 1 }), 21, 3));
    const firstOfKind = (r: BattleResult, kind: string) =>
      r.events.find((e) => e.t === 'damage' && e.kind === kind && is(e.source, A0)) as Extract<BattleEvent, { t: 'damage' }>;
    const plain = battle(0);
    const boosted = battle(1);
    expect(firstOfKind(boosted, 'basic').amount).toBe(firstOfKind(plain, 'basic').amount);
    expect(Math.abs(firstOfKind(boosted, 'skill').amount - 2 * firstOfKind(plain, 'skill').amount)).toBeLessThanOrEqual(1);
  });

  it('faction advantage adds ~30% damage', () => {
    const attacker = build('test_abyss', { atk: 1000 });
    const advantaged = hit(attacker, build('test_forest', { armor: 50 }, 'defender'));
    const neutral = hit(attacker, build('test_abyss', { armor: 50 }, 'defender'));
    if (advantaged.dodged || neutral.dodged) throw new Error('unexpected dodge');
    expect(advantaged.amount / neutral.amount).toBeCloseTo(1 + FACTION_DMG_BONUS, 2);

    // Averaged over many seeded battles (variance included).
    const avgFirstHit = (defenderId: string) => {
      let total = 0;
      for (let seed = 0; seed < 200; seed++) {
        const r = simulateBattle(duel(unitSetup('test_abyss', { atk: 500 }), unitSetup(defenderId, { hp: 1e6 }), seed, 1));
        const dmg = r.events.find((e) => e.t === 'damage' && is(e.source, A0));
        total += dmg && dmg.t === 'damage' ? dmg.amount : 0;
      }
      return total / 200;
    };
    expect(avgFirstHit('test_forest') / avgFirstHit('test_abyss')).toBeCloseTo(1.3, 1);
  });

  it('dodge chance: dodge - hit - faction hit bonus, clamped to [0, 0.75]', () => {
    expect(dodgeChance(0.3, 0.1, false)).toBeCloseTo(0.2, 10);
    expect(dodgeChance(0.3, 0.1, true)).toBeCloseTo(0.05, 10);
    expect(dodgeChance(1, 0, false)).toBe(0.75);
    expect(dodgeChance(0.1, 0.5, false)).toBe(0);
  });

  it('dodges happen at the capped rate, grant no energy, and hit / faction advantage negate them', () => {
    let attacks = 0;
    let dodges = 0;
    for (let seed = 0; seed < 40; seed++) {
      const r = run(duel(unitSetup('test_dummy', { hp: 1e7 }), unitSetup('test_dummy', { hp: 1e7, atk: 1, dodge: 1 }), seed));
      attacks += turnsOf(r, A0).filter((k) => k === 'basic').length;
      r.events.forEach((e, i) => {
        if (e.t !== 'dodge') return;
        dodges++;
        const next = r.events[i + 1];
        expect(next.t === 'energy' && is(next.target, e.target)).toBe(false);
      });
    }
    expect(dodges / attacks).toBeGreaterThan(0.68);
    expect(dodges / attacks).toBeLessThan(0.82);

    const accurate = run(duel(unitSetup('test_dummy', { hit: 1 }), unitSetup('test_dummy', { hp: 1e7, dodge: 1 })));
    expect(accurate.events.some((e) => e.t === 'dodge' && is(e.source, A0))).toBe(false);
    const advantaged = run(duel(unitSetup('test_abyss'), unitSetup('test_forest', { hp: 1e7, dodge: 0.15 })));
    expect(advantaged.events.some((e) => e.t === 'dodge' && is(e.source, A0))).toBe(false);
  });
});

describe('passives', () => {
  it('passive stats are applied at build (percent for hp/atk/armor, additive otherwise)', () => {
    const unit = buildUnit(unitSetup('test_statpassive', { hp: 1000, atk: 100, crit: 0.05, spd: 100 }), 'attacker', 0);
    expect(unit.maxHp).toBe(1500);
    expect(unit.hp).toBe(1500);
    expect(stat(unit, 'atk')).toBeCloseTo(130, 10);
    expect(stat(unit, 'crit')).toBeCloseTo(0.15, 10);
    expect(stat(unit, 'hit')).toBeCloseTo(0.05, 10);
    expect(stat(unit, 'spd')).toBe(105);
    const result = run(duel(unitSetup('test_statpassive', { hp: 1000 }), unitSetup('test_dummy'), 1, 1));
    expect(result.initial[0].maxHp).toBe(1500);
  });

  it('effective stats include buffs and are clamped', () => {
    const unit = buildUnit(unitSetup('test_dummy', { atk: 100, crit: 0.5 }), 'attacker', 0);
    unit.buffs.push({ stat: 'atk', amount: 0.5, remaining: 1, fresh: false });
    unit.buffs.push({ stat: 'crit', amount: 2, remaining: 1, fresh: false });
    expect(stat(unit, 'atk')).toBe(150);
    expect(stat(unit, 'crit')).toBe(1);
    unit.buffs.push({ stat: 'atk', amount: -5, remaining: 1, fresh: false });
    expect(stat(unit, 'atk')).toBe(0);
  });

  it('triggered passives fire: battleStart, onHit, onAttack, roundEnd, onDeath, onAllyDeath', () => {
    const setup: BattleSetup = {
      attackers: team({ 0: unitSetup('test_triggers', { hp: 400, atk: 50 }), 1: unitSetup('test_triggers', { hp: 1e7, atk: 50 }) }),
      defenders: team({ 0: unitSetup('test_brute', { hp: 1e7, atk: 300 }) }),
      seed: 4,
    };
    const result = run(setup);
    const ev = result.events;
    const rounds = roundOfEvents(ev);
    const passiveIdx = (name: string, actor: UnitRef, from = 0) =>
      ev.findIndex((e, i) => i >= from && e.t === 'passive' && e.name === name && is(e.actor, actor));
    const nextActionIdx = (from: number) => ev.findIndex((e, i) => i > from && (e.t === 'action' || e.t === 'skip'));

    // battleStart: before round 1, attacker pos order.
    expect(ev.filter((e, i) => rounds[i] === 0 && e.t === 'passive')).toEqual([
      { t: 'passive', actor: A0, name: 'Başlangıç' },
      { t: 'passive', actor: A1, name: 'Başlangıç' },
    ]);
    // onAttack: after A0's first action, before the next turn.
    const a0Action = ev.findIndex((e) => e.t === 'action' && is(e.actor, A0));
    const onAttack = passiveIdx('Saldırı', A0, a0Action);
    expect(onAttack).toBeGreaterThan(a0Action);
    expect(onAttack).toBeLessThan(nextActionIdx(a0Action));
    // onHit: after the first enemy hit on an attacker that survived.
    const hitIdx = ev.findIndex((e) => e.t === 'damage' && e.source?.side === 'defender' && e.hpAfter > 0);
    const hitEvent = ev[hitIdx] as Extract<BattleEvent, { t: 'damage' }>;
    const onHit = passiveIdx('Darbe', hitEvent.target, hitIdx);
    expect(onHit).toBeGreaterThan(hitIdx);
    expect(onHit).toBeLessThan(nextActionIdx(hitIdx));
    // roundEnd: both in round 1, after the last action of round 1.
    const roundEnds = ev.flatMap((e, i) => (e.t === 'passive' && e.name === 'Tur Sonu' && rounds[i] === 1 ? [i] : []));
    expect(roundEnds).toHaveLength(2);
    for (const idx of roundEnds) expect(rounds[nextActionIdx(idx)]).toBe(2);
    // onDeath / onAllyDeath after A0 dies; the dead unit's heal only reaches living allies.
    const death = ev.findIndex((e) => e.t === 'death' && is(e.target, A0));
    expect(death).toBeGreaterThan(-1);
    const onDeath = passiveIdx('Ölüm', A0, death);
    expect(onDeath).toBeGreaterThan(death);
    expect(ev[onDeath + 1]).toMatchObject({ t: 'heal', source: A0, target: A1 });
    expect(passiveIdx('Yas', A1, death)).toBeGreaterThan(death);
    // A dead unit never fires non-death passives afterwards.
    expect(ev.slice(death + 1).some((e) => e.t === 'passive' && is(e.actor, A0) && e.name !== 'Ölüm')).toBe(false);
  });

  it('passive chance 0 never fires', () => {
    const result = run(duel(unitSetup('test_never'), unitSetup('test_dummy'), 1, 2));
    expect(result.events.some((e) => e.t === 'passive')).toBe(false);
  });

  it('passive damage never triggers onHit (no ping-pong)', () => {
    const thorns = (hp: number) => unitSetup('test_thorns', { hp, atk: 10 });
    const result = run(duel(thorns(1e6), thorns(1e6), 8));
    const ev = result.events;
    const passiveDamage = ev.filter((e) => e.t === 'damage' && e.kind === 'passive');
    const triggeringHits = ev.filter((e) => e.t === 'damage' && (e.kind === 'basic' || e.kind === 'skill'));
    const thornEvents = ev.filter((e) => e.t === 'passive' && e.name === 'Diken');
    expect(passiveDamage.length).toBeGreaterThan(0);
    expect(thornEvents).toHaveLength(triggeringHits.length);
  });

  it('buff duration: a battleStart buff lasts through round 1 only', () => {
    const result = run(duel(unitSetup('test_hastener', { spd: 50 }), unitSetup('test_dummy', { hp: 1e7, atk: 1 }), 1, 3));
    const firstActorPerRound = [1, 2, 3].map((round) => {
      const rounds = roundOfEvents(result.events);
      const e = result.events.find((x, i) => rounds[i] === round && (x.t === 'action' || x.t === 'skip'));
      return e && (e.t === 'action' || e.t === 'skip') ? e.actor.side : null;
    });
    expect(firstActorPerRound).toEqual(['attacker', 'defender', 'defender']);
  });

  it('buffs applied during round end start counting from the next round', () => {
    const result = run(duel(unitSetup('test_rally', { spd: 50 }), unitSetup('test_dummy', { hp: 1e7, atk: 1 }), 1, 4));
    const rounds = roundOfEvents(result.events);
    const firstActorPerRound = [1, 2, 3, 4].map((round) => {
      const e = result.events.find((x, i) => rounds[i] === round && (x.t === 'action' || x.t === 'skip'));
      return e && (e.t === 'action' || e.t === 'skip') ? e.actor.side : null;
    });
    expect(firstActorPerRound).toEqual(['defender', 'attacker', 'attacker', 'attacker']);
  });
});

describe('buff expiry (buffEnd events)', () => {
  it('a buff cast by the last actor of a round ends at that round end, before the next turn order is fixed', () => {
    const result = run(duel(unitSetup('test_selfspd', { hp: 1e7, atk: 1, spd: 50 }), unitSetup('test_dummy', { hp: 1e7, atk: 1, spd: 100 }), 1, 4));
    const ev = result.events;
    const rounds = roundOfEvents(ev);
    const buffIdx = ev.findIndex((e) => e.t === 'buff' && is(e.target, A0));
    const round = rounds[buffIdx];
    const turns = ev.filter((e, i) => rounds[i] === round && (e.t === 'action' || e.t === 'skip'));
    expect(turns[turns.length - 1]).toMatchObject({ t: 'action', actor: A0, kind: 'skill' });
    const endIdx = ev.findIndex((e) => e.t === 'buffEnd' && is(e.target, A0));
    expect(ev[endIdx]).toEqual({ t: 'buffEnd', target: A0, stat: 'spd', amount: 100 });
    expect(rounds[endIdx]).toBe(round);
    expect(endIdx).toBeGreaterThan(buffIdx);
    // The engine dropped the buff: the slower attacker acts after the defender next round.
    const nextFirst = ev.find((e, i) => rounds[i] === round + 1 && (e.t === 'action' || e.t === 'skip'));
    expect(nextFirst).toMatchObject({ actor: D0 });
  });

  it('battleStart buffs end at round N end; round-end buffs one round later; death ends all buffs', () => {
    const hastened = run(duel(unitSetup('test_hastener', { spd: 50 }), unitSetup('test_dummy', { hp: 1e7, atk: 1 }), 1, 3));
    const r1 = roundOfEvents(hastened.events);
    const spdEndRounds = (result: BattleResult, rounds: number[]) =>
      result.events.flatMap((e, i) => (e.t === 'buffEnd' && e.stat === 'spd' && is(e.target, A0) ? [rounds[i]] : []));
    expect(spdEndRounds(hastened, r1)).toEqual([1]);

    const rally = run(duel(unitSetup('test_rally', { spd: 50 }), unitSetup('test_dummy', { hp: 1e7, atk: 1 }), 1, 4));
    const r2 = roundOfEvents(rally.events);
    // Applied at the end of rounds 1..4 (duration 1) -> each expires one round end later (the last one never does).
    expect(spdEndRounds(rally, r2)).toEqual([2, 3, 4]);

    // A0 (front, the only defaultEnemy) holds two battleStart +10 spd buffs when the brute kills it in round 1.
    const setup: BattleSetup = {
      attackers: team({ 0: unitSetup('test_spd_mourn', { hp: 300, atk: 1, spd: 50 }), 2: unitSetup('test_spd_mourn', { hp: 1e7, atk: 1 }) }),
      defenders: team({ 0: unitSetup('test_brute', { hp: 1e7, atk: 400 }) }),
      seed: 2,
      maxRounds: 2,
    };
    const result = run(setup); // checkInvariants: no buff stays active on a dead unit
    const death = result.events.findIndex((e) => e.t === 'death' && is(e.target, A0));
    expect(roundOfEvents(result.events)[death]).toBe(1);
    expect(result.events.slice(death + 1, death + 3)).toEqual([
      { t: 'buffEnd', target: A0, stat: 'spd', amount: 10 },
      { t: 'buffEnd', target: A0, stat: 'spd', amount: 10 },
    ]);
    expect(result.events.slice(death + 3).some((e) => 'target' in e && is(e.target, A0))).toBe(false);
  });

  it('turn order each round matches the spd buffs announced by buff / buffEnd events', () => {
    const rng = new Rng(4242);
    const ids = SPD_FIXTURES.map((h) => h.id);
    let checkedRounds = 0;
    let buffEnds = 0;
    for (let c = 0; c < 40; c++) {
      const side = () =>
        team(Object.fromEntries([0, 1, 2].map((pos) => [pos, unitSetup(rng.pick(ids), { hp: rng.int(800, 4000), atk: 100, spd: rng.int(60, 140) })])));
      const setup: BattleSetup = { attackers: side(), defenders: side(), seed: c, maxRounds: 8 };
      const result = run(setup);
      const key = (r: UnitRef) => `${r.side}:${r.pos}`;
      const baseSpd = new Map<string, number>();
      for (const s of ['attacker', 'defender'] as const) {
        (s === 'attacker' ? setup.attackers : setup.defenders).forEach((u, pos) => u && baseSpd.set(`${s}:${pos}`, u.stats.spd));
      }
      const buffs = new Map<string, number[]>([...baseSpd.keys()].map((k) => [k, []]));
      const dead = new Set<string>();
      let predicted: string[] = [];
      let actual: string[] = [];
      const compare = () => {
        const remaining = predicted.filter((k) => actual.includes(k));
        expect(actual, `case ${c}`).toEqual(remaining);
        checkedRounds++;
      };
      for (const e of result.events) {
        if (e.t === 'roundStart') {
          if (e.round > 1) compare();
          const effSpd = (k: string) => Math.max(0, baseSpd.get(k)! + buffs.get(k)!.reduce((a, b) => a + b, 0));
          predicted = [...baseSpd.keys()]
            .filter((k) => !dead.has(k))
            .sort((a, b) => effSpd(b) - effSpd(a) || (a < b ? -1 : a > b ? 1 : 0));
          actual = [];
        } else if (e.t === 'action' || e.t === 'skip') actual.push(key(e.actor));
        else if (e.t === 'death') dead.add(key(e.target));
        else if (e.t === 'buff' && e.stat === 'spd') buffs.get(key(e.target))!.push(e.amount);
        else if (e.t === 'buffEnd' && e.stat === 'spd') {
          const list = buffs.get(key(e.target))!;
          expect(list).toContain(e.amount);
          list.splice(list.indexOf(e.amount), 1);
          buffEnds++;
        }
      }
      if (result.rounds > 0) compare();
    }
    expect(checkedRounds).toBeGreaterThan(150);
    expect(buffEnds).toBeGreaterThan(100);
  });
});

describe('targeting', () => {
  it('defaultEnemy prefers the front row, then falls back to the back row', () => {
    const setup: BattleSetup = {
      attackers: team({ 0: unitSetup('test_brute', { hp: 1e7, atk: 200 }) }),
      defenders: team({ 0: unitSetup('test_dummy', { hp: 1500, atk: 1 }), 3: unitSetup('test_dummy', { hp: 1e7, atk: 1 }) }),
      seed: 6,
    };
    const result = run(setup);
    const death = result.events.findIndex((e) => e.t === 'death' && is(e.target, D0));
    expect(death).toBeGreaterThan(-1);
    result.events.forEach((e, i) => {
      if (e.t !== 'action' || !is(e.actor, A0)) return;
      expect(e.targets).toEqual([{ side: 'defender', pos: i < death ? 0 : 3 }]);
    });
  });

  it('defaultEnemy picks randomly among living front units', () => {
    const targeted = new Set<number>();
    for (let seed = 0; seed < 20; seed++) {
      const r = simulateBattle({
        attackers: team({ 0: unitSetup('test_dummy') }),
        defenders: team({ 0: unitSetup('test_dummy', { hp: 1e7 }), 1: unitSetup('test_dummy', { hp: 1e7 }), 2: unitSetup('test_dummy') }),
        seed,
        maxRounds: 1,
      });
      for (const e of r.events) if (e.t === 'action' && is(e.actor, A0)) e.targets.forEach((t) => targeted.add(t.pos));
    }
    expect([...targeted].sort()).toEqual([0, 1]);
  });

  it('row selectors fall back to the other row when theirs is empty', () => {
    const ctx = new BattleContext({
      attackers: team({ 0: unitSetup('test_dummy') }),
      defenders: team({ 3: unitSetup('test_dummy'), 5: unitSetup('test_dummy') }),
      seed: 1,
    });
    const actor = ctx.attackers[0]!;
    const pos = (sel: 'frontEnemies' | 'backEnemies' | 'allEnemies') => selectTargets(ctx, actor, { selector: sel }, []).map((u) => u.ref.pos);
    expect(pos('frontEnemies')).toEqual([3, 5]);
    expect(pos('backEnemies')).toEqual([3, 5]);
    ctx.defenders[3]!.hp = 0;
    expect(pos('allEnemies')).toEqual([5]);
    expect(selectTargets(ctx, actor, { selector: 'previous' }, [ctx.defenders[3]!, ctx.defenders[5]!]).map((u) => u.ref.pos)).toEqual([5]);
  });
});

describe('empty slots & one-sided teams', () => {
  const lone = unitSetup('test_dummy');
  const empty = team({});

  it('a side with no units loses immediately; both empty => defender wins', () => {
    const noAttackers = run({ attackers: empty, defenders: team({ 2: lone }), seed: 1 });
    expect(noAttackers).toMatchObject({ winner: 'defender', rounds: 0, events: [{ t: 'battleEnd', winner: 'defender' }] });
    expect(noAttackers.initial).toHaveLength(1);
    expect(noAttackers.unitStats).toEqual([{ ref: { side: 'defender', pos: 2 }, damageDealt: 0, damageTaken: 0, healingDone: 0 }]);

    const noDefenders = run({ attackers: team({ 5: lone }), defenders: empty, seed: 1 });
    expect(noDefenders).toMatchObject({ winner: 'attacker', rounds: 0, events: [{ t: 'battleEnd', winner: 'attacker' }] });

    const nobody = run({ attackers: empty, defenders: empty, seed: 1 });
    expect(nobody).toMatchObject({ winner: 'defender', rounds: 0, initial: [], final: [], unitStats: [] });
  });

  it('sparse teams battle normally and every present unit has snapshots and stats', () => {
    const setup: BattleSetup = {
      attackers: team({ 1: unitSetup('test_brute'), 4: unitSetup('test_healer') }),
      defenders: team({ 3: unitSetup('test_burner'), 5: unitSetup('test_thorns') }),
      seed: 77,
    };
    const result = run(setup);
    const refs = ['attacker:1', 'attacker:4', 'defender:3', 'defender:5'];
    const keys = (list: { ref: UnitRef }[]) => list.map((s) => `${s.ref.side}:${s.ref.pos}`);
    expect(keys(result.initial)).toEqual(refs);
    expect(keys(result.final)).toEqual(refs);
    expect(keys(result.unitStats)).toEqual(refs);
  });
});
