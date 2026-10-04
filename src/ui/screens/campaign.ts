// Kampanya (home): chapter progress, live-ticking idle chest with "Topla", next stage card with "Savaş".
import { STAGES_PER_CHAPTER, campaignEnemies, idleRatePerHour, stageFirstClearRewards, stageLabel, stagePower } from '../../core/campaign';
import { IDLE_CAP_HOURS } from '../../core/constants';
import type { BattleUnitSetup } from '../../core/types';
import { button, portrait, powerCompare, progressBar, progressBarWidth, rewardAmountText, rewardList, sectionTitle } from '../components';
import { blockedBySave, safely, type Screen, type Ui } from '../context';
import { h, mount } from '../dom';
import { fightCampaign } from '../flows';
import { chapterName, fmtDuration, fmtNum, fraction, rewardEntries, rewardSummary } from '../format';
import { openFormation } from '../modals/formation';
import { Timers } from '../timers';

const HOUR_MS = 3_600_000;
const CAP_MS = IDLE_CAP_HOURS * HOUR_MS;

function chapterOf(stage: number): number {
  return Math.ceil(stage / STAGES_PER_CHAPTER);
}

/** CSS-drawn treasure chest. */
function chest(): HTMLElement {
  return h(
    'div',
    { class: 'chest', attrs: { 'aria-hidden': 'true' } },
    h('div', { class: 'chest-glow' }),
    h('div', { class: 'chest-lid' }, h('div', { class: 'chest-band' })),
    h('div', { class: 'chest-body' }, h('div', { class: 'chest-band' }), h('div', { class: 'chest-lock' })),
    h('div', { class: 'chest-sparkles' }, h('span', null, '✦'), h('span', null, '✧'), h('span', null, '✦')),
  );
}

function chapterTrack(nextStage: number): HTMLElement {
  const chapter = chapterOf(nextStage);
  const first = (chapter - 1) * STAGES_PER_CHAPTER + 1;
  const dots = Array.from({ length: STAGES_PER_CHAPTER }, (_, i) => {
    const stage = first + i;
    const boss = (i + 1) % STAGES_PER_CHAPTER === 0;
    const state = stage < nextStage ? 'done' : stage === nextStage ? 'current' : 'locked';
    return h('span', { class: ['track-dot', state, boss && 'boss'], attrs: { title: stageLabel(stage) } }, boss ? '👑' : '');
  });
  return h(
    'div',
    { class: 'scene' },
    h('div', { class: 'scene-sky', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'scene-moon' }), h('span', { class: 'scene-hills' })),
    h('div', { class: 'scene-text' }, h('span', { class: 'scene-chapter' }, `Bölüm ${chapter}`), h('h1', { class: 'scene-name' }, chapterName(chapter))),
    h('div', { class: 'track' }, dots),
  );
}

function enemyLineup(enemies: (BattleUnitSetup | null)[]): HTMLElement {
  const units = enemies.filter((e): e is BattleUnitSetup => e !== null);
  return h(
    'div',
    { class: 'lineup' },
    units.map((u) => h('div', { class: 'lineup-unit' }, portrait(u.heroId, 'xs'), h('span', { class: 'lineup-lv' }, `Sv.${u.level}`))),
  );
}

