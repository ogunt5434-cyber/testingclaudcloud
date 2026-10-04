// Battle visual effects: DOM/SVG elements animated with the Web Animations API, positioned in
// stage px inside a positioned layer. Every effect removes its nodes and resolves when finished.
import type { ControlStatus, DotStatus, Faction } from '../core/types';
import type { Point, VfxKind } from './types';
import { FACTION_COLOR } from './env/iconArt';
import { n, softStarPath, starPath } from './env/kit';
import './env.css';

export interface VfxOpts {
  faction?: Faction;
  big?: boolean;
  /** Variant for 'control' (stun/freeze/petrify/silence) and 'dot' (burn/poison/bleed) effects. */
  status?: ControlStatus | DotStatus;
}

interface Pal {
  core: string;
  glow: string;
  deep: string;
}

const DEFAULT_PAL: Record<VfxKind, Pal> = {
  slash: { core: '#ffffff', glow: '#ffd36a', deep: '#c86a0a' },
  arrow: { core: '#fff8e0', glow: '#ffe08a', deep: '#a8700a' },
  'magic-bolt': { core: '#ffffff', glow: '#9fd8ff', deep: '#2a5ab8' },
  explosion: { core: '#fff6c0', glow: '#ff8a2a', deep: '#c2300a' },
  'aoe-wave': { core: '#ffffff', glow: '#8fe6ff', deep: '#2a6ad0' },
  heal: { core: '#f2ffe0', glow: '#6ef07a', deep: '#1f9a3a' },
  buff: { core: '#fffbe0', glow: '#ffd23a', deep: '#c27a0a' },
  debuff: { core: '#f6e0ff', glow: '#b05cff', deep: '#4a1a8a' },
  control: { core: '#fffbe0', glow: '#ffd23a', deep: '#a8700a' },
  dot: { core: '#fff2b0', glow: '#ff7a2a', deep: '#b3260a' },
  death: { core: '#ffffff', glow: '#bfe6ff', deep: '#5a7ac8' },
};

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Effect context: owns the effect's container and tracks its animations. */
class Fx {
  readonly root: HTMLDivElement;
  private readonly pending: Promise<unknown>[] = [];
  readonly scale: number;
  readonly speed: number;
  constructor(
    layer: HTMLElement,
    readonly pal: Pal,
    big: boolean,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'ae-vfx';
    layer.append(this.root);
    this.scale = big ? 1.5 : 1;
    this.speed = big ? 1.3 : 1;
  }

  /** Absolutely positioned element centered on its transform origin. */
  el(w: number, h: number, html = '', cls = ''): HTMLDivElement {
    const d = document.createElement('div');
    d.className = `ae-vfx-el${cls ? ` ${cls}` : ''}`;
    d.style.width = `${n(w)}px`;
    d.style.height = `${n(h)}px`;
    d.style.marginLeft = `${n(-w / 2)}px`;
    d.style.marginTop = `${n(-h / 2)}px`;
    d.style.opacity = '0';
    if (html) d.innerHTML = html;
    this.root.append(d);
    return d;
  }

  /** Animate; durations are in ms (already scaled by the caller if needed). */
  anim(target: Element, frames: Keyframe[], duration: number, delay = 0, easing = 'ease-out'): void {
    const opts: KeyframeAnimationOptions = { duration: duration * this.speed, delay: delay * this.speed, easing, fill: 'both' };
    if (typeof (target as HTMLElement).animate === 'function') {
      const a = (target as HTMLElement).animate(frames, opts);
      this.pending.push(a.finished.catch(() => undefined));
    } else {
      this.pending.push(new Promise((r) => setTimeout(r, (duration + delay) * this.speed)));
    }
  }

  async done(): Promise<void> {
    await Promise.all(this.pending);
    this.root.remove();
  }
}

const T = (x: number, y: number, extra = ''): string => `translate(${n(x)}px, ${n(y)}px)${extra ? ` ${extra}` : ''}`;
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

function glowBall(fx: Fx, size: number, color: string, core = '#ffffff'): HTMLDivElement {
  const d = fx.el(size, size);
  d.style.background = `radial-gradient(circle, ${core} 0 18%, ${color} 38%, color-mix(in srgb, ${color} 35%, transparent) 60%, transparent 72%)`;
  d.style.borderRadius = '50%';
  return d;
}

/** Quick bright impact flash. */
function flash(fx: Fx, x: number, y: number, size: number, color: string, delay = 0): void {
  const d = glowBall(fx, size * fx.scale, color);
  fx.anim(d, [
    { transform: T(x, y, 'scale(0.2)'), opacity: 1 },
    { transform: T(x, y, 'scale(1)'), opacity: 0.9, offset: 0.35 },
    { transform: T(x, y, 'scale(1.25)'), opacity: 0 },
  ], 260, delay);
}

