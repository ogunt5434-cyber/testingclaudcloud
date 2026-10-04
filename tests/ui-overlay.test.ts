// Modal stack guards: ghost-tap shield (double taps) and the browser-history mirror (Back closes modals).
import { describe, expect, it } from 'vitest';
import { HistorySync, TAP_SHIELD_MS, TAP_SHIELD_RADIUS, TapShield, historyEntryIndex, type HistoryLike } from '../src/ui/modalGuards';

describe('TapShield', () => {
  const at = (x: number, y: number) => ({ x, y });

  it('drops the second tap of a double tap on a button that opened or closed a modal', () => {
    const shield = new TapShield();
    expect(shield.blocks(0, 1, at(280, 700))).toBe(false);
    shield.arm(1_000, at(280, 700)); // "Devam" closed the result + battle layers
    expect(shield.blocks(1_120, 1, at(281, 702))).toBe(true); // mouse double click 120 ms later
    expect(shield.blocks(1_150, 2, at(275, 690))).toBe(true); // touch double tap 150 ms later
    expect(shield.blocks(1_000 + TAP_SHIELD_MS - 1, 1, at(280, 700 + TAP_SHIELD_RADIUS))).toBe(true);
    expect(shield.blocks(1_000 + TAP_SHIELD_MS, 1, at(280, 700))).toBe(false);
  });

  it('lets a quick deliberate tap elsewhere through (e.g. "Atla" right after "Savaş")', () => {
    const shield = new TapShield();
    shield.arm(1_000, at(250, 700));
    expect(shield.blocks(1_100, 1, at(330, 40))).toBe(false);
    expect(shield.blocks(1_100, 1, at(250, 700 - TAP_SHIELD_RADIUS - 1))).toBe(false);
  });

  it('shields the whole screen when no tap caused the change (a timer opened the result)', () => {
    const shield = new TapShield();
    shield.arm(1_000, null);
    expect(shield.blocks(1_200, 1, at(10, 10))).toBe(true);
    expect(shield.blocks(1_000 + TAP_SHIELD_MS, 1, at(10, 10))).toBe(false);
  });

  it('never drops keyboard-activated clicks (detail 0)', () => {
    const shield = new TapShield();
    shield.arm(1_000);
    shield.arm(1_000, at(5, 5));
    expect(shield.blocks(1_010, 0, at(5, 5))).toBe(false);
  });
});

/** A fake same-document history: entries are states, `go` traverses and fires popstate later. */
class FakeHistory implements HistoryLike {
  entries: unknown[] = [null];
  index = 0;
  private readonly pops: (() => void)[] = [];
  onPop: (state: unknown) => void = () => {};

  get state(): unknown {
    return this.entries[this.index];
  }

  pushState(data: unknown): void {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(data);
    this.index++;
  }

  go(delta: number): void {
    // Like the browser: traversal (and its popstate) happens asynchronously.
    this.pops.push(() => this.traverse(delta));
  }

  /** The user pressed Back / Forward. */
  user(delta: number): void {
    this.traverse(delta);
  }

  private traverse(delta: number): void {
    const target = Math.max(0, Math.min(this.entries.length - 1, this.index + delta));
    if (target === this.index) return;
    this.index = target;
    this.onPop(this.state);
  }

  flushTraversals(): void {
    while (this.pops.length) this.pops.shift()?.();
  }
}

/** Minimal modal stack driven by HistorySync, mirroring overlay.ts. */
function setup() {
  const history = new FakeHistory();
  const tasks: (() => void)[] = [];
  const sync = new HistorySync(history, (fn) => tasks.push(fn));
  const open: { name: string; dismissible: boolean }[] = [];
  const settle = (): void => {
    while (tasks.length) tasks.shift()?.();
    history.flushTraversals();
  };
  history.onPop = (state) => {
    const steps = sync.popped(state);
    for (let i = 0; i < steps; i++) {
      const top = open[open.length - 1];
      if (!top) return;
      if (top.dismissible) open.pop();
      else sync.opened();
    }
  };
  return {
    history,
    open,
    settle,
    openModal(name: string, dismissible = true): void {
      open.push({ name, dismissible });
      sync.opened();
    },
    closeModal(name: string): void {
      const index = open.findIndex((m) => m.name === name);
      if (index < 0) return;
      open.splice(index, 1);
      sync.closed();
    },
  };
}

describe('HistorySync', () => {
  it('reads only its own entries', () => {
    expect(historyEntryIndex(null)).toBe(0);
    expect(historyEntryIndex({ other: 3 })).toBe(0);
    expect(historyEntryIndex({ dkModal: 2 })).toBe(2);
    expect(historyEntryIndex({ dkModal: -1 })).toBe(0);
  });

  it('Back closes the top modal instead of leaving the page', () => {
    const t = setup();
    t.openModal('detail');
    t.openModal('confirm');
    expect(t.history.index).toBe(2);
    t.history.user(-1);
    expect(t.open.map((m) => m.name)).toEqual(['detail']);
    t.history.user(-1);
    expect(t.open).toEqual([]);
    expect(t.history.index).toBe(0); // still on the game page: the next Back would leave
  });

  it('pops the entry of a modal closed in the app, so Back is not wasted later', () => {
    const t = setup();
    t.openModal('settings');
    t.closeModal('settings');
    t.settle();
    expect(t.history.index).toBe(0);
    t.openModal('detail');
    t.history.user(-1);
    expect(t.open).toEqual([]);
    expect(t.history.index).toBe(0);
  });

  it('reuses entries when a tap closes modals and opens another (result -> next battle)', () => {
    const t = setup();
    t.openModal('battle', false);
    t.openModal('result', false);
    t.closeModal('result');
    t.closeModal('battle');
    t.openModal('battle2', false);
    t.settle();
    expect(t.open.map((m) => m.name)).toEqual(['battle2']);
    expect(t.history.index).toBe(1);
  });

  it('swallows Back while a battle (non-dismissible) is open', () => {
    const t = setup();
    t.openModal('battle', false);
    t.history.user(-1);
    expect(t.open.map((m) => m.name)).toEqual(['battle']);
    expect(t.history.index).toBe(1); // entry re-added: a second Back is swallowed too
    t.history.user(-1);
    expect(t.open.map((m) => m.name)).toEqual(['battle']);
    t.closeModal('battle');
    t.settle();
    expect(t.history.index).toBe(0);
  });

  it('closes everything with one traversal (reset) and undoes Forward into closed modals', () => {
    const t = setup();
    t.openModal('settings');
    t.openModal('confirm');
    t.closeModal('confirm');
    t.closeModal('settings');
    t.settle();
    expect(t.history.index).toBe(0);
    t.history.user(+2); // Forward into stale entries
    t.settle();
    expect(t.history.index).toBe(0);
    expect(t.open).toEqual([]);
  });

  it('a long-press Back over several entries closes that many dismissible modals', () => {
    const t = setup();
    t.openModal('reveal');
    t.openModal('detail');
    t.openModal('confirm');
    t.history.user(-2);
    expect(t.open.map((m) => m.name)).toEqual(['reveal']);
    expect(t.history.index).toBe(1);
  });
});
