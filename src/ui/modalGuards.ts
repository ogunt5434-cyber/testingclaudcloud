// Pure helpers behind the modal stack (no DOM access, unit-testable): the ghost-tap shield and the
// browser-history mirror that lets Back close the top modal instead of leaving the game.

/** How long pointer clicks are dropped after a modal opens or closes (covers a double tap). */
export const TAP_SHIELD_MS = 350;
/** A ghost tap lands where the first tap was; taps farther away than this are deliberate. */
export const TAP_SHIELD_RADIUS = 48;

export interface Point {
  x: number;
  y: number;
}

/**
 * Drops the second tap of a double tap when the first one opened or closed a modal. Without it that tap
 * lands on whatever the first tap revealed: the "Savaş" button under a closing result screen, a level-up
 * button of a hero sheet that just opened, the backdrop of a fresh summon reveal…
 *
 * A stack change caused by a tap shields only the area around that tap, so a quick deliberate tap
 * elsewhere (e.g. "Atla" right after "Savaş") still works. A change not caused by a tap (a timer opening the
 * result screen, Escape) shields the whole screen: nobody can mean to tap content that just appeared.
 */
export class TapShield {
  private untilAll = Number.NEGATIVE_INFINITY;
  private untilNear = Number.NEGATIVE_INFINITY;
  private near: Point | null = null;

  constructor(
    private readonly windowMs = TAP_SHIELD_MS,
    private readonly radius = TAP_SHIELD_RADIUS,
  ) {}

  /** Call whenever a modal opens or closes; `tap` = position of the tap that caused it, if any. */
  arm(now: number, tap?: Point | null): void {
    if (tap) {
      this.untilNear = now + this.windowMs;
      this.near = { x: tap.x, y: tap.y };
    } else {
      this.untilAll = Math.max(this.untilAll, now + this.windowMs);
    }
  }

  /**
   * `detail` is MouseEvent.detail: 0 for keyboard-activated (Enter / Space) and scripted clicks, which are
   * deliberate and never dropped.
   */
  blocks(now: number, detail: number, at: Point): boolean {
    if (detail <= 0) return false;
    if (now < this.untilAll) return true;
    return now < this.untilNear && !!this.near && Math.hypot(at.x - this.near.x, at.y - this.near.y) <= this.radius;
  }
}

/** The part of `window.history` HistorySync needs. */
export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  go(delta: number): void;
}

const ENTRY_KEY = 'dkModal';

/** Index stored in one of our history entries (0 = an entry that is not ours, i.e. the page itself). */
export function historyEntryIndex(state: unknown): number {
  if (!state || typeof state !== 'object') return 0;
  const value = (state as Record<string, unknown>)[ENTRY_KEY];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * Keeps one history entry per open modal so the browser / Android Back button closes the top modal
 * instead of navigating away from the game.
 *
 * - `opened()` pushes an entry.
 * - `closed()` (a modal closed by the app: ✕, backdrop, a button) pops its entry. Pops are batched into a
 *   single `history.go(-n)` on the next microtask, and a modal opened before that reuses one of the
 *   entries (e.g. "Sonraki Aşama" closes the result + battle and opens the next battle in one tap).
 * - `popped(state)` handles a popstate event and returns how many Back steps the user took (0 for the
 *   popstate events caused by our own `go`, and for Forward, which is undone).
 */
export class HistorySync {
  /** Index of the current history entry: 0 = the page itself, k = the entry of the k-th open modal. */
  private depth: number;
  private pendingPops = 0;
  private ignorePops = 0;

  constructor(
    private readonly history: HistoryLike,
    private readonly schedule: (fn: () => void) => void,
  ) {
    this.depth = historyEntryIndex(history.state);
  }

  opened(): void {
    if (this.pendingPops > 0) {
      this.pendingPops--;
      return;
    }
    try {
      this.history.pushState({ [ENTRY_KEY]: this.depth + 1 }, '');
      this.depth++;
    } catch {
      // history unavailable (sandboxed frame): Back simply is not intercepted
    }
  }

  closed(): void {
    if (this.depth - this.pendingPops <= 0) return;
    this.pendingPops++;
    if (this.pendingPops === 1) this.schedule(() => this.flush());
  }

  private flush(): void {
    const n = this.pendingPops;
    this.pendingPops = 0;
    if (n <= 0) return;
    this.depth -= n;
    this.ignorePops++;
    this.history.go(-n);
  }

  popped(state: unknown): number {
    const index = historyEntryIndex(state);
    if (this.ignorePops > 0) {
      this.ignorePops--;
      this.depth = index;
      return 0;
    }
    const steps = this.depth - index;
    if (steps < 0) {
      // Forward into an entry of a modal that is already closed: step back to where we were.
      this.ignorePops++;
      this.history.go(steps);
      return 0;
    }
    this.depth = index;
    return steps;
  }
}
