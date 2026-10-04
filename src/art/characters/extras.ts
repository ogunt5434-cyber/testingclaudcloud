// Back items (wings, capes, tails, quivers...), auras and ambient particles.
import { darken, light, mix, shade } from './color';
import { ellipse, f, poly, rect, smooth, star, tube, type Pt, type V } from './geom';
import type { BackKind, HeroLook, ParticleKind, Rig } from './model';
import { OUTLINE, type Pen } from './pen';

/** Tiny deterministic PRNG so every hero gets a stable particle layout. */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function backAnchor(R: Rig): Pt {
  return [R.cx - 5, R.shY + 10];
}

function batWing(p: Pen, A: Pt, s: number, c: string, bone: string, far: boolean): void {
  const [ax, ay] = A;
  const X = (dx: number) => ax + dx * s * (far ? -0.8 : 1);
  const Y = (dy: number) => ay + dy * s * (far ? 0.95 : 1);
  const pts: V[] = [
    [X(2), Y(4)], [X(-6), Y(-18)], [X(-22), Y(-36), 1], [X(-46), Y(-30), 1], [X(-40), Y(-18)], [X(-50), Y(-2), 1], [X(-38), Y(-2)],
    [X(-40), Y(14), 1], [X(-28), Y(6)], [X(-22), Y(20), 1], [X(-12), Y(10)],
  ];
  const col = far ? shade(c, 0.6) : c;
  p.shape(smooth(pts), col, {
    off: 3,
    inner: `<path d="M${f(X(-22))} ${f(Y(-36))}L${f(X(-50))} ${f(Y(-2))}M${f(X(-22))} ${f(Y(-36))}L${f(X(-40))} ${f(Y(14))}M${f(X(-22))} ${f(Y(-36))}L${f(X(-22))} ${f(Y(20))}" stroke="${far ? shade(bone, 0.5) : bone}" stroke-width="2.2" fill="none"/>`,
  });
  p.shape(tube([[X(0), Y(0)], [X(-8), Y(-20)], [X(-22), Y(-36)]], [5, 4.4, 3.4]), far ? shade(bone, 0.5) : bone, { off: 1.2 });
  p.shape(poly([[X(-21), Y(-36)], [X(-24), Y(-44)], [X(-25), Y(-34)]]), far ? shade(bone, 0.5) : bone, { shade: null, sw: 3.4 });
}

function featherWing(p: Pen, A: Pt, s: number, c: string, tip: string, far: boolean, glow = false): void {
  const [ax, ay] = A;
  const sx = s * (far ? -0.78 : 1);
  const sy = s * (far ? 0.92 : 1);
  const X = (dx: number) => ax + dx * sx;
  const Y = (dy: number) => ay + dy * sy;
  const col = far ? shade(c, 0.55) : c;
  const tipc = far ? shade(tip, 0.55) : tip;
  const op = glow ? 0.9 : undefined;
  // primaries & secondaries hang from the wing arm (shoulder -> wrist), longest at the wrist
  const feathers: [number, number, number, number][] = [
    // [t along arm, angle (deg, clockwise from up, mirrored for far), length, width]
    [1.0, -100, 44, 9],
    [0.9, -122, 44, 9.5],
    [0.76, -142, 40, 9.5],
    [0.6, -160, 34, 9],
    [0.42, -174, 28, 8.5],
    [0.24, -186, 22, 8],
  ];
  const arm = (t: number): Pt => {
    // quadratic arm curve from shoulder (2,2) via (-6,-30) to wrist (-30,-40)
    const u = 1 - t;
    return [X(u * u * 2 + 2 * u * t * -6 + t * t * -30), Y(u * u * 2 + 2 * u * t * -30 + t * t * -40)];
  };
  for (const [t, ang, len, w] of feathers) {
    const [bx, by] = arm(t);
    const deg = far ? -ang : ang;
    const fl = len * s;
    const fw = w * s;
    const d = smooth([[0, 2, 1], [-fw * 0.55, -fl * 0.35], [-fw * 0.4, -fl * 0.8], [0, -fl, 1], [fw * 0.5, -fl * 0.7], [fw * 0.55, -fl * 0.3]]);
    p.at(bx, by, deg).shape(d, col, {
      off: 2.2,
      opacity: op,
      inner: `<path d="${smooth([[-fw, -fl * 0.62], [0, -fl * 0.72], [fw, -fl * 0.6], [fw, -fl * 1.2], [-fw, -fl * 1.2]])}" fill="${tipc}"/><path d="M0 -2L0 ${f(-fl * 0.85)}" stroke="${shade(col, 0.9)}" stroke-width="1.2"/>`,
    }).close();
  }
  // covert layer over the arm
  const cov: V[] = [];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const [x, y] = arm(t);
    cov.push([x + 2 * sx, y - 3 * sy]);
  }
  const lower: V[] = [
    [X(-34), Y(-30), 1], [X(-26), Y(-28)], [X(-26), Y(-18), 1], [X(-18), Y(-18)], [X(-16), Y(-6), 1], [X(-8), Y(-6)], [X(-4), Y(6), 1], [X(4), Y(4)],
  ];
  p.shape(smooth([...cov, ...lower]), far ? shade(light(c, 0.25), 0.55) : light(c, 0.25), { off: 2.5, opacity: op, rim: glow ? '#ffffff' : undefined });
}

