// Heads: species head shapes, faces (eyes / brows / mouth), hair and headgear.
// All coordinates are given in head-radius units around the head center via `S()`.
import { darken, light, mix, shade } from './color';
import { ellipse, f, poly, smooth, star, tube, type V } from './geom';
import type { Head, HeroLook, MouthKind } from './model';
import { OUTLINE, type Pen } from './pen';

const WHITE = '#fffdf7';
const MOUTH_DARK = '#6a1e34';

type Scale = (pts: readonly V[]) => V[];

function S(H: Head): Scale {
  return (pts) => pts.map((p) => (p.length > 2 ? [H.x + p[0] * H.r, H.y + p[1] * H.r, p[2] as number] : [H.x + p[0] * H.r, H.y + p[1] * H.r]));
}

/** Smooth closed shape from head-unit points. */
function hs(H: Head, pts: readonly V[]): string {
  return smooth(S(H)(pts));
}

function px(H: Head, ax: number): number {
  return H.x + ax * H.r;
}
function py(H: Head, ay: number): number {
  return H.y + ay * H.r;
}

// ---------------------------------------------------------------------------
// Head base shapes
// ---------------------------------------------------------------------------

const HUMAN: V[] = [
  [0.02, -1.0], [0.6, -0.86], [0.96, -0.4], [1.02, 0.1], [0.9, 0.52], [0.56, 0.86], [0.14, 0.99],
  [-0.34, 0.93], [-0.74, 0.64], [-0.98, 0.16], [-0.92, -0.46], [-0.54, -0.86],
];

const WIDE: V[] = [
  [0.02, -0.98], [0.66, -0.84], [1.02, -0.36], [1.08, 0.14], [0.98, 0.56], [0.62, 0.9], [0.14, 1.0],
  [-0.4, 0.94], [-0.8, 0.64], [-1.02, 0.16], [-0.96, -0.46], [-0.56, -0.86],
];

function eyeY(H: Head): number {
  return py(H, 0.25);
}

// ---------------------------------------------------------------------------
// Eyes
// ---------------------------------------------------------------------------

/** Eye region under a straight lid line. lid values: -1 = top of the ellipse (fully open), 0 = half. */
function eyeShape(ex: number, ey: number, rx: number, ry: number, lidL: number, lidR: number): string {
  const tL = Math.PI - Math.asin(Math.max(-1, Math.min(0.95, lidL)));
  const tR = Math.asin(Math.max(-1, Math.min(0.95, lidR)));
  const pts: V[] = [];
  const steps = 12;
  // go from the left lid point down around the bottom to the right lid point (t decreasing)
  let end = tR;
  if (end > tL) end -= Math.PI * 2;
  for (let i = 0; i <= steps; i++) {
    const t = tL + ((end - tL) * i) / steps;
    pts.push([ex + Math.cos(t) * rx, ey + Math.sin(t) * ry]);
  }
  const fullyOpen = lidL <= -0.999 && lidR <= -0.999;
  if (fullyOpen) return ellipse(ex, ey, rx, ry);
  return smooth([...pts.slice(0, 1).map((p) => [p[0], p[1], 1] as V), ...pts.slice(1, -1), [pts[steps][0], pts[steps][1], 1]], true);
}

interface EyeSpec {
  style: 'anime' | 'round' | 'glow' | 'closed' | 'squint' | 'bead' | 'slit';
  /** Lid heights for the outer and inner corner (-1 open .. 0.3 heavy). */
  outer: number;
  inner: number;
  brow: 'none' | 'soft' | 'angry' | 'raised' | 'sad' | 'thick';
  size: number;
}

function exprEyes(L: HeroLook): EyeSpec {
  switch (L.expr) {
    case 'cute':
      return { style: 'round', outer: -1, inner: -1, brow: 'soft', size: 1.05 };
    case 'brave':
      return { style: 'anime', outer: -0.92, inner: -0.62, brow: 'thick', size: 1 };
    case 'angry':
      return { style: 'anime', outer: -0.9, inner: -0.25, brow: 'angry', size: 0.95 };
    case 'fierce':
      return { style: 'round', outer: -0.85, inner: -0.25, brow: 'angry', size: 1 };
    case 'sly':
      return { style: 'anime', outer: -0.45, inner: -0.3, brow: 'raised', size: 0.95 };
    case 'calm':
      return { style: 'anime', outer: -0.72, inner: -0.68, brow: 'soft', size: 1 };
    case 'sleepy':
      return { style: 'closed', outer: 0, inner: 0, brow: 'soft', size: 1 };
    case 'old':
      return { style: 'squint', outer: 0, inner: 0, brow: 'sad', size: 1 };
    case 'glow':
      return { style: 'glow', outer: -0.7, inner: -0.25, brow: 'none', size: 1 };
  }
}

export function drawEyes(p: Pen, L: HeroLook, H: Head, spec: EyeSpec = exprEyes(L), opts: { browColor?: string; brows?: boolean; eyes?: boolean } = {}): void {
  const { r } = H;
  const ey = eyeY(H);
  const eyes = [
    { ex: px(H, 0.1), rx: 0.185 * r * spec.size, ry: 0.255 * r * spec.size, near: true },
    { ex: px(H, 0.68), rx: 0.145 * r * spec.size, ry: 0.245 * r * spec.size, near: false },
  ];
  const browColor = opts.browColor ?? (L.hair ? darken(L.hair.color, 0.35) : OUTLINE);
  for (const e of eyes) {
    // near eye: outer corner is the left; far eye: outer corner is the right
    const lidL = e.near ? spec.outer : spec.inner;
    const lidR = e.near ? spec.inner : spec.outer;
    const ey2 = ey - (e.near ? 0 : 0.02 * r);
    if (opts.eyes !== false) switch (spec.style) {
      case 'anime': {
        const d = eyeShape(e.ex, ey2, e.rx, e.ry, lidL, lidR);
        p.fill(d, WHITE);
        const iris = ellipse(e.ex + e.rx * 0.18, ey2 + e.ry * 0.1, e.rx * 0.78, e.ry * 0.84);
        const irisLow = ellipse(e.ex + e.rx * 0.18, ey2 + e.ry * 0.42, e.rx * 0.6, e.ry * 0.42);
        const pupil = ellipse(e.ex + e.rx * 0.2, ey2 + e.ry * 0.08, e.rx * 0.38, e.ry * 0.46);
        const id = p.id('e');
        p.raw(
          `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})" stroke="none">` +
            `<path d="${iris}" fill="${darken(L.eye, 0.15)}"/><path d="${irisLow}" fill="${light(L.eye, 0.35)}"/>` +
            `<path d="${pupil}" fill="${darken(L.eye, 0.75)}"/>` +
            `<path d="${ellipse(e.ex + e.rx * 0.45, ey2 - e.ry * 0.3, e.rx * 0.32, e.ry * 0.26)}" fill="#fff"/>` +
            `<path d="${ellipse(e.ex - e.rx * 0.2, ey2 + e.ry * 0.45, e.rx * 0.14, e.ry * 0.12)}" fill="#fff"/></g>`,
        );
        // lash line along the lid + outer flick
        const lx1 = e.ex - e.rx * 1.02;
        const lx2 = e.ex + e.rx * 1.02;
        const ly1 = ey2 + e.ry * Math.max(-0.9, lidL) * 0.98;
        const ly2 = ey2 + e.ry * Math.max(-0.9, lidR) * 0.98;
        const flick = e.near ? `M${f(lx1)} ${f(ly1)}l${f(-0.08 * r)} ${f(-0.07 * r)}` : `M${f(lx2)} ${f(ly2)}l${f(0.07 * r)} ${f(-0.07 * r)}`;
        p.line(`M${f(lx1)} ${f(ly1)}Q${f(e.ex)} ${f(Math.min(ly1, ly2) - e.ry * 0.16)} ${f(lx2)} ${f(ly2)}${flick}`, OUTLINE, 0.085 * r);
        break;
      }
      case 'round': {
        const d = eyeShape(e.ex, ey2, e.rx, e.ry, lidL, lidR);
        const id = p.id('e');
        p.raw(
          `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${mix(L.eye, OUTLINE, 0.72)}" stroke="none"/>` +
            `<g clip-path="url(#${id})" stroke="none"><path d="${ellipse(e.ex + e.rx * 0.1, ey2 + e.ry * 0.62, e.rx * 0.85, e.ry * 0.5)}" fill="${L.eye}"/>` +
            `<path d="${ellipse(e.ex + e.rx * 0.32, ey2 - e.ry * 0.34, e.rx * 0.42, e.ry * 0.32)}" fill="#fff"/>` +
            `<path d="${ellipse(e.ex - e.rx * 0.3, ey2 + e.ry * 0.38, e.rx * 0.18, e.ry * 0.14)}" fill="#fff"/></g>`,
        );
        if (lidL > -0.99 || lidR > -0.99) {
          const lx1 = e.ex - e.rx * 1.05;
          const lx2 = e.ex + e.rx * 1.05;
          p.line(`M${f(lx1)} ${f(ey2 + e.ry * lidL)}L${f(lx2)} ${f(ey2 + e.ry * lidR)}`, OUTLINE, 0.08 * r);
        }
        break;
      }
      case 'bead': {
        p.fill(ellipse(e.ex, ey2, e.rx * 0.7, e.ry * 0.7), OUTLINE);
        p.fill(ellipse(e.ex + e.rx * 0.22, ey2 - e.ry * 0.25, e.rx * 0.26, e.ry * 0.22), '#fff');
        break;
      }
      case 'glow': {
        const d = eyeShape(e.ex, ey2, e.rx * 1.05, e.ry * 0.8, lidL, lidR);
        p.fill(ellipse(e.ex, ey2, e.rx * 1.6, e.ry * 1.15), L.glow, 0.3);
        p.fill(d, L.glow);
        p.fill(ellipse(e.ex + e.rx * 0.2, ey2 - e.ry * 0.05, e.rx * 0.45, e.ry * 0.3), '#ffffff', 0.9);
        break;
      }
      case 'slit': {
        const d = eyeShape(e.ex, ey2, e.rx * 1.05, e.ry * 0.95, lidL, lidR);
        p.fill(d, L.eye);
        p.fill(ellipse(e.ex + e.rx * 0.15, ey2 + e.ry * 0.05, e.rx * 0.18, e.ry * 0.7), OUTLINE);
        p.fill(ellipse(e.ex + e.rx * 0.5, ey2 - e.ry * 0.3, e.rx * 0.2, e.ry * 0.16), '#fff');
        p.line(eyeShapeTop(e.ex, ey2, e.rx * 1.05, e.ry * 0.95, lidL, lidR), OUTLINE, 0.075 * r);
        break;
      }
      case 'closed': {
        // happy/sleepy closed eye: a soft downward arc with a lash
        p.line(`M${f(e.ex - e.rx)} ${f(ey2 + e.ry * 0.05)}Q${f(e.ex)} ${f(ey2 + e.ry * 0.62)} ${f(e.ex + e.rx)} ${f(ey2 + e.ry * 0.05)}`, OUTLINE, 0.08 * r);
        break;
      }
      case 'squint': {
        p.line(`M${f(e.ex - e.rx)} ${f(ey2 + e.ry * 0.25)}Q${f(e.ex)} ${f(ey2 - e.ry * 0.35)} ${f(e.ex + e.rx)} ${f(ey2 + e.ry * 0.25)}`, OUTLINE, 0.08 * r);
        p.line(`M${f(e.ex - e.rx * 0.7)} ${f(ey2 + e.ry * 0.75)}q${f(e.rx * 0.6)} ${f(e.ry * 0.25)} ${f(e.rx * 1.3)} 0`, shade(L.skin, 1.4), 0.05 * r);
        break;
      }
    }
    // brows
    if (spec.brow !== 'none' && opts.brows !== false) {
      const by = ey2 - e.ry - 0.17 * r;
      const w = e.rx * 1.05;
      const tilt = { soft: 0.04, angry: 0.17, raised: e.near ? -0.06 : 0.1, sad: -0.12, thick: 0.1 }[spec.brow] * r;
      // inner end lowered by tilt: inner is right for the near eye, left for the far eye
      const yL = by + (e.near ? 0 : tilt);
      const yR = by + (e.near ? tilt : 0);
      const arch = spec.brow === 'soft' || spec.brow === 'sad' ? -0.06 * r : -0.02 * r;
      p.line(`M${f(e.ex - w)} ${f(yL)}Q${f(e.ex)} ${f((yL + yR) / 2 + arch)} ${f(e.ex + w)} ${f(yR)}`, browColor, (spec.brow === 'thick' || spec.brow === 'angry' ? 0.1 : 0.075) * r);
    }
  }
}

