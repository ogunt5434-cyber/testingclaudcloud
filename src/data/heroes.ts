// Hero roster. CONTRACT STUB — to be implemented.
import type { HeroDef } from '../core/types';

export const HEROES: HeroDef[] = [];

/** Throws on unknown id. */
export function getHeroDef(id: string): HeroDef {
  const def = HEROES.find((h) => h.id === id);
  if (!def) throw new Error(`Unknown hero: ${id}`);
  return def;
}

/** Heroes grouped by natural rarity (2..5). */
export function heroesByRarity(rarity: number): HeroDef[] {
  return HEROES.filter((h) => h.rarity === rarity);
}
