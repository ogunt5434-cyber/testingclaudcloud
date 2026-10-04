// Game store: owns GameState, exposes queries & actions to the UI.
// Every action that returns ok (and claimIdle/autoFormation/toggleLock/reset) saves and notifies
// subscribers. Failed actions change nothing and return a Turkish, player-presentable error.
// Saving is guarded: if another instance (another tab) saved since this one loaded or last saved, this
// instance stops saving and blocks actions (saveProblem 'conflict') instead of overwriting newer progress.
import { simulateBattle } from './battle/engine';
import {
  bankIdleRewards,
  campaignEnemies,
  claimIdleRewards,
  computeIdleRewards,
  stageFirstClearRewards,
  syncIdleClock,
} from './campaign';
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
import {
  PLAYER_NAME_MAX,
  PLAYER_NAME_MIN,
  clearSave,
  loadSave,
  newGameState,
  saveGame,
  storedSaveRev,
} from './save';
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

/**
 * Why progress is currently not being saved:
 * - 'unavailable': there is no usable storage or the last write failed (e.g. full quota, private mode);
 *   the game keeps running in memory and retries on every save.
 * - 'conflict': another tab/window saved newer progress; this instance no longer saves and its actions
 *   fail until the page is reloaded (reset() still works).
 */
export type SaveProblem = 'unavailable' | 'conflict';