export function drawBackItem(p: Pen, L: HeroLook, R: Rig, kind: BackKind): void {
  const A = backAnchor(R);
  const k = R.k;
  const bc = L.backColor ?? L.cloth;
  const { cx, shY, hipY, ground, tw, ww } = R;
  switch (kind) {
    case 'cape': {
      p.open('hs-cape', [cx, shY]);
      const pts: V[] = [
        [cx - tw + 1, shY + 1], [cx + tw - 2, shY - 1], [cx + tw + 4, shY + 12], [cx + ww + 4, ground - 22], [cx + 6, ground - 6],
        [cx - 8, ground - 9, 1], [cx - 14, ground - 3], [cx - tw - 18, ground - 8, 1], [cx - tw - 12, hipY - 2], [cx - tw - 7, shY + 14],
      ];
      p.shape(smooth(pts), bc, {
        off: 5,
        inner: `<path d="${smooth([[cx + ww + 6, ground - 30], [cx + 10, ground - 4], [cx - 6, ground - 2], [cx + ww + 10, ground + 6]])}" fill="${L.cloth2}"/>` + (L.ornate >= 2 ? `<path d="${smooth(pts.slice(3, 8), false)}" fill="none" stroke="${L.trim}" stroke-width="5"/>` : ''),
      });
      p.close();
      return;
    }
    case 'wings-bat': {
      p.open('hs-wing hs-wing-f', A);
      batWing(p, [A[0] + 10, A[1] - 4], 0.85 * k, bc, L.trim, true);
      p.close();
      p.open('hs-wing', A);
      batWing(p, A, 1.0 * k, bc, L.trim, false);
      p.close();
      return;
    }
    case 'wings-feather':
    case 'wings-eagle':
    case 'wings-light': {
      const glow = kind === 'wings-light';
      const tip = kind === 'wings-eagle' ? '#fffaf0' : glow ? light(L.glow, 0.5) : light(bc, 0.5);
      p.open('hs-wing hs-wing-f', A);
      featherWing(p, [A[0] + 12, A[1] - 6], 0.78 * k, bc, tip, true, glow);
      p.close();
      p.open('hs-wing', A);
      featherWing(p, A, 0.92 * k, bc, tip, false, glow);
      p.close();
      return;
    }
    case 'quiver': {
      const q1: Pt = [cx - tw - 4, shY + 30];
      const q2: Pt = [cx - tw + 8, shY - 6];
      for (const [dx, dy, c] of [[-3, -2, L.trim], [2, -5, '#ffffff'], [6, -1, L.trim]] as const) {
        const tx = q2[0] + dx + 4;
        const ty = q2[1] + dy - 8;
        p.line(`M${f(q2[0] + dx * 0.5)} ${f(q2[1])}L${f(tx)} ${f(ty)}`, OUTLINE, 3.6);
        p.at(tx, ty, 30).shape(poly([[-3, 3], [-2.4, -6], [0, -9], [2.4, -6], [3, 3], [0, 1]]), c, { off: 1, sw: 3.4 }).close();
      }
      p.shape(tube([q1, q2], [11 * k, 12 * k]), L.wood ?? '#7a4e2e', { off: 2.5, rim: light(L.wood ?? '#7a4e2e', 0.35), inner: `<path d="M${f(q1[0] - 6)} ${f(q1[1] - 12)}L${f(q1[0] + 8)} ${f(q1[1] - 6)}M${f(q2[0] - 8)} ${f(q2[1] + 8)}L${f(q2[0] + 6)} ${f(q2[1] + 14)}" stroke="${L.trim}" stroke-width="3"/>` });
      return;
    }
    case 'barrel': {
      const bx = cx - tw - 6;
      const by = shY + 4;
      p.shape(rect(bx - 12, by - 4, 22, 30, 7), L.wood ?? '#8a5a32', {
        off: 3.5,
        inner: `<path d="M${f(bx - 13)} ${f(by + 3)}h24M${f(bx - 13)} ${f(by + 19)}h24" stroke="#5a6478" stroke-width="3.6"/><path d="M${f(bx - 4)} ${f(by - 4)}v30M${f(bx + 4)} ${f(by - 4)}v30" stroke="${shade(L.wood ?? '#8a5a32', 1.3)}" stroke-width="1.4"/>`,
      });
      p.line(`M${f(bx)} ${f(by - 4)}q-6 -8 2 -12q8 -4 4 -10`, OUTLINE, 4);
      p.line(`M${f(bx)} ${f(by - 4)}q-6 -8 2 -12q8 -4 4 -10`, '#b08a5a', 1.8);
      return;
    }
    case 'scarf': {
      p.open('hs-scarf', [cx - tw + 2, shY + 2]);
      const c = L.backColor ?? L.trim;
      p.shape(smooth([[cx - tw + 4, shY], [cx - tw - 10, shY + 2], [cx - tw - 26, shY - 4], [cx - tw - 44, shY + 2, 1], [cx - tw - 30, shY + 6], [cx - tw - 14, shY + 10], [cx - tw + 2, shY + 8]]), c, { off: 2.5 });
      p.shape(smooth([[cx - tw + 2, shY + 6], [cx - tw - 8, shY + 14], [cx - tw - 22, shY + 14], [cx - tw - 34, shY + 22, 1], [cx - tw - 22, shY + 20], [cx - tw - 8, shY + 20], [cx - tw + 4, shY + 12]]), shade(c, 0.4), { off: 2 });
      p.close();
      return;
    }
    case 'spider-legs': {
      const [ax, ay] = A;
      const legs: [Pt, Pt, Pt][] = [
        [[ax, ay], [ax - 22, ay - 34], [ax - 44, ay - 18]],
        [[ax, ay + 4], [ax - 30, ay - 12], [ax - 46, ay + 16]],
        [[ax + 6, ay - 2], [ax + 18, ay - 40], [ax + 34, ay - 36]],
        [[ax + 6, ay + 2], [ax + 30, ay - 20], [ax + 44, ay - 4]],
      ];
      legs.forEach((lg, i) => {
        p.open('hs-leg', lg[0]);
        const far = i >= 2;
        const c = far ? shade(bc, 0.5) : bc;
        p.shape(tube([lg[0], lg[1]], [6, 4.6]), c, { off: 1.4 });
        p.shape(tube([lg[1], lg[2]], [4.4, 2]), c, { off: 1.2 });
        p.shape(ellipse(lg[1][0], lg[1][1], 3.4), far ? shade(L.glow, 0.5) : L.glow, { shade: null, sw: 3 });
        p.close();
      });
      return;
    }
    case 'tail-scorpion': {
      const B: Pt = [cx - ww + 2, hipY - 8];
      const pts: Pt[] = [B, [B[0] - 20, B[1] - 10], [B[0] - 32, B[1] - 38], [B[0] - 28, B[1] - 72], [B[0] - 10, B[1] - 100], [B[0] + 16, B[1] - 110], [B[0] + 36, B[1] - 102]];
      const widths = [15, 14, 13, 12, 11, 10, 9];
      p.open('hs-tail', B);
      // segments, tip first so the base overlaps
      for (let i = pts.length - 2; i >= 0; i--) {
        const a2 = pts[i];
        const b2 = pts[i + 1];
        p.shape(tube([a2, b2], [widths[i], widths[i + 1]]), bc, { off: 2, rim: light(bc, 0.45), rimW: 1.4 });
      }
      const [sx, sy] = pts[pts.length - 1];
      p.shape(smooth([[sx - 4, sy - 5], [sx + 8, sy - 4], [sx + 14, sy + 6], [sx + 12, sy + 18, 1], [sx + 7, sy + 7], [sx - 2, sy + 4]]), L.trim, { off: 2, rim: '#fff' });
      p.fill(ellipse(sx + 12, sy + 17, 5), L.glow, 0.45);
      p.fill(ellipse(sx + 12, sy + 17, 2.2), L.glow);
      p.close();
      return;
    }
    case 'wisp':
      return;
    default:
      return;
  }
}

