// Town hub illustration (1280x720 design): sky, distant mountains, a hilltop plaza and seven
// ORIGINAL clickable buildings. Pure string builders; src/art/town.ts mounts them as buttons.
import type { TownBuildingId } from '../types';
import { blobPath, Ids, mix, n, poly, ridgePath, scallopPath, smoothOpen, starPath } from './kit';
import { Art, ao, bush, foliage, glow, grassTuft, pineTree, rock, roundTree, type RockPal } from './props';

export interface TownOverlay {
  /** CSS modifier class (animation). */
  cls: string;
  x: number;
  y: number;
  w: number;
  h: number;
  html: string;
}

export interface TownBuildingDef {
  id: TownBuildingId;
  label: string;
  /** Button box in stage px. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Ribbon anchor (center x, top y) in local px. */
  ribbon: { x: number; y: number; big?: boolean };
  art: (a: Art) => string;
  /** Optional art drawn above the animated overlays (e.g. front pillars). */
  front?: (a: Art) => string;
  overlays: (a: Art) => TownOverlay[];
}

type Stone = { light: string; mid: string; dark: string; line: string };

const STONE: Stone = { light: '#f6efe2', mid: '#d3c6ad', dark: '#94836a', line: '#3b2f22' };
const GATE: Stone = { light: '#f0f3f6', mid: '#bfc8d2', dark: '#7c8794', line: '#262d38' };
const ROCK: RockPal = { light: '#c9c2b4', mid: '#8f877a', dark: '#5a544c', line: '#2a2620' };

// ---------------------------------------------------------------------------
// shared building parts
// ---------------------------------------------------------------------------

/** A disc-shaped platform (top ellipse + visible front side). */
function slab(a: Art, cx: number, cy: number, rx: number, ry: number, h: number, s: Stone): string {
  const side = `M${n(cx - rx)} ${n(cy)}V${n(cy + h)}A${n(rx)} ${n(ry)} 0 0 0 ${n(cx + rx)} ${n(cy + h)}V${n(cy)}Z`;
  return (
    `<path d="${side}" fill="${a.lin([[0, s.mid], [0.5, s.dark], [1, mix(s.dark, '#000000', 0.25)]], 0, 0, 1, 0)}" stroke="${s.line}" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${a.lin([[0, s.light], [1, s.mid]])}" stroke="${s.line}" stroke-width="2.4"/>` +
    `<ellipse cx="${n(cx)}" cy="${n(cy + 1.5)}" rx="${n(rx - 5)}" ry="${n(ry - 3)}" fill="none" stroke="#fff" stroke-width="1.6" opacity=".45"/>`
  );
}

/** Vertical box with a lit left face (cylinder-ish shading). */
function block(a: Art, x: number, y: number, w: number, h: number, s: Stone, r = 2): string {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${r}" fill="${a.lin([[0, s.mid], [0.3, s.light], [0.75, s.mid], [1, s.dark]], 0, 0, 1, 0)}" stroke="${s.line}" stroke-width="2.4" stroke-linejoin="round"/>`;
}

/** Pennant flag drawn at its pole top (for overlays: pole left edge at x=0). */
function flagSvg(w: number, h: number, cloth: string, trim: string, mark: 'star' | 'diamond' | 'moon' = 'diamond'): string {
  const d = `M2 2H${n(w * 0.55)}Q${n(w * 0.8)} ${n(h * 0.1)} ${n(w)} 2L${n(w * 0.78)} ${n(h * 0.45)}L${n(w)} ${n(h - 2)}Q${n(w * 0.7)} ${n(h * 0.9)} 2 ${n(h - 2)}Z`;
  let m = '';
  const cx = w * 0.38;
  const cy = h * 0.5;
  const r = h * 0.2;
  if (mark === 'star') m = `<path d="${starPath(cx, cy, 5, r, r * 0.45)}" fill="${trim}"/>`;
  else if (mark === 'moon') m = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${trim}"/><circle cx="${n(cx + r * 0.45)}" cy="${n(cy - r * 0.25)}" r="${n(r * 0.8)}" fill="${cloth}"/>`;
  else m = `<path d="M${n(cx)} ${n(cy - r)}L${n(cx + r * 0.75)} ${n(cy)}L${n(cx)} ${n(cy + r)}L${n(cx - r * 0.75)} ${n(cy)}Z" fill="${trim}"/>`;
  return (
    `<svg viewBox="0 0 ${n(w)} ${n(h)}" xmlns="http://www.w3.org/2000/svg" overflow="visible">` +
    `<path d="${d}" fill="${cloth}" stroke="#2a1408" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M2 ${n(h * 0.62)}Q${n(w * 0.45)} ${n(h * 0.52)} ${n(w * 0.9)} ${n(h * 0.75)}L${n(w)} ${n(h - 2)}Q${n(w * 0.7)} ${n(h * 0.9)} 2 ${n(h - 2)}Z" fill="#000" opacity=".18"/>` +
    m +
    `</svg>`
  );
}

function pole(x: number, top: number, bottom: number): string {
  return `<path d="M${n(x)} ${n(bottom)}V${n(top)}" stroke="#3a2412" stroke-width="5" stroke-linecap="round"/><path d="M${n(x)} ${n(bottom)}V${n(top)}" stroke="#a87a48" stroke-width="2.4" stroke-linecap="round"/><circle cx="${n(x)}" cy="${n(top - 2)}" r="3.4" fill="#ffd34a" stroke="#5a3a08" stroke-width="1.4"/>`;
}

function flagOverlay(x: number, y: number, w: number, h: number, cloth: string, trim: string, mark: 'star' | 'diamond' | 'moon' = 'diamond'): TownOverlay {
  return { cls: 'flag', x, y, w, h, html: flagSvg(w, h, cloth, trim, mark) };
}

function flameSvg(): string {
  return (
    `<svg viewBox="0 0 30 44" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M15 2C20 12 28 18 26 30C25 38 20 42 15 42C9 42 4 38 4 30C4 22 10 18 12 10C13 15 15 17 16 18C17 13 17 7 15 2Z" fill="#ff7a1a"/>` +
    `<path d="M15 16C18 22 22 26 21 32C20.5 37 18 39 15 39C12 39 9 37 9 33C9 28 13 25 15 16Z" fill="#ffd23a"/>` +
    `<path d="M15 27C16.5 30 18 32 17.5 35C17 37 16 38 15 38C13.5 38 12.5 37 12.5 35C12.5 32 14 30 15 27Z" fill="#fff8d0"/>` +
    `</svg>`
  );
}

function glowDot(color: string): string {
  return `<i style="--c:${color}"></i>`;
}

/** Brazier bowl on a short stand (the flame itself is an animated overlay). */
function brazierBase(a: Art, x: number, by: number, s: number): string {
  return (
    ao(a, x, by, 20 * s, 4 * s, 0.4) +
    `<path d="M${n(x - 7 * s)} ${n(by)}L${n(x - 4 * s)} ${n(by - 24 * s)}H${n(x + 4 * s)}L${n(x + 7 * s)} ${n(by)}Z" fill="#4a4556" stroke="#16131c" stroke-width="2"/>` +
    `<path d="M${n(x - 16 * s)} ${n(by - 30 * s)}Q${n(x)} ${n(by - 16 * s)} ${n(x + 16 * s)} ${n(by - 30 * s)}Z" fill="${a.lin([[0, '#ffd34a'], [1, '#a8640a']])}" stroke="#3a2004" stroke-width="2" stroke-linejoin="round"/>`
  );
}

// ---------------------------------------------------------------------------
// Sefer Kapısı — a stone portal arch grown into the trunk of a colossal ancient plane tree (çınar),
// paper lanterns hanging from its spreading crown (original design)
// ---------------------------------------------------------------------------

const GATE_CX = 170;
const GATE_CY = 214;
const GATE_RO = 122;
const GATE_RI = 74;

const BARK = { light: '#b07a4e', mid: '#7a4e30', dark: '#4a2c18', line: '#1e1008' };
/** Paper lanterns hanging from the crown: x, string top y, lantern y, colour (local px). */
const TREE_LANTERNS: readonly [number, number, number, string][] = [
  [8, 34, 74, '#ff6a3a'],
  [74, 14, 60, '#ffc23a'],
  [262, 16, 58, '#ff6a3a'],
  [334, 36, 80, '#ffc23a'],
  [170, 2, 40, '#ff6a3a'],
  [384, 60, 100, '#ffc23a'],
];

