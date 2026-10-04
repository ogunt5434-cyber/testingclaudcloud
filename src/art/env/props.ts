// Painted prop kit for the battle backdrops and the town: faceted rocks, crystals, barrels,
// trees, columns, braziers… Pure string builders in a 1280x720 design space.
import {
  blurFilter,
  blobPath,
  Ids,
  linGrad,
  linGradU,
  makeRng,
  mix,
  n,
  poly,
  radGrad,
  radGradU,
  roundedPolyPath,
  scallopPath,
  smoothOpen,
  type Stop,
} from './kit';

/** Build context: collects <defs>, hands out unique ids and a seeded RNG. */
export class Art {
  readonly defs: string[] = [];
  private k = 0;
  private blurs = new Map<number, string>();
  readonly rand: () => number;
  constructor(
    readonly ids: Ids,
    seed: number,
  ) {
    this.rand = makeRng(seed);
  }
  uid(name: string): string {
    return this.ids.id(`${name}${(this.k++).toString(36)}`);
  }
  /** Linear gradient (bounding box units), returns `url(#…)`. */
  lin(list: readonly Stop[], x1 = 0, y1 = 0, x2 = 0, y2 = 1): string {
    const id = this.uid('l');
    this.defs.push(linGrad(id, list, x1, y1, x2, y2));
    return `url(#${id})`;
  }
  linU(list: readonly Stop[], x1: number, y1: number, x2: number, y2: number): string {
    const id = this.uid('lu');
    this.defs.push(linGradU(id, list, x1, y1, x2, y2));
    return `url(#${id})`;
  }
  rad(list: readonly Stop[], cx = 0.5, cy = 0.5, r = 0.5, fx?: number, fy?: number): string {
    const id = this.uid('r');
    this.defs.push(radGrad(id, list, cx, cy, r, fx, fy));
    return `url(#${id})`;
  }
  radU(list: readonly Stop[], cx: number, cy: number, r: number): string {
    const id = this.uid('ru');
    this.defs.push(radGradU(id, list, cx, cy, r));
    return `url(#${id})`;
  }
  /** Shared blur filter for a given radius. */
  blur(std: number): string {
    const hit = this.blurs.get(std);
    if (hit) return hit;
    const id = this.uid('b');
    this.defs.push(blurFilter(id, std));
    const url = `url(#${id})`;
    this.blurs.set(std, url);
    return url;
  }
  clip(d: string): string {
    const id = this.uid('c');
    this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return `url(#${id})`;
  }
  r(a: number, b: number): number {
    return a + (b - a) * this.rand();
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rand() * list.length) % list.length];
  }
}

type Pt = [number, number];

// ---------------------------------------------------------------------------
// Light & shadow helpers
// ---------------------------------------------------------------------------

/** Soft ambient-occlusion shadow on the ground. */
export function ao(a: Art, cx: number, cy: number, rx: number, ry: number, op = 0.45, color = '#000'): string {
  return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${color}" opacity="${op}" filter="${a.blur(Math.max(2, ry * 0.45))}" pointer-events="none"/>`;
}

/** Additive glow (screen blend, blurred ellipse with radial falloff). */
export function glow(a: Art, cx: number, cy: number, rx: number, ry: number, color: string, op = 0.6): string {
  const fill = a.rad([[0, color, 1], [0.45, color, 0.55], [1, color, 0]]);
  return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}" opacity="${op}" style="mix-blend-mode:screen" pointer-events="none"/>`;
}

export interface RockPal {
  light: string;
  mid: string;
  dark: string;
  line: string;
}

/** Chunky faceted cartoon rock sitting on `by`, lit from the top-left. */
export function rock(a: Art, cx: number, by: number, w: number, h: number, p: RockPal, o: { lw?: number; pts?: number; shadow?: boolean; tilt?: number } = {}): string {
  const k = o.pts ?? 7;
  const tilt = o.tilt ?? 0;
  const pts: Pt[] = [[cx - w / 2, by]];
  for (let i = 1; i < k; i++) {
    const t = i / k;
    const th = Math.PI + t * Math.PI;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const sx = Math.sign(c) * Math.pow(Math.abs(c), 0.75);
    const sy = Math.sign(s) * Math.pow(Math.abs(s), 0.55);
    const jx = 1 + (a.rand() - 0.5) * 0.22;
    const jy = 1 + (a.rand() - 0.5) * 0.4;
    pts.push([cx + ((sx * w) / 2) * jx + tilt * (1 - t) * h * 0.3, by + sy * h * jy]);
  }
  pts.push([cx + w / 2, by]);
  const ridge: Pt = [cx - w * 0.12 + (a.rand() - 0.5) * w * 0.12, by - h * (0.5 + a.rand() * 0.12)];
  let facets = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len;
    const ny = -dx / len;
    const lam = nx * -0.55 + ny * -0.83;
    const t = Math.max(0, Math.min(1, (lam + 0.55) / 1.5));
    const col = t > 0.5 ? mix(p.mid, p.light, (t - 0.5) * 2) : mix(p.dark, p.mid, t * 2);
    facets += `<path d="${poly([p1, p2, ridge])}" fill="${col}" stroke="${col}" stroke-width=".8" stroke-linejoin="round"/>`;
  }
  const front = mix(p.dark, p.mid, 0.5);
  facets += `<path d="${poly([pts[pts.length - 1], pts[0], ridge])}" fill="${front}" stroke="${front}" stroke-width=".8" stroke-linejoin="round"/>`;
  const outline = poly(pts);
  const lw = o.lw ?? Math.max(1.6, Math.min(4, w * 0.025));
  return (
    (o.shadow === false ? '' : ao(a, cx + w * 0.06, by, w * 0.58, Math.max(4, h * 0.12))) +
    facets +
    `<path d="${outline}" fill="none" stroke="${p.line}" stroke-width="${n(lw)}" stroke-linejoin="round"/>`
  );
}

export interface CrystalPal {
  light: string;
  mid: string;
  dark: string;
  line: string;
  glow: string;
}

