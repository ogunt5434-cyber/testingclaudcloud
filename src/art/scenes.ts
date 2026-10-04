// Painted battle backdrops. The drawings live in src/art/env/sceneArt.ts (pure SVG strings);
// this module mounts them as layered SVGs with a CSS-animated ambient layer (motes, glow pulses,
// spinning rifts) that respects prefers-reduced-motion.
import type { SceneKind } from './types';
import { ART_H, ART_W, ART_X0, ART_Y0, buildScene, sceneSvg, type MoteSpec, type SceneArt } from './env/sceneArt';
import { makeRng, n, nextUid } from './env/kit';
import './env.css';

const TOKEN = '__AESCN__';
const cache = new Map<SceneKind, SceneArt>();

/** Scene markup is built once per kind with a placeholder id prefix, then re-keyed per instance. */
function sceneArt(kind: SceneKind): SceneArt {
  let art = cache.get(kind);
  if (!art) {
    art = buildScene(kind, TOKEN);
    cache.set(kind, art);
  }
  return art;
}

/** Stage x / y (design px) → percentage of the full-bleed art box. */
const px = (x: number): string => `${n(((x - ART_X0) / ART_W) * 100)}%`;
const py = (y: number): string => `${n(((y - ART_Y0) / ART_H) * 100)}%`;
/** Design px → container width units of the art box. */
const cq = (v: number): string => `${Math.round((v / ART_W) * 10000) / 100}cqw`;

function moteEls(spec: MoteSpec, rand: () => number): string {
  let out = '';
  const [x0, y0, x1, y1] = spec.area;
  for (let i = 0; i < spec.count; i++) {
    const size = spec.size[0] + rand() * (spec.size[1] - spec.size[0]);
    const x = x0 + rand() * (x1 - x0);
    const y = y0 + rand() * (y1 - y0);
    const dy = spec.rise[0] + rand() * (spec.rise[1] - spec.rise[0]);
    const dx = (rand() - 0.5) * 2 * spec.drift;
    const dur = spec.dur[0] + rand() * (spec.dur[1] - spec.dur[0]);
    const delay = -rand() * dur;
    const rot = Math.round((rand() - 0.5) * 720);
    out +=
      `<i class="ae-mote ae-mote--${spec.shape ?? 'dot'}" style="left:${px(x)};top:${py(y)};` +
      `width:${cq(size)};height:${cq(size)};--c:${spec.color};--dx:${cq(dx)};--dy:${cq(dy)};--rot:${rot}deg;` +
      `animation-duration:${n(dur)}s;animation-delay:${n(delay)}s"></i>`;
  }
  return out;
}

/** Painted battle backdrop that fills its positioned parent (absolute, inset 0). */
export function sceneBackground(kind: SceneKind): HTMLElement {
  const art = sceneArt(kind);
  const uid = nextUid('aes');
  const rekey = (s: string): string => s.split(TOKEN).join(uid);
  const rand = makeRng(kind.length * 977 + 13);

  let fxBack = '';
  let fx = '';
  for (const p of art.pulses) {
    fx +=
      `<i class="ae-pulse" style="left:${px(p.x)};top:${py(p.y)};width:${cq(p.rx * 2)};height:${cq(p.ry * 2)};` +
      `--c:${p.color};--min:${p.min};--max:${p.max};animation-duration:${p.dur}s"></i>`;
  }
  for (const s of art.spins) {
    const el =
      `<div class="ae-spin" style="left:${px(s.x)};top:${py(s.y)};width:${cq(s.size)};height:${cq(s.size)};--squash:${s.squash}">` +
      `<div class="ae-spin-inner${s.reverse ? ' ae-spin-inner--rev' : ''}" style="animation-duration:${s.dur}s">${rekey(s.svg)}</div></div>`;
    if (s.back) fxBack += el;
    else fx += el;
  }
  for (const m of art.motes) fx += moteEls(m, rand);

  const root = document.createElement('div');
  root.className = `ae-scene ae-scene--${kind}`;
  root.setAttribute('aria-hidden', 'true');
  root.dataset.scene = kind;
  root.style.backgroundColor = art.base;
  root.innerHTML =
    `<div class="ae-scene-box">` +
    `<svg class="ae-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${rekey(art.defs)}</defs></svg>` +
    sceneSvg(rekey(art.back), 'ae-scene-layer ae-scene-back') +
    `<div class="ae-scene-fx ae-scene-fx--back">${fxBack}</div>` +
    sceneSvg(rekey(art.front), 'ae-scene-layer ae-scene-front') +
    `<div class="ae-scene-fx">${fx}</div>` +
    `</div>`;
  return root;
}