function eyeShapeTop(ex: number, ey: number, rx: number, ry: number, lidL: number, lidR: number): string {
  return `M${f(ex - rx)} ${f(ey + ry * Math.max(-0.8, lidL))}L${f(ex + rx)} ${f(ey + ry * Math.max(-0.8, lidR))}`;
}

export function defaultMouth(L: HeroLook): MouthKind {
  if (L.mouth) return L.mouth;
  switch (L.expr) {
    case 'cute': return 'smile';
    case 'brave': return 'grin';
    case 'angry': return 'teeth';
    case 'fierce': return 'fang';
    case 'sly': return 'smirk';
    case 'calm': return 'smile';
    case 'sleepy': return 'o';
    case 'old': return 'smile';
    case 'glow': return 'none';
  }
}

export function drawMouth(p: Pen, kind: MouthKind, H: Head, at: [number, number] = [0.42, 0.64]): void {
  const r = H.r;
  const mx = px(H, at[0]);
  const my = py(H, at[1]);
  const w = 0.12 * r;
  switch (kind) {
    case 'smile':
      p.line(`M${f(mx - w)} ${f(my - 0.03 * r)}Q${f(mx)} ${f(my + 0.09 * r)} ${f(mx + w * 0.9)} ${f(my - 0.04 * r)}`, OUTLINE, 0.07 * r);
      break;
    case 'grin': {
      const d = `M${f(mx - w * 1.2)} ${f(my - 0.05 * r)}Q${f(mx)} ${f(my - 0.01 * r)} ${f(mx + w * 1.1)} ${f(my - 0.07 * r)}Q${f(mx + w * 0.6)} ${f(my + 0.2 * r)} ${f(mx - w * 1.2)} ${f(my - 0.05 * r)}Z`;
      p.raw(`<path d="${d}" fill="${MOUTH_DARK}" stroke-width="${f(0.1 * r)}"/>`);
      p.fill(ellipse(mx - w * 0.05, my + 0.08 * r, w * 0.55, 0.045 * r), '#f06a7a');
      p.fill(`M${f(mx - w * 1.0)} ${f(my - 0.045 * r)}Q${f(mx)} ${f(my - 0.01 * r)} ${f(mx + w * 0.95)} ${f(my - 0.065 * r)}L${f(mx + w * 0.8)} ${f(my - 0.01 * r)}Q${f(mx)} ${f(my + 0.03 * r)} ${f(mx - w * 0.85)} ${f(my + 0.0 * r)}Z`, '#fff');
      break;
    }
    case 'frown':
      p.line(`M${f(mx - w)} ${f(my + 0.04 * r)}Q${f(mx)} ${f(my - 0.06 * r)} ${f(mx + w * 0.9)} ${f(my + 0.03 * r)}`, OUTLINE, 0.07 * r);
      break;
    case 'smirk':
      p.line(`M${f(mx - w)} ${f(my + 0.01 * r)}Q${f(mx + w * 0.2)} ${f(my + 0.05 * r)} ${f(mx + w)} ${f(my - 0.07 * r)}`, OUTLINE, 0.07 * r);
      break;
    case 'o':
      p.raw(`<path d="${ellipse(mx, my + 0.02 * r, 0.055 * r, 0.06 * r)}" fill="${MOUTH_DARK}" stroke-width="${f(0.08 * r)}"/>`);
      break;
    case 'fang': {
      const d = `M${f(mx - w * 1.1)} ${f(my - 0.04 * r)}Q${f(mx)} ${f(my + 0.02 * r)} ${f(mx + w)} ${f(my - 0.06 * r)}Q${f(mx + w * 0.4)} ${f(my + 0.16 * r)} ${f(mx - w * 1.1)} ${f(my - 0.04 * r)}Z`;
      p.raw(`<path d="${d}" fill="${MOUTH_DARK}" stroke-width="${f(0.1 * r)}"/>`);
      p.fill(poly([[mx - w * 0.75, my - 0.03 * r], [mx - w * 0.35, my - 0.02 * r], [mx - w * 0.55, my + 0.07 * r]]), '#fff');
      p.fill(poly([[mx + w * 0.35, my - 0.04 * r], [mx + w * 0.72, my - 0.05 * r], [mx + w * 0.55, my + 0.05 * r]]), '#fff');
      break;
    }
    case 'teeth': {
      const d = `M${f(mx - w * 1.2)} ${f(my - 0.05 * r)}L${f(mx + w * 1.1)} ${f(my - 0.07 * r)}L${f(mx + w * 0.95)} ${f(my + 0.09 * r)}L${f(mx - w * 1.05)} ${f(my + 0.09 * r)}Z`;
      p.raw(`<path d="${d}" fill="#fff" stroke-width="${f(0.1 * r)}"/>`);
      p.line(`M${f(mx - w * 1.1)} ${f(my + 0.02 * r)}L${f(mx + w)} ${f(my + 0.01 * r)}M${f(mx - w * 0.35)} ${f(my - 0.05 * r)}v${f(0.13 * r)}M${f(mx + w * 0.35)} ${f(my - 0.06 * r)}v${f(0.14 * r)}`, '#8a7f9a', 0.035 * r);
      break;
    }
    case 'line':
      p.line(`M${f(mx - w * 0.8)} ${f(my)}L${f(mx + w * 0.8)} ${f(my - 0.02 * r)}`, OUTLINE, 0.07 * r);
      break;
    case 'none':
      break;
  }
}

function blush(p: Pen, H: Head): void {
  const r = H.r;
  p.fill(ellipse(px(H, 0.02), py(H, 0.52), 0.13 * r, 0.065 * r), '#ff7f9a', 0.45);
  p.fill(ellipse(px(H, 0.76), py(H, 0.5), 0.1 * r, 0.06 * r), '#ff7f9a', 0.45);
}

function humanEar(p: Pen, L: HeroLook, H: Head): void {
  const r = H.r;
  if (L.ear === 'none') return;
  if (L.ear === 'pointy') {
    p.shape(hs(H, [[-0.28, 0.42], [-0.6, 0.38], [-1.18, -0.28, 1], [-0.72, 0.02], [-0.3, 0.02]]), L.skin, { off: 2 });
    p.line(`M${f(px(H, -0.42))} ${f(py(H, 0.24))}L${f(px(H, -0.82))} ${f(py(H, -0.06))}`, shade(L.skin, 1.3), 0.05 * r);
    return;
  }
  p.shape(ellipse(px(H, -0.4), py(H, 0.26), 0.15 * r, 0.2 * r), L.skin, { off: 1.6 });
  p.line(`M${f(px(H, -0.36))} ${f(py(H, 0.16))}q${f(-0.08 * r)} ${f(0.08 * r)} 0 ${f(0.18 * r)}`, shade(L.skin, 1.4), 0.05 * r);
}

// ---------------------------------------------------------------------------
// Hair
// ---------------------------------------------------------------------------

const BANGS_TAIL: V[] = [
  [0.92, -0.3], [0.8, -0.08, 1], [0.62, -0.38], [0.4, -0.12, 1], [0.22, -0.42], [0.0, -0.18, 1], [-0.14, -0.46], [-0.34, -0.3],
  [-0.48, 0.14], [-0.6, 0.52, 1], [-0.7, 0.3],
];

function hairShine(H: Head, color: string): string {
  const r = H.r;
  return (
    `<path d="M${f(px(H, -0.2))} ${f(py(H, -0.8))}Q${f(px(H, 0.3))} ${f(py(H, -1.02))} ${f(px(H, 0.76))} ${f(py(H, -0.6))}" fill="none" stroke="${light(color, 0.55)}" stroke-width="${f(0.1 * r)}" stroke-linecap="round" opacity=".8"/>` +
    `<path d="M${f(px(H, -0.5))} ${f(py(H, -0.62))}l${f(0.12 * r)} ${f(-0.1 * r)}" fill="none" stroke="${light(color, 0.55)}" stroke-width="${f(0.08 * r)}" stroke-linecap="round" opacity=".7"/>`
  );
}

export function drawHairBack(p: Pen, L: HeroLook, H: Head): void {
  if (!L.hair) return;
  const c = L.hair.color;
  switch (L.hair.style) {
    case 'long':
      p.shape(
        hs(H, [
          [-0.6, -0.95], [0.1, -1.12], [0.75, -0.9], [1.1, -0.35], [1.16, 0.35], [1.05, 0.95], [0.8, 1.32, 1], [0.55, 0.95],
          [0.1, 1.15], [-0.35, 1.55], [-0.62, 2.1, 1], [-0.85, 1.7], [-1.18, 1.95, 1], [-1.28, 1.35], [-1.22, 0.6], [-1.12, -0.2],
        ]),
        c,
        { off: 5, dir: [1, -0.6] },
      );
      break;
    case 'ponytail':
      p.shape(
        smooth(S(H)([[-0.5, -0.92], [-0.98, -0.9], [-1.5, -0.55], [-1.72, 0.1], [-1.68, 0.8], [-1.95, 1.45, 1], [-1.35, 1.05], [-1.2, 0.45], [-1.0, -0.2], [-0.62, -0.55]])),
        c,
        { off: 4 },
      );
      p.shape(ellipse(px(H, -0.82), py(H, -0.78), 0.16 * H.r, 0.13 * H.r), L.trim, { off: 1.5 });
      break;
    case 'bob':
      p.shape(hs(H, [[-0.8, -0.85], [0.2, -1.12], [0.95, -0.7], [1.12, 0.1], [1.0, 0.72, 1], [0.6, 0.55], [-0.2, 0.9], [-0.95, 0.95, 1], [-1.15, 0.3], [-1.1, -0.4]]), c, { off: 4 });
      break;
    case 'wild':
      p.shape(
        hs(H, [
          [-0.6, -0.9], [-0.9, -1.45, 1], [-1.05, -0.9], [-1.65, -1.05, 1], [-1.3, -0.5], [-1.85, -0.25, 1], [-1.32, 0.05], [-1.7, 0.5, 1],
          [-1.1, 0.45], [-1.25, 0.95, 1], [-0.7, 0.6], [0.2, 0.5], [0.9, 0.2], [1.0, -0.6], [0.4, -1.1],
        ]),
        c,
        { off: 4 },
      );
      break;
    case 'flame':
      p.shape(
        hs(H, [
          [-0.7, -0.8], [-1.3, -1.45, 1], [-0.85, -1.2], [-0.7, -1.95, 1], [-0.32, -1.32], [0.0, -2.15, 1], [0.24, -1.36], [0.66, -1.85, 1],
          [0.7, -1.12], [1.15, -1.3, 1], [1.02, -0.6], [1.12, 0.2], [0.9, 0.9], [0.2, 1.1], [-0.5, 1.4], [-1.0, 1.85, 1], [-1.2, 1.1], [-1.5, 0.75, 1], [-1.25, 0.2], [-1.5, -0.3, 1], [-1.15, -0.5],
        ]),
        c,
        { off: 4, inner: `<path d="${hs(H, [[-1.4, -1.6], [-0.7, -2.1], [0.0, -2.3], [0.7, -2.0], [1.3, -1.4], [0.9, -1.25], [0.4, -1.45], [0, -1.6], [-0.5, -1.45], [-1.0, -1.3]])}" fill="${L.hair.tip ?? light(c, 0.5)}"/>` },
      );
      break;
    default:
      break;
  }
}

