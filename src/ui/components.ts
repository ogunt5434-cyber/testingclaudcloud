// Reusable visual building blocks: portraits, star rows, hero cards, buttons, costs, rewards, bars.
import { CLASS_INFO, FACTION_INFO, MAX_STARS, STAT_INFO } from '../core/constants';
import type { Faction, HeroClass, HeroInstance, Resources, Rewards, StatKey } from '../core/types';
import { getHeroDef, isHeroId } from '../data/heroes';
import { h, type Child } from './dom';
import { RESOURCE_INFO, fmtNum, fmtStat, hyphenateTr, POWER_ICON, rarityColor, rewardEntries } from './format';

export type PortraitSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Faction-coloured gradient circle with the hero emoji. */
export function portrait(heroId: string, size: PortraitSize = 'md', extraClass?: string): HTMLElement {
  if (!isHeroId(heroId)) return h('div', { class: ['portrait', `portrait-${size}`, extraClass] }, '❔');
  const def = getHeroDef(heroId);
  return h(
    'div',
    {
      class: ['portrait', `portrait-${size}`, extraClass],
      style: { '--fc': FACTION_INFO[def.faction].color },
      attrs: { 'aria-label': def.name, role: 'img' },
    },
    h('span', { class: 'portrait-emoji' }, def.emoji),
  );
}

/** Row of ★ coloured by star count. */
export function starRow(count: number, extraClass?: string): HTMLElement {
  const n = Math.max(0, Math.min(MAX_STARS, Math.floor(count)));
  return h(
    'span',
    { class: ['stars', extraClass], style: { '--sc': rarityColor(n) }, attrs: { 'aria-label': `${n} yıldız` } },
    '★'.repeat(n),
  );
}

export interface HeroCardOptions {
  power?: number;
  inFormation?: boolean;
  selected?: boolean;
  dim?: boolean;
  /** Small corner badge (e.g. slot number in the formation editor). */
  badge?: Child;
  /** The hero can be starred up right now: show the upgrade marker. */
  upgradable?: boolean;
  onClick?: () => void;
}

