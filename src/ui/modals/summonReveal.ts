// Summon results: face-down cards flip in one by one; 4★ glow purple, 5★ get a golden flash and halo.
import { CLASS_INFO, FACTION_INFO } from '../../core/constants';
import type { HeroInstance, Resources } from '../../core/types';
import { getHeroDef } from '../../data/heroes';
import { button, costView, portrait, starRow } from '../components';
import type { Ui } from '../context';
import { h, mount, prefersReducedMotion } from '../dom';
import { hyphenateTr, rarityColor } from '../format';
import { openModal } from '../overlay';
import { Timers } from '../timers';
import { openHeroDetail } from './heroDetail';

export interface RevealOptions {
  heroes: HeroInstance[];
  /** Hero ids owned before the summon (to mark new ones). */
  ownedBefore: ReadonlySet<string>;
  again?: () => void;
  againLabel?: string;
  againCost?: () => Partial<Resources>;
}

const FIRST_FLIP_MS = 420;
const FLIP_STEP_MS = 190;
const LEGENDARY_SUSPENSE_MS = 650;

function revealCard(hero: HeroInstance, isNew: boolean, big: boolean): HTMLElement {
  const def = getHeroDef(hero.heroId);
  return h(
    'button',
    {
      class: ['scard', `r${hero.stars}`, big && 'big'],
      style: { '--rc': rarityColor(hero.stars), '--fc': FACTION_INFO[def.faction].color },
      attrs: { type: 'button', 'aria-label': `${def.name}, ${hero.stars} yıldız` },
    },
    h(
      'div',
      { class: 'scard-inner' },
      h('div', { class: 'scard-back' }, h('span', { class: 'scard-emblem' }, '✦')),
      h(
        'div',
        { class: 'scard-front' },
        h('div', { class: 'scard-halo', attrs: { 'aria-hidden': 'true' } }),
        portrait(hero.heroId, big ? 'xl' : 'sm'),
        starRow(hero.stars, 'scard-stars'),
        h('span', { class: 'scard-name' }, big ? def.name : hyphenateTr(def.name)),
        big ? h('span', { class: 'scard-title' }, `${FACTION_INFO[def.faction].icon} ${def.title} · ${CLASS_INFO[def.heroClass].name}`) : null,
        isNew ? h('span', { class: 'scard-new' }, 'YENİ') : null,
      ),
    ),
  );
}

export function openSummonReveal(ui: Ui, opts: RevealOptions): void {
  const timers = new Timers();
  const single = opts.heroes.length === 1;
  const hasLegend = opts.heroes.some((hero) => hero.stars >= 5);
  const uids = opts.heroes.map((hero) => hero.uid);
  const seen = new Set(opts.ownedBefore);
  const cards = opts.heroes.map((hero) => {
    const isNew = !seen.has(hero.heroId);
    seen.add(hero.heroId);
    return revealCard(hero, isNew, single);
  });
  let revealed = 0;

  // The pull is already paid for: the reveal cannot be dismissed until every card is face up. Until then
  // any tap (backdrop, panel, hint, grid) flips the remaining cards.
  const modal = openModal({ title: 'Çağrı Sonuçları', className: 'reveal-panel', dismissible: false, onClose: () => timers.clear() });
  modal.root.addEventListener('click', () => {
    if (revealed < cards.length) revealAll();
  });
  const grid = h('div', { class: ['reveal-grid', single && 'single'] }, cards);
  const flash = h('div', { class: ['reveal-flash', hasLegend && 'legendary'], attrs: { 'aria-hidden': 'true' } });
  modal.setContent(h('div', { class: 'reveal-stage' }, flash, grid), h('p', { class: 'hint reveal-hint' }, 'Hepsini açmak için dokun'));

  cards.forEach((card, i) =>
    card.addEventListener('click', (ev) => {
      if (!card.classList.contains('flipped')) return;
      ev.stopPropagation();
      openHeroDetail(ui, uids[i], uids);
    }),
  );

  function flip(i: number): void {
    const card = cards[i];
    if (!card || card.classList.contains('flipped')) return;
    card.classList.add('flipped');
    revealed++;
    if (revealed === cards.length) finished();
  }

  function revealAll(): void {
    timers.clear();
    cards.forEach((_, i) => flip(i));
  }

  function finished(): void {
    modal.body.querySelector('.reveal-hint')?.remove();
    modal.setDismissible(true);
    renderFooter(true);
  }

  function renderFooter(enabled: boolean): void {
    const againCost = opts.againCost?.();
    mount(
      modal.footer,
      opts.again
        ? button(
            opts.againLabel ?? 'Tekrar',
            () => {
              modal.close();
              opts.again?.();
            },
            { disabled: !enabled, sub: againCost ? costView(againCost, ui.game.state.resources) : null },
          )
        : null,
      button('Tamam', () => modal.close(), { variant: 'primary', disabled: !enabled }),
    );
  }

  renderFooter(false);
  const reduced = prefersReducedMotion();
  const start = hasLegend && !reduced ? LEGENDARY_SUSPENSE_MS : 0;
  cards.forEach((card, i) => {
    const at = start + FIRST_FLIP_MS + i * (reduced ? 40 : FLIP_STEP_MS);
    if (card.classList.contains('r5') && !reduced) timers.after(at - 260, () => card.classList.add('charging'));
    timers.after(at, () => flip(i));
  });
}