export function drawHairFront(p: Pen, L: HeroLook, H: Head): void {
  if (!L.hair) return;
  const c = L.hair.color;
  const shine = hairShine(H, c);
  const top: V[] = [[-1.06, 0.12], [-1.07, -0.42], [-0.8, -0.88], [-0.26, -1.15], [0.36, -1.13], [0.86, -0.83], [1.08, -0.35], [1.09, 0.06, 1]];
  switch (L.hair.style) {
    case 'short':
    case 'bob':
    case 'ponytail':
      p.shape(hs(H, [[-0.86, 0.62, 1], ...top, ...BANGS_TAIL]), c, { off: 4, inner: shine });
      if (L.hair.style === 'bob') p.shape(hs(H, [[-0.42, -0.1], [-0.62, 0.35], [-0.66, 0.9, 1], [-0.95, 0.75], [-1.08, 0.2], [-0.98, -0.4]]), c, { off: 3 });
      break;
    case 'spiky':
      p.shape(
        hs(H, [
          [-0.86, 0.6, 1], [-1.05, 0.25], [-1.42, 0.08, 1], [-1.1, -0.3], [-1.36, -0.76, 1], [-0.88, -0.82], [-0.8, -1.3, 1], [-0.36, -1.08],
          [0.02, -1.5, 1], [0.26, -1.1], [0.66, -1.32, 1], [0.76, -0.94], [1.14, -0.86, 1], [1.04, -0.48], [1.12, 0.04, 1], ...BANGS_TAIL,
        ]),
        c,
        { off: 4, inner: shine },
      );
      break;
    case 'long':
      p.shape(
        hs(H, [
          [-0.4, 1.3, 1], [-0.7, 0.75], [-1.05, 0.2], [-1.08, -0.42], [-0.8, -0.9], [-0.24, -1.16], [0.4, -1.12], [0.9, -0.8], [1.12, -0.26],
          [1.14, 0.42, 1], [0.94, -0.12], [0.74, -0.34], [0.54, -0.1, 1], [0.36, -0.42], [0.12, -0.18, 1], [-0.08, -0.48], [-0.3, -0.24],
          [-0.38, 0.3], [-0.3, 0.85],
        ]),
        c,
        { off: 4, inner: shine },
      );
      break;
    case 'wild':
      p.shape(
        hs(H, [
          [-0.86, 0.6, 1], [-1.05, 0.2], [-1.15, -0.4], [-0.95, -0.9], [-0.4, -1.25], [0.0, -1.62, 1], [0.2, -1.15], [0.75, -1.35, 1],
          [0.8, -0.92], [1.22, -0.72, 1], [1.08, -0.38], [1.18, 0.02, 1], ...BANGS_TAIL,
        ]),
        c,
        { off: 4, inner: shine },
      );
      break;
    case 'flame':
      p.shape(hs(H, [[-0.86, 0.6, 1], ...top, ...BANGS_TAIL]), c, { off: 4, inner: shine });
      break;
    case 'wisps':
      p.shape(hs(H, [[-0.7, 0.1], [-0.82, -0.4], [-0.4, -0.62], [0.3, -0.64], [0.85, -0.4], [0.9, -0.16, 1], [0.6, -0.3], [0.45, -0.12, 1], [0.25, -0.34], [-0.05, -0.18, 1], [-0.3, -0.36], [-0.5, 0.0]]), c, { off: 2.5 });
      break;
    case 'none':
      break;
  }
}

function beard(p: Pen, L: HeroLook, H: Head): void {
  if (!L.beard) return;
  const c = L.beard.color;
  if (L.beard.style === 'full') {
    p.shape(
      hs(H, [[-0.42, 0.18], [-0.2, 0.5], [0.18, 0.5], [0.44, 0.52], [0.72, 0.4], [0.98, 0.12], [1.08, 0.6], [0.88, 1.12], [0.55, 1.38, 1], [0.38, 1.12], [0.1, 1.42, 1], [-0.1, 1.08], [-0.42, 1.2, 1], [-0.52, 0.72]]),
      c,
      { off: 3.5, inner: `<path d="M${f(px(H, 0.05))} ${f(py(H, 0.8))}q${f(0.1 * H.r)} ${f(0.2 * H.r)} 0 ${f(0.4 * H.r)}M${f(px(H, 0.55))} ${f(py(H, 0.75))}q${f(0.1 * H.r)} ${f(0.2 * H.r)} 0 ${f(0.4 * H.r)}" fill="none" stroke="${shade(c)}" stroke-width="${f(0.05 * H.r)}"/>` },
    );
    // moustache
    p.shape(hs(H, [[0.05, 0.56], [0.3, 0.44], [0.48, 0.5], [0.66, 0.42], [0.92, 0.54], [0.82, 0.66], [0.5, 0.6], [0.3, 0.68], [0.1, 0.7, 1]]), light(c, 0.12), { off: 1.5 });
  } else if (L.beard.style === 'long') {
    p.shape(
      hs(H, [[-0.35, 0.3], [0.1, 0.52], [0.5, 0.52], [0.95, 0.3], [1.0, 0.85], [0.85, 1.45], [0.6, 2.05, 1], [0.35, 1.7], [0.1, 2.15, 1], [-0.12, 1.55], [-0.4, 1.0]]),
      c,
      { off: 3.5, inner: `<path d="M${f(px(H, 0.3))} ${f(py(H, 0.9))}q${f(0.12 * H.r)} ${f(0.4 * H.r)} ${f(0.02 * H.r)} ${f(0.85 * H.r)}" fill="none" stroke="${shade(c)}" stroke-width="${f(0.05 * H.r)}"/>` },
    );
    p.shape(hs(H, [[0.02, 0.6], [0.3, 0.46], [0.5, 0.52], [0.7, 0.44], [1.0, 0.6], [0.88, 0.72], [0.55, 0.64], [0.28, 0.74], [0.0, 0.76, 1]]), light(c, 0.15), { off: 1.5 });
  } else {
    // moss beard
    p.shape(
      hs(H, [[-0.5, 0.4], [0.2, 0.62], [0.9, 0.42], [1.02, 0.85], [0.8, 1.4, 1], [0.6, 1.1], [0.38, 1.6, 1], [0.15, 1.15], [-0.1, 1.5, 1], [-0.25, 1.05], [-0.52, 1.2, 1]]),
      c,
      { off: 3.5 },
    );
  }
}

// ---------------------------------------------------------------------------
// Species heads
// ---------------------------------------------------------------------------

function nose(p: Pen, L: HeroLook, H: Head): void {
  p.line(`M${f(px(H, 0.46))} ${f(py(H, 0.38))}q${f(0.06 * H.r)} ${f(0.06 * H.r)} ${f(-0.01 * H.r)} ${f(0.1 * H.r)}`, shade(L.skin, 1.5), 0.05 * H.r);
}

function humanHead(p: Pen, L: HeroLook, H: Head, base: V[] = HUMAN): void {
  p.shape(hs(H, base), L.skin, { off: 4, dir: [1, -0.5], shade: shade(L.skin, 0.62) });
  humanEar(p, L, H);
}

function face(p: Pen, L: HeroLook, H: Head): void {
  drawEyes(p, L, H, exprEyes(L), { brows: false });
  if (L.blush) blush(p, H);
  if (L.expr !== 'glow') nose(p, L, H);
  drawMouth(p, defaultMouth(L), H);
}

function foxHead(p: Pen, L: HeroLook, H: Head): void {
  const r = H.r;
  const fur = L.skin;
  const white = L.skin2 ?? '#fff4e6';
  // ears
  p.shape(hs(H, [[-0.78, -0.45], [-0.95, -1.35, 1], [-0.25, -0.86]]), fur, { off: 2.5, inner: `<path d="${hs(H, [[-0.7, -0.6], [-0.86, -1.15, 1], [-0.42, -0.8]])}" fill="${mix(fur, '#3a1d2e', 0.55)}"/>` });
  p.shape(hs(H, [[0.05, -0.92], [0.42, -1.62, 1], [0.72, -0.72]]), fur, { off: 2.5, inner: `<path d="${hs(H, [[0.2, -0.9], [0.42, -1.4, 1], [0.58, -0.82]])}" fill="${mix(fur, '#3a1d2e', 0.55)}"/>` });
  const shape: V[] = [[0.02, -1.0], [0.62, -0.84], [1.0, -0.36], [1.18, 0.1], [1.5, 0.36, 1], [1.28, 0.6], [0.85, 0.86], [0.3, 0.98], [-0.3, 0.92], [-0.76, 0.62], [-1.0, 0.12], [-0.94, -0.46], [-0.54, -0.86]];
  p.shape(hs(H, shape), fur, {
    off: 4.5,
    dir: [1, -0.55],
    inner: `<path d="${hs(H, [[1.6, 0.36], [1.1, 0.1], [0.6, 0.3], [0.1, 0.42], [-0.5, 0.55], [-0.6, 1.1], [1.0, 1.1]])}" fill="${white}"/>`,
  });
  drawEyes(p, L, H);
  p.shape(ellipse(px(H, 1.44), py(H, 0.33), 0.1 * r, 0.08 * r), '#2a1a2e', { shade: null, sw: 3 });
  p.line(`M${f(px(H, 1.34))} ${f(py(H, 0.46))}q${f(-0.1 * r)} ${f(0.14 * r)} ${f(-0.32 * r)} ${f(0.08 * r)}`, OUTLINE, 0.06 * r);
}

