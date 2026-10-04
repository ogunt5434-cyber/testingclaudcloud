// The 1280x720 design stage (SPEC §6): every screen, modal, toast and effect lives inside it. The stage is
// scaled uniformly to fit the viewport (letterboxed on a themed backdrop) and rotated 90° in portrait
// viewports so a phone held upright shows the game sideways. Pure geometry is in `fitStage` (unit-tested).
//
// For other UI modules (battle view, result screen…):
//   - `stageLayer('overlay')` is where modals live (overlay.ts uses it); `stageLayer('fx')` is a free
//     full-stage layer above the modals for effects that must not be clipped by a panel (pointer-events: none).
//   - `clientToStage(x, y)` / `stageRectOf(el)` convert screen coordinates (getBoundingClientRect, pointer
//     events) into stage px, which is what playVfx() and absolute positioning inside the stage expect.
//   - `position: fixed` inside the stage is relative to the stage (it is transformed), not to the window.
import { h } from './dom';

export const STAGE_W = 1280;
export const STAGE_H = 720;

export type StageLayerName = 'screens' | 'hud' | 'banner' | 'overlay' | 'toast' | 'fx';
const LAYERS: readonly StageLayerName[] = ['screens', 'hud', 'banner', 'overlay', 'toast', 'fx'];

export interface StageFit {
  /** Uniform scale from stage px to CSS px. */
  scale: number;
  /** True when the stage is turned 90° clockwise (portrait viewport). */
  rotated: boolean;
  /** Screen position (CSS px, relative to the fit box) of the stage's top-left corner. */
  x: number;
  y: number;
}

/**
 * Fits the stage into a `width` x `height` box: uniform scale, centred, rotated when the box is portrait.
 * The transform is `translate(x, y) rotate(90deg?) scale(scale)` with transform-origin 0 0.
 */
export function fitStage(width: number, height: number): StageFit {
  const w = Math.max(1, width);
  const h2 = Math.max(1, height);
  const rotated = h2 > w;
  if (!rotated) {
    const scale = Math.min(w / STAGE_W, h2 / STAGE_H);
    return { scale, rotated, x: (w - STAGE_W * scale) / 2, y: (h2 - STAGE_H * scale) / 2 };
  }
  // Rotated 90° clockwise: stage x runs down the screen, stage y runs right-to-left.
  const scale = Math.min(h2 / STAGE_W, w / STAGE_H);
  return { scale, rotated, x: (w + STAGE_H * scale) / 2, y: (h2 - STAGE_W * scale) / 2 };
}

/** Maps a point in fit-box px to stage px (inverse of the fit transform). */
export function toStagePoint(fit: StageFit, px: number, py: number): { x: number; y: number } {
  const dx = (px - fit.x) / fit.scale;
  const dy = (py - fit.y) / fit.scale;
  // forward (rotated): screen = (-y, x) * s + t  ->  x = dy, y = -dx
  return fit.rotated ? { x: dy, y: -dx } : { x: dx, y: dy };
}

/**
 * Full-bleed geometry, in stage px. The 1280x720 stage is the "safe area" every control lives in; on a
 * screen with another aspect ratio (a 2.16:1 phone, a 4:3 tablet) the painted backgrounds keep going past
 * it to the real screen edges (`bleedX` / `bleedY`, symmetric), and the HUD corners move out to the
 * safe-area edges (`edge*`, per side, notches excluded). Art is drawn `BLEED_ART_X` / `BLEED_ART_Y` past the
 * stage, so edges are capped there (beyond that a very wide monitor shows plain bars).
 */
export interface StageBleed {
  bleedX: number;
  bleedY: number;
  edgeL: number;
  edgeR: number;
  edgeT: number;
  edgeB: number;
}

export const BLEED_ART_X = 240;
export const BLEED_ART_Y = 150;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function stageBoxOf(fit: StageFit, box: Box): { x0: number; y0: number; x1: number; y1: number } {
  const pts = [
    toStagePoint(fit, box.left, box.top),
    toStagePoint(fit, box.right, box.top),
    toStagePoint(fit, box.left, box.bottom),
    toStagePoint(fit, box.right, box.bottom),
  ];
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
}

