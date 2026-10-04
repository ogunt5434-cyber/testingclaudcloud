import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/core/battle/engine';
import { FACTIONS, MAX_STARS, LEVEL_CAP } from '../src/core/constants';
import { Rng } from '../src/core/rng';
import type {
  BattleSetup,
  BattleUnitSetup,
  HeroDef,
  PassiveDef,
  PassiveTrigger,
  SkillEffect,
  SkillTarget,
  StatKey,
  StatusKind,
  TargetSelector,
} from '../src/core/types';
import { HEROES } from '../src/data/heroes';
import { checkInvariants, fixtureHero, makeStats, registerHeroes, rosterStats } from './battle-fixtures';

const SELECTORS: TargetSelector[] = [
  'self', 'defaultEnemy', 'randomEnemies', 'allEnemies', 'frontEnemies', 'backEnemies',
  'lowestHpEnemy', 'highestAtkEnemy', 'allAllies', 'lowestHpAlly', 'randomAllies', 'previous',
];
const STAT_KEYS: StatKey[] = [
  'hp', 'atk', 'armor', 'spd', 'crit', 'critDmg', 'hit', 'dodge', 'skillDmg', 'dmgReduce', 'controlImmune', 'armorBreak',
];
const STATUSES: StatusKind[] = ['stun', 'freeze', 'petrify', 'silence', 'burn', 'poison', 'bleed'];
const TRIGGERS: PassiveTrigger[] = ['battleStart', 'roundEnd', 'onAttack', 'onHit', 'onAllyDeath', 'onDeath'];

const between = (rng: Rng, lo: number, hi: number): number => lo + (hi - lo) * rng.next();

function randomTarget(rng: Rng): SkillTarget {
  return { selector: rng.pick(SELECTORS), count: rng.int(1, 4) };
}

function randomEffect(rng: Rng): SkillEffect {
  const target = randomTarget(rng);
  switch (rng.int(0, 4)) {
    case 0:
      return {
        type: 'damage',
        target,
        multiplier: between(rng, 0.3, 4),
        ignoreArmor: rng.chance(0.3) ? between(rng, 0, 1) : undefined,
        bonusVsStatus: rng.chance(0.3) ? { status: rng.pick(STATUSES), multiplier: between(rng, 1, 2.5) } : undefined,
      };
    case 1:
      return { type: 'heal', target, multiplier: between(rng, 0.2, 2.5) };
    case 2:
      return {
        type: 'buff',
        target,
        stat: rng.pick(STAT_KEYS),
        amount: between(rng, -0.6, 0.8),
        duration: rng.int(1, 4),
        chance: rng.chance(0.5) ? rng.next() : undefined,
      };
    case 3:
      return { type: 'status', target, status: rng.pick(STATUSES), chance: rng.next(), duration: rng.int(1, 3), value: between(rng, 0.05, 0.8) };
    default:
      return { type: 'energy', target, amount: rng.int(-150, 150) };
  }
}

function randomEffects(rng: Rng, min: number, max: number): SkillEffect[] {
  return Array.from({ length: rng.int(min, max) }, () => randomEffect(rng));
}

function randomPassive(rng: Rng, index: number): PassiveDef {
  const name = `Pasif ${index}`;
  if (rng.chance(0.3)) {
    const key = rng.pick(STAT_KEYS);
    return { name, description: name, stats: { [key]: between(rng, -0.2, 0.5) } };
  }
  return {
    name,
    description: name,
    trigger: rng.pick(TRIGGERS),
    chance: rng.chance(0.5) ? rng.next() : undefined,
    effects: randomEffects(rng, 0, 3),
  };
}

function randomHero(rng: Rng, index: number): HeroDef {
  return fixtureHero(`test_fuzz_${index}`, {
    faction: rng.pick(FACTIONS),
    active: { name: `Yetenek ${index}`, description: '-', effects: randomEffects(rng, 0, 4) },
    passives: Array.from({ length: rng.int(0, 3) }, (_, i) => randomPassive(rng, i)),
  });
}

