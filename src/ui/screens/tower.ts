// Kule: current floor in a stacked tower visual, power comparison, first-clear rewards and "Savaş".
import { towerEnemies, towerPower, towerRewards } from '../../core/tower';
import type { BattleUnitSetup } from '../../core/types';
import { button, portrait, powerCompare, rewardList, sectionTitle } from '../components';
import { safely, type Screen, type Ui } from '../context';
import { h, mount } from '../dom';
import { fightTower } from '../flows';
import { openFormation } from '../modals/formation';

const BONUS_EVERY = 5;

function floorBlock(floor: number, current: number): HTMLElement {
  const state = floor < current ? 'done' : floor === current ? 'current' : 'locked';
  const bonus = floor % BONUS_EVERY === 0;
  const icon = state === 'done' ? '✔' : state === 'current' ? '⚔️' : bonus ? '🎁' : '🔒';
  return h(
    'div',
    { class: ['floor', state, bonus && 'bonus'] },
    h('span', { class: 'floor-num' }, `Kat ${floor}`),
    h('span', { class: 'floor-icon' }, icon),
  );
}

function towerVisual(current: number): HTMLElement {
  const floors = [current + 2, current + 1, current, current - 1].filter((f) => f >= 1);
  return h(
    'div',
    { class: 'tower-vis' },
    h('div', { class: 'tower-top', attrs: { 'aria-hidden': 'true' } }, '🏯'),
    floors.map((f) => floorBlock(f, current)),
    h('div', { class: 'tower-base', attrs: { 'aria-hidden': 'true' } }),
  );
}

function enemyRow(enemies: (BattleUnitSetup | null)[]): HTMLElement {
  return h(
    'div',
    { class: 'lineup' },
    enemies.filter((e): e is BattleUnitSetup => e !== null).map((u) => h('div', { class: 'lineup-unit' }, portrait(u.heroId, 'xs'), h('span', { class: 'lineup-lv' }, `Sv.${u.level}`))),
  );
}

export function createTowerScreen(ui: Ui): Screen {
  const el = h('section', { class: 'screen tower-screen' });
  return {
    el,
    render(): void {
      const { game } = ui;
      const floor = game.state.tower.cleared + 1;
      const bonus = floor % BONUS_EVERY === 0;
      mount(
        el,
        h(
          'div',
          { class: 'tower-hero' },
          h('div', { class: 'tower-heading' }, h('span', { class: 'scene-chapter' }, 'Yankı Kulesi'), h('h1', { class: 'tower-floor' }, `Kat ${floor}`), h('p', { class: 'muted' }, `En yüksek: Kat ${game.state.tower.cleared}`)),
          towerVisual(floor),
        ),
        h(
          'div',
          { class: ['card tower-card', bonus && 'boss'] },
          h('div', { class: 'stage-head' }, h('div', null, h('div', { class: 'stage-kicker' }, bonus ? `🎁 Bonus · Kat ${floor}` : `Kat ${floor}`), h('div', { class: 'stage-label' }, 'Muhafızlar')), enemyRow(safely(() => towerEnemies(floor), []))),
          powerCompare(safely(() => game.teamPower(), 0), safely(() => towerPower(floor), 0), 'Kule'),
          sectionTitle(bonus ? 'Bonus Ödül' : 'İlk Geçiş Ödülü'),
          rewardList(safely(() => towerRewards(floor), null)),
          h(
            'div',
            { class: 'btn-row' },
            button('👥 Takım', () => openFormation(ui)),
            button('⚔️ Savaş', () => fightTower(ui), { variant: 'primary', class: 'btn-grow btn-fight' }),
          ),
        ),
      );
    },
  };
}