/** One crystal spike from (x, by) of length `len`, rotated by `ang` degrees. */
export function crystal(x: number, by: number, len: number, wid: number, ang: number, p: CrystalPal, lw = 2): string {
  const w = wid / 2;
  const L = len;
  const left = poly([[-w, 0], [-w, -L * 0.74], [0, -L], [w * 0.12, -L * 0.72], [w * 0.12, 0]]);
  const right = poly([[w * 0.12, 0], [w * 0.12, -L * 0.72], [0, -L], [w, -L * 0.7], [w, 0]]);
  const tipL = poly([[-w, -L * 0.74], [0, -L], [w * 0.12, -L * 0.72], [-w * 0.2, -L * 0.78]]);
  const shine = poly([[-w * 0.7, -L * 0.1], [-w * 0.7, -L * 0.66], [-w * 0.35, -L * 0.72], [-w * 0.35, -L * 0.15]]);
  const outline = poly([[-w, 0], [-w, -L * 0.74], [0, -L], [w, -L * 0.7], [w, 0]]);
  return (
    `<g transform="translate(${n(x)} ${n(by)}) rotate(${n(ang)})">` +
    `<path d="${left}" fill="${p.mid}"/>` +
    `<path d="${right}" fill="${p.dark}"/>` +
    `<path d="${tipL}" fill="${p.light}" opacity=".9"/>` +
    `<path d="${shine}" fill="#fff" opacity=".42"/>` +
    `<path d="${outline}" fill="none" stroke="${p.line}" stroke-width="${n(lw)}" stroke-linejoin="round"/>` +
    `</g>`
  );
}

/** A cluster of crystals with a base glow, anchored on the ground at (x, by). */
export function crystalCluster(a: Art, x: number, by: number, s: number, p: CrystalPal, o: { count?: number; spread?: number; glowOp?: number; rocks?: RockPal } = {}): string {
  const count = o.count ?? 5;
  const spread = o.spread ?? 1;
  let out = glow(a, x, by - 40 * s, 120 * s, 90 * s, p.glow, o.glowOp ?? 0.5);
  out += ao(a, x, by, 70 * s * spread, 10 * s, 0.4);
  const items: { dx: number; len: number; wid: number; ang: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const center = 1 - Math.abs(t) * 1.3;
    items.push({
      dx: t * 70 * s * spread + a.r(-6, 6) * s,
      len: (55 + 65 * center + a.r(-10, 10)) * s,
      wid: (20 + 10 * center) * s,
      ang: t * 70 + a.r(-8, 8),
    });
  }
  // Back crystals first (outer ones), center last so it sits in front.
  items.sort((p1, p2) => Math.abs(p2.dx) - Math.abs(p1.dx));
  for (const it of items) out += crystal(x + it.dx, by + 4 * s, it.len, it.wid, it.ang, p, Math.max(1.4, 2.2 * s));
  if (o.rocks) {
    out += rock(a, x - 34 * s * spread, by + 6 * s, 50 * s, 22 * s, o.rocks, { shadow: false });
    out += rock(a, x + 30 * s * spread, by + 8 * s, 42 * s, 18 * s, o.rocks, { shadow: false });
  }
  return out;
}

/** Wooden barrel standing on (x, by). Optional glowing goo spilling from the top. */
export function barrel(a: Art, x: number, by: number, s: number, o: { goo?: string; wood?: [string, string, string]; band?: string } = {}): string {
  const [wl, wm, wd] = o.wood ?? ['#c98a52', '#8f5a30', '#4f2c14'];
  const band = o.band ?? '#3d3a45';
  const W = 34 * s;
  const H = 92 * s;
  const B = 6 * s; // bulge
  const body = `M${n(x - W)} ${n(by)}Q${n(x - W - B * 2)} ${n(by - H / 2)} ${n(x - W)} ${n(by - H)}H${n(x + W)}Q${n(x + W + B * 2)} ${n(by - H / 2)} ${n(x + W)} ${n(by)}Z`;
  const fill = a.lin([[0, wd], [0.22, wm], [0.4, wl], [0.62, wm], [1, wd]], 0, 0, 1, 0);
  let staves = '';
  for (const k of [-0.6, -0.2, 0.2, 0.6]) {
    const sx = x + k * W;
    staves += `<path d="M${n(sx)} ${n(by)}Q${n(x + k * (W + B * 2))} ${n(by - H / 2)} ${n(sx)} ${n(by - H)}" fill="none" stroke="${wd}" stroke-width="${n(1.6 * s)}" opacity=".55"/>`;
  }
  const bandAt = (yy: number): string => {
    const bulge = Math.sin((Math.abs(by - yy) / H) * Math.PI) * B * 1.6;
    const ww = W + bulge;
    return (
      `<path d="M${n(x - ww)} ${n(yy)}Q${n(x)} ${n(yy + 5 * s)} ${n(x + ww)} ${n(yy)}" fill="none" stroke="${band}" stroke-width="${n(7 * s)}"/>` +
      `<path d="M${n(x - ww)} ${n(yy - 2 * s)}Q${n(x)} ${n(yy + 3 * s)} ${n(x + ww)} ${n(yy - 2 * s)}" fill="none" stroke="#9aa0b3" stroke-width="${n(1.6 * s)}" opacity=".7"/>`
    );
  };
  let goo = '';
  if (o.goo) {
    const g = o.goo;
    goo =
      glow(a, x, by - H - 4 * s, 70 * s, 40 * s, g, 0.55) +
      `<path d="M${n(x - W - 2 * s)} ${n(by - H + 2 * s)}Q${n(x - W)} ${n(by - H - 14 * s)} ${n(x - 12 * s)} ${n(by - H - 16 * s)}Q${n(x + 4 * s)} ${n(by - H - 24 * s)} ${n(x + 16 * s)} ${n(by - H - 14 * s)}Q${n(x + W + 4 * s)} ${n(by - H - 12 * s)} ${n(x + W + 2 * s)} ${n(by - H + 2 * s)}` +
      `L${n(x + W - 2 * s)} ${n(by - H + 14 * s)}Q${n(x + W - 6 * s)} ${n(by - H + 22 * s)} ${n(x + W - 10 * s)} ${n(by - H + 12 * s)}L${n(x - 6 * s)} ${n(by - H + 6 * s)}Q${n(x - 14 * s)} ${n(by - H + 26 * s)} ${n(x - 20 * s)} ${n(by - H + 8 * s)}Z" fill="${g}" stroke="${mix(g, '#000000', 0.55)}" stroke-width="${n(2 * s)}" stroke-linejoin="round"/>` +
      `<ellipse cx="${n(x - 6 * s)}" cy="${n(by - H - 12 * s)}" rx="${n(10 * s)}" ry="${n(4 * s)}" fill="#fff" opacity=".5"/>`;
  }
  return (
    ao(a, x + 4 * s, by, W * 1.5, 9 * s) +
    `<path d="${body}" fill="${fill}"/>` +
    staves +
    bandAt(by - H * 0.2) +
    bandAt(by - H * 0.8) +
    `<ellipse cx="${n(x)}" cy="${n(by - H)}" rx="${n(W)}" ry="${n(8 * s)}" fill="${wd}" stroke="#24120a" stroke-width="${n(2.2 * s)}"/>` +
    `<ellipse cx="${n(x)}" cy="${n(by - H + 1 * s)}" rx="${n(W - 6 * s)}" ry="${n(5 * s)}" fill="${wm}" opacity=".6"/>` +
    `<path d="${body}" fill="none" stroke="#24120a" stroke-width="${n(2.4 * s)}" stroke-linejoin="round"/>` +
    goo
  );
}