function bearHead(p: Pen, L: HeroLook, H: Head): void {
  const r = H.r;
  const fur = L.skin;
  const inner = L.skin2 ?? light(fur, 0.35);
  p.shape(ellipse(px(H, -0.62), py(H, -0.8), 0.28 * r), fur, { off: 2.5, inner: `<path d="${ellipse(px(H, -0.58), py(H, -0.76), 0.14 * r)}" fill="${inner}"/>` });
  p.shape(ellipse(px(H, 0.42), py(H, -0.98), 0.26 * r), fur, { off: 2.5, inner: `<path d="${ellipse(px(H, 0.44), py(H, -0.94), 0.13 * r)}" fill="${inner}"/>` });
  p.shape(hs(H, WIDE), fur, { off: 5, dir: [1, -0.55] });
  // muzzle
  p.shape(hs(H, [[0.22, 0.32], [0.62, 0.18], [1.12, 0.28], [1.28, 0.55], [1.05, 0.86], [0.55, 0.9], [0.22, 0.7]]), inner, { off: 2.5 });
  p.shape(ellipse(px(H, 1.12), py(H, 0.36), 0.15 * r, 0.11 * r), '#2a1a22', { shade: null, sw: 3 });
  p.fill(ellipse(px(H, 1.15), py(H, 0.32), 0.05 * r, 0.03 * r), '#fff', 0.8);
  p.line(`M${f(px(H, 1.08))} ${f(py(H, 0.48))}q${f(-0.06 * r)} ${f(0.18 * r)} ${f(-0.3 * r)} ${f(0.16 * r)}`, OUTLINE, 0.06 * r);
  drawEyes(p, L, H, { style: 'bead', outer: -1, inner: -1, brow: 'angry', size: 1.15 }, { browColor: darken(fur, 0.5) });
}

function lionHead(p: Pen, L: HeroLook, H: Head): void {
  const r = H.r;
  const fur = L.skin;
  const inner = L.skin2 ?? '#fff1d0';
  p.shape(ellipse(px(H, -0.58), py(H, -0.86), 0.22 * r), fur, { off: 2, inner: `<path d="${ellipse(px(H, -0.55), py(H, -0.82), 0.1 * r)}" fill="${shade(fur, 1.4)}"/>` });
  p.shape(hs(H, WIDE), fur, { off: 4.5, dir: [1, -0.55] });
  p.shape(hs(H, [[0.15, 0.38], [0.6, 0.22], [1.08, 0.3], [1.2, 0.58], [0.98, 0.88], [0.5, 0.94], [0.15, 0.74]]), inner, { off: 2 });
  p.shape(hs(H, [[0.92, 0.26], [1.16, 0.26], [1.1, 0.42, 1], [1.0, 0.46], [0.9, 0.38]]), '#7a3a2a', { shade: null, sw: 3 });
  p.line(`M${f(px(H, 1.02))} ${f(py(H, 0.46))}v${f(0.12 * r)}q${f(-0.1 * r)} ${f(0.12 * r)} ${f(-0.26 * r)} ${f(0.06 * r)}`, OUTLINE, 0.06 * r);
  for (const [ax, ay] of [[0.62, 0.62], [0.74, 0.68], [0.66, 0.74]] as const) p.fill(ellipse(px(H, ax), py(H, ay), 0.025 * r), '#8a5a3a');
  drawEyes(p, L, H);
}

function owlHead(p: Pen, L: HeroLook, H: Head): void {
  const r = H.r;
  const fur = L.skin;
  const disc = L.skin2 ?? light(fur, 0.55);
  // ear tufts
  p.shape(hs(H, [[-0.62, -0.78], [-0.92, -1.0], [-1.24, -1.22, 1], [-1.1, -0.92], [-1.3, -0.84, 1], [-0.96, -0.62], [-0.84, -0.44]]), shade(fur, 0.35), { off: 2.5 });
  p.shape(hs(H, [[0.44, -0.92], [0.78, -1.18], [1.08, -1.44, 1], [1.02, -1.12], [1.24, -1.08, 1], [1.0, -0.84], [0.92, -0.62]]), shade(fur, 0.35), { off: 2.5 });
  p.shape(hs(H, [[0.0, -1.02], [0.7, -0.88], [1.1, -0.4], [1.14, 0.2], [0.95, 0.68], [0.5, 0.98], [-0.1, 1.02], [-0.66, 0.82], [-1.02, 0.3], [-1.0, -0.4], [-0.6, -0.88]]), fur, {
    off: 5,
    dir: [1, -0.55],
    inner: `<path d="${hs(H, [[-0.62, 0.0], [-0.2, -0.36], [0.32, -0.12], [0.42, -0.2], [0.86, -0.4], [1.2, -0.05], [1.1, 0.6], [0.4, 0.85], [-0.4, 0.75]])}" fill="${disc}"/>` +
      `<path d="M${f(px(H, -0.55))} ${f(py(H, 0.92))}q${f(0.2 * r)} ${f(-0.12 * r)} ${f(0.4 * r)} 0q${f(0.2 * r)} ${f(-0.12 * r)} ${f(0.4 * r)} 0q${f(0.2 * r)} ${f(-0.12 * r)} ${f(0.4 * r)} 0" fill="none" stroke="${shade(fur, 1.3)}" stroke-width="${f(0.06 * r)}"/>`,
  });
  // big eyes with rings
  const eyes = [
    { x: px(H, 0.1), y: py(H, 0.2), rr: 0.3 * r },
    { x: px(H, 0.76), y: py(H, 0.16), rr: 0.25 * r },
  ];
  for (const e of eyes) {
    p.shape(ellipse(e.x, e.y, e.rr, e.rr * 1.02), L.eye, { off: 1.5, sw: 3.4, rim: light(L.eye, 0.6), rimW: 1.4 });
    p.fill(ellipse(e.x + e.rr * 0.12, e.y + e.rr * 0.05, e.rr * 0.5, e.rr * 0.56), OUTLINE);
    p.fill(ellipse(e.x + e.rr * 0.32, e.y - e.rr * 0.22, e.rr * 0.2, e.rr * 0.18), '#fff');
  }
  // feather brows (V)
  p.line(`M${f(px(H, -0.24))} ${f(py(H, -0.26))}L${f(px(H, 0.4))} ${f(py(H, -0.06))}L${f(px(H, 1.02))} ${f(py(H, -0.26))}`, shade(fur, 1.6), 0.11 * r);
  // beak
  p.shape(hs(H, [[0.34, 0.24], [0.56, 0.2], [0.58, 0.48], [0.46, 0.66, 1], [0.36, 0.44]]), '#f0a64a', { off: 1.5, sw: 3.4 });
}

function lizardHead(p: Pen, L: HeroLook, H: Head): void {
  const r = H.r;
  const sc = L.skin;
  const belly = L.skin2 ?? '#ffd27a';
  // flame crest behind head
  const crest = hs(H, [[-0.5, -0.82], [-0.55, -1.45, 1], [-0.75, -0.95], [-1.15, -1.25, 1], [-1.02, -0.6], [-1.45, -0.55, 1], [-1.1, -0.2], [-1.4, 0.15, 1], [-0.95, 0.2]]);
  p.shape(crest, L.glow, { off: 3, inner: `<path d="${hs(H, [[-0.6, -0.8], [-0.7, -1.1], [-1.0, -0.62], [-1.15, -0.1], [-0.8, 0.1]])}" fill="${light(L.glow, 0.6)}"/>` });
  const shape: V[] = [[-0.1, -0.95], [0.55, -0.9], [1.0, -0.62], [1.42, -0.3], [1.72, 0.0], [1.75, 0.3], [1.5, 0.52], [0.95, 0.72], [0.3, 0.92], [-0.4, 0.84], [-0.88, 0.5], [-1.0, -0.05], [-0.72, -0.7]];
  p.shape(hs(H, shape), sc, {
    off: 4.5,
    dir: [1, -0.55],
    inner:
      `<path d="${hs(H, [[1.8, 0.36], [1.0, 0.5], [0.2, 0.62], [-0.6, 0.6], [-0.7, 1.2], [1.8, 1.2]])}" fill="${belly}"/>` +
      `<path d="${ellipse(px(H, -0.2), py(H, -0.55), 0.12 * r)}${ellipse(px(H, 0.22), py(H, -0.72), 0.09 * r)}${ellipse(px(H, -0.55), py(H, -0.2), 0.08 * r)}" fill="${shade(sc, 1.3)}"/>`,
  });
  drawEyes(p, L, H, { style: 'slit', outer: -0.95, inner: -0.4, brow: 'none', size: 1.15 });
  p.line(`M${f(px(H, 0.95))} ${f(py(H, -0.32))}L${f(px(H, 0.55))} ${f(py(H, -0.22))}`, shade(sc, 1.6), 0.08 * r);
  p.fill(ellipse(px(H, 1.55), py(H, 0.06), 0.05 * r, 0.035 * r), OUTLINE);
  p.line(`M${f(px(H, 1.62))} ${f(py(H, 0.4))}Q${f(px(H, 1.0))} ${f(py(H, 0.56))} ${f(px(H, 0.55))} ${f(py(H, 0.44))}`, OUTLINE, 0.065 * r);
  p.fill(poly([[px(H, 1.2), py(H, 0.47)], [px(H, 1.28), py(H, 0.47)], [px(H, 1.24), py(H, 0.58)]]), '#fff');
}

function skullHead(p: Pen, L: HeroLook, H: Head): void {
  const r = H.r;
  const bone = L.skin;
  const shape: V[] = [[0.0, -1.02], [0.68, -0.84], [1.02, -0.3], [1.0, 0.24], [0.84, 0.5], [0.8, 0.82], [0.5, 1.0], [0.0, 1.0], [-0.35, 0.86], [-0.8, 0.5], [-1.0, -0.06], [-0.76, -0.72]];
  p.shape(hs(H, shape), bone, {
    off: 4.5,
    dir: [1, -0.55],
    inner: `<path d="M${f(px(H, -0.5))} ${f(py(H, -0.62))}l${f(0.12 * r)} ${f(0.16 * r)}l${f(-0.04 * r)} ${f(0.14 * r)}" fill="none" stroke="${shade(bone, 1.5)}" stroke-width="${f(0.05 * r)}"/>`,
  });
  // sockets
  p.fill(hs(H, [[-0.22, 0.02], [0.28, 0.0], [0.38, 0.36], [0.12, 0.5], [-0.18, 0.4]]), '#2a1838');
  p.fill(hs(H, [[0.52, 0.0], [0.92, -0.02], [0.96, 0.32], [0.74, 0.46], [0.54, 0.34]]), '#2a1838');
  for (const [ex, ey, rr] of [[0.08, 0.24, 0.14], [0.76, 0.2, 0.11]] as const) {
    p.fill(ellipse(px(H, ex), py(H, ey), rr * 2.2 * r, rr * 1.8 * r), L.glow, 0.3);
    p.fill(ellipse(px(H, ex), py(H, ey), rr * r, rr * 0.85 * r), L.glow);
    p.fill(ellipse(px(H, ex + 0.03), py(H, ey - 0.03), rr * 0.4 * r), '#fff');
  }
  // nose
  p.fill(hs(H, [[0.48, 0.44], [0.58, 0.58], [0.52, 0.64, 1], [0.44, 0.6]]), '#2a1838');
  // teeth
  p.raw(`<path d="${hs(H, [[0.05, 0.7], [0.82, 0.68], [0.78, 0.92], [0.1, 0.94]])}" fill="${light(bone, 0.3)}" stroke-width="${f(0.1 * r)}"/>`);
  p.line(`M${f(px(H, 0.08))} ${f(py(H, 0.81))}L${f(px(H, 0.8))} ${f(py(H, 0.8))}M${f(px(H, 0.28))} ${f(py(H, 0.7))}v${f(0.24 * r)}M${f(px(H, 0.46))} ${f(py(H, 0.69))}v${f(0.24 * r)}M${f(px(H, 0.64))} ${f(py(H, 0.69))}v${f(0.24 * r)}`, '#5a4a5a', 0.045 * r);
}