/** Radial spark lines flying out. */
function sparks(fx: Fx, x: number, y: number, count: number, color: string, dist = 60, delay = 0, len = 16): void {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rnd(-0.3, 0.3);
    const d = fx.el(len * fx.scale, 3.5 * fx.scale);
    d.style.background = `linear-gradient(90deg, transparent, ${color} 40%, #fff)`;
    d.style.borderRadius = '3px';
    const deg = (ang * 180) / Math.PI;
    const r = dist * fx.scale * rnd(0.7, 1.15);
    fx.anim(d, [
      { transform: T(x, y, `rotate(${n(deg)}deg) scaleX(0.4)`), opacity: 1 },
      { transform: T(x + Math.cos(ang) * r, y + Math.sin(ang) * r, `rotate(${n(deg)}deg) scaleX(1)`), opacity: 0 },
    ], rnd(260, 380), delay + rnd(0, 40), 'cubic-bezier(.2,.8,.3,1)');
  }
}

/** Expanding ground ring (squashed ellipse). */
function ring(fx: Fx, x: number, y: number, size: number, color: string, delay = 0, dur = 420, squash = 0.36, width = 5): void {
  const d = fx.el(size * fx.scale, size * fx.scale);
  d.style.borderRadius = '50%';
  d.style.border = `${width}px solid ${color}`;
  d.style.boxShadow = `0 0 12px ${color}, inset 0 0 12px ${color}`;
  fx.anim(d, [
    { transform: T(x, y, `scale(0.2, ${n(0.2 * squash)})`), opacity: 0.95 },
    { transform: T(x, y, `scale(1, ${n(squash)})`), opacity: 0 },
  ], dur, delay, 'cubic-bezier(.2,.7,.3,1)');
}

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" overflow="visible">${body}</svg>`;
}

// ---------------------------------------------------------------------------
// effects
// ---------------------------------------------------------------------------

function slash(fx: Fx, to: Point, big: boolean): void {
  const p = fx.pal;
  const crescent = 'M14 150Q50 30 186 40Q78 66 14 150Z';
  const core = 'M30 136Q66 50 170 46Q84 72 30 136Z';
  const art = svg(200, 190, `<path d="${crescent}" fill="${p.glow}" opacity=".85"/><path d="${core}" fill="${p.core}"/>`);
  const cuts = big ? [-28, 62, 18] : [-28, 62];
  cuts.forEach((rot, i) => {
    const d = fx.el(170 * fx.scale, 160 * fx.scale, art, 'ae-vfx-glow');
    d.style.setProperty('--g', p.glow);
    const delay = i * 90;
    fx.anim(d, [
      { transform: T(to.x, to.y, `rotate(${rot - 35}deg) scale(0.6)`), opacity: 0, clipPath: 'inset(0 100% 0 0)' },
      { transform: T(to.x, to.y, `rotate(${rot - 8}deg) scale(1)`), opacity: 1, clipPath: 'inset(0 0% 0 0)', offset: 0.45 },
      { transform: T(to.x, to.y, `rotate(${rot + 6}deg) scale(1.08)`), opacity: 0, clipPath: 'inset(0 0% 0 0)' },
    ], 300, delay, 'cubic-bezier(.2,.8,.3,1)');
  });
  flash(fx, to.x, to.y, 90, p.glow, 80);
  sparks(fx, to.x, to.y, big ? 10 : 7, p.glow, 70, 90);
}

function arrow(fx: Fx, from: Point, to: Point, big: boolean): void {
  const p = fx.pal;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const art = svg(
    120,
    20,
    `<rect x="0" y="8.5" width="80" height="3" rx="1.5" fill="${p.glow}" opacity=".55"/>` +
      `<rect x="44" y="8.5" width="62" height="3" fill="#8a5a2a" stroke="#2a1608" stroke-width=".8"/>` +
      `<path d="M104 4L120 10L104 16L107 10Z" fill="#e8eef8" stroke="#2a3048" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<path d="M44 10L36 3H46L52 10L46 17H36Z" fill="#e2453a" stroke="#4a0a10" stroke-width="1"/>`,
  );
  const shots = big ? [-14, 0, 14] : [0];
  shots.forEach((off, i) => {
    const d = fx.el(120 * fx.scale, 20 * fx.scale, art);
    const sx = from.x;
    const sy = from.y + off;
    const ex = to.x - Math.cos((deg * Math.PI) / 180) * 30;
    const ey = to.y + off - Math.sin((deg * Math.PI) / 180) * 30;
    const midY = (sy + ey) / 2 - Math.min(40, Math.abs(dx) * 0.06);
    fx.anim(d, [
      { transform: T(sx, sy, `rotate(${n(deg - 6)}deg)`), opacity: 0 },
      { transform: T((sx + ex) / 2, midY, `rotate(${n(deg)}deg)`), opacity: 1, offset: 0.45 },
      { transform: T(ex, ey, `rotate(${n(deg + 6)}deg)`), opacity: 1, offset: 0.95 },
      { transform: T(ex, ey, `rotate(${n(deg + 6)}deg)`), opacity: 0 },
    ], 260, i * 70, 'cubic-bezier(.4,.1,.8,.6)');
    flash(fx, to.x, to.y + off, 60, p.glow, 240 + i * 70);
    sparks(fx, to.x, to.y + off, 5, p.glow, 40, 240 + i * 70, 12);
  });
}

