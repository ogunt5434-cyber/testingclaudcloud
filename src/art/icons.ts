// SVG icon set: original glossy cartoon icons (see src/art/env/iconArt.ts for the drawings).
import type { Faction } from '../core/types';
import type { IconName } from './types';
import { FACTION_ICON, iconMarkup } from './env/iconArt';
import { nextUid } from './env/kit';
import './env.css';

/** Parses standalone SVG markup into a live SVG element (HTML <template> parses SVG in the right namespace). */
export function svgFromMarkup(markup: string): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  const el = tpl.content.firstElementChild;
  if (!(el instanceof SVGSVGElement)) throw new Error('svgFromMarkup: markup is not an <svg>');
  return el;
}

/** Inline SVG icon, default 24px. Decorative (aria-hidden); label the surrounding control instead. */
export function icon(name: IconName, size = 24): SVGSVGElement {
  return svgFromMarkup(iconMarkup(name, size, nextUid('aei')));
}

export function factionIconName(f: Faction): IconName {
  return FACTION_ICON[f];
}