function rockHead(p: Pen, L: HeroLook, H: Head): void {
  const r = H.r;
  const stone = L.skin;
  const shape: V[] = [[-0.1, -0.98, 1], [0.6, -0.92, 1], [1.02, -0.42, 1], [1.08, 0.22, 1], [0.86, 0.72, 1], [0.3, 1.0, 1], [-0.38, 0.92, 1], [-0.9, 0.54, 1], [-1.02, -0.12, 1], [-0.74, -0.72, 1]];
  const cracks =
    `M${f(px(H, -0.6))} ${f(py(H, -0.5))}l${f(0.22 * r)} ${f(0.18 * r)}l${f(-0.06 * r)} ${f(0.26 * r)}l${f(0.18 * r)} ${f(0.16 * r)}` +
    `M${f(px(H, 0.2))} ${f(py(H, -0.95))}l${f(0.06 * r)} ${f(0.28 * r)}l${f(0.2 * r)} ${f(0.08 * r)}` +
    `M${f(px(H, -0.2))} ${f(py(H, 0.95))}l${f(0.1 * r)} ${f(-0.2 * r)}l${f(-0.12 * r)} ${f(-0.12 * r)}`;
  p.shape(poly(S(H)(shape)), stone, {
    off: 5,
    dir: [1, -0.55],
    inner: `<path d="${cracks}" fill="none" stroke="${L.glow}" stroke-width="${f(0.08 * r)}" stroke-linejoin="round"/><path d="${cracks}" fill="none" stroke="#fff3a0" stroke-width="${f(0.03 * r)}"/>`,
    rim: light(stone, 0.35),
  });
  // brow ledge
  p.shape(poly(S(H)([[-0.3, -0.12], [1.05, -0.2], [1.0, 0.0], [-0.2, 0.08]])), shade(stone, 0.6), { shade: null, sw: 3.4 });
  drawEyes(p, L, H, { style: 'glow', outer: -0.5, inner: -0.1, brow: 'none', size: 1.1 });
  // glowing mouth crack
  p.raw(`<path d="${poly(S(H)([[0.12, 0.62], [0.36, 0.56], [0.5, 0.66], [0.72, 0.56], [0.86, 0.62], [0.74, 0.74], [0.5, 0.78], [0.25, 0.74]]))}" fill="${L.glow}" stroke-width="3"/>`);
}

function treeHead(p: Pen, L: HeroLook, H: Head): void {
  const r = H.r;
  const bark = L.skin;
  const shape: V[] = [[-0.05, -0.95], [0.62, -0.88], [0.98, -0.4], [1.04, 0.2], [0.92, 0.7], [0.5, 1.0], [-0.2, 1.0], [-0.75, 0.75], [-1.0, 0.15], [-0.92, -0.5], [-0.55, -0.88]];
  const grain =
    `M${f(px(H, -0.6))} ${f(py(H, -0.7))}q${f(-0.15 * r)} ${f(0.5 * r)} ${f(0.02 * r)} ${f(1.3 * r)}` +
    `M${f(px(H, -0.3))} ${f(py(H, -0.85))}q${f(-0.1 * r)} ${f(0.4 * r)} ${f(0.05 * r)} ${f(0.7 * r)}` +
    `M${f(px(H, 0.95))} ${f(py(H, -0.3))}q${f(-0.12 * r)} ${f(0.4 * r)} ${f(0.02 * r)} ${f(0.8 * r)}`;
  p.shape(hs(H, shape), bark, { off: 5, dir: [1, -0.55], inner: `<path d="${grain}" fill="none" stroke="${shade(bark, 1.4)}" stroke-width="${f(0.06 * r)}"/>` });
  // hollow eyes with glow
  for (const [ex, ey, rr] of [[0.1, 0.18, 0.2], [0.72, 0.15, 0.16]] as const) {
    p.fill(ellipse(px(H, ex), py(H, ey), rr * r * 1.05, rr * r * 0.85), '#2a1a12');
    p.fill(ellipse(px(H, ex + 0.02), py(H, ey + 0.02), rr * r * 0.55, rr * r * 0.45), L.glow);
    p.fill(ellipse(px(H, ex + 0.05), py(H, ey - 0.02), rr * r * 0.2), '#fff');
  }
  p.line(`M${f(px(H, -0.12))} ${f(py(H, -0.12))}L${f(px(H, 0.32))} ${f(py(H, -0.06))}M${f(px(H, 0.56))} ${f(py(H, -0.08))}L${f(px(H, 0.92))} ${f(py(H, -0.14))}`, darken(bark, 0.4), 0.11 * r);
  // knot nose
  p.shape(hs(H, [[0.36, 0.3], [0.6, 0.24], [0.82, 0.44, 1], [0.56, 0.5]]), light(bark, 0.15), { off: 1.5, sw: 3.6 });
}

function demonHead(p: Pen, L: HeroLook, H: Head): void {
  const r = H.r;
  p.shape(hs(H, [[0.02, -0.98], [0.62, -0.86], [0.98, -0.42], [1.06, 0.12], [1.0, 0.56], [0.7, 0.92], [0.2, 1.04], [-0.36, 0.96], [-0.76, 0.66], [-1.0, 0.16], [-0.94, -0.46], [-0.56, -0.86]]), L.skin, {
    off: 5,
    dir: [1, -0.55],
  });
  humanEar(p, { ...L, ear: 'pointy' }, H);
  // brow ridge
  p.shape(hs(H, [[-0.2, -0.04], [0.3, -0.06], [0.42, 0.06, 1], [0.56, -0.08], [1.04, -0.12], [1.0, 0.04], [0.6, 0.06], [0.4, 0.14], [0.2, 0.06], [-0.18, 0.1]]), shade(L.skin, 0.8), { shade: null, sw: 3 });
  drawEyes(p, L, H, { style: 'glow', outer: -0.6, inner: -0.05, brow: 'none', size: 1 });
  nose(p, L, H);
  const mx = px(H, 0.42);
  const my = py(H, 0.7);
  p.raw(`<path d="${smooth([[mx - 0.26 * r, my - 0.06 * r], [mx, my - 0.02 * r], [mx + 0.3 * r, my - 0.1 * r], [mx + 0.2 * r, my + 0.12 * r, 1], [mx - 0.2 * r, my + 0.1 * r, 1]])}" fill="${MOUTH_DARK}" stroke-width="${f(0.1 * r)}"/>`);
  // tusks
  p.shape(poly([[mx - 0.2 * r, my + 0.1 * r], [mx - 0.08 * r, my + 0.1 * r], [mx - 0.17 * r, my - 0.14 * r]]), '#fff6e0', { shade: null, sw: 3 });
  p.shape(poly([[mx + 0.1 * r, my + 0.1 * r], [mx + 0.2 * r, my + 0.1 * r], [mx + 0.18 * r, my - 0.12 * r]]), '#fff6e0', { shade: null, sw: 3 });
}

function shroudHead(p: Pen, L: HeroLook, H: Head): void {
  const r = H.r;
  const cloth = L.skin;
  p.shape(hs(H, [[-0.1, -1.6, 1], [0.5, -1.15], [1.05, -0.55], [1.25, 0.2], [1.12, 0.9], [0.5, 1.15], [-0.4, 1.1], [-1.08, 0.7], [-1.22, -0.1], [-0.9, -0.85]]), cloth, {
    off: 5,
    dir: [1, -0.55],
    inner: `<path d="M${f(px(H, -0.75))} ${f(py(H, -0.6))}q${f(0.15 * r)} ${f(0.6 * r)} ${f(-0.1 * r)} ${f(1.2 * r)}" fill="none" stroke="${shade(cloth, 1.2)}" stroke-width="${f(0.07 * r)}"/>`,
  });
  // dark face hollow
  p.shape(hs(H, [[-0.25, -0.35], [0.4, -0.55], [1.02, -0.3], [1.12, 0.3], [0.9, 0.82], [0.3, 0.92], [-0.22, 0.6], [-0.35, 0.1]]), '#1a1030', { shade: null, sw: 3.6 });
  drawEyes(p, L, H, { style: 'glow', outer: -0.85, inner: -0.4, brow: 'none', size: 1.1 });
  p.fill(smooth([[px(H, 0.25), py(H, 0.62)], [px(H, 0.45), py(H, 0.56)], [px(H, 0.68), py(H, 0.62)], [px(H, 0.45), py(H, 0.75)]]), L.glow, 0.7);
}

// ---------------------------------------------------------------------------
// Headgear
// ---------------------------------------------------------------------------

/** Headgear parts drawn behind the head. */
function hatBack(p: Pen, L: HeroLook, H: Head, kind: string): void {
  const r = H.r;
  const c = L.hat ?? L.cloth;
  const c2 = L.hat2 ?? L.trim;
  switch (kind) {
    case 'hood':
    case 'snake-hood':
    case 'spider-hood':
      p.shape(hs(H, [[-0.2, -1.22], [0.6, -1.12], [1.12, -0.6], [1.2, 0.2], [1.0, 0.95], [0.3, 1.2], [-0.5, 1.25], [-1.15, 1.0], [-1.3, 0.2], [-1.12, -0.7]]), shade(c, 0.6), { off: 3 });
      break;
    case 'headscarf':
      p.shape(hs(H, [[-0.2, -1.2], [0.7, -1.05], [1.18, -0.4], [1.15, 0.5], [0.6, 1.15], [-0.4, 1.4], [-1.35, 1.25, 1], [-1.28, 0.3], [-1.12, -0.7]]), shade(c, 0.6), { off: 3 });
      break;
    case 'bell-veil':
      p.shape(hs(H, [[-0.3, -1.15], [0.6, -1.05], [1.15, -0.5], [1.2, 0.5], [1.05, 1.3], [0.4, 1.55], [-0.6, 1.75], [-1.4, 1.6, 1], [-1.3, 0.6], [-1.1, -0.6]]), c, { off: 4, inner: `<path d="${hs(H, [[-1.45, 1.4], [-0.6, 1.5], [0.4, 1.35], [1.1, 1.1], [1.2, 1.8], [-1.5, 1.9]])}" fill="${c2}"/>` });
      break;
    case 'sun-halo': {
      const cx = px(H, -0.15);
      const cy = py(H, -0.35);
      p.raw(`<g class="hs-halo" style="transform-origin:${f(cx)}px ${f(cy)}px">`);
      p.shape(star(cx, cy, 1.75 * r, 1.25 * r, 14, 0), c2, { shade: light(c2, 0.2), off: 0, opacity: 0.95 });
      p.shape(ellipse(cx, cy, 1.3 * r), L.glow, { shade: null, sw: 3 });
      p.fill(ellipse(cx, cy, 1.08 * r), light(L.glow, 0.5));
      p.raw('</g>');
      break;
    }
    case 'halo':
      break;
    case 'leaf-crown':
      leafCluster(p, H, c, c2, true);
      break;
    case 'helm-eagle':
      // feather plume behind
      p.shape(hs(H, [[-0.4, -0.95], [-1.0, -1.4], [-1.6, -1.3, 1], [-1.25, -0.95], [-1.75, -0.75, 1], [-1.2, -0.5], [-1.5, -0.1, 1], [-0.9, -0.2]]), '#fffaf0', { off: 3 });
      break;
    case 'witch':
    case 'wizard':
      // back half of the brim
      p.shape(ellipse(px(H, -0.02), py(H, -0.62), 1.75 * r, 0.42 * r), shade(c, 0.7), { off: 2 });
      break;
    default:
      break;
  }
}

