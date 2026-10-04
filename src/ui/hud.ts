// Stage HUD over the town and the screens: player plate (hub) or back button + title (screens), resource
// pills with "+" buttons, settings, and on the hub the left round buttons, chapter progress with the idle
// chest (live counter) and the bottom-right icon row.
import { icon, type IconName } from '../art';
import { STAGES_PER_CHAPTER, stageLabel } from '../core/campaign';
import { IDLE_CAP_HOURS } from '../core/constants';
import { playerExpToNext } from '../core/progression';
import type { ResourceKey } from '../core/types';
import { portrait, progressBar, roundButton } from './components';
import { safely, type TabId, type Ui } from './context';
import { h, mount } from './dom';
import { claimIdle } from './flows';
import { RESOURCE_INFO, chapterName, fmtDuration, fmtNum, fraction, rewardEntries } from './format';
import { navBadges } from './hints';
import { openBag } from './modals/bag';
import { openFormation } from './modals/formation';
import { openSettings } from './modals/settings';

const TOP_RESOURCES: ResourceKey[] = ['gold', 'spirit', 'gems'];
const CAP_MS = IDLE_CAP_HOURS * 3_600_000;

export const SCREEN_TITLES: Record<Exclude<TabId, 'hub'>, string> = {
  campaign: 'Sefer Kapısı',
  heroes: 'Kahramanlar Salonu',
  summon: 'Yıldız Sunağı',
  tower: 'Kadim Kule',
};

export interface Hud {
  readonly el: HTMLElement;
  render(active: TabId): void;
  /** Once a second: idle chest counter and glow. */
  tick(): void;
}

