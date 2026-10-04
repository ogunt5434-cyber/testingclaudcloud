// Modal stack: framed panels / full-stage panels / bare full-screen layers, plus a promise-based confirm
// dialog. Every layer lives inside the 1280x720 stage (stage.ts), so it scales and rotates with the game.
// The stack also guards input: ghost taps right after a modal opens/closes are dropped, focus moves into
// the top layer (Tab is trapped there) and returns to the opener, and Back closes the top modal.
import { icon } from '../art';
import { h, mount, type Child } from './dom';
import { HistorySync, TapShield, type Point } from './modalGuards';
import { stageLayer } from './stage';

export interface ModalOptions {
  title?: string;
  /**
   * Extra classes for the panel: 'compact' (small dialog), 'wide', 'full' (full-stage panel with its own
   * header), plus screen-specific classes.
   */
  className?: string;
  /** Close on backdrop tap, Escape, Back and the close button. Default true. Can change later (setDismissible). */
  dismissible?: boolean;
  /** Full-screen layer without panel chrome (used by the battle view). */
  bare?: boolean;
  /** Accessible name while there is no visible title (e.g. the result screen). */
  label?: string;
  onClose?: () => void;
}

export interface ModalHandle {
  /** The backdrop layer element. */
  readonly root: HTMLElement;
  /** Scrollable content area. */
  readonly body: HTMLElement;
  /** Sticky footer (empty unless filled). */
  readonly footer: HTMLElement;
  setTitle(title: string): void;
  setContent(...children: Child[]): void;
  /** Allows or forbids closing by backdrop tap, Escape, Back and the close button. */
  setDismissible(dismissible: boolean): void;
  close(): void;
  readonly closed: boolean;
}

interface StackEntry {
  handle: ModalHandle;
  /** Closes without popping a history entry (Back already did). */
  closeFromHistory(): void;
}

const stack: StackEntry[] = [];
let modalSeq = 0;
const shield = new TapShield();
/** Position of the click being dispatched right now (null between clicks). */
let currentTap: Point | null = null;
let historySync: HistorySync | null = null;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function topEntry(): StackEntry | undefined {
  return stack[stack.length - 1];
}

function isDismissible(handle: ModalHandle): boolean {
  return handle.root.dataset.dismissible === '1';
}

let listening = false;

function overlayRoot(): HTMLElement {
  const layerRoot = stageLayer('overlay');
  if (!listening) {
    listening = true;
    document.addEventListener('keydown', onKeyDown);
    try {
      historySync = new HistorySync(window.history, (fn) => queueMicrotask(fn));
      window.addEventListener('popstate', onPopState);
    } catch {
      historySync = null;
    }
  }
  return layerRoot;
}

/** Capture-phase click filter: drops the ghost tap of a double tap (see TapShield). */
function onClickCapture(ev: MouseEvent): void {
  const at = { x: ev.clientX, y: ev.clientY };
  if (shield.blocks(nowMs(), ev.detail, at)) {
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  // Remembered while this click (and the promise callbacks it triggers) runs, so a modal it opens or
  // closes shields the spot where a second tap would land.
  if (ev.detail > 0) {
    currentTap = at;
    setTimeout(() => {
      if (currentTap === at) currentTap = null;
    }, 0);
  }
}

function armShield(): void {
  shield.arm(nowMs(), currentTap);
}

// Installed up front (not with the first modal) so the tap that opens the first modal is known too.
if (typeof window !== 'undefined') window.addEventListener('click', onClickCapture, true);

function onPopState(ev: PopStateEvent): void {
  if (!historySync) return;
  const steps = historySync.popped(ev.state);
  for (let i = 0; i < steps; i++) {
    const top = topEntry();
    if (!top) return;
    // Battles, results and reveals in progress stay open: Back is swallowed by re-adding their entry.
    if (isDismissible(top.handle)) top.closeFromHistory();
    else historySync.opened();
  }
}

function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0);
}

function focusQuietly(el: HTMLElement | null | undefined): void {
  try {
    el?.focus({ preventScroll: true });
  } catch {
    // element cannot take focus
  }
}