/** Wooden crate (front + top + side faces). */
export function crate(a: Art, x: number, by: number, s: number, wood: [string, string, string] = ['#c98a52', '#8f5a30', '#4f2c14']): string {
  const [wl, wm, wd] = wood;
  const S = 60 * s;
  const D = 16 * s;
  const front = poly([[x - S / 2, by], [x - S / 2, by - S], [x + S / 2, by - S], [x + S / 2, by]]);
  const top = poly([[x - S / 2, by - S], [x - S / 2 + D, by - S - D * 0.7], [x + S / 2 + D, by - S - D * 0.7], [x + S / 2, by - S]]);
  const side = poly([[x + S / 2, by], [x + S / 2, by - S], [x + S / 2 + D, by - S - D * 0.7], [x + S / 2 + D, by - D * 0.7]]);
  const plank = `stroke="${wd}" stroke-width="${n(1.6 * s)}" opacity=".6"`;
  return (
    ao(a, x + D / 2, by, S * 0.75, 8 * s) +
    `<path d="${front}" fill="${wm}"/><path d="${top}" fill="${wl}"/><path d="${side}" fill="${wd}"/>` +
    `<path d="M${n(x - S / 2)} ${n(by - S / 3)}H${n(x + S / 2)}M${n(x - S / 2)} ${n(by - (2 * S) / 3)}H${n(x + S / 2)}" ${plank}/>` +
    `<path d="M${n(x - S / 2 + 5 * s)} ${n(by - 5 * s)}L${n(x + S / 2 - 5 * s)} ${n(by - S + 5 * s)}" stroke="${wl}" stroke-width="${n(7 * s)}"/>` +
    `<path d="M${n(x - S / 2 + 5 * s)} ${n(by - 5 * s)}L${n(x + S / 2 - 5 * s)} ${n(by - S + 5 * s)}" stroke="${wd}" stroke-width="${n(1.4 * s)}" opacity=".5" transform="translate(0 ${n(3 * s)})"/>` +
    `<path d="${front}" fill="none" stroke="#24120a" stroke-width="${n(2.2 * s)}" stroke-linejoin="round"/>` +
    `<path d="${top}" fill="none" stroke="#24120a" stroke-width="${n(2.2 * s)}" stroke-linejoin="round"/>` +
    `<path d="${side}" fill="none" stroke="#24120a" stroke-width="${n(2.2 * s)}" stroke-linejoin="round"/>`
  );
}

/** Mushroom (optionally glowing). */
export function mushroom(a: Art, x: number, by: number, s: number, cap: [string, string, string], o: { glow?: string; spots?: boolean; lean?: number } = {}): string {
  const lean = (o.lean ?? 0) * s;
  const [cl, cm, cd] = cap;
  const stem = `M${n(x - 7 * s)} ${n(by)}Q${n(x - 9 * s + lean / 2)} ${n(by - 20 * s)} ${n(x - 6 * s + lean)} ${n(by - 34 * s)}H${n(x + 6 * s + lean)}Q${n(x + 9 * s + lean / 2)} ${n(by - 20 * s)} ${n(x + 7 * s)} ${n(by)}Z`;
  const capD = `M${n(x - 30 * s + lean)} ${n(by - 30 * s)}Q${n(x - 28 * s + lean)} ${n(by - 64 * s)} ${n(x + lean)} ${n(by - 64 * s)}Q${n(x + 28 * s + lean)} ${n(by - 64 * s)} ${n(x + 30 * s + lean)} ${n(by - 30 * s)}Q${n(x + lean)} ${n(by - 22 * s)} ${n(x - 30 * s + lean)} ${n(by - 30 * s)}Z`;
  const fill = a.lin([[0, cl], [0.55, cm], [1, cd]]);
  let spots = '';
  if (o.spots !== false) {
    spots =
      `<ellipse cx="${n(x - 12 * s + lean)}" cy="${n(by - 48 * s)}" rx="${n(5 * s)}" ry="${n(3.6 * s)}" fill="#fff" opacity=".85"/>` +
      `<ellipse cx="${n(x + 9 * s + lean)}" cy="${n(by - 54 * s)}" rx="${n(4 * s)}" ry="${n(3 * s)}" fill="#fff" opacity=".85"/>` +
      `<ellipse cx="${n(x + 17 * s + lean)}" cy="${n(by - 40 * s)}" rx="${n(3 * s)}" ry="${n(2.2 * s)}" fill="#fff" opacity=".75"/>`;
  }
  return (
    (o.glow ? glow(a, x + lean, by - 40 * s, 60 * s, 46 * s, o.glow, 0.55) : '') +
    ao(a, x, by, 22 * s, 4 * s, 0.4) +
    `<path d="${stem}" fill="#f1e6cf" stroke="#3b2a1c" stroke-width="${n(2 * s)}"/>` +
    `<path d="${capD}" fill="${fill}" stroke="${mix(cd, '#000000', 0.55)}" stroke-width="${n(2.2 * s)}" stroke-linejoin="round"/>` +
    spots +
    `<path d="M${n(x - 20 * s + lean)} ${n(by - 50 * s)}Q${n(x - 12 * s + lean)} ${n(by - 60 * s)} ${n(x + lean)} ${n(by - 60 * s)}" fill="none" stroke="#fff" stroke-width="${n(3 * s)}" stroke-linecap="round" opacity=".45"/>`
  );
}

