// Town hub illustration (fills a 1280x720 stage) with clickable buildings and ribbon labels.
// Drawings live in src/art/env/townArt.ts; this module mounts them as real <button>s.
import type { TownBuildingId } from './types';
import { cloudSvg, TOWN_BOX, TOWN_BUILDINGS, townBackdrop, type TownBuildingDef } from './env/townArt';
import { Art } from './env/props';
import { esc, Ids, n, nextUid } from './env/kit';
import { iconMarkup } from './env/iconArt';
import './env.css';

export interface TownSceneOpts {
  onBuilding: (id: TownBuildingId) => void;
  locked: readonly TownBuildingId[];
  /** Red notification dots. */
  badges?: Partial<Record<TownBuildingId, boolean>>;
}

const LOCKED_NOTE = 'Yakında';

function svgLayer(cls: string, inner: string, w = 1280, h = 720): string {
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" overflow="visible">${inner}</svg>`;
}

/** A backdrop layer over the whole full-bleed box (the town is painted past the stage to the screen edges). */
function bleedLayer(cls: string, inner: string): string {
  const { x, y, w, h } = TOWN_BOX;
  return `<svg class="${cls}" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}" style="left:${x}px;top:${y}px" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/** Fireflies drifting over the plaza and the meadows (CSS animated). */
function fireflies(): string {
  let out = '';
  for (let i = 0; i < 18; i++) {
    const x = ((i * 397) % 1600) - 160;
    const y = 300 + ((i * 131) % 320);
    const dx = ((i * 53) % 60) - 30;
    const dy = -20 - ((i * 37) % 40);
    out += `<i style="left:${x}px;top:${y}px;--dx:${dx}px;--dy:${dy}px;animation-delay:${n(-(i * 0.77) % 7)}s;animation-duration:${n(5.5 + (i % 5) * 0.8)}s"></i>`;
  }
  return `<div class="ae-town-flies" aria-hidden="true">${out}</div>`;
}

function buildingMarkup(a: Art, def: TownBuildingDef, uid: string): string {
  const art = def.art(a);
  const front = def.front ? def.front(a) : '';
  const overlays = def
    .overlays(a)
    .map(
      (o) =>
        `<span class="ae-town-ov ${o.cls
          .split(' ')
          .map((c) => `ae-ov--${c}`)
          .join(' ')}" style="left:${n(o.x)}px;top:${n(o.y)}px;width:${n(o.w)}px;height:${n(o.h)}px">${o.html}</span>`,
    )
    .join('');
  const ribbonCls = `ae-ribbon${def.ribbon.big ? ' ae-ribbon--big' : ''}`;
  return (
    `<button type="button" class="ae-bld ae-bld--${def.id}" data-building="${def.id}" style="left:${def.x}px;top:${def.y}px;width:${def.w}px;height:${def.h}px">` +
    `<span class="ae-bld-art">${svgLayer('ae-bld-svg', art, def.w, def.h)}${overlays}${front ? svgLayer('ae-bld-svg ae-bld-svg--front', front, def.w, def.h) : ''}</span>` +
    `<span class="${ribbonCls}" style="left:${def.ribbon.x}px;top:${def.ribbon.y}px">` +
    `<span class="ae-ribbon-lock">${iconMarkup('lock', 18, `${uid}-${def.id}-lk`)}</span>` +
    `<span class="ae-ribbon-text">${esc(def.label)}</span>` +
    `<span class="ae-ribbon-note">${LOCKED_NOTE}</span>` +
    `<span class="ae-badge" aria-hidden="true"></span>` +
    `</span></button>`
  );
}

/** Applies locked state & badges to an existing town (no re-render). */
export function updateTownScene(town: HTMLElement, state: { locked?: readonly TownBuildingId[]; badges?: Partial<Record<TownBuildingId, boolean>> }): void {
  for (const def of TOWN_BUILDINGS) {
    const btn = town.querySelector<HTMLButtonElement>(`.ae-bld[data-building="${def.id}"]`);
    if (!btn) continue;
    if (state.locked) {
      const isLocked = state.locked.includes(def.id);
      btn.classList.toggle('ae-bld--locked', isLocked);
      btn.dataset.locked = isLocked ? 'true' : 'false';
    }
    if (state.badges) btn.classList.toggle('ae-bld--badge', !!state.badges[def.id]);
    const locked = btn.classList.contains('ae-bld--locked');
    const badge = btn.classList.contains('ae-bld--badge');
    btn.setAttribute('aria-label', `${def.label}${locked ? ` (${LOCKED_NOTE})` : ''}${badge ? ' — yeni' : ''}`);
  }
}

/** Town hub illustration (fills a 1280x720 parent) with clickable buildings and ribbon labels. */
export function townScene(opts: TownSceneOpts): HTMLElement {
  const uid = nextUid('aet');
  const a = new Art(new Ids(uid), 97);
  const buildings = TOWN_BUILDINGS.map((def) => buildingMarkup(a, def, uid)).join('');
  const bd = townBackdrop(a);

  let clouds = '';
  const cloudSpecs: [number, number, number, number][] = [
    // top, scale, duration, delay fraction
    [70, 0.9, 150, 0.1],
    [130, 0.65, 190, 0.45],
    [40, 0.55, 230, 0.7],
    [160, 0.8, 170, 0.9],
  ];
  cloudSpecs.push([-60, 0.7, 210, 0.3], [20, 0.85, 180, 0.6]);
  cloudSpecs.forEach(([top, s, dur, frac], i) => {
    clouds += `<span class="ae-town-cloud" style="top:${top + 150}px;width:${n(220 * s)}px;height:${n(100 * s)}px;animation-duration:${dur}s;animation-delay:${n(-dur * frac)}s">${cloudSvg(i + 3)}</span>`;
  });
  const birds = `<span class="ae-town-birds"><i></i><i></i><i></i></span>`;

  const root = document.createElement('div');
  root.className = 'ae-town';
  root.innerHTML =
    `<svg class="ae-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${a.defs.join('')}</defs></svg>` +
    bleedLayer('ae-town-layer', bd.sky) +
    `<div class="ae-town-sky">${clouds}${birds}</div>` +
    bleedLayer('ae-town-layer', bd.land) +
    `<div class="ae-town-buildings">${buildings}</div>` +
    fireflies() +
    bleedLayer('ae-town-layer ae-town-front', bd.front);

  root.querySelectorAll<HTMLButtonElement>('.ae-bld').forEach((btn) => {
    const id = btn.dataset.building as TownBuildingId;
    btn.addEventListener('click', () => opts.onBuilding(id));
  });
  updateTownScene(root, { locked: opts.locked, badges: opts.badges ?? {} });
  return root;
}
