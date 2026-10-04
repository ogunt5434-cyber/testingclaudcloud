// Battle result over the battlefield: big Zafer/Yenilgi ribbon with rays, framed reward tiles,
// per-unit damage / healing meter with portraits, and the follow-up buttons.
import { heroPortrait, icon } from '../../art';
import type { IconName } from '../../art/types';
import { FACTION_INFO, MAX_ROUNDS } from '../../core/constants';
import type { FightOutcome } from '../../core/game';
import type { Rewards, Side, UnitBattleStats } from '../../core/types';
import { getHeroDef, isHeroId } from '../../data/heroes';
import { plainLabel } from '../battle/choreo';
import type { BattleModel } from '../battle/model';
import '../battle/battle.css';
import '../battle/result.css';
import type { Ui } from '../context';
import { h, mount } from '../dom';
import { fmtNum, rarityColor, rewardEntries } from '../format';
import { levelUpText } from '../hints';
import { openModal, type ModalHandle } from '../overlay';

export interface ResultOptions {
  outcome: FightOutcome;
  title: string;
  model: BattleModel;
  next?: { label: string; run: () => void };
  /** Account level-up caused by this fight (its gems are not part of `outcome.rewards`). */
  levelUp?: { from: number; to: number } | null;
  /** Closes the battle view behind the result. */
  onDone: () => void;
}

function sparkles(): HTMLElement {
  const spots: [number, number, number, number][] = [
    [-150, -30, 26, 0],
    [160, -48, 20, 0.35],
    [-210, 40, 16, 0.7],
    [214, 30, 24, 0.2],
    [-96, -78, 14, 0.55],
    [110, -92, 16, 0.9],
  ];
  return h(
    'div',
    { class: 'rs-sparkles', attrs: { 'aria-hidden': 'true' } },
    spots.map(([x, y, s, d]) => h('i', { style: { left: `${x}px`, top: `${y}px`, width: `${s}px`, height: `${s}px`, 'animation-delay': `${d}s` } })),
  );
}

function rewardTiles(rewards: Rewards | null): HTMLElement {
  const rows = rewardEntries(rewards);
  if (rows.length === 0) return h('div', { class: 'rs-empty' }, 'Bu savaştan ödül yok');
  return h(
    'div',
    { class: 'rs-tiles' },
    rows.map((r, i) =>
      h(
        'div',
        { class: 'rs-tile', style: { '--tc': r.color ?? null, '--i': i }, attrs: { role: 'img', 'aria-label': `${r.name} ×${fmtNum(r.amount)}`, title: r.name } },
        h('span', { class: 'rs-tile-box' }, h('span', { class: 'rs-tile-ic' }, icon(r.icon, 56)), h('span', { class: 'rs-tile-n' }, `×${fmtNum(r.amount)}`)),
        h('span', { class: 'rs-tile-name' }, r.name),
      ),
    ),
  );
}