function gateArt(a: Art): string {
  const cx = GATE_CX;
  const cy = GATE_CY;
  const ro = GATE_RO;
  const ri = GATE_RI;
  let out = '';
  out += greatTree(a);
  out += glow(a, cx, 230, 200, 150, '#7ff6ff', 0.45);
  // dais
  out += slab(a, cx, 322, 168, 30, 16, STONE);
  out += slab(a, cx, 304, 140, 24, 14, STONE);
  out += slab(a, cx, 290, 112, 18, 10, GATE);
  out += treeRoots(a);
  // portal backing (the swirl overlay sits on top of this)
  const opening = `M${n(cx - ri)} 292V${n(cy)}A${n(ri)} ${n(ri)} 0 0 1 ${n(cx + ri)} ${n(cy)}V292Z`;
  out += `<path d="${opening}" fill="${a.rad([[0, '#d8fff8'], [0.35, '#3fd0d8'], [1, '#0a3a52']], 0.5, 0.55, 0.6)}"/>`;
  // pillars
  for (const px of [cx - ro, cx + ri]) {
    const w = ro - ri;
    out += block(a, px, cy - 2, w, 90, GATE, 3);
    out += `<path d="M${n(px + w / 2)} ${n(cy + 14)}V${n(cy + 70)}" stroke="#0a3a44" stroke-width="9" stroke-linecap="round"/>`;
    out += `<path d="M${n(px + w / 2)} ${n(cy + 18)}L${n(px + w / 2 + 6)} ${n(cy + 28)}L${n(px + w / 2)} ${n(cy + 38)}L${n(px + w / 2 - 6)} ${n(cy + 48)}L${n(px + w / 2)} ${n(cy + 58)}V${n(cy + 66)}" fill="none" stroke="#7ff6ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    out += block(a, px - 7, 270, w + 14, 22, GATE, 2);
    out += block(a, px - 5, cy - 14, w + 10, 14, GATE, 2);
  }
  // arch voussoirs
  const stones = 11;
  for (let i = 0; i < stones; i++) {
    const a0 = Math.PI + (i / stones) * Math.PI;
    const a1 = Math.PI + ((i + 1) / stones) * Math.PI;
    const q = poly([
      [cx + Math.cos(a0) * ri, cy + Math.sin(a0) * ri],
      [cx + Math.cos(a0) * ro, cy + Math.sin(a0) * ro],
      [cx + Math.cos(a1) * ro, cy + Math.sin(a1) * ro],
      [cx + Math.cos(a1) * ri, cy + Math.sin(a1) * ri],
    ]);
    const mid = (a0 + a1) / 2;
    const lit = Math.cos(mid) < 0.1;
    out += `<path d="${q}" fill="${i === 5 ? GATE.light : lit ? mix(GATE.light, GATE.mid, (i % 2) * 0.45) : mix(GATE.mid, GATE.dark, (i % 2) * 0.5)}" stroke="${GATE.line}" stroke-width="2.6" stroke-linejoin="round"/>`;
    if (i % 2 === 1 && i !== 5) {
      const rx = cx + Math.cos(mid) * ((ri + ro) / 2);
      const ry = cy + Math.sin(mid) * ((ri + ro) / 2);
      out += `<circle cx="${n(rx)}" cy="${n(ry)}" r="5" fill="none" stroke="#3fc6d0" stroke-width="2.2"/><circle cx="${n(rx)}" cy="${n(ry)}" r="1.8" fill="#bffcff"/>`;
    }
  }
  // ivy from the tree creeping over the arch
  out += ivy(a, [[cx - ro + 6, cy - 30], [cx - ro + 26, cy - 78], [cx - 60, cy - 108], [cx - 20, cy - 118]]);
  out += ivy(a, [[cx + ro - 4, cy - 10], [cx + ro - 14, cy - 64], [cx + 64, cy - 104]]);
  // inner rim highlight & outer shadow line
  out += `<path d="M${n(cx - ri + 3)} ${n(cy)}A${n(ri - 3)} ${n(ri - 3)} 0 0 1 ${n(cx + ri - 3)} ${n(cy)}" fill="none" stroke="#0a2a3a" stroke-width="4" opacity=".45"/>`;
  out += `<path d="M${n(cx - ro + 4)} ${n(cy - 6)}A${n(ro - 4)} ${n(ro - 4)} 0 0 1 ${n(cx - 30)} ${n(cy - ro + 6)}" fill="none" stroke="#fff" stroke-width="3" opacity=".6" stroke-linecap="round"/>`;
  // keystone gem
  out += `<path d="M${n(cx)} ${n(cy - ro + 6)}L${n(cx + 12)} ${n(cy - ro + 22)}L${n(cx)} ${n(cy - ro + 38)}L${n(cx - 12)} ${n(cy - ro + 22)}Z" fill="${a.lin([[0, '#e8ffff'], [0.5, '#45dff1'], [1, '#117ba1']])}" stroke="#05384c" stroke-width="2.4" stroke-linejoin="round"/>`;
  // braziers on the dais
  out += brazierBase(a, 20, 318, 1.15);
  out += brazierBase(a, 320, 318, 1.15);
  return out;
}

/** Ivy runner with leaves along a smooth path. */
function ivy(a: Art, pts: [number, number][]): string {
  let out = `<path d="${smoothOpen(pts)}" fill="none" stroke="#1d4012" stroke-width="4" stroke-linecap="round"/><path d="${smoothOpen(pts)}" fill="none" stroke="#4f8a2e" stroke-width="2" stroke-linecap="round"/>`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    for (let t = 0.2; t < 1; t += 0.4) {
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const side = (i + t) % 0.8 < 0.4 ? 1 : -1;
      out += `<path d="M${n(x)} ${n(y)}q${n(6 * side)} -9 ${n(14 * side)} -4q-3 9 -14 4Z" fill="${a.pick(['#6cbf4a', '#4f9a38', '#8fd85a'])}" stroke="#1d4012" stroke-width="1.4" stroke-linejoin="round"/>`;
    }
  }
  return out;
}

/** The great plane tree behind the gate: limbs, trunk and the spreading crown (crown is not clickable). */
function greatTree(a: Art): string {
  const cx = GATE_CX;
  let out = '';
  const bark = a.lin([[0, BARK.dark], [0.22, BARK.light], [0.5, BARK.mid], [1, BARK.dark]], 0, 0, 1, 0);
  const deco = (inner: string): string => `<g pointer-events="none">${inner}</g>`;
  const leafBack: [string, string, string] = ['#4f9a44', '#2f6e34', '#1a4220'];
  const leafFront: [string, string, string] = ['#a8e070', '#58a846', '#2a6a30'];
  // back crown (dark), so limbs read in front of it
  let crown = glow(a, cx, -10, 300, 140, '#ffcf8a', 0.35);
  for (const [x, y, rx, ry] of [[cx, -44, 170, 70], [cx - 140, 6, 110, 62], [cx + 150, 2, 116, 64], [cx - 70, -60, 100, 56], [cx + 80, -62, 104, 56]] as const) {
    crown += foliage(a, x, y, rx, ry, leafBack, '#0e2410', { details: false, lw: 2 });
  }
  out += deco(crown);
  // limbs
  out += deco(
    taper([[cx - 52, 132], [cx - 92, 76], [cx - 150, 36], [cx - 214, 20]], 46, 12, bark, BARK.line) +
      taper([[cx + 52, 132], [cx + 96, 74], [cx + 150, 34], [cx + 222, 18]], 46, 12, bark, BARK.line) +
      taper([[cx - 6, 120], [cx - 14, 60], [cx + 4, 0], [cx - 10, -40]], 44, 12, bark, BARK.line) +
      taper([[cx - 120, 52], [cx - 136, 10], [cx - 120, -26]], 16, 6, bark, BARK.line) +
      taper([[cx + 124, 48], [cx + 146, 4], [cx + 128, -30]], 16, 6, bark, BARK.line),
  );
  // trunk: wide flared base the arch is set into
  const trunk = `M${n(cx - 176)} 306C${n(cx - 140)} 300 ${n(cx - 140)} 262 ${n(cx - 146)} 220C${n(cx - 152)} 170 ${n(cx - 128)} 128 ${n(cx - 80)} 108Q${n(cx)} 88 ${n(cx + 80)} 108C${n(cx + 128)} 128 ${n(cx + 152)} 170 ${n(cx + 146)} 220C${n(cx + 140)} 262 ${n(cx + 140)} 300 ${n(cx + 176)} 306Z`;
  out += `<path d="${trunk}" fill="${bark}" stroke="${BARK.line}" stroke-width="2.8" stroke-linejoin="round"/>`;
  let grooves = '';
  for (const gx of [-138, -124, -108, 108, 124, 140]) {
    grooves += `M${n(cx + gx)} ${n(296 - a.r(0, 20))}Q${n(cx + gx * 0.94 + a.r(-6, 6))} 200 ${n(cx + gx * 0.7)} ${n(118 + a.r(-6, 6))}`;
  }
  out += `<g clip-path="${a.clip(trunk)}"><path d="${grooves}" fill="none" stroke="${BARK.dark}" stroke-width="3" stroke-linecap="round" opacity=".7"/>` +
    `<path d="M${n(cx - 130)} 140Q${n(cx - 140)} 210 ${n(cx - 132)} 290" fill="none" stroke="#e8b880" stroke-width="5" stroke-linecap="round" opacity=".35"/>` +
    `<ellipse cx="${n(cx + 128)}" cy="168" rx="7" ry="11" fill="#2a160a" stroke="${BARK.light}" stroke-width="2"/></g>`;
  // moss on the shoulders
  out += `<path d="${blobPath(a.rand, cx - 112, 116, 34, 9, 8, 0.25)}" fill="#5aa53c" stroke="#16300f" stroke-width="1.6"/>`;
  out += `<path d="${blobPath(a.rand, cx + 108, 114, 30, 8, 8, 0.25)}" fill="#5aa53c" stroke="#16300f" stroke-width="1.6"/>`;
  // front crown clumps (lit by the dusk sky)
  let front = '';
  for (const [x, y, rx, ry] of [[cx - 196, 30, 76, 46], [cx + 206, 26, 80, 46], [cx - 110, -22, 92, 52], [cx + 118, -26, 96, 52], [cx, -64, 112, 50]] as const) {
    front += foliage(a, x, y, rx, ry, leafFront, '#0e2410', { lw: 2.2 });
  }
  // lantern strings (the lanterns themselves are swinging overlays)
  for (const [lx, top, ly] of TREE_LANTERNS) front += `<path d="M${lx} ${top}V${ly - 12}" stroke="#2a1608" stroke-width="1.6"/>`;
  out += deco(front);
  return out;
}

/** Roots spilling over the dais (drawn over the stone, under the arch). */
function treeRoots(a: Art): string {
  const cx = GATE_CX;
  const bark = a.lin([[0, BARK.light], [1, BARK.dark]]);
  return (
    taper([[cx - 150, 296], [cx - 176, 314], [cx - 200, 334], [cx - 214, 344]], 30, 8, bark, BARK.line) +
    taper([[cx + 150, 296], [cx + 180, 316], [cx + 204, 336], [cx + 222, 342]], 30, 8, bark, BARK.line) +
    taper([[cx - 124, 300], [cx - 120, 322], [cx - 108, 340]], 18, 6, bark, BARK.line) +
    taper([[cx + 120, 300], [cx + 126, 324], [cx + 114, 342]], 18, 6, bark, BARK.line)
  );
}

/** Swinging paper lantern (overlay, 24x34 box). */
function paperLanternSvg(color: string): string {
  return (
    `<svg viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="8" y="0" width="8" height="5" rx="1" fill="#3a2410" stroke="#1a0c04" stroke-width="1.2"/>` +
    `<ellipse cx="12" cy="17" rx="11" ry="12" fill="${color}" stroke="#4a1404" stroke-width="1.8"/>` +
    `<ellipse cx="12" cy="17" rx="5" ry="12" fill="none" stroke="#4a1404" stroke-width="1.2" opacity=".55"/>` +
    `<ellipse cx="9" cy="13" rx="4" ry="6" fill="#fff7c0" opacity=".75"/>` +
    `<rect x="8" y="28" width="8" height="4" rx="1" fill="#3a2410" stroke="#1a0c04" stroke-width="1.2"/>` +
    `<path d="M12 32V34" stroke="#ffd36a" stroke-width="2"/></svg>`
  );
}

/** Tapered ribbon along a smooth path (tails, horns). */
function taper(pts: readonly [number, number][], w0: number, w1: number, fill: string, line: string): string {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
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
  const back = smoothOpen([...right].reverse());
  const d = `${smoothOpen(left)}L${back.slice(1)}Z`;
  return `<path d="${d}" fill="${fill}" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/>`;
}

/** Swirling mist for the gate portal (rotated by CSS). */
function portalSwirl(gid: string): string {
  let arms = '';
  for (let k = 0; k < 6; k++) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const ang = (k / 6) * Math.PI * 2 + t * 4.6;
      const r = 6 + t * 96;
      pts.push([100 + Math.cos(ang) * r, 100 + Math.sin(ang) * r]);
    }
    arms += `<path d="${smoothOpen(pts)}" stroke-width="${k % 2 ? 6 : 10}" stroke="${k % 3 === 0 ? '#e9fffb' : k % 3 === 1 ? '#5fe6f0' : '#2aa7c4'}" opacity="${k % 2 ? 0.7 : 0.85}"/>`;
  }
  let flecks = '';
  for (let i = 0; i < 14; i++) {
    const ang = i * 2.4;
    const r = 20 + ((i * 37) % 70);
    flecks += `<circle cx="${n(100 + Math.cos(ang) * r)}" cy="${n(100 + Math.sin(ang) * r)}" r="${n(1.5 + (i % 3))}" fill="#ffe9a0"/>`;
  }
  return (
    `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><radialGradient id="${gid}"><stop offset="0" stop-color="#ffffff"/><stop offset=".2" stop-color="#bafcff"/><stop offset=".55" stop-color="#1fa6c0"/><stop offset="1" stop-color="#083048"/></radialGradient></defs>` +
    `<circle cx="100" cy="100" r="100" fill="url(#${gid})"/>` +
    `<g fill="none" stroke-linecap="round">${arms}</g>${flecks}` +
    `<circle cx="100" cy="100" r="16" fill="#fff" opacity=".9"/></svg>`
  );
}

// ---------------------------------------------------------------------------
// Yıldız Sunağı (summon) — rune circle with obelisks and a floating summoning crystal
// ---------------------------------------------------------------------------

function obeliskSmall(a: Art, x: number, by: number, h: number): string {
  const w = 22;
  return (
    ao(a, x + 3, by, 16, 4, 0.4) +
    `<path d="${poly([[x - w / 2, by], [x - w * 0.36, by - h], [x, by - h - 12], [x, by]])}" fill="#d9d2e6"/>` +
    `<path d="${poly([[x, by], [x, by - h - 12], [x + w * 0.36, by - h], [x + w / 2, by]])}" fill="#8f86a8"/>` +
    `<path d="${poly([[x - w / 2, by], [x - w * 0.36, by - h], [x, by - h - 12], [x + w * 0.36, by - h], [x + w / 2, by]])}" fill="none" stroke="#2a2340" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M${n(x - 3)} ${n(by - h * 0.75)}L${n(x + 3)} ${n(by - h * 0.62)}L${n(x - 3)} ${n(by - h * 0.5)}M${n(x)} ${n(by - h * 0.4)}V${n(by - h * 0.2)}" fill="none" stroke="#c58aff" stroke-width="2.4" stroke-linecap="round"/>`
  );
}

