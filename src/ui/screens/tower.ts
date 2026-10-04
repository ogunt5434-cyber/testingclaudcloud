// Kadim Kule: a stone tower illustration with the current floor lit up, and the floor's panel (guardians,
// power comparison, first-clear / bonus rewards, "Savaş" -> formation confirm).
import { icon } from '../../art';
import { TOWER_BONUS_EVERY, towerEnemies, towerPower, towerRewards } from '../../core/tower';
import { createBackdrop } from '../backdrop';
import { button, lineup, powerCompare, rewardList, sectionTitle } from '../components';
import { safely, type Screen, type Ui } from '../context';
import { h, mount } from '../dom';
import { prepareTowerFight } from '../flows';
import { openFormation } from '../modals/formation';

/** Header line under the floor number (no "Kat 0" on a fresh save). */
export function towerBestText(cleared: number): string {
  return cleared > 0 ? `En yüksek: Kat ${cleared}` : 'Henüz kat geçilmedi';
}

const SPIRE_SVG =
  `<svg viewBox="0 0 320 190" aria-hidden="true">` +
  `<defs><linearGradient id="tw-roof" x1="0" x2="1"><stop offset="0" stop-color="#5b3fb0"/><stop offset=".45" stop-color="#8e6cf0"/><stop offset="1" stop-color="#3d2780"/></linearGradient>` +
  `<radialGradient id="tw-gem" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#9ff3ff"/><stop offset="1" stop-color="#2a8fd6"/></radialGradient></defs>` +
  `<path d="M160 18 L272 176 H48 Z" fill="url(#tw-roof)" stroke="#1b1236" stroke-width="6" stroke-linejoin="round"/>` +
  `<path d="M160 18 L196 176 M160 18 L124 176 M160 18 L232 176 M160 18 L88 176" stroke="#2c1c5c" stroke-width="3" opacity=".55"/>` +
  `<path d="M70 150 Q160 132 250 150" fill="none" stroke="#2c1c5c" stroke-width="3" opacity=".5"/>` +
  `<path d="M98 112 Q160 98 222 112" fill="none" stroke="#2c1c5c" stroke-width="3" opacity=".45"/>` +
  `<rect x="36" y="168" width="248" height="20" rx="6" fill="#c9a24a" stroke="#1b1236" stroke-width="5"/>` +
  `<path d="M160 -4 L176 22 L160 44 L144 22 Z" fill="url(#tw-gem)" stroke="#123056" stroke-width="4" stroke-linejoin="round"/>` +
  `</svg>`;

function floorBlock(floor: number, current: number): HTMLElement {
  const state = floor < current ? 'done' : floor === current ? 'current' : 'locked';
  const bonus = floor % TOWER_BONUS_EVERY === 0;
  const glyph = state === 'done' ? 'star' : state === 'current' ? 'swords' : bonus ? 'chest' : 'lock';
  return h(
    'div',
    { class: ['tower-floor', state, bonus && 'bonus'], attrs: { role: 'img', 'aria-label': `Kat ${floor}${state === 'done' ? ', geçildi' : state === 'current' ? ', sıradaki' : ''}${bonus ? ', bonus' : ''}` } },
    h('span', { class: 'tf-window left' }),
    h('span', { class: 'tf-door' }, icon(glyph, state === 'current' ? 44 : 30)),
    h('span', { class: 'tf-window right' }),
    h('span', { class: 'tf-plaque' }, `Kat ${floor}`),
  );
}

function towerArt(current: number): HTMLElement {
  const floors = [current + 2, current + 1, current, current - 1].filter((f) => f >= 1);
  const spire = h('div', { class: 'tower-spire' });
  spire.innerHTML = SPIRE_SVG;
  return h('div', { class: 'tower-art', attrs: { 'aria-label': 'Kule katları' } }, spire, h('div', { class: 'tower-body' }, floors.map((f) => floorBlock(f, current))), h('div', { class: 'tower-base', attrs: { 'aria-hidden': 'true' } }), h('div', { class: 'tower-mist', attrs: { 'aria-hidden': 'true' } }));
}

export function createTowerScreen(ui: Ui): Screen {
  const backdrop = createBackdrop();
  const content = h('div', { class: 'screen-content' });
  const el = h('section', { class: 'screen tower-screen', attrs: { 'aria-label': 'Kadim Kule' } }, backdrop.el, content);
  return {
    el,
    render(): void {
      const { game } = ui;
      const floor = game.state.tower.cleared + 1;
      const bonus = floor % TOWER_BONUS_EVERY === 0;
      const nextBonus = Math.ceil(floor / TOWER_BONUS_EVERY) * TOWER_BONUS_EVERY;
      backdrop.set('tower');
      mount(
        content,
        towerArt(floor),
        h(
          'div',
          { class: ['panel side-panel tower-panel', bonus && 'boss'] },
          h(
            'div',
            { class: 'panel-head' },
            h('span', { class: 'panel-kicker' }, bonus ? 'Bonus Kat' : 'Kadim Kule'),
            h('h2', { class: 'panel-title display-title' }, `Kat ${floor}`),
            h('span', { class: 'panel-note' }, towerBestText(game.state.tower.cleared)),
          ),
          sectionTitle('Muhafızlar'),
          lineup(safely(() => towerEnemies(floor), []), 'sm'),
          powerCompare(safely(() => game.teamPower(), 0), safely(() => towerPower(floor), 0), 'Kule'),
          sectionTitle(bonus ? 'Bonus Ödül' : 'İlk Geçiş Ödülü'),
          rewardList(safely(() => towerRewards(floor), null)),
          bonus ? null : sectionTitle(`Sonraki Bonus · Kat ${nextBonus}`),
          bonus ? null : h('div', { class: 'next-bonus' }, icon('chest', 56), rewardList(safely(() => towerRewards(nextBonus), null))),
          h(
            'div',
            { class: 'btn-row panel-actions' },
            button('Takım', () => openFormation(ui), { variant: 'secondary', icon: 'team' }),
            button('Savaş', () => prepareTowerFight(ui), { variant: 'primary', class: 'btn-grow btn-fight', icon: 'swords', sub: `Kat ${floor}` }),
          ),
        ),
      );
    },
  };
}
