// Original glossy cartoon icon set. Pure string builders (no DOM) so they are testable.
// Every icon is drawn in a 64x64 box: thick dark outline, two-tone cel shading
// (a shifted copy of the shape clipped to itself) and a white gloss highlight.
import type { Faction } from '../../core/types';
import type { IconName } from '../types';
import {
  circlePath,
  crescentPath,
  gearPath,
  Ids,
  linGrad,
  n,
  poly,
  radGrad,
  softStarPath,
  starPath,
} from './kit';

export interface Pal {
  hi: string;
  mid: string;
  lo: string;
  out: string;
}

export const PAL = {
  gold: { hi: '#fff7b8', mid: '#ffc93a', lo: '#d47f0b', out: '#5a2c03' },
  goldDeep: { hi: '#ffe48a', mid: '#f2a91d', lo: '#b5620a', out: '#5a2c03' },
  steel: { hi: '#ffffff', mid: '#c8d3e3', lo: '#7988a5', out: '#232c45' },
  red: { hi: '#ffb6a6', mid: '#ff4b3e', lo: '#b3152a', out: '#470611' },
  green: { hi: '#e4ffb4', mid: '#63d63f', lo: '#23891d', out: '#0d390b' },
  blue: { hi: '#d2f4ff', mid: '#40a9ff', lo: '#1659c2', out: '#0a2252' },
  purple: { hi: '#f3d9ff', mid: '#b066ff', lo: '#6025bd', out: '#240a50' },
  pink: { hi: '#ffdcf4', mid: '#ff62c2', lo: '#bf1b82', out: '#4a0532' },
  cyan: { hi: '#e8ffff', mid: '#45dff1', lo: '#1199c1', out: '#05384c' },
  orange: { hi: '#ffe9ab', mid: '#ff9b2c', lo: '#d04b0b', out: '#541a03' },
  wood: { hi: '#f1c08a', mid: '#bf7b3f', lo: '#7b4419', out: '#341906' },
  parch: { hi: '#fffcec', mid: '#f4ddab', lo: '#c99f62', out: '#523411' },
  stone: { hi: '#f3f5f9', mid: '#aab2c0', lo: '#666f83', out: '#252935' },
  slate: { hi: '#8d94ae', mid: '#50576f', lo: '#2b3045', out: '#10131d' },
  white: { hi: '#ffffff', mid: '#f3f5fb', lo: '#c3c9dc', out: '#27304d' },
  leather: { hi: '#eab076', mid: '#aa672f', lo: '#6a3712', out: '#2e1505' },
  navy: { hi: '#7590d6', mid: '#2f4489', lo: '#17214d', out: '#080d24' },
  crimson: { hi: '#ffa3b4', mid: '#cc2242', lo: '#6c0a21', out: '#29030f' },
  dark: { hi: '#b27fc9', mid: '#4b2352', lo: '#1d0923', out: '#0a020d' },
  glass: { hi: '#ffffff', mid: '#e2f6ff', lo: '#9fc9e2', out: '#1d3a5c' },
  lime: { hi: '#f6ffd0', mid: '#b8f05a', lo: '#5aa82a', out: '#163d0a' },
} satisfies Record<string, Pal>;

/** Per-icon build context: collects <defs> and hands out unique ids. */
export class IconCtx {
  readonly defs: string[] = [];
  private k = 0;
  constructor(readonly ids: Ids) {}
  key(): string {
    return (this.k++).toString(36);
  }
}

export interface PartOpts {
  /** Outline width (default 3.5). */
  sw?: number;
  /** Offset of the lit copy; the uncovered rim stays in the shadow tone. */
  shade?: readonly [number, number];
  /** Gloss highlight path (clipped to the part). */
  gloss?: string;
  glossOp?: number;
  /** Extra markup clipped to the part (details, facets). */
  extra?: string;
  /** Gradient angle: 'v' top→bottom (default) or 'd' diagonal. */
  dir?: 'v' | 'd';
}

/** A filled cartoon shape: shadow base + lit gradient copy + gloss + thick outline. */
export function part(c: IconCtx, d: string, p: Pal, o: PartOpts = {}): string {
  const k = c.key();
  const g = c.ids.id(`g${k}`);
  const cl = c.ids.id(`c${k}`);
  const diag = o.dir === 'd';
  c.defs.push(linGrad(g, [[0, p.hi], [0.48, p.mid], [1, p.mid]], diag ? 0.2 : 0, 0, diag ? 0.8 : 0, 1));
  c.defs.push(`<clipPath id="${cl}"><path d="${d}"/></clipPath>`);
  const [dx, dy] = o.shade ?? [-2.4, -3];
  const sw = o.sw ?? 3.5;
  const gloss = o.gloss ? `<path d="${o.gloss}" fill="#fff" opacity="${o.glossOp ?? 0.55}"/>` : '';
  return (
    `<path d="${d}" fill="${p.lo}"/>` +
    `<g clip-path="url(#${cl})"><path d="${d}" transform="translate(${dx} ${dy})" fill="url(#${g})"/>${o.extra ?? ''}${gloss}</g>` +
    (sw > 0 ? `<path d="${d}" fill="none" stroke="${p.out}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>` : '')
  );
}

/** A thick stroked tube (bow limbs, shackles, handles). */
export function tube(d: string, p: Pal, w: number): string {
  return (
    `<path d="${d}" fill="none" stroke="${p.out}" stroke-width="${n(w + 3.5)}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${p.lo}" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${p.mid}" stroke-width="${n(w * 0.62)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(-0.5 -0.7)"/>` +
    `<path d="${d}" fill="none" stroke="${p.hi}" stroke-width="${n(w * 0.22)}" stroke-linecap="round" stroke-linejoin="round" opacity=".8" transform="translate(-0.9 -1.2)"/>`
  );
}

/** Small 4-point twinkle. */
export function sparkle(cx: number, cy: number, r: number, color = '#ffffff', op = 1): string {
  return `<path d="${starPath(cx, cy, 4, r, r * 0.28)}" fill="${color}" opacity="${op}"/>`;
}

