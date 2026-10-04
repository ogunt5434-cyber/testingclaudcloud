// Persistence. CONTRACT STUB — to be implemented.
import type { GameState } from './types';

export const SAVE_KEY = 'diyar-kahramanlari-save';
export const SAVE_VERSION = 1;

/** Fresh account: starter heroes in formation, starter scrolls/gems. */
export function newGameState(_now: number): GameState { throw new Error('not implemented'); }
export function serialize(_state: GameState): string { throw new Error('not implemented'); }
/** Returns null if raw is missing/corrupt. Migrates older versions and fills missing fields. */
export function deserialize(_raw: string | null): GameState | null { throw new Error('not implemented'); }
/** storage may be null/throwing (private mode) — never throw. */
export function loadGame(_storage: Storage | null, _now: number): GameState { throw new Error('not implemented'); }
export function saveGame(_storage: Storage | null, _state: GameState): void { throw new Error('not implemented'); }
