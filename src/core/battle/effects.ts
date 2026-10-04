// Applying skill/passive effects to units: damage, heal, statuses, buffs, energy, death.
import { ENERGY_MAX, ENERGY_PER_HIT } from '../constants';
import type { ControlStatus, DotStatus, SkillEffect, StatusKind } from '../types';
import type { BattleContext } from './context';
import { rollHit, type HitOptions } from './damage';
import { isAlive, isControlStatus, stat, type BattleUnit } from './unit';

/** Damage categories produced by units (DoT ticks are handled separately). */
export type HitKind = 'basic' | 'skill' | 'passive';
export type EffectSource = 'skill' | 'passive';

type StatusEffect = Extract<SkillEffect, { type: 'status' }>;
type BuffEffect = Extract<SkillEffect, { type: 'buff' }>;

// ---------------------------------------------------------------------------
// HP loss & death
// ---------------------------------------------------------------------------

/** Removes HP (capped at current HP), credits stats, emits `damage` and handles death. Returns HP removed. */
export function loseHp(
  ctx: BattleContext,
  source: BattleUnit,
  target: BattleUnit,
  damage: number,
  crit: boolean,
  kind: HitKind | 'dot',
): number {
  const amount = Math.min(target.hp, damage);
  target.hp -= amount;
  source.record.damageDealt += amount;
  target.record.damageTaken += amount;
  ctx.emit({ t: 'damage', source: source.ref, target: target.ref, amount, crit, kind, hpAfter: target.hp });
  if (target.hp === 0) killUnit(ctx, target);
  return amount;
}

/** Emits death, clears statuses (emitting `status off`), ends the battle or queues death passives. */
function killUnit(ctx: BattleContext, unit: BattleUnit): void {
  ctx.emit({ t: 'death', target: unit.ref });
  for (const status of [...unit.controls.keys()]) removeStatus(ctx, unit, status);
  for (const dot of [...unit.dots]) removeStatus(ctx, unit, dot.status);
  unit.buffs = [];
  ctx.checkEnd();
  if (ctx.over) return;
  ctx.reactions.push({ unit, trigger: 'onDeath' });
  for (const ally of ctx.alliesOf(unit)) ctx.reactions.push({ unit: ally, trigger: 'onAllyDeath' });
}

export function removeStatus(ctx: BattleContext, unit: BattleUnit, status: StatusKind): void {
  if (isControlStatus(status)) unit.controls.delete(status);
  else unit.dots = unit.dots.filter((d) => d.status !== status);
  ctx.emit({ t: 'status', target: unit.ref, status, on: false, duration: 0 });
}

// ---------------------------------------------------------------------------
// Individual effect kinds
// ---------------------------------------------------------------------------

/** Full attack/skill/passive hit: dodge, formula, energy gain + queued onHit for enemy attacks/skills. */
export function dealDamage(
  ctx: BattleContext,
  attacker: BattleUnit,
  target: BattleUnit,
  opts: HitOptions,
  kind: HitKind,
): void {
  const roll = rollHit(ctx.rng, attacker, target, opts);
  if (roll.dodged) {
    ctx.emit({ t: 'dodge', source: attacker.ref, target: target.ref });
    return;
  }
  loseHp(ctx, attacker, target, roll.amount, roll.crit, kind);
  const fromEnemyAction = kind !== 'passive' && attacker.ref.side !== target.ref.side;
  if (ctx.over || !isAlive(target) || !fromEnemyAction) return;
  addEnergy(ctx, target, ENERGY_PER_HIT);
  ctx.reactions.push({ unit: target, trigger: 'onHit' });
}

export function healUnit(ctx: BattleContext, healer: BattleUnit, target: BattleUnit, multiplier: number): void {
  if (!isAlive(target)) return;
  const amount = Math.max(0, Math.round(stat(healer, 'atk') * multiplier));
  const gained = Math.min(amount, target.maxHp - target.hp);
  target.hp += gained;
  healer.record.healingDone += gained;
  ctx.emit({ t: 'heal', source: healer.ref, target: target.ref, amount: gained, hpAfter: target.hp });
}

