// Hero/player progression. CONTRACT STUB — to be implemented.
// All functions that take `state` MUTATE it in place.
import type { ActionResult, EquipSlot, GameState, HeroInstance, Resources, Rewards } from './types';

export function levelCap(_stars: number): number { throw new Error('not implemented'); }
/** Cost to go from `level` to `level + 1`. */
export function levelUpCost(_level: number): { gold: number; spirit: number } { throw new Error('not implemented'); }
/** Total cost to go from `from` to `to`. */
export function levelRangeCost(_from: number, _to: number): { gold: number; spirit: number } { throw new Error('not implemented'); }
/** Levels up as many of `levels` as affordable & below cap. Error if 0 levels gained. */
export function levelUpHero(_state: GameState, _uid: string, _levels: number): ActionResult<{ gained: number }> { throw new Error('not implemented'); }
/** null when already at MAX_STARS. */
export function starUpRequirement(_hero: HeroInstance): { fodderCount: number; levelRequired: number } | null { throw new Error('not implemented'); }
/** Valid fodder: same heroId, same stars, different uid, not locked, not in formation. Sorted lowest level first. */
export function findStarUpFodder(_state: GameState, _uid: string): string[] { throw new Error('not implemented'); }
/** Consumes fodder (auto-picked when omitted), refunds fodder level costs fully, unequips fodder gear to stock, stars+1. */
export function starUpHero(_state: GameState, _uid: string, _fodderUids?: string[]): ActionResult { throw new Error('not implemented'); }
export function dismissRewards(_hero: HeroInstance): Rewards { throw new Error('not implemented'); }
/** Fails if locked or in formation or last hero. Returns gear to stock. */
export function dismissHero(_state: GameState, _uid: string): ActionResult<Rewards> { throw new Error('not implemented'); }
export function equipItem(_state: GameState, _uid: string, _equipId: string): ActionResult { throw new Error('not implemented'); }
export function unequip(_state: GameState, _uid: string, _slot: EquipSlot): ActionResult { throw new Error('not implemented'); }
/** Equips the highest-tier available item per slot if better than current. Error if nothing changed. */
export function equipBest(_state: GameState, _uid: string): ActionResult<{ changed: number }> { throw new Error('not implemented'); }
export function playerExpToNext(_level: number): number { throw new Error('not implemented'); }
/** Adds resources/equipment/player exp (handles player level-ups). */
export function addRewards(_state: GameState, _rewards: Rewards): void { throw new Error('not implemented'); }
export function canAfford(_state: GameState, _cost: Partial<Resources>): boolean { throw new Error('not implemented'); }
/** Returns false (and changes nothing) if unaffordable. */
export function spend(_state: GameState, _cost: Partial<Resources>): boolean { throw new Error('not implemented'); }
