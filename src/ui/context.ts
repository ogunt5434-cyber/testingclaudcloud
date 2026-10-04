// The UI context passed to every screen and modal: the game store plus shared UI services.
import type { Game } from '../core/game';
import type { ActionResult } from '../core/types';
import type { ToastKind } from './toast';

export type TabId = 'campaign' | 'heroes' | 'summon' | 'tower';

/** A tab screen. `render` rebuilds it from game state; show/hide start/stop live timers. */
export interface Screen {
  readonly el: HTMLElement;
  render(): void;
  show?(): void;
  hide?(): void;
}

export interface Ui {
  readonly game: Game;
  toast(text: string, kind?: ToastKind): void;
  goTo(tab: TabId): void;
  /** Runs `fn` after every game change (and after `notify`). Returns an unsubscribe function. */
  onChange(fn: () => void): () => void;
  /** Re-renders everything (for changes that do not go through a Game action). */
  notify(): void;
  /**
   * Runs `fn` without the automatic account level-up toast (fights announce the level-up on their
   * result screen instead of spoiling the battle). Returns fn's value.
   */
  withoutLevelUpToast<T>(fn: () => T): T;
}

/**
 * Runs a store action, toasting its error (or an unexpected exception). Returns the value on success.
 * `success` may be a message or a function building one from the value.
 */
export function runAction<T>(
  ui: Ui,
  action: () => ActionResult<T>,
  success?: string | ((value: T) => string),
): { value: T } | null {
  let result: ActionResult<T>;
  try {
    result = action();
  } catch (err) {
    console.warn('Action failed', err);
    ui.toast('Beklenmeyen bir hata oluştu.', 'error');
    return null;
  }
  if (!result.ok) {
    ui.toast(result.error, 'error');
    return null;
  }
  if (success) ui.toast(typeof success === 'string' ? success : success(result.value), 'success');
  return { value: result.value };
}

/**
 * For actions that cannot report an error themselves (claimIdle, autoFormation, toggleLock do nothing in a
 * stale tab): true, after toasting the warning, when another tab saved newer progress.
 */
export function blockedBySave(ui: Ui): boolean {
  if (safely(() => ui.game.refreshSaveStatus(), null) !== 'conflict') return false;
  ui.toast(ui.game.saveWarning() ?? 'Kayıt yapılamıyor.', 'error');
  return true;
}

/** Calls a query that may throw (e.g. a hero that was just removed) and falls back to `fallback`. */
export function safely<T>(query: () => T, fallback: T): T {
  try {
    return query();
  } catch {
    return fallback;
  }
}
