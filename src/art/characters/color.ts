// Tiny color helpers for cel shading (hex in, hex out).

type RGB = [number, number, number];

function parse(c: string): RGB {
  let h = c.replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const v = parseInt(h.slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function hex([r, g, b]: RGB): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Linear mix from a (t=0) to b (t=1). */
export function mix(a: string, b: string, t: number): string {
  const A = parse(a);
  const B = parse(b);
  return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/** Cel-shadow tone: multiply with a cool lavender so shadows read violet, like painted cartoons. */
export function shade(c: string, t = 1): string {
  const A = parse(c);
  const M: RGB = [150, 132, 205];
  const mul: RGB = [(A[0] * M[0]) / 255, (A[1] * M[1]) / 255, (A[2] * M[2]) / 255];
  return hex([A[0] + (mul[0] - A[0]) * t, A[1] + (mul[1] - A[1]) * t, A[2] + (mul[2] - A[2]) * t]);
}

/** Warm highlight tone. */
export function light(c: string, t = 0.45): string {
  return mix(c, '#fffbe8', t);
}

export function darken(c: string, t = 0.3): string {
  return mix(c, '#140c22', t);
}

/** Perceived luminance 0..1. */
export function luma(c: string): number {
  const [r, g, b] = parse(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
