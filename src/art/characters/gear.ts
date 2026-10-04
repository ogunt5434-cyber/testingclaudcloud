// Weapons & held items, drawn in a local frame: the grip is at (0,0) and the weapon points up (-y).
import { light, mix, shade } from './color';
import { ellipse, f, poly, polar, rect, smooth, star, tube, type V } from './geom';
import type { HeroLook, WeaponKind } from './model';
import { OUTLINE, type Pen } from './pen';

interface Colors {
  wood: string;
  blade: string;
  trim: string;
  glow: string;
  dark: string;
}

function colors(L: HeroLook): Colors {
  return {
    wood: L.wood ?? '#7a4e2e',
    blade: L.blade ?? '#e3e9f3',
    trim: L.trim,
    glow: L.glow,
    dark: '#3a2a3a',
  };
}

function glowDot(p: Pen, x: number, y: number, r: number, c: string): void {
  p.fill(ellipse(x, y, r * 2.1), c, 0.22);
  p.fill(ellipse(x, y, r * 1.45), c, 0.35);
}

function shaft(p: Pen, c: string, y1: number, y2: number, w = 5, rim = true): void {
  p.shape(tube([[0, y1], [0, y2]], [w, w]), c, { off: 1.6, rim: rim ? light(c, 0.45) : undefined, rimW: 1.4 });
}

function orb(p: Pen, x: number, y: number, r: number, c: string): void {
  glowDot(p, x, y, r, c);
  p.shape(ellipse(x, y, r), c, {
    shade: mix(c, '#2a1650', 0.35),
    off: r * 0.45,
    sw: 4.4,
    inner: `<path d="${ellipse(x + r * 0.3, y - r * 0.35, r * 0.3, r * 0.22)}" fill="#fff" opacity=".9"/>`,
  });
}

