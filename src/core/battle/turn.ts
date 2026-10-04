// Round flow: turn order, a unit's turn (skip / skill / basic), and the round-end phase.
import { ENERGY_PER_BASIC, ENERGY_TO_CAST } from '../constants';
import type { ControlStatus } from '../types';
import type { BattleContext } from './context';
import { addEnergy, dealDamage, loseHp, removeStatus, setEnergy } from './effects';
import { runEffects, settleReactions, triggerPassives } from './passives';
import { defaultEnemy, selectTargets } from './targeting';
import { activeHardControl, isAlive, stat, type BattleUnit } from './unit';

// ---------------------------------------------------------------------------
// Turn order
// ---------------------------------------------------------------------------

function compareTurnOrder(a: BattleUnit, b: BattleUnit): number {
  const bySpd = stat(b, 'spd') - stat(a, 'spd');
  if (bySpd !== 0) return bySpd;
  if (a.ref.side !== b.ref.side) return a.ref.side === 'attacker' ? -1 : 1;
  return a.ref.pos - b.ref.pos;
}

/** Alive units by effective spd desc; ties -> attacker side first, then lower position. */
export function turnOrder(ctx: BattleContext): BattleUnit[] {
  return ctx.allUnits().filter(isAlive).sort(compareTurnOrder);
}

// ---------------------------------------------------------------------------
// A single unit's turn
// ---------------------------------------------------------------------------

/** Decrements the given control statuses by one turn, removing (and announcing) expired ones. */
function tickControls(ctx: BattleContext, unit: BattleUnit, statuses: readonly ControlStatus[]): void {
  for (const status of statuses) {
    const left = (unit.controls.get(status) ?? 0) - 1;
    if (left > 0) unit.controls.set(status, left);
    else removeStatus(ctx, unit, status);
  }
}

function castSkill(ctx: BattleContext, unit: BattleUnit): void {
  setEnergy(ctx, unit, 0);
  const { name, effects } = unit.def.active;
  const firstTargets = effects.length > 0 ? selectTargets(ctx, unit, effects[0].target, []) : [];
  ctx.emit({ t: 'action', actor: unit.ref, kind: 'skill', skillName: name, targets: firstTargets.map((u) => u.ref) });
  runEffects(ctx, unit, effects, 'skill', { firstTargets, requireAliveCaster: true });
}

function basicAttack(ctx: BattleContext, unit: BattleUnit): void {
  const target = defaultEnemy(ctx, unit);
  ctx.emit({ t: 'action', actor: unit.ref, kind: 'basic', targets: target ? [target.ref] : [] });
  if (target) dealDamage(ctx, unit, target, { multiplier: 1, isSkill: false }, 'basic');
  if (!ctx.over && isAlive(unit)) addEnergy(ctx, unit, ENERGY_PER_BASIC);
}

/**
 * One turn: hard-controlled units skip (ticking all their controls); otherwise skill if energy allows and not
 * silenced, else basic attack. Reactions (onHit/onDeath/onAllyDeath) settle after the action, then onAttack fires.
 */
export function takeTurn(ctx: BattleContext, unit: BattleUnit): void {
  const control = activeHardControl(unit);
  if (control) {
    ctx.emit({ t: 'skip', actor: unit.ref, reason: control });
    tickControls(ctx, unit, [...unit.controls.keys()]);
    return;
  }
  const silenced = unit.controls.has('silence');
  if (unit.energy >= ENERGY_TO_CAST && !silenced) castSkill(ctx, unit);
  else basicAttack(ctx, unit);
  if (ctx.over) return;
  if (silenced && isAlive(unit)) tickControls(ctx, unit, ['silence']);
  settleReactions(ctx);
  if (!ctx.over && isAlive(unit)) triggerPassives(ctx, unit, 'onAttack');
}

// ---------------------------------------------------------------------------
// Round end
// ---------------------------------------------------------------------------

/** DoT ticks applied before this round-end phase (fresh ones start ticking next round). */
function tickDots(ctx: BattleContext, unit: BattleUnit): void {
  for (const dot of [...unit.dots]) {
    if (ctx.over || !isAlive(unit)) return;
    if (!dot.fresh) loseHp(ctx, dot.caster, unit, dot.perTick, false, 'dot');
  }
}

/** Buffs and DoTs lose one round; fresh ones (applied during this round end) are spared once. */
function decrementDurations(ctx: BattleContext, unit: BattleUnit): void {
  unit.buffs = unit.buffs.filter((buff) => {
    if (buff.fresh) {
      buff.fresh = false;
      return true;
    }
    buff.remaining--;
    return buff.remaining > 0;
  });
  for (const dot of [...unit.dots]) {
    if (dot.fresh) {
      dot.fresh = false;
      continue;
    }
    dot.remaining--;
    if (dot.remaining <= 0) removeStatus(ctx, unit, dot.status);
  }
}

/** Round end over alive units in this round's turn order: DoT ticks, roundEnd passives, duration decrement. */
export function roundEnd(ctx: BattleContext, order: readonly BattleUnit[]): void {
  ctx.phase = 'roundEnd';
  for (const unit of order) {
    if (ctx.over) return;
    if (!isAlive(unit)) continue;
    tickDots(ctx, unit);
    settleReactions(ctx);
  }
  for (const unit of order) {
    if (ctx.over) return;
    if (isAlive(unit)) triggerPassives(ctx, unit, 'roundEnd');
  }
  for (const unit of order) if (isAlive(unit)) decrementDurations(ctx, unit);
}
