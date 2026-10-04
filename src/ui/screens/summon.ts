// Yıldız Sunağı: glowing summoning circle between the Gezgin and Destan banners (×1 / ×10 with costs,
// rates, heroic pity counter). Results are revealed from the circle (modals/summonReveal.ts).
import { heroSprite, icon } from '../../art';
import { HEROIC_PITY } from '../../core/constants';
import { canAfford } from '../../core/progression';
import { SUMMON_RATES, summonCostOptions, type SummonType } from '../../core/summon';
import type { Resources } from '../../core/types';
import { heroesByRarity } from '../../data/heroes';
import { createBackdrop } from '../backdrop';
import { button, costView, portrait, progressBar, resourceAmount, ribbon, sectionTitle } from '../components';
import { runAction, safely, type Screen, type Ui } from '../context';
import { h, mount } from '../dom';
import { fmtPercent, fraction, rarityColor } from '../format';
import { openSummonReveal } from '../modals/summonReveal';
import { summonCircle } from '../summonCircle';

interface BannerInfo {
  type: SummonType;
  title: string;
  subtitle: string;
  scroll: keyof Resources;
  featuredRarity: number;
}

const BANNERS: Record<SummonType, BannerInfo> = {
  basic: {
    type: 'basic',
    title: 'Gezgin Çağrısı',
    subtitle: 'Temel parşömenlerle yeni yoldaşlar bul.',
    scroll: 'basicScroll',
    featuredRarity: 3,
  },
  heroic: {
    type: 'heroic',
    title: 'Destan Çağrısı',
    subtitle: 'Efsanevi 4 ve 5 yıldızlı kahramanlar seni bekliyor!',
    scroll: 'heroicScroll',
    featuredRarity: 5,
  },
};

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
      h(
        'div',
        { class: 'rate', style: { '--sc': rarityColor(stars) } },
        h('span', { class: 'rate-stars' }, String(stars), icon('star', 16)),
        h('span', { class: 'rate-p' }, fmtPercent(p, 2)),
      ),
    ),
  );
}

function bannerPanel(ui: Ui, info: BannerInfo): HTMLElement {
  const { game } = ui;
  const res = game.state.resources;
  const pullsLeft = Math.max(0, HEROIC_PITY - game.state.summon.heroicPity);
  const summonButton = (count: 1 | 10): HTMLElement =>
    button(`Çağır ×${count}`, () => doSummon(ui, info.type, count), {
      variant: info.type === 'heroic' ? 'primary' : 'secondary',
      sub: costView(displayCost(ui, info.type, count), res),
      class: 'btn-grow',
    });

  return h(
    'div',
    { class: ['panel side-panel banner', `banner-${info.type}`] },
    ribbon(info.title, info.type === 'heroic' ? 'red' : 'blue', 'banner-ribbon'),
    h('p', { class: 'banner-sub' }, info.subtitle),
    sectionTitle('Öne Çıkanlar'),
    h('div', { class: 'banner-featured' }, featured(info.featuredRarity, game.now()).map((id) => h('div', { class: 'featured-card', style: { '--rc': rarityColor(info.featuredRarity) } }, portrait(id, 96)))),
    sectionTitle('Çağrı Oranları'),
    ratesTable(info.type),
    info.type === 'heroic'
      ? h(
          'div',
          { class: 'pity' },
          h('div', { class: 'pity-text' }, '5', icon('star', 16), ' garantisine ', h('strong', null, String(pullsLeft)), ' çağrı'),
          progressBar(fraction(game.state.summon.heroicPity, HEROIC_PITY), 'pity-bar'),
        )
      : h('div', { class: 'pity muted' }, h('div', { class: 'pity-text' }, 'Her çağrıda 2–5 yıldızlı bir kahraman.')),
    h('div', { class: 'banner-owned' }, h('span', { class: 'owned-label' }, 'Sahip olunan'), resourceAmount(info.scroll, res[info.scroll]), info.type === 'heroic' ? resourceAmount('gems', res.gems) : null),
    h('div', { class: 'btn-row banner-buttons' }, summonButton(1), summonButton(10)),
  );
}

export function createSummonScreen(ui: Ui): Screen {
  const backdrop = createBackdrop('backdrop-summon');
  const circleStage = h('div', { class: 'summon-center' });
  const content = h('div', { class: 'screen-content' });
  const el = h('section', { class: 'screen summon-screen', attrs: { 'aria-label': 'Yıldız Sunağı' } }, backdrop.el, circleStage, content);
  let shownGuest: string | null = null;

  /** A featured legendary hovers in the beam (rebuilt only when the daily pick changes). */
  function renderCenter(): void {
    const guest = featured(5, ui.game.now())[0] ?? null;
    if (guest === shownGuest && circleStage.hasChildNodes()) return;
    shownGuest = guest;
    let sprite: HTMLElement | null = null;
    try {
      sprite = guest ? heroSprite(guest) : null;
    } catch {
      sprite = null;
    }
    mount(circleStage, summonCircle(), sprite ? h('div', { class: 'summon-guest' }, sprite) : null);
  }

  return {
    el,
    render(): void {
      backdrop.set('void');
      renderCenter();
      mount(
        content,
        bannerPanel(ui, BANNERS.basic),
        h('div', { class: 'summon-stats' }, h('span', null, 'Toplam çağrı'), h('strong', null, String(ui.game.state.summon.totalPulls))),
        bannerPanel(ui, BANNERS.heroic),
      );
    },
  };
}
