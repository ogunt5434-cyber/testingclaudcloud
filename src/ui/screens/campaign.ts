// Sefer Kapısı (campaign): chapter map with stage nodes along a trail over the chapter's painted scene,
// the next stage's panel (enemy lineup, power comparison, first-clear rewards, "Savaş" -> formation confirm)
// and the live-ticking idle chest with "Topla".
import { heroSprite, icon } from '../../art';
import { STAGES_PER_CHAPTER, campaignEnemies, idleRatePerHour, stageFirstClearRewards, stageLabel, stagePower } from '../../core/campaign';
import { IDLE_CAP_HOURS } from '../../core/constants';
import type { BattleUnitSetup } from '../../core/types';
import { chapterScene, createBackdrop } from '../backdrop';
import { button, lineup, powerCompare, progressBar, progressBarWidth, rewardAmountText, rewardList, ribbon, sectionTitle } from '../components';
import { safely, type Screen, type Ui } from '../context';
import { h, mount } from '../dom';
import { claimIdle, prepareCampaignFight } from '../flows';
import { chapterName, fmtDuration, fmtNum, fraction, rewardEntries } from '../format';
import { openFormation } from '../modals/formation';
import { Timers } from '../timers';

const HOUR_MS = 3_600_000;
const CAP_MS = IDLE_CAP_HOURS * HOUR_MS;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Stage node positions on the 776x470 map (a trail that snakes right, then back left to the boss). */
const NODE_POS: readonly [number, number][] = [
  [70, 392],
  [200, 350],
  [330, 396],
  [462, 350],
  [592, 392],
  [706, 270],
  [600, 182],
  [468, 222],
  [336, 176],
  [176, 214],
];

function chapterOf(stage: number): number {
  return Math.ceil(stage / STAGES_PER_CHAPTER);
}

/** Smooth trail through the nodes (Catmull-Rom -> cubic Bézier). */
function trailPath(points: readonly [number, number][]): string {
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function trailSvg(doneUpTo: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'map-trail');
  svg.setAttribute('viewBox', '0 0 776 470');
  svg.setAttribute('aria-hidden', 'true');
  const all = trailPath(NODE_POS);
  const done = doneUpTo > 0 ? trailPath(NODE_POS.slice(0, doneUpTo + 1)) : '';
  const path = (d: string, cls: string): SVGPathElement => {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    return p;
  };
  svg.append(path(all, 'trail-edge'), path(all, 'trail-base'), path(all, 'trail-dash'));
  if (done) svg.append(path(done, 'trail-done'));
  return svg;
}

/** The strongest enemy stands guard on the current node. */
function guardOf(enemies: (BattleUnitSetup | null)[]): BattleUnitSetup | null {
  let best: BattleUnitSetup | null = null;
  for (const e of enemies) if (e && (!best || e.stars * 1000 + e.level > best.stars * 1000 + best.level)) best = e;
  return best;
}

function chapterMap(nextStage: number, enemies: (BattleUnitSetup | null)[], onFight: () => void): HTMLElement {
  const chapter = chapterOf(nextStage);
  const first = (chapter - 1) * STAGES_PER_CHAPTER + 1;
  const currentIndex = nextStage - first;
  const nodes = NODE_POS.map(([x, y], i) => {
    const stage = first + i;
    const boss = i === STAGES_PER_CHAPTER - 1;
    const state = stage < nextStage ? 'done' : stage === nextStage ? 'current' : 'locked';
    // Locked nodes show the reward chest waiting there (with a small lock), the boss its trophy.
    const glyph = state === 'done' ? 'star' : state === 'current' ? 'swords' : boss ? 'trophy' : 'chest';
    const label = `Aşama ${stageLabel(stage)}${state === 'done' ? ' — geçildi' : state === 'current' ? ' — sıradaki' : ' — kilitli'}`;
    return h(
      state === 'current' ? 'button' : 'div',
      {
        class: ['map-node', state, boss && 'boss'],
        style: { left: `${x}px`, top: `${y}px` },
        attrs: state === 'current' ? { type: 'button', 'aria-label': `${label}: savaş` } : { role: 'img', 'aria-label': label },
        onClick: state === 'current' ? onFight : undefined,
      },
      boss ? h('span', { class: 'node-crown', attrs: { 'aria-hidden': 'true' } }) : null,
      h('span', { class: 'node-disc' }, icon(glyph, boss ? 48 : 32), state === 'locked' && !boss ? h('span', { class: 'node-lock' }, icon('lock', 18)) : null),
      h('span', { class: 'node-label' }, stageLabel(stage)),
    );
  });
  const guard = guardOf(enemies);
  const [gx, gy] = NODE_POS[Math.max(0, Math.min(NODE_POS.length - 1, currentIndex))];
  let guardEl: HTMLElement | null = null;
  if (guard) {
    try {
      guardEl = h('div', { class: 'map-guard', style: { left: `${gx + 50}px`, top: `${gy - 4}px` } }, heroSprite(guard.heroId, { facing: 'left' }));
    } catch {
      guardEl = null;
    }
  }
  return h(
    'div',
    { class: 'campaign-map' },
    trailSvg(Math.max(0, currentIndex)),
    guardEl,
    nodes,
    h(
      'div',
      { class: 'map-title' },
      ribbon(`Bölüm ${chapter}`, 'red', 'map-ribbon'),
      h('div', { class: 'map-name display-title' }, chapterName(chapter)),
    ),
  );
}

