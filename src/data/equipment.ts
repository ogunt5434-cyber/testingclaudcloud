// Equipment catalogue: 4 slots × 6 tiers = 24 items with flat stat bonuses.
// Tier-1 values follow the SPEC; primary stats grow ~×1.8 per tier. Boots speed grows more
// gently (~×1.5) so late-game turn order is not dominated by gear. Armor, helmet and boots all add
// hp, so the top weapons grow a little faster (atk ~×1.9, crit up to 10%) to keep endgame gear from
// only prolonging fights.
import { EQUIP_SLOTS } from '../core/types';
import type { EquipDef, EquipSlot, Stats } from '../core/types';

export const MAX_EQUIP_TIER = 6;

/** Display info per tier (index = tier). Index 0 is unused. */
export const EQUIP_TIER_INFO: readonly { name: string; color: string }[] = [
  { name: '', color: '#888888' },
  { name: 'Paslı', color: '#9e9e9e' },
  { name: 'Demir', color: '#cfd8dc' },
  { name: 'Çelik', color: '#4caf50' },
  { name: 'Mithril', color: '#42a5f5' },
  { name: 'Ejder', color: '#ab47bc' },
  { name: 'Efsanevi', color: '#ffb300' },
];

/** Turkish slot names and icons for the UI. */
export const EQUIP_SLOT_INFO: Record<EquipSlot, { name: string; icon: string }> = {
  weapon: { name: 'Silah', icon: '⚔️' },
  armor: { name: 'Zırh', icon: '🥋' },
  helmet: { name: 'Miğfer', icon: '⛑️' },
  boots: { name: 'Çizme', icon: '🥾' },
};

/** Item names per slot, index = tier - 1. */
const ITEM_NAMES: Record<EquipSlot, readonly string[]> = {
  weapon: ['Paslı Kılıç', 'Demir Kılıç', 'Çelik Kılıç', 'Mithril Kılıç', 'Ejder Kılıcı', 'Efsanevi Kılıç'],
  armor: ['Paslı Zırh', 'Demir Zırh', 'Çelik Zırh', 'Mithril Zırh', 'Ejder Zırhı', 'Efsanevi Zırh'],
  helmet: ['Paslı Miğfer', 'Demir Miğfer', 'Çelik Miğfer', 'Mithril Miğfer', 'Ejder Miğferi', 'Efsanevi Miğfer'],
  boots: ['Paslı Çizme', 'Demir Çizme', 'Çelik Çizme', 'Mithril Çizme', 'Ejder Çizmesi', 'Efsanevi Çizme'],
};

/** Flat stat bonuses per slot, index = tier - 1. */
const ITEM_STATS: Record<EquipSlot, readonly Partial<Stats>[]> = {
  weapon: [
    { atk: 20 },
    { atk: 36 },
    { atk: 65 },
    { atk: 117, crit: 0.02 },
    { atk: 230, crit: 0.06 },
    { atk: 430, crit: 0.1 },
  ],
  armor: [
    { hp: 200, armor: 8 },
    { hp: 360, armor: 14 },
    { hp: 650, armor: 26 },
    { hp: 1170, armor: 47 },
    { hp: 2100, armor: 84 },
    { hp: 3780, armor: 150 },
  ],
  helmet: [
    { hp: 150, armor: 6 },
    { hp: 270, armor: 11 },
    { hp: 485, armor: 19 },
    { hp: 875, armor: 35 },
    { hp: 1575, armor: 63 },
    { hp: 2835, armor: 113 },
  ],
  boots: [
    { spd: 3, hp: 80 },
    { spd: 5, hp: 145 },
    { spd: 8, hp: 260 },
    { spd: 12, hp: 465 },
    { spd: 17, hp: 840 },
    { spd: 24, hp: 1510 },
  ],
};

export function equipId(slot: EquipSlot, tier: number): string {
  return `${slot}_t${tier}`;
}

function buildSlotItems(slot: EquipSlot): EquipDef[] {
  return ITEM_STATS[slot].map((stats, i) => ({
    id: equipId(slot, i + 1),
    name: ITEM_NAMES[slot][i],
    slot,
    tier: i + 1,
    stats,
  }));
}

export const EQUIPMENT: EquipDef[] = EQUIP_SLOTS.flatMap(buildSlotItems);

const EQUIPMENT_BY_ID: ReadonlyMap<string, EquipDef> = new Map(EQUIPMENT.map((e) => [e.id, e]));

/** Throws on unknown id. */
export function getEquipDef(id: string): EquipDef {
  const def = EQUIPMENT_BY_ID.get(id);
  if (!def) throw new Error(`Unknown equipment: ${id}`);
  return def;
}

/** True if `id` is a known equipment id (useful when validating save data). */
export function isEquipId(id: string): boolean {
  return EQUIPMENT_BY_ID.has(id);
}

export function equipmentFor(slot: EquipSlot, tier: number): EquipDef {
  const def = EQUIPMENT_BY_ID.get(equipId(slot, tier));
  if (!def) throw new Error(`No equipment for ${slot} tier ${tier}`);
  return def;
}
