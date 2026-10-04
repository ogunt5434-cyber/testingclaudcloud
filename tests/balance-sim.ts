// Deterministic simulated player used by tests/balance.test.ts (not a test file itself).
// Every simulated hour it: claims idle rewards, summons with everything it has, stars up, sets the
// auto formation, equips the best gear, levels the team evenly and pushes the campaign until a loss.
import { simulateBattle } from '../src/core/battle/engine';
import { campaignEnemies, claimIdleRewards, HOUR_MS, stageFirstClearRewards } from '../src/core/campaign';
import { GEMS_PER_HEROIC_TEN } from '../src/core/constants';
import { autoFormationSlots } from '../src/core/formation';
import {
  addRewards,
  dismissHero,
  equipBest,
  findStarUpFodder,
  levelCap,
  levelUpCost,
  levelUpHero,
  starUpHero,
  starUpRequirement,
} from '../src/core/progression';
import { hashSeed, Rng } from '../src/core/rng';
import { newGameState } from '../src/core/save';
import { heroPower, toBattleUnit } from '../src/core/stats';
import { summon } from '../src/core/summon';
import { towerEnemies } from '../src/core/tower';
import type { BattleUnitSetup, GameState, HeroInstance } from '../src/core/types';

export const FIGHTS_PER_HOUR = 20;
export const SEEDS_PER_STAGE = 3;
/** Bench copies kept per hero id (enough fodder for any star-up). */
const COPIES_TO_KEEP = 4;
/** Bench heroes invested in once the whole formation is at its level cap. */
const BENCH_INVEST = 2;

export interface Sim {
  state: GameState;
  now: number;
  hour: number;
  rng: Rng;
}

export interface Snapshot {
  hour: number;
  stage: number;
  avgLevel: number;
  stars: string;
  power: number;
  playerLevel: number;
  heroes: number;
  gems: number;
  pulls: number;
}

export function newSim(seed = 'balance-sim'): Sim {
  return { state: newGameState(0), now: 0, hour: 0, rng: new Rng(hashSeed(seed)) };
}

export function team(state: GameState): (BattleUnitSetup | null)[] {
  return state.formation.map((uid) => {
    const hero = uid ? state.heroes.find((h) => h.uid === uid) : undefined;
    return hero ? toBattleUnit(hero) : null;
  });
}

function formationHeroes(state: GameState): HeroInstance[] {
  return state.heroes.filter((h) => state.formation.includes(h.uid));
}

/** Number of seeds (of `seeds`) the attackers win. */
export function wins(
  attackers: (BattleUnitSetup | null)[],
  defenders: (BattleUnitSetup | null)[],
  seeds: readonly number[],
): number {
  return seeds.filter((seed) => simulateBattle({ attackers, defenders, seed }).winner === 'attacker').length;
}

function summonAll(sim: Sim): void {
  const { state } = sim;
  const pull = (type: 'basic' | 'heroic', count: 1 | 10) => summon(state, type, count, sim.rng).ok;
  while (state.resources.basicScroll >= 10 && pull('basic', 10));
  while (state.resources.basicScroll >= 1 && pull('basic', 1));
  while (state.resources.heroicScroll >= 10 && pull('heroic', 10));
  while (state.resources.heroicScroll >= 1 && pull('heroic', 1));
  while (state.resources.gems >= GEMS_PER_HEROIC_TEN && pull('heroic', 10));
}

/** Stars up every hero that can (highest stars/level first), until nothing changes. */
function starUpAll(sim: Sim): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const hero of [...sim.state.heroes].sort((a, b) => b.stars - a.stars || b.level - a.level)) {
      const req = starUpRequirement(hero);
      if (!req || hero.level < req.levelRequired) continue;
      if (findStarUpFodder(sim.state, hero.uid).length < req.fodderCount) continue;
      if (starUpHero(sim.state, hero.uid).ok) changed = true;
    }
  }
}

/** Keeps the roster small: at most COPIES_TO_KEEP bench copies per hero id (best ones kept). */
function trimRoster(sim: Sim): void {
  const { state } = sim;
  const byId = new Map<string, HeroInstance[]>();
  for (const h of state.heroes) {
    if (!state.formation.includes(h.uid)) byId.set(h.heroId, [...(byId.get(h.heroId) ?? []), h]);
  }
  for (const copies of byId.values()) {
    copies.sort((a, b) => b.stars - a.stars || b.level - a.level);
    for (const extra of copies.slice(COPIES_TO_KEEP)) dismissHero(state, extra.uid);
  }
}

