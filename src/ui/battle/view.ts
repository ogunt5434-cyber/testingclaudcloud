// Battle arena DOM: unit cards (portrait, HP/energy bars, statuses) and visual effects
// (lunges, hit flashes, floating numbers, banners). Driven by the playback loop in modals/battle.ts.
import { FACTION_INFO, STATUS_INFO } from '../../core/constants';
import type { Side, UnitRef } from '../../core/types';
import { getHeroDef, isHeroId } from '../../data/heroes';
import { portrait, starRow } from '../components';
import { h, mount, prefersReducedMotion } from '../dom';
import type { Timers } from '../timers';
import { refKey, type BattleModel, type UnitView } from './model';

interface UnitCard {
  root: HTMLElement;
  hpFill: HTMLElement;
  hpLag: HTMLElement;
  enFill: HTMLElement;
  statusRow: HTMLElement;
  fx: HTMLElement;
  floatIndex: number;
}

/** Horizontal offsets cycled through so stacked floating numbers do not overlap. */
const FLOAT_OFFSETS = [0, -16, 14, -8, 18, -20, 8];

/** Temporary highlight classes added by pulse(). */
const PULSE_CLASSES = ['casting', 'skipping', 'passive-glow'] as const;
type PulseClass = (typeof PULSE_CLASSES)[number];

const FRONT = [0, 1];
const BACK = [2, 3, 4, 5];

export class BattleView {
  readonly el: HTMLElement;
  private readonly cards = new Map<string, UnitCard>();
  private readonly bannerLayer: HTMLElement;
  private speed = 1;
  private readonly reducedMotion = prefersReducedMotion();

  constructor(
    private readonly model: BattleModel,
    private readonly timers: Timers,
  ) {
    this.bannerLayer = h('div', { class: 'banner-layer', attrs: { 'aria-hidden': 'true' } });
    this.el = h(
      'div',
      { class: 'arena' },
      this.team('defender'),
      h('div', { class: 'arena-divider' }, h('span', null, 'VS')),
      this.team('attacker'),
      this.bannerLayer,
    );
    this.syncAll();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.el.style.setProperty('--speed', String(speed));
  }

  // ---------------------------------------------------------------- layout

  private team(side: Side): HTMLElement {
    const rowEl = (positions: number[], row: 'front' | 'back'): HTMLElement =>
      h('div', { class: ['arena-row', row] }, positions.map((pos) => this.slot({ side, pos })));
    const rows = side === 'defender' ? [rowEl(BACK, 'back'), rowEl(FRONT, 'front')] : [rowEl(FRONT, 'front'), rowEl(BACK, 'back')];
    return h(
      'div',
      { class: ['arena-team', side === 'defender' ? 'enemy' : 'ally'] },
      h('div', { class: 'arena-team-label' }, side === 'defender' ? 'Düşman' : 'Takımın'),
      rows,
    );
  }

  private slot(ref: UnitRef): HTMLElement {
    const unit = this.model.unit(ref);
    if (!unit || !isHeroId(unit.heroId)) return h('div', { class: 'bu empty' }, h('div', { class: 'bu-empty-ring' }));
    const def = getHeroDef(unit.heroId);
    const card: UnitCard = {
      root: h('div', { class: 'bu', style: { '--fc': FACTION_INFO[def.faction].color }, attrs: { 'data-key': unit.key } }),
      hpFill: h('div', { class: 'bu-hp-fill' }),
      hpLag: h('div', { class: 'bu-hp-lag' }),
      enFill: h('div', { class: 'bu-en-fill' }),
      statusRow: h('div', { class: 'bu-status' }),
      fx: h('div', { class: 'bu-fx' }),
      floatIndex: 0,
    };
    mount(
      card.root,
      h('div', { class: 'bu-art' }, portrait(unit.heroId, 'md', 'bu-portrait'), h('span', { class: 'bu-lv' }, String(unit.level)), card.statusRow),
      starRow(unit.stars, 'bu-stars'),
      h('div', { class: 'bu-name' }, def.name),
      h('div', { class: 'bu-hp' }, card.hpLag, card.hpFill),
      h('div', { class: 'bu-en' }, card.enFill),
      card.fx,
    );
    this.cards.set(unit.key, card);
    return card.root;
  }

  // ---------------------------------------------------------------- state sync

  syncAll(): void {
    for (const unit of this.model.units.values()) this.sync(unit);
  }

  syncRef(ref: UnitRef): void {
    const unit = this.model.unit(ref);
    if (unit) this.sync(unit);
  }

  private sync(unit: UnitView): void {
    const card = this.cards.get(unit.key);
    if (!card) return;
    const hpPct = unit.maxHp > 0 ? (unit.hp / unit.maxHp) * 100 : 0;
    card.hpFill.style.width = `${hpPct}%`;
    card.hpLag.style.width = `${hpPct}%`;
    card.root.classList.toggle('low', hpPct > 0 && hpPct < 30);
    card.enFill.style.width = `${Math.min(100, unit.energy)}%`;
    card.root.classList.toggle('ready', unit.alive && unit.energy >= 100);
    card.root.classList.toggle('dead', !unit.alive);
    this.syncStatuses(card, unit);
  }