/** Tails attach at the lower back and sit behind the legs. */
export function drawTail(p: Pen, L: HeroLook, R: Rig, kind: BackKind): void {
  const { cx, hipY, ww } = R;
  const B: Pt = [cx - ww + 3, hipY - 6];
  const [bx, by] = B;
  const k = R.k;
  p.open('hs-tail', B);
  switch (kind) {
    case 'tail-fox': {
      const c = L.skin;
      const pts: V[] = [[bx + 2, by - 4], [bx - 10, by + 6], [bx - 26, by + 6], [bx - 38, by - 6], [bx - 44, by - 26], [bx - 38, by - 46, 1], [bx - 30, by - 30], [bx - 20, by - 16], [bx - 8, by - 10]];
      p.shape(smooth(pts), c, {
        off: 4,
        inner: `<path d="${smooth([[bx - 50, by - 30], [bx - 38, by - 50], [bx - 26, by - 30], [bx - 36, by - 22]])}" fill="${L.skin2 ?? '#fff4e6'}"/>`,
      });
      break;
    }
    case 'tail-lizard': {
      const c = L.skin;
      const pts: Pt[] = [[bx + 4, by], [bx - 12, by + 12], [bx - 28, by + 22], [bx - 44, by + 20]];
      p.shape(tube(pts, [15 * k, 12 * k, 8 * k, 4 * k]), c, { off: 3, inner: `<path d="${smooth([[bx + 4, by + 8], [bx - 12, by + 18], [bx - 28, by + 26], [bx - 44, by + 24]], false)}" stroke="${L.skin2 ?? '#ffd27a'}" stroke-width="4" fill="none"/>` });
      const [tx, ty] = pts[3];
      p.raw(`<g class="hs-flame" style="transform-origin:${f(tx)}px ${f(ty)}px">`);
      p.shape(smooth([[tx + 2, ty + 2], [tx - 6, ty - 6], [tx - 8, ty - 18, 1], [tx - 2, ty - 10], [tx + 2, ty - 22, 1], [tx + 5, ty - 8], [tx + 8, ty - 4]]), L.glow, { shade: mix(L.glow, '#ff3a1a', 0.6), off: 2, sw: 4.2, inner: `<path d="${ellipse(tx, ty - 4, 2.4, 4)}" fill="#fff6b0"/>` });
      p.raw('</g>');
      break;
    }
    case 'tail-lion': {
      const pts: Pt[] = [[bx + 2, by], [bx - 12, by + 8], [bx - 24, by - 2], [bx - 28, by - 16]];
      p.shape(tube(pts, [5.4, 4.6, 4, 3.6]), L.skin, { off: 1.4 });
      const [tx, ty] = pts[3];
      p.shape(smooth([[tx - 1, ty + 4], [tx - 8, ty - 2, 1], [tx - 4, ty - 6], [tx - 6, ty - 13, 1], [tx, ty - 8], [tx + 5, ty - 12, 1], [tx + 4, ty - 2], [tx + 3, ty + 4]]), L.hair?.color ?? '#c0602a', { off: 2 });
      break;
    }
    case 'tail-devil': {
      const pts: Pt[] = [[bx + 2, by], [bx - 12, by + 10], [bx - 26, by + 4], [bx - 30, by - 12]];
      p.shape(tube(pts, [4.6, 4, 3.4, 3]), L.skin, { off: 1.2 });
      const [tx, ty] = pts[3];
      p.shape(smooth([[tx, ty + 2, 1], [tx - 7, ty - 3], [tx, ty - 12, 1], [tx + 7, ty - 3]]), darken(L.skin, 0.2), { off: 1.5, sw: 4 });
      break;
    }
  }
  p.close();
}