function magicBolt(fx: Fx, from: Point, to: Point, big: boolean): void {
  const p = fx.pal;
  const size = 46;
  const orb = glowBall(fx, size * fx.scale, p.glow, p.core);
  const lift = Math.min(70, Math.abs(to.x - from.x) * 0.12);
  const pt = (t: number): Point => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * lift });
  const steps = 8;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const q = pt(t);
    frames.push({ transform: T(q.x, q.y, `scale(${n(0.6 + t * 0.5)}) rotate(${i * 40}deg)`), opacity: i === 0 ? 0 : 1, offset: t * 0.92 });
  }
  frames.push({ transform: T(to.x, to.y, 'scale(1.3)'), opacity: 0 });
  const travel = 320;
  fx.anim(orb, frames, travel, 0, 'cubic-bezier(.45,.05,.7,.9)');
  // inner swirl
  const swirl = fx.el(size * 0.9 * fx.scale, size * 0.9 * fx.scale, svg(40, 40, `<path d="${softStarPath(20, 20, 4, 18, 5, 0.1)}" fill="${p.core}" opacity=".9"/>`));
  fx.anim(swirl, frames.map((f, i) => ({ ...f, transform: String(f.transform).replace(/rotate\([^)]*\)/, `rotate(${-i * 60}deg)`) })), travel, 0, 'cubic-bezier(.45,.05,.7,.9)');
  // sparkle trail
  const trail = big ? 12 : 8;
  for (let i = 0; i < trail; i++) {
    const t = (i + 1) / (trail + 1);
    const q = pt(t);
    const s = fx.el(12 * fx.scale, 12 * fx.scale, svg(20, 20, `<path d="${starPath(10, 10, 4, 10, 2.6)}" fill="${i % 2 ? p.core : p.glow}"/>`));
    const delay = travel * t * 0.95;
    fx.anim(s, [
      { transform: T(q.x, q.y, 'scale(1) rotate(0deg)'), opacity: 1 },
      { transform: T(q.x + rnd(-14, 14), q.y + rnd(6, 24), 'scale(0.2) rotate(90deg)'), opacity: 0 },
    ], 320, delay);
  }
  flash(fx, to.x, to.y, 110, p.glow, travel - 30);
  ring(fx, to.x, to.y, 120, p.glow, travel - 30, 300, 1, 4);
  sparks(fx, to.x, to.y, big ? 12 : 8, p.glow, 60, travel - 20);
}

