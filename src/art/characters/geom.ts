// Path helpers for the procedural chibi characters. Pure string builders (no DOM).

/** A point. A third element of 1 marks a sharp corner for `smooth()`. */
export type V = readonly [number, number] | readonly [number, number, number];
export type Pt = readonly [number, number];

/** Compact number formatting for path data (1 decimal). */
export function f(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
}

/**
 * Catmull-Rom spline through the points, emitted as cubic Béziers.
 * Points with a third element of 1 become sharp corners.
 */
export function smooth(pts: readonly V[], closed = true, tension = 1): string {
  const n = pts.length;
  if (n < 2) return '';
  const at = (i: number): V => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const k = tension / 6;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[2] === 1 ? p1[0] : p1[0] + (p2[0] - p0[0]) * k;
    const c1y = p1[2] === 1 ? p1[1] : p1[1] + (p2[1] - p0[1]) * k;
    const c2x = p2[2] === 1 ? p2[0] : p2[0] - (p3[0] - p1[0]) * k;
    const c2y = p2[2] === 1 ? p2[1] : p2[1] - (p3[1] - p1[1]) * k;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** Straight-edged polygon (or polyline when `closed` is false). */
export function poly(pts: readonly V[], closed = true): string {
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('');
  return closed ? `${d}Z` : d;
}

export function ellipse(cx: number, cy: number, rx: number, ry = rx): string {
  return `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(rx * 2)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-rx * 2)} 0Z`;
}

export function rect(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
  const q = Math.min(r, w / 2, h / 2);
  return (
    `M${f(x + q)} ${f(y)}h${f(w - 2 * q)}a${f(q)} ${f(q)} 0 0 1 ${f(q)} ${f(q)}v${f(h - 2 * q)}` +
    `a${f(q)} ${f(q)} 0 0 1 ${f(-q)} ${f(q)}h${f(-(w - 2 * q))}a${f(q)} ${f(q)} 0 0 1 ${f(-q)} ${f(-q)}` +
    `v${f(-(h - 2 * q))}a${f(q)} ${f(q)} 0 0 1 ${f(q)} ${f(-q)}Z`
  );
}

/** Tapered tube with round caps through 2+ points (limbs, tails, shafts). */
export function tube(pts: readonly Pt[], widths: readonly number[]): string {
  const n = pts.length;
  const dirs: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    dirs.push(norm(b[0] - a[0], b[1] - a[1]));
  }
  const L: V[] = [];
  const R: V[] = [];
  for (let i = 0; i < n; i++) {
    const hw = (widths[i] ?? widths[widths.length - 1]) / 2;
    const [dx, dy] = dirs[i];
    L.push([pts[i][0] - dy * hw, pts[i][1] + dx * hw]);
    R.push([pts[i][0] + dy * hw, pts[i][1] - dx * hw]);
  }
  const cap = (p: Pt, d: Pt, hw: number, sign: number): V[] => {
    const out: V[] = [];
    for (const deg of [45, 90, 135]) {
      const t = (deg * Math.PI) / 180;
      const nx = -d[1];
      const ny = d[0];
      out.push([p[0] + hw * (nx * Math.cos(t) * sign + d[0] * Math.sin(t) * sign), p[1] + hw * (ny * Math.cos(t) * sign + d[1] * Math.sin(t) * sign)]);
    }
    return out;
  };
  const hwEnd = (widths[n - 1] ?? widths[widths.length - 1]) / 2;
  const hwStart = widths[0] / 2;
  const endCap = cap(pts[n - 1], dirs[n - 1], hwEnd, 1);
  const startCap = cap(pts[0], [-dirs[0][0], -dirs[0][1]], hwStart, 1);
  return smooth([...L, ...endCap, ...R.reverse(), ...startCap], true);
}

export function norm(x: number, y: number): Pt {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/** Point on a circle, angle in degrees measured clockwise from "up". */
export function polar(cx: number, cy: number, r: number, deg: number): Pt {
  const t = (deg * Math.PI) / 180;
  return [cx + Math.sin(t) * r, cy - Math.cos(t) * r];
}

/** Star / burst polygon (points alternate between outer and inner radius). */
export function star(cx: number, cy: number, outer: number, inner: number, points = 5, rot = 0): string {
  const pts: V[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    pts.push(polar(cx, cy, r, rot + (i * 180) / points));
  }
  return poly(pts);
}

/** Arc stroke path (open) on a circle between two angles (clockwise from up, degrees). */
export function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M${f(x1)} ${f(y1)}A${f(r)} ${f(r)} 0 ${large} ${sweep} ${f(x2)} ${f(y2)}`;
}

/** Maps points given in head-radius units around (x, y). */
export function scaler(x: number, y: number, r: number, ry = r): (pts: readonly V[]) => V[] {
  return (pts) => pts.map((p) => (p.length > 2 ? [x + p[0] * r, y + p[1] * ry, p[2] as number] : [x + p[0] * r, y + p[1] * ry]));
}