/**
 * Bleed of a fitted stage: `screen` is the whole viewport and `safe` the notch-free box, both in the same
 * px space as `fit` (fit.x / fit.y).
 */
export function stageBleed(fit: StageFit, screen: Box, safe: Box = screen): StageBleed {
  const full = stageBoxOf(fit, screen);
  const inner = stageBoxOf(fit, safe);
  const clamp = (v: number, max: number): number => Math.round(Math.max(0, Math.min(max, v)) * 100) / 100;
  return {
    bleedX: clamp(Math.max(-full.x0, full.x1 - STAGE_W), BLEED_ART_X),
    bleedY: clamp(Math.max(-full.y0, full.y1 - STAGE_H), BLEED_ART_Y),
    edgeL: clamp(-inner.x0, BLEED_ART_X),
    edgeR: clamp(inner.x1 - STAGE_W, BLEED_ART_X),
    edgeT: clamp(-inner.y0, BLEED_ART_Y),
    edgeB: clamp(inner.y1 - STAGE_H, BLEED_ART_Y),
  };
}

interface StageDom {
  viewport: HTMLElement;
  fitBox: HTMLElement;
  stage: HTMLElement;
  layers: Record<StageLayerName, HTMLElement>;
}

let dom: StageDom | null = null;
let fit: StageFit = { scale: 1, rotated: false, x: 0, y: 0 };
let bleed: StageBleed = { bleedX: 0, bleedY: 0, edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0 };
const resizeListeners = new Set<() => void>();
const HINT_KEY = 'dk-rotate-hint';

function build(host: HTMLElement): StageDom {
  const layers = {} as Record<StageLayerName, HTMLElement>;
  for (const name of LAYERS) layers[name] = h('div', { class: ['stage-layer', `stage-${name}`] });
  layers.toast.setAttribute('aria-live', 'polite');
  layers.toast.setAttribute('role', 'status');
  const stage = h('div', { class: 'stage', attrs: { 'data-stage': '' } }, LAYERS.map((name) => layers[name]));
  const fitBox = h('div', { class: 'stage-fit', attrs: { 'aria-hidden': 'true' } });
  const viewport = h('div', { class: 'stage-viewport' }, fitBox, stage);
  host.append(viewport);
  return { viewport, fitBox, stage, layers };
}

function layout(): void {
  if (!dom) return;
  const box = dom.fitBox.getBoundingClientRect();
  const vp = dom.viewport.getBoundingClientRect();
  const next = fitStage(box.width, box.height);
  // Positions are relative to the viewport element (the fit box is inset by the safe areas).
  next.x += box.left - vp.left;
  next.y += box.top - vp.top;
  fit = next;
  const t = `translate(${fit.x.toFixed(2)}px, ${fit.y.toFixed(2)}px)${fit.rotated ? ' rotate(90deg)' : ''} scale(${fit.scale.toFixed(5)})`;
  dom.stage.style.transform = t;
  const safe = { left: box.left - vp.left, top: box.top - vp.top, right: box.right - vp.left, bottom: box.bottom - vp.top };
  bleed = stageBleed(fit, { left: 0, top: 0, right: vp.width, bottom: vp.height }, safe);
  const st = dom.stage.style;
  st.setProperty('--bleed-x', `${bleed.bleedX}px`);
  st.setProperty('--bleed-y', `${bleed.bleedY}px`);
  st.setProperty('--edge-l', `${bleed.edgeL}px`);
  st.setProperty('--edge-r', `${bleed.edgeR}px`);
  st.setProperty('--edge-t', `${bleed.edgeT}px`);
  st.setProperty('--edge-b', `${bleed.edgeB}px`);
  dom.stage.classList.toggle('is-rotated', fit.rotated);
  dom.viewport.classList.toggle('is-rotated', fit.rotated);
  document.documentElement.style.setProperty('--stage-scale', fit.scale.toFixed(5));
  if (fit.rotated) maybeShowRotateHint();
  for (const fn of [...resizeListeners]) {
    try {
      fn();
    } catch (err) {
      console.error('stage resize listener failed', err);
    }
  }
}

