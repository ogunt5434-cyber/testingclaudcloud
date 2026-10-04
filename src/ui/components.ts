// Reusable visual building blocks in the cartoon game style: portraits, framed hero cards, star rows,
// chunky buttons, resource / reward chips, power comparison, bars, badges, ribbons. No emoji: every
// pictogram is an art icon() and every hero picture comes from the art module.
import { heroPortrait, icon, type IconName } from '../art';
import { CLASS_INFO, FACTION_INFO, MAX_STARS, STAT_INFO } from '../core/constants';
import type { Faction, HeroClass, HeroInstance, Resources, Rewards, StatKey } from '../core/types';
import { getHeroDef, isHeroId } from '../data/heroes';
import { h, type Child } from './dom';
import { RESOURCE_INFO, STAT_ICON, classIcon, factionIcon, fmtNum, fmtStat, hyphenateTr, rarityColor, rewardEntries } from './format';

export type PortraitSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
const PORTRAIT_PX: Record<PortraitSize, number> = { xs: 44, sm: 60, md: 80, lg: 104, xl: 140 };

/** Portrait art rendered once per hero into an image URL: a card grid then costs one <img> per hero. */
interface PortraitArt {
  url: string;
  bg: [string, string, string];
}
const portraitCache = new Map<string, PortraitArt>();
/** Parts the art module hides in portraits with its stylesheet (an <img> does not see page CSS). */
const PORTRAIT_HIDE = '<style>.hs-fx,.hs-string,.hs-shadow,.hs-glyph,.hs-glow{display:none}</style>';

function portraitArt(heroId: string): PortraitArt | null {
  const cached = portraitCache.get(heroId);
  if (cached) return cached;
  try {
    const el = heroPortrait(heroId, { size: 96 });
    const svg = el.querySelector('svg');
    if (!svg) return null;
    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const markup = svg.outerHTML.replace(/^<svg([^>]*)>/, `<svg$1>${PORTRAIT_HIDE}`);
    let url: string;
    try {
      url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    } catch {
      url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    }
    const css = el.style;
    const art: PortraitArt = {
      url,
      bg: [css.getPropertyValue('--hp-a') || '#9cc4ff', css.getPropertyValue('--hp-b') || '#3a6ac8', css.getPropertyValue('--hp-c') || '#14244a'],
    };
    portraitCache.set(heroId, art);
    return art;
  } catch (err) {
    console.warn('portrait art failed', heroId, err);
    return null;
  }
}

/** Faction-tinted square bust portrait of a hero (no frame; frames come from the card around it). */
export function portrait(heroId: string, size: PortraitSize | number = 'md', extraClass?: string): HTMLElement {
  const px = typeof size === 'number' ? size : PORTRAIT_PX[size];
  const sizeClass = typeof size === 'number' ? null : `portrait-${size}`;
  const known = isHeroId(heroId);
  const art = portraitArt(heroId);
  const el = h('div', {
    class: ['portrait', sizeClass, extraClass],
    style: {
      width: `${px}px`,
      height: `${px}px`,
      '--pa': art?.bg[0],
      '--pb': art?.bg[1],
      '--pc': art?.bg[2],
    },
    attrs: known ? { role: 'img', 'aria-label': getHeroDef(heroId).name } : { 'aria-hidden': 'true' },
  });
  if (art) el.append(h('img', { class: 'portrait-img', attrs: { src: art.url, alt: '', draggable: 'false', decoding: 'async' } }));
  return el;
}

/** Row of star icons (gold), `count` clamped to 0..MAX_STARS. */
export function starRow(count: number, extraClass?: string, size = 18): HTMLElement {
  const n = Math.max(0, Math.min(MAX_STARS, Math.floor(count)));
  return h(
    'span',
    { class: ['stars', extraClass], style: { '--sc': rarityColor(n) }, attrs: { role: 'img', 'aria-label': `${n} yıldız` } },
    Array.from({ length: n }, () => icon('star', size)),
  );
}

