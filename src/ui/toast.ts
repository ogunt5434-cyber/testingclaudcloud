// Toast notifications (success / error / info / reward), stacked at the top of the stage under the HUD.
// They are click-through (pointer-events: none) so they never block the controls they cover.
import { icon, type IconName } from '../art';
import { h, type Child } from './dom';
import { plainText } from './format';
import { stageLayer } from './stage';

export type ToastKind = 'info' | 'success' | 'error' | 'reward';

/** Kept small: toasts overlap modal headers while visible. */
const MAX_TOASTS = 2;
const TOAST_ICONS: Record<ToastKind, IconName> = { info: 'info', success: 'star', error: 'close', reward: 'chest' };

function dismiss(el: HTMLElement): void {
  if (el.classList.contains('out')) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), 250);
}

export function showToast(content: Child, kind: ToastKind = 'info', durationMs = 2600): void {
  const box = stageLayer('toast');
  const el = h(
    'div',
    { class: ['toast', `toast-${kind}`] },
    h('span', { class: 'toast-icon', attrs: { 'aria-hidden': 'true' } }, icon(TOAST_ICONS[kind], 30)),
    h('span', { class: 'toast-text' }, typeof content === 'string' ? plainText(content) : content),
  );
  box.append(el);
  // Toasts that are already leaving stay in the DOM during their exit animation, so skip them.
  const live = [...box.children].filter((child) => child.classList.contains('toast') && !child.classList.contains('out')) as HTMLElement[];
  live.slice(0, Math.max(0, live.length - MAX_TOASTS)).forEach(dismiss);
  setTimeout(() => dismiss(el), durationMs);
}