let hintShown = false;
function maybeShowRotateHint(): void {
  if (hintShown || !dom) return;
  hintShown = true;
  try {
    if (localStorage.getItem(HINT_KEY)) return;
  } catch {
    // storage unavailable: show it once per page load
  }
  const remember = (): void => {
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // not remembered
    }
  };
  const close = (): void => {
    remember();
    hint.classList.add('out');
    setTimeout(() => hint.remove(), 300);
  };
  const hint = h(
    'div',
    { class: 'rotate-hint', attrs: { role: 'note' } },
    h('span', { class: 'rotate-phone', attrs: { 'aria-hidden': 'true' } }, h('i')),
    h('span', { class: 'rotate-text' }, 'Daha iyi görüntü için telefonu yan çevir'),
    h('button', { class: 'rotate-ok', attrs: { type: 'button' }, onClick: close }, 'Tamam'),
  );
  dom.viewport.append(hint);
  setTimeout(() => {
    if (hint.isConnected) close();
  }, 9000);
}

/**
 * Creates the stage inside `host` (once). Later calls return the same stage. Modules that only need a
 * layer can call `stageLayer()`, which mounts the stage on <body> if the app has not done it yet.
 */
export function mountStage(host: HTMLElement = document.body): HTMLElement {
  if (dom && dom.viewport.isConnected) return dom.stage;
  dom = build(host);
  layout();
  const relayout = (): void => layout();
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(relayout, 60));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(relayout).observe(dom.fitBox);
  // The stage and its layers never scroll (CSS `overflow: clip`); browsers without clip fall back to
  // `hidden`, where focusing a control near an edge scrolls the box: undo that so the HUD never shifts.
  const pin = (ev: Event): void => {
    const el = ev.target;
    if (!(el instanceof HTMLElement) || !(el === dom?.viewport || el === dom?.stage || el.classList.contains('stage-layer'))) return;
    if (el.scrollTop !== 0) el.scrollTop = 0;
    if (el.scrollLeft !== 0) el.scrollLeft = 0;
  };
  dom.viewport.addEventListener('scroll', pin, true);
  return dom.stage;
}

/** The 1280x720 stage element (mounted on demand). */
export function getStage(): HTMLElement {
  return mountStage();
}

/**
 * A full-stage layer. Order (bottom to top): screens, hud, banner, overlay (modals), toast, fx.
 * The fx layer ignores pointer events.
 */
export function stageLayer(name: StageLayerName): HTMLElement {
  mountStage();
  return (dom as StageDom).layers[name];
}

export function stageScale(): number {
  return fit.scale;
}

export function stageRotated(): boolean {
  return fit.rotated;
}

/** Current full-bleed geometry (see `stageBleed`). */
export function stageBleedNow(): StageBleed {
  return { ...bleed };
}

/** Converts viewport coordinates (pointer events, getBoundingClientRect) to stage px. */
export function clientToStage(clientX: number, clientY: number): { x: number; y: number } {
  if (!dom) return { x: clientX, y: clientY };
  const vp = dom.viewport.getBoundingClientRect();
  return toStagePoint(fit, clientX - vp.left, clientY - vp.top);
}

/** The element's box in stage px (correct under scaling and rotation). */
export function stageRectOf(el: Element): { x: number; y: number; width: number; height: number } {
  const r = el.getBoundingClientRect();
  const a = clientToStage(r.left, r.top);
  const b = clientToStage(r.right, r.bottom);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** Runs `fn` after every re-fit (window resize, rotation). Returns an unsubscribe function. */
export function onStageResize(fn: () => void): () => void {
  resizeListeners.add(fn);
  return () => resizeListeners.delete(fn);
}
