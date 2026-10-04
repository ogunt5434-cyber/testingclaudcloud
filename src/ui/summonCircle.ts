// The summoning circle drawing (original art in code): rune rings, a hexagram and glowing nodes, with a
// light beam and rising sparks. Used by the summon screen and the summon reveal.
import { h } from './dom';

/** The summoning circle drawing (original): rune rings, a star and glowing nodes. */
export function summonCircle(extraClass?: string): HTMLElement {
  const runes = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const x = 200 + Math.cos(a) * 166;
    const y = 200 + Math.sin(a) * 166;
    const r = (a * 180) / Math.PI + 90;
    return `<path d="M-5 -7 L0 7 L5 -7 M-4 0 H4" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r.toFixed(1)})"/>`;
  }).join('');
  const star = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return `${(200 + Math.cos(a) * 128).toFixed(1)},${(200 + Math.sin(a) * 128).toFixed(1)}`;
  });
  const tri1 = [star[0], star[2], star[4]].join(' ');
  const tri2 = [star[1], star[3], star[5]].join(' ');
  const nodes = star.map((p) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="9"/>`).join('');
  const el = h('div', { class: ['summon-circle', extraClass], attrs: { 'aria-hidden': 'true' } });
  el.innerHTML =
    `<div class="sc-glow"></div>` +
    `<div class="sc-disc"><svg class="sc-svg sc-outer" viewBox="0 0 400 400"><circle class="sc-ring thick" cx="200" cy="200" r="190"/><circle class="sc-ring" cx="200" cy="200" r="178"/><circle class="sc-ring" cx="200" cy="200" r="152"/><g class="sc-runes">${runes}</g></svg>` +
    `<svg class="sc-svg sc-inner" viewBox="0 0 400 400"><polygon class="sc-star" points="${tri1}"/><polygon class="sc-star" points="${tri2}"/><circle class="sc-ring" cx="200" cy="200" r="128"/><circle class="sc-ring thin" cx="200" cy="200" r="64"/><g class="sc-nodes">${nodes}</g></svg></div>` +
    `<div class="sc-beam"></div><div class="sc-sparks"><i></i><i></i><i></i><i></i><i></i><i></i></div>`;
  return el;
}

