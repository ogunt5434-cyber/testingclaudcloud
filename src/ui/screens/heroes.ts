// Kahramanlar: faction filter chips and a power-sorted grid of hero cards; tap opens the detail sheet.
import { FACTIONS, FACTION_INFO, MAX_HEROES } from '../../core/constants';
import type { Faction } from '../../core/types';
import { getHeroDef } from '../../data/heroes';
import { button, emptyState, heroCard } from '../components';
import { safely, type Screen, type Ui } from '../context';
import { h, mount } from '../dom';
import { openFormation } from '../modals/formation';
import { openHeroDetail } from '../modals/heroDetail';

type Filter = Faction | 'all';

export function createHeroesScreen(ui: Ui): Screen {
  const el = h('section', { class: 'screen heroes-screen' });
  let filter: Filter = 'all';

  function chips(): HTMLElement {
    const chip = (value: Filter, label: string, color?: string): HTMLElement =>
      h(
        'button',
        {
          class: ['filter-chip', filter === value && 'active'],
          style: { '--fc': color ?? null },
          attrs: { type: 'button', 'aria-pressed': filter === value ? 'true' : 'false', title: value === 'all' ? 'Tümü' : FACTION_INFO[value].name },
          onClick: () => {
            filter = value;
            render();
          },
        },
        label,
      );
    return h(
      'div',
      { class: 'filter-row', attrs: { role: 'toolbar', 'aria-label': 'Grup filtresi' } },
      chip('all', 'Tümü'),
      FACTIONS.map((f) => chip(f, FACTION_INFO[f].icon, FACTION_INFO[f].color)),
    );
  }

  function render(): void {
    const { game } = ui;
    const all = safely(() => game.sortedHeroes(), [...game.state.heroes]);
    const shown = filter === 'all' ? all : all.filter((hero) => getHeroDef(hero.heroId).faction === filter);
    const order = shown.map((hero) => hero.uid);
    const team = new Set(game.state.formation.filter((uid): uid is string => !!uid));
    mount(
      el,
      h(
        'div',
        { class: 'screen-head' },
        h('h1', { class: 'screen-title' }, 'Kahramanlar', h('span', { class: 'count' }, `${all.length}/${MAX_HEROES}`)),
        button('👥 Takım', () => openFormation(ui), { variant: 'secondary', class: 'btn-small' }),
      ),
      chips(),
      h('p', { class: 'sort-note' }, filter === 'all' ? 'Güce göre sıralı' : `${FACTION_INFO[filter].name} · güce göre sıralı`),
      shown.length === 0
        ? emptyState('🔍', 'Bu grupta kahramanın yok. Çağır sekmesinden yeni kahramanlar bulabilirsin.')
        : h(
            'div',
            { class: 'hero-grid' },
            shown.map((hero) =>
              heroCard(hero, {
                power: safely(() => game.heroPower(hero.uid), 0),
                inFormation: team.has(hero.uid),
                onClick: () => openHeroDetail(ui, hero.uid, order),
              }),
            ),
          ),
    );
  }

  return { el, render };
}