function explosion(fx: Fx, to: Point, big: boolean, tinted: boolean): void {
  const p = fx.pal;
  const fire = tinted ? [p.core, p.glow, p.deep] : ['#fff6c0', '#ffb03a', '#e2420f'];
  ring(fx, to.x, to.y, 220, fire[1], 40, 420, 1, 6);
  ring(fx, to.x, to.y + 60, 260, fire[2], 60, 480, 0.35, 6);
  const blobs = big ? 9 : 6;
  for (let i = 0; i < blobs; i++) {
    const ang = rnd(0, Math.PI * 2);
    const r = rnd(0, 34) * fx.scale;
    const size = rnd(60, 100);
    const b = glowBall(fx, size * fx.scale, fire[i % 2 ? 1 : 2], fire[0]);
    const x = to.x + Math.cos(ang) * r;
    const y = to.y + Math.sin(ang) * r;
    fx.anim(b, [
      { transform: T(to.x, to.y, 'scale(0.1)'), opacity: 1 },
      { transform: T(x, y, 'scale(1)'), opacity: 1, offset: 0.35 },
      { transform: T(x, y - 20, 'scale(1.25)'), opacity: 0 },
    ], rnd(420, 560), i * 25, 'cubic-bezier(.15,.8,.3,1)');
  }
  flash(fx, to.x, to.y, 180, fire[0]);
  // smoke puffs
  for (let i = 0; i < (big ? 6 : 4); i++) {
    const s = fx.el(50 * fx.scale, 50 * fx.scale);
    s.style.borderRadius = '50%';
    s.style.background = 'radial-gradient(circle, rgba(70,60,70,.75) 0 40%, rgba(70,60,70,0) 70%)';
    const x = to.x + rnd(-50, 50) * fx.scale;
    fx.anim(s, [
      { transform: T(x, to.y, 'scale(0.4)'), opacity: 0 },
      { transform: T(x, to.y - 20, 'scale(1)'), opacity: 0.8, offset: 0.3 },
      { transform: T(x + rnd(-20, 20), to.y - 80 * fx.scale, 'scale(1.6)'), opacity: 0 },
    ], 480, 100 + i * 30);
  }
  // debris arcs
  for (let i = 0; i < (big ? 12 : 8); i++) {
    const d = fx.el(9 * fx.scale, 9 * fx.scale);
    d.style.borderRadius = '2px';
    d.style.background = i % 2 ? fire[1] : '#3a2a2a';
    const vx = rnd(-160, 160) * fx.scale;
    const vy = rnd(-160, -60) * fx.scale;
    fx.anim(d, [
      { transform: T(to.x, to.y, 'rotate(0deg)'), opacity: 1 },
      { transform: T(to.x + vx * 0.5, to.y + vy * 0.6, 'rotate(180deg)'), opacity: 1, offset: 0.5 },
      { transform: T(to.x + vx, to.y + vy * 0.4 + 90, 'rotate(360deg)'), opacity: 0 },
    ], 520, 30, 'linear');
  }
}

function aoeWave(fx: Fx, from: Point, to: Point, big: boolean): void {
  const p = fx.pal;
  const dir = to.x >= from.x ? 1 : -1;
  const h = 300 * fx.scale;
  const band = fx.el(110 * fx.scale, h, svg(110, 300, `<path d="M20 0Q100 150 20 300Q60 150 20 0Z" fill="${p.glow}" opacity=".85"/><path d="M30 20Q88 150 30 280Q58 150 30 20Z" fill="${p.core}"/>`), 'ae-vfx-glow');
  band.style.setProperty('--g', p.glow);
  const startX = from.x + dir * 40;
  const endX = to.x + dir * 260;
  const flip = dir === 1 ? '' : 'scaleX(-1)';
  fx.anim(band, [
    { transform: T(startX, to.y, `${flip} scale(0.5, 0.6)`), opacity: 0 },
    { transform: T(startX + (endX - startX) * 0.25, to.y, `${flip} scale(1, 1)`), opacity: 1, offset: 0.25 },
    { transform: T(endX, to.y, `${flip} scale(1.1, 1.1)`), opacity: 0 },
  ], 560, 0, 'cubic-bezier(.3,.3,.5,1)');
  // trailing streaks
  for (let i = 0; i < (big ? 10 : 6); i++) {
    const y = to.y + rnd(-h / 2.4, h / 2.4);
    const s = fx.el(90 * fx.scale, 4);
    s.style.background = `linear-gradient(${dir === 1 ? 90 : 270}deg, transparent, ${p.glow})`;
    s.style.borderRadius = '2px';
    fx.anim(s, [
      { transform: T(startX, y), opacity: 0 },
      { transform: T(startX + (endX - startX) * 0.4, y), opacity: 0.9, offset: 0.3 },
      { transform: T(endX - dir * 60, y), opacity: 0 },
    ], 520, rnd(0, 120), 'ease-out');
  }
  ring(fx, to.x, to.y + 70, 520, p.glow, 150, 480, 0.3, 6);
  ring(fx, to.x, to.y + 70, 380, p.core, 230, 400, 0.3, 4);
  flash(fx, to.x, to.y, 130, p.glow, 220);
}