/** Levels the lowest-level hero of `heroes` one level at a time while affordable. */
function levelEvenly(state: GameState, heroes: HeroInstance[]): void {
  for (;;) {
    const next = heroes.filter((h) => h.level < levelCap(h.stars)).sort((a, b) => a.level - b.level)[0];
    if (!next) return;
    const cost = levelUpCost(next.level);
    if (cost.gold > state.resources.gold || cost.spirit > state.resources.spirit) return;
    levelUpHero(state, next.uid, 1);
  }
}

/** Formation first; once all of it is capped, invest in the highest-potential bench heroes. */
function levelUp(sim: Sim): void {
  const { state } = sim;
  const formation = formationHeroes(state);
  levelEvenly(state, formation);
  if (formation.some((h) => h.level < levelCap(h.stars))) return;
  const bench = state.heroes
    .filter((h) => !state.formation.includes(h.uid) && h.level < levelCap(h.stars))
    .sort((a, b) => b.stars - a.stars || heroPower(b) - heroPower(a))
    .slice(0, BENCH_INVEST);
  levelEvenly(state, bench);
}

function pushCampaign(sim: Sim): void {
  const { state } = sim;
  const attackers = team(state);
  for (let fight = 0; fight < FIGHTS_PER_HOUR; fight++) {
    const stage = state.campaign.cleared + 1;
    const seeds = Array.from({ length: SEEDS_PER_STAGE }, (_, i) => hashSeed('sim', stage, sim.hour, i));
    const defenders = campaignEnemies(stage);
    if (!seeds.some((seed) => wins(attackers, defenders, [seed]) > 0)) return;
    addRewards(state, stageFirstClearRewards(stage));
    state.campaign.cleared = stage;
  }
}

export function simulateHour(sim: Sim): void {
  sim.hour++;
  sim.now += HOUR_MS;
  claimIdleRewards(sim.state, sim.now);
  trimRoster(sim);
  summonAll(sim);
  starUpAll(sim);
  sim.state.formation = autoFormationSlots(sim.state.heroes);
  for (const hero of formationHeroes(sim.state)) equipBest(sim.state, hero.uid);
  levelUp(sim);
  pushCampaign(sim);
}

/** Highest tower floor cleared climbing from floor 1 (SEEDS_PER_STAGE tries per floor), up to `limit`. */
export function towerReach(state: GameState, limit: number): number {
  const attackers = team(state);
  let floor = 0;
  while (floor < limit) {
    const next = floor + 1;
    const seeds = Array.from({ length: SEEDS_PER_STAGE }, (_, i) => hashSeed('sim-tower', next, i));
    if (wins(attackers, towerEnemies(next), seeds) === 0) break;
    floor = next;
  }
  return floor;
}

export function snapshotOf(sim: Sim): Snapshot {
  const f = formationHeroes(sim.state);
  return {
    hour: sim.hour,
    stage: sim.state.campaign.cleared,
    avgLevel: Math.round(f.reduce((s, h) => s + h.level, 0) / Math.max(1, f.length)),
    stars: f.map((h) => h.stars).join(''),
    power: f.reduce((s, h) => s + heroPower(h), 0),
    playerLevel: sim.state.player.level,
    heroes: sim.state.heroes.length,
    gems: sim.state.resources.gems,
    pulls: sim.state.summon.totalPulls,
  };
}

export function formatRow(s: Snapshot): string {
  return [
    `saat ${String(s.hour).padStart(3)}`,
    `bölüm ${String(s.stage).padStart(3)}`,
    `ort.sv ${String(s.avgLevel).padStart(3)}`,
    `yıldız ${s.stars.padEnd(6)}`,
    `güç ${String(s.power).padStart(7)}`,
    `oyuncu sv ${String(s.playerLevel).padStart(3)}`,
    `kahraman ${String(s.heroes).padStart(3)}`,
    `çağırma ${s.pulls}`,
  ].join(' | ');
}

/** Runs the sim for `hours`, returning a snapshot per hour (index = hour). */
export function runSim(hours: number, onHour?: (sim: Sim) => void, seed?: string): { sim: Sim; snapshots: Snapshot[] } {
  const sim = newSim(seed);
  const snapshots: Snapshot[] = [snapshotOf(sim)];
  for (let h = 1; h <= hours; h++) {
    simulateHour(sim);
    snapshots.push(snapshotOf(sim));
    onHour?.(sim);
  }
  return { sim, snapshots };
}