/** Downward rock spike hanging from y0. */
export function stalactite(x: number, y0: number, len: number, w: number, p: RockPal, bend = 0): string {
  const tip: Pt = [x + bend, y0 + len];
  const left = poly([[x - w / 2, y0], [x - w * 0.05, y0], [x + bend * 0.6 - w * 0.04, y0 + len * 0.6], tip, [x - w * 0.3 + bend * 0.3, y0 + len * 0.45]]);
  const right = poly([[x - w * 0.05, y0], [x + w / 2, y0], [x + w * 0.28 + bend * 0.4, y0 + len * 0.5], tip, [x + bend * 0.6 - w * 0.04, y0 + len * 0.6]]);
  const outline = poly([[x - w / 2, y0], [x + w / 2, y0], [x + w * 0.28 + bend * 0.4, y0 + len * 0.5], tip, [x - w * 0.3 + bend * 0.3, y0 + len * 0.45]]);
  return `<path d="${left}" fill="${p.mid}"/><path d="${right}" fill="${p.dark}"/><path d="${outline}" fill="none" stroke="${p.line}" stroke-width="2" stroke-linejoin="round"/>`;
}

/** Perspective flagstones over a ground band [y0, y1]. Stones get bigger toward the viewer. */
export function flagstones(a: Art, y0: number, y1: number, x0: number, x1: number, colors: { base: string; light: string; edge: string }, o: { density?: number; skip?: number; jitter?: number } = {}): string {
  let out = '';
  let y = y0;
  const skip = o.skip ?? 0.18;
  while (y < y1) {
    const t = (y - y0) / (y1 - y0);
    const rowH = 14 + (y - y0) * 0.17;
    const stoneW = rowH * (2.2 + a.rand() * 0.6) * (o.density ?? 1);
    let x = x0 - a.rand() * stoneW;
    while (x < x1) {
      const w = stoneW * (0.65 + a.rand() * 0.7);
      if (a.rand() > skip) {
        const cx = x + w / 2;
        const cy = y + rowH / 2;
        const rx = w * 0.43;
        const ry = rowH * 0.38;
        const col = mix(colors.base, colors.light, 0.15 + a.rand() * 0.55 * (0.5 + t));
        const d = blobPath(a.rand, cx, cy, rx, ry, 8, o.jitter ?? 0.16);
        out += `<path d="${d}" fill="${col}" stroke="${colors.edge}" stroke-width="${n(1 + t * 1.6)}" stroke-opacity=".55"/>`;
        // top lip highlight
        out += `<path d="M${n(cx - rx * 0.7)} ${n(cy - ry * 0.55)}Q${n(cx)} ${n(cy - ry * 1.05)} ${n(cx + rx * 0.6)} ${n(cy - ry * 0.6)}" fill="none" stroke="${colors.light}" stroke-width="${n(1 + t * 2)}" stroke-linecap="round" opacity=".45"/>`;
      }
      x += w;
    }
    y += rowH;
  }
  return out;
}

/** Thin branching ground cracks. */
export function cracks(a: Art, count: number, y0: number, y1: number, x0: number, x1: number, color: string, op = 0.55): string {
  let d = '';
  for (let i = 0; i < count; i++) {
    let x = a.r(x0, x1);
    let y = a.r(y0, y1);
    const t = (y - y0) / (y1 - y0);
    const seg = 3 + Math.floor(a.rand() * 3);
    d += `M${n(x)} ${n(y)}`;
    const dir = a.rand() < 0.5 ? -1 : 1;
    for (let k = 0; k < seg; k++) {
      x += dir * a.r(10, 28) * (0.6 + t);
      y += a.r(-6, 6) * (0.6 + t);
      d += `L${n(x)} ${n(y)}`;
      if (a.rand() < 0.35) d += `M${n(x)} ${n(y)}l${n(a.r(-10, 10))} ${n(a.r(4, 12))}M${n(x)} ${n(y)}`;
    }
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
}

/** Grass tuft of a few curved blades. */
export function grassTuft(a: Art, x: number, by: number, s: number, cols: [string, string], line = '#1d3a12'): string {
  let blades = '';
  const count = 4 + Math.floor(a.rand() * 3);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1) - 0.5;
    const h = (18 + a.rand() * 16) * s * (1 - Math.abs(t) * 0.6);
    const lean = t * 26 * s + a.r(-4, 4) * s;
    const bx = x + t * 14 * s;
    const col = i % 2 === 0 ? cols[0] : cols[1];
    blades += `<path d="M${n(bx - 3 * s)} ${n(by)}Q${n(bx + lean * 0.3)} ${n(by - h * 0.6)} ${n(bx + lean)} ${n(by - h)}Q${n(bx + lean * 0.2 + 2 * s)} ${n(by - h * 0.5)} ${n(bx + 3 * s)} ${n(by)}Z" fill="${col}" stroke="${line}" stroke-width="${n(1.2 * s)}" stroke-linejoin="round"/>`;
  }
  return blades;
}

/** Fern / leafy plant made of leaf fans. */
export function fern(a: Art, x: number, by: number, s: number, cols: [string, string, string], line = '#0f2a10', mirror = false): string {
  let out = '';
  const fronds = 5;
  for (let i = 0; i < fronds; i++) {
    const t = i / (fronds - 1) - 0.5;
    const ang = (mirror ? -1 : 1) * (t * 110) * (Math.PI / 180);
    const len = (70 + a.rand() * 30) * s * (1 - Math.abs(t) * 0.35);
    const ex = x + Math.sin(ang) * len;
    const ey = by - Math.cos(ang) * len * 0.85;
    const cx = x + Math.sin(ang) * len * 0.5 - Math.cos(ang) * 12 * s;
    const cy = by - Math.cos(ang) * len * 0.6 - 10 * s;
    const col = cols[i % 3];
    // leaf: a curved lens
    out += `<path d="M${n(x)} ${n(by)}Q${n(cx - 14 * s)} ${n(cy - 4 * s)} ${n(ex)} ${n(ey)}Q${n(cx + 14 * s)} ${n(cy + 10 * s)} ${n(x)} ${n(by)}Z" fill="${col}" stroke="${line}" stroke-width="${n(1.6 * s)}" stroke-linejoin="round"/>`;
    out += `<path d="M${n(x)} ${n(by)}Q${n(cx)} ${n(cy + 2 * s)} ${n(ex)} ${n(ey)}" fill="none" stroke="${line}" stroke-width="${n(1.1 * s)}" opacity=".6"/>`;
  }
  return out;
}

