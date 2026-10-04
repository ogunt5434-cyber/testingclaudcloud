// Assembles a full character (layer order + animation groups) from a HeroLook.
import { drawArm, drawHand, drawLegs, drawScarfWrap, drawStrap, drawTorso } from './body';
import { drawAura, drawBackItem, drawGroundGlyph, drawParticles, drawTail, drawWisp, isTail } from './extras';
import { drawHead, drawHeadBack } from './face';
import { drawArrow, drawWeapon } from './gear';
import { f, type Pt } from './geom';
import { makePose, makeRig, type HeroLook, type Rig, type WeaponKind } from './model';
import { OUTLINE, Pen, STROKE } from './pen';

const SHIELDS: readonly WeaponKind[] = ['shield-round', 'shield-tower', 'shield-wood'];
/** Items that rest on the palm (drawn over the hand). */
const ON_PALM: readonly WeaponKind[] = ['bomb', 'urn', 'flask', 'orb'];
/** Whole figure scale inside the 160x200 box (about the feet). */
export const FIG_SCALE = 1.1;
/** Extra downward shift so the feet sit on y = 192 of the 200px box (shadow fills the rest). */
export const FIG_DROP = 4;

export interface Figure {
  /** Inner SVG markup (no <svg> root); contains the UID placeholder. */
  markup: string;
  rig: Rig;
  /** Square crop for portraits in viewBox units: [x, y, size]. */
  bust: [number, number, number];
  /** Resting angle of the main weapon and whether it is mirrored (used by the animation planner). */
  wAngle: number;
  wFlip: boolean;
  /** Head top / head center in sprite-box px (for HP bars, floating numbers, VFX targets). */
  headTop: number;
  headCenter: [number, number];
}

/** Per-weapon size tweaks (crossbows read better a bit larger). */
const WEAPON_SCALE: Partial<Record<WeaponKind, number>> = { crossbow: 1.3, urn: 1.15 };

/** Weapons and shields are drawn a bit oversized so each class reads at battle scale. */
const WEAPON_BOOST = 1.18;

function weaponAt(p: Pen, L: HeroLook, kind: WeaponKind, hand: Pt, angle: number, k: number, flip = false): void {
  const boost = ON_PALM.includes(kind) ? 1.05 : WEAPON_BOOST;
  p.at(hand[0], hand[1], angle, k * (WEAPON_SCALE[kind] ?? 1) * boost);
  if (flip) p.raw('<g transform="scale(-1 1)">');
  p.open('hs-weapon', [0, 0]);
  drawWeapon(p, kind, L);
  p.close();
  if (flip) p.close();
  p.close();
}

