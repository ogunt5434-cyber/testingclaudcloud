// Side-view battle geometry in 1280x720 design px (pure, no DOM).
// Player team on the LEFT facing right, enemies mirrored on the RIGHT facing left. Front row (pos 0-1)
// stands nearest the centre line; the back row (pos 2-5) is staggered 2x2 behind it.
import type { Side, UnitRef } from '../../core/types';

export const STAGE_W = 1280;
export const STAGE_H = 720;

export interface Point {
  x: number;
  y: number;
}

/**
 * Feet positions of the attacker (left) team by formation slot. Defenders mirror x around the centre.
 * Three columns 150 px apart (front ~520, back inner ~370, back outer ~220) over the ground band y 410-675;
 * units in one column stand ~190 px apart so a bar block never covers the head of the unit behind, and
 * the two front columns keep a 220+ px gap at the centre line.
 */
const LEFT_SLOTS: readonly Point[] = [
  { x: 528, y: 462 }, // 0 front, upper
  { x: 508, y: 652 }, // 1 front, lower
  { x: 378, y: 412 }, // 2 back, inner column
  { x: 358, y: 602 }, // 3 back, inner column
  { x: 228, y: 486 }, // 4 back, outer column
  { x: 208, y: 674 }, // 5 back, outer column
];

/** Sprite box (heroSprite design box 160x200 scaled up): ~140 px tall heroes on the 720 px stage. */
export const SPRITE_SCALE = 1.1;
export const SPRITE_W = 160 * SPRITE_SCALE;
export const SPRITE_H = 200 * SPRITE_SCALE;
/** Feet line inside the sprite box (heroSprite puts feet at y = 192 of 200). */
export const SPRITE_FEET = 192 * SPRITE_SCALE;

export type BodyKind = 'normal' | 'heavy' | 'small' | 'ghost';

/** Height of the top of the head above the feet in the 200 px sprite design box, by body type (data-body). */
const HEAD_TOP: Record<BodyKind, number> = { normal: 126, heavy: 136, small: 110, ghost: 134 };
/** Gap between the head and the bottom of the bar block (hair / hat tips may tuck under the bar). */
const BAR_GAP = 10;

function bodyKind(body: string | undefined): BodyKind {
  return body === 'heavy' || body === 'small' || body === 'ghost' ? body : 'normal';
}

/** Distance from the feet up to the bottom of the HP-bar block (small heroes stand shorter). */
export function barLift(body: string | undefined): number {
  return Math.round(HEAD_TOP[bodyKind(body)] * SPRITE_SCALE + BAR_GAP);
}

/** +1 when the side faces right (attackers), -1 for defenders. */
export function facingDir(side: Side): 1 | -1 {
  return side === 'attacker' ? 1 : -1;
}

/** Feet anchor of a formation slot. Out-of-range positions are clamped (never throws). */
export function slotPoint(ref: UnitRef): Point {
  const p = LEFT_SLOTS[Math.max(0, Math.min(LEFT_SLOTS.length - 1, Math.floor(ref.pos)))];
  return ref.side === 'attacker' ? { x: p.x, y: p.y } : { x: STAGE_W - p.x, y: p.y };
}

/** Body centre (VFX target: playVfx draws feet rings ~55 px under it). */
export function bodyPoint(ref: UnitRef): Point {
  const p = slotPoint(ref);
  return { x: p.x, y: p.y - 70 };
}

/** Where a projectile leaves the shooter (hand height, a little in front). */
export function launchPoint(ref: UnitRef): Point {
  const p = slotPoint(ref);
  return { x: p.x + facingDir(ref.side) * 44, y: p.y - 94 };
}

/** Where a melee striker stops in front of its target. */
export function strikePoint(actor: UnitRef, target: UnitRef): Point {
  const t = slotPoint(target);
  return { x: t.x - facingDir(actor.side) * 112, y: t.y + 3 };
}

/** Centroid of several units' body points (aim point of wave effects). */
export function centroid(refs: readonly UnitRef[]): Point {
  if (refs.length === 0) return { x: STAGE_W / 2, y: 480 };
  const pts = refs.map(bodyPoint);
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

/** Lower units are drawn in front (z-index grows with the feet line). */
export function depthOf(y: number): number {
  return Math.round(y);
}
