// Pure replay state for battle playback: applies BattleEvents one by one to per-unit view state.
// No DOM access, so it can be unit-tested against BattleResult.final.
import type { BattleEvent, BattleResult, StatKey, StatusKind, UnitRef, UnitSnapshot } from '../../core/types';

export interface BuffView {
  stat: StatKey;
  amount: number;
  /** The buff is gone once a round greater than this starts. */
  lastRound: number;
}

export interface UnitView {
  ref: UnitRef;
  key: string;
  heroId: string;
  level: number;
  stars: number;
  maxHp: number;
  hp: number;
  energy: number;
  alive: boolean;
  /** status -> remaining duration as last announced. */
  statuses: Map<StatusKind, number>;
  buffs: BuffView[];
}

export function refKey(ref: UnitRef): string {
  return `${ref.side === 'attacker' ? 'a' : 'd'}${ref.pos}`;
}

function unitFromSnapshot(s: UnitSnapshot): UnitView {
  return {
    ref: { ...s.ref },
    key: refKey(s.ref),
    heroId: s.heroId,
    level: s.level,
    stars: s.stars,
    maxHp: s.maxHp,
    hp: s.hp,
    energy: s.energy,
    alive: s.hp > 0,
    statuses: new Map(),
    buffs: [],
  };
}

export class BattleModel {
  readonly units = new Map<string, UnitView>();
  round = 0;
  winner: BattleResult['winner'] | null = null;
  /** Units that have not taken their turn yet this round; empty => round-end (or pre-battle) phase. */
  private readonly pending = new Set<string>();

  constructor(initial: readonly UnitSnapshot[]) {
    for (const snap of initial) {
      const unit = unitFromSnapshot(snap);
      this.units.set(unit.key, unit);
    }
  }

  unit(ref: UnitRef): UnitView | undefined {
    return this.units.get(refKey(ref));
  }

  get inRoundEnd(): boolean {
    return this.pending.size === 0;
  }

  apply(ev: BattleEvent): void {
    switch (ev.t) {
      case 'roundStart':
        return this.startRound(ev.round);
      case 'action':
      case 'skip':
        this.pending.delete(refKey(ev.actor));
        return;
      case 'damage':
      case 'heal':
        return this.setHp(ev.target, ev.hpAfter);
      case 'energy':
        return this.update(ev.target, (u) => (u.energy = ev.energyAfter));
      case 'status':
        return this.update(ev.target, (u) => {
          if (ev.on) u.statuses.set(ev.status, ev.duration);
          else u.statuses.delete(ev.status);
        });
      case 'buff':
        return this.addBuff(ev.target, ev.stat, ev.amount, ev.duration);
      case 'buffEnd':
        return this.endBuff(ev.target, ev.stat, ev.amount);
      case 'death':
        this.pending.delete(refKey(ev.target));
        return this.update(ev.target, (u) => {
          u.alive = false;
          u.hp = 0;
          u.buffs = [];
        });
      case 'battleEnd':
        this.winner = ev.winner;
        return;
      case 'dodge':
      case 'passive':
        return;
    }
  }

  private update(ref: UnitRef, fn: (u: UnitView) => void): void {
    const unit = this.unit(ref);
    if (unit) fn(unit);
  }

  private setHp(ref: UnitRef, hp: number): void {
    this.update(ref, (u) => {
      u.hp = Math.max(0, Math.min(u.maxHp, hp));
    });
  }

  private startRound(round: number): void {
    this.round = round;
    this.pending.clear();
    for (const unit of this.units.values()) {
      unit.buffs = unit.buffs.filter((b) => b.lastRound >= round);
      if (unit.alive) this.pending.add(unit.key);
    }
  }

  /**
   * The engine announces each expiry with `buffEnd`: drop the matching buff that was due first.
   * (The lastRound bookkeeping stays as a fallback; it never expires a buff earlier than the engine.)
   */
  private endBuff(ref: UnitRef, stat: StatKey, amount: number): void {
    this.update(ref, (u) => {
      let index = -1;
      u.buffs.forEach((b, i) => {
        if (b.stat === stat && b.amount === amount && (index < 0 || b.lastRound < u.buffs[index].lastRound)) index = i;
      });
      if (index >= 0) u.buffs.splice(index, 1);
    });
  }

  /** Mirrors the engine: a buff from a turn lasts through round r+N-1, one from round end through r+N. */
  private addBuff(ref: UnitRef, stat: StatKey, amount: number, duration: number): void {
    const lastRound = this.round + duration - (this.inRoundEnd ? 0 : 1);
    this.update(ref, (u) => u.buffs.push({ stat, amount, lastRound }));
  }
}

/** Plays the whole event list (used by "Atla" and tests). */
export function replayAll(result: BattleResult): BattleModel {
  const model = new BattleModel(result.initial);
  result.events.forEach((ev) => model.apply(ev));
  return model;
}
