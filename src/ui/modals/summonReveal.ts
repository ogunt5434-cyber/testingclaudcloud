// Summon results: heroes come out of the summoning circle one by one. A single pull rises from the circle as
// a full-body hero; a ×10 pull sends face-down cards flying out of the circle into a 5x2 grid where they
// flip. 4-star heroes glow purple, 5-star heroes get a golden charge, rays and a flash.
import { heroSprite, icon } from '../../art';
import { CLASS_INFO, FACTION_INFO } from '../../core/constants';
import type { HeroInstance, Resources } from '../../core/types';
import { getHeroDef } from '../../data/heroes';
import { button, costView, factionBadge, portrait, starRow } from '../components';
import type { Ui } from '../context';
import { h, mount, prefersReducedMotion } from '../dom';
import { hyphenateTr, rarityColor } from '../format';
import { openModal } from '../overlay';
import { summonCircle } from '../summonCircle';
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
/** Cards leave the circle this long before they flip. */
const FLY_MS = 320;

/** Grid geometry on the stage (5 columns x 2 rows) and the circle centre the cards fly out of. */
const CARD_W = 148;
const CARD_H = 192;
const GAP = 20;
const GRID_TOP = 96;
const CIRCLE_CENTER = { x: 640, y: 616 };

function cardSlot(i: number, count: number): { x: number; y: number } {
  const cols = Math.min(5, count);
  const row = Math.floor(i / 5);
  const col = i % 5;
  const width = cols * CARD_W + (cols - 1) * GAP;
  return { x: (1280 - width) / 2 + col * (CARD_W + GAP), y: GRID_TOP + row * (CARD_H + GAP) };
}

function revealCard(hero: HeroInstance, isNew: boolean, index: number, count: number): HTMLElement {
  const def = getHeroDef(hero.heroId);
  const { x, y } = cardSlot(index, count);
  return h(
    'button',
    {
      class: ['rcard', `r${hero.stars}`],
      style: {
        left: `${x}px`,
        top: `${y}px`,
        '--rc': rarityColor(hero.stars),
        '--fc': FACTION_INFO[def.faction].color,
        '--fx': `${CIRCLE_CENTER.x - (x + CARD_W / 2)}px`,
        '--fy': `${CIRCLE_CENTER.y - (y + CARD_H / 2)}px`,
      },
      attrs: { type: 'button', 'aria-label': `${def.name}, ${hero.stars} yıldız` },
    },
    h(
      'span',
      { class: 'rcard-inner' },
      h('span', { class: 'rcard-back' }, h('span', { class: 'rcard-back-ring', attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'rcard-emblem' }, icon('star', 46))),
      h(
        'span',
        { class: 'rcard-front' },
        h('span', { class: 'rcard-halo', attrs: { 'aria-hidden': 'true' } }),
        portrait(hero.heroId, 128, 'rcard-portrait'),
        factionBadge(def.faction, 24, 'rcard-faction'),
        starRow(hero.stars, 'rcard-stars', 18),
        h('span', { class: 'rcard-name' }, hyphenateTr(def.name)),
        isNew ? h('span', { class: 'new-tag' }, 'YENİ') : null,
      ),
    ),
  );
}

/** Single pull: the hero itself rises from the circle. */
function revealHero(hero: HeroInstance, isNew: boolean): HTMLElement {
  const def = getHeroDef(hero.heroId);
  let sprite: HTMLElement | null = null;
  try {
    sprite = heroSprite(hero.heroId);
  } catch {
    sprite = null;
  }
  return h(
    'button',
    {
      class: ['rhero', `r${hero.stars}`],
      style: { '--rc': rarityColor(hero.stars), '--fc': FACTION_INFO[def.faction].color },
      attrs: { type: 'button', 'aria-label': `${def.name}, ${hero.stars} yıldız` },
    },
    h('span', { class: 'rhero-orb', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'rhero-rays', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'rhero-sprite' }, sprite ?? portrait(hero.heroId, 'xl')),
    h(
      'span',
      { class: 'rhero-info' },
      starRow(hero.stars, 'rhero-stars', 30),
      h('span', { class: 'rhero-name display-title' }, def.name),
      h('span', { class: 'rhero-title' }, factionBadge(def.faction, 24), `${def.title} · ${CLASS_INFO[def.heroClass].name}`),
      isNew ? h('span', { class: 'new-tag' }, 'YENİ') : null,
    ),
  );
}

