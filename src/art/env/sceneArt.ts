// Painted battle backdrops (1280x720 design). Pure string builders: each scene returns a back SVG
// layer (sky / far walls), a front SVG layer (ground, props, foreground) and a list of ambient
// effects that the DOM wrapper animates with CSS (motes, glow pulses, spinning rifts).
import type { SceneKind } from '../types';
import { atDepth, blobPath, grainFilter, Ids, lineAt, mix, n, poly, ridgePath, scallopPath, smoothOpen, starPath } from './kit';
import {
  Art,
  ao,
  banner,
  brazier,
  bush,
  column,
  crate,
  cracks,
  crystal,
  crystalCluster,
  fern,
  flagstones,
  foliage,
  groundTiles,
  glow,
  grassTuft,
  lightShaft,
  mushroom,
  pebbles,
  rock,
  root,
  stalactite,
  type CrystalPal,
  type RockPal,
} from './props';

export const SCENE_KINDS: readonly SceneKind[] = ['cave', 'forest', 'ruins', 'volcano', 'tower', 'void'];

export const W = 1280;
export const H = 720;

/**
 * Full-bleed art box: scenes are painted 240 px past the 1280x720 safe area on the left / right and 150 px
 * above / below it, so a wide phone or a 4:3 tablet sees painted scenery up to its edges (see ui/stage.ts).
 */
export const ART_X0 = -240;
export const ART_Y0 = -150;
export const ART_W = 1760;
export const ART_H = 1020;
const X0 = ART_X0;
const X1 = ART_X0 + ART_W;
const Y0 = ART_Y0;
const Y1 = ART_Y0 + ART_H;
/** Full art box rect attributes. */
const FULL = `x="${X0}" y="${Y0}" width="${ART_W}" height="${ART_H}"`;

/** Ambient floating particle stream. */
export interface MoteSpec {
  color: string;
  count: number;
  /** Size range in design px. */
  size: readonly [number, number];
  /** Spawn area [x0, y0, x1, y1]. */
  area: readonly [number, number, number, number];
  /** Vertical travel (negative = up). */
  rise: readonly [number, number];
  drift: number;
  dur: readonly [number, number];
  shape?: 'dot' | 'spark' | 'leaf' | 'ember' | 'star';
}

/** Pulsing radial glow. */
export interface PulseSpec {
  x: number;
  y: number;
  rx: number;
  ry: number;
  color: string;
  dur: number;
  min: number;
  max: number;
}

/** Spinning decal (rift, rune circle). `squash` flattens it into perspective. */
export interface SpinSpec {
  x: number;
  y: number;
  size: number;
  svg: string;
  dur: number;
  squash: number;
  reverse?: boolean;
  back?: boolean;
}

export interface SceneArt {
  kind: SceneKind;
  defs: string;
  back: string;
  front: string;
  motes: MoteSpec[];
  pulses: PulseSpec[];
  spins: SpinSpec[];
  /** Letterbox / fallback color matching the scene. */
  base: string;
}

interface Layers {
  back: string;
  front: string;
  motes: MoteSpec[];
  pulses: PulseSpec[];
  spins: SpinSpec[];
  base: string;
}

// ---------------------------------------------------------------------------
// Shared finishing passes
// ---------------------------------------------------------------------------

function vignette(a: Art, color = '#000', op = 0.6): string {
  // Elliptical falloff: the 16:9 corners darken a little, the far bleed edges of a wide screen more.
  const fill = a.radU([[0, color, 0], [0.5, color, 0], [0.78, color, 0.55], [1, color, 1]], 640, 400, 1020);
  return `<rect ${FULL} fill="${fill}" opacity="${op}" transform="translate(640 400) scale(1 .8) translate(-640 -400)"/>`;
}

function grain(a: Art, op = 0.07): string {
  const id = a.uid('grain');
  a.defs.push(grainFilter(id, 0.85, 5));
  return `<rect ${FULL} filter="url(#${id})" opacity="${op}" style="mix-blend-mode:overlay"/>`;
}

/** A soft color grade wash (top & bottom tint) over the stage height. */
function grade(a: Art, top: string, bottom: string, op = 0.25, blend = 'soft-light'): string {
  const fill = a.linU([[0, top], [1, bottom]], 0, 0, 0, 720);
  return `<rect ${FULL} fill="${fill}" opacity="${op}" style="mix-blend-mode:${blend}"/>`;
}

/** Atmospheric haze between two heights (distant layers fade into the air colour). */
function haze(a: Art, y0: number, y1: number, color: string, op: number): string {
  const fill = a.linU([[0, color, 0], [0.55, color, 1], [1, color, 0.2]], 0, y0, 0, y1);
  return `<rect x="${X0}" y="${y0}" width="${ART_W}" height="${y1 - y0}" fill="${fill}" opacity="${op}"/>`;
}

/** Wavy far edge of the ground, closed to the bottom of the art box. */
function groundShape(a: Art, y: number, amp: number): string {
  const pts: [number, number][] = [];
  for (let x = X0 - 40; x <= X1 + 40; x += 80) pts.push([x, y + a.r(-amp, amp)]);
  return `${smoothOpen(pts)}L${X1 + 40} ${Y1 + 10}L${X0 - 40} ${Y1 + 10}Z`;
}

function litOval(a: Art, color: string, op: number, cx = 640, cy = 470, rx = 560, ry = 195): string {
  const fill = a.rad([[0, color, 0.9], [0.55, color, 0.35], [1, color, 0]]);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" opacity="${op}" style="mix-blend-mode:screen"/>`;
}

// ---------------------------------------------------------------------------
// Cave — torch-lit amber mine: timber supports, a glowing shaft with rails, hanging lanterns,
// amber ore veins in the walls and puddles on a packed-earth floor (original design)
// ---------------------------------------------------------------------------

const WOOD: [string, string, string] = ['#c98d55', '#8a5a32', '#4c2c16'];
const WOOD_FAR: [string, string, string] = ['#8a6a58', '#6a4e44', '#4a3634'];
const AMBER: CrystalPal = { light: '#fff4c8', mid: '#ffb43a', dark: '#c2620c', line: '#4a1e04', glow: '#ffae3a' };

/** A squared timber from (x0, y0) to (x1, y1), lit from the top-left. */
function timber(a: Art, x0: number, y0: number, x1: number, y1: number, w: number, wood: [string, string, string] = WOOD, line = '#22120a', lw = 2.6): string {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  const body = poly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]);
  const fill = a.linU([[0, wood[0]], [0.45, wood[1]], [1, wood[2]]], x0 - nx, y0 - ny, x0 + nx, y0 + ny);
  let grain = '';
  for (const f of [-0.45, 0.1, 0.5]) {
    const ox = nx * f;
    const oy = ny * f;
    const t0 = a.r(0.04, 0.2);
    const t1 = a.r(0.55, 0.96);
    grain += `M${n(x0 + dx * t0 + ox)} ${n(y0 + dy * t0 + oy)}L${n(x0 + dx * t1 + ox)} ${n(y0 + dy * t1 + oy)}`;
  }
  const bolt = (t: number): string => `<circle cx="${n(x0 + dx * t)}" cy="${n(y0 + dy * t)}" r="${n(Math.max(1.6, w * 0.09))}" fill="#3a3640" stroke="${line}" stroke-width="1"/>`;
  return (
    `<path d="${body}" fill="${fill}"/>` +
    `<path d="${grain}" stroke="${wood[2]}" stroke-width="${n(Math.max(1, w * 0.06))}" stroke-linecap="round" opacity=".55"/>` +
    `<path d="M${n(x0 - nx * 0.7)} ${n(y0 - ny * 0.7)}L${n(x1 - nx * 0.7)} ${n(y1 - ny * 0.7)}" stroke="#ffe2b0" stroke-width="${n(Math.max(1, w * 0.07))}" opacity=".35"/>` +
    `<path d="${body}" fill="none" stroke="${line}" stroke-width="${n(lw)}" stroke-linejoin="round"/>` +
    (w > 14 ? bolt(0.08) + bolt(0.92) : '')
  );
}

/** Hanging lantern; `top` is where its chain is fixed. Warm glow included. */
function lantern(a: Art, x: number, y: number, s: number, top: number, glowOp = 0.6): string {
  let chain = '';
  for (let cy = top; cy < y - 20 * s; cy += 7 * s) chain += `<ellipse cx="${n(x)}" cy="${n(cy + 3 * s)}" rx="${n(1.8 * s)}" ry="${n(3.4 * s)}" fill="none" stroke="#2a2420" stroke-width="${n(1.6 * s)}"/>`;
  const glass = `M${n(x - 11 * s)} ${n(y - 14 * s)}H${n(x + 11 * s)}L${n(x + 9 * s)} ${n(y + 14 * s)}H${n(x - 9 * s)}Z`;
  return (
    chain +
    glow(a, x, y + 2 * s, 90 * s, 80 * s, '#ffae3a', glowOp) +
    `<path d="M${n(x - 8 * s)} ${n(y - 20 * s)}H${n(x + 8 * s)}L${n(x + 13 * s)} ${n(y - 13 * s)}H${n(x - 13 * s)}Z" fill="#4a4048" stroke="#1a1416" stroke-width="${n(1.8 * s)}" stroke-linejoin="round"/>` +
    `<path d="${glass}" fill="${a.rad([[0, '#fffbe0'], [0.45, '#ffd06a'], [1, '#e2741a']])}" stroke="#1a1416" stroke-width="${n(2 * s)}" stroke-linejoin="round"/>` +
    `<path d="M${n(x - 4 * s)} ${n(y - 14 * s)}V${n(y + 14 * s)}M${n(x + 4 * s)} ${n(y - 14 * s)}V${n(y + 14 * s)}" stroke="#3a2a22" stroke-width="${n(1.6 * s)}" opacity=".8"/>` +
    `<path d="M${n(x - 11 * s)} ${n(y + 14 * s)}H${n(x + 11 * s)}V${n(y + 19 * s)}H${n(x - 11 * s)}Z" fill="#4a4048" stroke="#1a1416" stroke-width="${n(1.8 * s)}"/>` +
    `<path d="M${n(x - 7 * s)} ${n(y - 10 * s)}L${n(x - 6 * s)} ${n(y + 8 * s)}" stroke="#fff" stroke-width="${n(2 * s)}" stroke-linecap="round" opacity=".55"/>`
  );
}

/** Mine cart on the back rails, heaped with amber ore. */
function mineCart(a: Art, x: number, by: number, s: number): string {
  const tub = poly([[x - 46 * s, by - 62 * s], [x + 46 * s, by - 62 * s], [x + 36 * s, by - 14 * s], [x - 36 * s, by - 14 * s]]);
  let ore = '';
  const pal = [['#fff1b0', '#ffc23a', '#a8560a'], ['#e8e0d8', '#a89a8e', '#5a4a40']] as const;
  for (let i = 0; i < 9; i++) {
    const ox = x + (i - 4) * 9 * s + a.r(-3, 3) * s;
    const oy = by - 64 * s - Math.cos(((i - 4) / 4) * 1.3) * 14 * s + a.r(-2, 2) * s;
    const [l, m, d] = pal[i % 3 === 1 ? 1 : 0];
    const r = a.r(7, 10) * s;
    ore += `<path d="${blobPath(a.rand, ox, oy, r, r * 0.8, 6, 0.2)}" fill="${m}" stroke="#2a1606" stroke-width="${n(1.6 * s)}"/><path d="M${n(ox - r * 0.5)} ${n(oy - r * 0.2)}L${n(ox)} ${n(oy - r * 0.6)}" stroke="${l}" stroke-width="${n(2.4 * s)}" stroke-linecap="round"/><path d="M${n(ox + r * 0.2)} ${n(oy + r * 0.5)}L${n(ox + r * 0.7)} ${n(oy + r * 0.1)}" stroke="${d}" stroke-width="${n(2 * s)}" stroke-linecap="round" opacity=".7"/>`;
  }
  ore += crystal(x + 10 * s, by - 70 * s, 34 * s, 13 * s, 12, AMBER, 1.6) + crystal(x - 16 * s, by - 68 * s, 24 * s, 10 * s, -18, AMBER, 1.4);
  const wheel = (wx: number): string =>
    `<circle cx="${n(wx)}" cy="${n(by - 9 * s)}" r="${n(11 * s)}" fill="#3a3640" stroke="#141218" stroke-width="${n(2.2 * s)}"/><circle cx="${n(wx)}" cy="${n(by - 9 * s)}" r="${n(4 * s)}" fill="#8a8698"/>`;
  return (
    ao(a, x, by, 60 * s, 8 * s, 0.55) +
    glow(a, x, by - 70 * s, 70 * s, 30 * s, '#ffae3a', 0.35) +
    ore +
    `<path d="${tub}" fill="${a.lin([[0, '#a8744a'], [0.5, '#7a4e2c'], [1, '#4a2c16']])}" stroke="#22120a" stroke-width="${n(2.4 * s)}" stroke-linejoin="round"/>` +
    `<path d="M${n(x - 44 * s)} ${n(by - 50 * s)}H${n(x + 44 * s)}M${n(x - 40 * s)} ${n(by - 28 * s)}H${n(x + 40 * s)}" stroke="#4a4652" stroke-width="${n(5 * s)}"/>` +
    `<path d="M${n(x - 44 * s)} ${n(by - 51.5 * s)}H${n(x + 44 * s)}" stroke="#a8a4b8" stroke-width="${n(1.4 * s)}" opacity=".7"/>` +
    `<path d="M${n(x - 46 * s)} ${n(by - 62 * s)}H${n(x + 46 * s)}" stroke="#ffe2b0" stroke-width="${n(2 * s)}" opacity=".5"/>` +
    wheel(x - 24 * s) +
    wheel(x + 24 * s)
  );
}

