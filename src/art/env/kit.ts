// Tiny SVG authoring kit shared by the environment art (icons, scenes, town, vfx).
// Everything here is pure string building so it can be unit-tested without a DOM.

/** Deterministic PRNG (mulberry32) so procedural scatter is stable between renders. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Compact number formatting for path data. */
export function n(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
}

let uidCounter = 0;
/** Unique id prefix for gradients/filters so many instances on one page never collide. */
export function nextUid(base: string): string {
  uidCounter = (uidCounter + 1) % 1_000_000_000;
  return `${base}${uidCounter.toString(36)}`;
}

/** Id helper bound to one instance prefix. */
export class Ids {
  constructor(readonly prefix: string) {}
  id(name: string): string {
    return `${this.prefix}-${name}`;
  }
  url(name: string): string {
    return `url(#${this.prefix}-${name})`;
  }
}

export type Stop = readonly [offset: number, color: string, opacity?: number];

function stops(list: readonly Stop[]): string {
  return list
    .map(([o, c, op]) => `<stop offset="${n(o)}" stop-color="${c}"${op === undefined ? '' : ` stop-opacity="${Math.round(op * 100) / 100}"`}/>`)
    .join('');
}

/** Linear gradient in objectBoundingBox units (0..1). Default: top to bottom. */
export function linGrad(id: string, list: readonly Stop[], x1 = 0, y1 = 0, x2 = 0, y2 = 1): string {
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(list)}</linearGradient>`;
}

/** Linear gradient in user space units. */
export function linGradU(id: string, list: readonly Stop[], x1: number, y1: number, x2: number, y2: number): string {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">${stops(list)}</linearGradient>`;
}

/** Radial gradient in objectBoundingBox units. */
export function radGrad(id: string, list: readonly Stop[], cx = 0.5, cy = 0.5, r = 0.5, fx?: number, fy?: number): string {
  const focus = fx === undefined ? '' : ` fx="${fx}" fy="${fy ?? cy}"`;
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"${focus}>${stops(list)}</radialGradient>`;
}

/** Radial gradient in user space units. */
export function radGradU(id: string, list: readonly Stop[], cx: number, cy: number, r: number): string {
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}">${stops(list)}</radialGradient>`;
}

/** Gaussian blur filter with a generous region (for glows and soft painted shading). */
export function blurFilter(id: string, std: number): string {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${n(std)}"/></filter>`;
}

/** Fine film grain for a painted texture (applied once per scene at low opacity). */
export function grainFilter(id: string, freq = 0.9, seed = 3): string {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.6 -0.55"/></filter>`;
}

/** Large painterly mottling (low-frequency noise) for walls & ground. */
export function mottleFilter(id: string, freq = 0.012, seed = 7): string {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.5 1.05"/></filter>`;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export function circlePath(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0Z`;
}

export function poly(points: readonly (readonly [number, number])[]): string {
  return `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
}

/** n-pointed star (rotation in degrees, 0 = first point straight up). */
export function starPath(cx: number, cy: number, points: number, rOut: number, rIn: number, rot = 0): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    pts.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]);
  }
  return poly(pts);
}

/** Rounded star (soft cartoon star) built with quadratic corners. */
export function softStarPath(cx: number, cy: number, points: number, rOut: number, rIn: number, round = 0.18, rot = 0): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    pts.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]);
  }
  const len = pts.length;
  let d = '';
  for (let i = 0; i < len; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + len) % len];
    const next = pts[(i + 1) % len];
    const a: [number, number] = [p[0] + (prev[0] - p[0]) * round, p[1] + (prev[1] - p[1]) * round];
    const b: [number, number] = [p[0] + (next[0] - p[0]) * round, p[1] + (next[1] - p[1]) * round];
    d += `${i === 0 ? 'M' : 'L'}${n(a[0])} ${n(a[1])}Q${n(p[0])} ${n(p[1])} ${n(b[0])} ${n(b[1])}`;
  }
  return `${d}Z`;
}

/** Regular polygon (rotation in degrees, 0 = vertex straight up). */
export function regularPoly(cx: number, cy: number, sides: number, r: number, rot = 0): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((rot + (i * 360) / sides) * Math.PI) / 180;
    pts.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]);
  }
  return poly(pts);
}

/** Gear outline with trapezoid teeth. */
export function gearPath(cx: number, cy: number, teeth: number, rOut: number, rIn: number): string {
  const pts: [number, number][] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const angles: [number, number][] = [
      [a - step * 0.5, rIn],
      [a - step * 0.22, rIn],
      [a - step * 0.14, rOut],
      [a + step * 0.14, rOut],
      [a + step * 0.22, rIn],
    ];
    for (const [ang, r] of angles) pts.push([cx + r * Math.sin(ang), cy - r * Math.cos(ang)]);
  }
  return poly(pts);
}

/** Crescent = circle (cx,cy,r) minus circle (cx+ox, cy+oy, r2). */
export function crescentPath(cx: number, cy: number, r: number, ox: number, oy: number, r2: number): string {
  const d = Math.hypot(ox, oy);
  const a = (r * r - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r * r - a * a));
  const ux = ox / d;
  const uy = oy / d;
  const px = cx + a * ux;
  const py = cy + a * uy;
  const p1: [number, number] = [px - h * uy, py + h * ux];
  const p2: [number, number] = [px + h * uy, py - h * ux];
  // Outer arc the long way around (away from the cut), then back along the inner circle.
  const largeOuter = a > 0 ? 1 : 0;
  const largeInner = a > d ? 1 : 0;
  return `M${n(p2[0])} ${n(p2[1])}A${n(r)} ${n(r)} 0 ${largeOuter} 0 ${n(p1[0])} ${n(p1[1])}A${n(r2)} ${n(r2)} 0 ${largeInner} 1 ${n(p2[0])} ${n(p2[1])}Z`;
}

/** Irregular blob around a center (for clouds of foliage, stones, puddles). */
export function blobPath(rand: () => number, cx: number, cy: number, rx: number, ry: number, lumps = 9, jitter = 0.18): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < lumps; i++) {
    const a = (i / lumps) * Math.PI * 2;
    const k = 1 - jitter + rand() * jitter * 2;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return smoothClosed(pts);
}

/** Smooth closed curve through points (Catmull-Rom converted to cubic Béziers). */
export function smoothClosed(pts: readonly (readonly [number, number])[], tension = 1): string {
  const len = pts.length;
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < len; i++) {
    const p0 = pts[(i - 1 + len) % len];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % len];
    const p3 = pts[(i + 2) % len];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;
    d += `C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return `${d}Z`;
}

