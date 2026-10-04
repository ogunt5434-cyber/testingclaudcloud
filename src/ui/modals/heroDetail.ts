// Hero detail (full stage): the hero's full-body sprite on a faction-themed pedestal on the left (lock,
// prev/next), tabs on the right for growth (stats, level up, star up), equipment and skills, plus dismiss
// with confirmation.
import { heroSprite, icon, setSpriteAnim } from '../../art';
import { CLASS_INFO, FACTION_INFO } from '../../core/constants';
import { dismissRewards } from '../../core/progression';
import type { HeroInstance } from '../../core/types';
import { getHeroDef } from '../../data/heroes';
import { button, classChip, factionChip, portrait, resourceAmount, rewardList, starRow } from '../components';
import { blockedBySave, runAction, safely, type Ui } from '../context';
import { h, mount, prefersReducedMotion } from '../dom';
import { fmtNum } from '../format';
import { confirmDialog, openModal } from '../overlay';
import { equipmentTab } from './heroEquipment';
import { growthTab, levelButtons } from './heroGrowth';
import { skillsTab } from './heroSkills';

type DetailTab = 'growth' | 'equipment' | 'skills';
const TABS: { id: DetailTab; label: string; icon: 'buff-up' | 'armor' | 'class-mage' }[] = [
  { id: 'growth', label: 'Gelişim', icon: 'buff-up' },
  { id: 'equipment', label: 'Ekipman', icon: 'armor' },
  { id: 'skills', label: 'Yetenekler', icon: 'class-mage' },
];

/** Shared state for the tab renderers. */
export interface DetailCtx {
  ui: Ui;
  hero: HeroInstance;
  /** Plays a celebratory flash on the hero at the next render (null cancels). */
  flash(kind: 'level' | 'star' | 'equip' | null): void;
}

