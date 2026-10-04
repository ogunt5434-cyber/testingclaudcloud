// Dev-only gallery for the environment art: icons, battle backdrops, town hub, VFX and a battle
// composition preview. Open /gallery-env.html on the Vite dev server (not part of the game build).
import { heroSprite } from './art/characters';
import { ICON_NAMES } from './art/env/iconArt';
import { SCENE_KINDS } from './art/env/sceneArt';
import { icon } from './art/icons';
import { sceneBackground } from './art/scenes';
import { townScene, updateTownScene } from './art/town';
import { playVfx, VFX_KINDS, type VfxOpts } from './art/vfx';
import type { TownBuildingId, VfxKind } from './art/types';
import type { Faction } from './core/types';
import { HEROES } from './data/heroes';

const root = document.getElementById('gallery')!;

const css = document.createElement('style');
css.textContent = `
  body { margin: 0; background: #1b1830; color: #f3eedf; font: 14px/1.4 "Trebuchet MS", "Segoe UI", system-ui, sans-serif; }
  h1 { margin: 16px 20px 4px; font-size: 22px; }
  h2 { margin: 28px 20px 8px; font-size: 18px; color: #ffd36a; }
  nav { margin: 0 20px; display: flex; gap: 12px; flex-wrap: wrap; }
  nav a { color: #9fd8ff; }
  .panel { padding: 12px; border-radius: 10px; margin: 0 20px 12px; }
  .dark { background: #232041; }
  .light { background: #efe6cf; color: #2a2116; }
  .icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; }
  .icell { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 2px; border-radius: 8px; }
  .icell .sizes { display: flex; align-items: flex-end; gap: 8px; }
  .icell small { font-size: 11px; opacity: .8; }
  .stage { position: relative; width: 1280px; height: 720px; margin: 0 20px 16px; border-radius: 6px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
  .thumbs { display: grid; grid-template-columns: repeat(3, 400px); gap: 12px; padding: 0 20px; }
  .thumb { position: relative; width: 400px; height: 225px; border-radius: 6px; overflow: hidden; }
  .thumb.tall { height: 300px; }
  .label { position: absolute; left: 8px; top: 6px; z-index: 60; background: rgba(0,0,0,.55); padding: 2px 8px; border-radius: 4px; pointer-events: none; }
  .controls { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 20px 10px; align-items: center; }
  .controls button, .controls select { font: inherit; padding: 6px 12px; border-radius: 8px; border: 2px solid #ffd36a; background: #2a2650; color: #fff; cursor: pointer; }
  .controls label { display: flex; gap: 4px; align-items: center; }
  .hud-guide { position: absolute; inset: 0; pointer-events: none; z-index: 70; display: none; }
  .hud-guide.on { display: block; }
  .hud-guide i { position: absolute; background: rgba(255, 40, 120, .28); outline: 2px dashed #ff4f9a; }
  .dummy { position: absolute; width: 90px; height: 130px; margin: -80px 0 0 -45px; border-radius: 45px 45px 20px 20px; background: linear-gradient(#8fa8d8, #4a5a8a); border: 3px solid #1a1f3a; }
  .dummy.enemy { background: linear-gradient(#e08a8a, #8a3a3a); }
  .vfxlayer { position: absolute; inset: 0; }
  .sheet { display: grid; grid-template-columns: repeat(3, 420px); gap: 10px; padding: 0 20px 30px; }
  .cell { position: relative; width: 420px; height: 260px; border-radius: 6px; overflow: hidden; background: #14122a; }
  .cell .dummy { transform: scale(.7); }
  .unit { position: absolute; width: 160px; height: 200px; margin: -200px 0 0 -80px; }
  .unit > * { width: 100%; height: 100%; }
  .unit .ph { border-radius: 60px 60px 20px 20px; background: linear-gradient(#cfd8f0, #6a7aa8); border: 3px solid #1a1f3a; }
`;
document.head.append(css);

