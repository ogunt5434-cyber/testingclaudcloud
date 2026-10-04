// Chibi hero sprites & portraits: original characters composed procedurally as inline SVG
// (see src/art/characters/*). No emoji, no external assets.
import { getHeroDef, isHeroId } from '../data/heroes';
import type { SpriteAnim } from './types';
import { playSpriteAnim, type AttackStyle } from './characters/anim';
import { buildFigure, type Figure } from './characters/build';
import { f } from './characters/geom';
import { FACTION_THEME, lookFor } from './characters/looks';
import type { HeroLook } from './characters/model';
import { UID } from './characters/pen';
import './sprites.css';

export { ANIM_MS } from './characters/anim';
export { FACTION_THEME, LOOK_IDS, lookFor } from './characters/looks';
export type { HeroLook } from './characters/model';

const figures = new Map<string, Figure>();
const looks = new Map<string, HeroLook>();
let instance = 0;

function heroInfo(heroId: string) {
  return isHeroId(heroId) ? getHeroDef(heroId) : undefined;
}

function lookOf(heroId: string): HeroLook {
  let l = looks.get(heroId);
  if (!l) {
    const def = heroInfo(heroId);
    l = lookFor(heroId, def ? { faction: def.faction, heroClass: def.heroClass, rarity: def.rarity } : undefined);
    looks.set(heroId, l);
  }
  return l;
}

function figureOf(heroId: string): Figure {
  let fig = figures.get(heroId);
  if (!fig) {
    fig = buildFigure(lookOf(heroId));
    figures.set(heroId, fig);
  }
  return fig;
}

function attackStyle(heroId: string, look: HeroLook): AttackStyle {
  const cls = heroInfo(heroId)?.heroClass;
  if (cls === 'ranger' || look.pose === 'bow' || look.pose === 'crossbow') return 'shoot';
  if (cls === 'mage' || cls === 'priest') return 'magic';
  return 'melee';
}

function unique(markup: string): string {
  instance = (instance + 1) % 1e9;
  return markup.split(UID).join(`-${instance.toString(36)}`);
}

/**
 * Where the hero's head sits inside the 160x200 sprite box (unflipped px; mirror x for facing 'left').
 * Feet are on y = 192. Useful for HP bars / floating numbers above the head and VFX targets.
 */
export function heroSpriteMetrics(heroId: string): { headTop: number; headCenter: [number, number]; feetY: number; body: HeroLook['body'] } {
  const fig = figureOf(heroId);
  return { headTop: fig.headTop, headCenter: fig.headCenter, feetY: 192, body: lookOf(heroId).body };
}

/** Full sprite <svg> markup (pure string; used by tests and SSR-like callers). */
export function heroSpriteMarkup(heroId: string, facing: 'left' | 'right' = 'right'): string {
  const fig = figureOf(heroId);
  return (
    `<svg class="hs-svg${facing === 'left' ? ' hs-flip' : ''}" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg" overflow="visible" aria-hidden="true" focusable="false">` +
    `${unique(fig.markup)}</svg>`
  );
}

/** Bust portrait <svg> markup (pure string). */
export function heroPortraitMarkup(heroId: string): string {
  const fig = figureOf(heroId);
  const [x, y, s] = fig.bust;
  return `<svg class="hs-svg" viewBox="${f(x)} ${f(y)} ${f(s)} ${f(s)}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${unique(fig.markup)}</svg>`;
}

/** Full-body chibi battle sprite (design box 160x200, feet at bottom-center). Starts in 'idle'. */
export function heroSprite(heroId: string, opts?: { facing?: 'left' | 'right' }): HTMLElement {
  const facing = opts?.facing ?? 'right';
  const look = lookOf(heroId);
  const el = document.createElement('div');
  el.className = 'hs-sprite';
  el.dataset.hero = heroId;
  el.dataset.anim = 'idle';
  el.dataset.facing = facing;
  el.dataset.body = look.body;
  el.dataset.pose = look.pose;
  el.dataset.attack = attackStyle(heroId, look);
  const fig = figureOf(heroId);
  el.dataset.wangle = String(fig.wAngle);
  if (fig.wFlip) el.dataset.wflip = '1';
  // randomized idle phase so a team does not breathe in lockstep
  el.style.setProperty('--hs-phase', `${-(Math.random() * 3).toFixed(2)}s`);
  el.innerHTML = heroSpriteMarkup(heroId, facing);
  return el;
}

/** Plays an animation on a sprite. One-shot anims resolve when done and return to idle ('die' stays down). */
export function setSpriteAnim(sprite: HTMLElement, anim: SpriteAnim): Promise<void> {
  return playSpriteAnim(sprite, anim);
}

/** Square bust portrait art (no frame — frames are the UI's job). Fills its box; default 96px. */
export function heroPortrait(heroId: string, opts?: { size?: number }): HTMLElement {
  const size = opts?.size ?? 96;
  const def = heroInfo(heroId);
  const theme = FACTION_THEME[def?.faction ?? 'fortress'];
  const el = document.createElement('div');
  el.className = 'hs-portrait';
  el.dataset.hero = heroId;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.setProperty('--hp-a', theme.bg[0]);
  el.style.setProperty('--hp-b', theme.bg[1]);
  el.style.setProperty('--hp-c', theme.bg[2]);
  el.innerHTML = heroPortraitMarkup(heroId);
  return el;
}
