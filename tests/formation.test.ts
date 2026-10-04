// Auto formation: which 6 heroes it fields and where, checked against the real battle engine.
import { describe, expect, it } from 'vitest';
import { LEVEL_CAP, TEAM_SIZE } from '../src/core/constants';
import { simulateBattle } from '../src/core/battle/engine';
import { EXTRA_WARRIOR_WEIGHT, autoFormationSlots, autoFormationTeam, sortByPower } from '../src/core/formation';
import { Rng, hashSeed } from '../src/core/rng';
import { heroPower, heroStats, toBattleUnit } from '../src/core/stats';
import { getHeroDef, HEROES } from '../src/data/heroes';
import type { BattleUnitSetup, HeroInstance } from '../src/core/types';

const isWarrior = (h: HeroInstance) => getHeroDef(h.heroId).heroClass === 'warrior';

function roster(entries: [heroId: string, level: number, stars: number][]): HeroInstance[] {
  return entries.map(([heroId, level, stars], i) => ({ uid: `u${i}`, heroId, level, stars, equipment: {}, locked: false }));
}

const all5StarsAt60 = () => roster(HEROES.filter((d) => d.rarity === 5).map((d) => [d.id, 60, 5]));

/** The rule before EXTRA_WARRIOR_WEIGHT: the 6 highest-power heroes, arranged like autoFormationSlots. */
function pureTopPowerSlots(heroes: HeroInstance[]): (string | null)[] {
  const team = sortByPower(heroes).slice(0, TEAM_SIZE);
  const front = team
    .slice()
    .sort((a, b) => Number(isWarrior(b)) - Number(isWarrior(a)) || heroStats(b).hp - heroStats(a).hp)
    .slice(0, 2);
  const slots: (string | null)[] = [...front, ...team.filter((h) => !front.includes(h))].map((h) => h.uid);
  while (slots.length < TEAM_SIZE) slots.push(null);
  return slots;
}

function units(heroes: HeroInstance[], slots: (string | null)[]): (BattleUnitSetup | null)[] {
  return slots.map((uid) => (uid ? toBattleUnit(heroes.find((h) => h.uid === uid)!) : null));
}

/** Win rate of team `a` against team `b` over `n` mirrored pairs of battles. */
function headToHead(a: (BattleUnitSetup | null)[], b: (BattleUnitSetup | null)[], n: number, tag: string | number): number {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    if (simulateBattle({ attackers: a, defenders: b, seed: hashSeed('formation', tag, i, 0) }).winner === 'attacker') wins++;
    if (simulateBattle({ attackers: b, defenders: a, seed: hashSeed('formation', tag, i, 1) }).winner === 'defender') wins++;
  }
  return wins / (2 * n);
}

describe('autoFormationTeam / autoFormationSlots', () => {
  it('fields the two strongest warriors in front and no third warrior over an equal-level damage dealer', () => {
    const heroes = all5StarsAt60();
    const team = autoFormationTeam(heroes);
    expect(team).toHaveLength(6);
    expect(team.filter(isWarrior)).toHaveLength(2);
    const slots = autoFormationSlots(heroes);
    const strongestWarriors = sortByPower(heroes).filter(isWarrior).slice(0, 2).map((h) => h.uid);
    expect(new Set(slots.slice(0, 2))).toEqual(new Set(strongestWarriors));
    // The old pure-power rule took all three 5★ warriors (one of them stuck in the back row).
    expect(pureTopPowerSlots(heroes).filter((uid) => isWarrior(heroes.find((h) => h.uid === uid)!))).toHaveLength(3);
  });

  it('still fields a third warrior that is much stronger than the alternatives', () => {
    const heroes = roster([
      ['demirkol', 60, 5],
      ['kemikkiran', 60, 5],
      ['kizilboynuz', 60, 5],
      ['aycalan', 60, 5],
      ['kefen', 60, 5],
      ['tanyeri', 60, 5],
      ['gobelek', 1, 2],
    ]);
    const third = heroes[2];
    expect(heroPower(third) * EXTRA_WARRIOR_WEIGHT).toBeGreaterThan(heroPower(heroes[6]));
    expect(autoFormationTeam(heroes)).toContain(third);
    expect(autoFormationTeam(heroes)).not.toContain(heroes[6]);
    expect(autoFormationSlots(heroes)[0]).not.toBeNull();
  });

  it('matches the pure power order when there is no extra warrior, and pads small rosters with null', () => {
    const noWarriors = all5StarsAt60().filter((h) => !isWarrior(h));
    expect(autoFormationTeam(noWarriors).map((h) => h.uid)).toEqual(sortByPower(noWarriors).slice(0, 6).map((h) => h.uid));
    const small = roster([
      ['arslan', 5, 2],
      ['ninni', 3, 2],
    ]);
    const slots = autoFormationSlots(small);
    expect(slots).toHaveLength(TEAM_SIZE);
    expect(slots.slice(0, 2)).toEqual(['u0', 'u1']);
    expect(slots.slice(2)).toEqual([null, null, null, null]);
  });

  it('picks a team that beats the pure top-power team with the real engine', () => {
    const heroes = all5StarsAt60();
    // Every 5★ owned at L60: measured ~80% (the pure power pick puts a third warrior in the back row).
    expect(headToHead(units(heroes, autoFormationSlots(heroes)), units(heroes, pureTopPowerSlots(heroes)), 150, 'all5')).toBeGreaterThan(0.65);

    // Random realistic rosters (rarity stars, sometimes one more; levels spread around a common base):
    // whenever the two rules disagree, the new pick should win more often than not (measured ~65%).
    let total = 0;
    let differing = 0;
    for (let r = 0; r < 300; r++) {
      const rng = new Rng(hashSeed('formation-roster', r));
      const base = 5 + rng.int(0, 80);
      const heroes = roster(
        Array.from({ length: 7 + rng.int(0, 15) }, () => {
          const def = HEROES[rng.int(0, HEROES.length - 1)];
          const stars = Math.min(5, def.rarity + (rng.chance(0.25) ? 1 : 0));
          return [def.id, Math.max(1, Math.min(LEVEL_CAP[stars], base + rng.int(-20, 20))), stars];
        }),
      );
      const auto = autoFormationSlots(heroes);
      const old = pureTopPowerSlots(heroes);
      if (auto.slice().sort().join() === old.slice().sort().join()) continue;
      differing++;
      total += headToHead(units(heroes, auto), units(heroes, old), 20, r);
    }
    expect(differing).toBeGreaterThan(10);
    expect(total / differing).toBeGreaterThan(0.55);
  }, 60_000);
});
