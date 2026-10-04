// Bodies: legs/boots, torso + outfits, arms + hands.
import { darken, light, mix, shade } from './color';
import { ellipse, f, poly, rect, smooth, tube, type Pt, type V } from './geom';
import type { ArmPose, HeroLook, Rig } from './model';
import { OUTLINE, type Pen } from './pen';

const LEATHER = '#6b4630';

export function isRobe(L: HeroLook): boolean {
  return L.outfit === 'robe' || L.outfit === 'bark';
}

function bootsColor(L: HeroLook): string {
  return L.boots ?? (L.outfit === 'plate' ? (L.metal ?? '#c9d3e3') : LEATHER);
}

// ---------------------------------------------------------------------------
// Legs
// ---------------------------------------------------------------------------

function boot(p: Pen, L: HeroLook, R: Rig, ax: number, ay: number, w: number, far: boolean): void {
  const g = R.ground;
  const k = R.k;
  const c = far ? shade(bootsColor(L), 0.55) : bootsColor(L);
  const metal = L.outfit === 'plate' && !L.boots;
  const d = smooth([
    [ax - w * 0.6, ay - 5],
    [ax + w * 0.52, ay - 5],
    [ax + w * 0.58, ay + 1],
    [ax + w * 0.62 + 6 * k, g - 4.5],
    [ax + w * 0.5 + 7.5 * k, g, 1],
    [ax - w * 0.64, g, 1],
    [ax - w * 0.7, ay + 2],
  ]);
  p.shape(d, c, { off: 2.5, rim: metal ? '#ffffff' : light(c, 0.35), rimW: 1.6 });
  // cuff
  if (L.ornate >= 1 || metal) {
    p.shape(rect(ax - w * 0.68, ay - 6.5, w * 1.32, 4.5, 2), far ? shade(L.trim, 0.5) : L.trim, { off: 1.2, sw: 4 });
  }
}

export function drawLegs(p: Pen, L: HeroLook, R: Rig): void {
  if (R.body === 'ghost') return;
  const { cx, hipY, ground, hipDx, footDx, legW } = R;
  const pants = L.cloth2;
  const legs = [
    { far: true, hip: [cx + hipDx, hipY - 4] as Pt, ankle: [cx + footDx + 1, ground - 9] as Pt },
    { far: false, hip: [cx - hipDx, hipY - 4] as Pt, ankle: [cx - footDx + 2, ground - 9] as Pt },
  ];
  for (const leg of legs) {
    const col = leg.far ? shade(pants, 0.55) : pants;
    if (!isRobe(L)) {
      p.shape(tube([leg.hip, leg.ankle], [legW, legW * 0.86]), col, { off: 2.5 });
      if (L.outfit === 'plate' && !L.boots) {
        // knee guard
        const kx = (leg.hip[0] + leg.ankle[0]) / 2;
        const ky = (leg.hip[1] + leg.ankle[1]) / 2 + 2;
        p.shape(ellipse(kx, ky, legW * 0.52, legW * 0.42), leg.far ? shade(L.metal ?? '#c9d3e3', 0.5) : (L.metal ?? '#c9d3e3'), { off: 1.5, rim: '#fff', rimW: 1.4 });
      }
    }
    boot(p, L, R, leg.ankle[0], leg.ankle[1] + (isRobe(L) ? 2 : 0), legW, leg.far);
  }
}

// ---------------------------------------------------------------------------
// Torso
// ---------------------------------------------------------------------------

function torsoPts(R: Rig, bottomDrop = 4): V[] {
  const { cx, shY, hipY, tw, ww } = R;
  const mid = (shY + hipY) / 2;
  return [
    [cx - tw + 2, shY + 1],
    [cx - tw * 0.2, shY - 2.5],
    [cx + tw * 0.6, shY - 1.5],
    [cx + tw + 1, shY + 6],
    [cx + tw + 2.5, mid],
    [cx + ww + 1, hipY - 3],
    [cx + ww - 1, hipY + bottomDrop, 1],
    [cx - ww + 1, hipY + bottomDrop, 1],
    [cx - ww - 1, hipY - 3],
    [cx - tw - 1, mid],
  ];
}

/** x of the torso's front center line (3/4 view: shifted toward the facing side). */
function frontX(R: Rig): number {
  return R.cx + R.tw * 0.35;
}