/** Rails with sleepers along a smooth path (`gauge` = vertical rail spacing on screen). */
function rails(pts: readonly (readonly [number, number])[], gauge: number, step = 30): string {
  let sleepers = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let t = 0; t < len; t += step) {
      const f = t / len;
      const x = x0 + (x1 - x0) * f;
      const y = y0 + (y1 - y0) * f;
      sleepers += `M${n(x - 4)} ${n(y - gauge - 3)}L${n(x + 3)} ${n(y + 4)}`;
    }
  }
  const near = smoothOpen(pts);
  const far = smoothOpen(pts.map(([x, y]) => [x, y - gauge] as [number, number]));
  return (
    `<path d="${sleepers}" stroke="#2a160a" stroke-width="9" stroke-linecap="round"/><path d="${sleepers}" stroke="#6a4428" stroke-width="5.5" stroke-linecap="round"/>` +
    `<path d="${far}${near}" fill="none" stroke="#1a1418" stroke-width="5"/><path d="${far}${near}" fill="none" stroke="#9a94a8" stroke-width="2.2"/>` +
    `<path d="${far}${near}" fill="none" stroke="#ffd59a" stroke-width="1" opacity=".6" transform="translate(0 -1)"/>`
  );
}

/** Shallow puddle on packed earth reflecting the lantern light. */
function puddle(a: Art, x: number, y: number, rx: number, ry: number): string {
  const d = blobPath(a.rand, x, y, rx, ry, 10, 0.14);
  const rim = blobPath(a.rand, x, y + 1, rx * 1.12, ry * 1.25, 10, 0.12);
  return (
    `<path d="${rim}" fill="#4a2c18" opacity=".55"/>` +
    `<path d="${d}" fill="${a.lin([[0, '#1c1830'], [0.45, '#3a3256'], [0.8, '#8a5a4a'], [1, '#e8a45a']])}" stroke="#24140c" stroke-width="1.6"/>` +
    `<path d="M${n(x - rx * 0.62)} ${n(y - ry * 0.2)}H${n(x - rx * 0.1)}M${n(x + rx * 0.1)} ${n(y + ry * 0.3)}H${n(x + rx * 0.55)}M${n(x - rx * 0.3)} ${n(y + ry * 0.45)}H${n(x - rx * 0.05)}" stroke="#ffd59a" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>` +
    `<ellipse cx="${n(x + rx * 0.25)}" cy="${n(y - ry * 0.25)}" rx="${n(rx * 0.16)}" ry="${n(ry * 0.2)}" fill="#ffe6a8" opacity=".65"/>` +
    `<path d="M${n(x - rx * 0.9)} ${n(y - ry * 0.35)}Q${n(x - rx * 0.4)} ${n(y - ry * 1.05)} ${n(x + rx * 0.5)} ${n(y - ry * 0.85)}" fill="none" stroke="#c89060" stroke-width="1.6" opacity=".6"/>`
  );
}

/** Burlap ore sack. */
function sack(a: Art, x: number, by: number, s: number): string {
  const body = `M${n(x - 22 * s)} ${n(by)}C${n(x - 30 * s)} ${n(by - 24 * s)} ${n(x - 20 * s)} ${n(by - 44 * s)} ${n(x - 8 * s)} ${n(by - 50 * s)}L${n(x - 10 * s)} ${n(by - 58 * s)}H${n(x + 10 * s)}L${n(x + 8 * s)} ${n(by - 50 * s)}C${n(x + 22 * s)} ${n(by - 44 * s)} ${n(x + 30 * s)} ${n(by - 22 * s)} ${n(x + 22 * s)} ${n(by)}Z`;
  return (
    ao(a, x + 4 * s, by, 30 * s, 6 * s, 0.5) +
    `<path d="${body}" fill="${a.lin([[0, '#e2c08a'], [0.6, '#b08a56'], [1, '#6e5030']], 0, 0, 1, 0.6)}" stroke="#2a1a0a" stroke-width="${n(2.2 * s)}" stroke-linejoin="round"/>` +
    `<path d="M${n(x - 10 * s)} ${n(by - 50 * s)}Q${n(x)} ${n(by - 46 * s)} ${n(x + 10 * s)} ${n(by - 50 * s)}" fill="none" stroke="#5a3a1a" stroke-width="${n(3 * s)}"/>` +
    `<path d="M${n(x - 12 * s)} ${n(by - 30 * s)}Q${n(x - 4 * s)} ${n(by - 20 * s)} ${n(x - 8 * s)} ${n(by - 8 * s)}" fill="none" stroke="#8a6a40" stroke-width="${n(1.6 * s)}" opacity=".7"/>`
  );
}

/** Pickaxe leaning against something (handle bottom at x, by). */
function pickaxe(x: number, by: number, s: number, lean = -18): string {
  return (
    `<g transform="translate(${n(x)} ${n(by)}) rotate(${n(lean)})">` +
    `<path d="M0 0V${n(-86 * s)}" stroke="#22120a" stroke-width="${n(8 * s)}" stroke-linecap="round"/><path d="M0 0V${n(-86 * s)}" stroke="#a8743e" stroke-width="${n(4.5 * s)}" stroke-linecap="round"/>` +
    `<path d="M${n(-30 * s)} ${n(-74 * s)}Q0 ${n(-98 * s)} ${n(30 * s)} ${n(-74 * s)}L${n(26 * s)} ${n(-80 * s)}Q0 ${n(-94 * s)} ${n(-26 * s)} ${n(-80 * s)}Z" fill="#b8b4c8" stroke="#1a181e" stroke-width="${n(2.2 * s)}" stroke-linejoin="round"/>` +
    `<path d="M${n(-20 * s)} ${n(-82 * s)}Q0 ${n(-92 * s)} ${n(20 * s)} ${n(-82 * s)}" fill="none" stroke="#fff" stroke-width="${n(1.4 * s)}" opacity=".6"/>` +
    `</g>`
  );
}

/** Coil of rope lying on the ground. */
function ropeCoil(x: number, by: number, s: number): string {
  let out = `<ellipse cx="${n(x)}" cy="${n(by - 6 * s)}" rx="${n(34 * s)}" ry="${n(13 * s)}" fill="#2a1a0c" opacity=".45"/>`;
  for (let i = 0; i < 4; i++) {
    const rx = (32 - i * 6) * s;
    const ry = (12 - i * 2) * s;
    const cy = by - (8 + i * 4) * s;
    out += `<ellipse cx="${n(x)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="none" stroke="#2a1a0c" stroke-width="${n(8 * s)}"/><ellipse cx="${n(x)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="none" stroke="#c8a064" stroke-width="${n(5 * s)}"/>`;
  }
  return out + `<path d="M${n(x + 30 * s)} ${n(by - 10 * s)}Q${n(x + 52 * s)} ${n(by - 4 * s)} ${n(x + 60 * s)} ${n(by - 14 * s)}" fill="none" stroke="#2a1a0c" stroke-width="${n(8 * s)}" stroke-linecap="round"/><path d="M${n(x + 30 * s)} ${n(by - 10 * s)}Q${n(x + 52 * s)} ${n(by - 4 * s)} ${n(x + 60 * s)} ${n(by - 14 * s)}" fill="none" stroke="#c8a064" stroke-width="${n(5 * s)}" stroke-linecap="round"/>`;
}