export function isTail(kind: BackKind): boolean {
  return kind === 'tail-fox' || kind === 'tail-lizard' || kind === 'tail-lion' || kind === 'tail-devil';
}

/** Soft aura + ground glyph behind rare heroes. */
export function drawAura(p: Pen, L: HeroLook, R: Rig): void {
  const id = p.id('au');
  const cy = (R.head.y + R.ground) / 2;
  p.raw(
    `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${L.glow}" stop-opacity=".55"/><stop offset=".6" stop-color="${L.glow}" stop-opacity=".18"/><stop offset="1" stop-color="${L.glow}" stop-opacity="0"/></radialGradient></defs>` +
      `<g class="hs-aura" style="transform-origin:${R.cx}px ${f(cy)}px" stroke="none"><ellipse cx="${R.cx}" cy="${f(cy)}" rx="64" ry="${f((R.ground - R.head.y) * 0.72)}" fill="url(#${id})"/></g>`,
  );
}

export function drawGroundGlyph(L: HeroLook, R: Rig): string {
  const g = R.ground;
  return (
    `<g class="hs-glyph" stroke="none" opacity=".75"><ellipse cx="${R.cx}" cy="${g}" rx="40" ry="9" fill="none" stroke="${L.glow}" stroke-width="2" opacity=".8"/>` +
    `<ellipse cx="${R.cx}" cy="${g}" rx="31" ry="6.5" fill="none" stroke="${L.glow}" stroke-width="1.2" stroke-dasharray="3 4" opacity=".7"/></g>`
  );
}