function randomFixtureUnit(rng: Rng, heroes: HeroDef[]): BattleUnitSetup {
  return {
    heroId: rng.pick(heroes).id,
    level: rng.int(1, 100),
    stars: rng.int(1, MAX_STARS),
    stats: makeStats({
      hp: rng.int(1, 6000),
      atk: rng.int(0, 600),
      armor: rng.int(0, 400),
      spd: rng.int(50, 160),
      crit: between(rng, 0, 0.6),
      critDmg: between(rng, 0, 1),
      hit: between(rng, 0, 0.4),
      dodge: between(rng, 0, 0.8),
      skillDmg: between(rng, 0, 0.8),
      dmgReduce: between(rng, 0, 0.8),
      controlImmune: between(rng, 0, 0.6),
      armorBreak: between(rng, 0, 0.6),
    }),
  };
}

function randomRosterUnit(rng: Rng, heroes: HeroDef[]): BattleUnitSetup {
  const def = rng.pick(heroes);
  const stars = rng.int(Math.min(def.rarity, MAX_STARS), MAX_STARS);
  const level = rng.int(1, LEVEL_CAP[stars]);
  return { heroId: def.id, level, stars, stats: rosterStats(def, level, stars) };
}

function randomTeam(rng: Rng, makeUnit: () => BattleUnitSetup): (BattleUnitSetup | null)[] {
  const fill = rng.next();
  return Array.from({ length: 6 }, () => (rng.chance(fill) ? makeUnit() : null));
}

function randomSetup(rng: Rng, makeUnit: () => BattleUnitSetup): BattleSetup {
  return {
    attackers: randomTeam(rng, makeUnit),
    defenders: randomTeam(rng, makeUnit),
    seed: rng.int(0, 2 ** 31),
    maxRounds: rng.chance(0.2) ? rng.int(0, 20) : undefined,
  };
}

/** Runs one fuzz case; returns failure description or null. Also checks determinism & purity. */
function fuzzCase(setup: BattleSetup): string | null {
  const frozen = JSON.stringify(setup);
  let result;
  try {
    result = simulateBattle(setup);
  } catch (err) {
    return `threw: ${(err as Error).stack}`;
  }
  if (JSON.stringify(setup) !== frozen) return 'setup was mutated';
  const errors = checkInvariants(setup, result);
  if (errors.length > 0) return errors.join('\n');
  if (JSON.stringify(simulateBattle(setup)) !== JSON.stringify(result)) return 'not deterministic';
  return null;
}

function runFuzz(count: number, seed: number, makeUnit: (rng: Rng) => BattleUnitSetup): void {
  const rng = new Rng(seed);
  for (let i = 0; i < count; i++) {
    const setup = randomSetup(rng, () => makeUnit(rng));
    const failure = fuzzCase(setup);
    if (failure) throw new Error(`fuzz case ${i} failed:\n${failure}\nsetup: ${JSON.stringify(setup)}`);
  }
}

// Real roster snapshot taken at collection time (before fixtures are registered).
const ROSTER = HEROES.filter((h) => !h.id.startsWith('test_'));

describe('battle fuzz: random fixture heroes', () => {
  const heroRng = new Rng(20261004);
  const fuzzHeroes = Array.from({ length: 40 }, (_, i) => randomHero(heroRng, i));
  let unregister: () => void = () => {};
  beforeAll(() => {
    unregister = registerHeroes(fuzzHeroes);
  });
  afterAll(() => unregister());

  it('600 random battles keep every invariant', () => {
    runFuzz(600, 1234, (rng) => randomFixtureUnit(rng, fuzzHeroes));
  });

  it('full 6v6 teams keep every invariant', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 100; i++) {
      const team = () => Array.from({ length: 6 }, () => randomFixtureUnit(rng, fuzzHeroes));
      const failure = fuzzCase({ attackers: team(), defenders: team(), seed: i });
      expect(failure, `case ${i}`).toBeNull();
    }
  });
});

describe.skipIf(ROSTER.length === 0)('battle fuzz: real roster', () => {
  it('300 random battles with real heroes keep every invariant', () => {
    runFuzz(300, 777, (rng) => randomRosterUnit(rng, ROSTER));
  });

  it('every real hero can fight in a full team without errors', () => {
    const rng = new Rng(5);
    for (const def of ROSTER) {
      const unit = (): BattleUnitSetup => ({ heroId: def.id, level: 60, stars: 3, stats: rosterStats(def, 60, 3) });
      const others = () => Array.from({ length: 5 }, () => randomRosterUnit(rng, ROSTER));
      const setup: BattleSetup = { attackers: [unit(), ...others()], defenders: [...others(), unit()], seed: rng.int(0, 1e9) };
      expect(fuzzCase(setup), def.id).toBeNull();
    }
  });
});