function cave(a: Art): Layers {
  const wall: RockPal = { light: '#c08a5c', mid: '#7e5434', dark: '#4a2e1c', line: '#1e1008' };
  const air = '#5a4a72';
  const farWall = atDepth(wall, 0.75, air);
  const fgRock: RockPal = { light: '#5a3a26', mid: '#3a2416', dark: '#20130a', line: '#0a0503' };

  // ---- back: far rock, the glowing shaft, timber frames, ore veins, lanterns
  let back = `<rect ${FULL} fill="${a.lin([[0, '#0e0806'], [0.4, '#2e1c14'], [0.62, '#4a3020'], [1, '#5a3a24']])}"/>`;
  back += glow(a, 700, 230, 760, 240, '#ff9a3a', 0.4);
  // distant chamber walls (hazy violet-brown, thin lines)
  back += `<path d="${ridgePath(a.rand, X0 - 40, X1 + 40, 140, 70, 80, 380, true)}" fill="${mix('#5a4a5a', air, 0.3)}"/>`;
  back += `<path d="${ridgePath(a.rand, X0 - 40, X1 + 40, 190, 60, 60, 380, true)}" fill="${mix('#6a4a3a', air, 0.35)}"/>`;
  back += haze(a, 120, 330, '#8a6a8a', 0.35);
  // the mine shaft: a deep tunnel glowing amber from its far end
  const sx = 700;
  const mouth = `M${sx - 112} 304V170Q${sx} 96 ${sx + 112} 170V304Z`;
  back += `<path d="${mouth}" fill="${a.rad([[0, '#ffd27a'], [0.18, '#e2741a'], [0.5, '#4a200c'], [1, '#120806']], 0.5, 0.62, 0.62)}"/>`;
  back += `<g clip-path="${a.clip(mouth)}">` +
    `<path d="M${sx - 112} 304L${sx - 22} 214H${sx + 22}L${sx + 112} 304Z" fill="#2a160c" opacity=".7"/>` +
    timber(a, sx - 70, 300, sx - 70, 168, 12, WOOD_FAR, '#2a1810', 1.4) + timber(a, sx + 70, 300, sx + 70, 168, 12, WOOD_FAR, '#2a1810', 1.4) +
    timber(a, sx - 80, 172, sx + 80, 172, 11, WOOD_FAR, '#2a1810', 1.4) +
    timber(a, sx - 36, 262, sx - 36, 196, 7, WOOD_FAR, '#2a1810', 1) + timber(a, sx + 36, 262, sx + 36, 196, 7, WOOD_FAR, '#2a1810', 1) +
    timber(a, sx - 42, 198, sx + 42, 198, 6, WOOD_FAR, '#2a1810', 1) +
    `<path d="M${sx - 30} 304L${sx - 8} 226M${sx + 30} 304L${sx + 8} 226" stroke="#c8b8a8" stroke-width="2" opacity=".6"/>` +
    `</g>`;
  // rock wall masses around the shaft (faceted, warm)
  let x = X0 - 60;
  while (x < X1 + 60) {
    const w = a.r(150, 240);
    const cx = x + w / 2;
    if (Math.abs(cx - sx) > 150) back += rock(a, cx, 312, w, a.r(110, 200), farWall, { pts: 8, lw: lineAt(0.75) });
    x += w * 0.7;
  }
  back += rock(a, sx - 175, 312, 150, 150, wall, { pts: 7 });
  back += rock(a, sx + 178, 312, 160, 140, wall, { pts: 7 });
  // amber ore veins in the walls (small clusters, never a big mass)
  for (const [vx, vy, vs] of [[150, 214, 0.42], [430, 186, 0.36], [960, 206, 0.44], [1180, 170, 0.3], [-120, 200, 0.5], [1420, 210, 0.45]] as const) {
    back += crystalCluster(a, vx, vy, vs, AMBER, { count: 4, glowOp: 0.45 });
  }
  // shaft frame (heavy timbers) and the main cross beam over the hall
  back += timber(a, sx - 126, 308, sx - 122, 150, 30);
  back += timber(a, sx + 126, 308, sx + 122, 150, 30);
  back += timber(a, sx - 160, 150, sx + 160, 150, 30);
  back += timber(a, sx - 120, 196, sx - 70, 150, 14) + timber(a, sx + 120, 196, sx + 70, 150, 14);
  // ceiling: rough rock mass with the hall's timber ribs
  back += `<path d="M${X0 - 20} ${Y0 - 20}H${X1 + 20}V30${Array.from({ length: 26 }, (_, i) => `L${n(X1 + 20 - i * 76)} ${n(26 + a.r(8, 56))}`).join('')}L${X0 - 20} 60Z" fill="#140c08"/>`;
  for (let i = 0; i < 22; i++) {
    const tx = X0 + 20 + i * 82 + a.r(-20, 20);
    back += stalactite(tx, 34, a.r(30, 70), a.r(20, 36), atDepth({ light: '#7a5a44', mid: '#4a3426', dark: '#2a1a12', line: '#120a06' }, 0.35, air), a.r(-8, 8));
  }
  back += timber(a, X0 - 20, 54, X1 + 20, 48, 26);
  for (const px of [-150, 120, 1160, 1430]) {
    back += timber(a, px, 316, px + 4, 48, 30);
    back += timber(a, px - 2, 120, px + 54 * Math.sign(640 - px), 62, 14);
  }
  // lanterns hung from the beams
  back += lantern(a, 236, 132, 1, 58) + lantern(a, sx, 214, 0.8, 164) + lantern(a, 1046, 120, 1, 56) + lantern(a, -40, 140, 1, 58) + lantern(a, 1330, 128, 1, 56);

  // ---- front: packed-earth floor, rails, puddles, side props, dark framing
  let front = `<path d="${groundShape(a, 300, 7)}" fill="${a.linU([[0, '#8a6046'], [0.12, '#946240'], [0.45, '#6e4428'], [1, '#2e1a10']], 0, 300, 0, 870)}"/>`;
  for (let i = 0; i < 30; i++) {
    const gy = a.r(320, 860);
    front += `<path d="${blobPath(a.rand, a.r(X0, X1), gy, a.r(60, 170), a.r(10, 26) * (0.6 + (gy - 300) / 300), 9, 0.25)}" fill="${a.pick(['#b8834e', '#4a2c18', '#8a5a34', '#5a3a2a'])}" opacity=".45"/>`;
  }
  // embedded flat stones and worn cart ruts
  front += flagstones(a, 330, 860, X0, X1, { base: '#7a5236', light: '#c08a5a', edge: '#2a160a' }, { skip: 0.82, density: 1.1, jitter: 0.22 });
  front += `<path d="M${X0} 420Q300 400 640 410T${X1} 430M${X0} 446Q320 426 640 436T${X1} 458" fill="none" stroke="#3a2214" stroke-width="5" opacity=".25" stroke-linecap="round"/>`;
  front += cracks(a, 16, 330, 700, X0, X1, '#2a160a', 0.4);
  // contact shadow along the foot of the back wall
  front += `<rect x="${X0}" y="296" width="${ART_W}" height="40" fill="${a.linU([[0, '#1a0c06', 0.7], [1, '#1a0c06', 0]], 0, 296, 0, 336)}"/>`;
  // the rails leave the shaft and bend along the back wall
  front += rails([[sx - 6, 300], [sx + 60, 312], [sx + 200, 322], [sx + 420, 326], [X1 + 40, 328]], 9);
  front += rails([[sx + 6, 300], [sx - 70, 314], [sx - 260, 322], [X0 - 40, 326]], 9);
  front += litOval(a, '#ffc070', 0.34, 640, 490, 600, 210);
  front += pebbles(a, 22, 330, 760, X0, X1, ['#c8966a', '#6a4428'], '#24140a');
  front += puddle(a, 640, 560, 70, 15) + puddle(a, 300, 690, 90, 18) + puddle(a, 1010, 668, 80, 16) + puddle(a, -120, 520, 80, 16) + puddle(a, 1410, 540, 80, 16);
  // floor-line props, kept to the edges (the middle is the battlefield)
  front += mineCart(a, 1262, 330, 0.95);
  front += sack(a, 42, 330, 0.9) + sack(a, 84, 336, 0.8);
  front += pickaxe(118, 334, 0.9, 16);
  // side mid-ground, in the bleed and the outer edges only
  front += rock(a, -40, 520, 170, 90, wall);
  front += sack(a, 60, 560, 1.1) + pickaxe(-10, 566, 1.1, -14);
  front += ropeCoil(1220, 560, 1.1);
  front += rock(a, 1370, 520, 170, 96, wall);
  front += timber(a, 1196, 590, 1196, 430, 13) + timber(a, 1190, 440, 1236, 440, 9) + lantern(a, 1228, 476, 0.85, 440);
  // dark foreground framing: a fallen support beam and rubble (left), a broken cart wheel and rocks (right)
  front += rock(a, -60, 790, 360, 170, fgRock, { pts: 9 });
  front += timber(a, -180, 640, 260, 780, 46, ['#6a4428', '#4a2c16', '#24140a'], '#0a0503', 3);
  front += rock(a, 210, 790, 170, 70, fgRock);
  front += rock(a, 1330, 795, 420, 190, fgRock, { pts: 9 });
  front += `<g transform="translate(1110 742) rotate(-12)"><circle r="54" fill="none" stroke="#0a0503" stroke-width="16"/><circle r="54" fill="none" stroke="#4a2c16" stroke-width="10"/><path d="M-50 0H50M0 -50V50M-35 -35L35 35M35 -35L-35 35" stroke="#0a0503" stroke-width="9"/><path d="M-50 0H50M0 -50V50M-35 -35L35 35M35 -35L-35 35" stroke="#5a3820" stroke-width="5"/><circle r="12" fill="#2a2228" stroke="#0a0503" stroke-width="3"/></g>`;
  front += rock(a, 1000, 790, 160, 60, fgRock);
  // top corners: dark rock lips with hanging roots
  front += `<path d="M${X0 - 20} ${Y0 - 20}H360Q300 -10 200 30Q90 70 ${X0 - 20} 110Z" fill="#0c0705"/>`;
  front += `<path d="M${X1 + 20} ${Y0 - 20}H920Q980 -10 1080 34Q1190 74 ${X1 + 20} 120Z" fill="#0c0705"/>`;
  for (const [rx, ry, len] of [[150, 40, 70], [60, 70, 90], [1130, 46, 76], [1230, 74, 96], [-120, 90, 80], [1400, 96, 80]] as const) {
    front += `<path d="M${rx} ${ry}Q${rx + 8} ${ry + len * 0.5} ${rx - 4} ${ry + len}" fill="none" stroke="#0c0705" stroke-width="5" stroke-linecap="round"/><path d="M${rx} ${ry}Q${rx + 8} ${ry + len * 0.5} ${rx - 4} ${ry + len}" fill="none" stroke="#4a3020" stroke-width="2" stroke-linecap="round"/>`;
  }
  front += grade(a, '#ffb060', '#2a1a40', 0.32);
  front += vignette(a, '#0a0503', 0.66);
  front += grain(a);

  return {
    back,
    front,
    base: '#2a1a12',
    motes: [
      { color: '#ffd9a0', count: 22, size: [2, 5], area: [X0, 120, X1, 700], rise: [-60, -140], drift: 60, dur: [9, 15], shape: 'dot' },
      { color: '#ffb347', count: 10, size: [3, 6], area: [600, 160, 800, 300], rise: [-80, -160], drift: 30, dur: [4, 7], shape: 'ember' },
      { color: '#ffcf7a', count: 8, size: [3, 6], area: [100, 140, 1200, 230], rise: [-40, -90], drift: 20, dur: [3, 6], shape: 'spark' },
    ],
    pulses: [
      { x: 700, y: 236, rx: 170, ry: 120, color: '#ffae3a', dur: 3.6, min: 0.25, max: 0.6 },
      { x: 236, y: 134, rx: 90, ry: 80, color: '#ffae3a', dur: 1.7, min: 0.3, max: 0.6 },
      { x: 1046, y: 122, rx: 90, ry: 80, color: '#ffae3a', dur: 2.1, min: 0.3, max: 0.6 },
      { x: 640, y: 560, rx: 110, ry: 30, color: '#ffd27a', dur: 3, min: 0.1, max: 0.35 },
    ],
    spins: [],
  };
}

// ---------------------------------------------------------------------------
// Forest — sunlit clearing among giant trees
// ---------------------------------------------------------------------------

function forest(a: Art): Layers {
  const mossRock: RockPal = { light: '#b9c6aa', mid: '#7a8a72', dark: '#424f40', line: '#16200f' };
  const leafNear: [string, string, string] = ['#a8e05e', '#5fab3c', '#2f6e27'];
  const leafDark: [string, string, string] = ['#5a9a3e', '#3a7a30', '#215222'];
  const line = '#15300f';

  let back = `<rect ${FULL} fill="${a.linU([[0, '#9fd6a0'], [0.4, '#f6f8cf'], [0.6, '#dcefb4'], [1, '#86b878']], 0, 0, 0, 720)}"/>`;
  back += glow(a, 820, 210, 560, 240, '#fff8cc', 0.8);
  // distant misty tree lines (scalloped crowns): far = hazy and pale, no outlines
  for (let x = X0; x < X1 + 60; x += 86) back += `<path d="${scallopPath(a.rand, x + a.r(-10, 10), a.r(170, 200), a.r(60, 80), a.r(45, 60), 8)}" fill="#b6dcb8"/>`;
  for (let x = X0; x < X1; x += 96) back += `<rect x="${n(x + a.r(-20, 20))}" y="190" width="${n(a.r(6, 12))}" height="120" fill="#a2cca8"/>`;
  for (let x = X0; x < X1 + 60; x += 100) back += `<path d="${scallopPath(a.rand, x + a.r(-20, 20), a.r(205, 235), a.r(70, 90), a.r(45, 60), 8)}" fill="#86bd8e"/>`;
  for (let x = X0; x < X1; x += 112) back += `<rect x="${n(x + a.r(-25, 25))}" y="220" width="${n(a.r(10, 18))}" height="100" fill="#6ea67e"/>`;
  back += `<rect x="${X0}" y="250" width="${ART_W}" height="80" fill="#e9f6c4" opacity=".35" filter="${a.blur(12)}"/>`;
  back += haze(a, 150, 330, '#e6f2ff', 0.28);
  // mid trunks
  for (const [tx, tw] of [[-150, 60], [120, 56], [335, 40], [935, 46], [1150, 62], [1420, 54]] as const) {
    back += trunk(a, tx, 312, tw, ['#7f6448', '#5a4634', '#3a3024'], '#3a3024');
  }
  // canopy: dark back row, then lit front clumps
  for (let x = X0; x < X1 + 80; x += 160) back += foliage(a, x + a.r(-20, 20), a.r(-10, 30), a.r(130, 160), a.r(80, 100), leafDark, line, { details: false });
  back += `<rect x="${X0}" y="${Y0}" width="${ART_W}" height="${-Y0 - 30}" fill="#215222"/>`;
  for (let i = 0, x = X0; x < X1 + 60; i++, x += 128) back += foliage(a, x + a.r(-25, 25) - 20, a.r(55, 95), a.r(70, 95), a.r(48, 62), i % 3 === 1 ? leafNear : ['#8fcf52', '#4f9a38', '#2a6424'], line);
  // god rays
  for (let i = 0; i < 5; i++) back += lightShaft(a, 760 + i * 110, -20, 50, 190, 520, 24, '#fff4b0', 0.4);

  let front = `<path d="${groundShape(a, 300, 10)}" fill="${a.lin([[0, '#86c45a'], [0.35, '#62a845'], [1, '#2f6a2c']])}"/>`;
  // grass mottling
  for (let i = 0; i < 26; i++) {
    const gy = a.r(320, 860);
    front += `<path d="${blobPath(a.rand, a.r(X0, X1), gy, a.r(60, 140), a.r(10, 24) * (0.6 + (gy - 300) / 300), 9, 0.25)}" fill="${a.pick(['#9ad468', '#4f9a3a'])}" opacity=".45"/>`;
  }
  // sunny dirt clearing with worn stepping stones
  front += `<ellipse cx="640" cy="492" rx="560" ry="185" fill="#a8864e" filter="${a.blur(10)}" opacity=".95"/>`;
  front += `<ellipse cx="640" cy="492" rx="490" ry="152" fill="#c9a86a" filter="${a.blur(16)}"/>`;
  front += groundTiles(a, { base: '#c4a26a', light: '#e9cf9c', dark: '#9e7c4a', edge: '#6e5030', hi: '#fff0c8' }, {
    y0: 300,
    cell: 120,
    rowT: 0.08,
    skip: 0.5,
    gap: 12,
    round: 22,
    vary: 0.45,
    crackP: 0.1,
    region: (x, y) => ((x - 640) / 500) ** 2 + ((y - 492) / 160) ** 2 < 1,
  });
  front += pebbles(a, 14, 380, 660, 220, 1060, ['#e6dcc8', '#9a8a70'], '#4a3a24');
  front += litOval(a, '#fff1a8', 0.3);
  // grass tufts at the clearing edge
  for (let i = 0; i < 46; i++) {
    const ang = a.r(0, Math.PI * 2);
    const gx = 640 + Math.cos(ang) * a.r(520, 620);
    const gy = 492 + Math.sin(ang) * a.r(165, 220);
    if (gy < 312) continue;
    front += grassTuft(a, gx, gy, 0.7 + (gy - 300) / 500, ['#9be060', '#5aa53c']);
  }
  // flowers
  for (let i = 0; i < 26; i++) {
    const ang = a.r(0, Math.PI * 2);
    const fx = 640 + Math.cos(ang) * a.r(540, 700);
    const fy = 492 + Math.sin(ang) * a.r(170, 230);
    if (fy < 315 || fy > 700) continue;
    const col = a.pick(['#fff4f0', '#ffd23a', '#ff8ac0', '#b9a2ff']);
    const r = 3 + (fy - 300) / 120;
    front += `<circle cx="${n(fx)}" cy="${n(fy)}" r="${n(r)}" fill="${col}" stroke="#2a3a12" stroke-width="1"/><circle cx="${n(fx)}" cy="${n(fy)}" r="${n(r * 0.4)}" fill="#ffb02a"/>`;
  }
  // back props
  front += fern(a, 70, 330, 1.0, ['#5aa53c', '#3f8a30', '#7cc24f']);
  front += mushroom(a, 250, 318, 0.9, ['#ff9a7a', '#e2453a', '#9c1d1d']);
  front += mushroom(a, 290, 324, 0.6, ['#ff9a7a', '#e2453a', '#9c1d1d'], { lean: -6 });
  front += stump(a, 440, 318, 1);
  front += rock(a, 560, 314, 70, 30, mossRock);
  front += log(a, 840, 318, 1);
  front += fern(a, 1010, 322, 0.85, ['#5aa53c', '#3f8a30', '#7cc24f'], '#0f2a10', true);
  front += bush(a, 1120, 332, 1.2, leafNear, line);
  front += mushroom(a, 1220, 336, 0.75, ['#ffe08a', '#f0a830', '#a85a10']);
  // side mid-ground (and the bleed past the stage edges)
  front += bush(a, 40, 520, 1.4, leafNear, line);
  front += fern(a, 1250, 520, 1.1, ['#5aa53c', '#3f8a30', '#7cc24f'], '#0f2a10', true);
  front += mushroom(a, 95, 548, 0.7, ['#ff9a7a', '#e2453a', '#9c1d1d']);
  front += bush(a, -150, 420, 1.3, leafNear, line) + fern(a, -60, 600, 1.2, ['#5aa53c', '#3f8a30', '#7cc24f']);
  front += bush(a, 1420, 440, 1.3, leafNear, line) + mushroom(a, 1370, 600, 0.9, ['#ffe08a', '#f0a830', '#a85a10']) + fern(a, 1470, 640, 1.2, ['#5aa53c', '#3f8a30', '#7cc24f'], '#0f2a10', true);
  // foreground roots & leaves
  front += root([[-30, 640], [80, 630], [180, 676], [260, 740]], 70, 20, '#4a2f1a', '#140a04');
  front += root([[-20, 700], [120, 690], [210, 740]], 50, 16, '#5a3a20', '#140a04');
  front += root([[1310, 620], [1200, 640], [1100, 700], [1060, 760]], 74, 20, '#4a2f1a', '#140a04');
  front += fern(a, 150, 760, 1.9, ['#3a7a32', '#2c6626', '#4a8a3a'], '#0a1a08');
  front += fern(a, 1150, 770, 2.0, ['#3a7a32', '#2c6626', '#4a8a3a'], '#0a1a08', true);
  front += foliage(a, 40, 10, 210, 110, ['#3c7a32', '#2a5f26', '#1b421a'], '#0a1a08', { details: false });
  front += foliage(a, 1250, 0, 230, 110, ['#3c7a32', '#2a5f26', '#1b421a'], '#0a1a08', { details: false });
  front += foliage(a, -190, 60, 200, 160, ['#3c7a32', '#2a5f26', '#1b421a'], '#0a1a08', { details: false });
  front += foliage(a, 1470, 70, 200, 160, ['#3c7a32', '#2a5f26', '#1b421a'], '#0a1a08', { details: false });
  front += root([[X0 - 20, 760], [-120, 740], [-40, 800], [20, 880]], 70, 20, '#4a2f1a', '#140a04');
  front += root([[X1 + 20, 740], [1420, 760], [1340, 820], [1300, 880]], 70, 20, '#4a2f1a', '#140a04');
  front += grade(a, '#fff0a0', '#1a4a20', 0.3);
  front += vignette(a, '#0a1a08', 0.55);
  front += grain(a, 0.06);

  return {
    back,
    front,
    base: '#3b6a33',
    motes: [
      { color: '#f6ff9a', count: 22, size: [3, 6], area: [X0, 200, X1, 660], rise: [-60, -140], drift: 70, dur: [7, 12], shape: 'dot' },
      { color: '#7cc24f', count: 10, size: [10, 16], area: [X0, -40, X1, 120], rise: [420, 680], drift: 160, dur: [9, 15], shape: 'leaf' },
    ],
    pulses: [{ x: 860, y: 200, rx: 420, ry: 240, color: '#fff6c2', dur: 6, min: 0.15, max: 0.4 }],
    spins: [],
  };
}

