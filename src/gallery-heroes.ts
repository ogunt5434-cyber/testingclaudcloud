// Dev-only hero art gallery (served by `vite` at /gallery-heroes.html; not part of the game build).
// Shows every hero's sprite + portrait, a 6v6 battle-line preview and buttons to trigger each animation.
import { heroPortrait, heroSprite, setSpriteAnim } from './art/characters';
import type { SpriteAnim } from './art/types';
import { HEROES } from './data/heroes';

const ANIMS: SpriteAnim[] = ['idle', 'attack', 'cast', 'hit', 'die', 'victory'];
const params = new URLSearchParams(location.search);
const only = params.get('heroes')?.split(',').filter(Boolean);
const heroes = only ? HEROES.filter((h) => only.includes(h.id)) : HEROES;
const sprites: HTMLElement[] = [];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

const header = el('header');
header.append(el('h1', '', 'Kahraman Galerisi'));
for (const anim of ANIMS) {
  const b = el('button', anim === 'idle' ? 'alt' : '', anim);
  b.addEventListener('click', () => {
    sprites.forEach((s, i) => window.setTimeout(() => void setSpriteAnim(s, anim), anim === 'idle' ? 0 : i * 40));
  });
  header.append(b);
}
document.body.append(header);

// battle-line preview: 6 vs 6, like the battle screen
if (!params.has('nostage')) {
  const stage = el('div');
  stage.id = 'stage';
  const left = heroes.slice(0, 6);
  const right = heroes.slice(6, 12);
  // 2 front + 4 back, like the battle layout (left team; the right team mirrors it)
  const spots = [
    [400, 150], [430, 300], [230, 80], [250, 200], [90, 140], [110, 270],
  ];
  left.forEach((h, i) => {
    const s = heroSprite(h.id, { facing: 'right' });
    const slot = el('div', 'slot');
    slot.style.left = `${spots[i][0]}px`;
    slot.style.top = `${spots[i][1]}px`;
    slot.style.zIndex = String(spots[i][1]);
    slot.append(s);
    stage.append(slot);
    sprites.push(s);
  });
  right.forEach((h, i) => {
    const s = heroSprite(h.id, { facing: 'left' });
    const slot = el('div', 'slot');
    slot.style.right = `${spots[i][0]}px`;
    slot.style.top = `${spots[i][1]}px`;
    slot.style.zIndex = String(spots[i][1]);
    slot.append(s);
    stage.append(slot);
    sprites.push(s);
  });
  document.body.append(stage);
}

// portrait sheet (?portraits=128 to choose the size)
if (params.has('portraits')) {
  const size = Number(params.get('portraits')) || 112;
  const sheet = el('div');
  sheet.id = 'portraits';
  sheet.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;padding:12px 16px;';
  for (const h of heroes) {
    const frame = el('div', `portrait-frame r${h.rarity}`);
    frame.style.cssText = 'border:3px solid #1d1530;border-radius:14px;overflow:hidden;line-height:0;';
    frame.append(heroPortrait(h.id, { size }));
    sheet.append(frame);
  }
  document.body.append(sheet);
}

const grid = el('div');
grid.id = 'grid';
for (const h of heroes) {
  const card = el('div', `card r${h.rarity}`);
  const spr = heroSprite(h.id);
  spr.classList.add('spr');
  spr.title = 'Tıkla: sıradaki animasyon';
  let next = 1;
  spr.addEventListener('click', () => {
    const anim = ANIMS[next % ANIMS.length];
    next++;
    void setSpriteAnim(spr, anim);
  });
  sprites.push(spr);
  const meta = el('div', 'meta');
  const frame = el('div', 'portrait-frame');
  frame.append(heroPortrait(h.id, { size: 72 }));
  meta.append(frame, el('div', 'name', h.name), el('div', 'sub', `${h.title}`), el('div', 'sub', `${h.faction} · ${h.heroClass} · ${h.rarity} yıldız`));
  card.append(spr, meta);
  grid.append(card);
}
document.body.append(grid);
