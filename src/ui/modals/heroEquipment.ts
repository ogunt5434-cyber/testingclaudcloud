// "Ekipman" tab of the hero detail: 4 gear slots with tier/stats, per-slot unequip and "En İyisini Kuşan".
import { heroSprite, icon } from '../../art';
import { STAT_INFO } from '../../core/constants';
import { EQUIP_SLOTS } from '../../core/types';
import type { EquipDef, EquipSlot, GameState, StatKey } from '../../core/types';
import { EQUIP_SLOT_INFO, EQUIP_TIER_INFO, getEquipDef, isEquipId } from '../../data/equipment';
import { button, sectionTitle } from '../components';
import { runAction } from '../context';
import { h } from '../dom';
import { fmtStat, slotIcon } from '../format';
import type { DetailCtx } from './heroDetail';

function equipped(id: string | undefined): EquipDef | null {
  return id && isEquipId(id) ? getEquipDef(id) : null;
}

/** Highest tier of `slot` currently in the unequipped stock (0 if none). */
export function bestStockTier(stock: Readonly<GameState['equipment']>, slot: EquipSlot): number {
  let best = 0;
  for (const [id, count] of Object.entries(stock)) {
    if (count <= 0 || !isEquipId(id)) continue;
    const def = getEquipDef(id);
    if (def.slot === slot && def.tier > best) best = def.tier;
  }
  return best;
}

function statLines(def: EquipDef): HTMLElement {
  const entries = Object.entries(def.stats) as [StatKey, number][];
  return h(
    'div',
    { class: 'eq-stats' },
    entries.map(([key, value]) => h('span', { class: 'eq-stat' }, `+${fmtStat(key, value)} ${STAT_INFO[key].name}`)),
  );
}

function slotCard(ctx: DetailCtx, slot: EquipSlot, upgradeTier: number): HTMLElement {
  const { hero, ui } = ctx;
  const def = equipped(hero.equipment[slot]);
  const tierInfo = def ? EQUIP_TIER_INFO[def.tier] : null;
  return h(
    'div',
    { class: ['eq-slot', def ? 'filled' : 'empty'], style: { '--tc': tierInfo?.color ?? null } },
    h(
      'div',
      { class: 'eq-icon', attrs: { title: tierInfo?.name || EQUIP_SLOT_INFO[slot].name } },
      icon(slotIcon(slot), 52),
      def ? h('span', { class: 'eq-tier' }, `T${def.tier}`) : null,
    ),
    h(
      'div',
      { class: 'eq-info' },
      h('span', { class: 'eq-name' }, def ? def.name : `${EQUIP_SLOT_INFO[slot].name} — Boş`),
      def ? statLines(def) : h('span', { class: 'eq-empty' }, 'Kuşanılmış eşya yok'),
      upgradeTier > (def?.tier ?? 0) ? h('span', { class: 'eq-upgrade' }, icon('buff-up', 16), `Depoda T${upgradeTier} var`) : null,
    ),
    def
      ? button('Çıkar', () => runAction(ui, () => ui.game.unequip(hero.uid, slot), `${def.name} çıkarıldı.`), { variant: 'ghost', class: 'btn-small' })
      : null,
  );
}

export function equipmentTab(ctx: DetailCtx): HTMLElement {
  const { ui, hero } = ctx;
  const stock = ui.game.state.equipment;
  const upgrades = EQUIP_SLOTS.map((slot) => bestStockTier(stock, slot));
  const hasUpgrade = EQUIP_SLOTS.some((slot, i) => upgrades[i] > (equipped(hero.equipment[slot])?.tier ?? 0));
  const stockCount = Object.values(stock).reduce((sum, n) => sum + Math.max(0, n), 0);
  const card = (slot: EquipSlot): HTMLElement => slotCard(ctx, slot, upgrades[EQUIP_SLOTS.indexOf(slot)]);
  let figure: HTMLElement | null = null;
  try {
    figure = heroSprite(hero.heroId);
  } catch {
    figure = null;
  }
  // Paper doll: weapon & armour on the left, helmet & boots on the right, the hero in between.
  return h(
    'div',
    { class: 'equip-tab' },
    h(
      'div',
      { class: 'card eq-doll' },
      sectionTitle('Ekipman', h('span', { class: 'muted' }, `Depo: ${stockCount} parça`)),
      h(
        'div',
        { class: 'eq-doll-grid' },
        h('div', { class: 'eq-col' }, card('weapon'), card('armor')),
        h('div', { class: 'eq-figure', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'eq-figure-pad' }), figure),
        h('div', { class: 'eq-col' }, card('helmet'), card('boots')),
      ),
    ),
    button(
      'En İyisini Kuşan',
      () => {
        ctx.flash('equip');
        if (!runAction(ui, () => ui.game.equipBest(hero.uid), (v) => `${v.changed} eşya kuşanıldı.`)) ctx.flash(null);
      },
      { variant: 'gold', icon: 'armor', class: 'btn-block', disabled: !hasUpgrade, sub: hasUpgrade ? null : 'Daha iyi ekipman yok' },
    ),
  );
}
