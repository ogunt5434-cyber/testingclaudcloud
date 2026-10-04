// Character look schema + body rigs. Coordinates are in the sprite design box (viewBox 0 0 160 200),
// feet on the ground line at the bottom-center, facing right in a 3/4 view. The near side of the body
// (drawn on top) is the left side of the silhouette; the far side is the right side.
import type { Pt } from './geom';

export type BodyType = 'normal' | 'heavy' | 'small' | 'ghost';

export type HeadKind =
  | 'human' | 'fox' | 'bear' | 'lion' | 'owl' | 'lizard' | 'skull' | 'rock' | 'tree' | 'demon' | 'shroud' | 'mushroom';

/** Face expression preset (eyes + brows + mouth). */
export type Expr = 'cute' | 'brave' | 'angry' | 'sly' | 'calm' | 'sleepy' | 'old' | 'fierce' | 'glow';

export type MouthKind = 'smile' | 'grin' | 'frown' | 'smirk' | 'o' | 'fang' | 'line' | 'teeth' | 'none';

export type HairStyle = 'short' | 'spiky' | 'long' | 'ponytail' | 'bob' | 'wild' | 'flame' | 'wisps' | 'none';

export type HatKind =
  | 'nightcap' | 'helm-bat' | 'witch' | 'wizard' | 'hood' | 'mask' | 'helm-great' | 'goggles' | 'bell-veil'
  | 'helm-eagle' | 'horns-small' | 'horns-big' | 'flame-crown' | 'mushroom-cap' | 'snake-hood' | 'antlers'
  | 'leaf-crown' | 'headscarf' | 'carapace' | 'spider-hood' | 'bone-crown' | 'feather-band' | 'visor'
  | 'sun-halo' | 'halo' | 'circlet' | 'ember-tiara';

export type OutfitKind =
  | 'robe' | 'plate' | 'tunic' | 'ninja' | 'apron' | 'cloak' | 'rock' | 'bark' | 'shroud' | 'carapace' | 'scales'
  | 'leather';

export type PoseKind = 'guard' | 'onehand' | 'staff' | 'bow' | 'crossbow' | 'daggers' | 'twohand' | 'shoulder' | 'hold' | 'claws';

export type WeaponKind =
  | 'sword' | 'axe' | 'bat-axe' | 'mace' | 'club' | 'greatsword' | 'great-axe' | 'dagger' | 'kris' | 'zap-dagger'
  | 'sickle' | 'claws' | 'bow' | 'thorn-bow' | 'crossbow' | 'bomb' | 'flask' | 'urn' | 'lantern-staff'
  | 'moon-staff' | 'eclipse-staff' | 'bell-staff' | 'sun-staff' | 'star-staff' | 'magma-staff' | 'web-staff'
  | 'spore-staff' | 'branch-staff' | 'shield-round' | 'shield-tower' | 'shield-wood' | 'orb' | 'cane';

export type BackKind =
  | 'cape' | 'wings-bat' | 'wings-feather' | 'wings-light' | 'wings-eagle' | 'tail-fox' | 'tail-lizard' | 'tail-lion'
  | 'tail-devil' | 'tail-scorpion' | 'spider-legs' | 'quiver' | 'barrel' | 'scarf' | 'wisp';

export type ParticleKind = 'motes' | 'embers' | 'leaves' | 'stars' | 'sparks' | 'wisps' | 'spores' | 'feathers';