function heal(fx: Fx, to: Point, big: boolean): void {
  const p = fx.pal;
  const col = fx.el(110 * fx.scale, 200 * fx.scale);
  col.style.background = `linear-gradient(to top, color-mix(in srgb, ${p.glow} 70%, transparent), transparent)`;
  col.style.borderRadius = '50% 50% 40% 40% / 30% 30% 20% 20%';
  col.style.filter = 'blur(4px)';
  fx.anim(col, [
    { transform: T(to.x, to.y - 20, 'scaleX(0.4)'), opacity: 0 },
    { transform: T(to.x, to.y - 30, 'scaleX(1)'), opacity: 0.8, offset: 0.35 },
    { transform: T(to.x, to.y - 50, 'scaleX(0.8)'), opacity: 0 },
  ], 600);
  ring(fx, to.x, to.y + 55, 150, p.glow, 0, 560, 0.32, 5);
  const plus = (c: string): string => svg(20, 20, `<path d="M7 1H13V7H19V13H13V19H7V13H1V7H7Z" fill="${c}" stroke="#0a4a1a" stroke-width="1.4" stroke-linejoin="round"/>`);
  for (let i = 0; i < (big ? 7 : 4); i++) {
    const s = fx.el(22 * fx.scale, 22 * fx.scale, plus(i % 2 ? p.core : p.glow));
    const x = to.x + rnd(-45, 45) * fx.scale;
    fx.anim(s, [
      { transform: T(x, to.y + 30, 'scale(0.3)'), opacity: 0 },
      { transform: T(x, to.y - 10, 'scale(1)'), opacity: 1, offset: 0.3 },
      { transform: T(x + rnd(-10, 10), to.y - 90 * fx.scale, 'scale(0.8)'), opacity: 0 },
    ], 520, i * 50, 'ease-out');
  }
  for (let i = 0; i < (big ? 14 : 9); i++) {
    const s = glowBall(fx, 12 * fx.scale, p.glow, p.core);
    const x = to.x + rnd(-55, 55) * fx.scale;
    fx.anim(s, [
      { transform: T(x, to.y + 50, 'scale(0.5)'), opacity: 0 },
      { transform: T(x, to.y + 10, 'scale(1)'), opacity: 1, offset: 0.3 },
      { transform: T(x + rnd(-14, 14), to.y - 100 * fx.scale, 'scale(0.3)'), opacity: 0 },
    ], rnd(420, 560), rnd(0, 140));
  }
}

function arrowsUpDown(fx: Fx, to: Point, big: boolean, up: boolean): void {
  const p = fx.pal;
  const art = svg(
    30,
    36,
    up
      ? `<path d="M15 2L28 18H20V34H10V18H2Z" fill="${p.glow}" stroke="${p.deep}" stroke-width="2.4" stroke-linejoin="round"/><path d="M15 7L8 15H13V30" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>`
      : `<path d="M15 34L28 18H20V2H10V18H2Z" fill="${p.glow}" stroke="${p.deep}" stroke-width="2.4" stroke-linejoin="round"/><path d="M13 6V20H8" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/>`,
  );
  ring(fx, to.x, to.y + 55, 160, p.glow, 0, 560, 0.32, 5);
  const count = big ? 5 : 3;
  for (let i = 0; i < count; i++) {
    const x = to.x + (i - (count - 1) / 2) * 34 * fx.scale;
    const s = fx.el(30 * fx.scale, 36 * fx.scale, art, 'ae-vfx-glow');
    s.style.setProperty('--g', p.glow);
    const y0 = up ? to.y + 40 : to.y - 90;
    const y1 = up ? to.y - 70 : to.y + 30;
    fx.anim(s, [
      { transform: T(x, y0, 'scale(0.5)'), opacity: 0 },
      { transform: T(x, (y0 + y1) / 2, 'scale(1)'), opacity: 1, offset: 0.4 },
      { transform: T(x, y1, 'scale(0.9)'), opacity: 0 },
    ], 500, i * 70, up ? 'cubic-bezier(.2,.7,.4,1)' : 'cubic-bezier(.6,0,.8,.4)');
  }
  for (let i = 0; i < 8; i++) {
    const s = glowBall(fx, 10 * fx.scale, p.glow, p.core);
    const x = to.x + rnd(-50, 50);
    const y0 = up ? to.y + 40 : to.y - 60;
    fx.anim(s, [
      { transform: T(x, y0), opacity: 0 },
      { transform: T(x, y0 + (up ? -30 : 20)), opacity: 1, offset: 0.4 },
      { transform: T(x, y0 + (up ? -80 : 60)), opacity: 0 },
    ], 460, rnd(0, 160));
  }
}

