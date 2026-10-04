// Formation: a side view of the battlefield with 2 front + 4 back slots laid out like the battle (team on
// the left facing right), the hero bench below and "Otomatik". Tap a slot then a hero to place; tap a
// filled slot to clear it. Every valid change is saved immediately. Opened before a fight, it shows the
// enemy team on the right and "Savaş" starts the battle.
import { heroSprite, icon } from '../../art';
import { FACTION_ADVANTAGE, FACTION_DMG_BONUS, FACTION_HIT_BONUS, FRONT_ROW } from '../../core/constants';
import type { BattleUnitSetup, Faction } from '../../core/types';
import { getHeroDef, isHeroId } from '../../data/heroes';
import { createBackdrop } from '../backdrop';
import { button, emptyState, factionBadge, heroCard, starRow } from '../components';
import { blockedBySave, runAction, safely, type Ui } from '../context';
import { h, mount } from '../dom';
import { fmtNum, fmtPercent } from '../format';
import { openModal } from '../overlay';

export const SLOT_LABELS = ['Ön 1', 'Ön 2', 'Arka 1', 'Arka 2', 'Arka 3', 'Arka 4'];
/** Short slot names for the hero card badges; they must match SLOT_LABELS ("Arka 1" -> "A1"). */
export const SLOT_BADGES = ['Ö1', 'Ö2', 'A1', 'A2', 'A3', 'A4'];

/**
 * Feet positions of the six slots on the 1280x450 field for the team on the left: the front row (2) near
 * the middle, the back row (4) staggered behind it. The enemy side mirrors x.
 */
export const SLOT_POS: readonly [number, number][] = [
  [560, 196],
  [560, 376],
  [384, 146],
  [222, 236],
  [384, 326],
  [222, 416],
];

export interface FormationOptions {
  /** Pre-fight confirmation: shows the enemy team and turns the main button into "Savaş". */
  fight?: {
    title: string;
    enemies: (BattleUnitSetup | null)[];
    enemyPower: number;
    run: () => void;
  };
}

/** Warriors prefer the front row, everyone else the back row. */
function preferredEmptySlot(draft: (string | null)[], heroClass: string): number {
  const front = FRONT_ROW.filter((i) => !draft[i]);
  const back = draft.map((uid, i) => (uid || FRONT_ROW.includes(i) ? -1 : i)).filter((i) => i >= 0);
  const order = heroClass === 'warrior' ? [...front, ...back] : [...back, ...front];
  return order.length ? order[0] : -1;
}

/** Faction advantage cheat sheet (shown when not preparing a fight). */
function advantageNote(): HTMLElement {
  const arrow = (): HTMLElement => h('span', { class: 'adv-arrow' }, icon('back', 22));
  const cycle: Faction[] = ['abyss'];
  while (cycle.length < 5) cycle.push(FACTION_ADVANTAGE[cycle[cycle.length - 1]]);
  return h(
    'div',
    { class: 'field-note' },
    h('div', { class: 'fn-title' }, 'Grup Üstünlüğü'),
    h('p', null, `Üstün grup ${fmtPercent(FACTION_DMG_BONUS)} hasar ve ${fmtPercent(FACTION_HIT_BONUS)} isabet kazanır.`),
    h('div', { class: 'adv-row' }, cycle.map((f, i) => [i > 0 ? arrow() : null, factionBadge(f, 40)])),
    h('div', { class: 'adv-row' }, factionBadge('light', 40), h('span', { class: 'adv-arrow both' }, icon('back', 22), icon('back', 22)), factionBadge('dark', 40)),
    h('p', { class: 'fn-tip' }, 'Ön sıra hasarı karşılar: savaşçıları öne koy.'),
  );
}

function safeSprite(heroId: string, facing: 'left' | 'right'): HTMLElement | null {
  try {
    return heroSprite(heroId, { facing });
  } catch {
    return null;
  }
}