export function createHud(ui: Ui): Hud {
  const el = h('div', { class: 'hud' });
  const lastAmounts = new Map<ResourceKey, number>();
  const chestRefs = { btn: null as HTMLElement | null, timer: null as HTMLElement | null };
  let active: TabId = 'hub';

  function soon(what: string): void {
    ui.toast(`${what} yakında!`, 'info');
  }

  function plusFor(key: ResourceKey): () => void {
    if (key === 'gems') return () => soon('Yakut mağazası');
    return () => {
      ui.toast(`${RESOURCE_INFO[key].name} kazanmak için aşamaları geç ve ganimet sandığını topla.`, 'info');
      ui.goTo('campaign');
    };
  }

  function pills(): HTMLElement {
    const { resources } = ui.game.state;
    return h(
      'div',
      { class: 'hud-pills' },
      TOP_RESOURCES.map((key) => {
        const amount = resources[key];
        const before = lastAmounts.get(key);
        lastAmounts.set(key, amount);
        const change = before === undefined || before === amount ? null : amount > before ? 'up' : 'down';
        return h(
          'div',
          { class: ['pill', `pill-${key}`, change && `bump-${change}`], attrs: { title: RESOURCE_INFO[key].name } },
          h('span', { class: 'pill-icon', attrs: { 'aria-hidden': 'true' } }, icon(RESOURCE_INFO[key].icon, 46)),
          h('span', { class: 'pill-value', attrs: { 'aria-label': `${RESOURCE_INFO[key].name}: ${amount}` } }, fmtNum(amount)),
          h('button', { class: 'pill-plus', attrs: { type: 'button', 'aria-label': `${RESOURCE_INFO[key].name} kazan` }, onClick: plusFor(key) }, icon('plus', 30)),
        );
      }),
    );
  }

  /** Leader of the team (first filled slot) as the player avatar. */
  function avatarHero(): string | null {
    const { formation } = ui.game.state;
    for (const uid of formation) {
      const hero = uid ? ui.game.hero(uid) : undefined;
      if (hero) return hero.heroId;
    }
    return ui.game.state.heroes[0]?.heroId ?? null;
  }

  function playerPlate(): HTMLElement {
    const { player } = ui.game.state;
    const toNext = safely(() => playerExpToNext(player.level), 0);
    const frac = fraction(player.exp, toNext);
    const heroId = avatarHero();
    return h(
      'button',
      { class: 'hud-player', attrs: { type: 'button', 'aria-label': `${player.name}, seviye ${player.level} — ayarlar` }, onClick: () => openSettings(ui) },
      h(
        'span',
        { class: 'avatar', style: { '--exp': `${Math.round(frac * 360)}deg` } },
        h('span', { class: 'avatar-ring' }),
        heroId ? portrait(heroId, 62, 'avatar-portrait') : h('span', { class: 'avatar-empty' }, icon('helmet', 40)),
        h('span', { class: 'avatar-lv' }, String(player.level)),
      ),
      h(
        'span',
        { class: 'player-info' },
        h('span', { class: 'player-name' }, player.name),
        h('span', { class: 'player-exp' }, progressBar(frac, 'exp'), h('span', { class: 'player-exp-text' }, `${fmtNum(player.exp)}/${fmtNum(toNext)}`)),
      ),
    );
  }

  function backBar(tab: Exclude<TabId, 'hub'>): HTMLElement {
    return h(
      'div',
      { class: 'hud-back' },
      h('button', { class: 'back-btn', attrs: { type: 'button', 'aria-label': 'Kasabaya dön' }, onClick: () => ui.goTo('hub') }, icon('back', 44)),
      h('h1', { class: 'hud-title' }, SCREEN_TITLES[tab]),
    );
  }

  function leftColumn(): HTMLElement {
    return h(
      'div',
      { class: 'hud-left' },
      roundButton('chat', 'Sohbet', () => soon('Sohbet'), { caption: 'Sohbet' }),
      roundButton('quest', 'Görevler', () => soon('Görevler'), { caption: 'Görevler', dot: true }),
      roundButton('mail', 'Posta', () => soon('Posta'), { caption: 'Posta', dot: true }),
    );
  }

  /** Top-right cluster under the settings gear (events & rewards; placeholders for now). */
  function rightColumn(): HTMLElement {
    return h(
      'div',
      { class: 'hud-right' },
      roundButton('chest', 'Günlük Ödül', () => soon('Günlük ödül'), { caption: 'Günlük Ödül', dot: true, class: 'hud-event', size: 42 }),
      roundButton('trophy', 'Başarımlar', () => soon('Başarımlar'), { caption: 'Başarımlar', dot: true, class: 'hud-event', size: 40 }),
    );
  }

  function progressCard(): HTMLElement {
    const { campaign } = ui.game.state;
    const next = campaign.cleared + 1;
    const chapter = Math.ceil(next / STAGES_PER_CHAPTER);
    const inChapter = campaign.cleared - (chapter - 1) * STAGES_PER_CHAPTER;
    chestRefs.timer = h('span', { class: 'chest-timer' });
    chestRefs.btn = h(
      'button',
      { class: 'chest-btn', attrs: { type: 'button', 'aria-label': 'Ganimet sandığını topla' }, onClick: () => claimIdle(ui) },
      h('span', { class: 'chest-rays', attrs: { 'aria-hidden': 'true' } }),
      icon('chest', 70),
      chestRefs.timer,
    );
    return h(
      'div',
      { class: 'hud-progress' },
      chestRefs.btn,
      h(
        'button',
        { class: 'progress-plate', attrs: { type: 'button', 'aria-label': `Bölüm ${chapter}, ${inChapter}/${STAGES_PER_CHAPTER} — Sefer Kapısı'na git` }, onClick: () => ui.goTo('campaign') },
        h('span', { class: 'progress-chapter' }, `Bölüm ${chapter} · ${inChapter}/${STAGES_PER_CHAPTER}`),
        h('span', { class: 'progress-name' }, `${chapterName(chapter)} — Aşama ${stageLabel(next)}`),
        progressBar(fraction(inChapter, STAGES_PER_CHAPTER), 'chapter'),
      ),
    );
  }

  function bottomRow(): HTMLElement {
    const badges = safely(() => navBadges(ui.game.state, ui.game.now()), {});
    const item = (iconName: IconName, label: string, onClick: () => void, dot = false): HTMLElement =>
      roundButton(iconName, label, onClick, { caption: label, dot, class: 'dock-btn', size: 46 });
    return h(
      'nav',
      { class: 'hud-dock', attrs: { 'aria-label': 'Hızlı menü' } },
      item('helmet', 'Kahramanlar', () => ui.goTo('heroes'), !!badges.heroes),
      item('bag', 'Çanta', () => openBag(ui)),
      item('heroicScroll', 'Çağır', () => ui.goTo('summon'), !!badges.summon),
      item('team', 'Takım', () => openFormation(ui)),
    );
  }

  function tick(): void {
    const { btn, timer } = chestRefs;
    if (!btn || !timer || !btn.isConnected) return;
    const { game } = ui;
    const elapsed = Math.max(0, Math.min(CAP_MS, game.now() - game.state.campaign.idleSince));
    const hasLoot = safely(() => rewardEntries(game.idlePreview()).length > 0, false);
    timer.textContent = fmtDuration(elapsed);
    btn.classList.toggle('has-loot', hasLoot);
    btn.classList.toggle('full', elapsed >= CAP_MS);
  }

  function render(tab: TabId): void {
    active = tab;
    const hub = active === 'hub';
    el.classList.toggle('on-hub', hub);
    mount(
      el,
      h(
        'div',
        { class: 'hud-top' },
        hub ? playerPlate() : backBar(active as Exclude<TabId, 'hub'>),
        pills(),
        hub ? roundButton('settings', 'Ayarlar', () => openSettings(ui), { class: 'hud-settings' }) : null,
      ),
      hub ? [leftColumn(), rightColumn(), progressCard(), bottomRow()] : null,
    );
    if (hub) tick();
  }

  return { el, render, tick };
}