function belt(p: Pen, L: HeroLook, R: Rig, y: number, color = LEATHER, buckle = L.trim): void {
  const { cx, ww } = R;
  p.shape(poly([[cx - ww - 2, y - 3], [cx + ww + 2.5, y - 4], [cx + ww + 3, y + 3], [cx - ww - 2, y + 4]]), color, { off: 1.5, sw: 4.6 });
  const bx = frontX(R) + 2;
  p.shape(rect(bx - 4, y - 4.5, 8, 8, 2), buckle, { off: 1.2, sw: 4, rim: '#fff8d0', rimW: 1.2 });
}

function collarV(R: Rig, color: string, depth = 12): string {
  const fx = frontX(R);
  return `<path d="${poly([[fx - 7, R.shY - 4], [fx + 7, R.shY - 4], [fx + 1, R.shY + depth]])}" fill="${color}"/>`;
}

function trimLine(d: string, color: string, w: number): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${f(w)}"/>`;
}

export function drawTorso(p: Pen, L: HeroLook, R: Rig): void {
  const { cx, shY, hipY, tw, ww, ground } = R;
  const fx = frontX(R);
  const mid = (shY + hipY) / 2;
  const orn = L.ornate;
  switch (L.outfit) {
    case 'robe':
    case 'bark': {
      const bark = L.outfit === 'bark';
      const hemY = ground - 6;
      const flare = R.body === 'small' ? 7 : 10;
      const pts: V[] = [
        [cx - tw + 2, shY + 1], [cx - tw * 0.2, shY - 2.5], [cx + tw * 0.6, shY - 1.5], [cx + tw + 1, shY + 6], [cx + tw + 2, mid],
        [cx + ww + 1, hipY - 8], [cx + ww + flare, hemY - 4], [cx + ww + flare + 2, hemY + 1, 1],
        [cx + ww * 0.4, hemY + 3], [cx - ww * 0.3, hemY], [cx - ww - flare - 2, hemY + 2, 1],
        [cx - ww - flare + 1, hemY - 6], [cx - ww - 2, hipY - 8], [cx - tw - 1, mid],
      ];
      if (bark) {
        // root-like ragged hem
        pts.splice(7, 4, [cx + ww + flare + 3, hemY + 3, 1], [cx + ww * 0.6, hemY - 3], [cx + ww * 0.3, hemY + 4, 1], [cx - ww * 0.2, hemY - 2], [cx - ww * 0.6, hemY + 4, 1], [cx - ww - flare - 4, hemY + 3, 1]);
      }
      const d = smooth(pts);
      const hem = `M${f(cx - ww - flare - 6)} ${f(hemY + 1)}Q${f(cx)} ${f(hemY + 6)} ${f(cx + ww + flare + 6)} ${f(hemY - 1)}`;
      let inner = '';
      if (bark) {
        inner +=
          trimLine(`M${f(cx - ww)} ${f(shY + 6)}q-4 30 2 ${f(hemY - shY - 6)}M${f(cx - 2)} ${f(shY + 10)}q-3 25 1 ${f(hemY - shY - 12)}M${f(fx + 8)} ${f(shY + 8)}q-3 30 2 ${f(hemY - shY - 10)}`, shade(L.cloth, 1.3), 1.8) +
          `<path d="${ellipse(cx - ww + 2, hipY + 4, 7, 5)}${ellipse(fx + 6, shY + 18, 6, 4)}" fill="${L.cloth2}"/>`;
      } else {
        inner += `<path d="${poly([[fx - 5, shY - 4], [fx + 5, shY - 4], [fx + 9, ground + 4], [fx - 7, ground + 4]])}" fill="${L.cloth2}"/>`;
        if (orn >= 1) inner += trimLine(`M${f(fx - 5)} ${f(shY)}L${f(fx - 7)} ${f(ground)}M${f(fx + 5)} ${f(shY)}L${f(fx + 9)} ${f(ground)}`, L.trim, 2.2);
        inner += trimLine(hem, L.trim, orn >= 2 ? 7 : 5);
        inner += collarV(R, L.cloth2, 10);
      }
      p.shape(d, L.cloth, { off: 5, dir: [1, -0.4], inner });
      if (!bark) {
        // collar ruff
        p.shape(smooth([[cx - tw + 1, shY + 2], [cx - 2, shY - 4], [fx + 9, shY - 3], [fx + 4, shY + 6, 1], [fx - 1, shY + 2], [cx - tw * 0.4, shY + 8]]), orn >= 2 ? L.trim : L.cloth2, { off: 1.5, sw: 4.6 });
        // sash
        const sy = hipY - 9;
        p.shape(poly([[cx - ww - 3, sy - 3], [cx + ww + 3, sy - 4.5], [cx + ww + 4, sy + 3], [cx - ww - 3, sy + 4]]), L.trim, { off: 1.5, sw: 4.6 });
        p.shape(smooth([[fx + 1, sy + 1], [fx + 5, sy + 13], [fx + 1, sy + 20, 1], [fx - 2, sy + 12]]), L.trim, { off: 1.5, sw: 4 });
        if (orn >= 2) p.shape(ellipse(fx + 1, sy, 3.4), L.glow, { shade: null, sw: 3.4 });
      } else {
        // moss & leaf mantle
        p.shape(smooth([[cx - tw - 3, shY + 10], [cx - tw, shY - 1], [cx + 2, shY - 5], [cx + tw + 3, shY + 1], [cx + tw + 5, shY + 12], [fx + 6, shY + 16, 1], [fx, shY + 10], [fx - 6, shY + 18, 1], [cx - 4, shY + 12], [cx - 10, shY + 19, 1]]), L.cloth2, { off: 2.5 });
      }
      return;
    }
    case 'shroud': {
      const pts: V[] = [
        [cx - tw + 1, shY + 1], [cx - tw * 0.2, shY - 4], [cx + tw * 0.6, shY - 3], [cx + tw + 2, shY + 6], [cx + tw + 4, mid],
        [cx + ww + 8, hipY + 2], [cx + ww + 3, hipY + 14, 1], [cx + 4, hipY + 6], [cx - 2, hipY + 18, 1], [cx - 10, hipY + 6],
        [cx - 22, ground - 8], [cx - 38, ground - 6, 1], [cx - 30, hipY], [cx - tw - 6, mid],
      ];
      p.shape(smooth(pts), L.cloth, {
        off: 5,
        dir: [1, -0.4],
        inner: trimLine(`M${f(cx - 6)} ${f(shY + 10)}q-6 20 -16 ${f(ground - shY - 24)}M${f(fx + 4)} ${f(shY + 8)}q2 20 -4 ${f(hipY - shY + 4)}`, shade(L.cloth, 1.2), 2) + collarV(R, L.cloth2, 8),
      });
      // tattered chain belt
      p.line(`M${f(cx - ww - 6)} ${f(hipY - 10)}Q${f(cx)} ${f(hipY - 4)} ${f(cx + ww + 8)} ${f(hipY - 12)}`, OUTLINE, 5);
      p.line(`M${f(cx - ww - 6)} ${f(hipY - 10)}Q${f(cx)} ${f(hipY - 4)} ${f(cx + ww + 8)} ${f(hipY - 12)}`, L.trim, 2.2);
      return;
    }
    case 'rock': {
      const pts: V[] = [
        [cx - tw, shY + 2, 1], [cx - tw * 0.3, shY - 4, 1], [cx + tw * 0.6, shY - 3, 1], [cx + tw + 3, shY + 6, 1], [cx + tw + 4, mid, 1],
        [cx + ww + 2, hipY + 2, 1], [cx + ww - 4, hipY + 7, 1], [cx - ww + 3, hipY + 7, 1], [cx - ww - 2, hipY, 1], [cx - tw - 3, mid - 4, 1],
      ];
      const cracks = `M${f(cx - tw + 4)} ${f(shY + 8)}l8 6l-3 9l7 5M${f(fx + 10)} ${f(shY + 4)}l-4 10l6 6M${f(cx - 6)} ${f(hipY)}l4 -9l9 -2`;
      p.shape(poly(pts), L.cloth, {
        off: 6,
        dir: [1, -0.4],
        rim: light(L.cloth, 0.3),
        inner: trimLine(cracks, L.glow, 3) + trimLine(cracks, '#fff3a0', 1.1),
      });
      // molten core
      p.fill(ellipse(fx + 1, shY + 18, 13, 12), L.glow, 0.35);
      p.shape(poly([[fx - 7, shY + 12], [fx + 2, shY + 8], [fx + 9, shY + 15], [fx + 7, shY + 25], [fx - 3, shY + 27], [fx - 9, shY + 20]]), L.glow, { shade: mix(L.glow, '#ff3a1a', 0.5), off: 3, sw: 4.6, inner: `<path d="${ellipse(fx + 1, shY + 16, 3.5, 4)}" fill="#fff6c0"/>` });
      // cape of fire collar
      p.shape(poly([[cx - tw - 3, shY + 8], [cx - tw, shY - 3], [cx + tw + 4, shY - 1], [cx + tw + 6, shY + 9], [fx + 2, shY + 4], [cx - 4, shY + 8]]), L.cloth2, { off: 2, rim: L.trim });
      return;
    }
    case 'carapace':
    case 'scales':
    case 'plate': {
      const scales = L.outfit === 'scales';
      const base = scales ? L.skin : L.cloth2;
      p.shape(smooth(torsoPts(R)), base, { off: 4, dir: [1, -0.4] });
      if (scales) {
        // belly plates
        p.shape(smooth([[fx - 7, shY + 2], [fx + 7, shY + 2], [fx + 10, hipY - 4], [fx + 2, hipY + 4, 1], [fx - 9, hipY - 2]]), L.skin2 ?? '#ffd27a', {
          off: 2,
          inner: trimLine(`M${f(fx - 10)} ${f(shY + 10)}h22M${f(fx - 10)} ${f(shY + 18)}h22M${f(fx - 10)} ${f(shY + 26)}h22M${f(fx - 10)} ${f(shY + 34)}h22`, shade(L.skin2 ?? '#ffd27a', 1.2), 1.6),
        });
        // cross wrap + sash
        p.shape(poly([[cx - tw + 1, shY + 2], [cx - tw + 8, shY - 1], [fx + 12, hipY - 10], [fx + 6, hipY - 6]]), L.cloth, { off: 1.5, sw: 4.4 });
        belt(p, L, R, hipY - 5, L.cloth, L.trim);
        // loincloth flap
        p.shape(smooth([[fx - 4, hipY - 2], [fx + 8, hipY - 2], [fx + 9, hipY + 12, 1], [fx + 2, hipY + 9], [fx - 5, hipY + 13, 1]]), L.cloth, { off: 2, sw: 4.6 });
        return;
      }
      const metal = L.outfit === 'carapace' ? L.cloth : (L.metal ?? '#c9d3e3');
      const plate: V[] = [[cx - tw + 3, shY + 2], [cx - 2, shY - 1], [cx + tw * 0.6, shY - 0.5], [cx + tw + 2, shY + 6], [cx + tw + 3, mid + 2], [cx + ww + 0.5, hipY - 7, 1], [cx - ww - 0.5, hipY - 7, 1], [cx - tw, mid]];
      const segs =
        L.outfit === 'carapace'
          ? trimLine(`M${f(cx - tw)} ${f(shY + 12)}Q${f(fx)} ${f(shY + 8)} ${f(cx + tw + 4)} ${f(shY + 10)}M${f(cx - tw)} ${f(shY + 22)}Q${f(fx)} ${f(shY + 18)} ${f(cx + tw + 4)} ${f(shY + 20)}M${f(cx - tw)} ${f(shY + 32)}Q${f(fx)} ${f(shY + 28)} ${f(cx + tw + 4)} ${f(shY + 30)}`, L.trim, 2.2)
          : trimLine(`M${f(fx + 1)} ${f(shY)}Q${f(fx + 3)} ${f(mid)} ${f(fx + 1)} ${f(hipY - 6)}`, light(metal, 0.6), 2) + (orn >= 1 ? trimLine(smooth(plate), L.trim, 5) : '');
      p.shape(smooth(plate), metal, { off: 5, dir: [1, -0.4], rim: '#ffffff', inner: segs });
      // gorget / collar
      p.shape(smooth([[cx - tw + 1, shY + 3], [cx - 3, shY - 4], [fx + 9, shY - 3], [fx + 6, shY + 5, 1], [cx - tw * 0.3, shY + 7]]), orn >= 1 ? L.trim : metal, { off: 1.5, sw: 4.6, rim: '#fff' });
      if (orn >= 2) {
        // chest emblem gem
        p.shape(smooth([[fx + 1, shY + 9, 1], [fx + 7, shY + 16, 1], [fx + 1, shY + 23, 1], [fx - 5, shY + 16, 1]]), L.trim, { off: 1.5, sw: 4.4 });
        p.fill(ellipse(fx + 1, shY + 16, 2.6, 3.4), L.glow);
      }
      belt(p, L, R, hipY - 6);
      // tassets
      const tc = L.outfit === 'carapace' ? shade(metal, 0.3) : metal;
      p.shape(smooth([[cx - ww - 2, hipY - 2], [cx - ww * 0.15, hipY - 2], [cx - ww * 0.2, hipY + 9, 1], [cx - ww - 3, hipY + 7, 1]]), tc, { off: 2, rim: '#fff', rimW: 1.6 });
      p.shape(smooth([[cx - ww * 0.1, hipY - 2], [cx + ww + 3, hipY - 2], [cx + ww + 4, hipY + 7, 1], [cx - ww * 0.05, hipY + 10, 1]]), tc, { off: 2, rim: '#fff', rimW: 1.6, inner: orn >= 1 ? trimLine(`M${f(cx - ww)} ${f(hipY + 8)}H${f(cx + ww + 6)}`, L.trim, 3) : '' });
      return;
    }
    case 'tunic':
    case 'leather':
    case 'cloak':
    case 'apron':
    case 'ninja': {
      const skirt = L.outfit === 'ninja' ? 4 : 10;
      const pts = torsoPts(R, skirt);
      // flare the skirt a bit
      pts[6] = [cx + ww + 3, hipY + skirt, 1];
      pts[7] = [cx - ww - 2, hipY + skirt, 1];
      let inner = '';
      if (L.outfit !== 'ninja') inner += collarV(R, L.cloth2, 11);
      if (orn >= 1 && L.outfit !== 'ninja') inner += trimLine(`M${f(cx - ww - 6)} ${f(hipY + skirt - 1)}H${f(cx + ww + 8)}`, L.trim, 4);
      if (L.outfit === 'leather') inner += trimLine(`M${f(cx - tw + 2)} ${f(shY + 2)}L${f(cx + ww + 2)} ${f(hipY - 6)}`, darken(L.cloth, 0.35), 4);
      p.shape(smooth(pts), L.cloth, { off: 4, dir: [1, -0.4], inner });
      if (L.outfit === 'ninja') {
        // crossed wraps
        p.shape(poly([[cx - tw + 1, shY + 1], [cx - tw + 7, shY - 1], [cx + ww + 3, hipY - 9], [cx + ww - 2, hipY - 5]]), L.cloth2, { off: 1.2, sw: 4 });
        p.shape(poly([[cx + tw - 2, shY - 1], [cx + tw + 3, shY + 3], [cx - ww + 4, hipY - 5], [cx - ww - 1, hipY - 9]]), L.cloth2, { off: 1.2, sw: 4 });
        // sash with knot and tails
        p.shape(poly([[cx - ww - 2, hipY - 9], [cx + ww + 3, hipY - 10], [cx + ww + 3, hipY - 2], [cx - ww - 2, hipY - 1]]), L.trim, { off: 1.5, sw: 4.4 });
        p.shape(smooth([[cx - ww + 2, hipY - 6], [cx - ww - 6, hipY + 6], [cx - ww - 4, hipY + 14, 1], [cx - ww + 1, hipY + 4], [cx - ww + 6, hipY + 12, 1], [cx - ww + 6, hipY - 2]]), L.trim, { off: 1.5, sw: 4 });
        p.shape(ellipse(cx - ww + 3, hipY - 5, 4, 3.5), L.trim, { off: 1, sw: 4 });
        return;
      }
      if (L.outfit === 'apron') {
        const ax1 = cx - tw * 0.35;
        p.shape(smooth([[ax1, shY + 8, 1], [cx + tw + 2, shY + 6, 1], [cx + ww + 5, hipY + 13, 1], [ax1 - 3, hipY + 14, 1]]), L.trim, {
          off: 3,
          inner: `<path d="${rect(fx - 6, hipY - 2, 13, 9, 2)}" fill="${shade(L.trim, 0.6)}" stroke="${OUTLINE}" stroke-width="1.6"/>`,
        });
        p.line(`M${f(ax1 + 1)} ${f(shY + 8)}L${f(cx - tw + 3)} ${f(shY)}M${f(cx + tw)} ${f(shY + 6)}L${f(cx + tw - 2)} ${f(shY - 1)}`, OUTLINE, 4.5);
        p.line(`M${f(ax1 + 1)} ${f(shY + 8)}L${f(cx - tw + 3)} ${f(shY)}M${f(cx + tw)} ${f(shY + 6)}L${f(cx + tw - 2)} ${f(shY - 1)}`, shade(L.trim, 0.8), 2);
      }
      belt(p, L, R, hipY - 6, L.outfit === 'leather' ? darken(L.cloth, 0.3) : LEATHER);
      if (L.outfit === 'leather') {
        for (const [sx, sy] of [[cx - 6, shY + 10], [fx + 4, shY + 18], [cx + ww - 2, shY + 26]] as const) p.shape(ellipse(sx, sy, 2.2), L.trim, { shade: null, sw: 3 });
      }
      if (L.outfit === 'cloak') {
        // shoulder mantle with leafy / feathered edge
        const m: V[] = [[cx - tw - 5, shY + 15], [cx - tw - 3, shY], [cx + 1, shY - 5], [cx + tw + 3, shY], [cx + tw + 6, shY + 13, 1], [cx + tw - 1, shY + 12], [fx + 4, shY + 20, 1], [fx - 2, shY + 13], [cx - 3, shY + 21, 1], [cx - 8, shY + 13], [cx - tw - 1, shY + 21, 1]];
        p.shape(smooth(m), L.cloth2, { off: 3, rim: light(L.cloth2, 0.35) });
        p.shape(ellipse(fx + 1, shY + 3, 4), L.trim, { off: 1, sw: 4, rim: '#fff6c8', rimW: 1.2 });
      }
      return;
    }
  }
}