function meterRow(stats: UnitBattleStats, model: BattleModel, maxValue: number, mvp: boolean, index: number): HTMLElement | null {
  const unit = model.unit(stats.ref);
  if (!unit) return null;
  const def = isHeroId(unit.heroId) ? getHeroDef(unit.heroId) : null;
  const pct = (v: number): string => `${maxValue > 0 ? Math.max(1.5, (v / maxValue) * 100) : 0}%`;
  const value = (name: IconName, text: string, cls: string, title: string): HTMLElement =>
    h('span', { class: ['rs-val', cls], attrs: { title } }, icon(name, 16), text);
  return h(
    'div',
    { class: ['rs-row', !unit.alive && 'fallen'], style: { '--i': index } },
    h(
      'div',
      { class: 'rs-pf', style: { '--rc': rarityColor(unit.stars), '--fc': def ? FACTION_INFO[def.faction].color : '#888' } },
      heroPortrait(unit.heroId, { size: 35 }),
      h('span', { class: 'rs-pf-lv' }, String(unit.level)),
      mvp ? h('span', { class: 'rs-mvp' }, 'MVP') : null,
    ),
    h(
      'div',
      { class: 'rs-row-main' },
      h(
        'div',
        { class: 'rs-row-top' },
        h('span', { class: 'rs-name' }, def?.name ?? unit.heroId),
        h(
          'span',
          { class: 'rs-vals' },
          value('atk', fmtNum(stats.damageDealt), 'dmg', 'Verilen hasar'),
          stats.healingDone > 0 ? value('hp', `+${fmtNum(stats.healingDone)}`, 'heal', 'İyileştirme') : null,
          value('def', fmtNum(stats.damageTaken), 'taken', 'Alınan hasar'),
        ),
      ),
      h('div', { class: 'rs-bar dmg' }, h('i', { style: { width: stats.damageDealt > 0 ? pct(stats.damageDealt) : '0%' } })),
      stats.healingDone > 0 ? h('div', { class: 'rs-bar heal' }, h('i', { style: { width: pct(stats.healingDone) } })) : null,
    ),
  );
}