/** Cartoon foliage clump: scalloped dark base, lighter inner clump and a sunlit top. */
export function foliage(a: Art, cx: number, cy: number, rx: number, ry: number, cols: readonly [string, string, string], line: string, o: { lw?: number; count?: number; details?: boolean } = {}): string {
  const [cl, cm, cd] = cols;
  const base = scallopPath(a.rand, cx, cy, rx, ry, o.count ?? 11, 0.62, 0.1);
  const mid = scallopPath(a.rand, cx - rx * 0.1, cy - ry * 0.16, rx * 0.8, ry * 0.7, 9, 0.62, 0.12);
  const hi = scallopPath(a.rand, cx - rx * 0.3, cy - ry * 0.38, rx * 0.42, ry * 0.32, 7, 0.62, 0.15);
  let details = '';
  if (o.details !== false) {
    for (let i = 0; i < 4; i++) {
      const dx = cx + a.r(-0.55, 0.45) * rx;
      const dy = cy + a.r(-0.2, 0.5) * ry;
      const r = Math.min(rx, ry) * a.r(0.12, 0.2);
      details += `<path d="M${n(dx - r)} ${n(dy)}A${n(r)} ${n(r * 0.8)} 0 0 1 ${n(dx + r)} ${n(dy)}" fill="none" stroke="${cd}" stroke-width="${n(Math.max(1.2, r * 0.22))}" stroke-linecap="round" opacity=".7"/>`;
    }
  }
  const lw = o.lw ?? Math.max(1.6, Math.min(3.2, rx * 0.04));
  return (
    `<path d="${base}" fill="${cd}"/>` +
    `<g clip-path="${a.clip(base)}"><path d="${mid}" fill="${cm}"/><path d="${hi}" fill="${cl}" opacity=".95"/>${details}</g>` +
    `<path d="${base}" fill="none" stroke="${line}" stroke-width="${n(lw)}" stroke-linejoin="round"/>`
  );
}

/** Cartoon round tree: trunk + layered scalloped foliage. */
export function roundTree(a: Art, x: number, by: number, s: number, leaf: [string, string, string], o: { trunk?: [string, string]; line?: string; shadow?: boolean } = {}): string {
  const [tl, td] = o.trunk ?? ['#9a6438', '#5a361a'];
  const line = o.line ?? '#1b3312';
  const trunk = `M${n(x - 10 * s)} ${n(by)}Q${n(x - 6 * s)} ${n(by - 30 * s)} ${n(x - 7 * s)} ${n(by - 70 * s)}H${n(x + 7 * s)}Q${n(x + 6 * s)} ${n(by - 30 * s)} ${n(x + 10 * s)} ${n(by)}Z`;
  const back: [string, string, string] = [leaf[1], leaf[2], mix(leaf[2], '#000000', 0.25)];
  return (
    (o.shadow === false ? '' : ao(a, x + 12 * s, by, 50 * s, 9 * s, 0.35)) +
    `<path d="${trunk}" fill="${a.lin([[0, td], [0.35, tl], [1, td]], 0, 0, 1, 0)}" stroke="${line}" stroke-width="${n(2 * s)}"/>` +
    foliage(a, x - 30 * s, by - 74 * s, 32 * s, 26 * s, back, line, { details: false }) +
    foliage(a, x + 32 * s, by - 80 * s, 30 * s, 25 * s, back, line, { details: false }) +
    foliage(a, x, by - 104 * s, 54 * s, 46 * s, leaf, line)
  );
}

/** Conifer (layered triangles). */
export function pineTree(x: number, by: number, s: number, cols: [string, string], line: string, trunk = '#5a361a'): string {
  const [cl, cd] = cols;
  let out = `<rect x="${n(x - 5 * s)}" y="${n(by - 26 * s)}" width="${n(10 * s)}" height="${n(26 * s)}" fill="${trunk}" stroke="${line}" stroke-width="${n(1.6 * s)}"/>`;
  for (let i = 0; i < 3; i++) {
    const w = (44 - i * 9) * s;
    const top = by - (70 + i * 30) * s;
    const bot = by - (18 + i * 30) * s;
    out += `<path d="M${n(x)} ${n(top)}L${n(x + w)} ${n(bot)}Q${n(x)} ${n(bot + 8 * s)} ${n(x - w)} ${n(bot)}Z" fill="${cd}" stroke="${line}" stroke-width="${n(1.8 * s)}" stroke-linejoin="round"/>`;
    out += `<path d="M${n(x)} ${n(top)}L${n(x - w)} ${n(bot)}Q${n(x - w * 0.4)} ${n(bot + 5 * s)} ${n(x - 2 * s)} ${n(bot + 4 * s)}Z" fill="${cl}"/>`;
  }
  return out;
}

/** Fluted stone column (optionally broken at the top). */
export function column(a: Art, x: number, by: number, w: number, h: number, p: { light: string; mid: string; dark: string; line: string }, o: { broken?: boolean; capital?: boolean } = {}): string {
  const half = w / 2;
  const top = by - h;
  const k = w / 60;
  const fill = a.lin([[0, p.dark], [0.25, p.mid], [0.45, p.light], [0.75, p.mid], [1, p.dark]], 0, 0, 1, 0);
  const topEdge = o.broken
    ? `L${n(x + half * 0.92)} ${n(top + a.r(-6, 14) * k)}L${n(x + half * 0.4)} ${n(top + a.r(-16, 4) * k)}L${n(x + half * 0.05)} ${n(top + a.r(6, 18) * k)}L${n(x - half * 0.35)} ${n(top + a.r(-12, 2) * k)}L${n(x - half * 0.92)} ${n(top + a.r(2, 14) * k)}`
    : `L${n(x + half * 0.92)} ${n(top)}H${n(x - half * 0.92)}`;
  const shaft = `M${n(x - half)} ${n(by)}H${n(x + half)}${topEdge}Z`;
  let flutes = '';
  for (const f of [-0.55, -0.18, 0.18, 0.55]) {
    flutes += `<path d="M${n(x + f * half)} ${n(by - 4)}V${n(top + (o.broken ? 22 * k : 6))}" stroke="${p.dark}" stroke-width="${n(Math.max(1.4, w * 0.05))}" opacity=".45" stroke-linecap="round"/>`;
  }
  let out = ao(a, x + w * 0.2, by, w * 0.9, w * 0.14, 0.45);
  out += `<path d="${shaft}" fill="${fill}" stroke="${p.line}" stroke-width="2.4" stroke-linejoin="round"/>` + flutes;
  out += `<path d="M${n(x - half * 1.25)} ${n(by)}V${n(by - w * 0.22)}H${n(x + half * 1.25)}V${n(by)}Z" fill="${a.lin([[0, p.light], [1, p.dark]])}" stroke="${p.line}" stroke-width="2.4"/>`;
  if (o.capital && !o.broken) {
    out += `<path d="M${n(x - half * 1.35)} ${n(top)}V${n(top - w * 0.18)}H${n(x + half * 1.35)}V${n(top)}Z" fill="${a.lin([[0, p.light], [1, p.mid]])}" stroke="${p.line}" stroke-width="2.4"/>`;
    out += `<path d="M${n(x - half * 1.1)} ${n(top + w * 0.12)}H${n(x + half * 1.1)}" stroke="${p.line}" stroke-width="2" opacity=".5"/>`;
  }
  return out;
}

