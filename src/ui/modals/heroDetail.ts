// Hero detail sheet: portrait header (lock, prev/next), tabs for growth (stats, level up, star up),
// equipment and skills, plus dismiss with confirmation.
import { CLASS_INFO, FACTION_INFO } from '../../core/constants';
import { dismissRewards } from '../../core/progression';
import type { HeroInstance } from '../../core/types';
import { getHeroDef } from '../../data/heroes';
import { button, classChip, factionChip, portrait, rewardList, starRow } from '../components';
import { blockedBySave, runAction, safely, type Ui } from '../context';
import { h, mount } from '../dom';
import { fmtNum, POWER_ICON } from '../format';
import { confirmDialog, openModal } from '../overlay';
import { equipmentTab } from './heroEquipment';
import { growthTab, levelButtons } from './heroGrowth';
import { skillsTab } from './heroSkills';

type DetailTab = 'growth' | 'equipment' | 'skills';
const TABS: { id: DetailTab; label: string }[] = [
  { id: 'growth', label: '⬆️ Gelişim' },
  { id: 'equipment', label: '🛡️ Ekipman' },
  { id: 'skills', label: '📖 Yetenekler' },
];

/** Shared state for the tab renderers. */
export interface DetailCtx {
  ui: Ui;
  hero: HeroInstance;
  /** Plays a celebratory flash on the portrait at the next render (null cancels). */
  flash(kind: 'level' | 'star' | 'equip' | null): void;
}

export function openHeroDetail(ui: Ui, uid: string, list: readonly string[] = []): void {
  const { game } = ui;
  let current = uid;
  let tab: DetailTab = 'growth';
  let pendingFlash: string | null = null;

  const modal = openModal({ title: '', className: 'sheet hero-detail', onClose: () => unsubscribe() });
  const unsubscribe = ui.onChange(render);

  function navigate(step: number): void {
    const alive = list.filter((id) => game.hero(id));
    const index = alive.indexOf(current);
    if (alive.length < 2 || index < 0) return;
    current = alive[(index + step + alive.length) % alive.length];
    render();
  }

  function header(hero: HeroInstance, flash: string | null): HTMLElement {
    const def = getHeroDef(hero.heroId);
    const power = safely(() => game.heroPower(hero.uid), 0);
    const inTeam = game.state.formation.includes(hero.uid);
    const canNav = list.filter((id) => game.hero(id)).length > 1;
    const art = h('div', { class: ['hd-art', flash && `flash-${flash}`] }, h('div', { class: 'hd-rays', attrs: { 'aria-hidden': 'true' } }), portrait(hero.heroId, 'xl'));
    return h(
      'div',
      { class: 'hd-header', style: { '--fc': FACTION_INFO[def.faction].color } },
      canNav ? h('button', { class: 'hd-nav prev', attrs: { type: 'button', 'aria-label': 'Önceki' }, onClick: () => navigate(-1) }, '‹') : null,
      canNav ? h('button', { class: 'hd-nav next', attrs: { type: 'button', 'aria-label': 'Sonraki' }, onClick: () => navigate(1) }, '›') : null,
      h(
        'button',
        {
          class: ['hd-lock', hero.locked && 'on'],
          attrs: { type: 'button', 'aria-pressed': hero.locked ? 'true' : 'false' },
          onClick: () => toggleLock(hero),
        },
        hero.locked ? '🔒 Kilitli' : '🔓 Kilitle',
      ),
      art,
      h('div', { class: 'hd-name' }, def.name),
      h('div', { class: 'hd-title' }, def.title),
      starRow(hero.stars, 'hd-stars'),
      h('div', { class: 'hd-chips' }, factionChip(def.faction), classChip(def.heroClass), inTeam ? h('span', { class: 'chip team-chip' }, '⚔ Takımda') : null),
      h('div', { class: 'hd-power' }, `${POWER_ICON} ${fmtNum(power)}`),
    );
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
      button('🕊️ Serbest Bırak', () => void dismiss(hero), {
        variant: 'ghost',
        class: 'btn-dismiss btn-block',
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
        h('p', null, h('strong', null, def.name), ` (Sv.${hero.level}, ${hero.stars}★) serbest bırakılacak. Bu işlem geri alınamaz.`),
        h('p', { class: 'muted' }, 'Kazanacakların:'),
        rewardList(safely(() => dismissRewards(hero), null)),
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

  function tabBar(): HTMLElement {
    return h(
      'div',
      { class: 'tabs-inline', attrs: { role: 'tablist' } },
      TABS.map((t) =>
        h(
          'button',
          {
            class: ['tab-inline', tab === t.id && 'active'],
            attrs: { type: 'button', role: 'tab', 'aria-selected': tab === t.id ? 'true' : 'false' },
            onClick: () => {
              tab = t.id;
              render();
            },
          },
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
    modal.setTitle(`${CLASS_INFO[def.heroClass].icon} ${def.name}`);
    const body = tab === 'growth' ? [growthTab(ctx), dismissSection(hero)] : tab === 'equipment' ? equipmentTab(ctx) : skillsTab(def);
    // Keep the scroll position across re-renders (a level-up must not jump the sheet back to the top).
    const scroll = modal.body.scrollTop;
    modal.setContent(header(hero, flash), tabBar(), h('div', { class: 'hd-tab' }, body));
    modal.body.scrollTop = scroll;
    mount(modal.footer, tab === 'growth' ? levelButtons(ctx) : null);
  }

  render();
}