function trunk(a: Art, x: number, by: number, w: number, cols: [string, string, string], line: string): string {
  const [tl, tm, td] = cols;
  const d = `M${n(x - w / 2)} -20C${n(x - w / 2 + 4)} ${n(by * 0.5)} ${n(x - w / 2 - 6)} ${n(by - 40)} ${n(x - w / 2 - 30)} ${n(by)}H${n(x + w / 2 + 30)}C${n(x + w / 2 + 6)} ${n(by - 40)} ${n(x + w / 2 - 4)} ${n(by * 0.5)} ${n(x + w / 2)} -20Z`;
  let bark = '';
  for (let i = 0; i < 5; i++) {
    const bx = x - w / 3 + (i * w) / 6 + a.r(-3, 3);
    bark += `<path d="M${n(bx)} ${n(a.r(-10, 60))}Q${n(bx + a.r(-6, 6))} ${n(by * 0.5)} ${n(bx + a.r(-8, 8))} ${n(by - a.r(10, 50))}" fill="none" stroke="${td}" stroke-width="2" opacity=".55"/>`;
  }
  return `<path d="${d}" fill="${a.lin([[0, td], [0.3, tl], [0.6, tm], [1, td]], 0, 0, 1, 0)}" stroke="${line}" stroke-width="2.2"/>${bark}`;
}

function stump(a: Art, x: number, by: number, s: number): string {
  return (
    ao(a, x + 6, by, 50 * s, 9 * s, 0.4) +
    `<path d="M${n(x - 34 * s)} ${n(by)}Q${n(x - 30 * s)} ${n(by - 22 * s)} ${n(x - 28 * s)} ${n(by - 44 * s)}H${n(x + 28 * s)}Q${n(x + 30 * s)} ${n(by - 22 * s)} ${n(x + 36 * s)} ${n(by)}Z" fill="${a.lin([[0, '#4f3824'], [0.3, '#8a6440'], [1, '#3a281a']], 0, 0, 1, 0)}" stroke="#1d140c" stroke-width="2.2"/>` +
    `<ellipse cx="${n(x)}" cy="${n(by - 44 * s)}" rx="${n(28 * s)}" ry="${n(9 * s)}" fill="#e2bf86" stroke="#1d140c" stroke-width="2.2"/>` +
    `<ellipse cx="${n(x)}" cy="${n(by - 44 * s)}" rx="${n(17 * s)}" ry="${n(5 * s)}" fill="none" stroke="#a87a48" stroke-width="1.6"/>` +
    `<ellipse cx="${n(x)}" cy="${n(by - 44 * s)}" rx="${n(8 * s)}" ry="${n(2.5 * s)}" fill="none" stroke="#a87a48" stroke-width="1.4"/>` +
    `<path d="${blobPath(a.rand, x - 18 * s, by - 10 * s, 16 * s, 8 * s, 7, 0.2)}" fill="#5aa53c" stroke="#16300f" stroke-width="1.6"/>`
  );
}

function log(a: Art, x: number, by: number, s: number): string {
  const L = 150 * s;
  const R = 22 * s;
  return (
    ao(a, x, by, L * 0.6, 8 * s, 0.45) +
    `<path d="M${n(x - L / 2)} ${n(by - 2 * R)}H${n(x + L / 2)}V${n(by)}H${n(x - L / 2)}Z" fill="${a.lin([[0, '#9a7048'], [0.5, '#6e4c2e'], [1, '#3e2a18']])}" stroke="#1d140c" stroke-width="2.2"/>` +
    `<path d="M${n(x - L / 2 + 10)} ${n(by - R * 1.4)}H${n(x + L / 2 - 30)}M${n(x - L / 2 + 30)} ${n(by - R * 0.7)}H${n(x + L / 2 - 10)}" stroke="#3e2a18" stroke-width="2" opacity=".6"/>` +
    `<ellipse cx="${n(x + L / 2)}" cy="${n(by - R)}" rx="${n(R * 0.55)}" ry="${n(R)}" fill="#e2bf86" stroke="#1d140c" stroke-width="2.2"/>` +
    `<ellipse cx="${n(x + L / 2)}" cy="${n(by - R)}" rx="${n(R * 0.28)}" ry="${n(R * 0.5)}" fill="none" stroke="#a87a48" stroke-width="1.5"/>` +
    `<path d="${blobPath(a.rand, x - 20 * s, by - 2 * R, 40 * s, 9 * s, 9, 0.25)}" fill="#6cb44a" stroke="#16300f" stroke-width="1.6"/>` +
    mushroom(a, x - 40 * s, by - 2 * R + 2, 0.35, ['#ffe08a', '#f0a830', '#a85a10'])
  );
}

// ---------------------------------------------------------------------------
// Ruins — sandstone temple remains at sunset
// ---------------------------------------------------------------------------

function ruins(a: Art): Layers {
  const sand = { light: '#ffe0b0', mid: '#e0a86e', dark: '#9a6440', line: '#3d2416' };
  const sandRock: RockPal = { light: '#f6cf98', mid: '#c98e5a', dark: '#7d4c30', line: '#3d2416' };
  const fgRock: RockPal = { light: '#9a644e', mid: '#643c34', dark: '#381f22', line: '#160a0a' };

  let back = `<rect ${FULL} fill="${a.linU([[0, '#3b3a8a'], [0.25, '#8a4f9a'], [0.42, '#e3708a'], [0.55, '#ffb36b'], [1, '#ffcf8a']], 0, 0, 0, 720)}"/>`;
  back += glow(a, 880, 250, 460, 230, '#ffd68a', 0.85);
  back += `<circle cx="880" cy="232" r="62" fill="#fff1c4"/><circle cx="880" cy="232" r="80" fill="none" stroke="#fff1c4" stroke-width="6" opacity=".35"/>`;
  // soft cloud bands
  for (let i = 0; i < 10; i++) {
    const cy = a.r(-60, 190);
    back += `<path d="${blobPath(a.rand, a.r(X0, X1), cy, a.r(120, 240), a.r(10, 20), 9, 0.25)}" fill="${a.pick(['#f59a8a', '#c9709a', '#ffc49a'])}" opacity=".7"/>`;
  }
  // distant mesas
  back += `<path d="M${X0 - 20} 300L${X0 - 20} 250L-160 246L-120 214L-40 212L-20 230L80 226L120 190L260 186L300 222L420 230L470 262L560 262L600 238L700 240L740 270L860 272L900 248L1000 244L1040 210L1160 206L1200 236L1300 240L1360 226L1400 200L1480 198L${X1 + 20} 230L${X1 + 20} 300Z" fill="#b5648a"/>`;
  back += `<path d="M120 190L260 186L270 196L130 200ZM1040 210L1160 206L1168 216L1048 220Z" fill="#d88aa0"/>`;
  back += `<path d="M${X0 - 20} 310L${X0 - 20} 266L140 258L190 238L330 240L380 268L1300 274L1380 256L1440 250L${X1 + 20} 268L${X1 + 20} 310Z" fill="#8f4f7a"/>`;
  back += haze(a, 170, 320, '#ffb0a0', 0.3);
  // distant ruined temple silhouette
  back += `<g fill="#6e3d68"><rect x="186" y="150" width="190" height="20"/><rect x="176" y="140" width="210" height="12"/><rect x="196" y="170" width="16" height="80"/><rect x="236" y="170" width="16" height="80"/><rect x="276" y="170" width="16" height="64"/><rect x="316" y="196" width="16" height="54"/><rect x="350" y="170" width="16" height="80"/><path d="M176 140L281 104L386 140Z"/></g>`;
  // mid columns & gate behind the floor line
  const sandMid = atDepth(sand, 0.35, '#e8a0a8');
  back += column(a, 150, 318, 58, 230, sandMid, { capital: true });
  back += vines(a, 150, 96, 210);
  back += column(a, 330, 314, 54, 140, sandMid, { broken: true });
  back += arch(a, 1010, 318, 1, sandMid);
  back += vines(a, 920, 100, 160);
  back += column(a, 1215, 318, 60, 190, sandMid, { broken: true });
  back += column(a, -110, 318, 62, 260, sandMid, { capital: true }) + vines(a, -110, 70, 220);
  back += column(a, 1420, 318, 58, 220, sandMid, { capital: true });

  let front = `<path d="${groundShape(a, 312, 6)}" fill="${a.lin([[0, '#c8935e'], [0.4, '#b07c4c'], [1, '#6a4028']])}"/>`;
  front += tiles(a, 318, 880, { base: '#d9a66c', light: '#f4cf98', dark: '#a9744a', edge: '#6e4428' });
  front += cracks(a, 24, 340, 760, X0, X1, '#5a3420', 0.45);
  // weeds growing between the tiles
  for (let i = 0; i < 20; i++) {
    const gy = a.r(350, 680);
    const gx = a.r(X0 + 40, X1 - 40);
    if (Math.abs(gx - 640) < 300 && gy > 380 && gy < 620) continue;
    front += grassTuft(a, gx, gy, 0.5 + (gy - 330) / 500, ['#b8c05a', '#8a9a3c'], '#3a3a12');
  }
  front += litOval(a, '#ffe2a8', 0.32);
  // back props on the floor line
  front += rock(a, 470, 328, 90, 46, sandRock);
  front += drum(a, 570, 334, 1, sand);
  front += pedestalOrb(a, 770, 334, 1);
  front += rock(a, 870, 326, 60, 28, sandRock);
  // side mid-ground
  front += drum(a, 50, 540, 1.3, sand, true);
  front += rock(a, 1235, 540, 120, 60, sandRock);
  front += grassTuft(a, 1180, 545, 1.1, ['#b8c05a', '#8a9a3c'], '#3a3a12');
  front += grassTuft(a, 110, 560, 1.1, ['#b8c05a', '#8a9a3c'], '#3a3a12');
  // foreground rubble
  front += rock(a, 80, 770, 300, 140, fgRock, { pts: 9 });
  front += rock(a, 235, 760, 140, 60, fgRock);
  front += rock(a, 1110, 770, 180, 90, fgRock);
  front += rock(a, 1235, 775, 260, 150, fgRock, { pts: 8 });
  front += rock(a, 1030, 762, 120, 50, fgRock);
  front += rock(a, -150, 560, 140, 70, sandRock) + drum(a, -60, 640, 1.2, sand);
  front += rock(a, 1420, 580, 150, 80, sandRock) + grassTuft(a, 1380, 600, 1.1, ['#b8c05a', '#8a9a3c'], '#3a3a12');
  front += rock(a, -120, 790, 300, 150, fgRock, { pts: 9 }) + rock(a, 1420, 790, 300, 150, fgRock, { pts: 9 });
  front += grade(a, '#ff9a5a', '#5a2a5a', 0.3);
  front += vignette(a, '#2a0f1a', 0.55);
  front += grain(a, 0.06);

  return {
    back,
    front,
    base: '#8a4f5a',
    motes: [{ color: '#ffe6b0', count: 28, size: [2, 5], area: [X0, 200, X1 - 100, 700], rise: [-40, -100], drift: 260, dur: [8, 14], shape: 'dot' }],
    pulses: [{ x: 880, y: 240, rx: 300, ry: 200, color: '#ffd68a', dur: 7, min: 0.2, max: 0.45 }],
    spins: [],
  };
}

