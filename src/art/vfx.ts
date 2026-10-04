// Battle visual effects. CONTRACT STUB — to be implemented.
import type { Faction } from '../core/types';
import type { Point, VfxKind } from './types';

/** Plays a visual effect inside `layer` (a positioned element in stage px). Resolves when finished. */
export function playVfx(_layer: HTMLElement, _kind: VfxKind, _from: Point, _to: Point, _opts?: { faction?: Faction; big?: boolean }): Promise<void> { throw new Error('not implemented'); }