function damageMeter(outcome: FightOutcome, model: BattleModel): HTMLElement {
  const list = h('div', { class: 'rs-meter-list' });
  const won = outcome.result.winner === 'attacker';
  let side: Side = 'attacker';

  const tabs = (['attacker', 'defender'] as const).map((s) =>
    h('button', { class: 'rs-tab', attrs: { type: 'button', 'aria-pressed': 'false' }, onClick: () => select(s) }, s === 'attacker' ? 'Takımın' : 'Düşman'),
  );

  function select(next: Side): void {
    side = next;
    tabs.forEach((t, i) => {
      const on = (i === 0) === (side === 'attacker');
      t.classList.toggle('active', on);
      t.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const rows = outcome.result.unitStats.filter((s) => s.ref.side === side).sort((a, b) => b.damageDealt - a.damageDealt);
    const maxValue = Math.max(1, ...rows.map((r) => Math.max(r.damageDealt, r.healingDone)));
    const mvp = won && side === 'attacker' && rows[0]?.damageDealt > 0 ? rows[0] : null;
    mount(list, rows.map((r, i) => meterRow(r, model, maxValue, r === mvp, i)));
  }

  select(side);
  return h(
    'section',
    { class: 'rs-col rs-stats' },
    h('div', { class: 'rs-h' }, h('span', { class: 'rs-h-txt' }, 'Savaş İstatistikleri'), h('div', { class: 'rs-tabs' }, tabs)),
    list,
  );
}

/** Team totals under the rewards: damage dealt, healing done, rounds fought. */
function teamSummary(outcome: FightOutcome): HTMLElement {
  const own = outcome.result.unitStats.filter((s) => s.ref.side === 'attacker');
  const sum = (key: 'damageDealt' | 'healingDone'): number => own.reduce((total, s) => total + s[key], 0);
  const chip = (name: IconName, label: string, value: string): HTMLElement =>
    h('div', { class: 'rs-sum' }, h('span', { class: 'rs-sum-ic' }, icon(name, 28)), h('span', { class: 'rs-sum-txt' }, h('small', null, label), h('b', null, value)));
  return h(
    'div',
    { class: 'rs-summary' },
    chip('atk', 'Hasar', fmtNum(sum('damageDealt'))),
    chip('hp', 'İyileştirme', fmtNum(sum('healingDone'))),
    chip('swords', 'Tur', `${outcome.result.rounds}/${MAX_ROUNDS}`),
  );
}

function tipButton(iconName: IconName, label: string, sub: string, run: () => void): HTMLElement {
  return h(
    'button',
    { class: 'rs-tip', attrs: { type: 'button' }, onClick: run },
    h('span', { class: 'rs-tip-ic' }, icon(iconName, 46)),
    h('span', { class: 'rs-tip-txt' }, h('b', null, label), h('small', null, sub)),
  );
}

function lossTips(ui: Ui, leave: (then: () => void) => void): HTMLElement {
  return h(
    'div',
    { class: 'rs-tips' },
    h('p', { class: 'rs-tips-lead' }, 'Takımını güçlendirip tekrar dene:'),
    tipButton('spirit', 'Seviye Atlat', 'Kahramanlarını geliştir', () => leave(() => ui.goTo('heroes'))),
    tipButton('heroicScroll', 'Kahraman Çağır', 'Yeni kahramanlar bul', () => leave(() => ui.goTo('summon'))),
  );
}

function actionButton(label: string, iconName: IconName | null, variant: 'gold' | 'blue', run: () => void): HTMLButtonElement {
  return h(
    'button',
    { class: ['rs-btn', `rs-btn--${variant}`], attrs: { type: 'button' }, onClick: run },
    iconName ? h('span', { class: 'rs-btn-ic' }, icon(iconName, 30)) : null,
    h('span', { class: 'rs-btn-txt' }, label),
  );
}

export function openResult(ui: Ui, opts: ResultOptions): ModalHandle {
  const { outcome } = opts;
  const won = outcome.result.winner === 'attacker';
  // Every button leaves the result screen: only the first tap counts (a double tap must not start two fights).
  let acted = false;
  const once =
    (fn: () => void) =>
    (): void => {
      if (acted) return;
      acted = true;
      fn();
    };
  const close = (): void => {
    modal.close();
    opts.onDone();
  };
  const done = once(close);
  const leave = (then: () => void): void =>
    once(() => {
      close();
      then();
    })();

  const modal = openModal({ bare: true, dismissible: false, className: 'result-screen', label: won ? 'Zafer' : 'Yenilgi' });
  modal.root.classList.add('rs-layer');

  const levelUp = opts.levelUp ? levelUpText(opts.levelUp.from, opts.levelUp.to) : null;
  const nextLabel = opts.next ? plainLabel(opts.next.label) || (won ? 'Sonraki Aşama' : 'Tekrar Dene') : '';

  const head = h(
    'div',
    { class: 'rs-head' },
    h('div', { class: 'rs-rays', attrs: { 'aria-hidden': 'true' } }),
    won ? sparkles() : null,
    h('div', { class: 'rs-emblem', attrs: { 'aria-hidden': 'true' } }, icon(won ? 'trophy' : 'swords', 96)),
    h(
      'div',
      { class: 'rs-ribbon' },
      h('span', { class: 'rs-ribbon-end l' }),
      h('h2', { class: 'rs-title' }, won ? 'ZAFER' : 'YENİLGİ'),
      h('span', { class: 'rs-ribbon-end r' }),
    ),
    h('div', { class: 'rs-sub' }, `${opts.title} · ${outcome.result.rounds} tur`),
  );

  const loot = h(
    'section',
    { class: 'rs-col rs-loot' },
    h('div', { class: 'rs-h' }, h('span', { class: 'rs-h-txt' }, won ? 'Ödüller' : 'Güçlenme Yolları')),
    levelUp ? h('div', { class: 'rs-levelup' }, icon('playerExp', 26), h('span', null, levelUp)) : null,
    won ? rewardTiles(outcome.rewards) : lossTips(ui, leave),
    teamSummary(outcome),
  );

  const actions = h(
    'div',
    { class: 'rs-actions' },
    opts.next
      ? actionButton(nextLabel, won ? 'swords' : 'auto', 'blue', () =>
          leave(() => {
            opts.next?.run();
          }),
        )
      : null,
    actionButton('Devam', null, 'gold', done),
  );

  modal.setContent(
    h(
      'div',
      { class: ['rs-root', won ? 'won' : 'lost'], attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': won ? 'Zafer' : 'Yenilgi' } },
      h('div', { class: 'rs-backdrop' }),
      head,
      h('div', { class: 'rs-panel' }, loot, damageMeter(outcome, opts.model)),
      actions,
    ),
  );
  return modal;
}