function control(fx: Fx, to: Point, big: boolean, status: ControlStatus): void {
  const headY = to.y - 70;
  if (status === 'freeze') {
    const ice = '#bff4ff';
    flash(fx, to.x, to.y, 160, '#7fe0ff');
    for (let i = 0; i < (big ? 9 : 7); i++) {
      const ang = (i / 7) * Math.PI * 2;
      const x = to.x + Math.cos(ang) * 46 * fx.scale;
      const y = to.y + Math.sin(ang) * 58 * fx.scale;
      const rot = (ang * 180) / Math.PI + 90;
      const shard = fx.el(22 * fx.scale, 54 * fx.scale, svg(22, 54, `<path d="M11 1L21 18L11 53L1 18Z" fill="${ice}" stroke="#0a4a6a" stroke-width="2" stroke-linejoin="round"/><path d="M11 1L1 18L11 53Z" fill="#fff" opacity=".6"/>`));
      fx.anim(shard, [
        { transform: T(x, y, `rotate(${n(rot)}deg) scale(0.2)`), opacity: 0 },
        { transform: T(x, y, `rotate(${n(rot)}deg) scale(1)`), opacity: 1, offset: 0.3 },
        { transform: T(x, y, `rotate(${n(rot)}deg) scale(1)`), opacity: 1, offset: 0.75 },
        { transform: T(x + Math.cos(ang) * 30, y + Math.sin(ang) * 30 + 20, `rotate(${n(rot + 40)}deg) scale(0.6)`), opacity: 0 },
      ], 620, i * 12, 'ease-out');
    }
    ring(fx, to.x, to.y + 55, 170, '#7fe0ff', 0, 560, 0.32, 5);
    return;
  }
  if (status === 'petrify') {
    for (let i = 0; i < (big ? 10 : 7); i++) {
      const x = to.x + rnd(-50, 50) * fx.scale;
      const y = to.y + rnd(-60, 50) * fx.scale;
      const chunk = fx.el(26 * fx.scale, 22 * fx.scale, svg(26, 22, `<path d="M2 14L6 3L18 1L25 9L21 20L7 21Z" fill="#a9b1bf" stroke="#2a2e38" stroke-width="2" stroke-linejoin="round"/><path d="M6 3L18 1L13 10Z" fill="#fff" opacity=".4"/>`));
      fx.anim(chunk, [
        { transform: T(x + rnd(-30, 30), y - 60, 'rotate(-40deg) scale(0.4)'), opacity: 0 },
        { transform: T(x, y, 'rotate(0deg) scale(1)'), opacity: 1, offset: 0.35 },
        { transform: T(x, y, 'rotate(0deg) scale(1)'), opacity: 1, offset: 0.75 },
        { transform: T(x, y + 30, 'rotate(10deg) scale(0.8)'), opacity: 0 },
      ], 620, i * 15, 'cubic-bezier(.5,0,.7,1)');
    }
    for (let i = 0; i < 6; i++) {
      const s = fx.el(40, 40);
      s.style.borderRadius = '50%';
      s.style.background = 'radial-gradient(circle, rgba(200,195,180,.8) 0 40%, rgba(200,195,180,0) 70%)';
      const x = to.x + rnd(-60, 60);
      fx.anim(s, [
        { transform: T(x, to.y + 55, 'scale(0.4)'), opacity: 0 },
        { transform: T(x + rnd(-20, 20), to.y + 30, 'scale(1.5)'), opacity: 0.7, offset: 0.4 },
        { transform: T(x + rnd(-30, 30), to.y + 10, 'scale(2)'), opacity: 0 },
      ], 480, 140 + i * 25);
    }
    return;
  }
  if (status === 'silence') {
    const art = svg(
      64,
      64,
      `<path d="M9 15Q9 9 15 9H45Q51 9 51 15V36Q51 42 45 42H27L16.5 52L18.5 42H15Q9 42 9 36Z" fill="#e9dcff" stroke="#25124a" stroke-width="3.2" stroke-linejoin="round"/>` +
        `<circle cx="19.5" cy="25.5" r="3.2" fill="#3c2470"/><circle cx="30" cy="25.5" r="3.2" fill="#3c2470"/><circle cx="40.5" cy="25.5" r="3.2" fill="#3c2470"/>` +
        `<circle cx="38" cy="38" r="17" fill="none" stroke="#3a0610" stroke-width="9"/><circle cx="38" cy="38" r="17" fill="none" stroke="#ff4040" stroke-width="5"/>` +
        `<path d="M26 26L50 50" stroke="#3a0610" stroke-width="9" stroke-linecap="round"/><path d="M26 26L50 50" stroke="#ff4040" stroke-width="5" stroke-linecap="round"/>`,
    );
    const g = fx.el(54 * fx.scale, 54 * fx.scale, art);
    fx.anim(g, [
      { transform: T(to.x, headY + 10, 'scale(0.2) rotate(-20deg)'), opacity: 0 },
      { transform: T(to.x, headY - 10, 'scale(1.15) rotate(6deg)'), opacity: 1, offset: 0.3 },
      { transform: T(to.x, headY - 12, 'scale(1) rotate(0deg)'), opacity: 1, offset: 0.75 },
      { transform: T(to.x, headY - 24, 'scale(0.9)'), opacity: 0 },
    ], 660, 0, 'ease-out');
    ring(fx, to.x, headY - 10, 110, '#b05cff', 0, 500, 1, 4);
    return;
  }
  // stun: stars orbiting above the head
  const count = big ? 4 : 3;
  const rx = 40 * fx.scale;
  const ry = 13 * fx.scale;
  for (let i = 0; i < count; i++) {
    const s = fx.el(30 * fx.scale, 30 * fx.scale, svg(22, 22, `<path d="${softStarPath(11, 12, 5, 10, 4.6, 0.12)}" fill="#ffd23a" stroke="#6b3a05" stroke-width="1.6"/><path d="M8 8L10 6" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`));
    const frames: Keyframe[] = [];
    const steps = 12;
    for (let k = 0; k <= steps; k++) {
      const ang = (i / count) * Math.PI * 2 + (k / steps) * Math.PI * 2 * 1.5;
      const op = k === 0 || k === steps ? 0 : 1;
      const depth = Math.sin(ang);
      frames.push({ transform: T(to.x + Math.cos(ang) * rx, headY + depth * ry, `scale(${n(0.8 + depth * 0.25)})`), opacity: op, offset: k / steps });
    }
    fx.anim(s, frames, 680, 0, 'linear');
  }
  ring(fx, to.x, headY, 100, '#ffd23a', 0, 560, 0.35, 3);
  flash(fx, to.x, headY, 70, '#ffd23a');
}

