// Summoning (gacha). CONTRACT STUB — to be implemented.
import type { ActionResult, GameState, HeroInstance, Resources } from './types';
import type { Rng } from './rng';

export type SummonType = 'basic' | 'heroic';

/** Star rarity -> probability. Rarities are 2..5. */
export const SUMMON_RATES: Record<SummonType, Record<number, number>> = {
  basic: { 2: 0.5, 3: 0.4, 4: 0.095, 5: 0.005 },
  heroic: { 3: 0.55, 4: 0.41, 5: 0.04 },
};

/** Cost options in priority order (scrolls first, then gems for heroic). */
export function summonCostOptions(_type: SummonType, _count: 1 | 10): Partial<Resources>[] { throw new Error('not implemented'); }
/** Adds a new hero instance (level 1, stars = rarity unless given) to state and returns it. */
export function createHero(_state: GameState, _heroId: string, _stars?: number): HeroInstance { throw new Error('not implemented'); }
/** Pays the first affordable cost option, rolls, adds heroes. Heroic pity guarantees a 5-star at HEROIC_PITY. */
export function summon(_state: GameState, _type: SummonType, _count: 1 | 10, _rng: Rng): ActionResult<HeroInstance[]> { throw new Error('not implemented'); }
