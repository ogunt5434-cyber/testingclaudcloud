// App shell on the 1280x720 stage: town hub (home) and full-stage screens, the HUD, the save banner and
// the Ui context (toasts, navigation, change fan-out).
import { icon } from '../art';
import type { Game } from '../core/game';
import { SAVE_KEY } from '../core/save';
import { safely, type Screen, type TabId, type Ui } from './context';
import { h, mount } from './dom';
import { levelUpText, saveNotice, type SaveNotice } from './hints';
import { createHud } from './hud';
import { createCampaignScreen } from './screens/campaign';
import { createHeroesScreen } from './screens/heroes';
import { createHubScreen } from './screens/hub';
import { createSummonScreen } from './screens/summon';
import { createTowerScreen } from './screens/tower';
import { mountStage, stageLayer } from './stage';
import { Timers } from './timers';
import { showToast } from './toast';

const SCREEN_IDS: readonly TabId[] = ['hub', 'campaign', 'heroes', 'summon', 'tower'];
const TAB_KEY = 'dk-tab';

/** The hub is home; a remembered screen is reopened on reload (the back button returns to the hub). */
function loadTab(): TabId {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return SCREEN_IDS.includes(saved as TabId) ? (saved as TabId) : 'hub';
  } catch {
    return 'hub';
  }
}

function saveTab(tab: TabId): void {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // storage unavailable: the screen is simply not remembered
  }
}

export function mountApp(root: HTMLElement, game: Game): Ui {
  mountStage(root);
  const listeners = new Set<() => void>();
  const screensLayer = stageLayer('screens');
  const hudLayer = stageLayer('hud');
  /** Warning shown while progress is not being saved (another tab took over, or storage is unavailable). */
  const saveBanner = stageLayer('banner');
  saveBanner.hidden = true;
  let shownNotice: SaveNotice | null = null;
  let unavailableDismissed = false;
  let active: TabId = loadTab();
  const dirty = new Set<TabId>();
  let knownLevel = game.state.player.level;
  let levelToastMuted = 0;
  const clock = new Timers();

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

  const hud = createHud(ui);
  const screens: Record<TabId, Screen> = {
    hub: createHubScreen(ui),
    campaign: createCampaignScreen(ui),
    heroes: createHeroesScreen(ui),
    summon: createSummonScreen(ui),
    tower: createTowerScreen(ui),
  };

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
        h('span', { class: 'save-banner-icon', attrs: { 'aria-hidden': 'true' } }, icon(notice.action === 'reload' ? 'auto' : 'info', 34)),
        h('span', { class: 'save-banner-text' }, notice.text),
        h('button', { class: ['btn', 'btn-small', notice.action === 'reload' ? 'btn-gold' : 'btn-secondary'], attrs: { type: 'button' }, onClick: act }, h('span', { class: 'btn-main' }, h('span', { class: 'btn-label' }, notice.label))),
      ),
    );
  }

  /** Another tab may have saved meanwhile: re-check, then show or update the banner. */
  function checkSave(): void {
    safely(() => game.refreshSaveStatus(), null);
    renderSaveBanner();
  }

  /** Account level-ups (and their gems) happen inside other actions: announce them. */
  function checkLevelUp(): void {
    const level = game.state.player.level;
    const text = levelToastMuted === 0 ? levelUpText(knownLevel, level) : null;
    knownLevel = level;
    if (text) showToast(text, 'reward', 3600);
  }

  function renderScreen(id: TabId): void {
    try {
      screens[id].render();
      dirty.delete(id);
    } catch (err) {
      console.error(`Screen ${id} failed to render`, err);
      mount(
        screens[id].el,
        h('div', { class: 'empty-state screen-error' }, h('div', { class: 'empty-icon' }, icon('info', 64)), h('p', null, 'Bu ekran yüklenemedi.')),
      );
    }
  }

  function renderHud(): void {
    try {
      hud.render(active);
    } catch (err) {
      console.error('HUD failed to render', err);
    }
  }

  function goTo(tab: TabId): void {
    if (tab !== active) {
      screens[active].hide?.();
      screens[active].el.hidden = true;
      active = tab;
      saveTab(tab);
      screens[active].el.classList.remove('entering');
      void screens[active].el.offsetWidth;
      screens[active].el.classList.add('entering');
    }
    const screen = screens[active];
    screen.el.hidden = false;
    if (dirty.has(active) || !screen.el.hasChildNodes()) renderScreen(active);
    screen.show?.();
    renderHud();
  }

  function refresh(): void {
    checkLevelUp();
    renderHud();
    renderSaveBanner();
    SCREEN_IDS.forEach((id) => dirty.add(id));
    renderScreen(active);
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch (err) {
        console.error('UI listener failed', err);
      }
    }
  }

  for (const id of SCREEN_IDS) {
    screens[id].el.hidden = true;
    screensLayer.append(screens[id].el);
  }
  hudLayer.append(hud.el);
  game.subscribe(refresh);
  renderSaveBanner();
  SCREEN_IDS.forEach((id) => dirty.add(id));
  goTo(active);
  // Live HUD: idle chest counter every second; badges (idle chest filling up) every 30 s.
  clock.every(1000, () => hud.tick());
  clock.every(30_000, () => {
    if (active === 'hub') {
      renderHud();
      renderScreen('hub');
    }
  });

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
  mountStage(root);
  const wipe = (): void => {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // nothing to wipe
    }
    location.reload();
  };
  mount(
    stageLayer('screens'),
    h(
      'div',
      { class: 'fatal' },
      h(
        'div',
        { class: 'panel fatal-panel' },
        h('div', { class: 'empty-icon' }, icon('info', 72)),
        h('h1', { class: 'display-title' }, 'Oyun başlatılamadı'),
        h('p', null, 'Kayıt dosyası okunamadı veya beklenmeyen bir hata oluştu.'),
        h('pre', null, err instanceof Error ? err.message : String(err)),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary', attrs: { type: 'button' }, onClick: () => location.reload() }, h('span', { class: 'btn-main' }, h('span', { class: 'btn-label' }, 'Yeniden Dene'))),
          h('button', { class: 'btn btn-danger', attrs: { type: 'button' }, onClick: wipe }, h('span', { class: 'btn-main' }, h('span', { class: 'btn-label' }, 'Kaydı Sil'))),
        ),
      ),
    ),
  );
}