export function drawWeapon(p: Pen, kind: WeaponKind, L: HeroLook): void {
  const C = colors(L);
  const orn = L.ornate;
  switch (kind) {
    case 'sword': {
      p.shape(rect(-2.6, -6, 5.2, 13, 1.6), C.dark, { off: 1 });
      p.shape(ellipse(0, 8.5, 3.4), C.trim, { off: 1, sw: 4 });
      p.shape(poly([[-3.8, -8], [3.8, -8], [3.8, -42], [0, -54], [-3.8, -42]]), C.blade, {
        off: 2.2,
        dir: [1, 0],
        rim: '#ffffff',
        inner: `<path d="M0.4 -11L0.4 -42" stroke="${shade(C.blade, 1)}" stroke-width="1.6"/>`,
      });
      p.shape(smooth([[-11, -6.5, 1], [-9, -10], [0, -9], [9, -10], [11, -6.5, 1], [0, -5]]), C.trim, { off: 1.5, sw: 4.6, rim: '#fff6c8', rimW: 1.2 });
      if (orn >= 1) p.shape(ellipse(0, -7.6, 2.4), C.glow, { shade: null, sw: 3 });
      return;
    }
    case 'axe':
    case 'bat-axe': {
      shaft(p, C.wood, 15, -46, 5.2);
      p.shape(rect(-3.4, 2, 6.8, 7, 2), C.trim, { off: 1, sw: 4 });
      if (kind === 'bat-axe') {
        p.shape(smooth([[-1, -48, 1], [-9, -53, 1], [-7, -45], [-14, -41, 1], [-8, -37], [-11, -31, 1], [-1, -32, 1]]), shade(C.blade, 0.45), { off: 1.5 });
      }
      const blade: V[] = [[1.5, -51, 1], [10, -56], [20, -63, 1], [24, -51], [27, -41], [25, -30], [17, -17, 1], [12, -24], [1.5, -27, 1]];
      p.shape(smooth(blade), shade(C.blade, 0.35), {
        off: 2.5,
        dir: [1, 0],
        inner: `<path d="M20 -63Q32 -40 17 -17" fill="none" stroke="${light(C.blade, 0.5)}" stroke-width="9"/><path d="M17.5 -59Q27 -40 15 -20" fill="none" stroke="${C.glow}" stroke-width="1.6" opacity=".9"/>`,
      });
      p.shape(poly([[-2.4, -47], [0, -60], [2.4, -47]]), C.trim, { off: 1, sw: 4 });
      p.shape(rect(-3.8, -48, 7.6, 9, 2), C.trim, { off: 1.2, sw: 4, rim: '#fff6c8', rimW: 1.2 });
      return;
    }
    case 'mace': {
      shaft(p, C.dark, 12, -30, 5.2);
      p.shape(ellipse(0, 12, 3.4), C.trim, { off: 1, sw: 4 });
      for (const a of [-60, 0, 60]) {
        const [tx, ty] = polar(0, -40, 16, a);
        p.shape(poly([[...polar(0, -40, 6, a - 40)], [tx, ty], [...polar(0, -40, 6, a + 40)]]), C.blade, { off: 1.5, rim: '#fff', rimW: 1.2 });
      }
      p.shape(ellipse(0, -40, 10.5), C.blade, { off: 3, rim: '#fff' });
      p.shape(rect(-7, -31, 14, 5, 2), C.trim, { off: 1.2, sw: 4.2 });
      if (orn >= 2) p.shape(ellipse(0, -40, 3.6), C.glow, { shade: null, sw: 3.2 });
      return;
    }
    case 'club': {
      p.shape(tube([[0, 12], [1, -18], [-1, -50]], [6.5, 11, 18]), C.wood, {
        off: 3.5,
        rim: light(C.wood, 0.35),
        inner: `<path d="${ellipse(-3, -30, 2.4, 3.2)}${ellipse(3, -42, 2.2, 2.8)}${ellipse(-1, -10, 1.6, 2.2)}" fill="${shade(C.wood, 1.4)}"/>`,
      });
      for (const [sx, sy] of [[-9, -40], [9, -46], [-8, -54], [6, -26]] as const) p.shape(poly([[sx * 0.7, sy - 3], [sx * 1.25, sy], [sx * 0.7, sy + 3]]), light(C.wood, 0.3), { shade: null, sw: 3 });
      p.shape(smooth([[-10, -50], [-4, -60], [8, -60], [10, -50], [3, -46], [-3, -53]]), '#5aa04a', { off: 2 });
      p.shape(smooth([[7, -34, 1], [15, -40], [17, -32, 1], [11, -30]]), '#7cc95a', { off: 1.5, sw: 4 });
      return;
    }
    case 'greatsword': {
      p.shape(rect(-3, -6, 6, 18, 2), '#3a2440', { off: 1, inner: `<path d="M-3 -2L3 0M-3 3L3 5M-3 8L3 10" stroke="#6a4a7a" stroke-width="1.4"/>` });
      p.shape(ellipse(0, 13, 4.2), C.blade, { off: 1.5, sw: 4.2 });
      const blade: V[] = [[-6.5, -10, 1], [6.5, -10, 1], [7.5, -60], [0, -78, 1], [-7.5, -60], [-8.5, -50, 1], [-6.5, -46], [-8.5, -38, 1], [-6.5, -34], [-8.5, -26, 1], [-6.5, -22]];
      p.shape(smooth(blade), C.blade, {
        off: 3,
        dir: [1, 0],
        rim: '#fff',
        inner: `<path d="M1 -16L1 -60" stroke="${shade(C.blade, 1.2)}" stroke-width="2"/>` + (orn >= 2 ? `<path d="M1 -22l-2 -4l2 -4M1 -36l2 -4l-2 -4M1 -50l-2 -4l2 -4" stroke="${C.glow}" stroke-width="2.2" fill="none"/>` : ''),
      });
      p.shape(smooth([[-16, -4, 1], [-13, -12], [-6, -10], [0, -12], [6, -10], [13, -12], [16, -4, 1], [8, -6], [0, -4], [-8, -6]]), C.blade, { off: 1.5, sw: 4.6 });
      p.shape(ellipse(0, -8, 3.6), C.glow, { shade: null, sw: 3.4 });
      return;
    }
    case 'great-axe': {
      shaft(p, C.dark, 24, -62, 6);
      p.shape(ellipse(0, 25, 4), C.trim, { off: 1, sw: 4 });
      const right: V[] = [[2, -64, 1], [12, -68], [25, -73, 1], [29, -58], [30, -47], [27, -36], [21, -24, 1], [17, -31], [12, -29, 1], [8, -34], [2, -36, 1]];
      const left: V[] = [[-2, -60, 1], [-11, -64, 1], [-17, -51], [-11, -38, 1], [-2, -42, 1]];
      p.shape(smooth(left), shade(C.blade, 0.4), { off: 2, inner: `<path d="M-11 -64Q-22 -51 -11 -38" fill="none" stroke="${C.glow}" stroke-width="4"/>` });
      p.shape(smooth(right), C.blade, {
        off: 3,
        dir: [1, 0],
        inner: `<path d="M25 -73Q37 -48 21 -24" fill="none" stroke="${C.glow}" stroke-width="7"/><path d="M24 -68Q33 -48 20 -28" fill="none" stroke="#fff3a0" stroke-width="1.6"/>`,
      });
      p.shape(rect(-5, -50, 10, 17, 3), C.trim, { off: 1.5, sw: 4.4 });
      p.shape(ellipse(0, -41.5, 3.2), C.glow, { shade: null, sw: 3.2 });
      p.shape(poly([[-3, -63], [0, -76], [3, -63]]), C.trim, { off: 1, sw: 4 });
      return;
    }
    case 'dagger':
    case 'kris':
    case 'zap-dagger': {
      p.shape(rect(-2.2, -4, 4.4, 10, 1.4), C.dark, { off: 1, sw: 4 });
      p.shape(ellipse(0, 7, 2.6), C.trim, { off: 1, sw: 3.8 });
      if (kind === 'zap-dagger') {
        const z: V[] = [[-3, -6], [3, -6], [0.5, -12], [5.5, -14], [0, -31], [1.5, -18], [-3.5, -16], [-0.5, -11]];
        p.fill(ellipse(0, -18, 8, 14), C.glow, 0.3);
        p.shape(poly(z), '#fff6a0', { shade: '#ffc23a', off: 1.5, sw: 4.2 });
      } else if (kind === 'kris') {
        const k: V[] = [[-2.8, -6, 1], [2.8, -6, 1], [4.4, -11], [1.6, -16], [4, -21], [0.6, -30, 1], [-2.4, -21], [0, -16], [-2.8, -11]];
        p.fill(ellipse(0.5, -17, 7, 13), C.glow, 0.25);
        p.shape(smooth(k), C.blade, { off: 1.6, dir: [1, 0], inner: `<path d="${smooth(k)}" fill="none" stroke="${C.glow}" stroke-width="3.4" transform="translate(-1.2 0)"/><path d="M0.6 -8L0.8 -24" stroke="#fff3c0" stroke-width="1.2"/>` });
      } else {
        p.shape(poly([[-2.7, -6], [2.7, -6], [2.5, -21], [0, -28], [-2.5, -21]]), C.blade, { off: 1.6, dir: [1, 0], rim: '#fff', rimW: 1.4 });
      }
      p.shape(smooth([[-7, -4.5, 1], [-5, -7.5], [5, -7.5], [7, -4.5, 1], [0, -3.5]]), C.trim, { off: 1, sw: 4 });
      return;
    }
    case 'sickle': {
      p.shape(tube([[0, 9], [0, -14]], [4.6, 4.6]), C.wood, { off: 1.4 });
      const b: V[] = [[-1.5, -12, 1], [1, -24], [10, -33], [23, -31], [30, -22, 1], [21, -25], [11, -24], [3, -15, 1]];
      p.shape(smooth(b), C.blade, { off: 2, rim: '#fff', inner: `<path d="${smooth(b)}" fill="none" stroke="${C.glow}" stroke-width="3" transform="translate(1.5 1.5)"/>` });
      p.shape(smooth([[27, -21], [29.5, -15], [27, -12, 1], [24.5, -15]]), C.glow, { shade: null, sw: 3 });
      p.shape(rect(-3, -16, 6, 5, 1.5), C.trim, { off: 1, sw: 4 });
      return;
    }
    case 'claws': {
      for (const [ox, len, bend] of [[-5, 22, 7], [0, 27, 8], [5, 22, 7]] as const) {
        const d = smooth([[ox - 2.4, 0, 1], [ox - 2.5, -len * 0.5], [ox + bend * 0.6, -len, 1], [ox + 2.4, -len * 0.45], [ox + 2.4, 0, 1]]);
        p.shape(d, C.blade, { shade: mix(C.blade, C.glow, 0.5), off: 1.4, sw: 4, rim: '#fff', rimW: 1.2 });
      }
      p.fill(ellipse(2, -14, 14, 18), C.glow, 0.18);
      return;
    }
    case 'bow':
    case 'thorn-bow': {
      const big = kind === 'thorn-bow' ? 1.18 : 1;
      const limb = (s: number) => tube([[0, -4 * s], [5 * big, -15 * s * big], [6 * big, -27 * s * big], [2 * big, -37 * s * big], [-3 * big, -42 * s * big]], [5.6 * big, 5 * big, 4.4 * big, 3.4, 2.6]);
      for (const s of [1, -1]) {
        p.shape(limb(s), C.wood, { off: 1.6, rim: light(C.wood, 0.5), rimW: 1.4 });
        if (kind === 'thorn-bow') {
          for (const t of [0.35, 0.6, 0.82]) {
            const y = -42 * s * big * t;
            const x = 6 * big * Math.sin(Math.PI * t) - 0.5;
            p.shape(poly([[x + 1, y - 2 * s], [x + 6, y + 1.5 * s], [x + 1.5, y + 3 * s]]), light(C.wood, 0.2), { shade: null, sw: 3 });
          }
          const ty = -42 * s * big;
          p.shape(smooth([[-3, ty, 1], [-10, ty - 4 * s], [-14, ty + 2 * s, 1], [-8, ty + 3 * s]]), '#7cd85a', { off: 1.2, sw: 3.6 });
        } else {
          p.shape(ellipse(-3 * big, -42 * s * big, 2.6), C.trim, { shade: null, sw: 3.4 });
        }
      }
      p.shape(rect(-3, -6, 6, 12, 2), C.trim, { off: 1, sw: 4, rim: '#fff6c8', rimW: 1.2 });
      return;
    }
    case 'crossbow': {
      // side view: long stock along the local up axis, foreshortened prod at the front
      const stock: V[] = [[-6, 16, 1], [5, 13, 1], [4.2, 2], [3.6, -40, 1], [-3.6, -40, 1], [-4.2, -2], [-7, 6]];
      p.shape(smooth(stock), C.wood, { off: 2.2, dir: [1, 0], rim: light(C.wood, 0.4), rimW: 1.4, inner: `<path d="M-6 -6H6M-6 -24H6" stroke="${C.trim}" stroke-width="2.6"/>` });
      // string from the prod tips back to the nut
      p.line(`M-12 -33L0 -17L12 -33`, OUTLINE, 3);
      p.line(`M-12 -33L0 -17L12 -33`, '#f4ecd8', 1.2);
      // bolt
      p.line(`M0 -17L0 -50`, OUTLINE, 4.4);
      p.line(`M0 -17L0 -50`, '#d8c8a8', 1.8);
      p.shape(poly([[-3.6, -48], [0, -57], [3.6, -48]]), orn >= 2 ? C.glow : C.blade, { off: 1, sw: 3.8 });
      // prod (bow arms seen edge-on)
      p.shape(tube([[-13, -31], [-7, -37], [0, -39], [7, -37], [13, -31]], [3.4, 4.4, 5.4, 4.4, 3.4]), C.blade, { off: 1.5, rim: '#fff', rimW: 1.4 });
      p.shape(rect(-5.5, -42, 11, 7, 2.5), C.trim, { off: 1.2, sw: 4.2, rim: '#fff6c8', rimW: 1.2 });
      if (orn >= 2) p.shape(ellipse(0, -38.5, 2.4), C.glow, { shade: null, sw: 2.8 });
      // trigger + grip
      p.shape(smooth([[3, 0], [9, 2], [10, 9, 1], [5, 5]]), C.dark, { off: 1, sw: 3.6 });
      return;
    }
    case 'bomb': {
      p.shape(ellipse(0, -10, 11, 10.5), '#3d4766', {
        off: 3.5,
        rim: '#9fb0d8',
        inner: `<path d="M-11 -12Q0 -6 11 -12" stroke="${C.trim}" stroke-width="3" fill="none"/><path d="${ellipse(4, -15, 3, 2.2)}" fill="#c8d6ff" opacity=".9"/>`,
      });
      p.shape(rect(-3.4, -24, 6.8, 5, 1.5), C.trim, { off: 1, sw: 4 });
      p.line(`M0 -24Q2 -30 6 -31`, OUTLINE, 4);
      p.line(`M0 -24Q2 -30 6 -31`, '#b08a5a', 2);
      p.raw(`<g class="hs-spark" style="transform-origin:7px -32px">`);
      p.fill(ellipse(7, -32, 6), C.glow, 0.35);
      p.shape(star(7, -32, 5.5, 2.2, 6, 10), '#fff3a0', { shade: '#ffb03a', off: 1, sw: 3 });
      p.raw('</g>');
      return;
    }
    case 'flask': {
      p.shape(smooth([[-6, -2], [-7, -9], [-3, -13, 1], [-3, -19, 1], [3, -19, 1], [3, -13, 1], [7, -9], [6, -2], [0, 1]]), '#d8f4ff', { shade: '#a8d4e8', off: 1.5, sw: 4.2, inner: `<path d="M-8 -7Q0 -4 8 -7L8 4L-8 4Z" fill="${C.glow}"/>` });
      p.shape(rect(-3.8, -22, 7.6, 4, 1.4), LEATHER_CORK, { off: 1, sw: 3.8 });
      return;
    }
    case 'urn': {
      const u: V[] = [[-8, -2], [-11, -11], [-8, -19], [-5, -23, 1], [5, -23, 1], [8, -19], [11, -11], [8, -2], [5, 1, 1], [-5, 1, 1]];
      p.shape(smooth(u), C.blade, {
        off: 3,
        rim: '#fff',
        inner: `<path d="M-12 -14H12M-12 -8H12" stroke="${L.cloth}" stroke-width="2.6"/><path d="M-4 -11q2 -3 4 0t4 0" stroke="${L.cloth}" stroke-width="1.6" fill="none"/>`,
      });
      p.shape(smooth([[-6, -23], [0, -28], [6, -23]]), L.cloth, { off: 1.2, sw: 4 });
      p.raw(`<g class="hs-wispy" style="transform-origin:0px -30px">`);
      p.fill(smooth([[-3, -27], [-6, -34], [-1, -40], [2, -47], [6, -40], [3, -34], [4, -27]]), C.glow, 0.55);
      p.raw('</g>');
      return;
    }
    case 'cane': {
      p.shape(tube([[0, 30], [0, -10]], [4.6, 4.6]), C.wood, { off: 1.4 });
      p.shape(tube([[0, -10], [3, -16], [9, -15]], [4.6, 4.6, 4.6]), C.wood, { off: 1.4 });
      return;
    }
    case 'shield-round': {
      p.shape(ellipse(0, 0, 13, 16.5), C.blade, {
        off: 4,
        rim: '#fff',
        inner: `<path d="${ellipse(0, 0, 13, 16.5)}" fill="none" stroke="${C.trim}" stroke-width="7"/><path d="${star(1, 0, 8.5, 4, 8, 0)}" fill="${C.trim}"/>`,
      });
      p.shape(ellipse(1, 0, 3.4, 4), light(C.trim, 0.3), { off: 1, sw: 3.6 });
      return;
    }
    case 'shield-tower': {
      const s: V[] = [[-15, -25, 1], [0, -29], [15, -25, 1], [15, 12], [0, 27, 1], [-15, 12]];
      const crest = poly([[-7, 4], [-7, -8], [-4, -8], [-4, -5], [-1.5, -5], [-1.5, -8], [1.5, -8], [1.5, -5], [4, -5], [4, -8], [7, -8], [7, 4], [0, 10]]);
      p.shape(smooth(s), L.cloth, {
        off: 4.5,
        dir: [1, -0.5],
        inner: `<path d="${smooth(s)}" fill="none" stroke="${C.trim}" stroke-width="8"/><path d="${crest}" fill="${C.trim}" stroke="${shade(C.trim, 1.2)}" stroke-width="1.2"/>`,
        rim: '#fff6c8',
      });
      for (const [rx, ry] of [[-10, -20], [10, -20], [-10, 8], [10, 8], [0, 21]] as const) p.fill(ellipse(rx, ry, 1.6), '#fff8d8');
      if (orn >= 3) p.shape(ellipse(0, -1, 2.8), C.glow, { shade: null, sw: 2.8 });
      return;
    }
    case 'shield-wood': {
      p.shape(ellipse(0, 0, 14, 17), C.wood, {
        off: 4,
        inner: `<path d="M-5 -18V18M4 -18V18" stroke="${shade(C.wood, 1.4)}" stroke-width="1.8"/><path d="${ellipse(0, 0, 14, 17)}" fill="none" stroke="#8a95a8" stroke-width="5"/>`,
      });
      p.shape(smooth([[0, -9, 1], [6, -3], [5, 5], [0, 10, 1], [-5, 5], [-6, -3]]), '#6cc04a', { off: 1.5, sw: 3.8, inner: `<path d="M0 -8V9" stroke="#3a7a2a" stroke-width="1.4"/>` });
      return;
    }
    case 'orb': {
      orb(p, 0, -12, 7, C.glow);
      return;
    }
    default:
      drawStaff(p, kind, L, C);
  }
}

