// Formation editor: 2 front + 4 back slots. Tap a slot then a hero to place; tap a filled slot to clear it.
// Every valid change is saved immediately; "Otomatik" lets the store pick the team.
import { FRONT_ROW } from '../../core/constants';
import { getHeroDef } from '../../data/heroes';
import { button, emptyState, heroCard, portrait, starRow } from '../components';
import { runAction, safely, type Ui } from '../context';
import { h, mount } from '../dom';
import { fmtNum, POWER_ICON } from '../format';
import { openModal } from '../overlay';

const SLOT_LABELS = ['Ön 1', 'Ön 2', 'Arka 1', 'Arka 2', 'Arka 3', 'Arka 4'];

/** Warriors prefer the front row, everyone else the back row. */
function preferredEmptySlot(draft: (string | null)[], heroClass: string): number {
  const front = FRONT_ROW.filter((i) => !draft[i]);
  const back = draft.map((uid, i) => (uid || FRONT_ROW.includes(i) ? -1 : i)).filter((i) => i >= 0);
  const order = heroClass === 'warrior' ? [...front, ...back] : [...back, ...front];
  return order.length ? order[0] : -1;
}

export function openFormation(ui: Ui): void {
  const { game } = ui;
  let draft: (string | null)[] = [...game.state.formation];
  let selected: number | null = null;

  const modal = openModal({ title: 'Takım Düzeni', className: 'sheet formation-panel', onClose });
  const unsubscribe = ui.onChange(() => {
    if (draft.some(Boolean)) draft = [...game.state.formation];
    render();
  });

  function onClose(): void {
    unsubscribe();
    if (!draft.some(Boolean)) ui.toast('Takım boş bırakılamaz; önceki takım korundu.', 'info');
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

  function slotEl(index: number): HTMLElement {
    const uid = draft[index];
    const hero = uid ? game.hero(uid) : undefined;
    return h(
      'button',
      {
        class: ['fslot', hero ? 'filled' : 'empty', selected === index && 'selected'],
        attrs: { type: 'button', 'aria-label': SLOT_LABELS[index] },
        onClick: () => tapSlot(index),
      },
      hero ? [portrait(hero.heroId, 'sm'), starRow(hero.stars, 'fslot-stars'), h('span', { class: 'fslot-lv' }, `Sv.${hero.level}`)] : h('span', { class: 'fslot-plus' }, '+'),
      h('span', { class: 'fslot-label' }, SLOT_LABELS[index]),
    );
  }

  function draftPower(): number {
    return draft.reduce((sum, uid) => sum + (uid ? safely(() => game.heroPower(uid), 0) : 0), 0);
  }

  function render(): void {
    if (modal.closed) return;
    const heroes = safely(() => game.sortedHeroes(), [...game.state.heroes]);
    const hint = selected !== null ? `${SLOT_LABELS[selected]} seçili — yerleştirmek için bir kahramana dokun.` : 'Bir yuvaya, sonra bir kahramana dokun. Dolu yuvaya dokunmak onu boşaltır.';
    modal.setContent(
      h(
        'div',
        { class: 'formation-board' },
        h('div', { class: 'fboard-power' }, `${POWER_ICON} Takım Gücü `, h('strong', null, fmtNum(draftPower()))),
        h('div', { class: 'frow front' }, h('span', { class: 'frow-label' }, 'Ön Sıra'), h('div', { class: 'frow-slots' }, [0, 1].map(slotEl))),
        h('div', { class: 'frow back' }, h('span', { class: 'frow-label' }, 'Arka Sıra'), h('div', { class: 'frow-slots' }, [2, 3, 4, 5].map(slotEl))),
        h('p', { class: 'hint' }, hint),
      ),
      heroes.length === 0
        ? emptyState('👻', 'Hiç kahramanın yok.')
        : h(
            'div',
            { class: 'hero-grid' },
            heroes.map((hero) => {
              const slot = draft.indexOf(hero.uid);
              return heroCard(hero, {
                power: safely(() => game.heroPower(hero.uid), 0),
                inFormation: slot >= 0,
                badge: slot >= 0 ? String(slot + 1) : undefined,
                onClick: () => tapHero(hero.uid),
              });
            }),
          ),
    );
  }

  mount(
    modal.footer,
    button('🪄 Otomatik', () => {
      try {
        game.autoFormation();
        selected = null;
        draft = [...game.state.formation];
        render();
      } catch (err) {
        console.warn('autoFormation failed', err);
        ui.toast('Otomatik dizilim yapılamadı.', 'error');
      }
    }),
    button('Tamam', () => modal.close(), { variant: 'primary' }),
  );
  render();
}
