// Kahramanlar Salonu: faction tabs down the left side and a power-sorted grid of framed portrait cards;
// tapping a card opens the hero detail.
import { icon } from '../../art';
import { FACTIONS, FACTION_INFO, MAX_HEROES } from '../../core/constants';
import type { Faction } from '../../core/types';
import { getHeroDef } from '../../data/heroes';
import { createBackdrop } from '../backdrop';
import { button, emptyState, heroCard } from '../components';
import { safely, type Screen, type Ui } from '../context';
import { h, mount } from '../dom';
import { factionIcon } from '../format';
import { starUpReadyUids } from '../hints';
import { openFormation } from '../modals/formation';
import { openHeroDetail } from '../modals/heroDetail';

type Filter = Faction | 'all';

/** Card size on this screen and the cards per row it gives in the panel (fixed stage width). */
const CARD_PX = 128;
const GRID_COLS = 7;

export function createHeroesScreen(ui: Ui): Screen {
  const backdrop = createBackdrop();
  const content = h('div', { class: 'screen-content' });
  const el = h('section', { class: 'screen heroes-screen', attrs: { 'aria-label': 'Kahramanlar' } }, backdrop.el, content);
  let filter: Filter = 'all';
  /** Grid scroll position survives re-renders (e.g. after leveling a hero in the detail panel). */
  let scrollTop = 0;

  function tabs(): HTMLElement {
    const tab = (value: Filter): HTMLElement =>
      h(
        'button',
        {
          class: ['faction-tab', filter === value && 'active', value === 'all' && 'all'],
          style: { '--fc': value === 'all' ? null : FACTION_INFO[value].color },
          attrs: {
            type: 'button',
            'aria-pressed': filter === value ? 'true' : 'false',
            'aria-label': value === 'all' ? 'Tümü' : FACTION_INFO[value].name,
            title: value === 'all' ? 'Tümü' : FACTION_INFO[value].name,
          },
          onClick: () => {
            filter = value;
            scrollTop = 0;
            render();
          },
        },
        value === 'all' ? h('span', { class: 'faction-tab-all' }, 'Tümü') : icon(factionIcon(value), 46),
      );
    return h('div', { class: 'faction-tabs', attrs: { role: 'toolbar', 'aria-label': 'Grup filtresi' } }, tab('all'), FACTIONS.map(tab));
  }

  function render(): void {
    const { game } = ui;
    const all = safely(() => game.sortedHeroes(), [...game.state.heroes]);
    const shown = filter === 'all' ? all : all.filter((hero) => getHeroDef(hero.heroId).faction === filter);
    const order = shown.map((hero) => hero.uid);
    const team = new Set(game.state.formation.filter((uid): uid is string => !!uid));
    const ready = safely(() => starUpReadyUids(game.state), new Set<string>());
    const previous = content.querySelector<HTMLElement>('.hero-grid-scroll');
    if (previous) scrollTop = previous.scrollTop;
    backdrop.set('tower');
    // Dim empty slots pad the grid to at least two full rows, so a small roster never floats in a void.
    const padTo = Math.max(GRID_COLS * 2, Math.ceil(shown.length / GRID_COLS) * GRID_COLS);
    const empties = Array.from({ length: Math.max(0, padTo - shown.length) }, () =>
      h('span', { class: 'hcard-empty', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'hcard-empty-frame' }, icon('helmet', 56))),
    );
    const grid =
      shown.length === 0
        ? emptyState('heroicScroll', 'Bu grupta kahramanın yok. Yıldız Sunağı’nda yeni kahramanlar bulabilirsin.')
        : h(
            'div',
            { class: 'hero-grid' },
            shown.map((hero) =>
              heroCard(hero, {
                size: CARD_PX,
                power: safely(() => game.heroPower(hero.uid), 0),
                inFormation: team.has(hero.uid),
                upgradable: ready.has(hero.uid),
                onClick: () => openHeroDetail(ui, hero.uid, order),
              }),
            ),
            empties,
          );
    const scroller = h('div', { class: 'hero-grid-scroll' }, grid);
    mount(
      content,
      tabs(),
      h(
        'div',
        { class: 'panel heroes-panel' },
        h(
          'div',
          { class: 'panel-bar' },
          h('h2', { class: 'panel-title display-title' }, filter === 'all' ? 'Tüm Kahramanlar' : FACTION_INFO[filter].name),
          h('span', { class: 'hero-count-chip count', attrs: { title: 'Kahraman sayısı' } }, icon('helmet', 22), h('b', null, String(all.length)), h('small', null, `/${MAX_HEROES}`)),
          h('span', { class: 'sort-chip', attrs: { title: 'Sıralama' } }, icon('power', 18), 'Güç'),
          button('Takım', () => openFormation(ui), { variant: 'secondary', icon: 'team', class: 'btn-small' }),
          button('Çağır', () => ui.goTo('summon'), { variant: 'primary', icon: 'heroicScroll', class: 'btn-small' }),
        ),
        scroller,
      ),
    );
    scroller.scrollTop = scrollTop;
  }

  return { el, render };
}