function glossEllipse(cx: number, cy: number, rx: number, ry: number, rot = -35): string {
  const a = (rot * Math.PI) / 180;
  // Rotated ellipse as a path via two arcs (keeps it a plain path for clip groups).
  const x1 = cx - rx * Math.cos(a);
  const y1 = cy - rx * Math.sin(a);
  const x2 = cx + rx * Math.cos(a);
  const y2 = cy + rx * Math.sin(a);
  return `M${n(x1)} ${n(y1)}A${n(rx)} ${n(ry)} ${n(rot)} 1 1 ${n(x2)} ${n(y2)}A${n(rx)} ${n(ry)} ${n(rot)} 1 1 ${n(x1)} ${n(y1)}Z`;
}

function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}Q${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + r)}V${n(y + h - r)}Q${n(x + w)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)}H${n(x + r)}Q${n(x)} ${n(y + h)} ${n(x)} ${n(y + h - r)}V${n(y + r)}Q${n(x)} ${n(y)} ${n(x + r)} ${n(y)}Z`;
}

/** Heart centered at (cx, cy) with half-width s. */
export function heartPath(cx: number, cy: number, s: number): string {
  const k = s / 21;
  const P = (x: number, y: number): string => `${n(cx + x * k)} ${n(cy + y * k)}`;
  return `M${P(0, 22)}C${P(-14, 12)} ${P(-21, 4)} ${P(-21, -6)}C${P(-21, -14)} ${P(-15, -19)} ${P(-8.5, -19)}C${P(-4.5, -19)} ${P(-1.5, -17)} ${P(0, -13.5)}C${P(1.5, -17)} ${P(4.5, -19)} ${P(8.5, -19)}C${P(15, -19)} ${P(21, -14)} ${P(21, -6)}C${P(21, 4)} ${P(14, 12)} ${P(0, 22)}Z`;
}

const FLAME_OUTER = 'M32 3C40 15 52 23 50.5 40C49.5 52 41.5 61 32 61C22.5 61 14.5 53 13.5 41C12.8 31 19 24 23.5 14C25.5 21 29 24 31.5 26C34 19 34.5 11 32 3Z';
const FLAME_INNER = 'M32 29C36.5 37 42.5 41.5 41 50C40 55.5 36 58 32 58C27.5 58 23.5 55 23.5 49.5C23.5 43 30 39.5 32 29Z';
const DROP = 'M32 5C39 18 50 28 50 41C50 52 42 60 32 60C22 60 14 52 14 41C14 28 25 18 32 5Z';
const SHIELD = 'M10 9H54V29C54 45 44 54 32 60C20 54 10 45 10 29Z';
const BOLT = 'M39 2L9.5 37H27.5L21.5 62L55 23.5H36Z';

/** A straight sword drawn vertically (tip up) around x=32, rotated by `rot` degrees about (cx, cy). */
function sword(c: IconCtx, rot: number, scale = 1, blade: Pal = PAL.steel, guard: Pal = PAL.gold, cx = 32, cy = 32): string {
  const body =
    part(c, 'M28 13L32 4L36 13V41H28Z', blade, { shade: [-1.6, -1], sw: 3.2, extra: `<path d="M32 9V39" stroke="${blade.lo}" stroke-width="1.6" opacity=".7"/>` }) +
    part(c, roundRect(19, 40, 26, 6.5, 3.2), guard, { shade: [-1, -1.5], sw: 3.2 }) +
    part(c, 'M29 46.5H35V55H29Z', PAL.leather, { shade: [-1.2, 0], sw: 3 }) +
    part(c, circlePath(32, 58, 4), guard, { shade: [-1, -1.3], sw: 3 });
  return `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${n(rot)}) scale(${n(scale)}) translate(-32 -32)">${body}</g>`;
}

function badge(c: IconCtx, p: Pal = PAL.navy, ring = '#f7c948'): string {
  return (
    part(c, circlePath(32, 32, 28.5), p, { shade: [-2, -2.5], sw: 3.2 }) +
    `<circle cx="32" cy="32" r="24.3" fill="none" stroke="${ring}" stroke-width="2.4" opacity=".95"/>` +
    `<circle cx="32" cy="32" r="22.6" fill="none" stroke="#000" stroke-width="1" opacity=".25"/>`
  );
}

function scroll(c: IconCtx, sheet: Pal, rod: Pal, emblem: string): string {
  const sheetD = 'M15 13Q32 16.5 49 13V51Q32 47.5 15 51Z';
  return (
    part(c, sheetD, sheet, { shade: [-2, -2], extra: emblem }) +
    part(c, roundRect(8, 6, 48, 11, 5.5), rod, { shade: [0, -2.5], gloss: roundRect(12, 7.5, 34, 2.5, 1.2), glossOp: 0.7 }) +
    part(c, roundRect(8, 47, 48, 11, 5.5), rod, { shade: [0, -2.5], gloss: roundRect(12, 48.5, 34, 2.5, 1.2), glossOp: 0.7 })
  );
}

type Builder = (c: IconCtx) => string;

