// Full-screen battle playback: steps through BattleResult.events with speed-scaled timers,
// supports ×1/×2/×4 and "Atla", then opens the result modal.
import { MAX_ROUNDS, STATUS_INFO } from '../../core/constants';
import type { FightOutcome } from '../../core/game';
import type { BattleEvent } from '../../core/types';
import { BattleModel } from '../battle/model';
import { SPEEDS, delayAfter, type Speed } from '../battle/timing';
import { BattleView } from '../battle/view';
import type { Ui } from '../context';
import { h } from '../dom';
import { fmtBuff, fmtNum } from '../format';
import { openModal } from '../overlay';
import { Timers } from '../timers';
import { openResult } from './result';

const SPEED_KEY = 'dk-battle-speed';

export interface BattleOptions {
  outcome: FightOutcome;
  /** Header title, e.g. "Aşama 1-3". */
  title: string;
  /** Secondary result button ("Sonraki Aşama" / "Tekrar Dene"); hidden when absent. */
  next?: { winLabel: string; lossLabel: string; run: () => void };
  onClose?: () => void;
}

function loadSpeed(): Speed {
  try {
    const saved = Number(localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(saved) ? (saved as Speed) : 1;
  } catch {
    return 1;
  }
}

function saveSpeed(speed: Speed): void {
  try {
    localStorage.setItem(SPEED_KEY, String(speed));
  } catch {
    // storage unavailable (private mode): speed simply is not remembered
  }
}

export function openBattle(ui: Ui, opts: BattleOptions): void {
  const { result } = opts.outcome;
  const events = result.events;
  const timers = new Timers();
  const model = new BattleModel(result.initial);
  const view = new BattleView(model, timers);
  let speed = loadSpeed();
  let index = 0;
  let finished = false;

  const roundLabel = h('span', { class: 'bt-round' }, `Tur 0/${MAX_ROUNDS}`);
  const speedBtn = h('button', { class: 'bt-btn', attrs: { type: 'button', 'aria-label': 'Hız' }, onClick: cycleSpeed });
  const skipBtn = h('button', { class: 'bt-btn bt-skip', attrs: { type: 'button' }, onClick: skip }, 'Atla ⏭');
  const header = h('div', { class: 'bt-header' }, roundLabel, h('span', { class: 'bt-title' }, opts.title), h('div', { class: 'bt-controls' }, speedBtn, skipBtn));

  const modal = openModal(
    { bare: true, dismissible: false, className: 'battle-screen', onClose: () => timers.clear() },
    h('div', { class: 'battle' }, header, view.el),
  );

  function applySpeed(): void {
    speedBtn.textContent = `×${speed}`;
    view.setSpeed(speed);
  }

  function cycleSpeed(): void {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    saveSpeed(speed);
    applySpeed();
  }

  function present(ev: BattleEvent): void {
    switch (ev.t) {
      case 'roundStart':
        roundLabel.textContent = `Tur ${ev.round}/${MAX_ROUNDS}`;
        view.roundBanner(ev.round, MAX_ROUNDS);
        return;
      case 'action':
        if (ev.kind === 'skill') {
          view.skillBanner(ev.actor, ev.skillName ?? 'Yetenek');
          view.pulse(ev.actor, 'casting', 900);
        }
        if (ev.targets[0]?.side !== ev.actor.side) view.lunge(ev.actor, ev.targets[0]);
        view.syncRef(ev.actor);
        return;
      case 'damage':
        view.syncRef(ev.target);
        presentDamage(ev);
        return;
      case 'dodge':
        view.float(ev.target, 'Iska', 'dodge');
        return;
      case 'heal':
        view.syncRef(ev.target);
        view.float(ev.target, `+${fmtNum(ev.amount)}`, 'heal');
        return;
      case 'energy':
        view.syncRef(ev.target);
        return;
      case 'status':
        view.syncRef(ev.target);
        if (ev.on) view.float(ev.target, `${STATUS_INFO[ev.status]?.icon ?? ''} ${STATUS_INFO[ev.status]?.name ?? ev.status}`, 'status');
        return;
      case 'buff':
        view.syncRef(ev.target);
        view.float(ev.target, `${ev.amount >= 0 ? '▲' : '▼'} ${fmtBuff(ev.stat, ev.amount)}`, ev.amount >= 0 ? 'buff' : 'debuff');
        return;
      case 'passive':
        view.float(ev.actor, `✦ ${ev.name}`, 'passive');
        view.pulse(ev.actor, 'passive-glow', 500);
        return;
      case 'skip':
        view.float(ev.actor, `${STATUS_INFO[ev.reason]?.icon ?? ''} Atladı`, 'status');
        view.pulse(ev.actor, 'skipping', 500);
        return;
      case 'death':
        view.syncRef(ev.target);
        view.float(ev.target, '💀', 'death');
        return;
      case 'battleEnd':
        return;
    }
  }

  function presentDamage(ev: Extract<BattleEvent, { t: 'damage' }>): void {
    if (ev.kind === 'dot') {
      const dot = [...(model.unit(ev.target)?.statuses.keys() ?? [])].find((s) => s === 'burn' || s === 'poison' || s === 'bleed');
      view.float(ev.target, `${dot ? STATUS_INFO[dot].icon : ''}-${fmtNum(ev.amount)}`, 'dot');
      return;
    }
    view.hit(ev.target, ev.crit);
    if (ev.crit) view.float(ev.target, `-${fmtNum(ev.amount)}!`, 'crit');
    else view.float(ev.target, `-${fmtNum(ev.amount)}`, ev.kind === 'skill' ? 'skill' : 'dmg');
  }

  function step(): void {
    if (modal.closed || finished) return;
    const ev = events[index++];
    if (!ev) return finish(false);
    model.apply(ev);
    present(ev);
    if (ev.t === 'battleEnd') return finish(false);
    timers.after(delayAfter(ev, events[index]) / speed, step);
  }

  function skip(): void {
    if (finished) return;
    timers.clear();
    view.el.querySelectorAll('.float, .skill-banner, .round-banner').forEach((el) => el.remove());
    while (index < events.length) model.apply(events[index++]);
    roundLabel.textContent = `Tur ${result.rounds}/${MAX_ROUNDS}`;
    view.syncAll();
    finish(true);
  }

  function finish(instant: boolean): void {
    if (finished) return;
    finished = true;
    skipBtn.disabled = true;
    timers.after(instant ? 120 : 800 / speed, showResult);
  }

  function showResult(): void {
    if (modal.closed) return;
    const won = result.winner === 'attacker';
    openResult(ui, {
      outcome: opts.outcome,
      title: opts.title,
      model,
      next: opts.next ? { label: won ? opts.next.winLabel : opts.next.lossLabel, run: opts.next.run } : undefined,
      onDone: () => {
        modal.close();
        opts.onClose?.();
      },
    });
  }

  applySpeed();
  timers.after(450, step);
}
