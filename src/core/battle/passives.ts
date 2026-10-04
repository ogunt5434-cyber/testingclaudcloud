// Effect sequences (skills & passives) and triggered passives / deferred reactions.
import type { PassiveTrigger, SkillEffect } from '../types';
import type { BattleContext } from './context';
import { applyEffect, type EffectSource } from './effects';
import { selectTargets } from './targeting';
import { isAlive, type BattleUnit } from './unit';

/**
 * Hard cap on reactions processed in one settle. Reactions are naturally bounded (passive damage never
 * triggers onHit and each unit dies once) — this is only a safety net guaranteeing termination.
 */
const MAX_REACTIONS_PER_SETTLE = 1000;

/**
 * Runs effects in order, tracking `previous` targets. `firstTargets` (if given) replaces the selection
 * for effect 0 (used by skills, whose action event announces those targets before any effect runs).
 * Stops when the battle ends, or when the caster dies and `requireAliveCaster` is set.
 */
export function runEffects(
  ctx: BattleContext,
  caster: BattleUnit,
  effects: readonly SkillEffect[],
  source: EffectSource,
  options: { firstTargets?: BattleUnit[]; requireAliveCaster: boolean },
): void {
  let previous: BattleUnit[] = [];
  for (let i = 0; i < effects.length; i++) {
    if (ctx.over || (options.requireAliveCaster && !isAlive(caster))) return;
    const effect = effects[i];
    const targets =
      i === 0 && options.firstTargets ? options.firstTargets : selectTargets(ctx, caster, effect.target, previous);
    applyEffect(ctx, caster, effect, targets, source);
    previous = targets;
  }
}

/** Fires every passive of `unit` with the given trigger (rolling each passive's chance). */
export function runPassives(ctx: BattleContext, unit: BattleUnit, trigger: PassiveTrigger): void {
  // onDeath passives are the only ones a dead unit may fire.
  const ownerMustLive = trigger !== 'onDeath';
  for (const passive of unit.def.passives) {
    if (ctx.over || (ownerMustLive && !isAlive(unit))) return;
    if (passive.trigger !== trigger || !passive.effects || passive.effects.length === 0) continue;
    if (!ctx.rng.chance(passive.chance ?? 1)) continue;
    ctx.emit({ t: 'passive', actor: unit.ref, name: passive.name });
    runEffects(ctx, unit, passive.effects, 'passive', { requireAliveCaster: ownerMustLive });
  }
}

/** Fires queued onHit / onDeath / onAllyDeath reactions (FIFO) until none remain or the battle ends. */
export function settleReactions(ctx: BattleContext): void {
  let budget = MAX_REACTIONS_PER_SETTLE;
  while (ctx.reactions.length > 0 && !ctx.over && budget-- > 0) {
    const reaction = ctx.reactions.shift()!;
    if (reaction.trigger !== 'onDeath' && !isAlive(reaction.unit)) continue;
    runPassives(ctx, reaction.unit, reaction.trigger);
  }
  ctx.reactions.length = 0;
}

/** Runs a trigger for a unit and then settles any reactions it caused. */
export function triggerPassives(ctx: BattleContext, unit: BattleUnit, trigger: PassiveTrigger): void {
  runPassives(ctx, unit, trigger);
  settleReactions(ctx);
}