export const ICON_BUILDERS: Record<IconName, Builder> = {
  // ---------------------------------------------------------------- resources
  gold: (c) =>
    part(c, circlePath(32, 35.5, 26.5), PAL.goldDeep, { shade: [0, 0] }) +
    part(c, circlePath(32, 31.5, 26.5), PAL.gold, { gloss: glossEllipse(20, 18, 10, 5), glossOp: 0.65, shade: [-2, -2.5] }) +
    `<circle cx="32" cy="31.5" r="19.5" fill="none" stroke="#c46f08" stroke-width="2.6"/>` +
    `<circle cx="32.8" cy="32.6" r="19.5" fill="none" stroke="#fff3b0" stroke-width="1.2" opacity=".8"/>` +
    part(c, poly([[32, 19.5], [42, 31.5], [32, 43.5], [22, 31.5]]), PAL.goldDeep, { sw: 2.6, shade: [1.6, 2], gloss: poly([[32, 21.5], [38.5, 29.5], [32, 29.5]]), glossOp: 0.6 }) +
    sparkle(48.5, 12, 7.5),

  spirit: (c) => {
    const k = c.key();
    const glow = c.ids.id(`sg${k}`);
    c.defs.push(radGrad(glow, [[0, '#8be6ff', 0.75], [1, '#3a8cff', 0]]));
    const outline = poly([[32, 3], [49, 19.5], [45, 50], [32, 61], [19, 50], [15, 19.5]]);
    const facets =
      `<path d="${poly([[32, 3], [15, 19.5], [19, 50], [32, 61], [26.5, 47], [25.5, 20]])}" fill="#ffffff" opacity=".28"/>` +
      `<path d="${poly([[32, 3], [39, 20], [38, 47], [32, 61], [45, 50], [49, 19.5]])}" fill="#081a4a" opacity=".3"/>` +
      `<path d="M25.5 20L32 3L39 20M25.5 20H39M26.5 47H38M26.5 47L32 61L38 47M25.5 20L26.5 47M39 20L38 47" fill="none" stroke="#e6fbff" stroke-width="1.3" opacity=".75"/>`;
    return (
      `<circle cx="32" cy="33" r="31" fill="url(#${glow})"/>` +
      part(c, outline, PAL.cyan, { shade: [0, 0], extra: facets, gloss: poly([[30.5, 8], [22, 21], [23, 40], [26, 22]]), glossOp: 0.75 }) +
      sparkle(50, 11, 7) +
      sparkle(13, 47, 4.5, '#e9fdff', 0.9)
    );
  },

  gem: (c) => {
    const outline = poly([[11, 24], [21.5, 10], [42.5, 10], [53, 24], [32, 57]]);
    const facets =
      `<path d="${poly([[11, 24], [21.5, 10], [26, 24]])}" fill="#ffe0f6"/>` +
      `<path d="${poly([[21.5, 10], [42.5, 10], [38, 24], [26, 24]])}" fill="#ff9ad9"/>` +
      `<path d="${poly([[42.5, 10], [53, 24], [38, 24]])}" fill="#ff5ec1"/>` +
      `<path d="${poly([[11, 24], [26, 24], [32, 57]])}" fill="#e9409d"/>` +
      `<path d="${poly([[26, 24], [38, 24], [32, 57]])}" fill="#ff86cf"/>` +
      `<path d="${poly([[38, 24], [53, 24], [32, 57]])}" fill="#a3156f"/>` +
      `<path d="${poly([[40, 28], [47, 27], [34, 50]])}" fill="#6cecff" opacity=".85"/>` +
      `<path d="M11 24H53M21.5 10L26 24L32 57L38 24L42.5 10" fill="none" stroke="#5a0a3c" stroke-width="1.4" opacity=".55"/>`;
    return part(c, outline, PAL.pink, { shade: [0, 0], extra: facets, gloss: poly([[16, 23], [22.5, 13], [25, 21]]), glossOp: 0.8 }) + sparkle(15, 11, 7) + sparkle(50, 45, 4, '#bff8ff');
  },

  basicScroll: (c) =>
    scroll(
      c,
      PAL.parch,
      PAL.wood,
      `<path d="M21 24H43M21 30H43M21 36H37" stroke="#a87a3f" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>` +
        `<circle cx="40.5" cy="40" r="5.4" fill="#d6372b" stroke="#5e0d0a" stroke-width="1.8"/><circle cx="39.4" cy="38.8" r="1.8" fill="#ff9c8a"/>`,
    ),

  heroicScroll: (c) => {
    const k = c.key();
    const glow = c.ids.id(`hg${k}`);
    c.defs.push(radGrad(glow, [[0, '#fff3b0', 0.95], [1, '#ffcf4a', 0]]));
    return scroll(
      c,
      PAL.purple,
      PAL.gold,
      `<circle cx="32" cy="31.5" r="13" fill="url(#${glow})"/>` +
        `<path d="${softStarPath(32, 31.5, 4, 11, 4.2, 0.12)}" fill="#ffd94a" stroke="#6b3a05" stroke-width="2"/>` +
        `<path d="M18 20H24M40 43H46M18 43H22M42 20H46" stroke="#f7d36a" stroke-width="2" stroke-linecap="round" opacity=".8"/>`,
    );
  },

  playerExp: (c) => {
    const k = c.key();
    const cl = c.ids.id(`fx${k}`);
    const lg = c.ids.id(`fl${k}`);
    const body = 'M26.5 17V24.5C17 28 12 34 12 42C12 52.5 21 60.5 32 60.5C43 60.5 52 52.5 52 42C52 34 47 28 37.5 24.5V17Z';
    c.defs.push(`<clipPath id="${cl}"><path d="${body}"/></clipPath>`);
    c.defs.push(linGrad(lg, [[0, '#a6ffcf'], [0.45, '#2fe08f'], [1, '#0b8a63']]));
    return (
      part(c, body, PAL.glass, { shade: [-1.5, -1.5], sw: 0 }) +
      `<g clip-path="url(#${cl})"><path d="M8 38Q20 33 32 38T56 37V64H8Z" fill="url(#${lg})"/>` +
      `<path d="M8 38Q20 33 32 38T56 37" fill="none" stroke="#d9fff0" stroke-width="2"/>` +
      `<circle cx="25" cy="48" r="3" fill="#e9fff6" opacity=".8"/><circle cx="36" cy="44" r="2" fill="#e9fff6" opacity=".8"/><circle cx="40" cy="52" r="2.5" fill="#e9fff6" opacity=".6"/>` +
      `<path d="M17 36C16 42 18 50 24 55" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity=".75"/></g>` +
      `<path d="${body}" fill="none" stroke="${PAL.glass.out}" stroke-width="3.5" stroke-linejoin="round"/>` +
      part(c, roundRect(23.5, 6, 17, 11, 3), PAL.wood, { shade: [-1, -2] }) +
      sparkle(48, 14, 6.5, '#fffbd0')
    );
  },

  // ---------------------------------------------------------------- factions
  'faction-shadow': (c) =>
    part(c, 'M32 3L56.5 17V47L32 61L7.5 47V17Z', PAL.purple, { gloss: poly([[14, 19], [32, 8.5], [30, 14], [16, 25]]), glossOp: 0.45 }) +
    part(c, crescentPath(29.5, 33.5, 16, 7.5, -5.5, 13), { hi: '#ffffff', mid: '#efe2ff', lo: '#b996ef', out: '#2a0b55' }, { sw: 2.6, shade: [1, -1] }) +
    sparkle(43, 25, 6.5, '#ffffff') +
    sparkle(47, 40, 3.5, '#f0dcff'),

  'faction-fortress': (c) =>
    part(c, SHIELD, PAL.blue, { gloss: 'M14 12H30L16 30Z', glossOp: 0.4 }) +
    `<path d="M10 9H54V29C54 45 44 54 32 60C20 54 10 45 10 29Z" fill="none" stroke="#e8f4ff" stroke-width="1.6" opacity=".6" transform="translate(32 32) scale(.84) translate(-32 -32)"/>` +
    part(c, 'M21 16H27V21H30V16H34V21H37V16H43V26H41V44H23V26H21Z', { hi: '#ffffff', mid: '#fff0cf', lo: '#d9b777', out: '#1d2a55' }, { sw: 2.6, shade: [-1.4, -1.4] }) +
    `<path d="M28.5 44V38.5A3.5 3.5 0 0 1 35.5 38.5V44Z" fill="#1d2a55"/>` +
    `<path d="M29 31H35" stroke="#1d2a55" stroke-width="2.4" stroke-linecap="round"/>`,

  'faction-abyss': (c) =>
    part(c, FLAME_OUTER, PAL.red, { gloss: 'M23 20C20 27 17 33 18 42C21 33 23 27 26 23Z', glossOp: 0.5, shade: [-2, -2.5] }) +
    part(c, FLAME_INNER, { hi: '#fffbe0', mid: '#ffd33d', lo: '#ff8a1c', out: '#7a1b04' }, { sw: 2.4, shade: [-1.4, -1.6] }),

  'faction-forest': (c) =>
    part(c, circlePath(32, 32, 28.5), PAL.green, { gloss: glossEllipse(20, 17, 11, 6), glossOp: 0.45 }) +
    part(c, 'M15 48C15 28 28 15.5 49 15C49.5 36 37 48.5 15 48Z', { hi: '#ffffff', mid: '#efffc8', lo: '#a6dd6a', out: '#0e3a0b' }, { sw: 2.8, shade: [1.4, -1.6] }) +
    `<path d="M17.5 46C25 37.5 33 29 44 20M26.5 37.5L26 29M26.5 37.5L35 37.5M34 30L33.5 23M34 30L41.5 29.5" fill="none" stroke="#2d8a1f" stroke-width="2.1" stroke-linecap="round"/>`,

  'faction-dark': (c) =>
    part(c, starPath(32, 32, 8, 30.5, 19.5, 0), PAL.dark, { gloss: poly([[15, 16], [26, 12], [20, 24]]), glossOp: 0.3 }) +
    part(c, 'M13.5 32Q32 15 50.5 32Q32 49 13.5 32Z', PAL.crimson, { sw: 2.6, shade: [0, -2] }) +
    `<ellipse cx="32" cy="32" rx="4" ry="10.5" fill="#14020a"/>` +
    `<ellipse cx="32" cy="32" rx="1.4" ry="6.5" fill="#ff5a6e" opacity=".8"/>` +
    sparkle(37.5, 25.5, 4, '#ffe3e8'),

  'faction-light': (c) =>
    part(c, softStarPath(32, 32, 12, 30.5, 22, 0.16, 15), PAL.gold, { shade: [-1.5, -2] }) +
    part(c, circlePath(32, 32, 15.5), { hi: '#ffffff', mid: '#fffbe0', lo: '#ffd75a', out: '#7a4006' }, { sw: 2.8, gloss: glossEllipse(26, 25, 6.5, 3.5), glossOp: 0.9, shade: [-1.5, -2] }) +
    sparkle(32, 32, 9.5, '#ffcf3a', 0.9),

  // ---------------------------------------------------------------- classes
  'class-warrior': (c) =>
    badge(c) +
    sword(c, 45, 0.78) +
    part(c, 'M20 20H44V32C44 42 38.5 48 32 51.5C25.5 48 20 42 20 32Z', PAL.red, { sw: 3, gloss: 'M23 22.5H31L23.5 33Z', glossOp: 0.45 }) +
    `<path d="M32 21.5V50M21.5 31H42.5" stroke="#ffd34a" stroke-width="2.4" opacity=".95"/>`,

  'class-mage': (c) =>
    badge(c) +
    `<g transform="rotate(28 32 32)">` +
    part(c, roundRect(29.5, 24, 5, 32, 2.5), PAL.wood, { shade: [-1, 0], sw: 2.8 }) +
    tube('M26 25Q24 15 32 14Q40 15 38 25', PAL.gold, 2.2) +
    `</g>` +
    part(c, circlePath(36.5, 20.5, 7.5), PAL.cyan, { sw: 2.8, gloss: glossEllipse(34, 18, 3.4, 2), glossOp: 0.9 }) +
    sparkle(21, 18, 5.5, '#bff6ff') +
    sparkle(48, 33, 4, '#bff6ff'),

  'class-ranger': (c) =>
    badge(c) +
    `<path d="M22 13V51" stroke="#e8f0ff" stroke-width="1.6"/>` +
    tube('M22 12Q46 32 22 52', PAL.wood, 3.4) +
    `<path d="M13 32H44" stroke="#232c45" stroke-width="5" stroke-linecap="round"/><path d="M13 32H44" stroke="#e8d6b0" stroke-width="2.2" stroke-linecap="round"/>` +
    part(c, poly([[42, 26], [52.5, 32], [42, 38]]), PAL.steel, { sw: 2.6, shade: [0, -1] }) +
    part(c, poly([[11, 27], [18, 27], [21, 32], [18, 37], [11, 37], [14, 32]]), PAL.red, { sw: 2.4, shade: [0, -1] }),

  'class-assassin': (c) =>
    badge(c) +
    `<path d="M14 44Q22 22 46 14" fill="none" stroke="#b37bff" stroke-width="3" stroke-linecap="round" opacity=".55"/>` +
    `<g transform="translate(32 32) rotate(38) scale(.86) translate(-32 -32)">` +
    part(c, 'M32 4C38 13 38.5 26 35.8 37H28.2C25.5 26 26 13 32 4Z', PAL.steel, { sw: 3, shade: [-1.6, -0.5], extra: '<path d="M32 9V35" stroke="#7988a5" stroke-width="1.5"/>' }) +
    part(c, roundRect(22, 36, 20, 6, 3), PAL.purple, { sw: 3, shade: [-1, -1.4] }) +
    part(c, 'M29 42H35V53H29Z', PAL.leather, { sw: 2.8, shade: [-1, 0] }) +
    part(c, circlePath(32, 56, 3.5), PAL.purple, { sw: 2.8, shade: [-1, -1] }) +
    `</g>`,

  'class-priest': (c) =>
    badge(c) +
    `<ellipse cx="32" cy="14.5" rx="10" ry="3.2" fill="none" stroke="#2c2a10" stroke-width="4.6"/><ellipse cx="32" cy="14.5" rx="10" ry="3.2" fill="none" stroke="#ffe46a" stroke-width="2.2"/>` +
    part(c, heartPath(32, 36, 15.5), { hi: '#ffffff', mid: '#ffe6f0', lo: '#f29bb9', out: '#4a0b26' }, { sw: 2.8, gloss: glossEllipse(24.5, 29, 4.5, 2.6), glossOp: 0.9 }) +
    part(c, 'M29 28.5H35V33.5H40V39.5H35V44.5H29V39.5H24V33.5H29Z', PAL.green, { sw: 2.2, shade: [-1, -1] }),

  // ---------------------------------------------------------------- equipment slots
  weapon: (c) => sword(c, 45, 1.05),

  armor: (c) =>
    part(c, 'M17 10L26 7Q32 14 38 7L47 10L55 19L50.5 31L46 29V52Q32 60 18 52V29L13.5 31L9 19Z', PAL.steel, {
      gloss: 'M20 14L25 12Q24 24 22 36L20 30Z',
      glossOp: 0.7,
      extra: '<path d="M32 15V55" stroke="#7988a5" stroke-width="2" opacity=".8"/><path d="M21 30Q26 34 31 31M43 30Q38 34 33 31" fill="none" stroke="#7988a5" stroke-width="2" stroke-linecap="round"/>',
    }) +
    tube('M26 8Q32 15 38 8', PAL.gold, 3) +
    part(c, roundRect(18, 42, 28, 6.5, 2), PAL.gold, { sw: 2.6, shade: [0, -1.5] }) +
    part(c, circlePath(32, 45.2, 3.3), PAL.red, { sw: 2.2, shade: [-0.6, -0.8] }),

  helmet: (c) =>
    part(c, 'M24 13C25 4 39 2.5 45 8C40 8 36 10.5 34 15Z', PAL.red, { sw: 3, shade: [-1, -1.5] }) +
    part(c, 'M13 37C13 19 21 10 32 10C43 10 51 19 51 37V48Q51 55 44 57H20Q13 55 13 48Z', PAL.steel, {
      gloss: 'M19 22Q23 14 31 13Q24 19 21 30Z',
      glossOp: 0.75,
    }) +
    part(c, roundRect(18, 32, 28, 6, 3), PAL.slate, { sw: 2.6, shade: [0, 1.4] }) +
    part(c, 'M29.5 38H34.5V55H29.5Z', PAL.steel, { sw: 2.6, shade: [-1, 0] }) +
    tube('M15 28Q32 22 49 28', PAL.gold, 2.6),

  boots: (c) =>
    part(c, 'M18 6H39V37C39.5 39.5 42 41 46 42L52 43.5Q58.5 45 58.5 51.5V54H15V45Q15.5 41 17.5 37Z', PAL.leather, {
      gloss: 'M21.5 15H26V36H21.5Z',
      glossOp: 0.35,
    }) +
    part(c, roundRect(15, 5, 26, 9, 3), PAL.goldDeep, { sw: 3, shade: [0, -1.8] }) +
    part(c, 'M44 41.5L52 43.5Q58.5 45 58.5 51.5V54H44Z', PAL.steel, { sw: 3, shade: [-1, -1.2] }) +
    part(c, roundRect(13, 52, 47, 7, 3), PAL.slate, { sw: 3, shade: [0, -1.5] }),

  // ---------------------------------------------------------------- statuses
  stun: (c) =>
    `<ellipse cx="32" cy="38" rx="26" ry="11" fill="none" stroke="#5a2c03" stroke-width="6.5"/><ellipse cx="32" cy="38" rx="26" ry="11" fill="none" stroke="#ffe46a" stroke-width="3"/>` +
    part(c, softStarPath(31, 25, 5, 17, 8, 0.12), PAL.gold, { sw: 3, gloss: glossEllipse(26, 19, 4, 2), glossOp: 0.8 }) +
    part(c, softStarPath(11.5, 42, 5, 9, 4.2, 0.12, -15), PAL.gold, { sw: 2.6 }) +
    part(c, softStarPath(52.5, 41, 5, 9, 4.2, 0.12, 15), PAL.gold, { sw: 2.6 }),

  freeze: () => {
    let arms = '';
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 * Math.PI) / 180;
      const P = (r: number, da = 0): string => `${n(32 + r * Math.sin(a + da))} ${n(32 - r * Math.cos(a + da))}`;
      arms += `M${P(0)}L${P(26)}M${P(16)}L${P(22.5, 0.36)}M${P(16)}L${P(22.5, -0.36)}`;
    }
    return (
      `<path d="${arms}" fill="none" stroke="#062f4a" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${arms}" fill="none" stroke="#5cd7ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${arms}" fill="none" stroke="#e9fbff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M32 23.5L39.4 27.8V36.2L32 40.5L24.6 36.2V27.8Z" fill="#cdf6ff" stroke="#062f4a" stroke-width="2.6" stroke-linejoin="round"/>`
    );
  },

  petrify: (c) =>
    part(c, 'M9 40L15 18L30 8L48 13L56.5 33L49 54L22 57Z', PAL.stone, {
      extra:
        `<path d="${poly([[15, 18], [30, 8], [48, 13], [38, 24], [22, 25]])}" fill="#fff" opacity=".35"/>` +
        `<path d="${poly([[56.5, 33], [49, 54], [22, 57], [36, 44], [44, 34]])}" fill="#232838" opacity=".25"/>`,
    }) +
    `<path d="M30 14L27 25L33 31L29 41M33 31L42 35M44 22L46 28" fill="none" stroke="#252935" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,

  silence: (c) =>
    part(c, 'M9 15Q9 9 15 9H45Q51 9 51 15V36Q51 42 45 42H27L16.5 52L18.5 42H15Q9 42 9 36Z', { hi: '#f7efff', mid: '#c9b6ec', lo: '#8a6fc0', out: '#25124a' }, { sw: 3.2 }) +
    `<circle cx="19.5" cy="25.5" r="3.2" fill="#3c2470"/><circle cx="30" cy="25.5" r="3.2" fill="#3c2470"/><circle cx="40.5" cy="25.5" r="3.2" fill="#3c2470"/>` +
    `<circle cx="38" cy="38" r="17" fill="none" stroke="#3a0610" stroke-width="9"/><circle cx="38" cy="38" r="17" fill="none" stroke="#ff4040" stroke-width="5"/>` +
    `<path d="M26 26L50 50" stroke="#3a0610" stroke-width="9" stroke-linecap="round"/><path d="M26 26L50 50" stroke="#ff4040" stroke-width="5" stroke-linecap="round"/>`,

  burn: (c) =>
    part(c, FLAME_OUTER, PAL.orange, { gloss: 'M23 20C20 27 17 33 18 42C21 33 23 27 26 23Z', glossOp: 0.5 }) +
    part(c, FLAME_INNER, { hi: '#ffffff', mid: '#fff3a0', lo: '#ffc331', out: '#7a2a04' }, { sw: 2.4, shade: [-1.2, -1.4] }),

  poison: (c) =>
    part(c, DROP, PAL.lime, { gloss: 'M24 30C21 36 19.5 42 21 49C23 43 25 37 28 33Z', glossOp: 0.6 }) +
    `<circle cx="33" cy="44" r="5.5" fill="#3e8c1c" opacity=".55"/><circle cx="40" cy="36" r="3" fill="#3e8c1c" opacity=".5"/>` +
    part(c, circlePath(51, 14, 5), PAL.lime, { sw: 2.4, shade: [-0.8, -1] }) +
    part(c, circlePath(11.5, 22, 3.6), PAL.lime, { sw: 2.2, shade: [-0.6, -0.8] }),

  bleed: (c) =>
    part(c, 'M27 5C34 18 45 28 45 41C45 52 37 60 27 60C17 60 9 52 9 41C9 28 20 18 27 5Z', PAL.red, { gloss: 'M19 30C16 36 14.5 42 16 49C18 43 20 37 23 33Z', glossOp: 0.55 }) +
    part(c, 'M48.5 26C52 32 57 36 57 42C57 47.5 53 51 48.5 51C44 51 40 47.5 40 42C40 36 45 32 48.5 26Z', PAL.red, { sw: 3 }),

  'buff-up': (c) => part(c, 'M32 5L57 32H43V58H21V32H7Z', PAL.green, { gloss: 'M32 10L14 29.5H24V36H27V27H20Z', glossOp: 0.5 }),

  'buff-down': (c) => part(c, 'M32 59L57 32H43V6H21V32H7Z', PAL.red, { gloss: 'M24 10H28V33H22Z', glossOp: 0.45 }),

  // ---------------------------------------------------------------- stats
  hp: (c) => part(c, heartPath(32, 33, 27), PAL.red, { gloss: glossEllipse(19.5, 21, 7, 4.5, -40), glossOp: 0.7 }) + sparkle(47.5, 17, 5),

  atk: (c) =>
    part(c, starPath(32, 32, 9, 30, 17, 10), PAL.orange, { sw: 3, shade: [-1.5, -1.5] }) + sword(c, 45, 0.86),

  def: (c) =>
    part(c, SHIELD, PAL.steel, { gloss: 'M14 12H30L16 30Z', glossOp: 0.6 }) +
    part(c, 'M17 15H47V29.5C47 41.5 40 48.5 32 53C24 48.5 17 41.5 17 29.5Z', PAL.blue, { sw: 2.8, shade: [-1.6, -2] }) +
    part(c, circlePath(32, 31, 6), PAL.gold, { sw: 2.6, gloss: glossEllipse(30, 29, 2.5, 1.5), glossOp: 0.9 }),

  spd: (c) =>
    part(c, 'M7 42C13 23 31 10 57 7C53 13.5 49 17.5 43.5 20C49 20.5 53 22 55.5 24.5C49.5 28.5 43 30.5 37 31C41.5 32.5 45 34.5 47 37C39 41.5 30 43.5 21.5 43C17 47.5 10.5 49.5 7 42Z', PAL.cyan, {
      extra: '<path d="M14 40C22 30 34 22 50 12M20 41C28 37 36 33 44 24M24 42C32 40 38 37 42 33" fill="none" stroke="#0e7aa3" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>',
      gloss: 'M12 37C17 27 26 19 38 14C28 21 20 29 15 40Z',
      glossOp: 0.6,
    }) +
    `<path d="M4 52H22M9 58H30" stroke="#05384c" stroke-width="5" stroke-linecap="round"/><path d="M4 52H22M9 58H30" stroke="#8ff0ff" stroke-width="2.2" stroke-linecap="round"/>`,

  power: (c) =>
    part(c, softStarPath(32, 32, 10, 30.5, 20, 0.2), PAL.red, { shade: [-2, -2.5] }) +
    part(c, circlePath(32, 32, 16), PAL.orange, { sw: 2.8, shade: [-1.5, -2] }) +
    part(c, 'M35 15L23 34H31L28 49L41 29H33Z', { hi: '#ffffff', mid: '#fffbd8', lo: '#ffd64a', out: '#5a1d03' }, { sw: 2.6, shade: [-1, -1] }),

  // ---------------------------------------------------------------- ui glyphs
  star: (c) => part(c, softStarPath(32, 34, 5, 30, 14.5, 0.1), PAL.gold, { gloss: poly([[32, 9], [26, 25], [13, 26], [27, 28]]), glossOp: 0.55 }),

  'star-empty': (c) => part(c, softStarPath(32, 34, 5, 30, 14.5, 0.1), PAL.slate, { gloss: poly([[32, 9], [26, 25], [13, 26], [27, 28]]), glossOp: 0.18 }),

  lock: (c) =>
    tube('M21 30V21A11 11 0 0 1 43 21V30', PAL.steel, 5.5) +
    part(c, roundRect(11.5, 27, 41, 32, 7), PAL.gold, { gloss: roundRect(16, 30, 18, 4, 2), glossOp: 0.65 }) +
    `<path d="M32 36.5A4.5 4.5 0 0 1 34.2 45L35.5 52H28.5L29.8 45A4.5 4.5 0 0 1 32 36.5Z" fill="#4a2503"/>`,

  unlock: (c) =>
    tube('M43 30V17A11 11 0 0 0 21 17V20', PAL.steel, 5.5) +
    part(c, roundRect(11.5, 27, 41, 32, 7), PAL.gold, { gloss: roundRect(16, 30, 18, 4, 2), glossOp: 0.65 }) +
    `<path d="M32 36.5A4.5 4.5 0 0 1 34.2 45L35.5 52H28.5L29.8 45A4.5 4.5 0 0 1 32 36.5Z" fill="#4a2503"/>`,

  settings: (c) =>
    part(c, gearPath(32, 32, 8, 29.5, 22), PAL.steel, { gloss: glossEllipse(22, 19, 9, 4.5), glossOp: 0.6 }) +
    part(c, circlePath(32, 32, 9.5), PAL.slate, { sw: 3, shade: [1.5, 2] }),

  plus: (c) =>
    part(c, roundRect(6, 6, 52, 52, 12), PAL.green, { gloss: roundRect(11, 9.5, 42, 9, 4.5), glossOp: 0.5 }) +
    part(c, 'M27 14H37V27H50V37H37V50H27V37H14V27H27Z', PAL.white, { sw: 3, shade: [0, 1.5] }),

  close: (c) =>
    part(c, circlePath(32, 32, 28), PAL.red, { gloss: glossEllipse(22, 17, 11, 5.5, -25), glossOp: 0.5 }) +
    `<g transform="rotate(45 32 32)">${part(c, 'M27.5 13H36.5V27.5H51V36.5H36.5V51H27.5V36.5H13V27.5H27.5Z', PAL.white, { sw: 3, shade: [0, 0] })}</g>`,

  back: (c) => part(c, 'M5 32L30 7V21H55Q59 21 59 25V39Q59 43 55 43H30V57Z', PAL.gold, { gloss: 'M10 31.5L27 14.5V24H52V27H24V18Z', glossOp: 0.55 }),

  info: (c) =>
    part(c, circlePath(32, 32, 28), PAL.blue, { gloss: glossEllipse(22, 17, 11, 5.5, -25), glossOp: 0.5 }) +
    part(c, circlePath(32, 17.5, 5.2), PAL.white, { sw: 2.6, shade: [0, 0] }) +
    part(c, roundRect(26.5, 26, 11, 25, 3), PAL.white, { sw: 2.6, shade: [0, 0] }),

  speed: (c) => part(c, BOLT, PAL.gold, { gloss: 'M34 9L16 31.5H22Z', glossOp: 0.7 }),

  skip: (c) =>
    part(c, 'M6 12Q6 8 9.5 10L29 29Q32 32 29 35L9.5 54Q6 56 6 52Z', PAL.white, { shade: [-1, -1.5] }) +
    part(c, 'M27 12Q27 8 30.5 10L50 29Q53 32 50 35L30.5 54Q27 56 27 52Z', PAL.white, { shade: [-1, -1.5] }) +
    part(c, roundRect(50, 10, 8.5, 44, 3.5), PAL.white, { shade: [-1, -1.5] }),

  chest: (c) =>
    part(c, 'M7 29V25Q7 10 32 10Q57 10 57 25V29Z', PAL.wood, { gloss: 'M12 24Q13 15 28 13.5Q17 17 15 24Z', glossOp: 0.5 }) +
    part(c, roundRect(7, 29, 50, 28, 3), PAL.wood, { shade: [0, -2.5], extra: '<path d="M7 38H57" stroke="#7b4419" stroke-width="2" opacity=".7"/>' }) +
    part(c, 'M14 11.5Q16 10.8 20 10.4V57H14Z', PAL.gold, { sw: 2.8, shade: [-1, 0] }) +
    part(c, 'M44 10.4Q48 10.8 50 11.5V57H44Z', PAL.gold, { sw: 2.8, shade: [-1, 0] }) +
    part(c, roundRect(25, 24, 14, 16, 3), PAL.gold, { sw: 2.8, shade: [-1, -1.5] }) +
    `<path d="M32 28.5A3 3 0 0 1 33.6 34L34.5 37H29.5L30.4 34A3 3 0 0 1 32 28.5Z" fill="#4a2503"/>`,

  trophy: (c) =>
    tube('M16 15H9.5Q6.5 28 19 32M48 15H54.5Q57.5 28 45 32', PAL.gold, 3.6) +
    part(c, 'M15 8H49V21C49 35 41 41.5 32 42.5C23 41.5 15 35 15 21Z', PAL.gold, { gloss: 'M19 11H26C25 22 25 30 28 37C21 32 19 24 19 11Z', glossOp: 0.6 }) +
    part(c, 'M27.5 42H36.5V49H27.5Z', PAL.goldDeep, { sw: 3 }) +
    part(c, roundRect(17, 48.5, 30, 10.5, 3), PAL.wood, { shade: [0, -2] }) +
    `<path d="${softStarPath(32, 23, 5, 8.5, 4, 0.12)}" fill="#fffbe0" stroke="#b5620a" stroke-width="1.8"/>`,

  team: (c) =>
    part(c, 'M25 50C25 37 32 32 41 32C50 32 57 37 57 50Z', PAL.blue, { sw: 3.2 }) +
    part(c, circlePath(41, 20.5, 9.5), PAL.blue, { sw: 3.2, gloss: glossEllipse(37.5, 16.5, 4, 2.4), glossOp: 0.7 }) +
    part(c, 'M6 58C6 43 14 37.5 24 37.5C34 37.5 42 43 42 58Z', PAL.orange, { sw: 3.4 }) +
    part(c, circlePath(24, 25, 11), PAL.orange, { sw: 3.4, gloss: glossEllipse(20, 20, 4.6, 2.8), glossOp: 0.75 }),

  bag: (c) =>
    part(c, 'M21 24C9 32 7.5 58 32 58.5C56.5 58 55 32 43 24Z', PAL.leather, { gloss: 'M18 33C14 40 14 47 17 52C17 45 18.5 39 22 33Z', glossOp: 0.45 }) +
    part(c, 'M21.5 24L16 10.5Q25 15 32 11Q39 15 48 10.5L42.5 24Z', PAL.leather, { sw: 3.2, shade: [0, -2] }) +
    part(c, roundRect(19.5, 21, 25, 6.5, 3), PAL.gold, { sw: 3, shade: [0, -1.5] }) +
    part(c, circlePath(32, 42, 7.5), PAL.gold, { sw: 2.8, gloss: glossEllipse(29.5, 39.5, 3, 1.8), glossOp: 0.8 }),

  mail: (c) =>
    part(c, roundRect(5, 13, 54, 38, 5), PAL.parch, { shade: [0, -2], extra: '<path d="M6 50L25 32M58 50L39 32" stroke="#c99f62" stroke-width="2.4"/>' }) +
    part(c, 'M7.5 14.5H56.5L32 36Z', { hi: '#ffffff', mid: '#fff3d6', lo: '#d9b77a', out: '#523411' }, { sw: 3, shade: [0, -1.8] }) +
    part(c, circlePath(32, 35, 6.5), PAL.red, { sw: 2.6, gloss: glossEllipse(30, 33, 2.4, 1.5), glossOp: 0.8 }),

  chat: (c) =>
    part(c, 'M6 16Q6 8 14 8H50Q58 8 58 16V38Q58 46 50 46H30L16 57L19 46H14Q6 46 6 38Z', PAL.white, { gloss: roundRect(11, 11.5, 30, 5, 2.5), glossOp: 0.9 }) +
    `<circle cx="20" cy="27" r="4" fill="#2f78d6"/><circle cx="32" cy="27" r="4" fill="#2f78d6"/><circle cx="44" cy="27" r="4" fill="#2f78d6"/>`,

  quest: (c) =>
    part(c, 'M13 5H42L52 15V59H13Z', PAL.parch, { extra: '<path d="M19.5 16H34M19.5 24H40M19.5 32H32" stroke="#a87a3f" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>' }) +
    part(c, 'M42 5V15H52Z', { hi: '#ffffff', mid: '#fff6dc', lo: '#d7b77c', out: '#523411' }, { sw: 3, shade: [0, 0] }) +
    `<path d="M24 44L32 52L52 30" fill="none" stroke="#0d390b" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M24 44L32 52L52 30" fill="none" stroke="#5fd43c" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M24.5 43L32 50.5" fill="none" stroke="#e4ffb4" stroke-width="1.8" stroke-linecap="round"/>`,

  auto: (c) =>
    tube('M13 33A19 19 0 0 1 45 18', PAL.cyan, 6) +
    part(c, poly([[40, 9], [54, 19], [38, 26]]), PAL.cyan, { sw: 3, shade: [0, -1] }) +
    tube('M51 31A19 19 0 0 1 19 46', PAL.cyan, 6) +
    part(c, poly([[24, 55], [10, 45], [26, 38]]), PAL.cyan, { sw: 3, shade: [0, -1] }),

  swords: (c) => sword(c, 45, 0.98) + sword(c, -45, 0.98),
};