/** Perspective tile floor (vertical joints converge to a far vanishing point). */
function tiles(a: Art, y0: number, y1: number, c: { base: string; light: string; dark: string; edge: string }): string {
  const vpx = 640;
  const vpy = -900;
  const rows: number[] = [];
  let y = y0;
  while (y < y1) {
    rows.push(y);
    y += 16 + (y - y0) * 0.2;
  }
  rows.push(y1);
  const xAt = (xb: number, yy: number): number => vpx + ((xb - vpx) * (yy - vpy)) / (720 - vpy);
  let out = '';
  const step = 120;
  for (let r = 0; r < rows.length - 1; r++) {
    const ya = rows[r];
    const yb = rows[r + 1];
    const offset = r % 2 === 0 ? 0 : step / 2;
    for (let xb = -400 - offset; xb < 1700; xb += step) {
      if (a.rand() < 0.12) continue;
      const gap = 2.2;
      const q = poly([
        [xAt(xb, ya) + gap, ya + gap * 0.6],
        [xAt(xb + step, ya) - gap, ya + gap * 0.6],
        [xAt(xb + step, yb) - gap, yb - gap * 0.6],
        [xAt(xb, yb) + gap, yb - gap * 0.6],
      ]);
      const col = mix(c.base, a.rand() < 0.5 ? c.light : c.dark, a.r(0.05, 0.45));
      out += `<path d="${q}" fill="${col}" stroke="${c.edge}" stroke-width="1.4" stroke-opacity=".6"/>`;
      // lit top edge
      out += `<path d="M${n(xAt(xb, ya) + 4)} ${n(ya + 2.5)}H${n(xAt(xb + step, ya) - 4)}" stroke="${c.light}" stroke-width="${n(1 + (ya - y0) / 200)}" opacity=".55"/>`;
    }
  }
  return out;
}

function arch(a: Art, x: number, by: number, s: number, p: { light: string; mid: string; dark: string; line: string }): string {
  const w = 200 * s;
  const colW = 46 * s;
  const h = 150 * s;
  let out = column(a, x - w / 2, by, colW, h, p, { capital: true }) + column(a, x + w / 2, by, colW, h, p, { capital: true });
  const cx = x;
  const cy = by - h - colW * 0.18;
  const R = w / 2 + colW * 0.62;
  const r2 = w / 2 - colW * 0.62;
  const stones = 9;
  for (let i = 0; i < stones; i++) {
    if (i === 6) continue; // a fallen keystone neighbour
    const a0 = Math.PI + (i / stones) * Math.PI + 0.01;
    const a1 = Math.PI + ((i + 1) / stones) * Math.PI - 0.01;
    const sag = i > 6 ? 5 * s : 0;
    const q = poly([
      [cx + Math.cos(a0) * r2, cy + Math.sin(a0) * r2 + sag],
      [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R + sag],
      [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R + sag],
      [cx + Math.cos(a1) * r2, cy + Math.sin(a1) * r2 + sag],
    ]);
    out += `<path d="${q}" fill="${i % 2 ? p.mid : p.light}" stroke="${p.line}" stroke-width="2.4" stroke-linejoin="round"/>`;
  }
  // carved sun on the keystone
  const kx = cx;
  const ky = cy - (R + r2) / 2;
  out += `<circle cx="${n(kx)}" cy="${n(ky)}" r="${n(9 * s)}" fill="none" stroke="${p.dark}" stroke-width="2.4"/><circle cx="${n(kx)}" cy="${n(ky)}" r="${n(3.5 * s)}" fill="${p.dark}"/>`;
  return out;
}

function drum(a: Art, x: number, by: number, s: number, p: { light: string; mid: string; dark: string; line: string }, upright = false): string {
  if (upright) return column(a, x, by, 70 * s, 60 * s, p, { broken: true });
  const L = 110 * s;
  const R = 34 * s;
  return (
    ao(a, x, by, L * 0.65, 9 * s, 0.45) +
    `<path d="M${n(x - L / 2)} ${n(by - 2 * R)}H${n(x + L / 2)}V${n(by)}H${n(x - L / 2)}Z" fill="${a.lin([[0, p.light], [0.45, p.mid], [1, p.dark]])}" stroke="${p.line}" stroke-width="2.4"/>` +
    `<path d="M${n(x - L / 2 + 8)} ${n(by - R * 1.5)}H${n(x + L / 2 - 8)}M${n(x - L / 2 + 8)} ${n(by - R)}H${n(x + L / 2 - 8)}M${n(x - L / 2 + 8)} ${n(by - R * 0.5)}H${n(x + L / 2 - 8)}" stroke="${p.dark}" stroke-width="2" opacity=".5"/>` +
    `<ellipse cx="${n(x - L / 2)}" cy="${n(by - R)}" rx="${n(R * 0.45)}" ry="${n(R)}" fill="${p.light}" stroke="${p.line}" stroke-width="2.4"/>` +
    `<ellipse cx="${n(x - L / 2)}" cy="${n(by - R)}" rx="${n(R * 0.2)}" ry="${n(R * 0.45)}" fill="none" stroke="${p.mid}" stroke-width="1.6"/>`
  );
}

/** Pedestal holding an ancient stone orb wrapped in a turquoise band (original relic design). */
function pedestalOrb(a: Art, x: number, by: number, s: number): string {
  const ped = { light: '#ffe0b0', mid: '#e0a86e', dark: '#9a6440', line: '#3d2416' };
  const orbY = by - 92 * s;
  return (
    ao(a, x + 6, by, 60 * s, 10 * s, 0.5) +
    `<path d="M${n(x - 40 * s)} ${n(by)}V${n(by - 14 * s)}H${n(x + 40 * s)}V${n(by)}Z" fill="${ped.mid}" stroke="${ped.line}" stroke-width="2.4"/>` +
    `<path d="M${n(x - 28 * s)} ${n(by - 14 * s)}V${n(by - 54 * s)}H${n(x + 28 * s)}V${n(by - 14 * s)}Z" fill="${a.lin([[0, ped.dark], [0.3, ped.light], [0.7, ped.mid], [1, ped.dark]], 0, 0, 1, 0)}" stroke="${ped.line}" stroke-width="2.4"/>` +
    `<path d="M${n(x - 36 * s)} ${n(by - 54 * s)}V${n(by - 64 * s)}H${n(x + 36 * s)}V${n(by - 54 * s)}Z" fill="${ped.light}" stroke="${ped.line}" stroke-width="2.4"/>` +
    `<path d="M${n(x - 14 * s)} ${n(by - 40 * s)}L${n(x)} ${n(by - 28 * s)}L${n(x + 14 * s)} ${n(by - 40 * s)}" fill="none" stroke="${ped.dark}" stroke-width="2.4"/>` +
    glow(a, x, orbY, 70 * s, 60 * s, '#7ff0d0', 0.45) +
    `<circle cx="${n(x)}" cy="${n(orbY)}" r="${n(30 * s)}" fill="${a.rad([[0, '#f2d6a8'], [0.6, '#c99a66'], [1, '#7d5434']], 0.35, 0.3, 0.75)}" stroke="${ped.line}" stroke-width="2.6"/>` +
    `<path d="M${n(x - 29 * s)} ${n(orbY + 4 * s)}Q${n(x)} ${n(orbY + 16 * s)} ${n(x + 29 * s)} ${n(orbY + 4 * s)}" fill="none" stroke="${ped.line}" stroke-width="${n(8 * s)}"/>` +
    `<path d="M${n(x - 29 * s)} ${n(orbY + 4 * s)}Q${n(x)} ${n(orbY + 16 * s)} ${n(x + 29 * s)} ${n(orbY + 4 * s)}" fill="none" stroke="#4fe0c0" stroke-width="${n(4.5 * s)}"/>` +
    `<path d="M${n(x - 4 * s)} ${n(orbY + 10 * s)}l${n(4 * s)} ${n(-3 * s)}l${n(4 * s)} ${n(3 * s)}" fill="none" stroke="#e8fff6" stroke-width="2"/>` +
    `<ellipse cx="${n(x - 11 * s)}" cy="${n(orbY - 12 * s)}" rx="${n(9 * s)}" ry="${n(5 * s)}" fill="#fff" opacity=".45" transform="rotate(-30 ${n(x - 11 * s)} ${n(orbY - 12 * s)})"/>`
  );
}

function vines(a: Art, x: number, y: number, len: number): string {
  let out = '';
  for (let k = 0; k < 3; k++) {
    const vx = x + (k - 1) * 14 + a.r(-4, 4);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 6; i++) pts.push([vx + Math.sin(i * 1.3 + k) * 8, y + (i / 6) * len * a.r(0.6, 1)]);
    out += `<path d="${smoothOpen(pts)}" fill="none" stroke="#2f5a1f" stroke-width="3"/>`;
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i];
      out += `<ellipse cx="${n(px + (i % 2 ? 6 : -6))}" cy="${n(py)}" rx="7" ry="4" fill="${i % 2 ? '#6cae3c' : '#4f8f2e'}" stroke="#1d3a12" stroke-width="1.2" transform="rotate(${i % 2 ? 30 : -30} ${n(px)} ${n(py)})"/>`;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Volcano — basalt plain with lava cracks under a burning sky
// ---------------------------------------------------------------------------

