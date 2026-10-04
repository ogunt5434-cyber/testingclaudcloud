// Çağır: basic & heroic summon banners with ×1/×10 costs, rates and heroic pity counter.
import { HEROIC_PITY } from '../../core/constants';
import { canAfford } from '../../core/progression';
import { SUMMON_RATES, summonCostOptions, type SummonType } from '../../core/summon';
import type { Resources } from '../../core/types';
import { heroesByRarity } from '../../data/heroes';
import { button, costView, portrait, progressBar, resourceAmount } from '../components';
import { runAction, safely, type Screen, type Ui } from '../context';
import { h, mount } from '../dom';
import { fmtPercent, fraction, rarityColor } from '../format';
import { openSummonReveal } from '../modals/summonReveal';

interface BannerInfo {
  type: SummonType;
  title: string;
  subtitle: string;
  scroll: keyof Resources;
  featuredRarity: number;
}

const BANNERS: BannerInfo[] = [
  {
    type: 'heroic',
    title: 'Kahraman Çağrısı',
    subtitle: 'Efsanevi 4★ ve 5★ kahramanlar seni bekliyor!',
    scroll: 'heroicScroll',
    featuredRarity: 5,
  },
  {
    type: 'basic',
    title: 'Temel Çağrı',
    subtitle: 'Temel parşömenlerle yeni yoldaşlar bul.',
    scroll: 'basicScroll',
    featuredRarity: 3,
  },
];

/** Three featured heroes that rotate daily. */
function featured(rarity: number, now: number): string[] {
  const pool = heroesByRarity(rarity);
  if (pool.length === 0) return [];
  const day = Math.floor(now / 86_400_000);
  return [0, 1, 2].map((i) => pool[(day + i * 5) % pool.length].id).filter((id, i, arr) => arr.indexOf(id) === i);
}

/** The cost the store will charge: the first affordable option, else the first option (shown in red). */
export function displayCost(ui: Ui, type: SummonType, count: 1 | 10): Partial<Resources> {
  const options = safely(() => summonCostOptions(type, count), [] as Partial<Resources>[]);
  return options.find((cost) => safely(() => canAfford(ui.game.state, cost), false)) ?? options[0] ?? {};
}

export function doSummon(ui: Ui, type: SummonType, count: 1 | 10): void {
  const ownedBefore = new Set(ui.game.state.heroes.map((hero) => hero.heroId));
  const res = runAction(ui, () => ui.game.summon(type, count));
  if (!res) return;
  openSummonReveal(ui, { heroes: res.value, ownedBefore, again: () => doSummon(ui, type, count), againLabel: `Tekrar ×${count}`, againCost: () => displayCost(ui, type, count) });
}

function ratesTable(type: SummonType): HTMLElement {
  const rates = Object.entries(SUMMON_RATES[type])
    .map(([stars, p]) => [Number(stars), p] as const)
    .sort((a, b) => b[0] - a[0]);
  return h(
    'div',
    { class: 'rates' },
    rates.map(([stars, p]) =>
      h('div', { class: 'rate', style: { '--sc': rarityColor(stars) } }, h('span', { class: 'rate-stars' }, `${stars}★`), h('span', { class: 'rate-p' }, fmtPercent(p, 2))),
    ),
  );
}

function bannerCard(ui: Ui, info: BannerInfo): HTMLElement {
  const { game } = ui;
  const res = game.state.resources;
  const pullsLeft = Math.max(0, HEROIC_PITY - game.state.summon.heroicPity);
  const summonButton = (count: 1 | 10): HTMLElement =>
    button(`Çağır ×${count}`, () => doSummon(ui, info.type, count), {
      variant: info.type === 'heroic' ? 'gold' : 'primary',
      sub: costView(displayCost(ui, info.type, count), res),
      class: 'btn-grow',
    });

  return h(
    'div',
    { class: ['banner', `banner-${info.type}`] },
    h(
      'div',
      { class: 'banner-art', attrs: { 'aria-hidden': 'true' } },
      h('div', { class: 'portal' }),
      h('div', { class: 'banner-featured' }, featured(info.featuredRarity, game.now()).map((id) => portrait(id, 'md', 'featured'))),
    ),
    h(
      'div',
      { class: 'banner-body' },
      h('h2', { class: 'banner-title' }, info.title),
      h('p', { class: 'banner-sub' }, info.subtitle),
      ratesTable(info.type),
      info.type === 'heroic'
        ? h(
            'div',
            { class: 'pity' },
            h('div', { class: 'pity-text' }, '5★ garantisine ', h('strong', null, String(pullsLeft)), ' çağrı'),
            progressBar(fraction(game.state.summon.heroicPity, HEROIC_PITY), 'pity-bar'),
          )
        : null,
      h('div', { class: 'banner-owned' }, 'Sahip olunan: ', resourceAmount(info.scroll, res[info.scroll]), info.type === 'heroic' ? resourceAmount('gems', res.gems) : null),
      h('div', { class: 'btn-row' }, summonButton(1), summonButton(10)),
    ),
  );
}

export function createSummonScreen(ui: Ui): Screen {
  const el = h('section', { class: 'screen summon-screen' });
  return {
    el,
    render(): void {
      mount(
        el,
        h('div', { class: 'screen-head' }, h('h1', { class: 'screen-title' }, 'Çağrı Sunağı', h('span', { class: 'count' }, `Toplam çağrı: ${ui.game.state.summon.totalPulls}`))),
        BANNERS.map((info) => bannerCard(ui, info)),
      );
    },
  };
}