function dot(fx: Fx, to: Point, big: boolean, status: DotStatus): void {
  const count = big ? 7 : 5;
  if (status === 'poison') {
    for (let i = 0; i < count; i++) {
      const size = rnd(12, 22) * fx.scale;
      const b = fx.el(size, size);
      b.style.borderRadius = '50%';
      b.style.background = 'radial-gradient(circle at 35% 30%, #f2ffd0 0 15%, #9ae04a 35%, #3a8a1a 80%)';
      b.style.border = '1.5px solid #163d0a';
      const x = to.x + rnd(-40, 40);
      fx.anim(b, [
        { transform: T(x, to.y + 30, 'scale(0.3)'), opacity: 0 },
        { transform: T(x, to.y, 'scale(1)'), opacity: 1, offset: 0.5 },
        { transform: T(x + rnd(-8, 8), to.y - 40, 'scale(1.4)'), opacity: 0 },
      ], 460, i * 50);
    }
    return;
  }
  if (status === 'bleed') {
    for (let i = 0; i < count; i++) {
      const d = fx.el(12 * fx.scale, 18 * fx.scale, svg(12, 18, `<path d="M6 1C8 6 11 9 11 12.5C11 15.5 8.8 17 6 17C3.2 17 1 15.5 1 12.5C1 9 4 6 6 1Z" fill="#e2213a" stroke="#4a0710" stroke-width="1.4"/>`));
      const x = to.x + rnd(-36, 36);
      const y = to.y + rnd(-40, 0);
      fx.anim(d, [
        { transform: T(x, y, 'scale(0.4)'), opacity: 0 },
        { transform: T(x + rnd(-6, 6), y + 8, 'scale(1)'), opacity: 1, offset: 0.3 },
        { transform: T(x + rnd(-6, 6), y + 60, 'scale(0.8)'), opacity: 0 },
      ], 460, i * 50, 'cubic-bezier(.5,0,.9,.6)');
    }
    flash(fx, to.x, to.y - 10, 70, '#ff3a4a');
    return;
  }
  // burn
  const flame = svg(30, 44, `<path d="M15 2C20 12 28 18 26 30C25 38 20 42 15 42C9 42 4 38 4 30C4 22 10 18 12 10C13 15 15 17 16 18C17 13 17 7 15 2Z" fill="#ff7a1a"/><path d="M15 16C18 22 22 26 21 32C20.5 37 18 39 15 39C12 39 9 37 9 33C9 28 13 25 15 16Z" fill="#ffd23a"/>`);
  for (let i = 0; i < count; i++) {
    const f = fx.el(26 * fx.scale, 38 * fx.scale, flame);
    const x = to.x + rnd(-40, 40);
    const y = to.y + rnd(-20, 40);
    fx.anim(f, [
      { transform: T(x, y, 'scale(0.3)'), opacity: 0 },
      { transform: T(x, y - 12, 'scale(1)'), opacity: 1, offset: 0.35 },
      { transform: T(x + rnd(-6, 6), y - 46, 'scale(0.4)'), opacity: 0 },
    ], 460, i * 50);
  }
}

