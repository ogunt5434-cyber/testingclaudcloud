// Toast notifications (success / error / info), stacked at the top of the screen.
// They are click-through (pointer-events: none) so they never block the controls they cover.
import { h, type Child } from './dom';

export type ToastKind = 'info' | 'success' | 'error' | 'reward';

/** Kept small: toasts overlap modal headers while visible. */
const MAX_TOASTS = 2;
const TOAST_ICONS: Record<ToastKind, string> = { info: 'ℹ️', success: '✅', error: '⚠️', reward: '🎁' };

let container: HTMLElement | null = null;

function toastContainer(): HTMLElement {
  if (!container || !container.isConnected) {
    container = h('div', { class: 'toasts', attrs: { 'aria-live': 'polite', role: 'status' } });
    document.body.append(container);
  }
  return container;
}

function dismiss(el: HTMLElement): void {
  if (el.classList.contains('out')) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), 250);
}

export function showToast(content: Child, kind: ToastKind = 'info', durationMs = 2600): void {
  const box = toastContainer();
  const el = h(
    'div',
    { class: ['toast', `toast-${kind}`] },
    h('span', { class: 'toast-icon' }, TOAST_ICONS[kind]),
    h('span', { class: 'toast-text' }, content),
  );
  box.append(el);
  // Toasts that are already leaving stay in the DOM during their exit animation, so skip them.
  const live = [...box.children].filter((child) => !child.classList.contains('out')) as HTMLElement[];
  live.slice(0, Math.max(0, live.length - MAX_TOASTS)).forEach(dismiss);
  setTimeout(() => dismiss(el), durationMs);
}