  private syncStatuses(card: UnitCard, unit: UnitView): void {
    const icons: HTMLElement[] = [...unit.statuses.keys()].map((status) =>
      h('span', { class: 'bu-st', attrs: { title: STATUS_INFO[status]?.name ?? status } }, STATUS_INFO[status]?.icon ?? '•'),
    );
    if (unit.buffs.some((b) => b.amount > 0)) icons.push(h('span', { class: 'bu-st buff-up' }, '▲'));
    if (unit.buffs.some((b) => b.amount < 0)) icons.push(h('span', { class: 'bu-st buff-down' }, '▼'));
    mount(card.statusRow, icons);
  }

  // ---------------------------------------------------------------- effects

  private ms(base: number): number {
    return base / this.speed;
  }

  /** Floating text above a unit; `kind` selects the style (dmg, crit, heal, dodge, dot, status, buff, passive). */
  float(ref: UnitRef, text: string, kind: string): void {
    const card = this.cards.get(refKey(ref));
    if (!card) return;
    const offset = FLOAT_OFFSETS[card.floatIndex++ % FLOAT_OFFSETS.length];
    const el = h('span', { class: ['float', `float-${kind}`], style: { '--dx': `${offset}px` } }, text);
    card.fx.append(el);
    this.timers.after(this.ms(1300), () => el.remove());
  }

  lunge(actor: UnitRef, target: UnitRef | undefined): void {
    const card = this.cards.get(refKey(actor));
    if (!card || this.reducedMotion) return;
    const targetCard = target ? this.cards.get(refKey(target)) : undefined;
    let dx = 0;
    let dy = actor.side === 'attacker' ? -26 : 26;
    if (targetCard && targetCard !== card) {
      const a = card.root.getBoundingClientRect();
      const b = targetCard.root.getBoundingClientRect();
      const vx = b.left + b.width / 2 - (a.left + a.width / 2);
      const vy = b.top + b.height / 2 - (a.top + a.height / 2);
      const len = Math.hypot(vx, vy) || 1;
      const reach = Math.min(54, len * 0.35);
      dx = (vx / len) * reach;
      dy = (vy / len) * reach;
    }
    card.root.animate(
      [
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx}px, ${dy}px) scale(1.1)`, offset: 0.45 },
        { transform: 'translate(0, 0) scale(1)' },
      ],
      { duration: this.ms(340), easing: 'cubic-bezier(.3,.7,.4,1)' },
    );
  }

  hit(ref: UnitRef, crit: boolean): void {
    const card = this.cards.get(refKey(ref));
    if (!card) return;
    card.root.animate([{ filter: 'brightness(2.2) saturate(0.4)' }, { filter: 'none' }], { duration: this.ms(260) });
    const spark = h('span', { class: ['spark', crit && 'crit'] });
    card.fx.append(spark);
    this.timers.after(this.ms(420), () => spark.remove());
    if (this.reducedMotion) return;
    const shake = crit ? 7 : 4;
    card.root.animate(
      [
        { transform: 'translateX(0)' },
        { transform: `translateX(${-shake}px)` },
        { transform: `translateX(${shake}px)` },
        { transform: `translateX(${-shake / 2}px)` },
        { transform: 'translateX(0)' },
      ],
      { duration: this.ms(crit ? 320 : 240) },
    );
    if (crit) this.el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }], { duration: this.ms(180) });
  }

  /** Removes every transient effect (used by "Atla", which cancels the timers that would clean them up). */
  resetEffects(): void {
    this.el.querySelectorAll('.float, .spark, .skill-banner, .round-banner').forEach((el) => el.remove());
    for (const card of this.cards.values()) card.root.classList.remove(...PULSE_CLASSES);
  }

  pulse(ref: UnitRef, className: PulseClass, baseMs: number): void {
    const card = this.cards.get(refKey(ref));
    if (!card) return;
    card.root.classList.add(className);
    this.timers.after(this.ms(baseMs), () => card.root.classList.remove(className));
  }

  skillBanner(actor: UnitRef, skillName: string): void {
    const unit = this.model.unit(actor);
    if (!unit || !isHeroId(unit.heroId)) return;
    const def = getHeroDef(unit.heroId);
    const banner = h(
      'div',
      { class: ['skill-banner', actor.side === 'attacker' ? 'ally' : 'enemy'], style: { '--fc': FACTION_INFO[def.faction].color } },
      h('span', { class: 'sb-emoji' }, def.emoji),
      h('span', { class: 'sb-text' }, h('span', { class: 'sb-hero' }, def.name), h('span', { class: 'sb-skill' }, skillName)),
    );
    this.showBanner(banner, 850);
  }

  roundBanner(round: number, maxRounds: number): void {
    this.showBanner(h('div', { class: 'round-banner' }, h('small', null, 'TUR'), `${round}`, h('small', null, `/ ${maxRounds}`)), 700);
  }

  private showBanner(el: HTMLElement, baseMs: number): void {
    el.style.setProperty('--life', `${this.ms(baseMs)}ms`);
    this.bannerLayer.append(el);
    this.timers.after(this.ms(baseMs), () => el.remove());
  }
}