/** Brazier with a flame (glow is drawn separately so it can pulse). */
export function brazier(a: Art, x: number, by: number, s: number, flame: [string, string, string] = ['#fff6c0', '#ffb43a', '#e2420f']): string {
  const [fl, fm, fd] = flame;
  const metal = a.lin([[0, '#8d8a99'], [0.5, '#4a4756'], [1, '#26232f']]);
  return (
    ao(a, x, by, 26 * s, 5 * s, 0.5) +
    `<path d="M${n(x - 16 * s)} ${n(by)}L${n(x - 6 * s)} ${n(by - 34 * s)}M${n(x + 16 * s)} ${n(by)}L${n(x + 6 * s)} ${n(by - 34 * s)}M${n(x)} ${n(by)}V${n(by - 34 * s)}" stroke="#1d1a24" stroke-width="${n(4.5 * s)}" stroke-linecap="round"/>` +
    `<path d="M${n(x - 24 * s)} ${n(by - 44 * s)}Q${n(x)} ${n(by - 18 * s)} ${n(x + 24 * s)} ${n(by - 44 * s)}Z" fill="${metal}" stroke="#15131b" stroke-width="${n(2.2 * s)}" stroke-linejoin="round"/>` +
    `<path d="M${n(x - 18 * s)} ${n(by - 44 * s)}C${n(x - 22 * s)} ${n(by - 62 * s)} ${n(x - 6 * s)} ${n(by - 70 * s)} ${n(x - 2 * s)} ${n(by - 92 * s)}C${n(x + 4 * s)} ${n(by - 76 * s)} ${n(x + 14 * s)} ${n(by - 74 * s)} ${n(x + 12 * s)} ${n(by - 82 * s)}C${n(x + 24 * s)} ${n(by - 66 * s)} ${n(x + 20 * s)} ${n(by - 52 * s)} ${n(x + 18 * s)} ${n(by - 44 * s)}Z" fill="${fd}"/>` +
    `<path d="M${n(x - 11 * s)} ${n(by - 44 * s)}C${n(x - 13 * s)} ${n(by - 58 * s)} ${n(x - 2 * s)} ${n(by - 62 * s)} ${n(x)} ${n(by - 76 * s)}C${n(x + 6 * s)} ${n(by - 62 * s)} ${n(x + 14 * s)} ${n(by - 56 * s)} ${n(x + 11 * s)} ${n(by - 44 * s)}Z" fill="${fm}"/>` +
    `<path d="M${n(x - 5 * s)} ${n(by - 44 * s)}C${n(x - 6 * s)} ${n(by - 52 * s)} ${n(x)} ${n(by - 56 * s)} ${n(x + 1 * s)} ${n(by - 62 * s)}C${n(x + 4 * s)} ${n(by - 54 * s)} ${n(x + 7 * s)} ${n(by - 50 * s)} ${n(x + 5 * s)} ${n(by - 44 * s)}Z" fill="${fl}"/>` +
    `<path d="M${n(x - 24 * s)} ${n(by - 44 * s)}H${n(x + 24 * s)}" stroke="#15131b" stroke-width="${n(2.6 * s)}" stroke-linecap="round"/>`
  );
}

/** Hanging cloth banner with a simple original emblem. */
export function banner(a: Art, x: number, y: number, w: number, h: number, cloth: [string, string], trim: string, emblem: 'moon' | 'tower' | 'rune' | 'sun' = 'rune'): string {
  const [cl, cd] = cloth;
  const fill = a.lin([[0, cd], [0.3, cl], [0.7, cl], [1, cd]], 0, 0, 1, 0);
  const tail = `M${n(x - w / 2)} ${n(y)}H${n(x + w / 2)}V${n(y + h)}L${n(x)} ${n(y + h - w * 0.35)}L${n(x - w / 2)} ${n(y + h)}Z`;
  let mark = '';
  const cx = x;
  const cy = y + h * 0.42;
  const r = w * 0.26;
  if (emblem === 'moon') mark = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${trim}"/><circle cx="${n(cx + r * 0.45)}" cy="${n(cy - r * 0.3)}" r="${n(r * 0.85)}" fill="${cl}"/>`;
  else if (emblem === 'sun') mark = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.75)}" fill="${trim}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 1.15)}" fill="none" stroke="${trim}" stroke-width="${n(r * 0.18)}" stroke-dasharray="${n(r * 0.3)} ${n(r * 0.3)}"/>`;
  else if (emblem === 'tower') mark = `<path d="M${n(cx - r * 0.7)} ${n(cy + r)}V${n(cy - r * 0.5)}H${n(cx - r * 0.35)}V${n(cy - r * 0.2)}H${n(cx - r * 0.1)}V${n(cy - r * 0.5)}H${n(cx + r * 0.1)}V${n(cy - r * 0.2)}H${n(cx + r * 0.35)}V${n(cy - r * 0.5)}H${n(cx + r * 0.7)}V${n(cy + r)}Z" fill="${trim}"/>`;
  else mark = `<path d="M${n(cx)} ${n(cy - r)}L${n(cx + r * 0.8)} ${n(cy)}L${n(cx)} ${n(cy + r)}L${n(cx - r * 0.8)} ${n(cy)}Z" fill="none" stroke="${trim}" stroke-width="${n(r * 0.25)}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.25)}" fill="${trim}"/>`;
  return (
    `<path d="${tail}" fill="${fill}" stroke="#1a0f1c" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M${n(x - w / 2 + 4)} ${n(y + 6)}V${n(y + h - 8)}M${n(x + w / 2 - 4)} ${n(y + 6)}V${n(y + h - 8)}" stroke="${trim}" stroke-width="2" opacity=".85"/>` +
    mark +
    `<rect x="${n(x - w / 2 - 6)}" y="${n(y - 5)}" width="${n(w + 12)}" height="8" rx="4" fill="#5a3a1a" stroke="#1a0f1c" stroke-width="2"/>`
  );
}