function death(fx: Fx, to: Point, big: boolean): void {
  const p = fx.pal;
  const wisp = svg(
    60,
    90,
    `<path d="M30 6C44 6 52 18 50 32C48 46 38 52 36 62C34 72 40 80 34 88C30 80 22 76 20 66C18 56 10 48 10 32C10 16 18 6 30 6Z" fill="${p.glow}" opacity=".55"/>` +
      `<path d="M30 14C40 14 44 22 43 32C42 42 34 46 32 56C30 50 22 44 20 34C18 24 22 14 30 14Z" fill="${p.core}" opacity=".9"/>` +
      `<circle cx="25" cy="30" r="3" fill="#2a3a6a"/><circle cx="35" cy="30" r="3" fill="#2a3a6a"/>`,
  );
  const s = fx.el(60 * fx.scale, 90 * fx.scale, wisp, 'ae-vfx-glow');
  s.style.setProperty('--g', p.glow);
  fx.anim(s, [
    { transform: T(to.x, to.y + 10, 'scale(0.4)'), opacity: 0 },
    { transform: T(to.x - 8, to.y - 30, 'scale(1) rotate(-6deg)'), opacity: 0.95, offset: 0.3 },
    { transform: T(to.x + 10, to.y - 80, 'scale(1) rotate(6deg)'), opacity: 0.8, offset: 0.65 },
    { transform: T(to.x - 4, to.y - 140, 'scale(0.8) rotate(-4deg)'), opacity: 0 },
  ], 680, 20, 'ease-out');
  ring(fx, to.x, to.y + 55, 140, p.glow, 0, 520, 0.32, 4);
  for (let i = 0; i < (big ? 12 : 8); i++) {
    const m = glowBall(fx, 10, p.glow, p.core);
    const x = to.x + rnd(-40, 40);
    fx.anim(m, [
      { transform: T(x, to.y + 30), opacity: 0 },
      { transform: T(x + rnd(-10, 10), to.y - 20), opacity: 1, offset: 0.4 },
      { transform: T(x + rnd(-20, 20), to.y - 110), opacity: 0 },
    ], rnd(420, 560), rnd(0, 120));
  }
}

/** Reduced-motion fallback: a brief soft glow at the target, no travel or particles. */
function calm(fx: Fx, to: Point): void {
  const d = glowBall(fx, 130 * fx.scale, fx.pal.glow, fx.pal.core);
  fx.anim(d, [
    { transform: T(to.x, to.y), opacity: 0 },
    { transform: T(to.x, to.y), opacity: 0.85, offset: 0.4 },
    { transform: T(to.x, to.y), opacity: 0 },
  ], 320, 0, 'ease-in-out');
}

/** Plays a visual effect inside `layer` (a positioned element in stage px). Resolves when finished. */
export function playVfx(layer: HTMLElement, kind: VfxKind, from: Point, to: Point, opts?: VfxOpts): Promise<void> {
  const o = opts ?? {};
  const big = !!o.big;
  const fac = o.faction ? FACTION_COLOR[o.faction] : null;
  const usesFaction = kind === 'magic-bolt' || kind === 'aoe-wave' || kind === 'slash' || kind === 'explosion';
  const pal: Pal = fac && usesFaction ? fac : DEFAULT_PAL[kind];
  let fx: Fx;
  try {
    fx = new Fx(layer, pal, big);
  } catch {
    return Promise.resolve();
  }
  if (reducedMotion()) {
    calm(fx, to);
    return fx.done();
  }
  switch (kind) {
    case 'slash':
      slash(fx, to, big);
      break;
    case 'arrow':
      arrow(fx, from, to, big);
      break;
    case 'magic-bolt':
      magicBolt(fx, from, to, big);
      break;
    case 'explosion':
      explosion(fx, to, big, !!fac);
      break;
    case 'aoe-wave':
      aoeWave(fx, from, to, big);
      break;
    case 'heal':
      heal(fx, to, big);
      break;
    case 'buff':
      arrowsUpDown(fx, to, big, true);
      break;
    case 'debuff':
      arrowsUpDown(fx, to, big, false);
      break;
    case 'control':
      control(fx, to, big, isControl(o.status) ? o.status : 'stun');
      break;
    case 'dot':
      dot(fx, to, big, isDot(o.status) ? o.status : 'burn');
      break;
    case 'death':
      death(fx, to, big);
      break;
  }
  return fx.done();
}

function isControl(s: VfxOpts['status']): s is ControlStatus {
  return s === 'stun' || s === 'freeze' || s === 'petrify' || s === 'silence';
}

function isDot(s: VfxOpts['status']): s is DotStatus {
  return s === 'burn' || s === 'poison' || s === 'bleed';
}

/** Every effect kind (for galleries & tests). */
export const VFX_KINDS: readonly VfxKind[] = ['slash', 'arrow', 'magic-bolt', 'explosion', 'aoe-wave', 'heal', 'buff', 'debuff', 'control', 'dot', 'death'];