function volcano(a: Art): Layers {
  const basalt: RockPal = { light: '#6e4038', mid: '#3c2426', dark: '#1c1012', line: '#0a0405' };
  const fgRock: RockPal = { light: '#6a3a32', mid: '#3e2224', dark: '#1e0f12', line: '#050203' };

  let back = `<rect ${FULL} fill="${a.linU([[0, '#12040a'], [0.22, '#3a0c0e'], [0.36, '#8a2410'], [0.44, '#e0601a'], [0.6, '#5a1a0c'], [1, '#2a0a08']], 0, 0, 0, 720)}"/>`;
  back += glow(a, 640, 300, 760, 160, '#ff8a3a', 0.7);
  // far mountains, lit by the glow
  back += `<path d="${ridgePath(a.rand, X0 - 40, X1 + 40, 250, 60, 70, 400, true)}" fill="#6a2214"/>`;
  // the volcano
  const cone = 'M600 310C700 260 760 200 812 150Q826 140 846 144L870 152Q884 146 900 150L928 142Q946 140 958 152C1010 200 1080 262 1220 310Z';
  back += `<path d="${cone}" fill="${a.lin([[0, '#3a1410'], [1, '#1a0808']])}" stroke="#0e0404" stroke-width="3"/>`;
  back += `<path d="M812 150C780 190 740 230 690 270" fill="none" stroke="#7a2a18" stroke-width="5" opacity=".7" stroke-linecap="round"/>`;
  // lava streams
  const streams = 'M872 152C866 186 850 210 834 236C820 258 808 280 796 312M930 150C936 180 952 206 970 232C984 254 998 282 1016 312';
  back += `<path d="${streams}" fill="none" stroke="#ff5a1a" stroke-width="18" opacity=".55" filter="${a.blur(6)}"/>`;
  back += `<path d="${streams}" fill="none" stroke="#c2300a" stroke-width="8" stroke-linecap="round"/>`;
  back += `<path d="${streams}" fill="none" stroke="#ffb03a" stroke-width="4" stroke-linecap="round"/>`;
  // crater glow & smoke plume lit from below
  back += glow(a, 886, 140, 150, 70, '#ffb03a', 0.95);
  back += `<path d="M820 148Q886 128 952 146Q886 160 820 148Z" fill="#ffe08a"/>`;
  for (let i = 0; i < 6; i++) {
    const py = 104 - i * 13;
    const px = 880 + i * 44 + a.r(-6, 6);
    const rx = 38 + i * 13;
    back += `<path d="${scallopPath(a.rand, px, py, rx, rx * 0.55, 9)}" fill="${mix('#4a1a14', '#1a0a0a', i / 6)}" opacity=".95"/>`;
    back += `<path d="${scallopPath(a.rand, px - 4, py + rx * 0.22, rx * 0.8, rx * 0.3, 8)}" fill="#c2401a" opacity="${n(0.6 - i * 0.09)}"/>`;
  }
  // nearer ridges with molten rim light
  const ridge2 = ridgePath(a.rand, X0 - 40, X1 + 40, 268, 70, 46, 420);
  back += `<path d="${ridge2}" fill="#2a0e0e"/><path d="${ridge2}" fill="none" stroke="#ff7a2a" stroke-width="2.5" opacity=".5"/>`;
  // back rock wall
  let x = X0 - 60;
  while (x < X1 + 60) {
    const w = a.r(130, 220);
    back += rock(a, x + w / 2, 318, w, a.r(70, 150), atDepth(basalt, 0.45, '#8a3020'), { pts: 6, lw: lineAt(0.45) });
    x += w * 0.75;
  }

  let front = `<path d="${groundShape(a, 312, 8)}" fill="${a.lin([[0, '#1e100e'], [1, '#0e0606']])}"/>`;
  // magma glowing under the basalt columns (shows through the joints)
  for (const [gx, gy, rx, ry] of [[320, 420, 260, 50], [900, 470, 300, 70], [560, 620, 340, 70], [1180, 640, 200, 60], [120, 560, 180, 60], [-140, 470, 160, 60], [1420, 520, 170, 60]] as const) {
    front += `<ellipse cx="${gx}" cy="${gy}" rx="${rx}" ry="${ry}" fill="#ff6a1a" filter="${a.blur(18)}" opacity=".95"/>`;
  }
  front += groundTiles(a, { base: '#3e2824', light: '#6a4234', dark: '#24150f', edge: '#0e0606', hi: '#ff9a5a' }, { y0: 314, mode: 'hex', cell: 150, skip: 0.02, gap: 6, round: 6, height: 14, vary: 0.45 });
  // a lava river meandering across the back
  const river = smoothOpen([[X0 - 40, 440], [-80, 430], [120, 396], [260, 410], [380, 372], [440, 336]]);
  front += `<path d="${river}" fill="none" stroke="#ff5a1a" stroke-width="40" opacity=".55" filter="${a.blur(10)}" stroke-linecap="round"/>`;
  front += `<path d="${river}" fill="none" stroke="#1a0604" stroke-width="22" stroke-linecap="round"/>`;
  front += `<path d="${river}" fill="none" stroke="#e2420f" stroke-width="16" stroke-linecap="round"/>`;
  front += `<path d="${river}" fill="none" stroke="#ffb03a" stroke-width="9" stroke-linecap="round"/>`;
  front += `<path d="${river}" fill="none" stroke="#fff2b0" stroke-width="3" stroke-linecap="round" stroke-dasharray="40 28"/>`;
  front += litOval(a, '#ff9a5a', 0.3);
  front += lavaPool(a, 980, 338, 140, 24);
  front += rock(a, 520, 334, 80, 40, basalt);
  front += rock(a, 760, 330, 110, 60, basalt);
  front += rock(a, 1180, 338, 90, 46, basalt);
  // side mid
  front += rock(a, 40, 560, 130, 90, basalt);
  front += rock(a, 1250, 540, 120, 80, basalt);
  front += rock(a, -150, 600, 170, 110, basalt) + rock(a, 1430, 610, 180, 120, basalt);
  front += lavaPool(a, 1400, 380, 100, 18);
  // foreground spikes with rim light
  front += spikes(a, 0, 720, 1, fgRock);
  front += spikes(a, 1280, 720, -1, fgRock);
  front += rock(a, -150, 800, 320, 200, fgRock, { pts: 8 }) + rock(a, 1430, 800, 320, 200, fgRock, { pts: 8 });
  front += grade(a, '#ff6a2a', '#2a0a10', 0.35);
  front += vignette(a, '#0a0204', 0.6);
  front += grain(a, 0.07);

  return {
    back,
    front,
    base: '#3a1210',
    motes: [
      { color: '#ffb05a', count: 32, size: [2, 5], area: [X0, 300, X1, 740], rise: [-260, -420], drift: 60, dur: [5, 9], shape: 'ember' },
      { color: '#ffe08a', count: 10, size: [2, 4], area: [760, 120, 1020, 320], rise: [-120, -200], drift: 40, dur: [4, 7], shape: 'ember' },
    ],
    pulses: [
      { x: 886, y: 140, rx: 200, ry: 90, color: '#ff8a2a', dur: 3.2, min: 0.35, max: 0.8 },
      { x: 300, y: 380, rx: 360, ry: 60, color: '#ff8a2a', dur: 2.6, min: 0.2, max: 0.55 },
      { x: 980, y: 336, rx: 170, ry: 55, color: '#ff8a2a', dur: 3, min: 0.3, max: 0.7 },
      { x: 640, y: 540, rx: 600, ry: 220, color: '#ff5a1a', dur: 4.5, min: 0.04, max: 0.18 },
    ],
    spins: [],
  };
}

function lavaPool(a: Art, x: number, y: number, rx: number, ry: number): string {
  const d = blobPath(a.rand, x, y, rx, ry, 10, 0.12);
  const d2 = blobPath(a.rand, x - rx * 0.1, y - ry * 0.1, rx * 0.65, ry * 0.55, 9, 0.15);
  return (
    glow(a, x, y - 10, rx * 1.6, ry * 3, '#ff6a1a', 0.7) +
    `<path d="${d}" fill="#2a0a06" transform="translate(0 3)"/>` +
    `<path d="${d}" fill="${a.rad([[0, '#ffe68a'], [0.5, '#ff9a2a'], [1, '#d23a0a']])}" stroke="#1a0604" stroke-width="3"/>` +
    `<path d="${d2}" fill="#fff2b0" opacity=".5"/>`
  );
}

function spikes(a: Art, x0: number, by: number, dir: 1 | -1, p: RockPal): string {
  let out = '';
  const list: [number, number, number, number][] = [
    [50, 250, 220, -20],
    [175, 160, 170, 24],
  ];
  for (const [dx, h, w, lean] of list) {
    const x = x0 + dx * dir;
    const tip: [number, number] = [x + lean * dir, by - h];
    const mid: [number, number] = [x + lean * 0.4 * dir + w * 0.12 * dir, by - h * 0.45];
    const outline = poly([[x - w / 2, by + 30], [x - w * 0.3, by - h * 0.5], tip, mid, [x + w / 2, by + 30]]);
    const lit = poly([[x + w * 0.05 * dir, by + 30], tip, ...(dir === 1 ? [mid, [x + w / 2, by + 30] as [number, number]] : [[x - w * 0.3, by - h * 0.5] as [number, number], [x - w / 2, by + 30] as [number, number]])]);
    out += `<path d="${outline}" fill="${p.dark}"/>`;
    out += `<path d="${lit}" fill="${p.mid}"/>`;
    const rim = dir === 1 ? `M${n(tip[0])} ${n(tip[1])}L${n(mid[0])} ${n(mid[1])}L${n(x + w / 2)} ${n(by + 30)}` : `M${n(tip[0])} ${n(tip[1])}L${n(x - w * 0.3)} ${n(by - h * 0.5)}L${n(x - w / 2)} ${n(by + 30)}`;
    out += `<path d="${rim}" fill="none" stroke="#ff5a1a" stroke-width="12" stroke-linejoin="round" opacity=".45" filter="${a.blur(4)}"/>`;
    out += `<path d="${rim}" fill="none" stroke="#ffb05a" stroke-width="4" stroke-linejoin="round"/>`;
    out += `<path d="${outline}" fill="none" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>`;
  }
  out += rock(a, x0 + 110 * dir, by + 60, 340, 110, p, { shadow: false });
  return out;
}

// ---------------------------------------------------------------------------
// Tower — moonlit hall of the ancient tower with a rune circle floor
// ---------------------------------------------------------------------------