/** Smooth organic root / branch silhouette (thick tapered curve). */
export function root(pts: readonly Pt[], w0: number, w1: number, fill: string, line: string): string {
  // Build a tapered ribbon around the polyline.
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[Math.min(pts.length - 1, i + 1)];
    const o = pts[Math.max(0, i - 1)];
    const dx = q[0] - o[0];
    const dy = q[1] - o[1];
    const len = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    left.push([p[0] - (dy / len) * w, p[1] + (dx / len) * w]);
    right.push([p[0] + (dy / len) * w, p[1] - (dx / len) * w]);
  }
  const d = `${smoothOpen(left)}L${n(right[right.length - 1][0])} ${n(right[right.length - 1][1])}${smoothOpen([...right].reverse()).replace(/^M[^C]+/, '')}Z`;
  return `<path d="${d}" fill="${fill}" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/>`;
}

/** Cloud made of puffs with a lit top (for skies). */
export function cloud(x: number, y: number, s: number, cols: [string, string, string], line?: string): string {
  const [cl, cm, cd] = cols;
  const puffs: [number, number, number][] = [
    [-60, 6, 26],
    [-30, -10, 34],
    [8, -22, 40],
    [46, -6, 30],
    [74, 8, 22],
  ];
  let shape = '';
  for (const [dx, dy, r] of puffs) shape += `<circle cx="${n(x + dx * s)}" cy="${n(y + dy * s)}" r="${n(r * s)}"/>`;
  shape += `<rect x="${n(x - 70 * s)}" y="${n(y)}" width="${n(150 * s)}" height="${n(26 * s)}" rx="${n(13 * s)}"/>`;
  let hi = '';
  for (const [dx, dy, r] of puffs) hi += `<circle cx="${n(x + (dx - r * 0.18) * s)}" cy="${n(y + (dy - r * 0.22) * s)}" r="${n(r * 0.74 * s)}" fill="${cl}"/>`;
  return (
    (line ? `<g fill="${line}" stroke="${line}" stroke-width="${n(5 * s)}">${shape}</g>` : '') +
    `<g fill="${cd}">${shape}</g>` +
    `<g fill="${cm}" transform="translate(${n(-3 * s)} ${n(-5 * s)})">${shape}</g>` +
    hi
  );
}

/** Soft light shaft (screen-blended, blurred trapezoid). */
export function lightShaft(a: Art, x: number, y: number, topW: number, botW: number, len: number, ang: number, color: string, op = 0.25): string {
  const d = poly([[-topW / 2, 0], [topW / 2, 0], [botW / 2, len], [-botW / 2, len]]);
  const fill = a.lin([[0, color, 0.9], [1, color, 0]]);
  return `<path d="${d}" transform="translate(${n(x)} ${n(y)}) rotate(${n(ang)})" fill="${fill}" opacity="${op}" filter="${a.blur(8)}" style="mix-blend-mode:screen"/>`;
}

/** Scatter of small pebbles. */
export function pebbles(a: Art, count: number, y0: number, y1: number, x0: number, x1: number, cols: [string, string], line: string): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    const y = a.r(y0, y1);
    const t = (y - y0) / Math.max(1, y1 - y0);
    const x = a.r(x0, x1);
    const r = (2.5 + a.rand() * 4) * (0.6 + t * 0.9);
    out += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r * 1.4)}" ry="${n(r)}" fill="${cols[1]}" stroke="${line}" stroke-width="1"/>`;
    out += `<ellipse cx="${n(x - r * 0.3)}" cy="${n(y - r * 0.35)}" rx="${n(r * 0.7)}" ry="${n(r * 0.4)}" fill="${cols[0]}"/>`;
  }
  return out;
}

/** Simple smooth blob with outline, used for bushes and moss. */
export function bush(a: Art, x: number, by: number, s: number, cols: [string, string, string], line: string): string {
  const [cl, cm, cd] = cols;
  const base = blobPath(a.rand, x, by - 22 * s, 46 * s, 26 * s, 9, 0.1);
  const flat = `${base}`;
  let lumps = '';
  for (let i = 0; i < 5; i++) {
    const px = x + (i - 2) * 17 * s + a.r(-4, 4) * s;
    const py = by - 28 * s - Math.cos(((i - 2) / 2) * 1.2) * 12 * s;
    lumps += `<circle cx="${n(px)}" cy="${n(py)}" r="${n(a.r(13, 18) * s)}" fill="${cm}"/><circle cx="${n(px - 4 * s)}" cy="${n(py - 5 * s)}" r="${n(8 * s)}" fill="${cl}" opacity=".8"/>`;
  }
  return (
    ao(a, x + 6 * s, by, 44 * s, 7 * s, 0.35) +
    `<path d="${flat}" fill="${cd}"/>` +
    `<g clip-path="${a.clip(base)}">${lumps}</g>` +
    `<path d="${base}" fill="none" stroke="${line}" stroke-width="${n(2.2 * s)}"/>`
  );
}


export interface TileColors {
  base: string;
  light: string;
  dark: string;
  edge: string;
  hi: string;
}

export interface TileOpts {
  /** Far edge (horizon) of the tiled ground and its near edge. */
  y0: number;
  y1?: number;
  mode?: 'slab' | 'hex';
  /** Cell width in near-plane px. */
  cell?: number;
  /** Row depth as a fraction of the whole ground depth (slab mode). */
  rowT?: number;
  skip?: number;
  /** Gap between tiles in near-plane px. */
  gap?: number;
  round?: number;
  /** Hex mode: extrusion of the column sides (near-plane px) and random height variation. */
  height?: number;
  /** Keep a tile only when its screen centroid passes. */
  region?: (x: number, y: number) => boolean;
  vary?: number;
  /** Probability that a tile gets hairline cracks. */
  crackP?: number;
}

/**
 * Perspective ground tiles (paving slabs or basalt hexagons). Tiles are generated on a ground plane
 * and projected, so their joints converge and they grow toward the viewer; shared vertices make them tile.
 */
