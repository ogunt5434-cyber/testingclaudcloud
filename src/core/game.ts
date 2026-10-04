// Game store: owns GameState, exposes queries & actions to the UI.
// Every action that returns ok (and claimIdle/autoFormation/toggleLock/reset) saves and notifies
// subscribers. Failed actions change nothing and return a Turkish, player-presentable error.
import { simulateBattle } from './battle/engine';
import { campaignEnemies, claimIdleRewards, computeIdleRewards, stageFirstClearRewards } from './campaign';
import { autoFormationSlots, formationError, sortByPower } from './formation';
import {
  addRewards,
  dismissHero,
  equipBest as equipBestItems,
  equipItem,
  findHero,
  levelUpHero,
  starUpHero,
  unequip as unequipItem,
} from './progression';
import { Rng, hashSeed } from './rng';
import { PLAYER_NAME_MAX, PLAYER_NAME_MIN, clearSave, loadGame, newGameState, saveGame } from './save';
import { emptyStats, heroPower, heroStats, toBattleUnit } from './stats';
import { summon as summonHeroes } from './summon';
import { towerEnemies, towerRewards } from './tower';
import type {
  ActionResult,
  BattleResult,
  BattleUnitSetup,
  EquipSlot,
  GameState,
  HeroInstance,
  Rewards,
  Stats,
} from './types';
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

