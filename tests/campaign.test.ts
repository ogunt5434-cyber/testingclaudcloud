import { describe, expect, it } from 'vitest';
import {
  bankIdleRewards,
  campaignEnemies,
  claimIdleRewards,
  computeIdleRewards,
  HOUR_MS,
  idleRatePerHour,
  isBossStage,
  stageEnemyCount,
  stageFirstClearRewards,
  stageLabel,
  stagePower,
  stageStrength,
  strengthCurve,
  syncIdleClock,
} from '../src/core/campaign';
import { mergeRewards } from '../src/core/progression';
import { IDLE_CAP_HOURS, LEVEL_CAP, TEAM_SIZE } from '../src/core/constants';
import { enemyRank } from '../src/core/enemies';
import { newGameState } from '../src/core/save';
import { growthMultiplier } from '../src/core/stats';
import { isTowerBonusFloor, towerEnemies, towerPower, towerRewards, towerStrength } from '../src/core/tower';
import { getEquipDef } from '../src/data/equipment';
import { isHeroId } from '../src/data/heroes';
import type { BattleUnitSetup, GameState } from '../src/core/types';

const units = (team: (BattleUnitSetup | null)[]) => team.filter((u): u is BattleUnitSetup => u !== null);

function idleState(cleared: number, idleSince = 0): GameState {
  const state = newGameState(0);
  state.campaign.cleared = cleared;
  state.campaign.idleSince = idleSince;
  return state;
}