/** Keeps Tab / Shift+Tab inside the top layer. */
function trapTab(ev: KeyboardEvent, layer: HTMLElement): void {
  const items = focusables(layer);
  if (items.length === 0) {
    ev.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  // -1: focus is outside the layer or on the panel itself (whose Shift+Tab would leave the layer).
  const index = items.indexOf(document.activeElement as HTMLElement);
  let target: HTMLElement | null = null;
  if (index < 0) target = ev.shiftKey ? last : first;
  else if (ev.shiftKey && index === 0) target = last;
  else if (!ev.shiftKey && index === items.length - 1) target = first;
  if (!target) return;
  ev.preventDefault();
  focusQuietly(target);
}

function onKeyDown(ev: KeyboardEvent): void {
  const top = topEntry();
  if (!top) return;
  if (ev.key === 'Escape') {
    if (isDismissible(top.handle)) top.handle.close();
  } else if (ev.key === 'Tab') {
    trapTab(ev, top.handle.root);
  }
}

export function openModal(opts: ModalOptions, ...children: Child[]): ModalHandle {
  let dismissible = opts.dismissible ?? true;
  const id = ++modalSeq;
  const titleId = `modal-title-${id}`;
  const titleEl = h('h2', { class: 'modal-title', attrs: { id: titleId } }, opts.title ?? '');
  const body = h('div', { class: 'modal-body' }, children);
  const footer = h('div', { class: 'modal-footer' });
  const opener = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  let closed = false;

  const finishClose = (fromHistory: boolean): void => {
    if (closed) return;
    closed = true;
    const wasTop = topEntry() === entry;
    const index = stack.indexOf(entry);
    if (index >= 0) stack.splice(index, 1);
    armShield();
    if (!fromHistory) historySync?.closed();
    root.classList.add('closing');
    root.setAttribute('aria-hidden', 'true');
    setTimeout(() => root.remove(), 200);
    if (wasTop) {
      const next = topEntry();
      if (opener && opener.isConnected && (!next || next.handle.root.contains(opener))) focusQuietly(opener);
      else if (next) focusQuietly(next.handle.root.querySelector<HTMLElement>('.modal-panel, .modal-bare'));
    }
    opts.onClose?.();
  };
  const close = (): void => finishClose(false);

  const closeBtn = h('button', { class: 'modal-close', attrs: { 'aria-label': 'Kapat', type: 'button' }, onClick: close }, icon('close', 40));
  const panel = opts.bare
    ? h('div', { class: ['modal-bare', opts.className], attrs: { tabindex: -1 } }, body)
    : h(
        'div',
        { class: ['modal-panel', opts.className], attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label, tabindex: -1 } },
        h('div', { class: 'modal-head' }, h('div', { class: 'modal-title-wrap' }, titleEl), closeBtn),
        body,
        footer,
      );

  const root = h('div', {
    class: ['modal-layer', opts.bare ? 'bare' : null],
    onClick: (ev) => {
      if (dismissible && ev.target === root) close();
    },
  });
  root.append(panel);

  /** The dialog is named by its visible title when it has one, else by opts.label. */
  function setTitle(title: string): void {
    titleEl.textContent = title;
    if (title) panel.setAttribute('aria-labelledby', titleId);
    else panel.removeAttribute('aria-labelledby');
  }
  if (!opts.bare) setTitle(opts.title ?? '');

  const setDismissible = (value: boolean): void => {
    dismissible = value;
    root.dataset.dismissible = value ? '1' : '0';
    closeBtn.hidden = !value;
  };
  setDismissible(dismissible);

  const handle: ModalHandle = {
    root,
    body,
    footer,
    setTitle,
    setContent: (...content) => mount(body, content),
    setDismissible,
    close,
    get closed() {
      return closed;
    },
  };
  const entry: StackEntry = { handle, closeFromHistory: () => finishClose(true) };
  stack.push(entry);
  overlayRoot().append(root);
  armShield();
  historySync?.opened();
  focusQuietly(panel);
  return handle;
}

export interface ConfirmOptions {
  title: string;
  message: Child;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value: boolean): void => {
      if (answered) return;
      answered = true;
      resolve(value);
      modal.close();
    };
    const modal = openModal({ title: opts.title, className: 'compact', onClose: () => answer(false) });
    modal.setContent(h('div', { class: 'confirm-message' }, opts.message));
    mount(
      modal.footer,
      h('button', { class: 'btn btn-secondary', attrs: { type: 'button' }, onClick: () => answer(false) }, opts.cancelLabel ?? 'Vazgeç'),
      h(
        'button',
        { class: ['btn', opts.danger ? 'btn-danger' : 'btn-primary'], attrs: { type: 'button' }, onClick: () => answer(true) },
        opts.confirmLabel ?? 'Onayla',
      ),
    );
  });
}

/** Closes every open modal (used by reset). */
export function closeAllModals(): void {
  [...stack].reverse().forEach((m) => m.handle.close());
}