export function openFormation(ui: Ui, opts: FormationOptions = {}): void {
  const { game } = ui;
  const fight = opts.fight;
  let draft: (string | null)[] = [...game.state.formation];
  let selected: number | null = null;
  let started = false;
  /** The "how to arrange" tip behind the (i) button. */
  let infoOpen = false;
  /** Sprites are kept per slot+hero so a re-render does not restart their idle animation. */
  const spriteCache = new Map<string, HTMLElement>();

  const backdrop = createBackdrop('formation-backdrop');
  backdrop.set(fight ? 'forest' : 'ruins');
  const field = h('div', { class: 'formation-field' });
  const bench = h('div', { class: 'formation-bench' });
  const side = h('div', { class: 'formation-side' });

  const modal = openModal(
    { title: fight ? `Savaşa Hazırlık · ${fight.title}` : 'Takım Düzeni', className: 'full formation-panel', onClose },
    backdrop.el,
    field,
    h('div', { class: 'formation-bottom' }, bench, side),
  );
  const unsubscribe = ui.onChange(() => {
    if (draft.some(Boolean)) draft = [...game.state.formation];
    render();
  });

  function onClose(): void {
    unsubscribe();
    if (!draft.some(Boolean) && !started) ui.toast('Takım boş bırakılamaz; önceki takım korundu.', 'info');
  }

  function commit(): void {
    if (draft.some(Boolean)) runAction(ui, () => game.setFormation([...draft]));
  }

  function tapSlot(index: number): void {
    if (draft[index]) {
      draft[index] = null;
      selected = index;
      commit();
    } else {
      selected = selected === index ? null : index;
    }
    render();
  }

  function tapHero(uid: string): void {
    const current = draft.indexOf(uid);
    if (selected !== null) {
      if (current >= 0) draft[current] = draft[selected];
      draft[selected] = uid;
      selected = null;
    } else if (current >= 0) {
      draft[current] = null;
    } else {
      const hero = game.hero(uid);
      if (!hero) return;
      const slot = preferredEmptySlot(draft, getHeroDef(hero.heroId).heroClass);
      if (slot < 0) {
        ui.toast('Takım dolu — önce değiştirmek istediğin yuvaya dokun.', 'info');
        return;
      }
      draft[slot] = uid;
    }
    commit();
    render();
  }

  function startFight(): void {
    if (!fight || started) return;
    if (!draft.some(Boolean)) {
      ui.toast('Savaş için takıma en az bir kahraman koy.', 'error');
      return;
    }
    started = true;
    modal.close();
    fight.run();
  }

  function sprite(key: string, heroId: string, facing: 'left' | 'right'): HTMLElement | null {
    let el = spriteCache.get(key);
    if (!el) {
      el = safeSprite(heroId, facing) ?? undefined;
      if (el) spriteCache.set(key, el);
    }
    return el ?? null;
  }

  function slotEl(index: number): HTMLElement {
    const uid = draft[index];
    const hero = uid ? game.hero(uid) : undefined;
    const [x, y] = SLOT_POS[index];
    const def = hero ? getHeroDef(hero.heroId) : null;
    return h(
      'button',
      {
        class: ['fslot', hero ? 'filled' : 'empty', selected === index && 'selected', index < 2 ? 'front' : 'back'],
        style: { left: `${x}px`, top: `${y}px`, 'z-index': String(Math.round(y)) },
        attrs: { type: 'button', 'aria-label': `${SLOT_LABELS[index]}${def ? `: ${def.name}, seviye ${hero?.level}` : ' — boş'}` },
        onClick: () => tapSlot(index),
      },
      h('span', { class: 'fslot-pad', attrs: { 'aria-hidden': 'true' } }),
      hero
        ? [
            h('span', { class: 'fslot-sprite' }, sprite(`${index}:${hero.uid}`, hero.heroId, 'right')),
            h('span', { class: 'fslot-plate' }, h('span', { class: 'fslot-lv' }, String(hero.level)), starRow(hero.stars, 'fslot-stars', 13)),
          ]
        : h('span', { class: 'fslot-plus' }, icon('plus', 34)),
      h('span', { class: 'fslot-label' }, SLOT_LABELS[index]),
    );
  }

  function enemyEl(unit: BattleUnitSetup | null, index: number): HTMLElement | null {
    if (!unit || !isHeroId(unit.heroId)) return null;
    const [x, y] = SLOT_POS[index];
    return h(
      'div',
      { class: 'fslot enemy filled', style: { left: `${1280 - x}px`, top: `${y}px`, 'z-index': String(Math.round(y)) }, attrs: { role: 'img', 'aria-label': `Düşman: ${getHeroDef(unit.heroId).name}, seviye ${unit.level}` } },
      h('span', { class: 'fslot-pad', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'fslot-sprite' }, sprite(`e${index}:${unit.heroId}`, unit.heroId, 'left')),
      h('span', { class: 'fslot-plate' }, h('span', { class: 'fslot-lv' }, String(unit.level)), starRow(unit.stars, 'fslot-stars', 13)),
    );
  }

  function draftPower(): number {
    return draft.reduce((sum, uid) => sum + (uid ? safely(() => game.heroPower(uid), 0) : 0), 0);
  }

  function render(): void {
    if (modal.closed) return;
    const heroes = safely(() => game.sortedHeroes(), [...game.state.heroes]);
    const hint = selected !== null ? `${SLOT_LABELS[selected]} seçili — yerleştirmek için bir kahramana dokun.` : 'Bir yuvaya, sonra bir kahramana dokun. Dolu yuvaya dokunmak onu boşaltır.';
    const power = draftPower();
    const benchScroll = bench.querySelector<HTMLElement>('.bench-scroll')?.scrollLeft ?? 0;
    mount(
      field,
      h('div', { class: 'field-power team' }, h('span', { class: 'fp-label' }, 'Takım Gücü'), h('span', { class: 'fp-value' }, icon('power', 30), fmtNum(power))),
      [0, 1, 2, 3, 4, 5].map(slotEl),
      fight
        ? [
            h('div', { class: 'field-vs', attrs: { 'aria-hidden': 'true' } }, 'VS'),
            h('div', { class: ['field-power enemy', power >= fight.enemyPower ? 'good' : 'bad'] }, h('span', { class: 'fp-label' }, 'Düşman Gücü'), h('span', { class: 'fp-value' }, icon('power', 30), fmtNum(fight.enemyPower))),
            fight.enemies.map(enemyEl),
          ]
        : advantageNote(),
      selected !== null
        ? h('p', { class: 'field-hint' }, hint)
        : h(
            'button',
            {
              class: ['field-info', infoOpen && 'open'],
              attrs: { type: 'button', 'aria-label': 'Nasıl dizilir?', 'aria-expanded': infoOpen ? 'true' : 'false' },
              onClick: () => {
                infoOpen = !infoOpen;
                render();
              },
            },
            icon('info', 34),
            infoOpen ? h('span', { class: 'field-info-tip', attrs: { role: 'note' } }, hint) : null,
          ),
    );
    const scroll = h(
      'div',
      { class: 'bench-scroll' },
      heroes.length === 0
        ? emptyState('helmet', 'Hiç kahramanın yok.')
        : heroes.map((hero) => {
            const slot = draft.indexOf(hero.uid);
            return heroCard(hero, {
              inFormation: slot >= 0,
              badge: slot >= 0 ? SLOT_BADGES[slot] : undefined,
              size: 92,
              onClick: () => tapHero(hero.uid),
            });
          }),
    );
    // Edge fade + arrow while more heroes are off to the right of the bench.
    const arrow = h('button', { class: 'bench-arrow', attrs: { type: 'button', 'aria-label': 'Diğer kahramanlar' }, onClick: () => scroll.scrollBy({ left: 420, behavior: 'smooth' }) }, icon('back', 30));
    const updateEdge = (): void => {
      const more = scroll.scrollWidth - scroll.clientWidth - scroll.scrollLeft > 6;
      bench.classList.toggle('has-more', more);
    };
    scroll.addEventListener('scroll', updateEdge, { passive: true });
    mount(bench, scroll, arrow);
    scroll.scrollLeft = benchScroll;
    updateEdge();
    // Drop sprites of heroes that left the field.
    const live = new Set<string>();
    draft.forEach((uid, i) => uid && live.add(`${i}:${uid}`));
    for (const key of [...spriteCache.keys()]) if (!key.startsWith('e') && !live.has(key)) spriteCache.delete(key);
  }

  mount(
    side,
    button(
      'Otomatik',
      () => {
        if (blockedBySave(ui)) return;
        try {
          game.autoFormation();
          selected = null;
          draft = [...game.state.formation];
          render();
        } catch (err) {
          console.warn('autoFormation failed', err);
          ui.toast('Otomatik dizilim yapılamadı.', 'error');
        }
      },
      { variant: 'secondary', icon: 'auto' },
    ),
    fight ? button('Savaş', startFight, { variant: 'primary', icon: 'swords', class: 'btn-fight btn-big' }) : button('Tamam', () => modal.close(), { variant: 'primary', class: 'btn-big' }),
  );
  render();
}