/** Neck scarf wrap (front part; the trailing tails are a back item). */
export function drawScarfWrap(p: Pen, L: HeroLook, R: Rig): void {
  const { cx, shY, tw } = R;
  const c = L.backColor ?? L.trim;
  p.shape(smooth([[cx - tw, shY + 4], [cx - tw + 2, shY - 5], [cx + tw * 0.8, shY - 6], [cx + tw + 3, shY + 1], [cx + tw * 0.6, shY + 6], [cx - 2, shY + 8]]), c, { off: 2.5, rim: light(c, 0.4) });
}

/** Diagonal strap across the chest (quivers, packs). */
export function drawStrap(p: Pen, R: Rig, color: string): void {
  const { cx, shY, hipY, tw, ww } = R;
  p.shape(poly([[cx - tw + 1, shY + 1], [cx - tw + 7, shY - 1], [cx + ww + 3, hipY - 9], [cx + ww - 1, hipY - 4]]), color, { off: 1.2, sw: 4.2 });
}

// ---------------------------------------------------------------------------
// Arms
// ---------------------------------------------------------------------------

export interface ArmDraw {
  /** Called after the sleeve and before the hand, inside a frame at the hand. */
  holding?: () => void;
  /** Extra (absolute coords) drawn before the hand, e.g. bow string / arrow. */
  before?: () => void;
  /** Called after the hand (items resting on the palm). */
  after?: () => void;
  /** Skip the hand (it is drawn in another layer). */
  noHand?: boolean;
}

