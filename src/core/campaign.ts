// Campaign stages & idle rewards (SPEC §5).
// Difficulty is a smooth "strength" curve (see enemies.ts); rewards scale with the stage.
// Idle rewards are deterministic expected values: fractional items (scrolls, gear) are counted as
// floor(rate * t) differences on an absolute time axis, so partial items carry over between claims.
import { IDLE_CAP_HOURS, TEAM_SIZE } from './constants';
import { buildEnemyTeam } from './enemies';
import { addRewards } from './progression';
import { hashSeed } from './rng';
import { teamPowerOf } from './stats';
import { EQUIP_SLOTS } from './types';
import { equipId, MAX_EQUIP_TIER } from '../data/equipment';
import type { BattleUnitSetup, GameState, Resources, Rewards } from './types';

export const STAGES_PER_CHAPTER = 10;
export const HOUR_MS = 3_600_000;

// ---------------------------------------------------------------------------
// Tuning (validated by tests/balance.test.ts)
// ---------------------------------------------------------------------------

/**
 * Campaign balance knobs. Exported (and mutable) so tuning scripts can sweep them; the game never
 * changes them at runtime.
 */
export const CAMPAIGN_TUNING = {
  /** strength(stage) = strengthBase * (1 + strengthSlope*(stage-1))^strengthExp. */
  strengthBase: 1.25,
  strengthSlope: 0.2,
  strengthExp: 0.85,
  /** Every 10th stage is a boss stage this much stronger. */
  bossMult: 1.08,
  /** Idle gold per hour = idleGoldBase + idleGoldPer * cleared^idleGoldExp; spirit is a ratio of gold. */
  idleGoldBase: 2500,
  idleGoldPer: 2500,
  idleGoldExp: 0.8,
  idleSpiritRatio: 0.6,
  idleExpBase: 60,
  idleExpPer: 6,
  /** Basic scrolls per hour = idleScrollBase + idleScrollPer * cleared. */
  idleScrollBase: 0.25,
  idleScrollPer: 0.004,
  /** Gear items per hour = idleGearBase + idleGearPer * cleared, spread over the 4 slots. */
  idleGearBase: 0.5,
  idleGearPer: 0.004,
  /** Gear tier steps up every this many cleared stages (blending into the next tier). */
  gearTierStages: 30,
  /** First clear = this many hours of the stage's idle gold/spirit, plus gems. */
  firstClearIdleHours: 0.1,
  firstClearGemsBase: 20,
  firstClearGemsPer: 0.5,
  bossGemsBase: 100,
  bossGemsPer: 2,
};

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

function normStage(stage: number): number {
  return Math.max(1, Math.floor(Number.isFinite(stage) ? stage : 1));
}

export function isBossStage(stage: number): boolean {
  return normStage(stage) % STAGES_PER_CHAPTER === 0;
}

/** e.g. stage 23 -> "3-3" */
export function stageLabel(stage: number): string {
  const s = normStage(stage);
  return `${Math.ceil(s / STAGES_PER_CHAPTER)}-${((s - 1) % STAGES_PER_CHAPTER) + 1}`;
}

/** The continuous difficulty curve behind stages (x = stage number, may be fractional; no boss bonus). */
export function strengthCurve(x: number): number {
  const t = CAMPAIGN_TUNING;
  return t.strengthBase * Math.pow(1 + t.strengthSlope * Math.max(0, x - 1), t.strengthExp);
}

/** Enemy hp/atk/armor multiplier for a stage (same scale as a player hero's level/star multiplier). */
export function stageStrength(stage: number): number {
  const s = normStage(stage);
  return strengthCurve(s) * (isBossStage(s) ? CAMPAIGN_TUNING.bossMult : 1);
}

/** Early stages have fewer enemies. */
export function stageEnemyCount(stage: number): number {
  const s = normStage(stage);
  if (s === 1) return 3;
  if (s <= 3) return 4;
  if (s <= 6) return 5;
  return TEAM_SIZE;
}

/** Deterministic enemy team for a stage (6 slots, may contain nulls in early stages). */
export function campaignEnemies(stage: number): (BattleUnitSetup | null)[] {
  const s = normStage(stage);
  return buildEnemyTeam(hashSeed('campaign', s), stageStrength(s), stageEnemyCount(s));
}

export function stagePower(stage: number): number {
  return teamPowerOf(campaignEnemies(stage));
}