function tower(a: Art): Layers {
  const pillar = { light: '#8a95c8', mid: '#55608f', dark: '#2a3158', line: '#0e1228' };
  const fgPillar = { light: '#5a6494', mid: '#353e6c', dark: '#181d3c', line: '#05070f' };

  let back = `<rect ${FULL} fill="${a.linU([[0, '#151a36'], [1, '#2a3360']], 0, 0, 0, 720)}"/>`;
  // brick wall
  let bricks = '';
  for (let r = -5; r < 12; r++) {
    const y = r * 30;
    const off = r % 2 ? 0 : 40;
    for (let bx = X0 - 80 + off; bx < X1 + 20; bx += 80) {
      const col = mix('#36406e', a.rand() < 0.5 ? '#4a5590' : '#262d52', a.r(0.1, 0.5));
      bricks += `<rect x="${n(bx + 2)}" y="${n(y + 2)}" width="76" height="26" rx="3" fill="${col}"/>`;
      bricks += `<path d="M${n(bx + 5)} ${n(y + 4)}H${n(bx + 74)}" stroke="#6a78b8" stroke-width="1.5" opacity=".35"/>`;
    }
  }
  back += `<rect x="${X0}" y="${Y0}" width="${ART_W}" height="${360 - Y0}" fill="#151a36"/>${bricks}`;
  back += `<rect x="${X0}" y="${Y0}" width="${ART_W}" height="${360 - Y0}" fill="${a.linU([[0, '#000', 0.55], [0.6, '#000', 0], [1, '#000', 0.25]], 0, Y0, 0, 360)}"/>`;
  // tall arched windows with moonlight
  for (const wx of [-130, 330, 640, 950, 1410]) back += archWindow(a, wx, 40, wx === 640 ? 1.15 : 0.95);
  // banners
  back += banner(a, 485, 70, 70, 190, ['#7a3ab8', '#3a1670'], '#ffd36a', 'tower');
  back += banner(a, 795, 70, 70, 190, ['#7a3ab8', '#3a1670'], '#ffd36a', 'tower');
  back += banner(a, 160, 60, 64, 170, ['#2a6ab8', '#16346e'], '#ffd36a', 'moon');
  back += banner(a, 1120, 60, 64, 170, ['#2a6ab8', '#16346e'], '#ffd36a', 'sun');
  // wall base & pillars
  back += `<rect x="${X0}" y="292" width="${ART_W}" height="40" fill="#1c2244"/><path d="M${X0} 292H${X1}" stroke="#6a78b8" stroke-width="3" opacity=".5"/>`;
  const pillarMid = atDepth(pillar, 0.3, '#3a4a8a');
  back += column(a, 60, 326, 80, 340, pillarMid, { capital: true });
  back += column(a, 1220, 326, 80, 340, pillarMid, { capital: true });
  back += column(a, -200, 326, 80, 340, pillarMid, { capital: true }) + column(a, 1480, 326, 80, 340, pillarMid, { capital: true });
  back += haze(a, 40, 330, '#5a6ab8', 0.16);
  // shelves of books & a crystal niche set into the back wall (props stay off the battlefield)
  back += wallShelf(a, 180, 250, 1) + wallShelf(a, 1100, 250, 1);
  // moon beams onto the floor
  back += lightShaft(a, 640, 120, 120, 380, 380, 0, '#a8c8ff', 0.3);
  back += lightShaft(a, 330, 140, 90, 280, 320, -8, '#a8c8ff', 0.22);
  back += lightShaft(a, 950, 140, 90, 280, 320, 8, '#a8c8ff', 0.22);

  const floorD = `M${X0 - 40} 322H${X1 + 40}V${Y1 + 10}H${X0 - 40}Z`;
  let floor = `<path d="${floorD}" fill="${a.lin([[0, '#3b4472'], [0.5, '#2c345e'], [1, '#161b38']])}"/>`;
  // concentric floor rings
  for (let i = 13; i >= 1; i--) {
    const rx = 90 * i;
    const ry = 32 * i;
    floor += `<ellipse cx="640" cy="490" rx="${rx}" ry="${ry}" fill="${i % 2 ? '#323b68' : '#2b3360'}" stroke="#1a1f3c" stroke-width="2"/>`;
    floor += `<ellipse cx="640" cy="${490 - 2}" rx="${rx - 4}" ry="${ry - 2}" fill="none" stroke="#56619a" stroke-width="1.4" opacity=".5"/>`;
  }
  let joints = '';
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    joints += `M${n(640 + Math.cos(ang) * 180)} ${n(490 + Math.sin(ang) * 64)}L${n(640 + Math.cos(ang) * 1240)} ${n(490 + Math.sin(ang) * 440)}`;
  }
  floor += `<path d="${joints}" stroke="#1a1f3c" stroke-width="2" opacity=".7"/>`;
  let front = `<g clip-path="${a.clip(floorD)}">${floor}</g>`;
  front += `<path d="M${X0 - 40} 322H${X1 + 40}" stroke="#0e1228" stroke-width="3"/>`;
  front += glow(a, 640, 490, 420, 150, '#5fd6ff', 0.3);
  front += litOval(a, '#b8d4ff', 0.25);
  // braziers with warm pools of light
  front += glow(a, 230, 350, 230, 80, '#ffa64a', 0.4);
  front += glow(a, 1050, 350, 230, 80, '#ffa64a', 0.4);
  front += brazier(a, 230, 352, 1.1);
  front += brazier(a, 1050, 352, 1.1);
  // chests & crystals at the far edges, off the battlefield
  front += crate(a, 96, 352, 0.7, ['#9a7ac8', '#6a4a98', '#3a2a5a']);
  front += crystalCluster(a, 1190, 352, 0.55, { light: '#e0f6ff', mid: '#6fc8ff', dark: '#2a5ab8', line: '#0a1a4a', glow: '#6fc8ff' });
  front += bookPile(a, -60, 352, 1) + crate(a, 1380, 356, 0.8, ['#9a7ac8', '#6a4a98', '#3a2a5a']);
  front += crystalCluster(a, -150, 560, 0.8, { light: '#e0f6ff', mid: '#6fc8ff', dark: '#2a5ab8', line: '#0a1a4a', glow: '#6fc8ff' });
  // foreground pillars & steps
  front += column(a, 30, 790, 120, 820, fgPillar);
  front += column(a, 1250, 790, 120, 820, fgPillar);
  front += column(a, -190, 820, 130, 900, fgPillar) + column(a, 1470, 820, 130, 900, fgPillar);
  front += `<path d="M${X0 - 20} 694H230L262 740V${Y1 + 10}H${X0 - 20}Z" fill="#232a52" stroke="#0a0d1c" stroke-width="2.4"/><path d="M${X0 - 20} 694H230" stroke="#56619a" stroke-width="2" opacity=".6"/>`;
  front += `<path d="M${X1 + 20} 694H1050L1018 740V${Y1 + 10}H${X1 + 20}Z" fill="#232a52" stroke="#0a0d1c" stroke-width="2.4"/><path d="M${X1 + 20} 694H1050" stroke="#56619a" stroke-width="2" opacity=".6"/>`;
  front += grade(a, '#4a6aff', '#1a0a3a', 0.3);
  front += vignette(a, '#05060f', 0.6);
  front += grain(a, 0.06);

  const rune = runeCircleSvg('#7ff0ff');
  return {
    back,
    front,
    base: '#1c2244',
    motes: [
      { color: '#bfe4ff', count: 18, size: [2, 5], area: [400, 140, 900, 640], rise: [-80, -160], drift: 40, dur: [8, 13], shape: 'dot' },
      { color: '#7ff0ff', count: 10, size: [3, 6], area: [360, 420, 920, 600], rise: [-120, -220], drift: 20, dur: [5, 9], shape: 'spark' },
      { color: '#ffc06a', count: 8, size: [2, 4], area: [200, 250, 260, 290], rise: [-80, -140], drift: 16, dur: [2, 4], shape: 'ember' },
      { color: '#ffc06a', count: 8, size: [2, 4], area: [1020, 250, 1080, 290], rise: [-80, -140], drift: 16, dur: [2, 4], shape: 'ember' },
    ],
    pulses: [
      { x: 230, y: 270, rx: 150, ry: 150, color: '#ffa64a', dur: 1.6, min: 0.35, max: 0.65 },
      { x: 1050, y: 270, rx: 150, ry: 150, color: '#ffa64a', dur: 1.9, min: 0.35, max: 0.65 },
      { x: 640, y: 490, rx: 380, ry: 140, color: '#5fd6ff', dur: 3.5, min: 0.1, max: 0.35 },
    ],
    spins: [{ x: 640, y: 490, size: 640, svg: rune, dur: 60, squash: 0.36 }],
  };
}

function archWindow(a: Art, x: number, y: number, s: number): string {
  const w = 130 * s;
  const h = 230 * s;
  const d = `M${n(x - w / 2)} ${n(y + h)}V${n(y + w / 2)}A${n(w / 2)} ${n(w / 2)} 0 0 1 ${n(x + w / 2)} ${n(y + w / 2)}V${n(y + h)}Z`;
  const sky = a.lin([[0, '#1a2a7a'], [0.6, '#3a6ad0'], [1, '#7aa8ff']]);
  let stars = '';
  for (let i = 0; i < 10; i++) stars += `<circle cx="${n(x + a.r(-w / 2.4, w / 2.4))}" cy="${n(y + a.r(20, h * 0.6))}" r="${n(a.r(0.8, 2))}" fill="#fff" opacity="${n(a.r(0.5, 1))}"/>`;
  return (
    `<path d="${d}" fill="#0e1228" transform="translate(${n(x)} ${n(y + h)}) scale(1.16 1.05) translate(${n(-x)} ${n(-(y + h))})"/>` +
    `<path d="${d}" fill="${sky}"/>` +
    `<g clip-path="${a.clip(d)}">${stars}<circle cx="${n(x + w * 0.15)}" cy="${n(y + h * 0.3)}" r="${n(22 * s)}" fill="#f4f8ff"/><circle cx="${n(x + w * 0.15)}" cy="${n(y + h * 0.3)}" r="${n(40 * s)}" fill="#cfe0ff" opacity=".25"/>` +
    `<path d="M${n(x - w / 2)} ${n(y + h * 0.85)}Q${n(x)} ${n(y + h * 0.7)} ${n(x + w / 2)} ${n(y + h * 0.8)}V${n(y + h)}H${n(x - w / 2)}Z" fill="#22336e"/></g>` +
    `<path d="M${n(x)} ${n(y)}V${n(y + h)}M${n(x - w / 2)} ${n(y + h * 0.5)}H${n(x + w / 2)}" stroke="#141a38" stroke-width="${n(7 * s)}"/>` +
    `<path d="${d}" fill="none" stroke="#141a38" stroke-width="${n(8 * s)}"/>` +
    `<path d="${d}" fill="none" stroke="#7a86c0" stroke-width="2" opacity=".6"/>`
  );
}

function bookPile(a: Art, x: number, by: number, s: number): string {
  let out = ao(a, x, by, 40 * s, 6 * s, 0.4);
  const cols = ['#b83a3a', '#3a7ab8', '#3a9a5a', '#b8963a', '#7a3ab8'];
  let y = by;
  for (let i = 0; i < 4; i++) {
    const w = a.r(46, 60) * s;
    const h = a.r(9, 13) * s;
    const dx = a.r(-6, 6) * s;
    const col = cols[Math.floor(a.rand() * cols.length) % cols.length];
    out += `<rect x="${n(x - w / 2 + dx)}" y="${n(y - h)}" width="${n(w)}" height="${n(h)}" rx="2" fill="${col}" stroke="#120a14" stroke-width="2"/>`;
    out += `<rect x="${n(x - w / 2 + dx + 4)}" y="${n(y - h + 2)}" width="${n(w - 10)}" height="${n(h * 0.35)}" fill="#f2e6c8" opacity=".85"/>`;
    y -= h;
  }
  return out;
}

/** A recessed stone niche in the tower wall holding books and a candle (sits on the wall, not the floor). */
function wallShelf(a: Art, x: number, y: number, s: number): string {
  const w = 120 * s;
  const h = 70 * s;
  let out = `<rect x="${n(x - w / 2 - 8)}" y="${n(y - h - 8)}" width="${n(w + 16)}" height="${n(h + 16)}" rx="6" fill="#2a3360" stroke="#0e1228" stroke-width="2.4"/>`;
  out += `<rect x="${n(x - w / 2)}" y="${n(y - h)}" width="${n(w)}" height="${n(h)}" rx="3" fill="#0e1228"/>`;
  let bx = x - w / 2 + 6;
  const cols = ['#b83a3a', '#3a7ab8', '#3a9a5a', '#b8963a', '#7a3ab8'];
  while (bx < x + w / 2 - 30) {
    const bw = a.r(8, 13) * s;
    const bh = a.r(36, 52) * s;
    const tilt = a.rand() < 0.15 ? 8 : 0;
    out += `<rect x="${n(bx)}" y="${n(y - bh)}" width="${n(bw)}" height="${n(bh)}" rx="1.5" fill="${a.pick(cols)}" stroke="#0a0614" stroke-width="1.6" transform="rotate(${tilt} ${n(bx)} ${n(y)})"/>`;
    out += `<path d="M${n(bx + 2)} ${n(y - bh + 6)}H${n(bx + bw - 2)}" stroke="#ffd36a" stroke-width="1.4" opacity=".7"/>`;
    bx += bw + 1.5;
  }
  out += `<rect x="${n(x + w / 2 - 20)}" y="${n(y - 26 * s)}" width="${n(9 * s)}" height="${n(26 * s)}" rx="2" fill="#f2e6c8" stroke="#0a0614" stroke-width="1.4"/>`;
  out += glow(a, x + w / 2 - 15.5, y - 32 * s, 30 * s, 30 * s, '#ffc06a', 0.7);
  out += `<path d="M${n(x + w / 2 - 15.5)} ${n(y - 38 * s)}q3 4 0 7q-3 -3 0 -7Z" fill="#fff2b0"/>`;
  out += `<path d="M${n(x - w / 2 - 12)} ${n(y + 8)}H${n(x + w / 2 + 12)}" stroke="#0e1228" stroke-width="7" stroke-linecap="round"/><path d="M${n(x - w / 2 - 12)} ${n(y + 6)}H${n(x + w / 2 + 12)}" stroke="#6a78b8" stroke-width="2.4" stroke-linecap="round"/>`;
  return out;
}

/** Rune circle decal (square 0..200 box, centered), spun by CSS. */
function runeCircleSvg(color: string): string {
  let ticks = '';
  for (let i = 0; i < 36; i++) {
    const ang = (i / 36) * Math.PI * 2;
    const r1 = 84;
    const r2 = i % 3 === 0 ? 74 : 79;
    ticks += `M${n(100 + Math.cos(ang) * r1)} ${n(100 + Math.sin(ang) * r1)}L${n(100 + Math.cos(ang) * r2)} ${n(100 + Math.sin(ang) * r2)}`;
  }
  let glyphs = '';
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const gx = 100 + Math.cos(ang) * 62;
    const gy = 100 + Math.sin(ang) * 62;
    glyphs += `<path d="M${n(gx - 4)} ${n(gy - 5)}L${n(gx + 4)} ${n(gy)}L${n(gx - 4)} ${n(gy + 5)}M${n(gx + 4)} ${n(gy - 5)}V${n(gy + 5)}" transform="rotate(${n((ang * 180) / Math.PI + 90)} ${n(gx)} ${n(gy)})"/>`;
  }
  return (
    `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">` +
    `<circle cx="100" cy="100" r="92" stroke-width="3"/><circle cx="100" cy="100" r="86" stroke-width="1.5" opacity=".7"/>` +
    `<path d="${ticks}" stroke-width="2"/>` +
    `<circle cx="100" cy="100" r="50" stroke-width="2.5"/>` +
    `<path d="${starPath(100, 100, 6, 50, 29)}" stroke-width="2" opacity=".85"/>` +
    `<g stroke-width="2.2">${glyphs}</g>` +
    `<circle cx="100" cy="100" r="16" stroke-width="2"/></g></svg>`
  );
}

