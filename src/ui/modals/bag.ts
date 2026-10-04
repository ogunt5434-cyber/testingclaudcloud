// Çanta: the unequipped equipment stock by slot and tier, plus scrolls. Read-only (heroes equip from
// their detail panel).
import { icon } from '../../art';
import { EQUIP_SLOTS } from '../../core/types';
import { EQUIP_SLOT_INFO, EQUIP_TIER_INFO, equipmentFor, MAX_EQUIP_TIER } from '../../data/equipment';
import { button, emptyState, resIcon, sectionTitle } from '../components';
import type { Ui } from '../context';
import { h } from '../dom';
import { RESOURCE_INFO, fmtNum, slotIcon } from '../format';
import { openModal } from '../overlay';

export function openBag(ui: Ui): void {
  const { state } = ui.game;
  const items = EQUIP_SLOTS.flatMap((slot) =>
    Array.from({ length: MAX_EQUIP_TIER }, (_, i) => MAX_EQUIP_TIER - i)
      .map((tier) => {
        const def = equipmentFor(slot, tier);
        return { def, count: Math.max(0, Math.floor(state.equipment[def.id] ?? 0)) };
      })
      .filter((it) => it.count > 0),
  );
  const scrolls = (['basicScroll', 'heroicScroll'] as const).filter((key) => state.resources[key] > 0);
  const modal = openModal(
    { title: 'Çanta', className: 'wide bag-panel' },
    h(
      'div',
      { class: 'card' },
      sectionTitle('Ekipman Deposu', h('span', { class: 'muted' }, 'Kahraman detayında kuşanılır')),
      items.length === 0
        ? emptyState('bag', 'Depoda ekipman yok. Ganimet sandığı ve savaşlar ekipman getirir.')
        : h(
            'div',
            { class: 'bag-grid' },
            items.map(({ def, count }) =>
              h(
                'div',
                { class: 'bag-item', style: { '--tc': EQUIP_TIER_INFO[def.tier]?.color ?? null }, attrs: { title: `${def.name} (${EQUIP_SLOT_INFO[def.slot].name})` } },
                icon(slotIcon(def.slot), 48),
                h('span', { class: 'bag-tier' }, `T${def.tier}`),
                h('span', { class: 'bag-count' }, `×${fmtNum(count)}`),
                h('span', { class: 'bag-name' }, def.name),
              ),
            ),
          ),
    ),
    h(
      'div',
      { class: 'card' },
      sectionTitle('Parşömenler'),
      scrolls.length === 0
        ? h('p', { class: 'muted' }, 'Parşömenin yok.')
        : h(
            'div',
            { class: 'bag-scrolls' },
            scrolls.map((key) => h('div', { class: 'bag-scroll' }, resIcon(key, 44), h('span', null, RESOURCE_INFO[key].name), h('strong', null, `×${fmtNum(ui.game.state.resources[key])}`))),
            button('Çağır', () => {
              modal.close();
              ui.goTo('summon');
            }, { variant: 'primary', icon: 'heroicScroll' }),
          ),
    ),
  );
}