export function setEnergy(ctx: BattleContext, unit: BattleUnit, value: number): void {
  const next = Number.isFinite(value) ? value : unit.energy;
  unit.energy = Math.min(ENERGY_MAX, Math.max(0, next));
  ctx.emit({ t: 'energy', target: unit.ref, energyAfter: unit.energy });
}

export function addEnergy(ctx: BattleContext, unit: BattleUnit, delta: number): void {
  setEnergy(ctx, unit, unit.energy + delta);
}

/** Control: chance reduced by controlImmune; reapplying keeps the longer remaining duration. */
function applyControl(ctx: BattleContext, target: BattleUnit, status: ControlStatus, effect: StatusEffect, duration: number): void {
  if (!ctx.rng.chance(effect.chance * (1 - stat(target, 'controlImmune')))) return;
  const remaining = Math.max(target.controls.get(status) ?? 0, duration);
  target.controls.set(status, remaining);
  ctx.emit({ t: 'status', target: target.ref, status, on: true, duration: remaining });
}

/** DoT: per-tick damage fixed from caster ATK now; reapplying keeps the longer duration and higher value. */
function applyDot(
  ctx: BattleContext,
  caster: BattleUnit,
  target: BattleUnit,
  status: DotStatus,
  effect: StatusEffect,
  duration: number,
): void {
  if (!ctx.rng.chance(effect.chance)) return;
  const perTick = Math.max(1, Math.round((effect.value ?? 0) * stat(caster, 'atk')));
  const fresh = ctx.phase === 'roundEnd';
  let dot = target.dots.find((d) => d.status === status);
  if (!dot) {
    dot = { status, remaining: duration, perTick, caster, fresh };
    target.dots.push(dot);
  } else {
    if (duration > dot.remaining) {
      dot.remaining = duration;
      dot.fresh = dot.fresh || fresh;
    }
    if (perTick > dot.perTick) {
      dot.perTick = perTick;
      dot.caster = caster;
    }
  }
  ctx.emit({ t: 'status', target: target.ref, status, on: true, duration: dot.remaining });
}

function applyStatusEffect(ctx: BattleContext, caster: BattleUnit, target: BattleUnit, effect: StatusEffect): void {
  const duration = Math.floor(effect.duration);
  if (!(duration >= 1)) return;
  if (isControlStatus(effect.status)) applyControl(ctx, target, effect.status, effect, duration);
  else applyDot(ctx, caster, target, effect.status, effect, duration);
}

function applyBuff(ctx: BattleContext, target: BattleUnit, effect: BuffEffect): void {
  const duration = Math.floor(effect.duration);
  // Max HP is never buffed (SPEC §3 Buffs).
  if (effect.stat === 'hp' || !(duration >= 1)) return;
  if (!ctx.rng.chance(effect.chance ?? 1)) return;
  target.buffs.push({ stat: effect.stat, amount: effect.amount, remaining: duration, fresh: ctx.phase === 'roundEnd' });
  ctx.emit({ t: 'buff', target: target.ref, stat: effect.stat, amount: effect.amount, duration });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/** Applies one effect to each (still alive) target. Stops as soon as the battle ends. */
export function applyEffect(
  ctx: BattleContext,
  caster: BattleUnit,
  effect: SkillEffect,
  targets: readonly BattleUnit[],
  source: EffectSource,
): void {
  for (const target of targets) {
    if (ctx.over) return;
    if (!isAlive(target)) continue;
    switch (effect.type) {
      case 'damage':
        dealDamage(
          ctx,
          caster,
          target,
          {
            multiplier: effect.multiplier,
            isSkill: source === 'skill',
            ignoreArmor: effect.ignoreArmor,
            bonusVsStatus: effect.bonusVsStatus,
          },
          source,
        );
        break;
      case 'heal':
        healUnit(ctx, caster, target, effect.multiplier);
        break;
      case 'buff':
        applyBuff(ctx, target, effect);
        break;
      case 'status':
        applyStatusEffect(ctx, caster, target, effect);
        break;
      case 'energy':
        addEnergy(ctx, target, effect.amount);
        break;
    }
  }
}