export interface HeroLook {
  id: string;
  body: BodyType;
  head: HeadKind;
  /** Skin / fur / bark base color. */
  skin: string;
  /** Secondary skin tone (muzzle, belly, scales underside). */
  skin2?: string;
  expr: Expr;
  mouth?: MouthKind;
  eye: string;
  blush?: boolean;
  ear?: 'human' | 'pointy' | 'none';
  hair?: { style: HairStyle; color: string; tip?: string };
  beard?: { style: 'full' | 'long' | 'moss'; color: string };
  /** Headgear layers, drawn in order. */
  hats?: HatKind[];
  hat?: string;
  hat2?: string;
  outfit: OutfitKind;
  /** Main garment color. */
  cloth: string;
  /** Secondary garment (under-layer, pants, sleeves). */
  cloth2: string;
  /** Trim / ornament color (gold on rare heroes). */
  trim: string;
  metal?: string;
  /** Weapon wood / shaft color and blade color. */
  wood?: string;
  blade?: string;
  boots?: string;
  /** Glove/hand color when it differs from skin. */
  hand?: string;
  pose: PoseKind;
  weapon?: WeaponKind;
  offhand?: WeaponKind;
  back?: BackKind[];
  /** Color of wings / cape / tail. */
  backColor?: string;
  /** Faction accent / magic glow. */
  glow: string;
  aura?: boolean;
  particles?: ParticleKind;
  /** 0..3 — rarer heroes get more ornament (trims, gems, glows). */
  ornate: number;
  /** Optional per-hero weapon angle overrides (deg, clockwise from up). */
  wAngle?: number;
  oAngle?: number;
}

export interface Head {
  x: number;
  y: number;
  r: number;
}

export interface Rig {
  body: BodyType;
  cx: number;
  ground: number;
  hipY: number;
  /** Top of the torso (shoulder line). */
  shY: number;
  /** Torso half-width at the shoulders / at the hips. */
  tw: number;
  ww: number;
  legW: number;
  hipDx: number;
  footDx: number;
  head: Head;
  armW: number;
  handR: number;
  /** Near (front-layer) and far shoulder joints. */
  shN: Pt;
  shF: Pt;
  /** Gear scale for weapons and wings. */
  k: number;
}

export const CX = 80;
export const GROUND = 188;
export const VIEW_W = 160;
export const VIEW_H = 200;

export function makeRig(body: BodyType): Rig {
  const cx = CX;
  const ground = GROUND;
  const spec = {
    normal: { hipY: 160, shY: 121, tw: 17, ww: 16, legW: 12.5, hipDx: 7, footDx: 11, r: 26, hdy: 4, armW: 10.5, handR: 6, k: 1 },
    heavy: { hipY: 155, shY: 107, tw: 25, ww: 22, legW: 16, hipDx: 10.5, footDx: 14, r: 25.5, hdy: 8, armW: 14, handR: 8, k: 1.15 },
    small: { hipY: 168, shY: 138, tw: 14.5, ww: 14.5, legW: 11, hipDx: 6, footDx: 9, r: 27, hdy: 4, armW: 9.5, handR: 5.5, k: 0.88 },
    ghost: { hipY: 158, shY: 114, tw: 17, ww: 12, legW: 12, hipDx: 7, footDx: 10, r: 26, hdy: 4, armW: 10.5, handR: 6, k: 1 },
  }[body];
  const head: Head = { x: cx + 3, y: spec.shY + spec.hdy - spec.r, r: spec.r };
  return {
    body,
    cx,
    ground,
    hipY: spec.hipY,
    shY: spec.shY,
    tw: spec.tw,
    ww: spec.ww,
    legW: spec.legW,
    hipDx: spec.hipDx,
    footDx: spec.footDx,
    head,
    armW: spec.armW,
    handR: spec.handR,
    shN: [cx - spec.tw + 5, spec.shY + 7],
    shF: [cx + spec.tw - 4, spec.shY + 6],
    k: spec.k,
  };
}

export interface ArmPose {
  elbow: Pt;
  hand: Pt;
}

export interface Pose {
  near: ArmPose;
  far: ArmPose;
  /** Weapon placement: which hand holds it and its angle (deg, clockwise from up). */
  weaponHand: 'near' | 'far';
  weaponAngle: number;
  offAngle: number;
  /** Far-hand weapon is drawn in front of the head/torso (staffs, bows) instead of behind. */
  farFront: boolean;
  /** Mirror the main weapon (e.g. an axe resting on the shoulder with its blade hanging back). */
  flipWeapon?: boolean;
}