// ---------------------------------------------------------------------------
// Void — floating platform in a purple cosmos with a swirling rift
// ---------------------------------------------------------------------------

function voidScene(a: Art): Layers {
  const voidRock: RockPal = { light: '#8a6ac0', mid: '#4a3a7a', dark: '#22184a', line: '#0a0620' };
  const fgRock: RockPal = { light: '#3a2a5a', mid: '#221838', dark: '#120c22', line: '#05030c' };
  const shard: CrystalPal = { light: '#e8f8ff', mid: '#7fe0ff', dark: '#3a62d0', line: '#0a1240', glow: '#6fd8ff' };
  const shardPink: CrystalPal = { light: '#ffe0f6', mid: '#ff7ad6', dark: '#a02a9a', line: '#2a0630', glow: '#ff7ad6' };

  let back = `<rect ${FULL} fill="${a.linU([[0, '#07020f'], [0.5, '#1d0838'], [1, '#3a1066']], 0, 0, 0, 720)}"/>`;
  // nebula
  for (const [cx, cy, rx, ry, col] of [
    [300, 160, 360, 140, '#7a2bd6'],
    [980, 120, 380, 150, '#d63a9a'],
    [640, 260, 520, 120, '#2bb8d6'],
    [160, 330, 260, 90, '#4a2bd6'],
  ] as const) {
    back += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${col}" opacity=".35" filter="${a.blur(40)}" style="mix-blend-mode:screen"/>`;
  }
  let stars = '';
  for (let i = 0; i < 170; i++) {
    stars += `<circle cx="${n(a.r(X0, X1))}" cy="${n(a.r(Y0, 330))}" r="${n(a.r(0.6, 2.2))}" fill="#fff" opacity="${n(a.r(0.3, 1))}"/>`;
  }
  back += stars;
  back += glow(a, 640, 150, 300, 160, '#b06cff', 0.6);

  // floating islands (front-of-rift, still in the back svg after the rift layer is drawn behind them by the DOM)
  let islands = '';
  islands += island(a, 170, 150, 1.0, voidRock, shard);
  islands += island(a, 1110, 120, 1.15, voidRock, shardPink);
  islands += island(a, 380, 70, 0.5, voidRock, shard);
  islands += island(a, 900, 210, 0.45, voidRock, shardPink);
  islands += island(a, -120, 190, 0.8, voidRock, shardPink);
  islands += island(a, 1420, 230, 0.7, voidRock, shard);

  let front = islands;
  // platform: back edge (crumbling rim) and top surface
  const rim = groundShape(a, 300, 10);
  front += `<path d="${rim}" fill="#120a26" transform="translate(0 18)"/>`;
  front += `<path d="${rim}" fill="${a.lin([[0, '#5a4690'], [0.3, '#3e2f6e'], [1, '#1c1438']])}"/>`;
  // arcane light under the platform slabs (shows through the joints)
  for (const [gx, gy, rx, ry, col] of [[640, 480, 520, 150, '#7fe0ff'], [250, 600, 260, 80, '#c58aff'], [1030, 600, 260, 80, '#ff7ad6'], [640, 360, 600, 40, '#c58aff']] as const) {
    front += `<ellipse cx="${gx}" cy="${gy}" rx="${rx}" ry="${ry}" fill="${col}" filter="${a.blur(20)}" opacity=".55"/>`;
  }
  front += groundTiles(a, { base: '#3e2f6e', light: '#7a66b8', dark: '#271c4c', edge: '#120a26', hi: '#c9b8ff' }, { y0: 306, cell: 150, rowT: 0.075, skip: 0.04, gap: 5, round: 10, vary: 0.45, crackP: 0.15 });
  front += litOval(a, '#c9a8ff', 0.32);
  front += glow(a, 640, 490, 360, 120, '#7fe0ff', 0.18);
  // props along the rim
  front += crystalCluster(a, 120, 318, 0.8, shard, { rocks: voidRock });
  front += rock(a, 330, 318, 90, 40, voidRock);
  front += obelisk(a, 470, 318, 0.9);
  front += obelisk(a, 810, 318, 0.9);
  front += rock(a, 960, 316, 70, 34, voidRock);
  front += crystalCluster(a, 1170, 322, 0.9, shardPink, { rocks: voidRock });
  // side mid
  front += crystalCluster(a, 30, 560, 0.8, shardPink, { rocks: voidRock, count: 4 });
  front += rock(a, 1250, 560, 120, 64, voidRock);
  front += obelisk(a, -130, 330, 0.8) + crystalCluster(a, 1420, 330, 0.8, shard, { rocks: voidRock });
  // broken platform edge in the foreground corners revealing the void below
  front += `<path d="M${X0 - 20} 560L-120 570L-20 600L60 610L120 660L200 690L240 ${Y1 + 10}H${X0 - 20}Z" fill="#07020f"/>`;
  front += `<path d="M${X1 + 20} 560L1400 572L1300 590L1220 600L1150 650L1080 700L1060 ${Y1 + 10}H${X1 + 20}Z" fill="#07020f"/>`;
  // foreground: dark rock lips with a toppled rune obelisk and loose shards (no big crystal masses)
  front += rock(a, 80, 770, 300, 120, fgRock, { pts: 8 });
  front += `<g transform="translate(250 735) rotate(-64)">${obelisk(a, 0, 0, 1.15)}</g>`;
  front += crystal(150, 724, 46, 16, -24, shard, 1.8) + crystal(176, 728, 30, 12, 10, shard, 1.6);
  front += rock(a, 1200, 770, 320, 130, fgRock, { pts: 8 });
  front += rock(a, 1050, 760, 130, 54, fgRock);
  front += crystal(1112, 724, 40, 15, 20, shardPink, 1.8) + crystal(1136, 730, 26, 11, -8, shardPink, 1.6);
  front += rock(a, -160, 790, 260, 150, fgRock, { pts: 8 }) + rock(a, 1440, 790, 260, 150, fgRock, { pts: 8 });
  front += grade(a, '#6a3aff', '#1a0a3a', 0.3);
  front += vignette(a, '#030108', 0.65);
  front += grain(a, 0.07);

  const rift = riftSvg(a.uid('rift'));
  return {
    back,
    front,
    base: '#1d0838',
    motes: [
      { color: '#d9b8ff', count: 24, size: [2, 6], area: [X0, 280, X1, 720], rise: [-200, -340], drift: 40, dur: [7, 12], shape: 'spark' },
      { color: '#7fe0ff', count: 14, size: [2, 5], area: [X0, 300, X1, 720], rise: [-160, -300], drift: 30, dur: [6, 11], shape: 'dot' },
      { color: '#ffffff', count: 18, size: [2, 4], area: [X0, -100, X1, 300], rise: [-6, 6], drift: 0, dur: [2, 5], shape: 'star' },
    ],
    pulses: [
      { x: 640, y: 150, rx: 260, ry: 170, color: '#b06cff', dur: 4, min: 0.3, max: 0.65 },
      { x: 640, y: 490, rx: 420, ry: 140, color: '#7fe0ff', dur: 5, min: 0.05, max: 0.2 },
    ],
    spins: [
      { x: 640, y: 150, size: 380, svg: rift, dur: 26, squash: 0.62, back: true },
      { x: 640, y: 150, size: 230, svg: riftSvg(a.uid('rift')), dur: 14, squash: 0.62, back: true, reverse: true },
    ],
  };
}

function island(a: Art, x: number, y: number, s: number, p: RockPal, c: CrystalPal): string {
  const w = 190 * s;
  const top = blobPath(a.rand, x, y, w / 2, 16 * s, 9, 0.1);
  const under = `M${n(x - w / 2)} ${n(y)}Q${n(x - w * 0.3)} ${n(y + 60 * s)} ${n(x - 10 * s)} ${n(y + 120 * s)}Q${n(x + 4 * s)} ${n(y + 130 * s)} ${n(x + 12 * s)} ${n(y + 110 * s)}Q${n(x + w * 0.32)} ${n(y + 50 * s)} ${n(x + w / 2)} ${n(y)}Z`;
  return (
    glow(a, x, y + 70 * s, w * 0.6, 80 * s, c.glow, 0.4) +
    `<path d="${under}" fill="${a.lin([[0, p.mid], [1, p.dark]], 0, 0, 1, 0)}" stroke="${p.line}" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M${n(x - w * 0.2)} ${n(y + 10 * s)}L${n(x - 6 * s)} ${n(y + 90 * s)}M${n(x + w * 0.2)} ${n(y + 12 * s)}L${n(x + 8 * s)} ${n(y + 70 * s)}" stroke="${p.dark}" stroke-width="2" opacity=".7"/>` +
    `<path d="${top}" fill="${p.light}" stroke="${p.line}" stroke-width="2.4"/>` +
    crystal(x - w * 0.15, y + 4 * s, 70 * s, 22 * s, -12, c, 2) +
    crystal(x + w * 0.05, y + 6 * s, 50 * s, 18 * s, 14, c, 2) +
    crystal(x - 6 * s, y + 132 * s, 34 * s, 12 * s, 180, c, 1.6)
  );
}

function obelisk(a: Art, x: number, by: number, s: number): string {
  const w = 40 * s;
  const h = 150 * s;
  const left = poly([[x - w / 2, by], [x - w * 0.38, by - h], [x, by - h - 26 * s], [x, by]]);
  const right = poly([[x, by], [x, by - h - 26 * s], [x + w * 0.38, by - h], [x + w / 2, by]]);
  const runes = `M${n(x - 4 * s)} ${n(by - h * 0.8)}L${n(x + 5 * s)} ${n(by - h * 0.7)}L${n(x - 4 * s)} ${n(by - h * 0.6)}M${n(x)} ${n(by - h * 0.5)}V${n(by - h * 0.3)}M${n(x - 5 * s)} ${n(by - h * 0.4)}H${n(x + 5 * s)}`;
  return (
    ao(a, x + 5, by, w * 1.1, 8 * s, 0.5) +
    `<path d="${left}" fill="#5a4a90"/><path d="${right}" fill="#2a2050"/>` +
    `<path d="${poly([[x - w / 2, by], [x - w * 0.38, by - h], [x, by - h - 26 * s], [x + w * 0.38, by - h], [x + w / 2, by]])}" fill="none" stroke="#0a0620" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="${runes}" fill="none" stroke="#7fe0ff" stroke-width="7" opacity=".5" filter="${a.blur(3)}"/>` +
    `<path d="${runes}" fill="none" stroke="#d8f8ff" stroke-width="2.4" stroke-linecap="round"/>` +
    glow(a, x, by - h - 30 * s, 30 * s, 30 * s, '#7fe0ff', 0.8)
  );
}

/** Swirling rift decal (spun by CSS). */
function riftSvg(gid: string): string {
  let arms = '';
  for (let k = 0; k < 5; k++) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const ang = (k / 5) * Math.PI * 2 + t * 4.2;
      const r = 8 + t * 88;
      pts.push([100 + Math.cos(ang) * r, 100 + Math.sin(ang) * r]);
    }
    arms += `<path d="${smoothOpen(pts)}" stroke-width="${k % 2 ? 7 : 11}" stroke="${k % 2 ? '#7fe0ff' : '#c58aff'}" opacity="${k % 2 ? 0.55 : 0.7}"/>`;
  }
  return (
    `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><radialGradient id="${gid}"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".25" stop-color="#e6c8ff" stop-opacity=".9"/><stop offset=".6" stop-color="#7a2bd6" stop-opacity=".45"/><stop offset="1" stop-color="#3a1066" stop-opacity="0"/></radialGradient></defs>` +
    `<circle cx="100" cy="100" r="98" fill="url(#${gid})"/>` +
    `<g fill="none" stroke-linecap="round">${arms}</g>` +
    `<circle cx="100" cy="100" r="14" fill="#fff" opacity=".9"/></svg>`
  );
}

const BUILDERS: Record<SceneKind, (a: Art) => Layers> = {
  cave,
  forest,
  ruins,
  volcano,
  tower,
  void: voidScene,
};

const SEEDS: Record<SceneKind, number> = { cave: 11, forest: 23, ruins: 37, volcano: 41, tower: 53, void: 67 };

/** Builds every layer of a scene. `prefix` must be unique per instance on the page. */
export function buildScene(kind: SceneKind, prefix: string): SceneArt {
  const a = new Art(new Ids(prefix), SEEDS[kind]);
  const layers = BUILDERS[kind](a);
  return { kind, defs: a.defs.join(''), ...layers };
}

/** Wraps a layer in an SVG covering the whole full-bleed art box. */
export function sceneSvg(inner: string, cls: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="${X0} ${Y0} ${ART_W} ${ART_H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${defs ? `<defs>${defs}</defs>` : ''}${inner}</svg>`;
}