function leafCluster(p: Pen, H: Head, c: string, c2: string, back: boolean): void {
  const r = H.r;
  const blobs: [number, number, number][] = back
    ? [[-0.9, -0.9, 0.55], [-0.2, -1.35, 0.62], [0.6, -1.15, 0.55], [1.05, -0.6, 0.42], [-1.15, -0.3, 0.42]]
    : [[-0.55, -1.05, 0.45], [0.2, -1.2, 0.5], [0.8, -0.85, 0.4]];
  for (const [bx, by, br] of blobs) {
    p.shape(ellipse(px(H, bx), py(H, by), br * r, br * r * 0.88), back ? shade(c, 0.55) : c, { off: 4, rim: back ? undefined : light(c, 0.45) });
  }
  if (!back) {
    for (const [bx, by] of [[-0.5, -1.25], [0.45, -1.45], [0.95, -0.95], [-0.05, -0.95]] as const) {
      p.shape(star(px(H, bx), py(H, by), 0.14 * r, 0.06 * r, 5, 18), c2, { shade: null, sw: 2.6 });
      p.fill(ellipse(px(H, bx), py(H, by), 0.04 * r), '#fff7c2');
    }
  }
}

function hatFront(p: Pen, L: HeroLook, H: Head, kind: string): void {
  const r = H.r;
  const c = L.hat ?? L.cloth;
  const c2 = L.hat2 ?? L.trim;
  const metal = L.metal ?? '#c9d3e3';
  switch (kind) {
    case 'nightcap': {
      p.shape(
        hs(H, [[-1.12, 0.22], [-1.16, -0.38], [-0.92, -0.95], [-0.45, -1.42], [0.05, -1.62], [-0.3, -1.95], [-0.95, -2.0], [-1.45, -1.72], [-1.62, -1.32, 1], [-1.22, -1.5], [-0.82, -1.62], [-0.55, -1.55], [-0.2, -1.32], [0.5, -1.02], [1.0, -0.62], [1.14, -0.22], [0.6, -0.42], [-0.2, -0.42], [-0.7, -0.2]]),
        c,
        { off: 4, inner: `<path d="${star(px(H, -0.15), py(H, -0.95), 0.2 * r, 0.09 * r, 5, 10)}" fill="${c2}"/>` },
      );
      // soft brim
      p.shape(hs(H, [[-1.2, 0.3], [-1.24, -0.18], [-0.8, -0.5], [0.0, -0.66], [0.7, -0.6], [1.18, -0.32], [1.2, -0.06], [0.7, -0.3], [0.0, -0.38], [-0.7, -0.18], [-1.0, 0.25, 1]]), light(c, 0.55), { off: 2.5 });
      // crescent charm at the tip
      const tx = px(H, -1.62);
      const ty = py(H, -1.25);
      p.shape(`M${f(tx - 0.2 * r)} ${f(ty - 0.15 * r)}a${f(0.24 * r)} ${f(0.24 * r)} 0 1 0 ${f(0.38 * r)} ${f(0.3 * r)}a${f(0.2 * r)} ${f(0.2 * r)} 0 1 1 ${f(-0.38 * r)} ${f(-0.3 * r)}Z`, c2, { shade: null, sw: 3 });
      break;
    }
    case 'helm-bat': {
      // swept-back bat-wing fins
      const fin = `<path d="M0 0" fill="none"/>`;
      p.shape(hs(H, [[-0.72, -0.82], [-1.2, -1.22], [-1.88, -1.42, 1], [-1.6, -1.06], [-1.74, -0.78, 1], [-1.38, -0.66], [-1.42, -0.38, 1], [-1.0, -0.34]]), metal, {
        off: 2.5,
        rim: '#ffffff',
        inner: fin + `<path d="${hs(H, [[-1.0, -0.9], [-1.6, -1.22], [-1.45, -0.9], [-1.25, -0.55], [-1.0, -0.5]])}" fill="${L.glow}" opacity=".45"/>`,
      });
      p.shape(hs(H, [[0.2, -1.02], [0.5, -1.5], [0.98, -1.92, 1], [0.95, -1.52], [1.22, -1.38, 1], [1.0, -1.18], [1.12, -0.92, 1], [0.78, -0.86]]), shade(metal, 0.4), { off: 2 });
      p.shape(hs(H, [[-1.12, 0.35], [-1.16, -0.35], [-0.86, -0.95], [-0.2, -1.2], [0.5, -1.12], [1.0, -0.75], [1.18, -0.2], [1.12, -0.02, 1], [0.6, -0.18], [0.42, 0.12, 1], [0.24, -0.18], [-0.3, -0.14], [-0.62, 0.0], [-0.72, 0.5, 1]]), metal, {
        off: 4,
        rim: '#ffffff',
        inner: `<path d="${hs(H, [[-1.2, -0.25], [-0.6, -0.42], [0.2, -0.46], [1.2, -0.48], [1.2, -0.3], [0.2, -0.28], [-0.6, -0.24], [-1.2, -0.05]])}" fill="${c2}"/>`,
      });
      p.shape(ellipse(px(H, 0.3), py(H, -0.38), 0.11 * r), L.glow, { shade: null, sw: 3 });
      break;
    }
    case 'witch':
    case 'wizard': {
      const wiz = kind === 'wizard';
      // front brim
      p.shape(`M${f(px(H, -1.78))} ${f(py(H, -0.62))}A${f(1.75 * r)} ${f(0.42 * r)} 0 0 0 ${f(px(H, 1.74))} ${f(py(H, -0.62))}Q${f(px(H, 0))} ${f(py(H, -0.42))} ${f(px(H, -1.78))} ${f(py(H, -0.62))}Z`, c, { off: 2.5 });
      // cone with a bent tip
      const cone: V[] = wiz
        ? [[-0.95, -0.68], [-0.62, -1.3], [-0.42, -1.95], [-0.62, -2.55], [-1.15, -2.8, 1], [-0.32, -2.62], [-0.02, -2.0], [0.32, -1.3], [0.88, -0.66]]
        : [[-0.92, -0.7], [-0.5, -1.4], [-0.15, -2.05], [-0.55, -2.6], [-1.25, -2.62, 1], [-0.2, -2.45], [0.28, -1.92], [0.5, -1.3], [0.9, -0.68]];
      p.shape(hs(H, cone), c, {
        off: 5,
        rim: light(c, 0.35),
        inner:
          `<path d="${hs(H, [[-1.1, -0.95], [0.0, -1.08], [1.0, -0.98], [1.0, -0.66], [0.0, -0.76], [-1.1, -0.64]])}" fill="${c2}"/>` +
          (wiz
            ? `<path d="${star(px(H, -0.25), py(H, -1.55), 0.17 * r, 0.07 * r)}${star(px(H, 0.25), py(H, -1.25), 0.11 * r, 0.05 * r)}${star(px(H, -0.5), py(H, -2.15), 0.1 * r, 0.04 * r)}" fill="${L.trim}"/>`
            : ''),
      });
      if (!wiz) {
        // eclipse ornament on the band
        const ox = px(H, 0.1);
        const oy = py(H, -0.85);
        p.shape(ellipse(ox, oy, 0.22 * r), '#1c1236', { shade: null, sw: 3, rim: L.glow, rimW: 2.2 });
        p.fill(`M${f(ox - 0.2 * r)} ${f(oy)}a${f(0.22 * r)} ${f(0.22 * r)} 0 0 0 ${f(0.38 * r)} ${f(0.12 * r)}a${f(0.18 * r)} ${f(0.18 * r)} 0 0 1 ${f(-0.38 * r)} ${f(-0.12 * r)}Z`, L.glow);
      }
      break;
    }
    case 'hood':
    case 'snake-hood':
    case 'spider-hood': {
      const front: V[] = [[-1.08, 1.0, 1], [-1.3, 0.2], [-1.15, -0.62], [-0.55, -1.18], [0.3, -1.22], [0.95, -0.92], [1.22, -0.38], [1.22, 0.1, 1], [0.92, -0.32], [0.45, -0.5], [-0.05, -0.46], [-0.38, -0.2], [-0.5, 0.28], [-0.58, 0.85, 1]];
      p.shape(hs(H, front), c, { off: 4.5, rim: light(c, 0.3) });
      if (kind === 'snake-hood') {
        // cobra eyes and fangs on the hood brim
        p.shape(ellipse(px(H, 0.0), py(H, -0.8), 0.13 * r, 0.1 * r), '#ffe14a', { shade: null, sw: 3 });
        p.shape(ellipse(px(H, 0.62), py(H, -0.82), 0.12 * r, 0.09 * r), '#ffe14a', { shade: null, sw: 3 });
        p.fill(ellipse(px(H, 0.0), py(H, -0.8), 0.03 * r, 0.08 * r), OUTLINE);
        p.fill(ellipse(px(H, 0.62), py(H, -0.82), 0.03 * r, 0.07 * r), OUTLINE);
        p.raw(`<path d="${hs(H, [[-0.9, -0.3], [-0.6, -0.9], [0.0, -1.1], [0.7, -1.0]])}" fill="none" stroke="${c2}" stroke-width="${f(0.08 * r)}" stroke-dasharray="${f(0.12 * r)} ${f(0.12 * r)}" paint-order="normal"/>`);
      }
      if (kind === 'spider-hood') {
        for (const [ex, ey, rr] of [[-0.05, -0.68, 0.07], [0.22, -0.75, 0.08], [0.5, -0.74, 0.07], [0.78, -0.66, 0.06], [0.08, -0.9, 0.05], [0.38, -0.95, 0.05]] as const) {
          p.fill(ellipse(px(H, ex), py(H, ey), rr * 2 * r), L.glow, 0.3);
          p.fill(ellipse(px(H, ex), py(H, ey), rr * r), L.glow);
        }
      }
      break;
    }
    case 'mask': {
      p.shape(hs(H, [[-0.5, 0.52], [0.1, 0.5], [0.6, 0.48], [1.08, 0.4], [1.04, 0.72], [0.62, 0.98], [0.1, 1.05], [-0.44, 0.92]]), c2, { off: 3, inner: `<path d="M${f(px(H, -0.2))} ${f(py(H, 0.7))}l${f(1.1 * r)} ${f(-0.06 * r)}" stroke="${shade(c2, 1.3)}" stroke-width="${f(0.05 * r)}" fill="none"/>` });
      break;
    }
    case 'helm-great': {
      const shape: V[] = [[-1.08, 0.95], [-1.15, -0.2], [-0.88, -0.86], [-0.05, -1.14], [0.8, -0.95], [1.16, -0.32], [1.2, 0.5], [1.0, 1.0]];
      p.shape(hs(H, shape), metal, {
        off: 6,
        dir: [1, -0.5],
        rim: '#ffffff',
        inner:
          `<path d="${hs(H, [[0.36, -1.2], [0.56, -1.2], [0.6, 1.1], [0.4, 1.1]])}" fill="${c2}"/>` +
          `<path d="${hs(H, [[-1.2, 0.62], [1.3, 0.55], [1.3, 0.72], [-1.2, 0.8]])}" fill="${c2}"/>`,
      });
      // visor slit
      p.shape(hs(H, [[-0.18, 0.06], [1.2, 0.0], [1.2, 0.26], [-0.12, 0.3]]), '#151025', { shade: null, sw: 3 });
      p.fill(ellipse(px(H, 0.18), py(H, 0.15), 0.12 * r, 0.06 * r), L.glow);
      p.fill(ellipse(px(H, 0.82), py(H, 0.13), 0.1 * r, 0.05 * r), L.glow);
      for (const [hx, hy] of [[0.8, 0.42], [0.95, 0.4], [0.8, 0.52], [0.95, 0.5]] as const) p.fill(ellipse(px(H, hx), py(H, hy), 0.035 * r), '#2a2140');
      // plume
      p.shape(hs(H, [[0.0, -1.05], [-0.3, -1.6], [-0.9, -1.72], [-1.45, -1.35], [-1.7, -0.7, 1], [-1.3, -1.1], [-0.95, -1.25], [-0.55, -1.15], [-0.25, -0.95]]), c, { off: 3, rim: light(c, 0.4) });
      break;
    }
    case 'goggles': {
      p.shape(hs(H, [[-1.1, 0.25], [-1.12, -0.4], [-0.8, -0.92], [-0.1, -1.16], [0.6, -1.05], [1.04, -0.62], [1.12, -0.25], [0.6, -0.42], [-0.3, -0.36], [-0.75, -0.1]]), c, { off: 4, rim: light(c, 0.3) });
      p.shape(hs(H, [[-1.14, -0.24], [-0.4, -0.5], [0.4, -0.56], [1.16, -0.46], [1.16, -0.28], [0.4, -0.36], [-0.4, -0.3], [-1.14, -0.04]]), '#3a2a22', { shade: null, sw: 3 });
      for (const [gx, gy, gr] of [[-0.02, -0.5, 0.26], [0.66, -0.5, 0.22]] as const) {
        p.shape(ellipse(px(H, gx), py(H, gy), gr * r), L.trim, { off: 2, rim: '#fff3c0' });
        p.shape(ellipse(px(H, gx), py(H, gy), gr * 0.68 * r), '#7fe0ff', { shade: '#3aa0d0', off: 2.5, sw: 3, inner: `<path d="M${f(px(H, gx - 0.08))} ${f(py(H, gy - 0.1))}l${f(0.12 * r)} ${f(-0.06 * r)}" stroke="#fff" stroke-width="${f(0.07 * r)}" stroke-linecap="round"/>` });
      }
      break;
    }
    case 'bell-veil': {
      p.shape(hs(H, [[-1.2, 1.25], [-1.32, 0.2], [-1.1, -0.66], [-0.5, -1.15], [0.35, -1.18], [0.98, -0.85], [1.2, -0.3], [1.18, 0.15, 1], [0.8, -0.4], [0.2, -0.56], [-0.3, -0.4], [-0.55, 0.0], [-0.62, 0.7], [-0.72, 1.25, 1]]), c, {
        off: 4,
        inner: `<path d="${hs(H, [[-1.4, -0.7], [-0.4, -0.86], [0.5, -0.88], [1.3, -0.72], [1.3, -0.5], [0.5, -0.66], [-0.4, -0.64], [-1.4, -0.48]])}" fill="${c2}"/>`,
      });
      // bell crown
      const bx = px(H, -0.05);
      const by = py(H, -1.2);
      p.shape(smooth([[bx - 0.32 * r, by + 0.22 * r, 1], [bx - 0.24 * r, by - 0.08 * r], [bx, by - 0.38 * r], [bx + 0.24 * r, by - 0.08 * r], [bx + 0.32 * r, by + 0.22 * r, 1]]), L.trim, { off: 2.5, rim: '#fff6c8' });
      p.shape(ellipse(bx, by + 0.28 * r, 0.09 * r), L.trim, { shade: null, sw: 3 });
      p.shape(ellipse(bx, by - 0.45 * r, 0.08 * r), L.glow, { shade: null, sw: 2.6 });
      break;
    }
    case 'helm-eagle': {
      p.shape(hs(H, [[-1.12, 0.3], [-1.15, -0.35], [-0.86, -0.95], [-0.2, -1.2], [0.5, -1.12], [1.0, -0.8], [1.3, -0.4], [1.7, -0.12, 1], [1.2, -0.02], [0.72, -0.16], [0.4, -0.12], [-0.1, -0.24], [-0.55, -0.08], [-0.68, 0.4, 1]]), metal, {
        off: 4.5,
        rim: '#fff',
        inner: `<path d="${hs(H, [[0.7, -1.2], [1.3, -0.6], [1.8, -0.12], [1.2, 0.0], [0.6, -0.2]])}" fill="${L.trim}"/>`,
      });
      p.shape(ellipse(px(H, 0.95), py(H, -0.5), 0.1 * r), OUTLINE, { shade: null, sw: 2 });
      p.fill(ellipse(px(H, 0.97), py(H, -0.52), 0.04 * r), '#fff');
      break;
    }
    case 'horns-small': {
      p.shape(hs(H, [[-0.62, -0.72], [-0.9, -1.25], [-0.72, -1.55, 1], [-0.55, -1.15], [-0.3, -0.92]]), L.hat ?? '#3a2430', { off: 2.5, rim: '#ffffff' });
      p.shape(hs(H, [[0.3, -0.98], [0.42, -1.48], [0.72, -1.7, 1], [0.66, -1.25], [0.72, -0.9]]), L.hat ?? '#3a2430', { off: 2.5, rim: '#ffffff' });
      break;
    }
    case 'horns-big': {
      const hc = L.hat ?? '#efe1c4';
      const ring = `<path d="M0 0" fill="none"/>`;
      p.shape(hs(H, [[-0.55, -0.68], [-1.05, -0.95], [-1.62, -1.0], [-2.0, -1.4], [-2.05, -2.05, 1], [-1.72, -1.62], [-1.32, -1.5], [-0.82, -1.4], [-0.3, -1.05]]), hc, {
        off: 4,
        rim: '#ffffff',
        inner: ring + `<path d="M${f(px(H, -1.6))} ${f(py(H, -1.62))}l${f(0.05 * r)} ${f(0.6 * r)}M${f(px(H, -1.15))} ${f(py(H, -1.5))}l${f(0.02 * r)} ${f(0.55 * r)}" stroke="${shade(hc, 1.5)}" stroke-width="${f(0.07 * r)}" fill="none"/><path d="${hs(H, [[-2.2, -2.2], [-1.75, -1.4], [-2.1, -1.2]])}" fill="${darken(hc, 0.65)}"/>`,
      });
      p.shape(hs(H, [[0.3, -0.98], [0.62, -1.42], [0.9, -1.85], [1.4, -2.2, 1], [1.2, -1.7], [1.02, -1.22], [0.8, -0.84]]), hc, {
        off: 3.5,
        rim: '#ffffff',
        inner: `<path d="${hs(H, [[1.5, -2.4], [1.0, -1.75], [1.35, -1.55]])}" fill="${darken(hc, 0.65)}"/>`,
      });
      break;
    }
    case 'flame-crown': {
      const fl: V[] = [[-0.75, -0.75], [-0.85, -1.35, 1], [-0.52, -1.05], [-0.38, -1.7, 1], [-0.12, -1.15], [0.12, -1.95, 1], [0.35, -1.2], [0.62, -1.7, 1], [0.7, -1.05], [1.0, -1.32, 1], [0.92, -0.7]];
      p.shape(hs(H, fl), L.glow, { shade: mix(L.glow, '#ff3a1a', 0.6), off: 3, inner: `<path d="${hs(H, [[-0.5, -0.8], [-0.38, -1.4], [-0.1, -1.0], [0.12, -1.6], [0.32, -1.0], [0.6, -1.4], [0.65, -0.8]])}" fill="#fff3a0"/>` });
      p.shape(hs(H, [[-0.85, -0.55], [-0.7, -1.0, 1], [-0.4, -0.78], [-0.1, -1.1, 1], [0.2, -0.82], [0.5, -1.12, 1], [0.72, -0.82], [0.98, -1.0, 1], [1.0, -0.5], [0.1, -0.68]]), L.trim, { off: 2.5, rim: '#fff3c0' });
      break;
    }
    case 'ember-tiara': {
      p.shape(hs(H, [[-0.95, -0.42], [-0.4, -0.72], [0.3, -0.76], [1.0, -0.5], [1.0, -0.36], [0.3, -0.6], [-0.4, -0.56], [-0.95, -0.26]]), L.trim, { off: 1.5, rim: '#fff3c0' });
      const fx = px(H, 0.28);
      const fy = py(H, -0.75);
      p.shape(smooth([[fx - 0.16 * r, fy + 0.04 * r], [fx - 0.12 * r, fy - 0.2 * r], [fx, fy - 0.45 * r, 1], [fx + 0.12 * r, fy - 0.2 * r], [fx + 0.16 * r, fy + 0.04 * r]]), L.glow, { shade: '#ff5a1f', off: 2, inner: `<path d="${ellipse(fx, fy - 0.08 * r, 0.06 * r, 0.12 * r)}" fill="#fff6b0"/>` });
      break;
    }
    case 'mushroom-cap': {
      const lift = (pts: V[]): V[] => pts.map((q) => (q.length > 2 ? [q[0], q[1] - 0.32, q[2] as number] : [q[0], q[1] - 0.32]));
      const cap: V[] = lift([[-1.62, 0.02], [-1.42, -0.65], [-0.8, -1.22], [0.15, -1.42], [1.0, -1.18], [1.55, -0.62], [1.7, -0.05], [1.2, -0.12], [0.5, -0.18], [-0.3, -0.12], [-1.0, -0.04]]);
      p.shape(hs(H, lift([[-1.5, 0.02], [-0.6, -0.12], [0.5, -0.2], [1.6, -0.08], [1.2, 0.18], [0.3, 0.12], [-0.8, 0.18]])), '#f6e2c2', { off: 2 });
      p.shape(hs(H, cap), c, {
        off: 6,
        rim: light(c, 0.45),
        inner:
          `<path d="${ellipse(px(H, -0.6), py(H, -1.14), 0.22 * r, 0.17 * r)}${ellipse(px(H, 0.25), py(H, -1.44), 0.26 * r, 0.18 * r)}${ellipse(px(H, 1.0), py(H, -1.02), 0.2 * r, 0.16 * r)}${ellipse(px(H, -1.15), py(H, -0.62), 0.14 * r, 0.12 * r)}${ellipse(px(H, 0.55), py(H, -0.77), 0.13 * r, 0.1 * r)}" fill="${c2}"/>`,
      });
      break;
    }
    case 'antlers': {
      const ac = L.hat ?? '#a9784a';
      const ant = (side: number) => {
        const bx = side < 0 ? px(H, -0.5) : px(H, 0.4);
        const by = side < 0 ? py(H, -0.82) : py(H, -0.95);
        const s = side < 0 ? 1 : 0.85;
        const m = (dx: number, dy: number): [number, number] => [bx + dx * r * s * (side < 0 ? -1 : 1), by + dy * r * s];
        p.shape(tube([m(0, 0), m(0.3, -0.6), m(0.45, -1.25), m(0.3, -1.85)], [0.2 * r, 0.16 * r, 0.13 * r, 0.08 * r]), ac, { off: 2, rim: light(ac, 0.5) });
        p.shape(tube([m(0.3, -0.6), m(0.85, -0.85), m(1.1, -1.3)], [0.12 * r, 0.1 * r, 0.06 * r]), ac, { off: 1.5 });
        p.shape(tube([m(0.42, -1.15), m(0.0, -1.55), m(-0.12, -1.85)], [0.11 * r, 0.09 * r, 0.06 * r]), ac, { off: 1.5 });
        p.shape(tube([m(0.4, -1.35), m(0.8, -1.7)], [0.1 * r, 0.06 * r]), ac, { off: 1.5 });
      };
      ant(1);
      ant(-1);
      // little leaves on the antlers
      for (const [lx, ly, rot] of [[-1.3, -1.6, -40], [0.95, -1.95, 30], [-0.75, -2.2, -10]] as const) {
        p.at(px(H, lx), py(H, ly), rot).shape(smooth([[0, 0, 1], [-0.12 * r, -0.18 * r], [0, -0.4 * r, 1], [0.12 * r, -0.18 * r]]), L.trim, { off: 1.5, sw: 3 }).close();
      }
      break;
    }
    case 'leaf-crown':
      leafCluster(p, H, c, c2, false);
      break;
    case 'headscarf': {
      p.shape(hs(H, [[-0.8, 1.08, 1], [-1.3, 0.25], [-1.2, -0.62], [-0.6, -1.18], [0.3, -1.22], [0.95, -0.9], [1.2, -0.35], [1.15, 0.05, 1], [0.8, -0.38], [0.2, -0.52], [-0.3, -0.38], [-0.5, 0.1], [-0.42, 0.7], [-0.1, 0.98], [0.3, 1.1, 1], [-0.2, 1.22]]), c, {
        off: 4.5,
        inner: `<path d="${hs(H, [[-1.4, -0.3], [-0.6, -0.95], [0.4, -1.05], [1.3, -0.6], [1.3, -0.42], [0.4, -0.85], [-0.6, -0.76], [-1.4, -0.1]])}" fill="${c2}"/>` +
          `<path d="${ellipse(px(H, -0.75), py(H, -0.3), 0.07 * r)}${ellipse(px(H, -0.2), py(H, -0.85), 0.07 * r)}${ellipse(px(H, 0.5), py(H, -0.82), 0.07 * r)}" fill="${c2}"/>`,
      });
      // knot
      p.shape(ellipse(px(H, 0.12), py(H, 1.12), 0.15 * r, 0.12 * r), c, { off: 1.5 });
      p.shape(hs(H, [[0.1, 1.18], [0.32, 1.6, 1], [0.0, 1.45], [-0.25, 1.62, 1], [-0.05, 1.15]]), c, { off: 1.5 });
      break;
    }
    case 'carapace': {
      const cc = L.hat ?? '#3b2a52';
      p.shape(hs(H, [[-1.1, 0.4], [-1.18, -0.3], [-0.9, -0.9], [-0.2, -1.2], [0.55, -1.12], [1.05, -0.72], [1.22, -0.2], [1.12, -0.02, 1], [0.6, -0.2], [0.0, -0.18], [-0.55, 0.0], [-0.7, 0.55, 1]]), cc, {
        off: 4.5,
        rim: light(cc, 0.5),
        inner: `<path d="M${f(px(H, -1.0))} ${f(py(H, -0.62))}Q${f(px(H, 0))} ${f(py(H, -1.0))} ${f(px(H, 1.1))} ${f(py(H, -0.5))}M${f(px(H, -1.1))} ${f(py(H, -0.2))}Q${f(px(H, 0))} ${f(py(H, -0.62))} ${f(px(H, 1.2))} ${f(py(H, -0.15))}" stroke="${L.trim}" stroke-width="${f(0.07 * r)}" fill="none"/>`,
      });
      // bone ridge crest
      p.shape(hs(H, [[-0.75, -0.95], [-0.35, -1.35, 1], [-0.1, -1.08], [0.25, -1.4, 1], [0.45, -1.08], [0.8, -1.22, 1], [0.95, -0.8]]), L.trim, { off: 2 });
      break;
    }
    case 'bone-crown': {
      const bc = L.hat ?? '#efe3c8';
      p.shape(hs(H, [[-0.92, -0.38], [-1.05, -1.05, 1], [-0.72, -0.78], [-0.55, -1.35, 1], [-0.28, -0.9], [0.0, -1.6, 1], [0.25, -0.98], [0.52, -1.42, 1], [0.66, -0.92], [1.0, -1.15, 1], [0.98, -0.52], [0.1, -0.68]]), bc, { off: 3, rim: '#fff' });
      p.shape(hs(H, [[-0.98, -0.42], [0.0, -0.74], [1.02, -0.56], [1.02, -0.38], [0.0, -0.52], [-0.98, -0.22]]), L.trim, { off: 1.5 });
      p.shape(ellipse(px(H, 0.0), py(H, -0.66), 0.1 * r), L.glow, { shade: null, sw: 2.6 });
      break;
    }
    case 'feather-band': {
      p.shape(hs(H, [[-1.02, -0.32], [-0.4, -0.62], [0.4, -0.66], [1.05, -0.42], [1.05, -0.28], [0.4, -0.5], [-0.4, -0.46], [-1.0, -0.14]]), L.trim, { off: 1.5 });
      for (const [fx, fy, rot] of [[-0.95, -0.3, -70], [-0.9, -0.15, -95]] as const) {
        p.at(px(H, fx), py(H, fy), rot).shape(smooth([[0, 0, 1], [-0.16 * r, -0.4 * r], [0, -0.95 * r, 1], [0.18 * r, -0.42 * r]]), '#ffffff', { off: 2, sw: 3.4, inner: `<path d="M0 0L0 ${f(-0.85 * r)}" stroke="#c8d6e8" stroke-width="1.2"/>` }).close();
      }
      p.shape(ellipse(px(H, 0.3), py(H, -0.58), 0.1 * r), L.glow, { shade: null, sw: 2.6 });
      break;
    }
    case 'visor': {
      p.shape(hs(H, [[-0.42, 0.04], [0.2, -0.08], [1.18, -0.06], [1.25, 0.18], [1.1, 0.42], [0.2, 0.44], [-0.36, 0.38]]), '#7fdcff', {
        shade: '#3d8ad6',
        off: 3,
        sw: 4.6,
        inner: `<path d="M${f(px(H, 0.1))} ${f(py(H, 0.05))}l${f(0.35 * r)} 0M${f(px(H, 0.65))} ${f(py(H, 0.04))}l${f(0.2 * r)} 0" stroke="#fff" stroke-width="${f(0.07 * r)}" stroke-linecap="round" opacity=".9"/>`,
      });
      p.shape(hs(H, [[-0.5, 0.0], [-0.95, -0.1], [-0.9, 0.24], [-0.45, 0.36]]), L.trim, { off: 1.5 });
      break;
    }
    case 'halo': {
      const hx = px(H, 0.0);
      const hy = py(H, -1.35);
      p.raw(`<g class="hs-halo" style="transform-origin:${f(hx)}px ${f(hy)}px">`);
      p.fill(ellipse(hx, hy, 0.85 * r, 0.24 * r), L.glow, 0.35);
      p.raw(`<path d="${ellipse(hx, hy, 0.62 * r, 0.16 * r)}" fill="none" stroke="${OUTLINE}" stroke-width="${f(0.24 * r)}"/>`);
      p.raw(`<path d="${ellipse(hx, hy, 0.62 * r, 0.16 * r)}" fill="none" stroke="${L.trim}" stroke-width="${f(0.12 * r)}" paint-order="normal"/>`);
      p.raw('</g>');
      break;
    }
    case 'circlet': {
      p.shape(hs(H, [[-0.95, -0.42], [-0.4, -0.66], [0.3, -0.7], [1.0, -0.46], [1.0, -0.32], [0.3, -0.54], [-0.4, -0.5], [-0.95, -0.26]]), L.trim, { off: 1.5, rim: '#fff6c8' });
      p.shape(smooth([[px(H, 0.28), py(H, -0.82), 1], [px(H, 0.4), py(H, -0.6), 1], [px(H, 0.28), py(H, -0.44), 1], [px(H, 0.16), py(H, -0.6), 1]]), L.glow, { shade: null, sw: 2.6 });
      break;
    }
    case 'sun-halo':
      break;
    default:
      break;
  }
}

