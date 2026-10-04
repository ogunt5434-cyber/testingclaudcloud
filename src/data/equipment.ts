// Equipment catalogue. CONTRACT STUB — to be implemented.
import type { EquipDef, EquipSlot } from '../core/types';

export const EQUIPMENT: EquipDef[] = [];

/** Throws on unknown id. */
export function getEquipDef(id: string): EquipDef {
  const def = EQUIPMENT.find((e) => e.id === id);
  if (!def) throw new Error(`Unknown equipment: ${id}`);
  return def;
}

export function equipmentFor(slot: EquipSlot, tier: number): EquipDef {
  const def = EQUIPMENT.find((e) => e.slot === slot && e.tier === tier);
  if (!def) throw new Error(`No equipment for ${slot} tier ${tier}`);
  return def;
}