/** Round faction emblem (icon only, named by title). */
export function factionBadge(faction: Faction, size = 26, extraClass?: string): HTMLElement {
  return h(
    'span',
    { class: ['faction-badge', extraClass], style: { '--fc': FACTION_INFO[faction].color }, attrs: { title: FACTION_INFO[faction].name } },
    icon(factionIcon(faction), size),
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
  /** Hide the name line under the card. */
  noName?: boolean;
  /** Portrait px (default 104). */
  size?: number;
  onClick?: () => void;
}

/**
 * Genre-style square hero card: portrait in a frame coloured by stars, faction badge top-left, level
 * bottom-left, stars along the bottom, name under the frame.
 */
export function heroCard(hero: HeroInstance, opts: HeroCardOptions = {}): HTMLElement {
  const def = getHeroDef(hero.heroId);
  const size = opts.size ?? 104;
  return h(
    'button',
    {
      class: ['hcard', `r${Math.min(5, Math.max(1, hero.stars))}`, opts.inFormation && 'in-team', opts.selected && 'selected', opts.dim && 'dim'],
      style: { '--fc': FACTION_INFO[def.faction].color, '--rc': rarityColor(hero.stars), '--card': `${size}px` },
      attrs: {
        type: 'button',
        'aria-label': `${def.name}, seviye ${hero.level}, ${hero.stars} yıldız${opts.inFormation ? ', takımda' : ''}${opts.upgradable ? ', yıldız yükseltmeye hazır' : ''}`,
      },
      onClick: opts.onClick,
    },
    h(
      'span',
      { class: 'hcard-frame' },
      portrait(hero.heroId, size - 8, 'hcard-portrait'),
      factionBadge(def.faction, 24, 'hcard-faction'),
      h('span', { class: 'hcard-level' }, String(hero.level)),
      starRow(hero.stars, 'hcard-stars', size < 100 ? 14 : 17),
      hero.locked ? h('span', { class: 'hcard-lock', attrs: { title: 'Kilitli' } }, icon('lock', 20)) : null,
      opts.inFormation && opts.badge === undefined ? h('span', { class: 'hcard-team', attrs: { title: 'Takımda' } }, icon('swords', 20)) : null,
      opts.badge !== undefined ? h('span', { class: 'hcard-badge' }, opts.badge) : null,
      opts.upgradable ? h('span', { class: 'hcard-up', attrs: { title: 'Yıldız yükseltmeye hazır' } }, icon('buff-up', 22)) : null,
    ),
    opts.noName ? null : h('span', { class: 'hcard-name' }, hyphenateTr(def.name)),
    opts.power !== undefined ? h('span', { class: 'hcard-power' }, icon('power', 14), fmtNum(opts.power)) : null,
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'gold' | 'ghost' | 'green';

export interface ButtonOptions {
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Second line under the label (cost, reason...). */
  sub?: Child;
  class?: string;
  title?: string;
  /** Icon drawn before the label. */
  icon?: IconName;
  /** Accessible name when the visible label is not enough (icon-only buttons). */
  label?: string;
}

/** Chunky glossy cartoon button: gold/orange primary, blue secondary, red danger. */
export function button(label: Child, onClick: () => void, opts: ButtonOptions = {}): HTMLButtonElement {
  return h(
    'button',
    {
      class: ['btn', `btn-${opts.variant ?? 'secondary'}`, opts.sub ? 'btn-two-line' : null, opts.icon && !label ? 'btn-icon-only' : null, opts.class],
      attrs: { type: 'button', disabled: !!opts.disabled, title: opts.title, 'aria-label': opts.label },
      onClick: () => {
        if (!opts.disabled) onClick();
      },
    },
    h('span', { class: 'btn-main' }, opts.icon ? icon(opts.icon, 26) : null, label === '' || label === null ? null : h('span', { class: 'btn-label' }, label)),
    opts.sub ? h('span', { class: 'btn-sub' }, opts.sub) : null,
  );
}

/** Small icon for a resource. */
export function resIcon(key: keyof Resources, size = 20): SVGSVGElement {
  return icon(RESOURCE_INFO[key].icon, size);
}

/** Cost chips, red when the player cannot pay that part. */
export function costView(cost: Partial<Resources>, have: Readonly<Resources>): HTMLElement {
  const parts = (Object.keys(cost) as (keyof Resources)[])
    .filter((key) => (cost[key] ?? 0) > 0)
    .map((key) => {
      const amount = cost[key] ?? 0;
      return h('span', { class: ['cost', have[key] < amount && 'short'], attrs: { title: RESOURCE_INFO[key].name } }, resIcon(key, 18), fmtNum(amount));
    });
  return h('span', { class: 'costs' }, parts.length ? parts : 'Ücretsiz');
}

export function resourceAmount(key: keyof Resources, amount: number): HTMLElement {
  return h('span', { class: 'res-amount', attrs: { title: RESOURCE_INFO[key].name } }, resIcon(key, 22), fmtNum(amount));
}

/** Amount label of a reward chip: "×1200", "×12.3K". */
export function rewardAmountText(amount: number): string {
  return `×${fmtNum(amount)}`;
}

/** Reward item slots (framed icon + amount); empty rewards render a muted note. */
export function rewardList(rewards: Rewards | null | undefined, emptyText = 'Ödül yok'): HTMLElement {
  const rows = rewardEntries(rewards);
  if (rows.length === 0) return h('div', { class: 'reward-list empty' }, emptyText);
  return h(
    'div',
    { class: 'reward-list' },
    rows.map((r) =>
      h(
        'div',
        { class: ['reward', r.color && 'tiered'], style: { '--tc': r.color ?? null }, attrs: { title: `${r.name} ${rewardAmountText(r.amount)}` } },
        h('span', { class: 'reward-icon' }, icon(r.icon, 38)),
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
    h('div', { class: 'pc-side team' }, h('span', { class: 'pc-label' }, 'Takım Gücü'), h('span', { class: 'pc-value' }, icon('power', 26), fmtNum(team))),
    h('div', { class: 'pc-vs' }, 'VS'),
    h('div', { class: 'pc-side enemy' }, h('span', { class: 'pc-label' }, `${enemyLabel} Gücü`), h('span', { class: 'pc-value' }, icon('power', 26), fmtNum(enemy))),
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
  return h('span', { class: 'chip faction-chip', style: { '--fc': info.color } }, icon(factionIcon(faction), 22), info.name);
}

export function classChip(heroClass: HeroClass): HTMLElement {
  return h('span', { class: 'chip class-chip' }, icon(classIcon(heroClass), 22), CLASS_INFO[heroClass].name);
}

export function statRow(key: StatKey, value: number): HTMLElement {
  const ic = STAT_ICON[key];
  return h(
    'div',
    { class: 'stat-row' },
    h('span', { class: 'stat-name' }, ic ? icon(ic, 18) : null, STAT_INFO[key].name),
    h('span', { class: 'stat-value' }, fmtStat(key, value)),
  );
}

export function sectionTitle(text: string, extra?: Child): HTMLElement {
  return h('div', { class: 'section-title' }, h('span', { class: 'section-text' }, text), extra ?? null);
}

export function emptyState(iconName: IconName, text: string): HTMLElement {
  return h('div', { class: 'empty-state' }, h('div', { class: 'empty-icon' }, icon(iconName, 64)), h('p', null, text));
}

/** Banner-style title ribbon ('blue' default, 'red' for highlights, 'gold' for rewards). */
export function ribbon(text: Child, variant: 'blue' | 'red' | 'gold' = 'blue', extraClass?: string): HTMLElement {
  return h('div', { class: ['ribbon', `ribbon-${variant}`, extraClass] }, h('span', { class: 'ribbon-text' }, text));
}

export interface RoundButtonOptions {
  /** Red notification dot. */
  dot?: boolean;
  /** Visible caption under the button (also its accessible name). */
  caption?: string;
  class?: string;
  size?: number;
}

/** Round HUD button with a gold rim and an icon, optional caption and notification dot. */
export function roundButton(iconName: IconName, label: string, onClick: () => void, opts: RoundButtonOptions = {}): HTMLButtonElement {
  return h(
    'button',
    {
      class: ['round-btn', opts.class],
      attrs: { type: 'button', 'aria-label': `${label}${opts.dot ? ' — yeni' : ''}`, title: label },
      onClick,
    },
    h('span', { class: 'round-btn-disc' }, icon(iconName, opts.size ?? 40)),
    opts.caption ? h('span', { class: 'round-btn-caption', attrs: { 'aria-hidden': 'true' } }, opts.caption) : null,
    opts.dot ? h('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }) : null,
  );
}

/** Lineup of small enemy portraits with level tags (campaign / tower / formation preview). */
export function lineup(units: readonly ({ heroId: string; level: number; stars?: number } | null)[], size: PortraitSize | number = 'sm'): HTMLElement {
  return h(
    'div',
    { class: 'lineup' },
    units
      .filter((u): u is { heroId: string; level: number; stars?: number } => !!u)
      .map((u) =>
        h(
          'div',
          { class: 'lineup-unit', style: { '--rc': rarityColor(u.stars ?? 1) } },
          portrait(u.heroId, size),
          h('span', { class: 'lineup-lv' }, String(u.level)),
          isHeroId(u.heroId) ? factionBadge(getHeroDef(u.heroId).faction, 16, 'lineup-faction') : null,
        ),
      ),
  );
}