/** localStorage when the environment has one and lets us touch it; otherwise null. */
function defaultStorage(): Storage | null {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

function resolveStorage(opts: GameOptions | undefined): Storage | null {
  return opts?.storage !== undefined ? opts.storage : defaultStorage();
}

export class Game {
  private _state: GameState;
  private readonly storage: Storage | null;
  private readonly clock: () => number;
  private readonly listeners = new Set<() => void>();
  /** Varies battle/summon seeds between attempts made at the same timestamp. */
  private attempt = 0;

  constructor(state: GameState, opts: GameOptions = {}) {
    this._state = state;
    this.storage = resolveStorage(opts);
    this.clock = opts.now ?? Date.now;
  }

  /** Loads from storage (or creates a new game). */
  static load(opts?: GameOptions): Game {
    const storage = resolveStorage(opts);
    const now = opts?.now ?? Date.now;
    return new Game(loadGame(storage, now()), { storage, now });
  }

  /** The live state object. Treat as read-only; re-read it after every notification (reset() replaces it). */
  get state(): Readonly<GameState> {
    return this._state;
  }

  now(): number {
    return this.clock();
  }

  /** Listener runs after every successful mutating action. Returns unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  save(): void {
    this._state.lastSeen = this.now();
    saveGame(this.storage, this._state);
  }

  /** Saves, then notifies every listener (a throwing listener doesn't stop the others). */
  private commit(): void {
    this.save();
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (err) {
        console.error(err);
      }
    }
  }

  /** Commits when the result is ok; passes the result through. */
  private commitIf<T>(result: ActionResult<T>): ActionResult<T> {
    if (result.ok) this.commit();
    return result;
  }

  private nextSeed(kind: string, level: number): number {
    return hashSeed(kind, level, this.now(), this.attempt++);
  }

  // ---- queries

  hero(uid: string): HeroInstance | undefined {
    return findHero(this._state, uid);
  }

  /** Base + level/star + equipment stats (no passives). Empty stats for an unknown uid. */
  heroStats(uid: string): Stats {
    const hero = this.hero(uid);
    return hero ? heroStats(hero) : emptyStats();
  }

  /** 0 for an unknown uid. */
  heroPower(uid: string): number {
    const hero = this.hero(uid);
    return hero ? heroPower(hero) : 0;
  }

  teamPower(): number {
    return this.formationHeroes().reduce((sum, h) => sum + (h ? heroPower(h) : 0), 0);
  }

  formationHeroes(): (HeroInstance | null)[] {
    return this._state.formation.map((uid) => (uid ? this.hero(uid) ?? null : null));
  }

  idlePreview(): Rewards {
    return computeIdleRewards(this._state, this.now());
  }

  /** Heroes sorted by power desc. */
  sortedHeroes(): HeroInstance[] {
    return sortByPower(this._state.heroes);
  }

  // ---- actions (all save + notify on success)

  claimIdle(): Rewards {
    const rewards = claimIdleRewards(this._state, this.now());
    this.commit();
    return rewards;
  }

  /** slots: 6 entries of uid|null, no duplicates, at least one hero. */
  setFormation(slots: (string | null)[]): ActionResult {
    const error = formationError(this._state.heroes, slots);
    if (error) return { ok: false, error };
    this._state.formation = slots.slice();
    this.commit();
    return { ok: true, value: undefined };
  }

  /** Puts the 6 strongest heroes in; warriors/high-hp heroes front. */
  autoFormation(): void {
    this._state.formation = autoFormationSlots(this._state.heroes);
    this.commit();
  }

  private playerTeam(): (BattleUnitSetup | null)[] | null {
    const team = this.formationHeroes().map((h) => (h ? toBattleUnit(h) : null));
    return team.some((u) => u !== null) ? team : null;
  }

  /** Fights `defenders`; on a win grants `winRewards` and runs `onWin`. Saves & notifies win or lose. */
  private fight(
    kind: string,
    level: number,
    defenders: (BattleUnitSetup | null)[],
    winRewards: Rewards,
    onWin: () => void,
  ): ActionResult<FightOutcome> {
    const attackers = this.playerTeam();
    if (!attackers) return { ok: false, error: 'Takımda en az bir kahraman olmalı.' };
    const result = simulateBattle({ attackers, defenders, seed: this.nextSeed(kind, level) });
    const won = result.winner === 'attacker';
    if (won) {
      addRewards(this._state, winRewards);
      onWin();
    }
    this.commit();
    return { ok: true, value: { result, rewards: won ? winRewards : null, level } };
  }

  /** Fights the next stage. On a win: first-clear rewards, cleared+1 (the idle timer is NOT reset). */
  fightCampaign(): ActionResult<FightOutcome> {
    const stage = this._state.campaign.cleared + 1;
    return this.fight('campaign', stage, campaignEnemies(stage), stageFirstClearRewards(stage), () => {
      this._state.campaign.cleared = stage;
    });
  }

  /** Fights the next tower floor. On a win: floor rewards, tower.cleared+1. */
  fightTower(): ActionResult<FightOutcome> {
    const floor = this._state.tower.cleared + 1;
    return this.fight('tower', floor, towerEnemies(floor), towerRewards(floor), () => {
      this._state.tower.cleared = floor;
    });
  }

  summon(type: SummonType, count: 1 | 10): ActionResult<HeroInstance[]> {
    const seed = hashSeed('summon', type, this._state.summon.totalPulls, this._state.nextUid, this.now(), this.attempt++);
    return this.commitIf(summonHeroes(this._state, type, count, new Rng(seed)));
  }

  levelUp(uid: string, levels: number): ActionResult<{ gained: number }> {
    return this.commitIf(levelUpHero(this._state, uid, levels));
  }

  /** Auto-picks the lowest-level valid fodder. */
  starUp(uid: string): ActionResult {
    return this.commitIf(starUpHero(this._state, uid));
  }

  dismiss(uid: string): ActionResult<Rewards> {
    return this.commitIf(dismissHero(this._state, uid));
  }

  /** Equips a specific item from stock (swapping the current one back to stock). */
  equip(uid: string, equipId: string): ActionResult {
    return this.commitIf(equipItem(this._state, uid, equipId));
  }

  equipBest(uid: string): ActionResult<{ changed: number }> {
    return this.commitIf(equipBestItems(this._state, uid));
  }

  unequip(uid: string, slot: EquipSlot): ActionResult {
    return this.commitIf(unequipItem(this._state, uid, slot));
  }

  /** Renames the player (whitespace collapsed, PLAYER_NAME_MIN..PLAYER_NAME_MAX characters). */
  setPlayerName(raw: string): ActionResult {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (name.length < PLAYER_NAME_MIN || name.length > PLAYER_NAME_MAX) {
      return { ok: false, error: `İsim ${PLAYER_NAME_MIN}-${PLAYER_NAME_MAX} karakter olmalı.` };
    }
    this._state.player.name = name;
    this.commit();
    return { ok: true, value: undefined };
  }

  /** No-op for an unknown uid. */
  toggleLock(uid: string): void {
    const hero = this.hero(uid);
    if (!hero) return;
    hero.locked = !hero.locked;
    this.commit();
  }

  /** Wipes save and starts over. */
  reset(): void {
    clearSave(this.storage);
    this._state = newGameState(this.now());
    this.commit();
  }
}
