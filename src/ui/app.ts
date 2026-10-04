// App shell: top resource bar, tab bar, screen switching and the Ui context (toasts, change fan-out).
import { IDLE_CAP_HOURS } from '../core/constants';
import type { Game } from '../core/game';
import { playerExpToNext } from '../core/progression';
import { SAVE_KEY } from '../core/save';
import type { ResourceKey } from '../core/types';
import { safely, type Screen, type TabId, type Ui } from './context';
import { h, mount } from './dom';
import { RESOURCE_INFO, fmtNum, fraction } from './format';
import { levelUpText, saveNotice, starUpReadyUids, type SaveNotice } from './hints';
import { openSettings } from './modals/settings';
import { createCampaignScreen } from './screens/campaign';
import { createHeroesScreen } from './screens/heroes';
import { createSummonScreen } from './screens/summon';
import { createTowerScreen } from './screens/tower';
import { showToast } from './toast';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'campaign', label: 'Kampanya', icon: '🗺️' },
  { id: 'heroes', label: 'Kahramanlar', icon: '🦸' },
  { id: 'summon', label: 'Çağır', icon: '🌀' },
  { id: 'tower', label: 'Kule', icon: '🗼' },
];
const TOP_RESOURCES: ResourceKey[] = ['gold', 'spirit', 'gems'];
const TAB_KEY = 'dk-tab';
/** Show the campaign badge once the idle chest has filled this long. */
const IDLE_BADGE_MS = 60 * 60 * 1000;

function loadTab(): TabId {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return TABS.some((t) => t.id === saved) ? (saved as TabId) : 'campaign';
  } catch {
    return 'campaign';
  }
}

function saveTab(tab: TabId): void {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // storage unavailable: the tab is simply not remembered
  }
}