/** Everything that sits behind the head (long hair, hoods, halos, crests). */
export function drawHeadBack(p: Pen, L: HeroLook, H: Head): void {
  if (L.head === 'lion') {
    const r = H.r;
    const mane: V[] = [];
    const n = 15;
    for (let i = 0; i < n * 2; i++) {
      const t = (i / (n * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? 1.62 : 1.25;
      const sharp = i % 2 === 0 ? 1 : 0;
      mane.push([H.x - 0.2 * r + Math.cos(t) * rr * r * 1.02, H.y + 0.05 * r + Math.sin(t) * rr * r * 0.98, sharp]);
    }
    const mc = L.hair?.color ?? '#c0602a';
    p.shape(smooth(mane), mc, { off: 5, rim: light(mc, 0.4), inner: `<path d="${ellipse(H.x - 0.2 * r, H.y + 0.05 * r, 1.12 * r)}" fill="${shade(mc, 0.6)}"/>` });
  }
  const covering = (h: string) => h === 'hood' || h === 'snake-hood' || h === 'spider-hood' || h === 'headscarf' || h === 'bell-veil';
  for (const h of L.hats ?? []) if (!covering(h)) hatBack(p, L, H, h);
  if (L.head !== 'lion') drawHairBack(p, L, H);
  for (const h of L.hats ?? []) if (covering(h)) hatBack(p, L, H, h);
}

/** Head, face, front hair, beard and headgear. */
export function drawHead(p: Pen, L: HeroLook, H: Head): void {
  switch (L.head) {
    case 'human':
      humanHead(p, L, H);
      face(p, L, H);
      break;
    case 'mushroom':
      humanHead(p, L, H, WIDE);
      face(p, L, H);
      break;
    case 'fox':
      foxHead(p, L, H);
      break;
    case 'bear':
      bearHead(p, L, H);
      break;
    case 'lion':
      lionHead(p, L, H);
      break;
    case 'owl':
      owlHead(p, L, H);
      break;
    case 'lizard':
      lizardHead(p, L, H);
      break;
    case 'skull':
      skullHead(p, L, H);
      break;
    case 'rock':
      rockHead(p, L, H);
      break;
    case 'tree':
      treeHead(p, L, H);
      break;
    case 'demon':
      demonHead(p, L, H);
      break;
    case 'shroud':
      shroudHead(p, L, H);
      break;
  }
  if (L.head !== 'lion') drawHairFront(p, L, H);
  if ((L.head === 'human' || L.head === 'mushroom') && L.hair && L.hair.style !== 'none') {
    drawEyes(p, L, H, exprEyes(L), { eyes: false, browColor: darken(L.hair.color, 0.45) });
  } else if (L.head === 'human' || L.head === 'mushroom') {
    drawEyes(p, L, H, exprEyes(L), { eyes: false });
  }
  beard(p, L, H);
  for (const h of L.hats ?? []) hatFront(p, L, H, h);
}
