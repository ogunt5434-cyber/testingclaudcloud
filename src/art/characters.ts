// Chibi hero sprites & portraits. CONTRACT STUB — to be implemented.
import type { SpriteAnim } from './types';

/** Full-body chibi battle sprite (design box 160x200, feet at bottom-center). Starts in 'idle'. */
export function heroSprite(_heroId: string, _opts?: { facing?: 'left' | 'right' }): HTMLElement { throw new Error('not implemented'); }

/** Plays an animation on a sprite. One-shot anims resolve when done and return to idle ('die' stays down). */
export function setSpriteAnim(_sprite: HTMLElement, _anim: SpriteAnim): Promise<void> { throw new Error('not implemented'); }

/** Square bust portrait art (no frame — frames are the UI's job). Fills its box; default 96px. */
export function heroPortrait(_heroId: string, _opts?: { size?: number }): HTMLElement { throw new Error('not implemented'); }