export function mountApp(root: HTMLElement, game: Game): Ui {
  const listeners = new Set<() => void>();
  const lastAmounts = new Map<ResourceKey, number>();
  const topBar = h('header', { class: 'topbar' });
  /** Warning shown while progress is not being saved (another tab took over, or storage is unavailable). */
  const saveBanner = h('div', { class: 'save-banner-slot', attrs: { hidden: true } });
  let shownNotice: SaveNotice | null = null;
  let unavailableDismissed = false;
  const main = h('main', { class: 'main', attrs: { id: 'main' } });
  const tabBar = h('nav', { class: 'tabbar', attrs: { 'aria-label': 'Ana menü' } });
  let active: TabId = loadTab();
  const dirty = new Set<TabId>();
  let knownLevel = game.state.player.level;
  let levelToastMuted = 0;

  const ui: Ui = {
    game,
    toast: (text, kind) => showToast(text, kind),
    goTo,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    notify: refresh,
    withoutLevelUpToast(fn) {
      levelToastMuted++;
      try {
        return fn();
      } finally {
        levelToastMuted--;
      }
    },
  };

  const screens: Record<TabId, Screen> = {
    campaign: createCampaignScreen(ui),
    heroes: createHeroesScreen(ui),
    summon: createSummonScreen(ui),
    tower: createTowerScreen(ui),
  };

  function renderTopBar(): void {
    const { player, resources } = game.state;
    const toNext = safely(() => playerExpToNext(player.level), 0);
    const pills = TOP_RESOURCES.map((key) => {
      const amount = resources[key];
      const before = lastAmounts.get(key);
      lastAmounts.set(key, amount);
      const change = before === undefined || before === amount ? null : amount > before ? 'up' : 'down';
      return h(
        'div',
        { class: ['pill', `pill-${key}`, change && `bump-${change}`], attrs: { title: RESOURCE_INFO[key].name } },
        h('span', { class: 'pill-icon' }, RESOURCE_INFO[key].icon),
        h('span', { class: 'pill-value' }, fmtNum(amount)),
      );
    });
    mount(
      topBar,
      h(
        'div',
        { class: 'tb-row' },
        h(
          'button',
          { class: 'player-plate', attrs: { type: 'button', 'aria-label': 'Oyuncu ve ayarlar' }, onClick: () => openSettings(ui) },
          h('div', { class: 'avatar' }, h('span', null, '🛡️'), h('span', { class: 'avatar-lv' }, String(player.level))),
          h('div', { class: 'player-info' }, h('span', { class: 'player-name' }, player.name), progressMini(fraction(player.exp, toNext))),
        ),
        h('div', { class: 'brand', attrs: { 'aria-hidden': 'true' } }, 'Diyar Kahramanları'),
        h('button', { class: 'gear', attrs: { type: 'button', 'aria-label': 'Ayarlar' }, onClick: () => openSettings(ui) }, '⚙️'),
      ),
      h('div', { class: 'pills' }, pills),
    );
  }

  /** Rebuilt only when the notice changes, so screen readers announce it once. */
  function renderSaveBanner(): void {
    const problem = safely(() => game.saveProblem, null);
    if (problem === null) unavailableDismissed = false;
    const notice = saveNotice(problem, unavailableDismissed);
    if (notice?.problem === shownNotice?.problem) return;
    shownNotice = notice;
    saveBanner.hidden = !notice;
    if (!notice) {
      mount(saveBanner);
      return;
    }
    const act = (): void => {
      if (notice.action === 'reload') {
        location.reload();
        return;
      }
      unavailableDismissed = true;
      renderSaveBanner();
    };
    mount(
      saveBanner,
      h(
        'div',
        { class: ['save-banner', `save-banner-${notice.problem}`], attrs: { role: 'alert' } },
        h('span', { class: 'save-banner-icon', attrs: { 'aria-hidden': 'true' } }, notice.action === 'reload' ? '🔄' : '⚠️'),
        h('span', { class: 'save-banner-text' }, notice.text),
        h('button', { class: ['btn', 'btn-small', notice.action === 'reload' ? 'btn-gold' : 'btn-secondary'], attrs: { type: 'button' }, onClick: act }, notice.label),
      ),
    );
  }

  /** Another tab may have saved meanwhile: re-check, then show or update the banner. */
  function checkSave(): void {
    safely(() => game.refreshSaveStatus(), null);
    renderSaveBanner();
  }

  function progressMini(frac: number): HTMLElement {
    return h('div', { class: 'exp-mini' }, h('div', { style: { width: `${Math.round(frac * 100)}%` } }));
  }

  function badges(): Partial<Record<TabId, boolean>> {
    const { resources, campaign } = game.state;
    const idleMs = Math.min(IDLE_CAP_HOURS * 3_600_000, game.now() - campaign.idleSince);
    return {
      campaign: idleMs >= IDLE_BADGE_MS,
      heroes: safely(() => starUpReadyUids(game.state).size > 0, false),
      summon: resources.basicScroll > 0 || resources.heroicScroll > 0,
    };
  }

  /** Account level-ups (and their gems) happen inside other actions: announce them. */
  function checkLevelUp(): void {
    const level = game.state.player.level;
    const text = levelToastMuted === 0 ? levelUpText(knownLevel, level) : null;
    knownLevel = level;
    if (text) showToast(text, 'reward', 3600);
  }

  function renderTabs(): void {
    const marks = safely(badges, {});
    mount(
      tabBar,
      TABS.map((tab) =>
        h(
          'button',
          {
            class: ['tab', active === tab.id && 'active'],
            attrs: { type: 'button', 'aria-current': active === tab.id ? 'page' : null },
            onClick: () => goTo(tab.id),
          },
          h('span', { class: 'tab-icon' }, tab.icon),
          h('span', { class: 'tab-label' }, tab.label),
          marks[tab.id] ? h('span', { class: 'tab-dot', attrs: { 'aria-label': 'Yeni' } }) : null,
        ),
      ),
    );
  }

  function renderScreen(id: TabId): void {
    try {
      screens[id].render();
      dirty.delete(id);
    } catch (err) {
      console.error(`Screen ${id} failed to render`, err);
      mount(screens[id].el, h('div', { class: 'empty-state' }, h('div', { class: 'empty-icon' }, '⚠️'), h('p', null, 'Bu ekran yüklenemedi.')));
    }
  }

  function goTo(tab: TabId): void {
    if (tab !== active) {
      screens[active].hide?.();
      screens[active].el.hidden = true;
      active = tab;
      saveTab(tab);
    }
    const screen = screens[active];
    screen.el.hidden = false;
    if (dirty.has(active) || !screen.el.hasChildNodes()) renderScreen(active);
    screen.show?.();
    main.scrollTop = 0;
    renderTabs();
  }

  function refresh(): void {
    checkLevelUp();
    renderTopBar();
    renderSaveBanner();
    renderTabs();
    TABS.forEach((t) => dirty.add(t.id));
    renderScreen(active);
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch (err) {
        console.error('UI listener failed', err);
      }
    }
  }

  for (const tab of TABS) {
    screens[tab.id].el.hidden = true;
    main.append(screens[tab.id].el);
  }
  mount(root, h('div', { class: 'app-shell' }, topBar, saveBanner, main, tabBar));
  game.subscribe(refresh);
  renderTopBar();
  renderSaveBanner();
  TABS.forEach((t) => dirty.add(t.id));
  goTo(active);
  setInterval(renderTabs, 30_000);

  const persist = (): void => safely(() => game.save(), undefined);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
    else checkSave();
  });
  window.addEventListener('pagehide', persist);
  // Fired in this tab when another tab writes the save (key null = the whole storage was cleared).
  window.addEventListener('storage', (ev) => {
    if (ev.key === null || ev.key === SAVE_KEY) checkSave();
  });
  return ui;
}

/** Shown when the game cannot start (e.g. a corrupt save that the loader rejects). */
export function mountFatal(root: HTMLElement, err: unknown): void {
  console.error('Game failed to start', err);
  const wipe = (): void => {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // nothing to wipe
    }
    location.reload();
  };
  mount(
    root,
    h(
      'div',
      { class: 'fatal' },
      h('div', { class: 'empty-icon' }, '🕯️'),
      h('h1', null, 'Oyun başlatılamadı'),
      h('p', null, 'Kayıt dosyası okunamadı veya beklenmeyen bir hata oluştu.'),
      h('pre', null, err instanceof Error ? err.message : String(err)),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-secondary', attrs: { type: 'button' }, onClick: () => location.reload() }, 'Yeniden Dene'), h('button', { class: 'btn btn-danger', attrs: { type: 'button' }, onClick: wipe }, 'Kaydı Sil')),
    ),
  );
}