function summonArt(a: Art): string {
  let out = '';
  out += glow(a, 120, 128, 150, 70, '#c58aff', 0.55);
  out += slab(a, 120, 132, 108, 36, 16, { light: '#efe9f6', mid: '#c4bad6', dark: '#7d7296', line: '#2a2340' });
  // inlaid rings (static part of the circle)
  out += `<ellipse cx="120" cy="132" rx="90" ry="29" fill="${a.rad([[0, '#f6e6ff'], [0.5, '#c58aff', 0.6], [1, '#6a2bd6', 0.2]])}"/>`;
  out += `<ellipse cx="120" cy="132" rx="90" ry="29" fill="none" stroke="#4a1f8a" stroke-width="3"/>`;
  out += `<ellipse cx="120" cy="132" rx="60" ry="19" fill="none" stroke="#f6e6ff" stroke-width="2.4"/>`;
  // back obelisks
  out += obeliskSmall(a, 44, 122, 52);
  out += obeliskSmall(a, 196, 122, 52);
  out += obeliskSmall(a, 120, 104, 40);
  return out;
}

function summonFront(a: Art): string {
  return obeliskSmall(a, 62, 160, 60) + obeliskSmall(a, 178, 160, 60);
}

function runeRingSvg(color: string, accent: string): string {
  let ticks = '';
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    ticks += `M${n(100 + Math.cos(ang) * 92)} ${n(100 + Math.sin(ang) * 92)}L${n(100 + Math.cos(ang) * (i % 2 ? 84 : 78))} ${n(100 + Math.sin(ang) * (i % 2 ? 84 : 78))}`;
  }
  return (
    `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke-linecap="round">` +
    `<circle cx="100" cy="100" r="95" stroke="${color}" stroke-width="4"/>` +
    `<path d="${ticks}" stroke="${color}" stroke-width="3"/>` +
    `<path d="${starPath(100, 100, 5, 74, 30)}" stroke="${accent}" stroke-width="3.5"/>` +
    `<circle cx="100" cy="100" r="30" stroke="${color}" stroke-width="3"/></g></svg>`
  );
}

// ---------------------------------------------------------------------------
// Kadim Kule — ancient wizard tower on a rocky outcrop
// ---------------------------------------------------------------------------

function towerArt(a: Art): string {
  const cx = 86;
  const s: Stone = { light: '#e9e4f0', mid: '#b4aec4', dark: '#6f6886', line: '#241f36' };
  let out = '';
  // rocky outcrop
  out += rock(a, cx - 40, 340, 110, 56, ROCK, { shadow: false });
  out += rock(a, cx + 44, 342, 100, 48, ROCK, { shadow: false });
  out += rock(a, cx, 344, 150, 40, ROCK);
  // side turret (left)
  out += block(a, 14, 180, 30, 120, s, 3);
  out += `<path d="M8 184L29 128L50 184Z" fill="${a.lin([[0, '#9a7aff'], [1, '#4a2aa8']], 0, 0, 1, 0)}" stroke="${s.line}" stroke-width="2.4" stroke-linejoin="round"/>`;
  out += `<rect x="24" y="212" width="10" height="16" rx="5" fill="#ffd36a" stroke="${s.line}" stroke-width="2"/>`;
  // main body (slightly tapered cylinder)
  const body = `M${n(cx - 46)} 312L${n(cx - 38)} 116H${n(cx + 38)}L${n(cx + 46)} 312Z`;
  out += `<path d="${body}" fill="${a.lin([[0, s.mid], [0.28, s.light], [0.62, s.mid], [1, s.dark]], 0, 0, 1, 0)}" stroke="${s.line}" stroke-width="2.6" stroke-linejoin="round"/>`;
  let courses = '';
  for (let y = 136; y < 310; y += 18) {
    const half = 38 + ((y - 116) / 196) * 8;
    courses += `M${n(cx - half)} ${y}Q${n(cx)} ${y + 6} ${n(cx + half)} ${y}`;
    const off = ((y - 136) / 18) % 2 ? 0 : 10;
    for (let k = -2; k <= 2; k++) courses += `M${n(cx + k * 18 + off)} ${y + 3}v12`;
  }
  out += `<g clip-path="${a.clip(body)}"><path d="${courses}" fill="none" stroke="${s.dark}" stroke-width="1.6" opacity=".55"/></g>`;
  // glowing windows
  for (const [wx, wy] of [[cx - 4, 150], [cx + 14, 236], [cx - 18, 262]] as const) {
    out += `<path d="M${wx - 7} ${wy + 18}V${wy + 6}A7 7 0 0 1 ${wx + 7} ${wy + 6}V${wy + 18}Z" fill="${a.lin([[0, '#fff3b0'], [1, '#ff9a2a']])}" stroke="${s.line}" stroke-width="2.2"/>`;
  }
  // door
  out += `<path d="M${cx - 14} 312V292A14 14 0 0 1 ${cx + 14} 292V312Z" fill="${a.lin([[0, '#9a6438'], [1, '#5a361a']])}" stroke="${s.line}" stroke-width="2.4"/>`;
  out += `<path d="M${cx} 280V312M${cx - 9} 300H${cx - 4}" stroke="#2a1608" stroke-width="2"/>`;
  // balcony ring
  out += `<path d="M${n(cx - 50)} 204Q${n(cx)} 220 ${n(cx + 50)} 204V214Q${n(cx)} 230 ${n(cx - 50)} 214Z" fill="${a.lin([[0, s.light], [1, s.dark]], 0, 0, 1, 0)}" stroke="${s.line}" stroke-width="2.4" stroke-linejoin="round"/>`;
  out += `<path d="M${n(cx - 50)} 204Q${n(cx)} 220 ${n(cx + 50)} 204" fill="none" stroke="#fff" stroke-width="1.6" opacity=".6"/>`;
  // crenellated parapet
  out += `<path d="M${n(cx - 48)} 122V104H${n(cx - 36)}V110H${n(cx - 24)}V104H${n(cx - 12)}V110H${n(cx)}V104H${n(cx + 12)}V110H${n(cx + 24)}V104H${n(cx + 36)}V110H${n(cx + 48)}V122Q${n(cx)} 132 ${n(cx - 48)} 122Z" fill="${a.lin([[0, s.mid], [0.3, s.light], [1, s.dark]], 0, 0, 1, 0)}" stroke="${s.line}" stroke-width="2.4" stroke-linejoin="round"/>`;
  // conical roof with scale tiles
  const roof = `M${n(cx - 42)} 108Q${n(cx - 20)} 80 ${n(cx - 4)} 24Q${n(cx)} 16 ${n(cx + 4)} 24Q${n(cx + 20)} 80 ${n(cx + 42)} 108Q${n(cx)} 118 ${n(cx - 42)} 108Z`;
  out += `<path d="${roof}" fill="${a.lin([[0, '#5a3ab0'], [0.35, '#8f6aff'], [0.7, '#5a3ab0'], [1, '#2e1a70']], 0, 0, 1, 0)}" stroke="${s.line}" stroke-width="2.6" stroke-linejoin="round"/>`;
  let tilesD = '';
  for (let y = 44; y < 108; y += 12) {
    const half = ((y - 20) / 88) * 40;
    for (let k = -4; k <= 4; k++) {
      const tx = cx + k * 10 + ((y / 12) % 2) * 5;
      if (Math.abs(tx - cx) > half - 3) continue;
      tilesD += `M${n(tx - 5)} ${y}Q${n(tx)} ${y + 7} ${n(tx + 5)} ${y}`;
    }
  }
  out += `<path d="${tilesD}" fill="none" stroke="#2e1a70" stroke-width="1.6" opacity=".7"/>`;
  out += `<path d="M${n(cx - 12)} 60Q${n(cx - 8)} 40 ${n(cx - 3)} 28" stroke="#d6c8ff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`;
  out += `<path d="M${n(cx - 4)} 24L${n(cx)} 8L${n(cx + 4)} 24Z" fill="#ffd34a" stroke="#5a3a08" stroke-width="1.8"/>`;
  return out;
}

// ---------------------------------------------------------------------------
// Kahramanlar Salonu — columned hall with faction banners
// ---------------------------------------------------------------------------