export function createCampaignScreen(ui: Ui): Screen {
  const backdrop = createBackdrop();
  const content = h('div', { class: 'screen-content' });
  const el = h('section', { class: 'screen campaign-screen', attrs: { 'aria-label': 'Sefer Kapısı' } }, backdrop.el, content);
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

  function idleCard(): HTMLElement {
    idleRefs.timer = h('span', { class: 'idle-timer' });
    idleRefs.bar = h('div', { class: 'idle-bar' });
    idleRefs.loot = h('div', { class: 'idle-loot' });
    shownLoot = null;
    idleRefs.chest = h('div', { class: 'idle-chest', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'chest-rays' }), icon('chest', 96));
    return h(
      'div',
      { class: 'panel panel-dark idle-card' },
      idleRefs.chest,
      h(
        'div',
        { class: 'idle-info' },
        h('div', { class: 'idle-head' }, h('span', { class: 'idle-title' }, 'Ganimet Sandığı'), idleRefs.timer),
        idleRefs.bar,
        idleRefs.loot,
      ),
      button('Topla', () => claimIdle(ui), { variant: 'gold', class: 'idle-claim', icon: 'chest' }),
    );
  }

  function stagePanel(stage: number, enemies: (BattleUnitSetup | null)[]): HTMLElement {
    const { game } = ui;
    const boss = stage % STAGES_PER_CHAPTER === 0;
    const enemyPower = safely(() => stagePower(stage), 0);
    const teamPower = safely(() => game.teamPower(), 0);
    return h(
      'div',
      { class: ['panel side-panel stage-panel', boss && 'boss'] },
      h(
        'div',
        { class: 'panel-head' },
        h('span', { class: 'panel-kicker' }, boss ? 'Bölüm Sonu Muhafızı' : 'Sıradaki Aşama'),
        h('h2', { class: 'panel-title display-title' }, `Aşama ${stageLabel(stage)}`),
      ),
      sectionTitle('Düşman Takımı'),
      lineup(enemies, 54),
      powerCompare(teamPower, enemyPower),
      sectionTitle('İlk Geçiş Ödülü'),
      rewardList(safely(() => stageFirstClearRewards(stage), null)),
      sectionTitle('Saatlik Ganimet'),
      h(
        'div',
        { class: 'rate-row' },
        rewardEntries(safely(() => idleRatePerHour(game.state.campaign.cleared), { resources: {} }))
          .slice(0, 4)
          .map((r) => h('span', { class: 'rate-item', attrs: { title: `${r.name} / saat` } }, icon(r.icon, 26), fmtNum(r.amount))),
        h('span', { class: 'rate-note' }, '/ saat'),
      ),
      h(
        'div',
        { class: 'btn-row panel-actions' },
        button('Takım', () => openFormation(ui), { variant: 'secondary', icon: 'team' }),
        button('Savaş', () => prepareCampaignFight(ui), { variant: 'primary', class: 'btn-grow btn-fight', icon: 'swords', sub: `Aşama ${stageLabel(stage)}` }),
      ),
    );
  }

  return {
    el,
    render(): void {
      const stage = ui.game.state.campaign.cleared + 1;
      backdrop.set(chapterScene(chapterOf(stage)));
      const enemies = safely(() => campaignEnemies(stage), []);
      mount(content, chapterMap(stage, enemies, () => prepareCampaignFight(ui)), idleCard(), stagePanel(stage, enemies));
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