export function makePose(rig: Rig, kind: PoseKind): Pose {
  const [nx, ny] = rig.shN;
  const [fx, fy] = rig.shF;
  const L = (rig.hipY - rig.shY) * 0.82;
  const k = rig.k;
  const H = rig.head;
  /** x just clear of the face, for things held in front (staffs, bows). */
  const clearX = Math.max(fx + 18 * k, H.x + H.r * 1.08 + 4);
  const relaxedFar: ArmPose = { elbow: [fx + 5 * k, fy + 0.45 * L], hand: [fx + 8 * k, fy + 0.8 * L] };
  const base = { offAngle: 0, farFront: false };
  switch (kind) {
    case 'guard':
      return {
        ...base,
        near: { elbow: [nx - 4 * k, ny + 0.45 * L], hand: [nx + 5 * k, ny + 0.78 * L] },
        far: { elbow: [fx + 9 * k, fy + 0.3 * L], hand: [fx + 15 * k, fy + 0.52 * L] },
        weaponHand: 'near',
        weaponAngle: -28,
      };
    case 'onehand':
      return {
        ...base,
        near: { elbow: [nx - 2 * k, ny + 0.55 * L], hand: [rig.cx + 4 * k, rig.hipY - 7] },
        far: relaxedFar,
        weaponHand: 'near',
        weaponAngle: 48,
      };
    case 'staff':
      return {
        ...base,
        near: { elbow: [nx - 3 * k, ny + 0.48 * L], hand: [nx + 11 * k, ny + 0.66 * L] },
        far: { elbow: [fx + 9 * k, fy + 0.38 * L], hand: [clearX, fy + 0.6 * L] },
        weaponHand: 'far',
        weaponAngle: 4,
        farFront: true,
      };
    case 'bow':
      return {
        ...base,
        near: { elbow: [nx - 9 * k, ny + 0.24 * L], hand: [nx + 10 * k, ny + 0.24 * L] },
        far: { elbow: [fx + 12 * k, fy + 0.18 * L], hand: [clearX + 3, fy + 0.24 * L] },
        weaponHand: 'far',
        weaponAngle: 0,
        farFront: true,
      };
    case 'crossbow':
      return {
        ...base,
        near: { elbow: [nx - 3 * k, ny + 0.52 * L], hand: [nx + 9 * k, ny + 0.6 * L] },
        far: { elbow: [fx + 8 * k, fy + 0.45 * L], hand: [fx + 19 * k, fy + 0.5 * L] },
        weaponHand: 'near',
        weaponAngle: 80,
      };
    case 'daggers':
      return {
        ...base,
        near: { elbow: [nx - 3 * k, ny + 0.5 * L], hand: [nx + 8 * k, ny + 0.74 * L] },
        far: { elbow: [fx + 10 * k, fy + 0.22 * L], hand: [fx + 20 * k, fy + 0.12 * L] },
        weaponHand: 'near',
        weaponAngle: 128,
        offAngle: 62,
      };
    case 'twohand': {
      const hand: Pt = [rig.cx + 2 * k, rig.hipY - 8];
      const a = (52 * Math.PI) / 180;
      return {
        ...base,
        near: { elbow: [nx - 3 * k, ny + 0.55 * L], hand },
        far: { elbow: [fx + 6 * k, fy + 0.5 * L], hand: [hand[0] + Math.sin(a) * 15 * k, hand[1] - Math.cos(a) * 15 * k] },
        weaponHand: 'near',
        weaponAngle: 52,
      };
    }
    case 'shoulder':
      return {
        ...base,
        near: { elbow: [nx - 6 * k, ny + 0.45 * L], hand: [nx + 7 * k, ny + 0.5 * L] },
        far: relaxedFar,
        weaponHand: 'near',
        weaponAngle: -52,
        flipWeapon: true,
      };
    case 'hold':
      return {
        ...base,
        near: { elbow: [nx - 1 * k, ny + 0.58 * L], hand: [rig.cx + rig.tw * 0.7, ny + 0.78 * L] },
        far: relaxedFar,
        weaponHand: 'near',
        weaponAngle: 0,
      };
    case 'claws':
      return {
        ...base,
        near: { elbow: [nx + 2 * k, ny + 0.45 * L], hand: [nx + 18 * k, ny + 0.55 * L] },
        far: { elbow: [fx + 10 * k, fy + 0.2 * L], hand: [fx + 22 * k, fy + 0.22 * L] },
        weaponHand: 'near',
        weaponAngle: 95,
        offAngle: 80,
      };
  }
}