/** Player-facing (Turkish) text for each SaveProblem. */
export const SAVE_PROBLEM_TEXT: Readonly<Record<SaveProblem, string>> = {
  unavailable: 'Kayıt yapılamıyor: ilerlemen bu tarayıcıya kaydedilmiyor ve sayfa kapanınca kaybolabilir.',
  conflict: 'Oyun başka bir sekmede açık. Kaldığın yerden devam etmek için bu sayfayı yenile.',
};

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
  /** Revision of the stored save this instance last loaded or wrote. */
  private rev: number;
  private problem: SaveProblem | null;

  /** `state` is treated as the latest progress: it may overwrite whatever save the storage holds now. */
  constructor(state: GameState, opts: GameOptions = {}) {
    this._state = state;
    this.storage = resolveStorage(opts);
    this.clock = opts.now ?? Date.now;
    this.rev = storedSaveRev(this.storage) ?? 0;
    this.problem = this.storage ? null : 'unavailable';
  }

  /**
   * Loads from storage (or creates a new game). A chest timer that is ahead of the clock (the device clock
   * was ahead at the last save) restarts now and is saved right away.
   */
  static load(opts?: GameOptions): Game {
    const storage = resolveStorage(opts);
    const now = opts?.now ?? Date.now;
    const { state, rev } = loadSave(storage, now());
    const game = new Game(state, { storage, now });
    game.rev = rev;
    if (syncIdleClock(state, game.now())) game.save();
    return game;
  }

  /** The live state object. Treat as read-only; re-read it after every notification (reset() replaces it). */
  get state(): Readonly<GameState> {
    return this._state;
  }

  now(): number {
    return this.clock();
  }

  /** Listener runs after every successful mutating action (and when a save conflict is first noticed). Returns unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Why progress isn't being saved right now (null when saving works). See SaveProblem. */
  get saveProblem(): SaveProblem | null {
    return this.problem;
  }

  /** Turkish warning to show the player while saving doesn't work, else null. */
  saveWarning(): string | null {
    return this.problem ? SAVE_PROBLEM_TEXT[this.problem] : null;
  }

  /**
   * Re-checks whether another instance saved newer progress (call it when another tab may have written,
   * e.g. on a `storage` event or when the page becomes visible again, and before actions that cannot
   * report an error). Listeners are notified when a conflict is first noticed. Returns saveProblem.
   */
  refreshSaveStatus(): SaveProblem | null {
    this.blocked();
    return this.problem;
  }

  /**
   * Writes the state unless another instance saved since this one loaded/last saved (then it sets
   * saveProblem 'conflict' and writes nothing). Never throws.
   */
  save(): void {
    this._state.lastSeen = this.now();
    if (this.conflicted()) return;
    const next = this.rev + 1;
    if (saveGame(this.storage, this._state, next)) {
      this.rev = next;
      this.problem = null;
    } else {
      this.problem = 'unavailable';
    }
  }

  /** True (and saveProblem = 'conflict') once the stored save was replaced by someone else. */
  private conflicted(): boolean {
    if (this.problem === 'conflict') return true;
    // No (readable) save means there is nothing newer to protect.
    const stored = storedSaveRev(this.storage);
    if (stored === null || stored === this.rev) return false;
    this.problem = 'conflict';
    return true;
  }

  /**
   * The error that blocks actions in a stale instance (see conflicted), else null. Listeners are notified
   * when the conflict is first noticed here, so the UI can show saveWarning().
   */
  private blocked(): string | null {
    const known = this.problem === 'conflict';
    if (!this.conflicted()) return null;
    if (!known) this.notify();
    return SAVE_PROBLEM_TEXT.conflict;
  }

  /** Saves, then notifies every listener. */
  private commit(): void {
    this.save();
    this.notify();
  }

  /** Runs every listener (a throwing listener doesn't stop the others). */
  private notify(): void {
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

  /** Runs a state action unless this instance is stale, committing on success. */
  private act<T>(action: () => ActionResult<T>): ActionResult<T> {
    const stale = this.blocked();
    return stale ? { ok: false, error: stale } : this.commitIf(action());
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

  /** The idle chest right now. Restarts a chest whose timer is ahead of the clock (see syncIdleClock). */
  idlePreview(): Rewards {
    const now = this.now();
    if (syncIdleClock(this._state, now)) this.save();
    return computeIdleRewards(this._state, now);
  }

  /** Heroes sorted by power desc. */
  sortedHeroes(): HeroInstance[] {
    return sortByPower(this._state.heroes);
  }

  // ---- actions (all save + notify on success)

  /** Collects the chest (empty rewards and no change while the instance is stale, see saveProblem). */
  claimIdle(): Rewards {
    if (this.blocked()) return { resources: {} };
    const rewards = claimIdleRewards(this._state, this.now());
    this.commit();
    return rewards;
  }

  /** slots: 6 entries of uid|null, no duplicates, at least one hero. */
  setFormation(slots: (string | null)[]): ActionResult {
    const error = this.blocked() ?? formationError(this._state.heroes, slots);
    if (error) return { ok: false, error };
    this._state.formation = slots.slice();
    this.commit();
    return { ok: true, value: undefined };
  }

  /** Puts the 6 strongest heroes in; warriors/high-hp heroes front. */
  autoFormation(): void {
    if (this.blocked()) return;
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
    const stale = this.blocked();
    if (stale) return { ok: false, error: stale };
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

  /**
   * Fights the next stage. On a win: first-clear rewards, cleared+1. The idle timer is NOT reset, but the
   * chest's income so far is banked at the old stage's rate first, so only later hours pay the new rate.
   */
  fightCampaign(): ActionResult<FightOutcome> {
    const stage = this._state.campaign.cleared + 1;
    return this.fight('campaign', stage, campaignEnemies(stage), stageFirstClearRewards(stage), () => {
      bankIdleRewards(this._state, this.now());
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
    return this.act(() => {
      const seed = hashSeed('summon', type, this._state.summon.totalPulls, this._state.nextUid, this.now(), this.attempt++);
      return summonHeroes(this._state, type, count, new Rng(seed));
    });
  }

  levelUp(uid: string, levels: number): ActionResult<{ gained: number }> {
    return this.act(() => levelUpHero(this._state, uid, levels));
  }

  /** Auto-picks the lowest-level valid fodder. */
  starUp(uid: string): ActionResult {
    return this.act(() => starUpHero(this._state, uid));
  }

  dismiss(uid: string): ActionResult<Rewards> {
    return this.act(() => dismissHero(this._state, uid));
  }

  /** Equips a specific item from stock (swapping the current one back to stock). */
  equip(uid: string, equipId: string): ActionResult {
    return this.act(() => equipItem(this._state, uid, equipId));
  }

  equipBest(uid: string): ActionResult<{ changed: number }> {
    return this.act(() => equipBestItems(this._state, uid));
  }

  unequip(uid: string, slot: EquipSlot): ActionResult {
    return this.act(() => unequipItem(this._state, uid, slot));
  }

  /** Renames the player (whitespace collapsed, PLAYER_NAME_MIN..PLAYER_NAME_MAX characters). */
  setPlayerName(raw: string): ActionResult {
    const stale = this.blocked();
    if (stale) return { ok: false, error: stale };
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
    if (!hero || this.blocked()) return;
    hero.locked = !hero.locked;
    this.commit();
  }

  /** Wipes save and starts over (also from a stale instance: the fresh game then becomes the newest save). */
  reset(): void {
    // Continue the revision sequence past whatever is stored, so other open instances see a newer save.
    this.rev = Math.max(this.rev, storedSaveRev(this.storage) ?? 0);
    if (this.problem === 'conflict') this.problem = null;
    clearSave(this.storage);
    this._state = newGameState(this.now());
    this.commit();
  }
}
