// Game store: owns GameState, exposes queries & actions to the UI. CONTRACT STUB — to be implemented.
import type { ActionResult, BattleResult, EquipSlot, GameState, HeroInstance, Rewards, Stats } from './types';
import type { SummonType } from './summon';

export interface FightOutcome {
  result: BattleResult;
  /** null on loss. */
  rewards: Rewards | null;
  /** Stage / floor number that was fought. */
  level: number;
}

export interface GameOptions {
  storage?: Storage | null;
  now?: () => number;
}

export class Game {
  constructor(_state: GameState, _opts: GameOptions = {}) { throw new Error('not implemented'); }
  /** Loads from storage (or creates a new game). */
  static load(_opts?: GameOptions): Game { throw new Error('not implemented'); }

  get state(): Readonly<GameState> { throw new Error('not implemented'); }
  now(): number { throw new Error('not implemented'); }
  /** Listener runs after every successful mutating action. Returns unsubscribe. */
  subscribe(_listener: () => void): () => void { throw new Error('not implemented'); }
  save(): void { throw new Error('not implemented'); }

  // ---- queries
  hero(_uid: string): HeroInstance | undefined { throw new Error('not implemented'); }
  heroStats(_uid: string): Stats { throw new Error('not implemented'); }
  heroPower(_uid: string): number { throw new Error('not implemented'); }
  teamPower(): number { throw new Error('not implemented'); }
  formationHeroes(): (HeroInstance | null)[] { throw new Error('not implemented'); }
  idlePreview(): Rewards { throw new Error('not implemented'); }
  /** Heroes sorted by power desc. */
  sortedHeroes(): HeroInstance[] { throw new Error('not implemented'); }

  // ---- actions (all save + notify on success)
  claimIdle(): Rewards { throw new Error('not implemented'); }
  /** slots: 6 entries of uid|null, no duplicates, at least one hero. */
  setFormation(_slots: (string | null)[]): ActionResult { throw new Error('not implemented'); }
  /** Puts the 6 strongest heroes in; warriors/high-hp heroes front. */
  autoFormation(): void { throw new Error('not implemented'); }
  fightCampaign(): ActionResult<FightOutcome> { throw new Error('not implemented'); }
  fightTower(): ActionResult<FightOutcome> { throw new Error('not implemented'); }
  summon(_type: SummonType, _count: 1 | 10): ActionResult<HeroInstance[]> { throw new Error('not implemented'); }
  levelUp(_uid: string, _levels: number): ActionResult<{ gained: number }> { throw new Error('not implemented'); }
  starUp(_uid: string): ActionResult { throw new Error('not implemented'); }
  dismiss(_uid: string): ActionResult<Rewards> { throw new Error('not implemented'); }
  equipBest(_uid: string): ActionResult<{ changed: number }> { throw new Error('not implemented'); }
  unequip(_uid: string, _slot: EquipSlot): ActionResult { throw new Error('not implemented'); }
  toggleLock(_uid: string): void { throw new Error('not implemented'); }
  /** Wipes save and starts over. */
  reset(): void { throw new Error('not implemented'); }
}
