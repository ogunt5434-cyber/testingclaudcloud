// Town hub (home): the illustrated town with clickable buildings. Open buildings route to their screens,
// locked ones answer "Yakında!". Notification dots follow the navigation badges.
import { townScene, updateTownScene, type TownBuildingId } from '../../art';
import { safely, type Screen, type Ui } from '../context';
import { h, mount } from '../dom';
import { navBadges } from '../hints';

const LOCKED: readonly TownBuildingId[] = ['arena', 'guild', 'shop'];
const LOCKED_NAMES: Partial<Record<TownBuildingId, string>> = { arena: 'Arena', guild: 'Lonca', shop: 'Pazar' };

export function createHubScreen(ui: Ui): Screen {
  const el = h('section', { class: 'screen hub-screen', attrs: { 'aria-label': 'Kasaba' } });
  /** Badge signature of the mounted town (its dots are updated in place when it changes). */
  let shown: string | null = null;

  function onBuilding(id: TownBuildingId): void {
    if (LOCKED.includes(id)) {
      ui.toast(`${LOCKED_NAMES[id] ?? 'Bu bina'} — Yakında!`, 'info');
      return;
    }
    if (id === 'campaign' || id === 'summon' || id === 'tower' || id === 'heroes') ui.goTo(id);
  }

  function render(): void {
    const badges = safely(() => navBadges(ui.game.state, ui.game.now()), {});
    const town = { campaign: !!badges.campaign, summon: !!badges.summon, heroes: !!badges.heroes };
    const signature = JSON.stringify(town);
    if (signature === shown && el.firstElementChild) return;
    shown = signature;
    // Only the dots changed: update the mounted town in place (rebuilding it restarts every animation).
    const mounted = el.querySelector<HTMLElement>('.ae-town');
    if (mounted) {
      try {
        updateTownScene(mounted, { badges: town });
        return;
      } catch (err) {
        console.error('town update failed', err);
      }
    }
    let scene: HTMLElement;
    try {
      scene = townScene({ onBuilding, locked: LOCKED, badges: town });
    } catch (err) {
      console.error('town scene failed', err);
      scene = h('div', { class: 'town-fallback' });
    }
    mount(el, h('div', { class: 'hub-town' }, scene));
  }

  return { el, render, show: render };
}