/** Smooth open curve through points. */
export function smoothOpen(pts: readonly (readonly [number, number])[], tension = 1): string {
  const len = pts.length;
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < len - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(len - 1, i + 2)];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;
    d += `C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

/** Jagged horizon (for rock walls & mountains): closed down to `bottom`. */
export function ridgePath(rand: () => number, x0: number, x1: number, baseY: number, amp: number, step: number, bottom: number, smooth = false): string {
  const pts: [number, number][] = [];
  for (let x = x0; x <= x1 + step; x += step * (0.6 + rand() * 0.8)) {
    pts.push([Math.min(x, x1), baseY - rand() * amp]);
  }
  if (smooth) {
    const top = smoothOpen(pts);
    return `${top}L${n(x1)} ${n(bottom)}L${n(x0)} ${n(bottom)}Z`;
  }
  return `M${n(x0)} ${n(bottom)}${pts.map(([x, y]) => `L${n(x)} ${n(y)}`).join('')}L${n(x1)} ${n(bottom)}Z`;
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Linear blend of two hex colors. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex(ca.map((v, i) => v + (cb[i] - v) * t));
}

export const lighten = (c: string, t: number): string => mix(c, '#ffffff', t);
export const darken = (c: string, t: number): string => mix(c, '#000000', t);

/** A four-tone material palette (lit, mid, shadow, ink line). */
export interface DepthPal {
  light: string;
  mid: string;
  dark: string;
  line: string;
}

/**
 * Depth cue for painted layers: depth 0 = foreground (unchanged), 1 = far distance. Far layers are pulled
 * toward the air colour (lower contrast, atmospheric haze) and their ink line moves close to their own fill,
 * so only near layers keep the thick dark cartoon outline.
 */
export function atDepth<T extends DepthPal>(p: T, depth: number, air: string): T {
  const d = Math.max(0, Math.min(1, depth));
  const t = d * 0.55;
  return { ...p, light: mix(p.light, air, t), mid: mix(p.mid, air, t), dark: mix(p.dark, air, t), line: d > 0 ? mix(p.dark, air, t * 0.6) : p.line };
}

/** Outline width for a layer at `depth` (near layers thick, far layers 1.2 px). */
export function lineAt(depth: number, near = 2.6): number {
  return near - (near - 1.2) * Math.max(0, Math.min(1, depth));
}

/** Escape text for SVG/HTML markup. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** True when the string contains emoji / pictographic characters (used by tests & dev asserts). */
export function hasEmoji(s: string): boolean {
  return /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u.test(s);
}

/** Closed polygon with rounded corners (quadratic corner cuts of radius ~r). */
export function roundedPolyPath(pts: readonly (readonly [number, number])[], r: number): string {
  const len = pts.length;
  let d = '';
  for (let i = 0; i < len; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + len) % len];
    const next = pts[(i + 1) % len];
    const lp = Math.hypot(prev[0] - p[0], prev[1] - p[1]) || 1;
    const ln = Math.hypot(next[0] - p[0], next[1] - p[1]) || 1;
    const rp = Math.min(r, lp / 2.2);
    const rn = Math.min(r, ln / 2.2);
    const a: [number, number] = [p[0] + ((prev[0] - p[0]) / lp) * rp, p[1] + ((prev[1] - p[1]) / lp) * rp];
    const b: [number, number] = [p[0] + ((next[0] - p[0]) / ln) * rn, p[1] + ((next[1] - p[1]) / ln) * rn];
    d += `${i === 0 ? 'M' : 'L'}${n(a[0])} ${n(a[1])}Q${n(p[0])} ${n(p[1])} ${n(b[0])} ${n(b[1])}`;
  }
  return `${d}Z`;
}

/** Cartoon scalloped outline (clouds, foliage): points around an ellipse joined by outward arcs. */
export function scallopPath(rand: () => number, cx: number, cy: number, rx: number, ry: number, count: number, bulge = 0.62, jitter = 0.12): string {
  const pts: [number, number][] = [];
  const start = rand() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = start + (i / count) * Math.PI * 2 + (rand() - 0.5) * (Math.PI / count) * 0.6;
    const k = 1 - jitter + rand() * jitter * 2;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < count; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % count];
    const chord = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const r = Math.max(chord * bulge, chord / 2 + 0.01);
    d += `A${n(r)} ${n(r)} 0 0 1 ${n(q[0])} ${n(q[1])}`;
  }
  return `${d}Z`;
}