export const ICON_NAMES = Object.keys(ICON_BUILDERS) as IconName[];

/** Full standalone <svg> markup for an icon. `prefix` must be unique per instance on a page. */
export function iconMarkup(name: IconName, size: number, prefix: string): string {
  const build = ICON_BUILDERS[name];
  const ctx = new IconCtx(new Ids(prefix));
  const body = build(ctx);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" class="ae-icon ae-icon-${name}" aria-hidden="true" focusable="false"><defs>${ctx.defs.join('')}</defs>${body}</svg>`;
}

export const FACTION_ICON: Record<Faction, IconName> = {
  shadow: 'faction-shadow',
  fortress: 'faction-fortress',
  abyss: 'faction-abyss',
  forest: 'faction-forest',
  dark: 'faction-dark',
  light: 'faction-light',
};

/** Signature colors per faction (vfx tints, glows). */
export const FACTION_COLOR: Record<Faction, { core: string; glow: string; deep: string }> = {
  shadow: { core: '#f0dcff', glow: '#b066ff', deep: '#4b1a9c' },
  fortress: { core: '#e6f6ff', glow: '#4fb0ff', deep: '#163f8f' },
  abyss: { core: '#fff2b0', glow: '#ff6a2a', deep: '#9c1a0a' },
  forest: { core: '#f2ffd0', glow: '#6ee04a', deep: '#1f6e1a' },
  dark: { core: '#ffd0dc', glow: '#e0305a', deep: '#5a0a2a' },
  light: { core: '#ffffff', glow: '#ffd84a', deep: '#a8700a' },
};