/** Ambient particles (CSS-animated, each with its own delay). */
export function drawParticles(p: Pen, L: HeroLook, R: Rig, kind: ParticleKind, count = 6): void {
  const rnd = seeded(L.id + kind);
  const top = R.head.y - R.head.r * 1.2;
  for (let i = 0; i < count; i++) {
    const x = R.cx - 46 + rnd() * 92;
    const y = top + rnd() * (R.ground - top - 16);
    const delay = -(rnd() * 3).toFixed(2);
    const dur = (2.4 + rnd() * 1.8).toFixed(2);
    const s = 0.7 + rnd() * 0.6;
    p.raw(`<g class="hs-pt" style="animation-delay:${delay}s;animation-duration:${dur}s;transform-origin:${f(x)}px ${f(y)}px">`);
    switch (kind) {
      case 'motes':
        p.fill(ellipse(x, y, 4 * s), L.glow, 0.35);
        p.fill(ellipse(x, y, 1.8 * s), '#ffffff', 0.95);
        break;
      case 'embers':
        p.fill(ellipse(x, y, 3.6 * s), '#ff7a2a', 0.35);
        p.fill(poly([[x, y - 3 * s], [x + 1.8 * s, y], [x, y + 3 * s], [x - 1.8 * s, y]]), '#ffd25a');
        break;
      case 'leaves':
        p.at(x, y, rnd() * 360).shape(smooth([[0, 4 * s, 1], [-3 * s, 0], [0, -4.5 * s, 1], [3 * s, 0]]), i % 2 ? '#8ad65a' : '#c9e05a', { shade: null, sw: 2.6 }).close();
        break;
      case 'stars':
        p.fill(ellipse(x, y, 4.5 * s), L.glow, 0.3);
        p.fill(star(x, y, 4 * s, 1.2 * s, 4, 0), '#fffbe0');
        break;
      case 'sparks':
        p.line(`M${f(x - 3 * s)} ${f(y - 4 * s)}l${f(3 * s)} ${f(3 * s)}l${f(-2 * s)} ${f(1 * s)}l${f(3 * s)} ${f(4 * s)}`, L.glow, 1.8 * s);
        p.fill(ellipse(x, y, 4 * s), L.glow, 0.25);
        break;
      case 'wisps':
        p.fill(ellipse(x, y, 4.4 * s), L.glow, 0.3);
        p.fill(ellipse(x, y, 2.2 * s), light(L.glow, 0.5), 0.9);
        break;
      case 'spores':
        p.fill(ellipse(x, y, 2.4 * s), L.glow, 0.85);
        p.fill(ellipse(x, y, 4 * s), L.glow, 0.25);
        break;
      case 'feathers':
        p.at(x, y, -30 + rnd() * 60).shape(smooth([[0, 5 * s, 1], [-2.4 * s, 0], [0, -5 * s, 1], [2.4 * s, 0]]), '#fffaf0', { shade: null, sw: 2.4 }).close();
        break;
    }
    p.raw('</g>');
  }
}

/** Little spirit companion that floats beside the hero. */
export function drawWisp(p: Pen, L: HeroLook, R: Rig): void {
  const x = R.cx - 40;
  const y = R.head.y - 6;
  p.raw(`<g class="hs-wisp" style="transform-origin:${f(x)}px ${f(y)}px">`);
  p.fill(ellipse(x, y, 13), L.glow, 0.22);
  p.shape(smooth([[x - 8, y], [x - 6, y - 8], [x + 2, y - 10], [x + 8, y - 4], [x + 7, y + 5], [x + 2, y + 9], [x + 6, y + 18, 1], [x - 2, y + 10], [x - 8, y + 6]]), light(L.glow, 0.55), { shade: L.glow, off: 2.5, sw: 3.6 });
  p.fill(ellipse(x - 1, y - 2, 1.6, 2.2), OUTLINE);
  p.fill(ellipse(x + 4, y - 2.5, 1.4, 2), OUTLINE);
  p.raw('</g>');
}