const LEATHER_CORK = '#9a6a3a';

function drawStaff(p: Pen, kind: WeaponKind, L: HeroLook, C: Colors): void {
  // staffs are taller than the hero: lift the topper above the head
  p.raw('<g transform="translate(0 -12)">');
  drawStaffInner(p, kind, C, L.ornate);
  p.raw('</g>');
}

function drawStaffInner(p: Pen, kind: WeaponKind, C: Colors, orn: number): void {
  switch (kind) {
    case 'moon-staff': {
      shaft(p, C.wood, 44, -30, 4.6);
      p.shape(ellipse(0, 44, 3), C.trim, { off: 1, sw: 3.6 });
      glowDot(p, 2, -40, 7, C.glow);
      p.shape(`M-6 -48A11 11 0 1 0 8 -31A8.5 8.5 0 1 1 -6 -48Z`, C.trim, { off: 2, rim: '#fff', rimW: 1.4 });
      p.shape(star(6, -45, 4.4, 1.8, 4, 0), '#fff6c0', { shade: null, sw: 3 });
      return;
    }
    case 'eclipse-staff': {
      shaft(p, C.wood, 48, -46, 5);
      for (const y of [-10, 14]) p.shape(rect(-3.6, y, 7.2, 4, 1.4), C.trim, { off: 1, sw: 3.6 });
      // prongs
      p.shape(smooth([[-2, -44, 1], [-12, -52], [-14, -66, 1], [-9, -56], [0, -50]]), C.trim, { off: 1.4, sw: 4 });
      p.shape(smooth([[2, -44, 1], [12, -52], [14, -66, 1], [9, -56], [0, -50]]), C.trim, { off: 1.4, sw: 4 });
      glowDot(p, 0, -60, 11, C.glow);
      p.shape(ellipse(0, -60, 10.5), '#160e2c', { shade: null, sw: 4.6, rim: C.glow, rimW: 3 });
      p.fill(`M-9 -64A10 10 0 0 0 6 -51A8 8 0 0 1 -9 -64Z`, C.glow);
      if (orn >= 3) for (const a of [0, 120, 240]) p.shape(ellipse(...polar(0, -60, 15, a), 1.6), '#ffffff', { shade: null, sw: 2.6 });
      return;
    }
    case 'bell-staff': {
      shaft(p, C.wood, 48, -46, 4.8);
      p.shape(rect(-3.6, -8, 7.2, 4, 1.4), C.trim, { off: 1, sw: 3.6 });
      p.shape(tube([[0, -46], [1, -58], [9, -64], [16, -58], [16, -52]], [4.8, 4.6, 4.2, 4, 3.6]), C.trim, { off: 1.4, rim: '#fff6c8', rimW: 1.2 });
      glowDot(p, 16, -42, 7, C.glow);
      p.shape(smooth([[8, -38, 1], [10, -46], [16, -52], [22, -46], [24, -38, 1]]), C.trim, { off: 2.4, rim: '#fff6c8' });
      p.shape(ellipse(16, -36, 2.4), C.trim, { shade: null, sw: 3.4 });
      if (orn >= 2) p.shape(star(0, -49, 4.4, 1.8, 4, 0), C.glow, { shade: null, sw: 2.8 });
      return;
    }
    case 'sun-staff': {
      shaft(p, C.trim, 48, -46, 4.8);
      p.shape(rect(-3.6, -12, 7.2, 4, 1.4), light(C.trim, 0.3), { off: 1, sw: 3.6 });
      p.raw(`<g class="hs-spin" style="transform-origin:0px -58px">`);
      glowDot(p, 0, -58, 12, C.glow);
      p.shape(star(0, -58, 17, 9, 12, 0), C.trim, { shade: light(C.trim, 0.1), off: 0, sw: 4 });
      p.raw('</g>');
      p.shape(ellipse(0, -58, 8.5), '#fff2b0', { shade: '#ffc94a', off: 2.5, sw: 4.2, rim: '#fff' });
      p.shape(smooth([[-2, -46, 1], [-12, -44], [-18, -50, 1], [-10, -48]]), '#ffffff', { off: 1, sw: 3.4 });
      p.shape(smooth([[2, -46, 1], [12, -44], [18, -50, 1], [10, -48]]), '#ffffff', { off: 1, sw: 3.4 });
      return;
    }
    case 'star-staff': {
      p.shape(tube([[0, 48], [-1, 10], [1, -16], [-1, -42]], [5, 5.4, 5, 5.6]), C.wood, { off: 1.6, rim: light(C.wood, 0.4), rimW: 1.4 });
      p.shape(tube([[-1, -42], [-7, -50], [-6, -58]], [4.4, 3.6, 3]), C.wood, { off: 1.2 });
      p.shape(tube([[-1, -42], [6, -50], [6, -58]], [4.4, 3.6, 3]), C.wood, { off: 1.2 });
      p.raw(`<g class="hs-spin" style="transform-origin:0px -62px">`);
      glowDot(p, 0, -62, 12, C.glow);
      p.shape(star(0, -62, 14, 6.2, 5, 0), '#fff4a8', { shade: '#ffc63a', off: 2.5, sw: 4.4, rim: '#fff' });
      p.raw('</g>');
      for (const [sx, sy, sr] of [[-14, -48, 3.6], [14, -70, 3], [12, -46, 2.4]] as const) p.shape(star(sx, sy, sr, sr * 0.4, 4, 0), '#ffffff', { shade: null, sw: 2.6 });
      return;
    }
    case 'magma-staff': {
      p.shape(poly([[-2.6, 48], [2.6, 48], [3.4, 10], [2.4, -40], [-2.4, -40], [-3.4, 10]]), '#2a1e24', { off: 1.6, rim: '#6a4a52', rimW: 1.4, inner: `<path d="M0 30l-1 -14l2 -12l-1 -14" stroke="${C.glow}" stroke-width="1.6" fill="none"/>` });
      p.shape(poly([[-3, -40], [-12, -50], [-10, -66], [-6, -54], [0, -48]]), '#2a1e24', { off: 1.4, rim: '#6a4a52', rimW: 1.2 });
      p.shape(poly([[3, -40], [12, -50], [10, -66], [6, -54], [0, -48]]), '#2a1e24', { off: 1.4, rim: '#6a4a52', rimW: 1.2 });
      orb(p, 0, -56, 9, C.glow);
      p.fill(ellipse(-2, -55, 3, 2), '#fff6c0', 0.9);
      return;
    }
    case 'web-staff': {
      shaft(p, C.wood, 48, -44, 4.8);
      const cy = -60;
      let web = '';
      for (let i = 0; i < 8; i++) {
        const [x2, y2] = polar(0, cy, 15, i * 45);
        web += `M0 ${cy}L${f(x2)} ${f(y2)}`;
      }
      for (const rr of [6, 11, 15]) {
        const pts: V[] = [];
        for (let i = 0; i < 8; i++) pts.push(polar(0, cy, rr, i * 45));
        web += poly(pts);
      }
      p.line(web, OUTLINE, 3.2);
      p.line(web, '#efe6ff', 1.3);
      p.shape(tube([[0, -44], [0, -46]], [4.8, 4.8]), C.wood, { off: 1 });
      glowDot(p, 0, cy, 5, C.glow);
      p.shape(smooth([[0, cy - 6, 1], [5, cy], [0, cy + 6, 1], [-5, cy]]), C.glow, { shade: mix(C.glow, '#2a1650', 0.4), off: 1.5, sw: 3.8, rim: '#fff', rimW: 1.2 });
      return;
    }
    case 'spore-staff': {
      p.shape(tube([[0, 46], [1, 0], [-1, -18], [1, -32]], [4, 4.4, 4, 4.4]), C.wood, { off: 1.4 });
      glowDot(p, 0, -38, 8, C.glow);
      for (const [mx, my, mr] of [[-6, -34, 5], [6, -38, 6], [0, -44, 7]] as const) {
        p.shape(tube([[mx, my + 6], [mx, my]], [2.6, 2.6]), '#f2e2c0', { off: 0.8, sw: 3.4 });
        p.shape(`M${mx - mr} ${my}a${mr} ${mr * 0.9} 0 0 1 ${mr * 2} 0Z`, C.glow, { shade: mix(C.glow, '#2a6a3a', 0.4), off: 1.5, sw: 3.6, inner: `<path d="${ellipse(mx - mr * 0.3, my - mr * 0.45, 1.2)}${ellipse(mx + mr * 0.35, my - mr * 0.3, 1)}" fill="#fff"/>` });
      }
      return;
    }
    case 'branch-staff': {
      p.shape(tube([[0, 48], [2, 14], [-2, -12], [1, -38]], [6, 6.6, 6, 6.4]), C.wood, { off: 2, rim: light(C.wood, 0.35), rimW: 1.4, inner: `<path d="M-1 30q2 -10 0 -20M1 0q-2 -10 1 -24" stroke="${shade(C.wood, 1.3)}" stroke-width="1.4" fill="none"/>` });
      p.shape(tube([[1, -36], [-9, -46], [-12, -58]], [5, 4, 3]), C.wood, { off: 1.4 });
      p.shape(tube([[1, -36], [10, -46], [12, -58]], [5, 4, 3]), C.wood, { off: 1.4 });
      orb(p, 0, -52, 7, C.glow);
      for (const [lx, ly, rot] of [[-12, -58, -30], [12, -58, 30], [6, -24, 70]] as const) {
        p.at(lx, ly, rot).shape(smooth([[0, 0, 1], [-4, -6], [0, -13, 1], [4, -6]]), '#7cd05a', { off: 1.2, sw: 3.6 }).close();
      }
      return;
    }
    case 'lantern-staff': {
      shaft(p, C.wood, 48, -44, 4.8);
      p.shape(tube([[0, -44], [2, -56], [12, -60], [18, -54]], [4.8, 4.4, 4, 3.6]), C.wood, { off: 1.4 });
      p.line(`M18 -54L18 -48`, OUTLINE, 2.6);
      glowDot(p, 18, -38, 9, C.glow);
      p.shape(smooth([[11, -46, 1], [25, -46, 1], [24, -30, 1], [12, -30, 1]]), '#2a1e24', {
        shade: null,
        sw: 4.6,
        inner: `<path d="${smooth([[18, -44], [22, -36], [18, -31], [14, -36]])}" fill="${C.glow}"/><path d="${ellipse(18, -35, 2, 3)}" fill="#fff6b0"/>`,
      });
      p.line(`M18 -46V-30M11 -38H25`, '#2a1e24', 1.6);
      p.shape(poly([[10, -46], [18, -51], [26, -46]]), C.trim, { off: 1, sw: 3.8 });
      p.shape(rect(11, -31, 14, 3, 1), C.trim, { off: 1, sw: 3.6 });
      return;
    }
    default: {
      shaft(p, C.wood, 48, -40, 5);
      orb(p, 0, -46, 7, C.glow);
    }
  }
}

/** Arrow (absolute coords) from the drawing hand toward the bow. */
export function drawArrow(p: Pen, x1: number, y1: number, x2: number, y2: number, L: HeroLook): void {
  p.line(`M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`, OUTLINE, 4.4);
  p.line(`M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`, '#e8d8b8', 1.8);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const deg = (ang * 180) / Math.PI + 90;
  p.at(x2, y2, deg).shape(poly([[-3.6, 2], [0, -7], [3.6, 2]]), L.ornate >= 2 ? L.glow : '#cfd6e4', { off: 1, sw: 3.8 }).close();
  p.at(x1, y1, deg).shape(poly([[-3.4, 6], [-1, -1], [1, -1], [3.4, 6], [0, 3]]), L.trim, { off: 1, sw: 3.4 }).close();
}