export function stageFirstClearRewards(stage: number): Rewards {
  const t = CAMPAIGN_TUNING;
  const s = normStage(stage);
  const rate = idleResourceRate(s);
  const resources: Partial<Resources> = {
    gold: Math.round(rate.gold * t.firstClearIdleHours),
    spirit: Math.round(rate.spirit * t.firstClearIdleHours),
    gems: Math.floor(t.firstClearGemsBase + t.firstClearGemsPer * s),
  };
  if (isBossStage(s)) {
    resources.gems! += Math.floor(t.bossGemsBase + t.bossGemsPer * s);
    resources.heroicScroll = 1;
    resources.basicScroll = 2;
  } else if (s % 5 === 0) {
    resources.basicScroll = 1;
  }
  return { resources, playerExp: 30 + 5 * s };
}

// ---------------------------------------------------------------------------
// Idle
// ---------------------------------------------------------------------------

function idleResourceRate(cleared: number): { gold: number; spirit: number } {
  const t = CAMPAIGN_TUNING;
  const gold = t.idleGoldBase + t.idleGoldPer * Math.pow(Math.max(0, cleared), t.idleGoldExp);
  return { gold: Math.round(gold), spirit: Math.round(gold * t.idleSpiritRatio) };
}

/** Gear drops per hour by item id; tiers blend from T to T+1 across each gearTierStages band. */
function idleGearRate(cleared: number): Record<string, number> {
  const t = CAMPAIGN_TUNING;
  const perSlot = (t.idleGearBase + t.idleGearPer * cleared) / EQUIP_SLOTS.length;
  const band = cleared / t.gearTierStages;
  const tier = Math.min(MAX_EQUIP_TIER, 1 + Math.floor(band));
  const nextShare = tier < MAX_EQUIP_TIER ? band - Math.floor(band) : 0;
  const rates: Record<string, number> = {};
  for (const slot of EQUIP_SLOTS) {
    rates[equipId(slot, tier)] = perSlot * (1 - nextShare);
    if (nextShare > 0) rates[equipId(slot, tier + 1)] = perSlot * nextShare;
  }
  return rates;
}

/** Idle income per hour given the highest cleared stage. Scroll & gear amounts may be fractional. */
export function idleRatePerHour(cleared: number): Rewards {
  const c = Math.max(0, Math.floor(Number.isFinite(cleared) ? cleared : 0));
  const t = CAMPAIGN_TUNING;
  const { gold, spirit } = idleResourceRate(c);
  return {
    resources: { gold, spirit, basicScroll: t.idleScrollBase + t.idleScrollPer * c },
    playerExp: t.idleExpBase + t.idleExpPer * c,
    equipment: idleGearRate(c),
  };
}

/** The [from, to] ms window that counts for idle rewards (capped at IDLE_CAP_HOURS). */
export function idleWindow(state: GameState, now: number): { from: number; to: number } {
  const from = Math.max(state.campaign.idleSince, now - IDLE_CAP_HOURS * HOUR_MS);
  return { from: Math.min(from, now), to: now };
}

/** Whole items earned in [from, to] at `perHour`, using a fixed time axis so fractions carry over. */
function itemsBetween(perHour: number, from: number, to: number, phase: number): number {
  if (!(perHour > 0)) return 0;
  const at = (t: number) => Math.floor((perHour * t) / HOUR_MS + phase);
  return Math.max(0, at(to) - at(from));
}

/** Rewards accumulated between state.campaign.idleSince and now (capped at IDLE_CAP_HOURS). Deterministic. */
export function computeIdleRewards(state: GameState, now: number): Rewards {
  const { from, to } = idleWindow(state, now);
  const hours = (to - from) / HOUR_MS;
  const rate = idleRatePerHour(state.campaign.cleared);
  const equipment: Record<string, number> = {};
  for (const [id, perHour] of Object.entries(rate.equipment ?? {})) {
    // A stable per-item phase so different slots don't all drop at the same moment.
    const n = itemsBetween(perHour, from, to, (hashSeed(id) % 1000) / 1000);
    if (n > 0) equipment[id] = n;
  }
  const resources: Partial<Resources> = {
    gold: Math.floor((rate.resources.gold ?? 0) * hours),
    spirit: Math.floor((rate.resources.spirit ?? 0) * hours),
  };
  const scrolls = itemsBetween(rate.resources.basicScroll ?? 0, from, to, 0.5);
  if (scrolls > 0) resources.basicScroll = scrolls;
  const rewards: Rewards = { resources, playerExp: Math.floor((rate.playerExp ?? 0) * hours) };
  if (Object.keys(equipment).length > 0) rewards.equipment = equipment;
  return rewards;
}

/** Adds computeIdleRewards to state and resets idleSince = now. */
export function claimIdleRewards(state: GameState, now: number): Rewards {
  const rewards = computeIdleRewards(state, now);
  addRewards(state, rewards);
  state.campaign.idleSince = now;
  return rewards;
}