export function openHeroDetail(ui: Ui, uid: string, list: readonly string[] = []): void {
  const { game } = ui;
  let current = uid;
  let tab: DetailTab = 'growth';
  let pendingFlash: string | null = null;
  /** The sprite of the hero on show (kept across re-renders so its idle loop does not restart). */
  let sprite: { heroId: string; el: HTMLElement } | null = null;

  const showcase = h('div', { class: 'hd-showcase' });
  const tabBarEl = h('div', { class: 'hd-tabs', attrs: { role: 'tablist' } });
  const tabBody = h('div', { class: 'hd-tab' });
  /** A bouncing chevron at the bottom of the tab while more content is below the fold. */
  function updateMoreHint(): void {
    // Ignore the tab's own bottom padding (26 px fade zone): only real content below the fold counts.
    const more = tabBody.scrollHeight - tabBody.clientHeight - tabBody.scrollTop > 34;
    tabBody.classList.toggle('has-more', more);
  }
  tabBody.addEventListener('scroll', updateMoreHint, { passive: true });
  const actions = h('div', { class: 'hd-actions' });
  const wallet = h('div', { class: 'hd-wallet' });
  const modal = openModal(
    { title: '', className: 'full hero-detail', onClose: () => unsubscribe() },
    showcase,
    h('div', { class: 'hd-main panel' }, tabBarEl, tabBody, actions),
    wallet,
  );
  const unsubscribe = ui.onChange(render);

  function navigate(step: number): void {
    const alive = list.filter((id) => game.hero(id));
    const index = alive.indexOf(current);
    if (alive.length < 2 || index < 0) return;
    current = alive[(index + step + alive.length) % alive.length];
    render();
  }

  function heroSpriteFor(heroId: string): HTMLElement | null {
    if (sprite?.heroId === heroId) return sprite.el;
    try {
      sprite = { heroId, el: heroSprite(heroId) };
      return sprite.el;
    } catch {
      sprite = null;
      return null;
    }
  }

  // Showcase skeleton: the sprite holder stays in place across re-renders (re-inserting a sprite would
  // restart its idle animation); only the info around it is rebuilt.
  const spriteHolder = h('div', { class: 'hd-sprite' });
  const nameBlock = h('div', { class: 'hd-name-block' });
  const infoBlock = h('div', { class: 'hd-info' });
  const controls = h('div', { class: 'hd-controls' });
  mount(
    showcase,
    h('div', { class: 'hd-rays', attrs: { 'aria-hidden': 'true' } }),
    nameBlock,
    h('div', { class: 'hd-stage' }, h('div', { class: 'hd-pedestal', attrs: { 'aria-hidden': 'true' } }, h('i')), spriteHolder, h('div', { class: 'hd-burst', attrs: { 'aria-hidden': 'true' } })),
    infoBlock,
    controls,
  );

  function renderShowcase(hero: HeroInstance, flash: string | null): void {
    const def = getHeroDef(hero.heroId);
    const power = safely(() => game.heroPower(hero.uid), 0);
    const inTeam = game.state.formation.includes(hero.uid);
    const canNav = list.filter((id) => game.hero(id)).length > 1;
    const spriteEl = heroSpriteFor(hero.heroId);
    if (spriteHolder.firstElementChild !== spriteEl) mount(spriteHolder, spriteEl);
    showcase.style.setProperty('--fc', FACTION_INFO[def.faction].color);
    showcase.className = `hd-showcase faction-${def.faction}`;
    if (flash) {
      void showcase.offsetWidth;
      showcase.classList.add(`flash-${flash}`);
    }
    mount(nameBlock, h('div', { class: 'hd-name display-title' }, def.name), h('div', { class: 'hd-title' }, def.title), starRow(hero.stars, 'hd-stars', 30));
    mount(
      infoBlock,
      h('div', { class: 'hd-chips' }, factionChip(def.faction), classChip(def.heroClass), inTeam ? h('span', { class: 'chip team-chip' }, icon('swords', 20), 'Takımda') : null),
      h('div', { class: 'hd-stats-line' }, h('div', { class: 'hd-level-tag' }, h('span', null, 'Seviye'), h('strong', null, String(hero.level))), h('div', { class: 'hd-power' }, icon('power', 32), h('span', null, fmtNum(power)))),
    );
    mount(
      controls,
      h(
        'button',
        {
          class: ['hd-lock', hero.locked && 'on'],
          attrs: { type: 'button', 'aria-pressed': hero.locked ? 'true' : 'false', 'aria-label': hero.locked ? 'Kilidi aç' : 'Kilitle', title: hero.locked ? 'Kilitli' : 'Kilitle' },
          onClick: () => toggleLock(hero),
        },
        icon(hero.locked ? 'lock' : 'unlock', 34),
      ),
      canNav ? h('button', { class: 'hd-nav prev', attrs: { type: 'button', 'aria-label': 'Önceki kahraman' }, onClick: () => navigate(-1) }, icon('back', 40)) : null,
      canNav ? h('button', { class: 'hd-nav next', attrs: { type: 'button', 'aria-label': 'Sonraki kahraman' }, onClick: () => navigate(1) }, icon('back', 40)) : null,
    );
    if (flash && spriteEl && (flash === 'level' || flash === 'star') && !prefersReducedMotion()) {
      void setSpriteAnim(spriteEl, 'victory').catch(() => undefined);
    }
  }

  function toggleLock(hero: HeroInstance): void {
    if (blockedBySave(ui)) return;
    try {
      game.toggleLock(hero.uid);
      ui.toast(game.hero(hero.uid)?.locked ? 'Kahraman kilitlendi.' : 'Kilit kaldırıldı.', 'info');
    } catch (err) {
      console.warn('toggleLock failed', err);
      ui.toast('Kilit değiştirilemedi.', 'error');
    }
  }

  /** Why the hero cannot be dismissed right now (null = it can). */
  function dismissBlocker(hero: HeroInstance): string | null {
    if (hero.locked) return 'Kilitli kahraman serbest bırakılamaz.';
    if (game.state.formation.includes(hero.uid)) return 'Takımdaki kahraman serbest bırakılamaz.';
    return null;
  }

  /** Rarely used and destructive: at the end of the growth tab, disabled with the reason when blocked. */
  function dismissSection(hero: HeroInstance): HTMLElement {
    const blocker = dismissBlocker(hero);
    return h(
      'div',
      { class: 'dismiss-section' },
      button('Serbest Bırak', () => void dismiss(hero), {
        variant: 'ghost',
        class: 'btn-dismiss',
        disabled: !!blocker,
        sub: blocker ? (hero.locked ? 'Kilitli — önce kilidi aç' : 'Takımda — önce takımdan çıkar') : null,
      }),
    );
  }

  async function dismiss(hero: HeroInstance): Promise<void> {
    const def = getHeroDef(hero.heroId);
    const blocker = dismissBlocker(hero);
    if (blocker) return ui.toast(blocker, 'error');
    const ok = await confirmDialog({
      title: 'Serbest Bırak',
      danger: true,
      confirmLabel: 'Serbest Bırak',
      message: h(
        'div',
        { class: 'dismiss-confirm' },
        portrait(hero.heroId, 'md'),
        h('div', null, h('p', null, h('strong', null, def.name), ` (Sv.${hero.level}, ${hero.stars} yıldız) serbest bırakılacak. Bu işlem geri alınamaz.`), h('p', { class: 'muted' }, 'Kazanacakların:'), rewardList(safely(() => dismissRewards(hero), null))),
      ),
    });
    if (!ok) return;
    // Pick the hero to show next before acting: the store re-renders this sheet synchronously.
    const alive = list.filter((id) => game.hero(id));
    const remaining = alive.filter((id) => id !== hero.uid);
    const index = Math.min(alive.indexOf(hero.uid), remaining.length - 1);
    current = remaining[Math.max(0, index)] ?? hero.uid;
    if (!runAction(ui, () => game.dismiss(hero.uid), `${def.name} serbest bırakıldı.`)) {
      current = hero.uid;
      render();
    }
  }

  function renderTabs(): void {
    mount(
      tabBarEl,
      TABS.map((t) =>
        h(
          'button',
          {
            class: ['hd-tab-btn', tab === t.id && 'active'],
            attrs: { type: 'button', role: 'tab', 'aria-selected': tab === t.id ? 'true' : 'false' },
            onClick: () => {
              tab = t.id;
              tabBody.scrollTop = 0;
              render();
            },
          },
          icon(t.icon, 26),
          t.label,
        ),
      ),
    );
  }

  function render(): void {
    if (modal.closed) return;
    const hero = game.hero(current);
    if (!hero) {
      modal.close();
      return;
    }
    const flash = pendingFlash;
    pendingFlash = null;
    const ctx: DetailCtx = { ui, hero, flash: (kind) => (pendingFlash = kind) };
    const def = getHeroDef(hero.heroId);
    modal.setTitle(`${def.name} · ${CLASS_INFO[def.heroClass].name}`);
    renderShowcase(hero, flash);
    renderTabs();
    const body = tab === 'growth' ? [growthTab(ctx), dismissSection(hero)] : tab === 'equipment' ? equipmentTab(ctx) : skillsTab(def);
    // Keep the scroll position across re-renders (a level-up must not jump the panel back to the top).
    const scroll = tabBody.scrollTop;
    mount(tabBody, body, h('div', { class: 'hd-more', attrs: { 'aria-hidden': 'true' } }));
    tabBody.scrollTop = scroll;
    updateMoreHint();
    mount(actions, tab === 'growth' ? levelButtons(ctx) : null);
    actions.hidden = tab !== 'growth';
    const res = game.state.resources;
    mount(wallet, resourceAmount('gold', res.gold), resourceAmount('spirit', res.spirit));
  }

  render();
}