function heroesArt(a: Art): string {
  let out = '';
  const s = STONE;
  out += ao(a, 135, 196, 130, 12, 0.4);
  // steps
  out += `<path d="M22 204H248V192H22Z" fill="${s.mid}" stroke="${s.line}" stroke-width="2.4"/><path d="M34 192H236V182H34Z" fill="${s.light}" stroke="${s.line}" stroke-width="2.4"/>`;
  // wall body
  out += `<rect x="30" y="98" width="210" height="86" fill="${a.lin([[0, '#efe3c8'], [1, '#c9b48e']])}" stroke="${s.line}" stroke-width="2.4"/>`;
  // roof
  const roof = 'M6 104L54 36H216L264 104Z';
  out += `<path d="${roof}" fill="${a.lin([[0, '#5a8cf0'], [0.6, '#2e5ac0'], [1, '#1c3a8a']])}" stroke="#0e1a40" stroke-width="2.6" stroke-linejoin="round"/>`;
  let rows = '';
  for (let y = 48; y < 104; y += 11) {
    const t = (y - 36) / 68;
    rows += `M${n(54 - 48 * t)} ${y}H${n(216 + 48 * t)}`;
  }
  out += `<path d="${rows}" stroke="#16306e" stroke-width="2" opacity=".6"/>`;
  out += `<path d="M54 36H216" stroke="#ffd34a" stroke-width="5" stroke-linecap="round"/><path d="M54 36H216" stroke="#5a3a08" stroke-width="1.4" opacity=".5"/>`;
  out += `<path d="M12 98L56 40H120" fill="none" stroke="#a8c8ff" stroke-width="2.4" opacity=".6"/>`;
  // pediment with crest
  out += `<path d="M84 104L135 62L186 104Z" fill="${a.lin([[0, '#f6efe2'], [1, '#cdbd9f']])}" stroke="${s.line}" stroke-width="2.4" stroke-linejoin="round"/>`;
  out += `<path d="M124 76H146V86C146 94 141 98 135 101C129 98 124 94 124 86Z" fill="${a.lin([[0, '#ff6a5a'], [1, '#b3152a']])}" stroke="#3a0a10" stroke-width="2"/>`;
  out += `<path d="M135 77V100M125 86H145" stroke="#ffd34a" stroke-width="1.8"/>`;
  // columns
  for (const x of [56, 98, 172, 214]) {
    out += `<rect x="${x - 7}" y="104" width="14" height="78" fill="${a.lin([[0, '#c9bba0'], [0.35, '#fffaf0'], [1, '#a8987c']], 0, 0, 1, 0)}" stroke="${s.line}" stroke-width="2.2"/>`;
    out += `<rect x="${x - 10}" y="102" width="20" height="7" fill="${s.light}" stroke="${s.line}" stroke-width="2"/><rect x="${x - 10}" y="177" width="20" height="6" fill="${s.light}" stroke="${s.line}" stroke-width="2"/>`;
  }
  // door with warm light
  out += glow(a, 135, 160, 50, 34, '#ffcf6a', 0.6);
  out += `<path d="M116 182V140A19 19 0 0 1 154 140V182Z" fill="${a.lin([[0, '#a86a38'], [1, '#5a341a']])}" stroke="${s.line}" stroke-width="2.4"/>`;
  out += `<path d="M135 122V182" stroke="#3a1e0a" stroke-width="2"/><circle cx="129" cy="160" r="2" fill="#ffd34a"/><circle cx="141" cy="160" r="2" fill="#ffd34a"/>`;
  out += `<path d="M116 140A19 19 0 0 1 154 140" fill="none" stroke="#ffd34a" stroke-width="2.4"/>`;
  // faction banners between the columns
  const banners: [number, string, string][] = [
    [77, '#c8213f', '#ffd34a'],
    [193, '#2e7a3a', '#ffd34a'],
  ];
  for (const [bx, cloth, trim] of banners) {
    out += `<path d="M${bx - 12} 112H${bx + 12}V158L${bx} 150L${bx - 12} 158Z" fill="${cloth}" stroke="#1a0a10" stroke-width="2" stroke-linejoin="round"/>`;
    out += `<path d="M${bx} 122L${bx + 6} 131L${bx} 140L${bx - 6} 131Z" fill="${trim}"/>`;
    out += `<rect x="${bx - 14}" y="109" width="28" height="5" rx="2" fill="#ffd34a" stroke="#5a3a08" stroke-width="1.2"/>`;
  }
  // torches beside the door
  out += `<rect x="104" y="146" width="5" height="16" fill="#3a2412"/><rect x="161" y="146" width="5" height="16" fill="#3a2412"/>`;
  out += pole(54, 6, 38) + pole(216, 6, 38);
  return out;
}

// ---------------------------------------------------------------------------
// Arena — small colosseum with pennants
// ---------------------------------------------------------------------------

function arenaArt(a: Art): string {
  const s: Stone = { light: '#f8e2bc', mid: '#dcb27a', dark: '#9a6a3e', line: '#3d2416' };
  const cx = 130;
  let out = ao(a, cx, 162, 128, 14, 0.4);
  // inner bowl visible through the top
  out += `<ellipse cx="${cx}" cy="70" rx="118" ry="40" fill="${s.dark}" stroke="${s.line}" stroke-width="2.6"/>`;
  out += `<ellipse cx="${cx}" cy="76" rx="100" ry="31" fill="#b88a58"/>`;
  out += `<ellipse cx="${cx}" cy="80" rx="84" ry="24" fill="#a07448"/>`;
  out += `<ellipse cx="${cx}" cy="84" rx="66" ry="17" fill="${a.lin([[0, '#f4d9a0'], [1, '#d9b070']])}" stroke="${s.line}" stroke-width="1.6"/>`;
  out += `<path d="M${cx - 30} 84H${cx + 30}" stroke="#c99a5a" stroke-width="2" opacity=".6"/>`;
  // outer wall (front half cylinder)
  const wall = `M${cx - 120} 72V140A120 30 0 0 0 ${cx + 120} 140V72A120 40 0 0 1 ${cx - 120} 72Z`;
  out += `<path d="${wall}" fill="${a.lin([[0, s.mid], [0.3, s.light], [0.7, s.mid], [1, s.dark]], 0, 0, 1, 0)}" stroke="${s.line}" stroke-width="2.6" stroke-linejoin="round"/>`;
  out += `<path d="M${cx - 120} 72A120 40 0 0 0 ${cx + 120} 72" fill="none" stroke="#fff" stroke-width="2" opacity=".55"/>`;
  out += `<path d="M${cx - 120} 104A120 34 0 0 0 ${cx + 120} 104" fill="none" stroke="${s.line}" stroke-width="2.4"/>`;
  // two tiers of arches following the curve (narrower toward the sides)
  const tiers: [(sn: number) => number, (sn: number) => number, number][] = [
    [(sn) => 70 + 40 * sn + 7, (sn) => 104 + 34 * sn - 4, 11],
    [(sn) => 104 + 34 * sn + 6, (sn) => 140 + 30 * sn - 5, 9],
  ];
  tiers.forEach(([topAt, botAt, count], tier) => {
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const ang = Math.PI * (1 - t);
      const sn = Math.sin(ang);
      if (tier === 1 && i === Math.floor(count / 2)) continue;
      const ax = cx + Math.cos(ang) * 114;
      const wdt = 13 * Math.max(0.3, sn);
      const top = topAt(sn);
      const bot = botAt(sn);
      out += `<path d="M${n(ax - wdt / 2)} ${n(bot)}V${n(top + wdt / 2)}A${n(wdt / 2)} ${n(wdt / 2)} 0 0 1 ${n(ax + wdt / 2)} ${n(top + wdt / 2)}V${n(bot)}Z" fill="#5a3420" stroke="${s.line}" stroke-width="1.4"/>`;
      out += `<path d="M${n(ax - wdt / 2 + 1.5)} ${n(bot - 1)}V${n(top + wdt / 2 + 2)}" stroke="#c98a52" stroke-width="1.6" opacity=".6"/>`;
    }
  });
  // main gate
  out += `<path d="M${cx - 18} 172V146A18 18 0 0 1 ${cx + 18} 146V172Z" fill="#2a160c" stroke="${s.line}" stroke-width="2.4"/>`;
  out += `<path d="M${cx - 12} 146V170M${cx - 4} 140V170M${cx + 4} 140V170M${cx + 12} 146V170M${cx - 16} 152H${cx + 16}M${cx - 16} 162H${cx + 16}" stroke="#8a8a96" stroke-width="2"/>`;
  out += `<path d="M${cx - 24} 146A24 24 0 0 1 ${cx + 24} 146" fill="none" stroke="#ffd34a" stroke-width="3"/>`;
  // flag poles (flags are animated overlays)
  for (const px of [22, 74, 186, 238]) out += pole(px, 18, 80);
  return out;
}

// ---------------------------------------------------------------------------
// Lonca — timber-framed guild house with a big shield sign
// ---------------------------------------------------------------------------

function guildArt(a: Art): string {
  let out = ao(a, 100, 164, 92, 10, 0.4);
  // stone ground floor
  out += `<rect x="20" y="104" width="160" height="58" fill="${a.lin([[0, '#d9cdb4'], [1, '#a8987c']])}" stroke="#3b2f22" stroke-width="2.4"/>`;
  let st = '';
  for (let y = 116; y < 160; y += 12) st += `M20 ${y}H180`;
  for (let y = 104, r = 0; y < 160; y += 12, r++) for (let x = 20 + (r % 2) * 14; x < 180; x += 28) st += `M${x} ${y}v12`;
  out += `<path d="${st}" stroke="#8d7b62" stroke-width="1.4" opacity=".7"/>`;
  // timber upper floor (overhangs)
  out += `<rect x="12" y="58" width="176" height="48" fill="#f6ecd6" stroke="#3b2210" stroke-width="2.4"/>`;
  out += `<path d="M12 58H188M12 106H188M56 58V106M100 58V106M144 58V106M12 58L56 106M56 58L12 106M144 58L188 106M188 58L144 106" stroke="#5a341a" stroke-width="5"/>`;
  // windows
  for (const wx of [70, 116]) out += `<rect x="${wx}" y="68" width="18" height="24" rx="3" fill="${a.lin([[0, '#fff3b0'], [1, '#ffaa3a']])}" stroke="#3b2210" stroke-width="2.2"/><path d="M${wx + 9} 68V92M${wx} 80H${wx + 18}" stroke="#3b2210" stroke-width="1.6"/>`;
  // steep roof
  out += `<path d="M2 64L100 6L198 64Z" fill="${a.lin([[0, '#5fbf6a'], [0.6, '#2f8a44'], [1, '#1c5a2c']])}" stroke="#0e2a14" stroke-width="2.6" stroke-linejoin="round"/>`;
  let rows = '';
  for (let y = 20; y < 64; y += 10) {
    const half = ((y - 6) / 58) * 98;
    rows += `M${n(100 - half)} ${y}H${n(100 + half)}`;
  }
  out += `<path d="${rows}" stroke="#1c5a2c" stroke-width="2" opacity=".6"/>`;
  out += `<path d="M8 60L100 8" stroke="#bff0b0" stroke-width="2.4" opacity=".6"/>`;
  // chimney
  out += `<rect x="146" y="12" width="16" height="30" fill="#b8a88c" stroke="#3b2f22" stroke-width="2.2"/><rect x="143" y="8" width="22" height="7" fill="#d9cdb4" stroke="#3b2f22" stroke-width="2"/>`;
  // door + shield sign
  out += `<path d="M88 162V134A12 12 0 0 1 112 134V162Z" fill="${a.lin([[0, '#a86a38'], [1, '#5a341a']])}" stroke="#3b2210" stroke-width="2.4"/>`;
  out += `<path d="M40 120H62" stroke="#3a2412" stroke-width="3"/><path d="M44 120V126M58 120V126" stroke="#3a2412" stroke-width="1.6"/>`;
  out += `<path d="M38 126H64V140C64 150 58 155 51 158C44 155 38 150 38 140Z" fill="${a.lin([[0, '#6fa8ff'], [1, '#1c4aa8']])}" stroke="#0a1a40" stroke-width="2.2"/>`;
  out += `<path d="M51 131L56 141L51 151L46 141Z" fill="#ffd34a" stroke="#5a3a08" stroke-width="1.2"/>`;
  out += pole(176, 2, 60);
  return out;
}

