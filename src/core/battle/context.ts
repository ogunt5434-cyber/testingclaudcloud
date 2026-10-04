// Mutable state of one running battle: teams, rng, event log, end detection, pending passive reactions.
import { TEAM_SIZE } from '../constants';
import { Rng } from '../rng';
import type { BattleEvent, BattleSetup, BattleUnitSetup, PassiveTrigger, Side } from '../types';
import { buildUnit, isAlive, type BattleUnit } from './unit';

/** Where in the battle we are; effects applied during 'roundEnd' skip that round's duration decrement. */
export type BattlePhase = 'start' | 'turns' | 'roundEnd';

/** A passive trigger waiting to fire once the current action / tick has finished. */
export interface Reaction {
  unit: BattleUnit;
  trigger: Extract<PassiveTrigger, 'onHit' | 'onDeath' | 'onAllyDeath'>;
}

export class BattleContext {
  readonly rng: Rng;
  readonly events: BattleEvent[] = [];
  readonly attackers: (BattleUnit | null)[];
  readonly defenders: (BattleUnit | null)[];
  readonly reactions: Reaction[] = [];
  phase: BattlePhase = 'start';
  round = 0;
  winner: Side | null = null;

  constructor(setup: BattleSetup) {
    this.rng = new Rng(setup.seed);
    this.attackers = buildTeam(setup.attackers, 'attacker');
    this.defenders = buildTeam(setup.defenders, 'defender');
  }

  get over(): boolean {
    return this.winner !== null;
  }

  emit(event: BattleEvent): void {
    this.events.push(event);
  }

  team(side: Side): (BattleUnit | null)[] {
    return side === 'attacker' ? this.attackers : this.defenders;
  }

  /** Every present unit, attackers then defenders, by position. */
  allUnits(): BattleUnit[] {
    return [...present(this.attackers), ...present(this.defenders)];
  }

  aliveOf(side: Side): BattleUnit[] {
    return present(this.team(side)).filter(isAlive);
  }

  alliesOf(unit: BattleUnit): BattleUnit[] {
    return this.aliveOf(unit.ref.side);
  }

  enemiesOf(unit: BattleUnit): BattleUnit[] {
    return this.aliveOf(unit.ref.side === 'attacker' ? 'defender' : 'attacker');
  }

  /** Ends the battle (emitting battleEnd) if a side has no living units. Defender wins if both are gone. */
  checkEnd(): void {
    if (this.over) return;
    const attackersAlive = this.aliveOf('attacker').length > 0;
    const defendersAlive = this.aliveOf('defender').length > 0;
    if (attackersAlive && defendersAlive) return;
    this.finish(attackersAlive ? 'attacker' : 'defender');
  }

  finish(winner: Side): void {
    if (this.over) return;
    this.winner = winner;
    this.emit({ t: 'battleEnd', winner });
  }
}

function present(team: (BattleUnit | null)[]): BattleUnit[] {
  return team.filter((u): u is BattleUnit => u !== null);
}

function buildTeam(slots: (BattleUnitSetup | null)[], side: Side): (BattleUnit | null)[] {
  const team: (BattleUnit | null)[] = [];
  for (let pos = 0; pos < TEAM_SIZE; pos++) {
    const setup = slots[pos] ?? null;
    team.push(setup ? buildUnit(setup, side, pos) : null);
  }
  return team;
}