export function groundTiles(a: Art, c: TileColors, o: TileOpts): string {
  const y0 = o.y0;
  const y1 = o.y1 ?? 870;
  const proj = (u: number, t: number): Pt => {
    const k = 0.42 + 0.58 * t;
    return [640 + (u - 640) * k, y0 + (y1 - y0) * (0.3 * t + 0.7 * t * t)];
  };
  const kAt = (t: number): number => 0.42 + 0.58 * t;
  const cell = o.cell ?? 120;
  const skip = o.skip ?? 0.1;
  const gap = o.gap ?? 5;
  const round = o.round ?? 10;
  const vary = o.vary ?? 0.4;
  const crackP = o.crackP ?? 0.12;
  const tiles: { t: number; pts: Pt[]; sideH: number }[] = [];

  if ((o.mode ?? 'slab') === 'slab') {
    const dt = o.rowT ?? 0.06;
    const rows = Math.ceil(1.02 / dt);
    const line = (r: number, u: number): number => r * dt + dt * 0.14 * Math.sin(u * 0.011 + r * 1.7) + dt * 0.08 * Math.sin(u * 0.027 + r * 0.6);
    for (let r = 0; r < rows; r++) {
      let u = -2100 - a.rand() * cell;
      while (u < 3400) {
        const w = cell * a.r(0.65, 1.45);
        if (a.rand() >= skip) {
          const m = u + w * a.r(0.35, 0.65);
          const mb = u + w * a.r(0.35, 0.65);
          const plane: [number, number][] = [
            [u, line(r, u)],
            [m, line(r, m)],
            [u + w, line(r, u + w)],
            [u + w, line(r + 1, u + w)],
            [mb, line(r + 1, mb)],
            [u, line(r + 1, u)],
          ];
          tiles.push({ t: r * dt, pts: plane.map(([pu, pt]) => proj(pu, pt)), sideH: 0 });
        }
        u += w;
      }
    }
  } else {
    // flat-topped hexagons on the plane: u in px, depth v in px (t = v / D)
    const D = 2300;
    const R = cell / 2;
    const hs = Math.sqrt(3) * R;
    for (let col = 0; -2100 + col * 1.5 * R < 3400; col++) {
      const cu = -2100 + col * 1.5 * R;
      for (let row = -1; row < D / hs + 1; row++) {
        const cv = row * hs + (col % 2 ? hs / 2 : 0);
        if (a.rand() < skip) continue;
        const pts: Pt[] = [];
        for (let i = 0; i < 6; i++) {
          const ang = (i * Math.PI) / 3;
          pts.push(proj(cu + Math.cos(ang) * R, (cv + Math.sin(ang) * R) / D));
        }
        const t = cv / D;
        tiles.push({ t, pts, sideH: (o.height ?? 0) * a.r(0.5, 1.4) * kAt(Math.max(0, t)) });
      }
    }
    tiles.sort((p, q) => p.t - q.t);
  }

  let out = '';
  for (const tile of tiles) {
    const pts = tile.pts;
    const cx = pts.reduce((s2, p) => s2 + p[0], 0) / pts.length;
    const cy = pts.reduce((s2, p) => s2 + p[1], 0) / pts.length;
    // keep tiles inside the full-bleed art box (-240..1520 x ..870)
    if (cy < y0 - 30 || cy > 900 || cx < -320 || cx > 1600) continue;
    if (o.region && !o.region(cx, cy)) continue;
    const k = kAt(Math.max(0, Math.min(1, (cy - y0) / (y1 - y0))));
    const g = gap * k;
    const inset: Pt[] = pts.map(([px, py]) => {
      const dx = px - cx;
      const dy = py - cy;
      const len = Math.hypot(dx, dy) || 1;
      const f = Math.max(0, 1 - g / len);
      return [cx + dx * f, cy + dy * f];
    });
    const d = roundedPolyPath(inset, round * k);
    const col = mix(c.base, a.rand() < 0.55 ? c.light : c.dark, a.r(0, vary));
    if (tile.sideH > 0) {
      const lift = tile.sideH;
      const top = inset.map(([px, py]): Pt => [px, py - lift]);
      // side faces: from the top outline down to the base outline (only the lower half is visible)
      out += `<path d="${poly([top[0], inset[0], inset[1], inset[2], inset[3], top[3], top[2], top[1]])}" fill="${mix(c.dark, '#000000', 0.25)}" stroke="${c.edge}" stroke-width="${n(1.2 * k)}" stroke-linejoin="round"/>`;
      out += `<path d="${roundedPolyPath(top, round * k)}" fill="${col}" stroke="${c.edge}" stroke-width="${n(1.6 * k)}"/>`;
      out += `<path d="M${n(top[3][0])} ${n(top[3][1] + 2 * k)}L${n(top[4][0])} ${n(top[4][1] + 2 * k)}L${n(top[5][0])} ${n(top[5][1] + 2 * k)}" fill="none" stroke="${c.hi}" stroke-width="${n(1.8 * k)}" stroke-linecap="round" opacity=".55"/>`;
      continue;
    }
    out += `<path d="${d}" fill="${col}" stroke="${c.edge}" stroke-width="${n(1.3 * k)}" stroke-opacity=".55"/>`;
    // sunlit far lip and shaded near lip
    const lerp = (p: Pt, q: Pt, f: number): Pt => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    const a0 = lerp(inset[0], inset[1], 0.3);
    const a1 = inset[1];
    const a2 = lerp(inset[1], inset[2], 0.7);
    out += `<path d="M${n(a0[0])} ${n(a0[1] + 1.6 * k)}L${n(a1[0])} ${n(a1[1] + 1.6 * k)}L${n(a2[0])} ${n(a2[1] + 1.6 * k)}" fill="none" stroke="${c.hi}" stroke-width="${n(1.8 * k)}" stroke-linecap="round" opacity=".4"/>`;
    const b0 = lerp(inset[3], inset[4], 0.25);
    const b1 = inset[4];
    const b2 = lerp(inset[4], inset[5], 0.75);
    out += `<path d="M${n(b0[0])} ${n(b0[1] - 1.6 * k)}L${n(b1[0])} ${n(b1[1] - 1.6 * k)}L${n(b2[0])} ${n(b2[1] - 1.6 * k)}" fill="none" stroke="${c.dark}" stroke-width="${n(2 * k)}" stroke-linecap="round" opacity=".35"/>`;
    if (a.rand() < crackP) {
      const s0 = lerp(inset[0], inset[2], a.r(0.2, 0.5));
      const s1: Pt = [cx + a.r(-8, 8) * k, cy + a.r(-3, 3) * k];
      const s2 = lerp(inset[5], inset[3], a.r(0.4, 0.8));
      out += `<path d="M${n(s0[0])} ${n(s0[1] + 2 * k)}L${n(s1[0])} ${n(s1[1])}L${n(s2[0])} ${n(s2[1] - 2 * k)}" fill="none" stroke="${c.edge}" stroke-width="${n(1.4 * k)}" stroke-linecap="round" opacity=".6"/>`;
    }
  }
  return out;
}