// ---------------------------------------------------------------------------
// Pazar — market stalls with striped awnings
// ---------------------------------------------------------------------------

function stall(a: Art, x: number, by: number, w: number, c1: string, c2: string): string {
  const h = 78;
  const top = by - h;
  let out = ao(a, x + w / 2, by, w * 0.6, 7, 0.4);
  // posts
  out += `<path d="M${x + 6} ${by}V${top + 14}M${x + w - 6} ${by}V${top + 14}" stroke="#3a2412" stroke-width="7" stroke-linecap="round"/><path d="M${x + 6} ${by}V${top + 14}M${x + w - 6} ${by}V${top + 14}" stroke="#a87a48" stroke-width="3.4" stroke-linecap="round"/>`;
  // counter with goods
  out += `<rect x="${x + 2}" y="${by - 30}" width="${w - 4}" height="30" fill="${a.lin([[0, '#c98a52'], [1, '#7a4a24']])}" stroke="#2a1608" stroke-width="2.2"/>`;
  out += `<path d="M${x + 2} ${by - 20}H${x + w - 2}M${x + 2} ${by - 10}H${x + w - 2}" stroke="#5a341a" stroke-width="1.4" opacity=".6"/>`;
  const goods = ['#ff5a4a', '#ffd23a', '#7ad04a', '#ff9a2a', '#c58aff'];
  for (let i = 0; i < Math.floor((w - 16) / 11); i++) {
    const gx = x + 12 + i * 11;
    const col = goods[i % goods.length];
    out += `<circle cx="${gx}" cy="${by - 35}" r="5.5" fill="${col}" stroke="#2a1608" stroke-width="1.6"/><circle cx="${gx - 1.6}" cy="${by - 37}" r="1.8" fill="#fff" opacity=".7"/>`;
  }
  // striped awning with scalloped edge
  const aw = `M${x - 6} ${top + 22}L${x + 8} ${top}H${x + w - 8}L${x + w + 6} ${top + 22}Z`;
  out += `<path d="${aw}" fill="${c1}" stroke="#2a1608" stroke-width="2.4" stroke-linejoin="round"/>`;
  let stripes = '';
  const nS = 6;
  for (let i = 0; i < nS; i += 2) {
    const x0 = x + 8 + ((w - 16) * i) / nS;
    const x1 = x + 8 + ((w - 16) * (i + 1)) / nS;
    const b0 = x - 6 + ((w + 12) * i) / nS;
    const b1 = x - 6 + ((w + 12) * (i + 1)) / nS;
    stripes += `M${n(x0)} ${top}H${n(x1)}L${n(b1)} ${top + 22}H${n(b0)}Z`;
  }
  out += `<path d="${stripes}" fill="${c2}"/>`;
  let scal = `M${x - 6} ${top + 22}`;
  const k = 6;
  for (let i = 0; i < k; i++) {
    const sx = x - 6 + ((w + 12) * (i + 1)) / k;
    scal += `A${n((w + 12) / k / 2)} 7 0 0 0 ${n(sx)} ${top + 22}`;
  }
  out += `<path d="${scal}Z" fill="${c1}" stroke="#2a1608" stroke-width="2.2" stroke-linejoin="round"/>`;
  out += `<path d="${aw}" fill="none" stroke="#2a1608" stroke-width="2.4" stroke-linejoin="round"/>`;
  out += `<path d="M${x + 10} ${top + 3}H${x + w - 10}" stroke="#fff" stroke-width="2" opacity=".5"/>`;
  return out;
}

function shopArt(a: Art): string {
  let out = '';
  out += stall(a, 16, 128, 104, '#e2453a', '#fff4e0');
  out += stall(a, 92, 168, 96, '#2aa7a0', '#fff4e0');
  // barrels & sacks
  out += `<path d="M10 176Q6 160 10 146H34Q38 160 34 176Z" fill="${a.lin([[0, '#5a341a'], [0.4, '#c98a52'], [1, '#5a341a']], 0, 0, 1, 0)}" stroke="#2a1608" stroke-width="2.2"/><path d="M8 152H36M8 170H36" stroke="#3d3a45" stroke-width="3"/>`;
  out += `<path d="M44 178C36 178 34 162 42 156L46 150H58L62 156C70 162 68 178 60 178Z" fill="${a.lin([[0, '#efd9a8'], [1, '#b89a62']])}" stroke="#3b2a14" stroke-width="2.2"/><path d="M45 152H59" stroke="#8a5a2a" stroke-width="3"/>`;
  // hanging sign
  out += `<path d="M150 70H186" stroke="#3a2412" stroke-width="3"/><rect x="152" y="74" width="32" height="20" rx="3" fill="#f2d6a0" stroke="#3b2a14" stroke-width="2"/>`;
  out += `<circle cx="168" cy="84" r="6" fill="#ffd34a" stroke="#6b3a05" stroke-width="1.6"/><path d="M168 80L171 84L168 88L165 84Z" fill="#d9820c"/>`;
  return out;
}

// ---------------------------------------------------------------------------
// building table
// ---------------------------------------------------------------------------

export const TOWN_BUILDINGS: readonly TownBuildingDef[] = [
  {
    id: 'campaign',
    label: 'Sefer Kapısı',
    x: 470,
    y: 80,
    w: 340,
    h: 365,
    ribbon: { x: 170, y: 318, big: true },
    art: gateArt,
    overlays: (a) => [
      {
        cls: 'portal',
        x: GATE_CX - GATE_RI,
        y: GATE_CY - GATE_RI,
        w: GATE_RI * 2,
        h: 292 - (GATE_CY - GATE_RI),
        html: `<div class="ae-town-swirl">${portalSwirl(a.uid('pg'))}</div>`,
      },
      { cls: 'glow', x: GATE_CX - 20, y: GATE_CY - GATE_RO + 2, w: 40, h: 40, html: glowDot('#7ff6ff') },
      ...TREE_LANTERNS.map(([x, , y, color], i): TownOverlay => ({ cls: `lantern lantern--${i % 3}`, x: x - 12, y: y - 12, w: 24, h: 34, html: paperLanternSvg(color) })),
      { cls: 'flame', x: 6, y: 254, w: 28, h: 40, html: flameSvg() },
      { cls: 'flame', x: 306, y: 254, w: 28, h: 40, html: flameSvg() },
      { cls: 'sparks', x: GATE_CX - 70, y: GATE_CY - 40, w: 140, h: 140, html: '<i></i><i></i><i></i><i></i><i></i><i></i>' },
    ],
  },
  {
    id: 'summon',
    label: 'Yıldız Sunağı',
    x: 300,
    y: 418,
    w: 240,
    h: 182,
    ribbon: { x: 120, y: 152 },
    art: summonArt,
    front: summonFront,
    overlays: () => [
      { cls: 'beam', x: 90, y: -10, w: 60, h: 145, html: '' },
      { cls: 'ring', x: 30, y: 42, w: 180, h: 180, html: `<div class="ae-town-ringspin">${runeRingSvg('#f2dcff', '#7ff0ff')}</div>` },
      { cls: 'float', x: 102, y: 22, w: 36, h: 56, html: crystalSvg('#ffd9ff', '#c27bff', '#6b2cbe') },
      { cls: 'float float--b', x: 35, y: 40, w: 18, h: 28, html: crystalSvg('#e0f6ff', '#7fe0ff', '#2a62c8') },
      { cls: 'float float--c', x: 187, y: 40, w: 18, h: 28, html: crystalSvg('#e0f6ff', '#7fe0ff', '#2a62c8') },
      { cls: 'sparks', x: 60, y: 20, w: 120, h: 120, html: '<i></i><i></i><i></i><i></i><i></i><i></i>' },
    ],
  },
  {
    id: 'tower',
    label: 'Kadim Kule',
    x: 948,
    y: 66,
    w: 172,
    h: 350,
    ribbon: { x: 86, y: 318 },
    art: towerArt,
    overlays: () => [
      { cls: 'orbit', x: 46, y: -30, w: 80, h: 80, html: `<div class="ae-town-ringspin">${runeRingSvg('#bfe9ff', '#ffd36a')}</div>` },
      { cls: 'glow', x: 62, y: -24, w: 48, h: 48, html: glowDot('#7fe0ff') },
      { cls: 'float', x: 74, y: -14, w: 24, h: 36, html: crystalSvg('#e8f8ff', '#7fe0ff', '#3a62d0') },
      flagOverlay(29, 106, 30, 20, '#7a3ab8', '#ffd36a', 'moon'),
    ],
  },
  {
    id: 'heroes',
    label: 'Kahramanlar Salonu',
    x: 104,
    y: 236,
    w: 270,
    h: 215,
    ribbon: { x: 135, y: 186 },
    art: heroesArt,
    overlays: () => [
      { cls: 'flame flame--s', x: 98, y: 130, w: 17, h: 24, html: flameSvg() },
      { cls: 'flame flame--s', x: 155, y: 130, w: 17, h: 24, html: flameSvg() },
      flagOverlay(54, 4, 30, 20, '#c8213f', '#ffd34a', 'star'),
      flagOverlay(216, 4, 30, 20, '#2e5ac0', '#ffd34a', 'diamond'),
    ],
  },
  {
    id: 'arena',
    label: 'Arena',
    x: 776,
    y: 430,
    w: 260,
    h: 176,
    ribbon: { x: 130, y: 140 },
    art: arenaArt,
    overlays: () => [
      flagOverlay(22, 14, 30, 20, '#e2453a', '#ffd34a', 'star'),
      flagOverlay(74, 14, 30, 20, '#ffb02a', '#fff4e0', 'diamond'),
      flagOverlay(186, 14, 30, 20, '#ffb02a', '#fff4e0', 'diamond'),
      flagOverlay(238, 14, 30, 20, '#e2453a', '#ffd34a', 'star'),
    ],
  },
  {
    id: 'guild',
    label: 'Lonca',
    x: 238,
    y: 78,
    w: 200,
    h: 162,
    ribbon: { x: 100, y: 132 },
    art: guildArt,
    overlays: () => [flagOverlay(176, -2, 34, 22, '#2e8a44', '#ffd34a', 'moon'), { cls: 'smoke', x: 140, y: -26, w: 30, h: 40, html: '<i></i><i></i><i></i>' }],
  },
  {
    id: 'shop',
    label: 'Pazar',
    x: 1074,
    y: 404,
    w: 200,
    h: 196,
    ribbon: { x: 100, y: 164 },
    art: shopArt,
    overlays: () => [],
  },
];