export function buildFigure(L: HeroLook): Figure {
  const R = makeRig(L.body);
  const P = makePose(R, L.pose);
  const H = R.head;
  const p = new Pen('k');
  const neck: Pt = [H.x - 3, R.shY + 3];
  const back = L.back ?? [];
  const k = R.k;
  const offIsShield = L.offhand !== undefined && SHIELDS.includes(L.offhand);
  const wAngle = L.wAngle ?? P.weaponAngle;
  const oAngle = L.oAngle ?? P.offAngle;
  const S = FIG_SCALE;
  const tx = R.cx * (1 - S);
  const ty = R.ground * (1 - S);

  p.raw(`<g transform="translate(0 ${FIG_DROP})">`);
  // ground shadow + glyph (do not move with the body)
  // soft radial ground shadow plus a tighter contact core under the feet
  const shR = (R.body === 'heavy' ? 40 : R.body === 'small' ? 30 : 34) * S * 1.15;
  const shId = p.id('gs');
  p.raw(
    `<defs><radialGradient id="${shId}"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".55" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>` +
      `<g class="hs-shadow" stroke="none" style="transform-origin:${R.cx}px ${R.ground + 1}px">` +
      `<ellipse cx="${R.cx}" cy="${R.ground + 1}" rx="${f(shR)}" ry="11" fill="url(#${shId})"/>` +
      `<ellipse cx="${R.cx}" cy="${R.ground + 1}" rx="${f(shR * 0.55)}" ry="4.5" fill="#0b0716" opacity=".35"/></g>`,
  );
  if (L.aura) p.raw(drawGroundGlyph(L, R));

  p.raw(`<g transform="matrix(${S} 0 0 ${S} ${f(tx)} ${f(ty)})">`);
  p.open('hs-fig', [R.cx, R.ground], `stroke="${OUTLINE}" stroke-width="${STROKE}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"`);

  p.defineSheen();
  p.rimTint = L.glow;

  // cast glow (hidden until a cast/attack flashes it)
  const gid = p.id('cg');
  const gy = (H.y + R.ground) / 2;
  p.raw(
    `<defs><radialGradient id="${gid}"><stop offset="0" stop-color="${L.glow}" stop-opacity=".9"/><stop offset=".55" stop-color="${L.glow}" stop-opacity=".35"/><stop offset="1" stop-color="${L.glow}" stop-opacity="0"/></radialGradient></defs>` +
      `<g class="hs-glow" style="transform-origin:${R.cx}px ${f(gy)}px" opacity="0" stroke="none"><ellipse cx="${R.cx}" cy="${f(gy)}" rx="70" ry="${f((R.ground - H.y) * 0.75)}" fill="url(#${gid})"/></g>`,
  );
  if (L.aura) drawAura(p, L, R);

  // back items
  const backItems = back.filter((b) => !isTail(b) && b !== 'wisp');
  if (backItems.length) {
    p.open('hs-up');
    for (const b of backItems) drawBackItem(p, L, R, b);
    p.close();
  }
  p.open('hs-up').open('hs-head', neck);
  drawHeadBack(p, L, H);
  p.close().close();

  for (const b of back.filter(isTail)) drawTail(p, L, R, b);

  drawLegs(p, L, R);

  // far arm: sleeve (+ off-hand weapon held behind the body)
  const farMain = P.weaponHand === 'far' ? L.weapon : undefined;
  const farBack: WeaponKind | undefined = farMain && !P.farFront ? farMain : !farMain && !offIsShield ? L.offhand : undefined;
  const farBackAngle = farMain ? wAngle : oAngle;
  p.open('hs-up').open('hs-armf', R.shF);
  drawArm(p, L, R, R.shF, P.far, true, {
    holding: farBack ? () => weaponAt(p, L, farBack, P.far.hand, farBackAngle, k) : undefined,
    noHand: P.farFront && !!farMain,
  });
  p.close().close();

  // torso
  p.open('hs-up').open('hs-torso', [R.cx, R.hipY]);
  drawTorso(p, L, R);
  if (back.includes('quiver')) drawStrap(p, R, '#6b4630');
  if (back.includes('scarf')) drawScarfWrap(p, L, R);
  p.close().close();

  // head
  p.open('hs-up').open('hs-head', neck);
  drawHead(p, L, H);
  p.close().close();

  // front layer for the far hand: shields, staffs, bows
  if ((offIsShield && L.offhand) || (P.farFront && farMain)) {
    p.open('hs-up').open('hs-off', R.shF);
    if (P.farFront && farMain) {
      if (L.pose === 'bow') {
        const big = farMain === 'thorn-bow' ? 1.18 : 1;
        const [fx, fy] = P.far.hand;
        const [nx, ny] = P.near.hand;
        const bx = fx - 3 * big * k;
        const s = `M${f(bx)} ${f(fy - 42 * big * k)}L${f(nx - 2)} ${f(ny)}L${f(bx)} ${f(fy + 42 * big * k)}`;
        p.raw('<g class="hs-string">');
        p.line(s, OUTLINE, 3);
        p.line(s, farMain === 'thorn-bow' ? L.glow : '#f6efe0', 1.3);
        p.raw('</g>');
      }
      weaponAt(p, L, farMain, P.far.hand, wAngle, k);
      drawHand(p, L, R, P.far.hand, true);
    } else if (L.offhand) {
      weaponAt(p, L, L.offhand, [P.far.hand[0] + 2, P.far.hand[1] + 2], oAngle, k);
    }
    p.close().close();
  }

  // near arm (+ main weapon)
  const nearWeapon = P.weaponHand === 'near' ? L.weapon : undefined;
  const palm = nearWeapon !== undefined && ON_PALM.includes(nearWeapon);
  const drawNear = nearWeapon ? () => weaponAt(p, L, nearWeapon, P.near.hand, wAngle, k, P.flipWeapon) : undefined;
  p.open('hs-up').open('hs-armn', R.shN);
  drawArm(p, L, R, R.shN, P.near, false, {
    before:
      L.pose === 'bow'
        ? () => {
            p.raw('<g class="hs-string">');
            drawArrow(p, P.near.hand[0] - 4, P.near.hand[1], P.far.hand[0] + 14 * k, P.far.hand[1], L);
            p.raw('</g>');
          }
        : undefined,
    holding: palm ? undefined : drawNear,
    after: palm ? drawNear : undefined,
  });
  p.close().close();

  // ambient fx
  p.open('hs-fx');
  if (back.includes('wisp')) drawWisp(p, L, R);
  if (L.particles) drawParticles(p, L, R, L.particles, L.ornate >= 3 ? 7 : 5);
  p.close();

  p.close(); // fig
  p.raw('</g>'); // scale
  p.raw('</g>'); // drop

  const s = 3.3 * H.r * S;
  const cx = (H.x + 0.12 * H.r) * S + tx;
  const top = (H.y - 1.45 * H.r) * S + ty + FIG_DROP;
  const bust: [number, number, number] = [cx - s / 2, top, s];
  const hy = (y: number) => y * S + ty + FIG_DROP;
  return {
    markup: p.toString(),
    rig: R,
    bust,
    wAngle,
    wFlip: !!P.flipWeapon,
    headTop: Math.round(hy(H.y - H.r)),
    headCenter: [Math.round(H.x * S + tx), Math.round(hy(H.y))],
  };
}