export function heroCard(hero: HeroInstance, opts: HeroCardOptions = {}): HTMLElement {
  const def = getHeroDef(hero.heroId);
  return h(
    'button',
    {
      class: ['hcard', opts.inFormation && 'in-team', opts.selected && 'selected', opts.dim && 'dim'],
      style: { '--fc': FACTION_INFO[def.faction].color, '--rc': rarityColor(hero.stars) },
      attrs: {
        type: 'button',
        'aria-label': `${def.name}, seviye ${hero.level}, ${hero.stars} yıldız${opts.upgradable ? ', yıldız yükseltmeye hazır' : ''}`,
      },
      onClick: opts.onClick,
    },
    h(
      'div',
      { class: 'hcard-art' },
      h('span', { class: 'hcard-emoji' }, def.emoji),
      h('span', { class: 'hcard-faction', attrs: { title: FACTION_INFO[def.faction].name } }, FACTION_INFO[def.faction].icon),
      hero.locked ? h('span', { class: 'hcard-lock', attrs: { title: 'Kilitli' } }, '🔒') : null,
      opts.inFormation ? h('span', { class: 'hcard-team', attrs: { title: 'Takımda' } }, '⚔') : null,
      opts.badge !== undefined ? h('span', { class: 'hcard-badge' }, opts.badge) : null,
      opts.upgradable ? h('span', { class: 'hcard-up', attrs: { title: 'Yıldız yükseltmeye hazır', 'aria-hidden': 'true' } }, '▲') : null,
      h('span', { class: 'hcard-level' }, `Sv.${hero.level}`),
    ),
    starRow(hero.stars, 'hcard-stars'),
    h('span', { class: 'hcard-name' }, hyphenateTr(def.name)),
    opts.power !== undefined ? h('span', { class: 'hcard-power' }, `${POWER_ICON} ${fmtNum(opts.power)}`) : null,
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'gold' | 'ghost';

export interface ButtonOptions {
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Second line under the label (cost, reason...). */
  sub?: Child;
  class?: string;
  title?: string;
}

export function button(label: Child, onClick: () => void, opts: ButtonOptions = {}): HTMLButtonElement {
  return h(
    'button',
    {
      class: ['btn', `btn-${opts.variant ?? 'secondary'}`, opts.sub ? 'btn-two-line' : null, opts.class],
      attrs: { type: 'button', disabled: !!opts.disabled, title: opts.title },
      onClick: () => {
        if (!opts.disabled) onClick();
      },
    },
    h('span', { class: 'btn-label' }, label),
    opts.sub ? h('span', { class: 'btn-sub' }, opts.sub) : null,
  );
}

/** Cost chips, red when the player cannot pay that part. */
export function costView(cost: Partial<Resources>, have: Readonly<Resources>): HTMLElement {
  const parts = (Object.keys(cost) as (keyof Resources)[])
    .filter((key) => (cost[key] ?? 0) > 0)
    .map((key) => {
      const amount = cost[key] ?? 0;
      return h(
        'span',
        { class: ['cost', have[key] < amount && 'short'] },
        h('span', { class: 'cost-icon' }, RESOURCE_INFO[key].icon),
        fmtNum(amount),
      );
    });
  return h('span', { class: 'costs' }, parts.length ? parts : 'Ücretsiz');
}

export function resourceAmount(key: keyof Resources, amount: number): HTMLElement {
  return h('span', { class: 'res-amount' }, h('span', { class: 'res-icon' }, RESOURCE_INFO[key].icon), fmtNum(amount));
}

/** Amount label of a reward chip: "×1200", "×12.3K". */
export function rewardAmountText(amount: number): string {
  return `×${fmtNum(amount)}`;
}

/** Reward chips (icon + amount); empty rewards render a muted note. */
export function rewardList(rewards: Rewards | null | undefined, emptyText = 'Ödül yok'): HTMLElement {
  const rows = rewardEntries(rewards);
  if (rows.length === 0) return h('div', { class: 'reward-list empty' }, emptyText);
  return h(
    'div',
    { class: 'reward-list' },
    rows.map((r) =>
      h(
        'div',
        { class: 'reward', style: { '--tc': r.color ?? null }, attrs: { title: r.name } },
        h('span', { class: 'reward-icon' }, r.icon),
        h('span', { class: 'reward-amount' }, rewardAmountText(r.amount)),
      ),
    ),
  );
}

/** "Takım Gücü vs Düşman Gücü" comparison, green when the team is stronger. */
export function powerCompare(team: number, enemy: number, enemyLabel = 'Düşman'): HTMLElement {
  const stronger = team >= enemy;
  return h(
    'div',
    { class: ['power-compare', stronger ? 'good' : 'bad'] },
    h('div', { class: 'pc-side' }, h('span', { class: 'pc-label' }, 'Takım Gücü'), h('span', { class: 'pc-value team' }, `${POWER_ICON} ${fmtNum(team)}`)),
    h('div', { class: 'pc-vs' }, 'VS'),
    h('div', { class: 'pc-side' }, h('span', { class: 'pc-label' }, `${enemyLabel} Gücü`), h('span', { class: 'pc-value enemy' }, `${POWER_ICON} ${fmtNum(enemy)}`)),
  );
}

/** CSS width of a progress bar fill for a 0..1 fraction (clamped, 0.1% steps). */
export function progressBarWidth(frac: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0)) * 1000) / 10;
  return `${pct}%`;
}

export function progressBar(frac: number, extraClass?: string): HTMLElement {
  return h('div', { class: ['pbar', extraClass] }, h('div', { class: 'pbar-fill', style: { width: progressBarWidth(frac) } }));
}

export function factionChip(faction: Faction): HTMLElement {
  const info = FACTION_INFO[faction];
  return h('span', { class: 'chip faction-chip', style: { '--fc': info.color } }, `${info.icon} ${info.name}`);
}

export function classChip(heroClass: HeroClass): HTMLElement {
  const info = CLASS_INFO[heroClass];
  return h('span', { class: 'chip class-chip' }, `${info.icon} ${info.name}`);
}

export function statRow(key: StatKey, value: number): HTMLElement {
  return h('div', { class: 'stat-row' }, h('span', { class: 'stat-name' }, STAT_INFO[key].name), h('span', { class: 'stat-value' }, fmtStat(key, value)));
}

export function sectionTitle(text: string, extra?: Child): HTMLElement {
  return h('div', { class: 'section-title' }, h('span', null, text), extra ?? null);
}

export function emptyState(icon: string, text: string): HTMLElement {
  return h('div', { class: 'empty-state' }, h('div', { class: 'empty-icon' }, icon), h('p', null, text));
}
