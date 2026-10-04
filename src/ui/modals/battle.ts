// Full-stage battle playback: steps through BattleResult.events with speed-scaled timers and stages each
// event on the side-view battlefield (see ../battle/view.ts); ×1/×2/×4 and "Atla", then the result screen.
import { icon } from '../../art';
import type { SceneKind } from '../../art/types';
import { MAX_ROUNDS } from '../../core/constants';
import type { FightOutcome } from '../../core/game';
import type { BattleEvent } from '../../core/types';
import { planSkill, sceneForBattle } from '../battle/choreo';
import { BattleModel } from '../battle/model';
import { ENTRANCE_MS, IMPACT_BASIC_MS, SPEEDS, delayAfter, type Speed } from '../battle/timing';
import { BattleView } from '../battle/view';
import type { Ui } from '../context';
import { h } from '../dom';
import { openModal } from '../overlay';
import { Timers } from '../timers';
import { openResult } from './result';

const SPEED_KEY = 'dk-battle-speed';

export interface BattleOptions {
  outcome: FightOutcome;
  /** Header title, e.g. "Aşama 1-3" or "Kule · Kat 7". */
  title: string;
  /** Secondary result button ("Sonraki Aşama" / "Tekrar Dene"); hidden when absent. */
  next?: { winLabel: string; lossLabel: string; run: () => void };
  /** Account level-up caused by this fight's rewards, announced on the result screen. */
  levelUp?: { from: number; to: number } | null;
  /** Painted backdrop; by default derived from the title / stage (tower hall, chapter cycle, boss scenes). */
  scene?: SceneKind;
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
  const tower = /^\s*kule/i.test(opts.title);
  const view = new BattleView(model, timers, {
    scene: opts.scene ?? sceneForBattle(opts.title, opts.outcome.level),
    title: opts.title,
    maxRounds: MAX_ROUNDS,
    tower,
  });
  let speed = loadSpeed();
  let index = 0;
  let finished = false;

  const speedVal = h('span', { class: 'bt-speed-val' });
  const glyph = h('span', { class: 'bt-speed-glyph', attrs: { 'aria-hidden': 'true' } });
  // Double chevron "fast forward" glyph (our own button language, matching "Atla").
  glyph.innerHTML =
    '<svg viewBox="0 0 30 22" width="30" height="22" xmlns="http://www.w3.org/2000/svg"><g fill="#fff" stroke="#0c2a56" stroke-width="2.4" stroke-linejoin="round">' +
    '<path d="M2 3h6l8 8-8 8H2l8-8z"/><path d="M13 3h6l8 8-8 8h-6l8-8z"/></g></svg>';
  const speedBtn = h('button', { class: 'bt-btn bt-speed', attrs: { type: 'button', title: 'Savaş hızı' }, onClick: cycleSpeed }, glyph, speedVal);
  const skipBtn = h(
    'button',
    { class: 'bt-btn bt-skip', attrs: { type: 'button', 'aria-label': 'Atla — savaşın sonucuna geç' }, onClick: skip },
    h('span', { class: 'bt-skip-txt' }, 'Atla'),
    icon('skip', 26),
  );
  view.controls.append(speedBtn, skipBtn);

  const modal = openModal(
    {
      bare: true,
      dismissible: false,
      className: 'battle-screen',
      onClose: () => {
        timers.clear();
        view.destroy();
      },
    },
    view.el,
  );
  modal.root.classList.add('bt-layer');

  function applySpeed(): void {
    speedVal.textContent = `×${speed}`;
    // The label must carry the value: an aria-label replaces the visible "×2" for screen readers.
    speedBtn.setAttribute('aria-label', `Hız ×${speed}`);
    view.setSpeed(speed);
  }

  function cycleSpeed(): void {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    saveSpeed(speed);
    applySpeed();
  }

  function present(ev: BattleEvent, at: number): void {
    switch (ev.t) {
      case 'roundStart':
        view.beginTurn(null);
        view.roundBanner(ev.round, MAX_ROUNDS);
        // The model drops expired buffs at round start: refresh every bar, not only the ones that act.
        view.syncAll();
        return;
      case 'action':
        if (ev.kind === 'skill') view.castSkill(ev.actor, ev.skillName ?? 'Yetenek', planSkill(events, at));
        else view.basicAttack(ev.actor, ev.targets[0], IMPACT_BASIC_MS);
        view.syncRef(ev.actor);
        return;
      case 'damage':
        view.damage(ev.target, ev.source, ev.amount, ev.crit, ev.kind);
        return;
      case 'dodge':
        view.dodge(ev.target);
        return;
      case 'heal':
        view.heal(ev.target, ev.amount);
        return;
      case 'energy':
      case 'buffEnd':
        view.syncRef(ev.target);
        return;
      case 'status':
        view.status(ev.target, ev.status, ev.on);
        return;
      case 'buff':
        view.buff(ev.target, ev.stat, ev.amount);
        return;
      case 'passive':
        view.passive(ev.actor, ev.name);
        return;
      case 'skip':
        view.skipTurn(ev.actor, ev.reason);
        return;
      case 'death':
        view.die(ev.target);
        return;
      case 'battleEnd':
        view.victory(ev.winner);
        return;
    }
  }

  function step(): void {
    if (modal.closed || finished) return;
    const at = index++;
    const ev = events[at];
    if (!ev) return finish(false);
    model.apply(ev);
    present(ev, at);
    if (ev.t === 'battleEnd') return finish(false);
    timers.after(delayAfter(ev, events[index]) / speed, step);
  }

  function skip(): void {
    if (finished) return;
    timers.clear();
    while (index < events.length) model.apply(events[index++]);
    view.setRound(result.rounds);
    // Clearing the timers also cancelled the cleanup of in-flight effects: the view drops them itself.
    view.settle();
    view.victory(result.winner);
    finish(true);
  }

  function finish(instant: boolean): void {
    if (finished) return;
    finished = true;
    skipBtn.disabled = true;
    timers.after(instant ? 150 : 1150 / speed, showResult);
  }

  function showResult(): void {
    if (modal.closed) return;
    const won = result.winner === 'attacker';
    openResult(ui, {
      outcome: opts.outcome,
      title: opts.title,
      model,
      levelUp: opts.levelUp ?? null,
      next: opts.next ? { label: won ? opts.next.winLabel : opts.next.lossLabel, run: opts.next.run } : undefined,
      onDone: () => {
        modal.close();
        opts.onClose?.();
      },
    });
  }

  applySpeed();
  // The screen first goes dark (bt-layer wipe, ~180 ms); the teams run in as the battle fades in, and
  // round 1 starts once the wipe is over.
  view.entrance(WIPE_DARK_MS);
  timers.after(WIPE_DARK_MS + ENTRANCE_MS / speed, step);
}

/** Dark half of the screen wipe into a battle (see .bt-layer in battle.css). */
const WIPE_DARK_MS = 180;