function crystalSvg(light: string, mid: string, dark: string): string {
  return (
    `<svg viewBox="0 0 36 56" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M18 2L32 20L18 54L4 20Z" fill="${mid}" stroke="#1a0a3a" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M18 2L4 20L18 54Z" fill="${light}" opacity=".85"/><path d="M18 2L32 20L18 54Z" fill="${dark}" opacity=".55"/>` +
    `<path d="M4 20H32" stroke="#1a0a3a" stroke-width="1.6" opacity=".6"/><path d="M11 18L17 8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/></svg>`
  );
}

// ---------------------------------------------------------------------------
// backdrop
// ---------------------------------------------------------------------------

export interface TownBackdrop {
  defs: string;
  sky: string;
  land: string;
  front: string;
  clouds: string[];
}

/** Full-bleed art box of the town layers (stage px): the 1280x720 safe area plus the bleed. */
export const TOWN_BOX = { x: -240, y: -150, w: 1760, h: 1020 } as const;
const BX0 = TOWN_BOX.x;
const BX1 = TOWN_BOX.x + TOWN_BOX.w;
const BY0 = TOWN_BOX.y;
const BY1 = TOWN_BOX.y + TOWN_BOX.h;

function cloudPuff(a: Art, x: number, y: number, s: number): string {
  const base = scallopPath(a.rand, x, y, 90 * s, 34 * s, 9, 0.7, 0.12);
  const top = scallopPath(a.rand, x - 10 * s, y - 8 * s, 70 * s, 24 * s, 8, 0.7, 0.14);
  return `<path d="${base}" fill="#a894d4"/><path d="${top}" fill="#efd6ee"/><path d="M${n(x - 80 * s)} ${n(y + 18 * s)}H${n(x + 84 * s)}" stroke="#ffb8a0" stroke-width="${n(8 * s)}" stroke-linecap="round" opacity=".85"/>`;
}

/** Standalone cloud SVG for the animated sky layer. */
export function cloudSvg(seed: number): string {
  const a = new Art(new Ids(`aecl${seed}`), seed);
  return `<svg viewBox="0 0 220 100" xmlns="http://www.w3.org/2000/svg">${cloudPuff(a, 110, 56, 1)}</svg>`;
}

/** Long painted cloud bank: violet body, peach-lit underside, pale crest. */
function cloudBank(a: Art, x0: number, x1: number, y: number, h: number): string {
  let body = '';
  let crest = '';
  for (let x = x0; x < x1; x += h * 1.1) {
    const r = h * a.r(0.7, 1.1);
    body += `<circle cx="${n(x)}" cy="${n(y - r * 0.3)}" r="${n(r)}"/>`;
    if (a.rand() < 0.7) crest += `<circle cx="${n(x - r * 0.25)}" cy="${n(y - r * 0.62)}" r="${n(r * 0.55)}"/>`;
  }
  return (
    `<g fill="#8a78c0">${body}<rect x="${x0}" y="${n(y - h * 0.3)}" width="${x1 - x0}" height="${n(h * 0.6)}"/></g>` +
    `<g fill="#c6aee0" opacity=".9">${crest}</g>` +
    `<path d="M${x0} ${n(y + h * 0.28)}H${x1}" stroke="#ffb49a" stroke-width="${n(h * 0.22)}" stroke-linecap="round" opacity=".9"/>`
  );
}

function pond(a: Art, x: number, y: number): string {
  const water = blobPath(a.rand, x, y, 92, 30, 10, 0.08);
  let out = `<path d="${water}" fill="#2f6a34" transform="translate(0 4)"/>`;
  out += `<path d="${water}" fill="${a.lin([[0, '#ffd2c8'], [0.35, '#b49ae0'], [0.7, '#5a6ac8'], [1, '#2a3a8a']])}" stroke="#1d2f6a" stroke-width="2.6"/>`;
  out += `<path d="M${x - 50} ${y - 6}Q${x - 20} ${y - 12} ${x + 10} ${y - 6}M${x + 20} ${y + 6}Q${x + 40} ${y + 2} ${x + 62} ${y + 8}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>`;
  for (const [lx, ly, r] of [[x - 40, y + 8, 9], [x + 30, y - 10, 7], [x + 56, y + 12, 6]] as const) {
    out += `<path d="M${lx} ${ly}L${lx + r} ${ly - r * 0.2}A${r} ${r * 0.5} 0 1 1 ${lx + r * 0.6} ${ly + r * 0.42}Z" fill="#5cb84a" stroke="#1d4012" stroke-width="1.6"/>`;
  }
  out += `<circle cx="${x - 36}" cy="${y + 4}" r="3" fill="#ff8ac0" stroke="#7a1a4a" stroke-width="1"/>`;
  out += rock(a, x + 86, y + 10, 34, 18, ROCK) + rock(a, x - 92, y + 6, 28, 14, ROCK);
  for (const rx of [x - 76, x - 66, x + 70]) {
    out += `<path d="M${rx} ${y + 2}Q${rx - 3} ${y - 22} ${rx - 6} ${y - 34}M${rx + 4} ${y + 2}Q${rx + 5} ${y - 18} ${rx + 9} ${y - 28}" stroke="#2f7a2a" stroke-width="3" stroke-linecap="round" fill="none"/>`;
    out += `<rect x="${rx - 9}" y="${y - 44}" width="6" height="14" rx="3" fill="#8a5a2a" transform="rotate(-8 ${rx - 6} ${y - 37})"/>`;
  }
  return out;
}

function bunting(a: Art, p: [number, number], q: [number, number]): string {
  const sag = 26;
  const mx = (p[0] + q[0]) / 2;
  const my = (p[1] + q[1]) / 2 + sag;
  let out = `<path d="M${p[0]} ${p[1]}Q${mx} ${my + sag * 0.6} ${q[0]} ${q[1]}" fill="none" stroke="#5a3a1a" stroke-width="1.6"/>`;
  const cols = ['#ff5a4a', '#ffd23a', '#4fb3ff', '#7ad04a', '#c58aff'];
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const bx = (1 - t) * (1 - t) * p[0] + 2 * (1 - t) * t * mx + t * t * q[0];
    const by = (1 - t) * (1 - t) * p[1] + 2 * (1 - t) * t * (my + sag * 0.6) + t * t * q[1];
    out += `<path d="M${n(bx - 5)} ${n(by)}H${n(bx + 5)}L${n(bx)} ${n(by + 11)}Z" fill="${cols[i % cols.length]}" stroke="#3a2010" stroke-width="1.2" stroke-linejoin="round"/>`;
  }
  void a;
  return out;
}

/** Plaza fountain: octagonal basin, a fluted column carrying a bowl, a golden sun-disc finial. */
function fountain(a: Art, x: number, by: number): string {
  const stone = { light: '#f4ead6', mid: '#cbbb9a', dark: '#8a7a5e', line: '#3b2f22' };
  let out = ao(a, x + 10, by + 4, 120, 18, 0.45);
  // basin: front wall + rim
  const rx = 96;
  const ry = 30;
  out += `<path d="M${x - rx} ${by - 26}V${by}A${rx} ${ry} 0 0 0 ${x + rx} ${by}V${by - 26}Z" fill="${a.lin([[0, stone.mid], [0.3, stone.light], [0.75, stone.mid], [1, stone.dark]], 0, 0, 1, 0)}" stroke="${stone.line}" stroke-width="2.4"/>`;
  for (const t of [-0.66, -0.22, 0.22, 0.66]) out += `<path d="M${n(x + t * rx)} ${n(by - 22 + Math.sqrt(1 - t * t) * ry * 0.95)}v18" stroke="${stone.dark}" stroke-width="2" opacity=".55"/>`;
  out += `<ellipse cx="${x}" cy="${by - 26}" rx="${rx}" ry="${ry}" fill="${stone.light}" stroke="${stone.line}" stroke-width="2.4"/>`;
  out += `<ellipse cx="${x}" cy="${by - 24}" rx="${rx - 12}" ry="${ry - 7}" fill="${a.lin([[0, '#bfefff'], [0.5, '#5ec4f0'], [1, '#2a86c8']])}" stroke="#2a5a8a" stroke-width="2"/>`;
  out += `<path d="M${x - 60} ${by - 26}Q${x - 30} ${by - 32} ${x - 4} ${by - 26}M${x + 20} ${by - 18}Q${x + 44} ${by - 22} ${x + 64} ${by - 16}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>`;
  // column + upper bowl
  out += `<rect x="${x - 10}" y="${by - 92}" width="20" height="66" fill="${a.lin([[0, stone.dark], [0.35, stone.light], [1, stone.dark]], 0, 0, 1, 0)}" stroke="${stone.line}" stroke-width="2.2"/>`;
  out += `<path d="M${x - 44} ${by - 96}Q${x} ${by - 70} ${x + 44} ${by - 96}Z" fill="${a.lin([[0, stone.light], [1, stone.mid]])}" stroke="${stone.line}" stroke-width="2.2" stroke-linejoin="round"/>`;
  out += `<ellipse cx="${x}" cy="${by - 96}" rx="44" ry="10" fill="#7fd6f4" stroke="${stone.line}" stroke-width="2.2"/>`;
  // water sheets falling from the bowl
  out += `<path d="M${x - 42} ${by - 94}Q${x - 52} ${by - 60} ${x - 58} ${by - 30}M${x + 42} ${by - 94}Q${x + 52} ${by - 60} ${x + 58} ${by - 30}M${x - 20} ${by - 88}Q${x - 24} ${by - 60} ${x - 26} ${by - 34}M${x + 20} ${by - 88}Q${x + 24} ${by - 60} ${x + 26} ${by - 34}" fill="none" stroke="#dff8ff" stroke-width="3.4" stroke-linecap="round" opacity=".85"/>`;
  // finial: sun disc
  out += `<rect x="${x - 4}" y="${by - 122}" width="8" height="26" fill="#c9921a" stroke="#4a2c04" stroke-width="1.6"/>`;
  out += glow(a, x, by - 132, 40, 40, '#ffd36a', 0.7);
  out += `<path d="${starPath(x, by - 132, 8, 19, 11)}" fill="${a.lin([[0, '#fff3b0'], [1, '#e09a1a']])}" stroke="#4a2c04" stroke-width="1.8" stroke-linejoin="round"/>`;
  out += `<circle cx="${x}" cy="${by - 132}" r="7" fill="#ffefa8" stroke="#4a2c04" stroke-width="1.4"/>`;
  return out;
}

