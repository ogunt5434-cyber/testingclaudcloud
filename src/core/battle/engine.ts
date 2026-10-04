// Battle simulation (SPEC §3). Builds units, runs battleStart passives, then rounds until a side is wiped
// out or maxRounds is reached (defender wins on timeout).
import { MAX_ROUNDS } from '../constants';
import type { BattleResult, BattleSetup, UnitBattleStats } from '../types';
import { BattleContext } from './context';
import { triggerPassives } from './passives';
import { roundEnd, takeTurn, turnOrder } from './turn';
import { isAlive, snapshot, type BattleUnit } from './unit';

function resolveMaxRounds(maxRounds: number | undefined): number {
  if (maxRounds === undefined || !Number.isFinite(maxRounds)) return MAX_ROUNDS;
  return Math.max(0, Math.floor(maxRounds));
}

/** battleStart passives: attacker pos 0..5, then defender pos 0..5. */
function runBattleStart(ctx: BattleContext): void {
  ctx.phase = 'start';
  for (const unit of ctx.allUnits()) {
    if (ctx.over) return;
    if (isAlive(unit)) triggerPassives(ctx, unit, 'battleStart');
  }
}

function playRound(ctx: BattleContext): void {
  ctx.round++;
  ctx.phase = 'turns';
  ctx.emit({ t: 'roundStart', round: ctx.round });
  const order = turnOrder(ctx);
  for (const unit of order) {
    if (ctx.over) return;
    if (isAlive(unit)) takeTurn(ctx, unit);
  }
  if (!ctx.over) roundEnd(ctx, order);
}

function unitStatsOf(unit: BattleUnit): UnitBattleStats {
  return { ...unit.record, ref: { ...unit.ref } };
}

/** Pure & deterministic: same setup (incl. seed) => identical result. */
export function simulateBattle(setup: BattleSetup): BattleResult {
  const ctx = new BattleContext(setup);
  const maxRounds = resolveMaxRounds(setup.maxRounds);
  const initial = ctx.allUnits().map(snapshot);

  ctx.checkEnd(); // a side without units loses immediately
  if (!ctx.over) runBattleStart(ctx);
  while (!ctx.over && ctx.round < maxRounds) playRound(ctx);
  if (!ctx.over) ctx.finish('defender');

  const units = ctx.allUnits();
  return {
    winner: ctx.winner ?? 'defender',
    rounds: ctx.round,
    initial,
    events: ctx.events,
    final: units.map(snapshot),
    unitStats: units.map(unitStatsOf),
  };
}