export function openSummonReveal(ui: Ui, opts: RevealOptions): void {
  const timers = new Timers();
  const single = opts.heroes.length === 1;
  const hasLegend = opts.heroes.some((hero) => hero.stars >= 5);
  const uids = opts.heroes.map((hero) => hero.uid);
  const seen = new Set(opts.ownedBefore);
  const cards = opts.heroes.map((hero, i) => {
    const isNew = !seen.has(hero.heroId);
    seen.add(hero.heroId);
    return single ? revealHero(hero, isNew) : revealCard(hero, isNew, i, opts.heroes.length);
  });
  let revealed = 0;

  // The pull is already paid for: the reveal cannot be dismissed until every card is face up. Until then
  // any tap (backdrop, panel, hint, grid) flips the remaining cards.
  const modal = openModal({ title: 'Çağrı Sonuçları', className: ['full reveal-panel', single ? 'single' : 'multi'].join(' '), dismissible: false, onClose: () => timers.clear() });
  modal.root.addEventListener('click', () => {
    if (revealed < cards.length) revealAll();
  });
  const flash = h('div', { class: ['reveal-flash', hasLegend && 'legendary'], attrs: { 'aria-hidden': 'true' } });
  const circle = summonCircle('reveal-circle');
  const grid = h('div', { class: ['reveal-field', single && 'single'] }, cards);
  modal.setContent(h('div', { class: 'reveal-sky', attrs: { 'aria-hidden': 'true' } }), circle, grid, flash, h('p', { class: 'reveal-hint' }, 'Hepsini açmak için dokun'));

  cards.forEach((card, i) =>
    card.addEventListener('click', (ev) => {
      if (!card.classList.contains('flipped')) return;
      ev.stopPropagation();
      openHeroDetail(ui, uids[i], uids);
    }),
  );

  /** A light beam from the circle to a card as it lands. */
  function beam(i: number): void {
    if (single || prefersReducedMotion()) return;
    const { x, y } = cardSlot(i, cards.length);
    const tx = x + CARD_W / 2;
    const ty = y + CARD_H / 2;
    const dx = tx - CIRCLE_CENTER.x;
    const dy = ty - CIRCLE_CENTER.y;
    const len = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const el = h('span', {
      class: ['reveal-beam', `r${opts.heroes[i]?.stars ?? 3}`],
      style: { left: `${CIRCLE_CENTER.x}px`, top: `${CIRCLE_CENTER.y}px`, width: `${len.toFixed(0)}px`, transform: `rotate(${angle.toFixed(1)}deg)` },
      attrs: { 'aria-hidden': 'true' },
    });
    grid.append(el);
    timers.after(520, () => el.remove());
  }

  /** 4 and 5 star pulls: a rarity-coloured light pillar behind the card and a particle burst on it. */
  function fanfare(card: HTMLElement, i: number): void {
    if (prefersReducedMotion()) return;
    const sparks = Array.from({ length: 10 }, (_, k) => h('i', { style: { '--a': `${k * 36}deg`, '--d': `${70 + (k % 3) * 22}px` } }));
    const slot = single ? { x: 640 - CARD_W / 2, y: 120 } : cardSlot(i, cards.length);
    const pillar = h('span', {
      class: ['rcard-pillar', card.classList.contains('r5') ? 'r5' : 'r4'],
      style: { left: `${slot.x + CARD_W / 2}px`, top: `${slot.y + CARD_H * 0.75}px`, '--rc': card.style.getPropertyValue('--rc') },
      attrs: { 'aria-hidden': 'true' },
    });
    const burst = h('span', { class: 'rcard-burst', attrs: { 'aria-hidden': 'true' } }, sparks);
    grid.prepend(pillar);
    card.append(burst);
    timers.after(1400, () => {
      pillar.remove();
      burst.remove();
    });
  }

  function flip(i: number): void {
    const card = cards[i];
    if (!card || card.classList.contains('flipped')) return;
    card.classList.add('out', 'flipped');
    card.classList.remove('charging');
    circle.classList.remove('pulse');
    void circle.offsetWidth;
    circle.classList.add('pulse');
    if (card.classList.contains('r4') || card.classList.contains('r5')) fanfare(card, i);
    if (card.classList.contains('r5')) {
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');
      if (!prefersReducedMotion()) {
        modal.body.classList.remove('shake');
        void modal.body.offsetWidth;
        modal.body.classList.add('shake');
        timers.after(450, () => modal.body.classList.remove('shake'));
      }
    }
    revealed++;
    if (revealed === cards.length) finished();
  }

  function revealAll(): void {
    timers.clear();
    cards.forEach((_, i) => flip(i));
  }

  function finished(): void {
    circle.classList.remove('busy');
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
            { variant: 'secondary', disabled: !enabled, sub: againCost ? costView(againCost, ui.game.state.resources) : null },
          )
        : null,
      button('Tamam', () => modal.close(), { variant: 'primary', disabled: !enabled, class: 'btn-big' }),
    );
  }

  renderFooter(false);
  const reduced = prefersReducedMotion();
  const start = hasLegend && !reduced ? LEGENDARY_SUSPENSE_MS : 0;
  if (hasLegend && !reduced) circle.classList.add('legend');
  // The circle spins up while it is giving out heroes.
  circle.classList.add('busy');
  cards.forEach((card, i) => {
    const at = start + FIRST_FLIP_MS + i * (reduced ? 40 : FLIP_STEP_MS);
    if (!reduced)
      timers.after(Math.max(0, at - FLY_MS), () => {
        card.classList.add('out');
        beam(i);
      });
    if (card.classList.contains('r5') && !reduced) timers.after(at - 260, () => card.classList.add('charging'));
    timers.after(at, () => flip(i));
  });
}
