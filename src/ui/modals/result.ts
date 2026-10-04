// Battle result: Zafer/Yenilgi banner, rewards, per-unit damage meter and follow-up actions.
import type { FightOutcome } from '../../core/game';
import type { Side, UnitBattleStats } from '../../core/types';
import { getHeroDef, isHeroId } from '../../data/heroes';
import type { BattleModel } from '../battle/model';
import { button, portrait, rewardList, sectionTitle, starRow } from '../components';
import type { Ui } from '../context';
import { h, mount } from '../dom';
import { fmtNum } from '../format';
import { openModal, type ModalHandle } from '../overlay';

export interface ResultOptions {
  outcome: FightOutcome;
  title: string;
  model: BattleModel;
  next?: { label: string; run: () => void };
  /** Closes the battle view behind the result. */
  onDone: () => void;
}

function meterRow(stats: UnitBattleStats, model: BattleModel, maxValue: number, mvp: boolean): HTMLElement | null {
  const unit = model.unit(stats.ref);
  if (!unit || !isHeroId(unit.heroId)) return null;
  const def = getHeroDef(unit.heroId);
  const dmgPct = maxValue > 0 ? (stats.damageDealt / maxValue) * 100 : 0;
  const healPct = maxValue > 0 ? (stats.healingDone / maxValue) * 100 : 0;
  return h(
    'div',
    { class: ['meter-row', !unit.alive && 'fallen'] },
    portrait(unit.heroId, 'xs'),
    h(
      'div',
      { class: 'meter-main' },
      h(
        'div',
        { class: 'meter-name' },
        h('span', null, def.name),
        starRow(unit.stars),
        mvp ? h('span', { class: 'mvp' }, 'MVP') : null,
      ),
      h('div', { class: 'meter-bar dmg' }, h('div', { style: { width: `${dmgPct}%` } })),
      stats.healingDone > 0 ? h('div', { class: 'meter-bar heal' }, h('div', { style: { width: `${healPct}%` } })) : null,
    ),
    h(
      'div',
      { class: 'meter-values' },
      h('span', { class: 'mv-dmg', attrs: { title: 'Verilen hasar' } }, `⚔ ${fmtNum(stats.damageDealt)}`),
      stats.healingDone > 0 ? h('span', { class: 'mv-heal', attrs: { title: 'İyileştirme' } }, `✚ ${fmtNum(stats.healingDone)}`) : null,
      h('span', { class: 'mv-taken', attrs: { title: 'Alınan hasar' } }, `🛡 ${fmtNum(stats.damageTaken)}`),
    ),
  );
}

function damageMeter(outcome: FightOutcome, model: BattleModel): HTMLElement {
  const list = h('div', { class: 'meter-list' });
  const won = outcome.result.winner === 'attacker';
  let side: Side = 'attacker';

  const tabs = (['attacker', 'defender'] as const).map((s) =>
    h('button', { class: 'seg-btn', attrs: { type: 'button' }, onClick: () => select(s) }, s === 'attacker' ? 'Takımın' : 'Düşman'),
  );

  function select(next: Side): void {
    side = next;
    tabs.forEach((t, i) => t.classList.toggle('active', (i === 0) === (side === 'attacker')));
    const rows = outcome.result.unitStats.filter((s) => s.ref.side === side).sort((a, b) => b.damageDealt - a.damageDealt);
    const maxValue = Math.max(1, ...rows.map((r) => Math.max(r.damageDealt, r.healingDone)));
    const mvpKey = won && side === 'attacker' && rows[0]?.damageDealt > 0 ? rows[0] : null;
    mount(list, rows.map((r) => meterRow(r, model, maxValue, r === mvpKey)));
  }

  select(side);
  return h('div', { class: 'meter' }, sectionTitle('İstatistikler', h('div', { class: 'seg' }, tabs)), list);
}

function lossTips(ui: Ui, close: () => void): HTMLElement {
  const go = (tab: 'heroes' | 'summon'): void => {
    close();
    ui.goTo(tab);
  };
  return h(
    'div',
    { class: 'loss-tips' },
    h('p', null, 'Takımını güçlendirip tekrar dene:'),
    h(
      'div',
      { class: 'tip-buttons' },
      button('⬆️ Seviye Atlat', () => go('heroes'), { variant: 'ghost' }),
      button('🌀 Kahraman Çağır', () => go('summon'), { variant: 'ghost' }),
    ),
  );
}

export function openResult(ui: Ui, opts: ResultOptions): ModalHandle {
  const { outcome } = opts;
  const won = outcome.result.winner === 'attacker';
  const done = (): void => {
    modal.close();
    opts.onDone();
  };

  const modal = openModal({ className: ['result-panel', won ? 'won' : 'lost'].join(' '), dismissible: false });
  modal.setContent(
    h(
      'div',
      { class: 'result-hero' },
      h('div', { class: 'result-rays', attrs: { 'aria-hidden': 'true' } }),
      h('div', { class: 'result-icon' }, won ? '🏆' : '💀'),
      h('div', { class: 'result-title' }, won ? 'ZAFER' : 'YENİLGİ'),
      h('div', { class: 'result-sub' }, `${opts.title} · ${outcome.result.rounds} tur`),
    ),
    won ? h('div', { class: 'result-rewards' }, sectionTitle('Ödüller'), rewardList(outcome.rewards, 'Bu savaştan ödül yok')) : lossTips(ui, done),
    damageMeter(outcome, opts.model),
  );
  mount(
    modal.footer,
    opts.next
      ? button(opts.next.label, () => {
          done();
          opts.next?.run();
        })
      : null,
    button('Devam', done, { variant: 'primary' }),
  );
  return modal;
}