/** Wooden market cart with produce baskets and a small awning. */
function marketCart(a: Art, x: number, by: number, s: number, awning: string): string {
  let out = ao(a, x, by, 46 * s, 7 * s, 0.4);
  out += `<path d="M${n(x - 40 * s)} ${n(by - 18 * s)}H${n(x + 40 * s)}V${n(by - 42 * s)}H${n(x - 40 * s)}Z" fill="${a.lin([[0, '#c98a52'], [1, '#7a4a24']])}" stroke="#2a1608" stroke-width="${n(2 * s)}"/>`;
  out += `<path d="M${n(x - 40 * s)} ${n(by - 30 * s)}H${n(x + 40 * s)}" stroke="#5a341a" stroke-width="${n(1.6 * s)}"/>`;
  const goods = ['#ff5a4a', '#ffd23a', '#7ad04a', '#ff9a2a'];
  for (let i = 0; i < 6; i++) out += `<circle cx="${n(x - 30 * s + i * 12 * s)}" cy="${n(by - 46 * s)}" r="${n(5.5 * s)}" fill="${goods[i % goods.length]}" stroke="#2a1608" stroke-width="${n(1.4 * s)}"/>`;
  out += `<path d="M${n(x - 36 * s)} ${n(by - 42 * s)}V${n(by - 74 * s)}M${n(x + 36 * s)} ${n(by - 42 * s)}V${n(by - 74 * s)}" stroke="#3a2412" stroke-width="${n(3.4 * s)}"/>`;
  out += `<path d="M${n(x - 46 * s)} ${n(by - 70 * s)}L${n(x - 34 * s)} ${n(by - 84 * s)}H${n(x + 34 * s)}L${n(x + 46 * s)} ${n(by - 70 * s)}Z" fill="${awning}" stroke="#2a1608" stroke-width="${n(2 * s)}" stroke-linejoin="round"/>`;
  out += `<path d="M${n(x - 20 * s)} ${n(by - 84 * s)}L${n(x - 24 * s)} ${n(by - 70 * s)}M${n(x)} ${n(by - 84 * s)}V${n(by - 70 * s)}M${n(x + 20 * s)} ${n(by - 84 * s)}L${n(x + 24 * s)} ${n(by - 70 * s)}" stroke="#fff4e0" stroke-width="${n(5 * s)}"/>`;
  out += `<circle cx="${n(x - 26 * s)}" cy="${n(by - 10 * s)}" r="${n(10 * s)}" fill="#5a341a" stroke="#2a1608" stroke-width="${n(2 * s)}"/><circle cx="${n(x - 26 * s)}" cy="${n(by - 10 * s)}" r="${n(3 * s)}" fill="#c98a52"/>`;
  out += `<path d="M${n(x + 40 * s)} ${n(by - 26 * s)}L${n(x + 64 * s)} ${n(by - 14 * s)}" stroke="#3a2412" stroke-width="${n(3.4 * s)}" stroke-linecap="round"/>`;
  return out;
}

/** Elongated cast shadow (the dusk sun is low on the right, so shadows fall to the lower left). */
function castShadow(a: Art, x: number, y: number, len: number, w: number, op = 0.32): string {
  return `<ellipse cx="${n(x - len * 0.42)}" cy="${n(y + w * 0.25)}" rx="${n(len * 0.62)}" ry="${n(w)}" fill="#1a1a40" opacity="${op}" transform="rotate(-8 ${n(x)} ${n(y)})" filter="${a.blur(7)}"/>`;
}

/** The town's front rampart in 3/4 view: walkway top, coursed front face, mossy lip and torch posts. */
function rampart(a: Art): string {
  const topY = (x: number): number => {
    const t = (x - 640) / 680;
    return 612 + t * t * 34;
  };
  const pts: [number, number][] = [];
  for (let x = BX0 - 40; x <= BX1 + 40; x += 40) pts.push([x, topY(x)]);
  const front: [number, number][] = pts.map(([x, y]) => [x, y + 16]);
  const walk = `${smoothOpen(pts)}L${BX1 + 40} ${n(topY(BX1 + 40) + 16)}${smoothOpen([...front].reverse()).replace(/^M/, 'L')}Z`;
  let out = `<path d="${smoothOpen(front)}L${BX1 + 40} ${BY1 + 10}L${BX0 - 40} ${BY1 + 10}Z" fill="${a.linU([[0, '#b8a888'], [0.25, '#8a7a62'], [1, '#4a3e34']], 0, 620, 0, 760)}" stroke="#2a2018" stroke-width="2.6"/>`;
  // coursed blocks on the front face
  let courses = '';
  for (let r = 0; r < 6; r++) {
    for (let x = BX0 - 40 + (r % 2) * 34; x < BX1 + 40; x += 68) {
      const y = topY(x) + 16 + r * 24;
      courses += `M${x} ${n(y + 24)}H${x + 66}M${x} ${n(y)}V${n(y + 24)}`;
    }
  }
  out += `<path d="${courses}" stroke="#5a4a3a" stroke-width="2" opacity=".55"/>`;
  out += `<path d="${walk}" fill="${a.lin([[0, '#f2e6c8'], [1, '#cdbb96']])}" stroke="#2a2018" stroke-width="2.4" stroke-linejoin="round"/>`;
  out += `<path d="${smoothOpen(pts)}" fill="none" stroke="#fff6dc" stroke-width="2" opacity=".7"/>`;
  // moss and ivy hanging over the lip
  for (let x = BX0 + a.r(0, 60); x < BX1; x += a.r(90, 190)) {
    const y = topY(x) + 15;
    const w = a.r(14, 30);
    let drip = `M${n(x - w)} ${n(y)}`;
    for (let k = 0; k <= 4; k++) {
      const px = x - w + (k * w) / 2;
      drip += `Q${n(px + w / 4)} ${n(y + a.r(6, 18))} ${n(px + w / 2)} ${n(y + 2)}`;
    }
    out += `<path d="${drip}Z" fill="${a.pick(['#3f8a34', '#4a9a3a', '#356e2c'])}" stroke="#123010" stroke-width="1.4" stroke-linejoin="round"/>`;
  }
  // torch posts (3D boxes)
  for (const px of [BX0 + 90, 120, 470, 810, 1160, BX1 - 90]) {
    const y = topY(px) + 6;
    out += `<path d="M${px - 16} ${n(y)}V${n(y - 40)}H${px + 16}V${n(y)}Z" fill="${a.lin([[0, '#a8987a'], [1, '#6a5a48']])}" stroke="#2a2018" stroke-width="2.2"/>`;
    out += `<path d="M${px - 16} ${n(y - 40)}L${px - 10} ${n(y - 48)}H${px + 22}L${px + 16} ${n(y - 40)}Z" fill="#f2e6c8" stroke="#2a2018" stroke-width="2"/>`;
    out += `<path d="M${px + 16} ${n(y)}V${n(y - 40)}L${px + 22} ${n(y - 48)}V${n(y - 8)}Z" fill="#5a4a3a" stroke="#2a2018" stroke-width="2"/>`;
    out += glow(a, px + 3, y - 62, 46, 46, '#ffb04a', 0.75);
    out += `<path d="M${px + 3} ${n(y - 76)}C${px + 12} ${n(y - 64)} ${px + 10} ${n(y - 54)} ${px + 3} ${n(y - 50)}C${px - 4} ${n(y - 54)} ${px - 6} ${n(y - 64)} ${px + 3} ${n(y - 76)}Z" fill="#ffb43a" stroke="#7a2a04" stroke-width="1.4"/><path d="M${px + 3} ${n(y - 68)}C${px + 7} ${n(y - 60)} ${px + 6} ${n(y - 55)} ${px + 3} ${n(y - 53)}C${px} ${n(y - 55)} ${px - 1} ${n(y - 60)} ${px + 3} ${n(y - 68)}Z" fill="#fff4c0"/>`;
  }
  return out;
}

