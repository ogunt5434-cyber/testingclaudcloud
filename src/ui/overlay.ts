// Modal stack: panels / bottom sheets / full-screen layers, plus a promise-based confirm dialog.
import { h, mount, type Child } from './dom';

export interface ModalOptions {
  title?: string;
  /** Extra classes for the panel (e.g. 'sheet', 'compact'). */
  className?: string;
  /** Close on backdrop tap, Escape and the ✕ button. Default true. */
  dismissible?: boolean;
  /** Full-screen layer without panel chrome (used by the battle view). */
  bare?: boolean;
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
  close(): void;
  readonly closed: boolean;
}

const stack: ModalHandle[] = [];
let layerRoot: HTMLElement | null = null;

function overlayRoot(): HTMLElement {
  if (!layerRoot || !layerRoot.isConnected) {
    layerRoot = h('div', { class: 'overlay-root' });
    document.body.append(layerRoot);
    document.addEventListener('keydown', onKeyDown);
  }
  return layerRoot;
}

function onKeyDown(ev: KeyboardEvent): void {
  if (ev.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (top && top.root.dataset.dismissible === '1') top.close();
}

export function openModal(opts: ModalOptions, ...children: Child[]): ModalHandle {
  const dismissible = opts.dismissible ?? true;
  const titleEl = h('h2', { class: 'modal-title' }, opts.title ?? '');
  const body = h('div', { class: 'modal-body' }, children);
  const footer = h('div', { class: 'modal-footer' });
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    const index = stack.indexOf(handle);
    if (index >= 0) stack.splice(index, 1);
    root.classList.add('closing');
    setTimeout(() => root.remove(), 200);
    opts.onClose?.();
  };

  const closeBtn = dismissible
    ? h('button', { class: 'modal-close', attrs: { 'aria-label': 'Kapat', type: 'button' }, onClick: close }, '✕')
    : null;
  const panel = opts.bare
    ? h('div', { class: ['modal-bare', opts.className] }, body)
    : h(
        'div',
        { class: ['modal-panel', opts.className], attrs: { role: 'dialog', 'aria-modal': 'true' } },
        h('div', { class: 'modal-head' }, titleEl, closeBtn),
        body,
        footer,
      );

  const root = h('div', {
    class: ['modal-layer', opts.bare ? 'bare' : null],
    attrs: { 'data-dismissible': dismissible ? '1' : '0' },
    onClick: (ev) => {
      if (dismissible && ev.target === root) close();
    },
  });
  root.append(panel);

  const handle: ModalHandle = {
    root,
    body,
    footer,
    setTitle: (title) => {
      titleEl.textContent = title;
    },
    setContent: (...content) => mount(body, content),
    close,
    get closed() {
      return closed;
    },
  };
  stack.push(handle);
  overlayRoot().append(root);
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
  [...stack].reverse().forEach((m) => m.close());
}