export function createCampaignScreen(ui: Ui): Screen {
  const el = h('section', { class: 'screen campaign-screen' });
  const timers = new Timers();
  const idleRefs = { timer: h('span'), bar: h('div'), loot: h('div'), chest: h('div') };
  /** Reward keys of the chips currently shown in idleRefs.loot (null = not rendered yet). */
  let shownLoot: string | null = null;

  /**
   * Runs every second: updates the existing nodes in place. Rebuilding them would restart the bar's width
   * transition and "full" shimmer every tick and drop the chips' hover titles.
   */
  function updateIdle(): void {
    const { game } = ui;
    const elapsed = Math.max(0, Math.min(CAP_MS, game.now() - game.state.campaign.idleSince));
    const preview = safely(() => game.idlePreview(), { resources: {} });
    const full = elapsed >= CAP_MS;
    idleRefs.timer.textContent = `${fmtDuration(elapsed)} / ${fmtDuration(CAP_MS)}`;
    const bar = idleRefs.bar.firstElementChild as HTMLElement | null;
    const fill = bar?.querySelector<HTMLElement>('.pbar-fill');
    if (bar && fill) {
      fill.style.width = progressBarWidth(fraction(elapsed, CAP_MS));
      bar.classList.toggle('full', full);
      bar.classList.toggle('idle', !full);
    } else {
      mount(idleRefs.bar, progressBar(fraction(elapsed, CAP_MS), full ? 'full' : 'idle'));
    }
    const rows = rewardEntries(preview);
    const loot = rows.map((r) => r.key).join('|');
    const amounts = idleRefs.loot.querySelectorAll<HTMLElement>('.reward-amount');
    if (loot === shownLoot && amounts.length === rows.length) {
      rows.forEach((r, i) => {
        const text = rewardAmountText(r.amount);
        if (amounts[i].textContent !== text) amounts[i].textContent = text;
      });
    } else {
      shownLoot = loot;
      mount(idleRefs.loot, rewardList(preview, 'Sandık doluyor…'));
    }
    idleRefs.chest.classList.toggle('has-loot', rows.length > 0);
    idleRefs.chest.classList.toggle('full', full);
  }

  function claim(): void {
    const { game } = ui;
    // A stale tab's claimIdle() collects nothing: say why instead of toasting an empty "Toplandı".
    if (blockedBySave(ui)) return;
    const preview = safely(() => game.idlePreview(), { resources: {} });
    if (rewardEntries(preview).length === 0) {
      ui.toast('Sandık henüz boş — biraz bekle.', 'info');
      return;
    }
    try {
      const got = game.claimIdle();
      if (rewardEntries(got).length === 0) {
        ui.toast(game.saveWarning() ?? 'Sandık henüz boş — biraz bekle.', game.saveProblem === 'conflict' ? 'error' : 'info');
        return;
      }
      ui.toast(`Toplandı: ${rewardSummary(got)}`, 'reward');
    } catch (err) {
      console.warn('claimIdle failed', err);
      ui.toast('Ödüller toplanamadı.', 'error');
    }
  }

  function idleCard(): HTMLElement {
    const cleared = ui.game.state.campaign.cleared;
    const rate = safely(() => idleRatePerHour(cleared), { resources: {} });
    idleRefs.timer = h('span', { class: 'idle-timer' });
    idleRefs.bar = h('div', { class: 'idle-bar' });
    idleRefs.loot = h('div', { class: 'idle-loot' });
    shownLoot = null;
    idleRefs.chest = h('div', { class: 'idle-chest' }, chest());
    return h(
      'div',
      { class: 'card idle-card' },
      h(
        'div',
        { class: 'idle-top' },
        idleRefs.chest,
        h(
          'div',
          { class: 'idle-info' },
          h('div', { class: 'idle-title' }, 'Ganimet Sandığı'),
          idleRefs.timer,
          idleRefs.bar,
          h('div', { class: 'idle-rate' }, 'Saatlik: ', rewardEntries(rate).slice(0, 3).map((r) => h('span', { class: 'rate-item' }, `${r.icon} ${fmtNum(r.amount)}`))),
        ),
      ),
      idleRefs.loot,
      button('Topla', claim, { variant: 'gold', class: 'btn-block' }),
    );
  }

  function stageCard(): HTMLElement {
    const { game } = ui;
    const stage = game.state.campaign.cleared + 1;
    const boss = stage % STAGES_PER_CHAPTER === 0;
    const enemies = safely(() => campaignEnemies(stage), []);
    const enemyPower = safely(() => stagePower(stage), 0);
    const teamPower = safely(() => game.teamPower(), 0);
    return h(
      'div',
      { class: ['card stage-card', boss && 'boss'] },
      h(
        'div',
        { class: 'stage-head' },
        h('div', null, h('div', { class: 'stage-kicker' }, boss ? '👑 Bölüm Sonu' : 'Sıradaki Aşama'), h('div', { class: 'stage-label' }, `Aşama ${stageLabel(stage)}`)),
        enemyLineup(enemies),
      ),
      powerCompare(teamPower, enemyPower),
      sectionTitle('İlk Geçiş Ödülü'),
      rewardList(safely(() => stageFirstClearRewards(stage), null)),
      // Sticky: the main action stays on screen above the tab bar even when the card is below the fold.
      h(
        'div',
        { class: 'btn-row stage-actions' },
        button('👥 Takım', () => openFormation(ui), { variant: 'secondary' }),
        button('⚔️ Savaş', () => fightCampaign(ui), { variant: 'primary', class: 'btn-grow btn-fight', sub: `Aşama ${stageLabel(stage)}` }),
      ),
    );
  }

  return {
    el,
    render(): void {
      const stage = ui.game.state.campaign.cleared + 1;
      mount(el, chapterTrack(stage), idleCard(), stageCard());
      updateIdle();
    },
    show(): void {
      timers.clear();
      timers.every(1000, updateIdle);
    },
    hide(): void {
      timers.clear();
    },
  };
}