/** Mitten hand. */
export function drawHand(p: Pen, L: HeroLook, R: Rig, at: Pt, far: boolean): void {
  const base = L.hand ?? (L.outfit === 'plate' ? (L.metal ?? '#c9d3e3') : L.skin);
  const hc = far ? shade(base, 0.5) : base;
  p.shape(ellipse(at[0], at[1], R.handR * 1.05, R.handR), hc, { off: 1.8 });
}

export function drawArm(p: Pen, L: HeroLook, R: Rig, shoulder: Pt, a: ArmPose, far: boolean, draw: ArmDraw = {}): void {
  const tone = (c: string) => (far ? shade(c, 0.5) : c);
  const w = R.armW;
  const robe = isRobe(L) && L.outfit !== 'bark';
  const sleeve = tone(L.outfit === 'plate' || L.outfit === 'carapace' ? L.cloth2 : L.outfit === 'scales' ? L.skin : L.outfit === 'rock' ? L.cloth : L.outfit === 'bark' ? L.cloth : L.outfit === 'shroud' ? L.cloth : L.cloth);
  const [hx, hy] = a.hand;
  p.shape(tube([shoulder, a.elbow, a.hand], [w, w * 0.92, w * 0.82]), sleeve, { off: 2.5 });
  if (robe) {
    // bell sleeve cuff
    const ex = a.elbow[0];
    const ey = a.elbow[1];
    const dx = hx - ex;
    const dy = hy - ey;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const s1: Pt = [ex + ux * len * 0.15, ey + uy * len * 0.15];
    const s2: Pt = [hx - ux * 2, hy - uy * 2];
    const cuff = smooth([
      [s1[0] + nx * w * 0.5, s1[1] + ny * w * 0.5],
      [s2[0] + nx * w * 0.95, s2[1] + ny * w * 0.95, 1],
      [s2[0] - nx * w * 0.95, s2[1] - ny * w * 0.95, 1],
      [s1[0] - nx * w * 0.5, s1[1] - ny * w * 0.5],
    ]);
    p.shape(cuff, sleeve, { off: 2, inner: `<path d="M${f(s2[0] + nx * w)} ${f(s2[1] + ny * w)}L${f(s2[0] - nx * w)} ${f(s2[1] - ny * w)}" stroke="${tone(L.trim)}" stroke-width="5"/>` });
  } else if (L.outfit === 'plate' || L.outfit === 'carapace') {
    // vambrace
    const vx = a.elbow[0] + (hx - a.elbow[0]) * 0.55;
    const vy = a.elbow[1] + (hy - a.elbow[1]) * 0.55;
    p.shape(tube([[a.elbow[0] + (hx - a.elbow[0]) * 0.2, a.elbow[1] + (hy - a.elbow[1]) * 0.2], [vx, vy], [hx - (hx - a.elbow[0]) * 0.12, hy - (hy - a.elbow[1]) * 0.12]], [w * 1.05, w * 1.08, w * 1.0]), tone(L.outfit === 'carapace' ? L.cloth : (L.metal ?? '#c9d3e3')), { off: 2, rim: far ? undefined : '#fff', rimW: 1.4 });
  } else if (L.outfit !== 'rock' && L.outfit !== 'shroud' && L.ornate >= 1) {
    // cuff band
    const cxp = hx - (hx - a.elbow[0]) * 0.28;
    const cyp = hy - (hy - a.elbow[1]) * 0.28;
    p.shape(ellipse(cxp, cyp, w * 0.62), tone(L.trim), { off: 1.2, sw: 4 });
  }
  draw.before?.();
  if (draw.holding) draw.holding();
  if (!draw.noHand) drawHand(p, L, R, a.hand, far);
  draw.after?.();
  // pauldron on top of the shoulder
  if (L.outfit === 'plate' || L.outfit === 'carapace' || L.outfit === 'rock') {
    const pc = tone(L.outfit === 'plate' ? (L.metal ?? '#c9d3e3') : L.outfit === 'rock' ? L.cloth : L.cloth);
    const [sx, sy] = shoulder;
    const big = R.body === 'heavy' ? 1.35 : 1;
    const pd = L.outfit === 'rock'
      ? poly([[sx - 11 * big, sy + 4], [sx - 6 * big, sy - 9 * big], [sx + 7 * big, sy - 10 * big], [sx + 12 * big, sy + 2], [sx + 4, sy + 9 * big], [sx - 6, sy + 9 * big]])
      : smooth([[sx - 11 * big, sy + 6 * big, 1], [sx - 9 * big, sy - 5 * big], [sx, sy - 10 * big], [sx + 10 * big, sy - 5 * big], [sx + 12 * big, sy + 6 * big, 1], [sx, sy + 3 * big]]);
    p.shape(pd, pc, { off: 3, rim: far ? undefined : '#fff', inner: L.ornate >= 1 && L.outfit === 'plate' ? `<path d="M${f(sx - 12 * big)} ${f(sy + 4 * big)}Q${f(sx)} ${f(sy)} ${f(sx + 13 * big)} ${f(sy + 4 * big)}" stroke="${tone(L.trim)}" stroke-width="4" fill="none"/>` : '' });
    if (L.ornate >= 3 && L.outfit === 'plate') p.shape(poly([[sx - 3, sy - 8 * big], [sx + 1, sy - 17 * big], [sx + 4, sy - 8 * big]]), tone(L.trim), { off: 1, sw: 4 });
  }
}