describe('stages', () => {
  it('labels stages by chapter', () => {
    expect(stageLabel(1)).toBe('1-1');
    expect(stageLabel(10)).toBe('1-10');
    expect(stageLabel(11)).toBe('2-1');
    expect(stageLabel(23)).toBe('3-3');
  });

  it('builds deterministic teams from real heroes', () => {
    for (const stage of [1, 5, 10, 37, 120]) {
      const team = campaignEnemies(stage);
      expect(team).toHaveLength(TEAM_SIZE);
      expect(campaignEnemies(stage)).toEqual(team);
      const ids = units(team).map((u) => u.heroId);
      expect(ids.every(isHeroId)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
      expect(team[0]).not.toBeNull();
    }
    expect(campaignEnemies(37)).not.toEqual(campaignEnemies(38));
  });

  it('has fewer enemies in the first stages', () => {
    expect(units(campaignEnemies(1))).toHaveLength(3);
    expect(stageEnemyCount(1)).toBeLessThan(stageEnemyCount(4));
    for (let s = 7; s < 30; s++) expect(units(campaignEnemies(s))).toHaveLength(TEAM_SIZE);
  });

  it('ramps level, stars and power', () => {
    for (let s = 1; s < 200; s++) {
      if (!isBossStage(s)) expect(stageStrength(s + 1)).toBeGreaterThan(stageStrength(s));
    }
    // Team composition adds ~±7% noise per stage, so power is compared per chapter (10 stages).
    const chapterPower = (c: number) =>
      Array.from({ length: 10 }, (_, i) => stagePower(c * 10 + i + 1)).reduce((a, b) => a + b);
    for (let c = 0; c < 20; c++) expect(chapterPower(c + 1)).toBeGreaterThan(chapterPower(c));
    const early = units(campaignEnemies(2))[0];
    const late = units(campaignEnemies(150))[0];
    expect(late.level).toBeGreaterThan(early.level);
    expect(late.stars).toBeGreaterThan(early.stars);
  });

  it('makes every 10th stage a stronger boss stage', () => {
    expect(isBossStage(10)).toBe(true);
    expect(isBossStage(11)).toBe(false);
    expect(stageStrength(20)).toBeGreaterThan(strengthCurve(20));
    expect(stageStrength(20)).toBeGreaterThan(stageStrength(21));
    expect(stagePower(20)).toBeGreaterThan(stagePower(19));
  });

  it('converts strength into a matching level/star rank', () => {
    for (const strength of [1.25, 2, 5, 9, 15, 25, 40]) {
      const { stars, level } = enemyRank(strength);
      expect(level).toBeGreaterThanOrEqual(1);
      if (stars < 5) expect(level).toBeLessThanOrEqual(LEVEL_CAP[stars]);
      expect(growthMultiplier(level, stars) / strength).toBeCloseTo(1, 1);
    }
  });
});

describe('first clear rewards', () => {
  it('gives gold, spirit, gems and exp; bosses give more and scrolls', () => {
    const normal = stageFirstClearRewards(12);
    const boss = stageFirstClearRewards(20);
    expect(normal.resources.gold).toBeGreaterThan(0);
    expect(normal.resources.spirit).toBeGreaterThan(0);
    expect(normal.resources.gems).toBeGreaterThan(0);
    expect(normal.playerExp).toBeGreaterThan(0);
    expect(boss.resources.gems!).toBeGreaterThan(normal.resources.gems! * 2);
    expect(boss.resources.heroicScroll).toBe(1);
    expect(stageFirstClearRewards(15).resources.basicScroll).toBe(1);
    expect(normal.resources.basicScroll).toBeUndefined();
  });
});

describe('idle rewards', () => {
  it('grows with cleared stage, gear tier rising with chapters', () => {
    const tierOf = (r: ReturnType<typeof idleRatePerHour>) =>
      Math.max(...Object.keys(r.equipment ?? {}).map((id) => getEquipDef(id).tier));
    const low = idleRatePerHour(0);
    const high = idleRatePerHour(100);
    expect(high.resources.gold!).toBeGreaterThan(low.resources.gold!);
    expect(high.resources.spirit!).toBeGreaterThan(low.resources.spirit!);
    expect(high.playerExp!).toBeGreaterThan(low.playerExp!);
    expect(high.resources.basicScroll!).toBeGreaterThan(low.resources.basicScroll!);
    expect(tierOf(high)).toBeGreaterThan(tierOf(low));
    expect(tierOf(idleRatePerHour(10_000))).toBe(6);
  });

  it('is deterministic and proportional to elapsed time', () => {
    const state = idleState(30);
    const rate = idleRatePerHour(30);
    const two = computeIdleRewards(state, 2 * HOUR_MS);
    expect(computeIdleRewards(state, 2 * HOUR_MS)).toEqual(two);
    expect(two.resources.gold).toBe(Math.floor(rate.resources.gold! * 2));
    expect(two.playerExp).toBe(Math.floor(rate.playerExp! * 2));
    expect(computeIdleRewards(state, 0).resources.gold).toBe(0);
  });

  it('is capped at IDLE_CAP_HOURS', () => {
    const state = idleState(30);
    const capped = computeIdleRewards(state, IDLE_CAP_HOURS * HOUR_MS);
    expect(computeIdleRewards(state, 5 * IDLE_CAP_HOURS * HOUR_MS).resources.gold).toBe(capped.resources.gold);
    expect(computeIdleRewards(state, (IDLE_CAP_HOURS + 1) * HOUR_MS).playerExp).toBe(capped.playerExp);
  });

  it('gives nothing when the clock goes backwards', () => {
    const rewards = computeIdleRewards(idleState(30, 10 * HOUR_MS), 5 * HOUR_MS);
    expect(rewards.resources.gold).toBe(0);
    expect(rewards.equipment).toBeUndefined();
  });

  it('accumulates fractional scrolls and gear across frequent claims', () => {
    const state = idleState(30);
    const rate = idleRatePerHour(30);
    let scrolls = 0;
    let gear = 0;
    const start = state.resources.basicScroll;
    for (let minute = 10; minute <= 100 * 60; minute += 10) {
      const r = claimIdleRewards(state, minute * 60_000);
      scrolls += r.resources.basicScroll ?? 0;
      gear += Object.values(r.equipment ?? {}).reduce((a, b) => a + b, 0);
    }
    const expectedGear = Object.values(rate.equipment!).reduce((a, b) => a + b, 0) * 100;
    expect(Math.abs(scrolls - rate.resources.basicScroll! * 100)).toBeLessThanOrEqual(1);
    expect(Math.abs(gear - expectedGear)).toBeLessThanOrEqual(Object.keys(rate.equipment!).length);
    expect(state.resources.basicScroll).toBe(start + scrolls);
  });

  it('pays the same total however often the player claims (fractional gold/spirit/exp carry over)', () => {
    for (const cleared of [0, 7, 30]) {
      const once = computeIdleRewards(idleState(cleared), HOUR_MS);
      for (const stepSec of [30, 59, 90, 600]) {
        const state = idleState(cleared);
        let gold = 0;
        let spirit = 0;
        let exp = 0;
        let t = 0;
        while (t < HOUR_MS) {
          t = Math.min(HOUR_MS, t + stepSec * 1000);
          const r = claimIdleRewards(state, t);
          gold += r.resources.gold ?? 0;
          spirit += r.resources.spirit ?? 0;
          exp += r.playerExp ?? 0;
        }
        expect({ cleared, stepSec, gold, spirit, exp }).toEqual({
          cleared,
          stepSec,
          gold: once.resources.gold,
          spirit: once.resources.spirit,
          exp: once.playerExp,
        });
      }
    }
    // Stage 0 earns 60 exp/hour: claiming every 30s used to floor every claim to 0.
    expect(computeIdleRewards(idleState(0), HOUR_MS).playerExp).toBe(60);
  });

  it('a clock rewind between claims never pays the same time twice', () => {
    const state = idleState(50);
    const start = state.resources.gold;
    const paid = [5, 2].map((h) => claimIdleRewards(state, h * HOUR_MS).resources.gold!);
    expect(paid[1]).toBe(0);
    // The rewound claim restarts the chest at the earlier time, but time up to 5h stays marked as paid.
    expect(state.campaign.idleSince).toBe(2 * HOUR_MS);
    expect(state.campaign.idlePaidUntil).toBe(5 * HOUR_MS);
    paid.push(claimIdleRewards(state, 6 * HOUR_MS).resources.gold!);
    const single = computeIdleRewards(idleState(50), 6 * HOUR_MS).resources.gold!;
    expect(paid.reduce((a, b) => a + b)).toBe(single);
    expect(state.resources.gold).toBe(start + single);
    expect(state.campaign.idlePaidUntil).toBe(6 * HOUR_MS);
  });

  it('restarts (instead of freezing) a chest whose timer is ahead of the clock', () => {
    const DAY = 24 * HOUR_MS;
    const state = idleState(30, 30 * DAY); // last collected while the device clock was 30 days ahead
    state.campaign.idlePaidUntil = 30 * DAY;
    expect(computeIdleRewards(state, 2 * HOUR_MS).resources.gold).toBe(0);
    expect(syncIdleClock(state, 2 * HOUR_MS)).toBe(true);
    expect(state.campaign.idleSince).toBe(2 * HOUR_MS);
    expect(syncIdleClock(state, 2 * HOUR_MS)).toBe(false);
    const later = computeIdleRewards(state, 5 * HOUR_MS);
    expect(later.resources.gold).toBe(computeIdleRewards(idleState(30, 2 * HOUR_MS), 5 * HOUR_MS).resources.gold);
    expect(later.resources.gold).toBeGreaterThan(0);
    // Claims keep working below the old mark, and the mark never moves back.
    expect(claimIdleRewards(state, 5 * HOUR_MS).resources.gold).toBe(later.resources.gold);
    expect(state.campaign.idlePaidUntil).toBe(30 * DAY);
  });

  it('banking before a stage clear keeps earned hours at the old rate and the 12h cap', () => {
    const state = idleState(20);
    const sixHours = computeIdleRewards(state, 6 * HOUR_MS);
    bankIdleRewards(state, 6 * HOUR_MS);
    state.campaign.cleared = 30;
    expect(computeIdleRewards(state, 6 * HOUR_MS)).toEqual(sixHours);
    expect(state.campaign.idleSince).toBe(0); // the chest timer keeps running
    // Later hours pay the new stage's rate.
    const after = idleState(30, 6 * HOUR_MS);
    expect(computeIdleRewards(state, 8 * HOUR_MS)).toEqual(mergeRewards(sixHours, computeIdleRewards(after, 8 * HOUR_MS)));
    // Still 12h in total: 6h at stage 20 + 6h at stage 30, no matter how long the chest waits.
    const full = mergeRewards(sixHours, computeIdleRewards(after, 12 * HOUR_MS));
    expect(computeIdleRewards(state, 40 * HOUR_MS)).toEqual(full);
    expect(full.resources.gold).toBeLessThan(computeIdleRewards(idleState(30), 12 * HOUR_MS).resources.gold!);
    // Banking again at the same moment (several wins in a row) changes nothing.
    bankIdleRewards(state, 8 * HOUR_MS);
    const twice = computeIdleRewards(state, 8 * HOUR_MS);
    bankIdleRewards(state, 8 * HOUR_MS);
    state.campaign.cleared = 31;
    expect(computeIdleRewards(state, 8 * HOUR_MS)).toEqual(twice);
    // Claiming pays the bank and empties it.
    const gold = state.resources.gold;
    expect(claimIdleRewards(state, 8 * HOUR_MS)).toEqual(twice);
    expect(state.resources.gold).toBe(gold + twice.resources.gold!);
    expect(state.campaign.idleBank).toBeUndefined();
    expect(computeIdleRewards(state, 8 * HOUR_MS).resources.gold).toBe(0);
  });

  it('claim adds rewards to state and resets the timer', () => {
    const state = idleState(10);
    const now = 3 * HOUR_MS;
    const expected = computeIdleRewards(state, now);
    const gold = state.resources.gold;
    expect(claimIdleRewards(state, now)).toEqual(expected);
    expect(state.resources.gold).toBe(gold + expected.resources.gold!);
    expect(state.campaign.idleSince).toBe(now);
    expect(computeIdleRewards(state, now).resources.gold).toBe(0);
  });
});

describe('tower', () => {
  it('is deterministic, always a full team, and harder than the same campaign stage', () => {
    for (const floor of [1, 7, 25, 80]) {
      expect(towerEnemies(floor)).toEqual(towerEnemies(floor));
      expect(units(towerEnemies(floor))).toHaveLength(TEAM_SIZE);
      expect(towerStrength(floor)).toBeGreaterThan(stageStrength(floor));
      expect(towerPower(floor)).toBeGreaterThan(stagePower(floor));
      expect(towerStrength(floor + 1)).toBeGreaterThan(towerStrength(floor));
    }
  });

  it('rewards gems and gives a scroll bonus every 5th floor', () => {
    const normal = towerRewards(4);
    const bonus = towerRewards(5);
    expect(normal.resources.gems).toBeGreaterThan(0);
    expect(normal.resources.heroicScroll).toBeUndefined();
    expect(isTowerBonusFloor(5)).toBe(true);
    expect(bonus.resources.heroicScroll).toBe(1);
    expect(bonus.resources.gems!).toBeGreaterThan(normal.resources.gems!);
  });
});