export function townBackdrop(a: Art): TownBackdrop {
  // ---- dusk sky: deep blue to lavender to a warm horizon, painted cloud banks, first stars
  let sky = `<rect x="${BX0}" y="${BY0}" width="${TOWN_BOX.w}" height="${TOWN_BOX.h}" fill="${a.linU([[0, '#18205a'], [0.16, '#2e3584'], [0.32, '#6a5cb4'], [0.44, '#c888b8'], [0.53, '#ffb894'], [0.62, '#ffdcb0'], [1, '#ffe8c4']], 0, -40, 0, 420)}"/>`;
  for (let i = 0; i < 46; i++) sky += `<circle cx="${n(a.r(BX0, BX1))}" cy="${n(a.r(BY0, 90))}" r="${n(a.r(0.7, 1.9))}" fill="#fff" opacity="${n(a.r(0.35, 0.9))}"/>`;
  sky += glow(a, 1070, 236, 520, 230, '#ffcf8a', 0.8);
  sky += `<circle cx="1084" cy="238" r="44" fill="#fff0c8" opacity=".95"/><circle cx="1084" cy="238" r="62" fill="none" stroke="#ffe2b0" stroke-width="8" opacity=".35"/>`;
  sky += cloudBank(a, BX0 - 40, 380, 150, 42) + cloudBank(a, 840, BX1 + 40, 128, 46) + cloudBank(a, 300, 900, 214, 26);

  // ---- land
  let land = '';
  // far mountains (hazy violet, thin lines) with dusk-pink snow caps
  const far = ridgePath(a.rand, BX0 - 40, BX1 + 40, 210, 90, 120, 330, true);
  land += `<path d="${far}" fill="#7a72b4"/>`;
  for (const [mx, my, w] of [[-120, 140, 70], [150, 136, 70], [520, 128, 80], [880, 140, 60], [1240, 132, 80], [1440, 140, 66]] as const) {
    land += `<path d="M${mx - w} ${my + 70}L${mx} ${my}L${mx + w} ${my + 70}Z" fill="#6e68aa"/>`;
    land += `<path d="M${mx - w * 0.36} ${my + 25}L${mx} ${my}L${mx + w * 0.36} ${my + 25}L${mx + w * 0.16} ${my + 20}L${mx} ${my + 30}L${mx - w * 0.16} ${my + 20}Z" fill="#ffdbe4"/>`;
  }
  land += `<path d="${ridgePath(a.rand, BX0 - 40, BX1 + 40, 250, 50, 90, 360, true)}" fill="#605e9e"/>`;
  // distant castle on a far hill (right), lit windows
  land += `<g fill="#56548e" stroke="#4a4880" stroke-width="1.4"><rect x="1150" y="196" width="80" height="44"/><rect x="1142" y="176" width="18" height="64"/><rect x="1220" y="170" width="18" height="70"/><rect x="1180" y="160" width="22" height="50"/><path d="M1140 176L1151 156L1162 176ZM1218 170L1229 148L1240 170ZM1178 160L1191 136L1204 160Z"/></g>`;
  land += `<g fill="#ffd36a"><rect x="1188" y="176" width="5" height="8" rx="2"/><rect x="1226" y="190" width="4" height="7" rx="2"/><rect x="1162" y="210" width="5" height="7" rx="2"/></g>`;
  // warm haze band
  land += `<rect x="${BX0}" y="248" width="${TOWN_BOX.w}" height="64" fill="#ffc8b4" opacity=".45" filter="${a.blur(12)}"/>`;
  // rolling hills (cool, saturated greens) and pines
  land += `<path d="${ridgePath(a.rand, BX0 - 40, BX1 + 40, 290, 40, 140, 420, true)}" fill="#3f8a6a"/>`;
  for (let i = 0; i < 34; i++) land += pineTree(a.r(BX0, BX1), a.r(276, 300), a.r(0.28, 0.42), ['#3a7a5e', '#26604a'], '#1e4a3a', '#3a2a2a');
  land += `<path d="${ridgePath(a.rand, BX0 - 40, BX1 + 40, 312, 30, 160, 440, true)}" fill="#4a9a4e"/>`;

  // the town hill: big grassy plateau
  const hill = `M${BX0 - 40} 380C-60 330 120 300 640 284C1160 300 1340 330 ${BX1 + 40} 380V${BY1 + 10}H${BX0 - 40}Z`;
  land += `<path d="${hill}" fill="${a.linU([[0, '#7cd05a'], [0.4, '#58b046'], [1, '#2a7a34']], 0, 284, 0, 720)}"/>`;
  // grass mottles
  for (let i = 0; i < 30; i++) {
    const gy = a.r(320, 660);
    land += `<path d="${blobPath(a.rand, a.r(BX0, BX1), gy, a.r(50, 120), a.r(10, 22), 9, 0.25)}" fill="${a.pick(['#92e06a', '#3f9a3e'])}" opacity=".5"/>`;
  }
  // plaza & paths
  const pathCol = '#ecd6a6';
  const pathEdge = '#a8865a';
  const paths: [number, number][][] = [
    [[640, 520], [640, 440]],
    [[600, 530], [520, 540], [430, 545]],
    [[680, 530], [760, 540], [880, 545]],
    [[560, 500], [420, 470], [300, 440], [240, 430]],
    [[560, 480], [480, 380], [400, 300], [340, 262]],
    [[720, 490], [860, 440], [960, 410], [1030, 404]],
    [[720, 510], [900, 500], [1060, 520], [1160, 560]],
    [[640, 560], [640, 680]],
    [[240, 430], [80, 470], [-80, 520], [BX0 - 20, 560]],
    [[1160, 560], [1300, 600], [BX1 + 20, 620]],
  ];
  let pd = '';
  for (const p of paths) pd += smoothOpen(p);
  land += `<path d="${pd}" fill="none" stroke="${pathEdge}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>`;
  land += `<path d="${pd}" fill="none" stroke="${pathCol}" stroke-width="33" stroke-linecap="round" stroke-linejoin="round"/>`;
  land += `<path d="${pd}" fill="none" stroke="#fff4d8" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 18" opacity=".8"/>`;
  // central plaza with a mosaic ring and the fountain
  land += `<ellipse cx="640" cy="512" rx="210" ry="74" fill="${pathEdge}"/>`;
  land += `<ellipse cx="640" cy="508" rx="204" ry="70" fill="${a.lin([[0, '#f6e6c4'], [1, '#dcc290']])}"/>`;
  let rings = '';
  for (const [rx, ry] of [[184, 62], [150, 50]] as const) rings += `<ellipse cx="640" cy="510" rx="${rx}" ry="${ry}" fill="none" stroke="#c9a46a" stroke-width="3"/>`;
  land += rings;
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    land += `<path d="M${n(640 + Math.cos(ang) * 150)} ${n(510 + Math.sin(ang) * 50)}L${n(640 + Math.cos(ang) * 184)} ${n(510 + Math.sin(ang) * 62)}" stroke="#c9a46a" stroke-width="3"/>`;
  }
  // long dusk shadows cast by the buildings (to the lower left)
  for (const [sx, sy, len, w] of [[640, 420, 300, 34], [420, 590, 180, 20], [906, 600, 220, 22], [240, 444, 200, 18], [1034, 412, 170, 18], [338, 244, 150, 14], [1170, 600, 170, 16]] as const) {
    land += castShadow(a, sx, sy, len, w);
  }
  // trees & bushes scattered between the buildings (behind them)
  const leaf: [string, string, string] = ['#a8e066', '#4fae44', '#226a2c'];
  const leafB: [string, string, string] = ['#8ad45a', '#3f9a3e', '#1c5a2a'];
  for (const [tx, ty, ts] of [[460, 300, 0.7], [905, 330, 0.6], [445, 360, 0.55], [870, 390, 0.5], [150, 250, 0.6], [86, 300, 0.8], [1180, 380, 0.7], [1240, 330, 0.6], [740, 606, 0.5], [550, 610, 0.5], [-60, 300, 0.85], [-170, 380, 0.7], [1400, 330, 0.8], [1470, 420, 0.7]] as const) {
    land += castShadow(a, tx, ty, 90 * ts, 9 * ts, 0.28);
    land += roundTree(a, tx, ty, ts, a.rand() < 0.5 ? leaf : leafB, { line: '#123010', shadow: false });
  }
  for (const [bx, by, bs] of [[560, 440, 0.6], [722, 446, 0.6], [372, 452, 0.6], [1100, 404, 0.5], [205, 452, 0.55], [1000, 560, 0.55], [300, 600, 0.6], [-120, 470, 0.7], [1380, 520, 0.7]] as const) {
    land += bush(a, bx, by, bs, leaf, '#123010');
  }
  for (let i = 0; i < 40; i++) {
    const fx = a.r(BX0 + 40, BX1 - 40);
    const fy = a.r(330, 600);
    land += grassTuft(a, fx, fy, 0.6, ['#a6e67a', '#4fa83e'], '#123010');
  }
  // pond with lily pads, reeds and stepping rocks (lower left)
  land += pond(a, 190, 540);
  // flower patches
  for (let i = 0; i < 90; i++) {
    const fx = a.r(BX0 + 60, BX1 - 60);
    const fy = a.r(330, 600);
    if (Math.abs(fx - 640) < 230 && fy > 430) continue;
    const col = a.pick(['#ffffff', '#ffd23a', '#ff7ab0', '#b9a2ff', '#ff6a5a']);
    const r = 2.6 + (fy - 330) / 160;
    land += `<circle cx="${n(fx)}" cy="${n(fy)}" r="${n(r)}" fill="${col}" stroke="#2a4a12" stroke-width="1"/><circle cx="${n(fx)}" cy="${n(fy)}" r="${n(r * 0.38)}" fill="#ffb02a"/>`;
  }
  // market carts along the roads out of town (seen on wide screens)
  land += marketCart(a, -110, 560, 0.8, '#e2453a') + marketCart(a, 1400, 640, 0.8, '#2aa7a0');
  // fountain in the middle of the plaza
  land += `<g transform="translate(640 556) scale(.74) translate(-640 -556)">${fountain(a, 640, 556)}</g>`;
  // lamp posts along the plaza (with bloom)
  for (const [lx, ly] of [[454, 506], [826, 506], [560, 584], [720, 584]] as const) {
    land += `<path d="M${lx} ${ly}V${ly - 44}" stroke="#2a2430" stroke-width="5" stroke-linecap="round"/><path d="M${lx} ${ly}V${ly - 44}" stroke="#6a6478" stroke-width="2"/>`;
    land += glow(a, lx, ly - 52, 46, 40, '#ffc870', 0.8);
    land += `<path d="M${lx - 7} ${ly - 44}H${lx + 7}L${lx + 5} ${ly - 58}H${lx - 5}Z" fill="#fff0b0" stroke="#2a2430" stroke-width="2"/><path d="M${lx - 8} ${ly - 58}H${lx + 8}L${lx} ${ly - 66}Z" fill="#3a3448" stroke="#1a1620" stroke-width="1.6"/>`;
  }
  // festive bunting between the lamp posts
  land += bunting(a, [454, 450], [560, 528]) + bunting(a, [720, 528], [826, 450]);
  // the front rampart
  land += rampart(a);
  // dusk grade: lavender on the upper land, warm light from the right
  land += `<rect x="${BX0}" y="240" width="${TOWN_BOX.w}" height="${BY1 - 240}" fill="${a.linU([[0, '#7a6ac8', 0.35], [0.4, '#7a6ac8', 0.08], [1, '#1a1440', 0.3]], 0, 240, 0, 760)}" style="mix-blend-mode:multiply"/>`;
  land += `<ellipse cx="1100" cy="300" rx="520" ry="220" fill="#ffb070" opacity=".18" style="mix-blend-mode:screen" filter="${a.blur(30)}"/>`;

  // ---- foreground framing: dark foliage in the corners, overhanging branches at the top corners
  let front = '';
  const dark: [string, string, string] = ['#3f7a3a', '#25562a', '#123418'];
  front += foliage(a, 40, 700, 170, 86, dark, '#081a0a', { details: false });
  front += foliage(a, 1250, 700, 190, 86, dark, '#081a0a', { details: false });
  front += foliage(a, 330, 742, 150, 60, ['#4a8a3e', '#2a6030', '#163a1c'], '#081a0a', { details: false });
  front += foliage(a, 960, 746, 160, 60, ['#4a8a3e', '#2a6030', '#163a1c'], '#081a0a', { details: false });
  front += foliage(a, -150, 640, 160, 120, dark, '#081a0a', { details: false });
  front += foliage(a, 1440, 640, 160, 120, dark, '#081a0a', { details: false });
  front += foliage(a, -200, -40, 220, 150, dark, '#081a0a', { details: false });
  front += foliage(a, 1490, -30, 220, 150, dark, '#081a0a', { details: false });
  // vignette
  front += `<rect x="${BX0}" y="${BY0}" width="${TOWN_BOX.w}" height="${TOWN_BOX.h}" fill="${a.radU([[0, '#0a0a24', 0], [0.55, '#0a0a24', 0], [0.82, '#0a0a24', 0.4], [1, '#0a0a24', 0.75]], 640, 380, 1000)}" transform="translate(640 380) scale(1 .78) translate(-640 -380)" pointer-events="none"/>`;

  return { defs: '', sky, land, front, clouds: [] };
}
