// Balance targets, checked with a deterministic simulated player (tests/balance-sim.ts) against the REAL
// battle engine & roster. Prints a short progression table. BALANCE_VERBOSE=1 prints every hour.
import { beforeAll, describe, expect, it } from 'vitest';
import { campaignEnemies, stagePower } from '../src/core/campaign';
import { newGameState } from '../src/core/save';
import { towerPower } from '../src/core/tower';
import { formatRow, runSim, snapshotOf, team, towerReach, wins, type Snapshot } from './balance-sim';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const VERBOSE = !!env.BALANCE_VERBOSE;
const SIM_HOURS = 168;
const REPORT_HOURS = [1, 6, 24, 72, 168];

describe('balance', () => {
  let snapshots: Snapshot[] = [];
  const tower = { at1h: 0, at24h: 0, at168h: 0 };

  beforeAll(() => {
    const run = runSim(SIM_HOURS, (sim) => {
      if (VERBOSE) console.log(formatRow(snapshotOf(sim)));
      if (sim.hour === 1) tower.at1h = towerReach(sim.state, 3);
      if (sim.hour === 24) tower.at24h = towerReach(sim.state, sim.state.campaign.cleared + 1);
    });
    snapshots = run.snapshots;
    tower.at168h = towerReach(run.sim.state, run.sim.state.campaign.cleared + 1);
    const table = REPORT_HOURS.map((h) => formatRow(snapshots[h])).join('\n');
    console.log(`Denge simülasyonu:\n${table}\nKule katı: 1s=${tower.at1h} 24s=${tower.at24h} 168s=${tower.at168h}`);
  }, 120_000);

  const stageAt = (hour: number) => snapshots[hour].stage;

  it('starter team (no upgrades) beats stage 1 in at least 2 of 3 seeds', () => {
    expect(wins(team(newGameState(0)), campaignEnemies(1), [1, 2, 3])).toBeGreaterThanOrEqual(2);
  });

  it('starter team at level 1 cannot beat stage 25', () => {
    expect(wins(team(newGameState(0)), campaignEnemies(25), [1, 2, 3])).toBe(0);
  });

  it('reaches stage 4+ after 1 hour', () => {
    expect(stageAt(1)).toBeGreaterThanOrEqual(4);
  });

  it('reaches stage 20..70 after 24 hours', () => {
    expect(stageAt(24)).toBeGreaterThanOrEqual(20);
    expect(stageAt(24)).toBeLessThanOrEqual(70);
  });

  it('reaches stage 60..200 after 168 hours and still progresses in the last 48 hours', () => {
    expect(stageAt(168)).toBeGreaterThanOrEqual(60);
    expect(stageAt(168)).toBeLessThanOrEqual(200);
    expect(stageAt(168)).toBeGreaterThan(stageAt(120));
  });

  it('tower floor 1 is beatable by the 1-hour player', () => {
    expect(tower.at1h).toBeGreaterThanOrEqual(1);
  });

  it('tower is harder than the campaign', () => {
    for (let n = 1; n <= 150; n++) expect(towerPower(n)).toBeGreaterThan(stagePower(n));
    expect(tower.at24h).toBeLessThan(stageAt(24));
    expect(tower.at168h).toBeLessThan(stageAt(168));
  });
});