function h(tag: string, cls = '', text = ''): HTMLElement {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

function section(id: string, title: string): void {
  const el = h('h2', '', title);
  el.id = id;
  root.append(el);
}

root.append(h('h1', '', 'Ortam galerisi (dev)'));
const nav = h('nav');
for (const [id, t] of [['icons', 'Simgeler'], ['scenes', 'Sahneler'], ['town-sec', 'Kasaba'], ['vfx', 'Efektler'], ['preview', 'Savaş önizleme']]) {
  const a = document.createElement('a');
  a.href = `#${id}`;
  a.textContent = t;
  nav.append(a);
}
root.append(nav);

// ---------------------------------------------------------------- icons
section('icons', `Simgeler (${ICON_NAMES.length}) — 16 / 24 / 48 px, koyu ve açık zemin`);
for (const theme of ['dark', 'light'] as const) {
  const panel = h('div', `panel ${theme}`);
  const grid = h('div', 'icons');
  for (const name of ICON_NAMES) {
    const cell = h('div', 'icell');
    cell.dataset.icon = name;
    const sizes = h('div', 'sizes');
    sizes.append(icon(name, 16), icon(name, 24), icon(name, 48));
    cell.append(sizes, h('small', '', name));
    grid.append(cell);
  }
  panel.append(grid);
  root.append(panel);
}

// ---------------------------------------------------------------- scenes
section('scenes', 'Savaş sahneleri (1280×720)');
for (const kind of SCENE_KINDS) {
  const stage = h('div', 'stage');
  stage.id = `scene-${kind}`;
  stage.append(sceneBackground(kind), h('div', 'label', kind));
  root.append(stage);
}
root.append(h('h2', '', 'Tam taşma (full bleed): 1760×1020 sanat kutusu, kesikli çerçeve = 1280×720 güvenli alan'));
const bleedCss = document.createElement('style');
bleedCss.textContent = `
  .bleed { position: relative; width: 880px; height: 510px; margin: 0 20px 16px; overflow: hidden; border-radius: 6px; background: #000; }
  .bleed-inner { position: absolute; left: 0; top: 0; width: 1760px; height: 1020px; transform: scale(.5); transform-origin: 0 0; }
  .bleed-safe { position: absolute; left: 240px; top: 150px; width: 1280px; height: 720px; }
  .bleed-frame { position: absolute; left: 240px; top: 150px; width: 1280px; height: 720px; outline: 3px dashed rgba(255, 80, 160, .9); pointer-events: none; z-index: 5; }
  .bleed-phone { position: absolute; left: 102px; top: 150px; width: 1556px; height: 720px; outline: 3px dotted rgba(80, 220, 255, .9); pointer-events: none; z-index: 5; }
`;
document.head.append(bleedCss);
for (const kind of SCENE_KINDS) {
  const wrap = h('div', 'bleed');
  wrap.id = `bleed-${kind}`;
  const inner = h('div', 'bleed-inner');
  const safe = h('div', 'bleed-safe');
  safe.append(sceneBackground(kind));
  inner.append(safe, h('div', 'bleed-frame'), h('div', 'bleed-phone'));
  wrap.append(inner, h('div', 'label', `${kind} (pembe: 16:9, mavi: 2.16:1 telefon)`));
  root.append(wrap);
}
root.append(h('h2', '', 'Küçük boyut ve farklı en-boy oranı (cover)'));
const thumbs = h('div', 'thumbs');
for (const kind of SCENE_KINDS) {
  const t = h('div', `thumb${kind === 'ruins' || kind === 'void' ? ' tall' : ''}`);
  t.append(sceneBackground(kind), h('div', 'label', kind));
  thumbs.append(t);
}
root.append(thumbs);

// ---------------------------------------------------------------- town
section('town-sec', 'Kasaba (1280×720)');
const townControls = h('div', 'controls');
const guideBox = document.createElement('input');
guideBox.type = 'checkbox';
const guideLabel = h('label', '', 'HUD bantlarını göster (üst 80, sol 90, alt 110)');
guideLabel.prepend(guideBox);
const lockAll = h('button', '', 'Hepsini aç');
const lockSome = h('button', '', 'Arena/Lonca/Pazar kilitli');
const badgeBtn = h('button', '', 'Rozetleri değiştir');
townControls.append(guideLabel, lockAll, lockSome, badgeBtn);
root.append(townControls);
const townStage = h('div', 'stage');
townStage.id = 'town';
const townLog = h('div', 'label', 'tıkla: -');
Object.assign(townLog.style, { left: 'auto', right: '8px', top: 'auto', bottom: '8px' });
const town = townScene({
  onBuilding: (id) => (townLog.textContent = `tıkla: ${id}`),
  locked: ['arena', 'guild', 'shop'],
  badges: { summon: true, campaign: true },
});
const guide = h('div', 'hud-guide');
guide.id = 'hud-guide';
for (const [l, t, w, hh] of [[0, 0, 1280, 80], [0, 80, 90, 530], [0, 610, 1280, 110]]) {
  const i = document.createElement('i');
  Object.assign(i.style, { left: `${l}px`, top: `${t}px`, width: `${w}px`, height: `${hh}px` });
  guide.append(i);
}
guideBox.addEventListener('change', () => guide.classList.toggle('on', guideBox.checked));
lockAll.addEventListener('click', () => updateTownScene(town, { locked: [] }));
lockSome.addEventListener('click', () => updateTownScene(town, { locked: ['arena', 'guild', 'shop'] }));
let badgeFlip = false;
badgeBtn.addEventListener('click', () => {
  badgeFlip = !badgeFlip;
  const ids: TownBuildingId[] = badgeFlip ? ['heroes', 'tower'] : ['summon', 'campaign'];
  updateTownScene(town, { badges: Object.fromEntries(ids.map((id) => [id, true])) });
});
townStage.append(town, guide, townLog);
root.append(townStage);

// ---------------------------------------------------------------- vfx
section('vfx', 'Savaş efektleri');
const vfxStage = h('div', 'stage');
vfxStage.id = 'vfx-stage';
vfxStage.append(sceneBackground('cave'));
const A = { x: 400, y: 450 };
const B = { x: 880, y: 450 };
for (const [p, cls] of [[A, 'dummy'], [B, 'dummy enemy']] as const) {
  const d = h('div', cls);
  d.style.left = `${p.x}px`;
  d.style.top = `${p.y}px`;
  vfxStage.append(d);
}
const vfxLayer = h('div', 'vfxlayer');
vfxStage.append(vfxLayer);

const controls = h('div', 'controls');
const bigBox = document.createElement('input');
bigBox.type = 'checkbox';
const bigLabel = h('label', '', 'büyük');
bigLabel.prepend(bigBox);
const facSel = document.createElement('select');
for (const f of ['', 'shadow', 'fortress', 'abyss', 'forest', 'dark', 'light']) facSel.append(new Option(f || 'grup yok', f));
const stSel = document.createElement('select');
for (const s of ['', 'stun', 'freeze', 'petrify', 'silence', 'burn', 'poison', 'bleed']) stSel.append(new Option(s || 'durum: varsayılan', s));
controls.append(bigLabel, facSel, stSel);
const vfxOpts = (): VfxOpts => ({
  big: bigBox.checked,
  faction: (facSel.value || undefined) as Faction | undefined,
  status: (stSel.value || undefined) as VfxOpts['status'],
});
for (const kind of VFX_KINDS) {
  const b = h('button', '', kind);
  b.dataset.vfx = kind;
  b.addEventListener('click', () => void playVfx(vfxLayer, kind, A, B, vfxOpts()));
  controls.append(b);
}
root.append(controls, vfxStage);

root.append(h('h2', '', 'Efekt sayfası (hepsi birlikte)'));
const sheetControls = h('div', 'controls');
const sheetBtn = h('button', '', 'Hepsini oynat');
sheetControls.append(sheetBtn);
root.append(sheetControls);
const sheet = h('div', 'sheet');
sheet.id = 'vfx-sheet';
const sheetList: [VfxKind, VfxOpts, string][] = [
  ['slash', { faction: 'abyss' }, 'slash · abyss'],
  ['arrow', { big: true }, 'arrow · big'],
  ['magic-bolt', { faction: 'shadow' }, 'magic-bolt · shadow'],
  ['explosion', {}, 'explosion'],
  ['aoe-wave', { faction: 'forest' }, 'aoe-wave · forest'],
  ['heal', {}, 'heal'],
  ['buff', {}, 'buff'],
  ['debuff', {}, 'debuff'],
  ['control', { status: 'stun' }, 'control · stun'],
  ['control', { status: 'freeze' }, 'control · freeze'],
  ['control', { status: 'petrify' }, 'control · petrify'],
  ['control', { status: 'silence' }, 'control · silence'],
  ['dot', { status: 'burn' }, 'dot · burn'],
  ['dot', { status: 'poison' }, 'dot · poison'],
  ['dot', { status: 'bleed' }, 'dot · bleed'],
  ['death', {}, 'death'],
  ['magic-bolt', { faction: 'light', big: true }, 'magic-bolt · light · big'],
  ['slash', { big: true }, 'slash · big'],
];
const cells: { kind: VfxKind; layer: HTMLElement; opts: VfxOpts }[] = [];
for (const [kind, opts, label] of sheetList) {
  const c = h('div', 'cell');
  const p1 = h('div', 'dummy');
  Object.assign(p1.style, { left: '90px', top: '170px' });
  const p2 = h('div', 'dummy enemy');
  Object.assign(p2.style, { left: '320px', top: '170px' });
  const layer = h('div', 'vfxlayer');
  c.append(p1, p2, layer, h('div', 'label', label));
  sheet.append(c);
  cells.push({ kind, layer, opts });
}
root.append(sheet);
const playSheet = (): void => {
  for (const c of cells) void playVfx(c.layer, c.kind, { x: 90, y: 150 }, { x: 320, y: 150 }, c.opts);
};
sheetBtn.addEventListener('click', playSheet);
/** Screenshot helper: plays the whole sheet and freezes it `t` ms in. */
(window as unknown as Record<string, unknown>).__vfxSheet = (t: number): void => {
  playSheet();
  for (const a of document.getAnimations()) {
    const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
    if (el && el.closest('#vfx-sheet')) {
      a.pause();
      a.currentTime = t;
    }
  }
};

// ---------------------------------------------------------------- battle composition preview
section('preview', 'Savaş kompozisyonu önizlemesi (sahne + kahramanlar)');
const slots: [number, number][] = [
  [520, 430],
  [490, 570],
  [340, 370],
  [320, 470],
  [300, 570],
  [280, 670],
];
let heroIdx = 0;
for (const kind of SCENE_KINDS) {
  const stage = h('div', 'stage');
  stage.id = `battle-${kind}`;
  stage.append(sceneBackground(kind));
  for (const side of [1, -1] as const) {
    for (const [sx, sy] of slots) {
      const u = h('div', 'unit');
      u.style.left = `${side === 1 ? sx : 1280 - sx}px`;
      u.style.top = `${sy}px`;
      try {
        const def = HEROES[heroIdx++ % HEROES.length];
        u.append(heroSprite(def.id, { facing: side === 1 ? 'right' : 'left' }));
      } catch {
        u.append(h('div', 'ph'));
      }
      stage.append(u);
    }
  }
  stage.append(h('div', 'label', kind));
  root.append(stage);
}
