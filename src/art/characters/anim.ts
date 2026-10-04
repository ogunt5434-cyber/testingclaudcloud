// One-shot sprite animations via the Web Animations API. The idle loop is pure CSS (sprites.css)
// and only runs while the sprite's data-anim is "idle".
import type { SpriteAnim } from '../types';

export type AttackStyle = 'melee' | 'shoot' | 'magic';

/** Nominal one-shot durations (ms). */
export const ANIM_MS: Record<Exclude<SpriteAnim, 'idle'>, number> = {
  attack: 450,
  cast: 600,
  hit: 250,
  die: 700,
  victory: 800,
};

interface State {
  anims: Animation[];
  token: number;
  resolve?: () => void;
  timer?: ReturnType<typeof setTimeout>;
}

const states = new WeakMap<HTMLElement, State>();

function stateOf(el: HTMLElement): State {
  let s = states.get(el);
  if (!s) {
    s = { anims: [], token: 0 };
    states.set(el, s);
  }
  return s;
}

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

type Frames = Keyframe[];

const T = (x: number, y: number, rot = 0, s = 1) => `translate(${x}px, ${y}px) rotate(${rot}deg)${s !== 1 ? ` scale(${s})` : ''}`;
const ROT = (deg: number) => `rotate(${deg}deg)`;

function rotFrames(values: [number, number][]): Frames {
  return values.map(([offset, deg]) => ({ offset, transform: ROT(deg) }));
}

interface Plan {
  /** selector -> keyframes */
  parts: [string, Frames][];
  /** keyframes for the <svg> element itself (filters) */
  svg?: Frames;
  easing?: string;
}

/** What the animation planner needs to know about a sprite (stored as data-* attributes). */
export interface SpriteInfo {
  style: AttackStyle;
  pose: string;
  /** Main weapon angle at rest (deg, clockwise from up). */
  wAngle: number;
  /** Main weapon is mirrored (rotations inside it are visually negated). */
  wFlip: boolean;
}

type Track = [number, number][];

/** Far arm + front-layer far hand (staff, bow, shield) move as one when the far hand holds the front item. */
function farTracks(info: SpriteInfo, arm: Track, off: Track): [string, Frames][] {
  const front = info.pose === 'staff' || info.pose === 'bow';
  return [
    ['.hs-armf', rotFrames(arm)],
    ['.hs-off', rotFrames(front ? arm : off)],
  ];
}

/** Rotations that bring a near-hand weapon to chest height pointing up-forward (keeps the face clear). */
function raiseNear(info: SpriteInfo, arm: number, target: number): { arm: number; weapon: number } {
  const inner = target - (info.wAngle + arm);
  return { arm, weapon: info.wFlip ? -inner : inner };
}

function plan(anim: Exclude<SpriteAnim, 'idle'>, info: SpriteInfo): Plan {
  const { style, pose } = info;
  switch (anim) {
    case 'attack':
      if (style === 'shoot') {
        const xbow = pose === 'crossbow';
        return {
          parts: [
            ['.hs-fig', [{ offset: 0, transform: T(0, 0) }, { offset: 0.45, transform: T(-2, 0, -3) }, { offset: 0.6, transform: T(-6, 0, -5) }, { offset: 1, transform: T(0, 0) }]],
            ['.hs-armn', xbow
              ? [{ offset: 0, transform: T(0, 0) }, { offset: 0.45, transform: T(0, 0, -6) }, { offset: 0.58, transform: T(-5, -1, -12) }, { offset: 1, transform: T(0, 0) }]
              : [{ offset: 0, transform: T(0, 0) }, { offset: 0.45, transform: T(-8, 1) }, { offset: 0.56, transform: T(4, -1) }, { offset: 1, transform: T(0, 0) }]],
            ...farTracks(info, [[0, 0], [0.45, -4], [0.6, -12], [1, 0]], [[0, 0], [0.45, -4], [0.6, -10], [1, 0]]),
            ['.hs-glow', [{ offset: 0, opacity: 0 }, { offset: 0.55, opacity: 0.35 }, { offset: 1, opacity: 0 }]],
          ],
        };
      }
      if (style === 'magic') {
        const throwing = pose === 'hold';
        return {
          parts: [
            ['.hs-fig', [{ offset: 0, transform: T(0, 0) }, { offset: 0.35, transform: T(-2, -2, -4) }, { offset: 0.6, transform: T(5, 0, 5) }, { offset: 1, transform: T(0, 0) }]],
            ['.hs-armn', rotFrames(throwing ? [[0, 0], [0.35, 35], [0.58, -70], [0.8, -40], [1, 0]] : [[0, 0], [0.35, -30], [0.6, 12], [1, 0]])],
            ...farTracks(info, [[0, 0], [0.35, -20], [0.6, 22], [1, 0]], [[0, 0], [0.38, -20], [0.62, 6], [1, 0]]),
            ['.hs-glow', [{ offset: 0, opacity: 0, transform: 'scale(.6)' }, { offset: 0.45, opacity: 0.75, transform: 'scale(1.05)' }, { offset: 1, opacity: 0, transform: 'scale(1.2)' }]],
          ],
        };
      }
      return {
        parts: [
          ['.hs-fig', [{ offset: 0, transform: T(0, 0) }, { offset: 0.35, transform: T(-5, 0, -6) }, { offset: 0.58, transform: T(10, 0, 8) }, { offset: 0.78, transform: T(4, 0, 3) }, { offset: 1, transform: T(0, 0) }]],
          ['.hs-armn', rotFrames(pose === 'shoulder' ? [[0, 0], [0.35, -30], [0.58, 95], [0.78, 60], [1, 0]] : [[0, 0], [0.35, -75], [0.58, 55], [0.78, 25], [1, 0]])],
          ...farTracks(
            info,
            pose === 'daggers' || pose === 'claws' ? [[0, 0], [0.25, -50], [0.5, 65], [0.75, 20], [1, 0]] : [[0, 0], [0.35, -25], [0.58, 22], [0.78, 8], [1, 0]],
            [[0, 0], [0.35, -18], [0.58, 14], [1, 0]],
          ),
          ['.hs-head', rotFrames([[0, 0], [0.35, -6], [0.58, 6], [1, 0]])],
        ],
      };
    case 'cast': {
      const parts: [string, Frames][] = [
        ['.hs-fig', [{ offset: 0, transform: T(0, 0) }, { offset: 0.35, transform: T(0, -6, -2, 1.03) }, { offset: 0.7, transform: T(0, -8, -2, 1.04) }, { offset: 1, transform: T(0, 0) }]],
        ['.hs-head', rotFrames([[0, 0], [0.3, -6], [0.7, -5], [1, 0]])],
        ['.hs-glow', [{ offset: 0, opacity: 0, transform: 'scale(.5)' }, { offset: 0.35, opacity: 0.95, transform: 'scale(1.1)' }, { offset: 0.7, opacity: 0.6, transform: 'scale(1.25)' }, { offset: 1, opacity: 0, transform: 'scale(1.4)' }]],
        ['.hs-aura', [{ offset: 0, opacity: 1 }, { offset: 0.4, opacity: 1, transform: 'scale(1.25)' }, { offset: 1, opacity: 1 }]],
      ];
      if (pose === 'staff') {
        // lift the staff high, other hand thrust forward
        const lift: Frames = [{ offset: 0, transform: T(0, 0) }, { offset: 0.3, transform: T(3, -12, -10) }, { offset: 0.7, transform: T(3, -13, -12) }, { offset: 1, transform: T(0, 0) }];
        parts.push(['.hs-armf', lift], ['.hs-off', lift], ['.hs-armn', rotFrames([[0, 0], [0.3, -45], [0.7, -48], [1, 0]])]);
      } else if (pose === 'bow' || pose === 'crossbow') {
        // aim at the sky
        parts.push(['.hs-armn', rotFrames([[0, 0], [0.3, -28], [0.7, -30], [1, 0]])], ...farTracks(info, [[0, 0], [0.3, -28], [0.7, -30], [1, 0]], [[0, 0], [0.3, -20], [1, 0]]));
      } else {
        const r = pose === 'shoulder' ? raiseNear(info, 40, -10) : pose === 'hold' ? { arm: -22, weapon: 0 } : pose === 'guard' ? raiseNear(info, -35, 42) : raiseNear(info, -50, 28);
        parts.push(
          ['.hs-armn', rotFrames([[0, 0], [0.3, r.arm], [0.7, r.arm - 4], [1, 0]])],
          ['.hs-armn .hs-weapon', rotFrames([[0, 0], [0.3, r.weapon], [0.7, r.weapon], [1, 0]])],
          ...farTracks(info, [[0, 0], [0.3, -60], [0.7, -64], [1, 0]], [[0, 0], [0.3, -22], [0.7, -24], [1, 0]]),
        );
      }
      return { parts };
    }
    case 'hit':
      return {
        parts: [
          ['.hs-fig', [{ offset: 0, transform: T(0, 0) }, { offset: 0.3, transform: T(-8, 0, -7) }, { offset: 0.7, transform: T(-3, 0, -2) }, { offset: 1, transform: T(0, 0) }]],
          ['.hs-head', rotFrames([[0, 0], [0.3, -10], [1, 0]])],
        ],
        svg: [
          { offset: 0, filter: 'brightness(1)' },
          { offset: 0.15, filter: 'brightness(2.5) saturate(0.3)' },
          { offset: 0.45, filter: 'brightness(1.6) saturate(0.6)' },
          { offset: 1, filter: 'brightness(1)' },
        ],
      };
    case 'die':
      return {
        easing: 'ease-in',
        parts: [
          ['.hs-fig', [
            { offset: 0, transform: T(0, 0), opacity: 1 },
            { offset: 0.25, transform: T(-2, -8, -12), opacity: 1 },
            { offset: 0.7, transform: T(32, -18, -86), opacity: 0.6 },
            { offset: 0.85, transform: T(30, -21, -80), opacity: 0.45 },
            { offset: 1, transform: T(31, -18, -84), opacity: 0.35 },
          ]],
          ['.hs-armn', rotFrames([[0, 0], [0.4, -40], [1, 30]])],
          ...farTracks(info, [[0, 0], [0.4, -30], [1, 25]], [[0, 0], [0.4, -20], [1, 10]]),
          ['.hs-shadow', [{ offset: 0, opacity: 1, transform: 'scale(1)' }, { offset: 1, opacity: 0.4, transform: 'scale(1.4, 1)' }]],
          ['.hs-glyph', [{ opacity: 0.75 }, { opacity: 0 }]],
          ['.hs-aura', [{ opacity: 1 }, { opacity: 0 }]],
          ['.hs-fx', [{ opacity: 1 }, { opacity: 0 }]],
        ],
      };
    case 'victory': {
      const parts: [string, Frames][] = [
        ['.hs-fig', [{ offset: 0, transform: T(0, 0) }, { offset: 0.25, transform: T(0, -24) }, { offset: 0.45, transform: T(0, 0, 0, 1) }, { offset: 0.5, transform: 'translate(0px, 0px) scale(1.04, .95)' }, { offset: 0.68, transform: T(0, -11) }, { offset: 0.86, transform: T(0, 0) }, { offset: 1, transform: T(0, 0) }]],
        ['.hs-head', rotFrames([[0, 0], [0.25, -7], [0.5, 4], [1, 0]])],
        ['.hs-shadow', [{ offset: 0, transform: 'scale(1)' }, { offset: 0.25, transform: 'scale(.7)' }, { offset: 0.45, transform: 'scale(1)' }, { offset: 0.68, transform: 'scale(.85)' }, { offset: 0.86, transform: 'scale(1)' }, { offset: 1, transform: 'scale(1)' }]],
        ['.hs-glow', [{ offset: 0, opacity: 0 }, { offset: 0.3, opacity: 0.5 }, { offset: 1, opacity: 0 }]],
      ];
      if (pose === 'staff' || pose === 'bow') {
        const lift: Frames = [{ offset: 0, transform: T(0, 0) }, { offset: 0.2, transform: T(2, -10, -10) }, { offset: 0.85, transform: T(2, -10, -10) }, { offset: 1, transform: T(0, 0) }];
        parts.push(['.hs-armf', lift], ['.hs-off', lift], ['.hs-armn', rotFrames([[0, 0], [0.2, -45], [0.85, -45], [1, 0]])]);
      } else {
        const r = pose === 'shoulder' ? raiseNear(info, 40, -5) : pose === 'hold' ? { arm: -20, weapon: 0 } : pose === 'guard' ? raiseNear(info, -35, 40) : raiseNear(info, -48, 25);
        parts.push(
          ['.hs-armn', rotFrames([[0, 0], [0.2, r.arm], [0.6, r.arm + 6], [0.85, r.arm], [1, 0]])],
          ['.hs-armn .hs-weapon', rotFrames([[0, 0], [0.2, r.weapon], [0.85, r.weapon], [1, 0]])],
          ...farTracks(info, [[0, 0], [0.2, -70], [0.6, -60], [0.85, -70], [1, 0]], [[0, 0], [0.2, -25], [0.85, -25], [1, 0]]),
        );
      }
      return { parts };
    }
  }
}

/**
 * Plays `anim` on a sprite built by heroSprite(). Interrupts whatever was playing (resolving its promise).
 * One-shots resolve when done and fall back to idle; 'die' holds the final pose.
 */
export function playSpriteAnim(el: HTMLElement, anim: SpriteAnim): Promise<void> {
  const st = stateOf(el);
  st.token++;
  if (st.timer) clearTimeout(st.timer);
  st.timer = undefined;
  for (const a of st.anims) a.cancel();
  st.anims = [];
  const prev = st.resolve;
  st.resolve = undefined;
  prev?.();

  el.dataset.anim = anim;
  if (anim === 'idle') return Promise.resolve();

  const reduced = reducedMotion();
  const dur = Math.round(ANIM_MS[anim] * (reduced ? 0.6 : 1));
  const info: SpriteInfo = {
    style: (el.dataset.attack as AttackStyle | undefined) ?? 'melee',
    pose: el.dataset.pose ?? '',
    wAngle: Number(el.dataset.wangle ?? 0) || 0,
    wFlip: el.dataset.wflip === '1',
  };
  const pl = plan(anim, info);
  const fill: FillMode = anim === 'die' ? 'forwards' : 'none';
  const opts: KeyframeAnimationOptions = { duration: dur, fill, easing: pl.easing ?? 'ease-in-out' };

  const canAnimate = typeof (el as { animate?: unknown }).animate === 'function';
  if (canAnimate) {
    for (const [sel, frames] of pl.parts) {
      el.querySelectorAll<SVGElement>(sel).forEach((node) => {
        if (typeof node.animate === 'function') st.anims.push(node.animate(frames, opts));
      });
    }
    const svg = el.querySelector<SVGSVGElement>('svg');
    if (pl.svg && svg && typeof svg.animate === 'function') st.anims.push(svg.animate(pl.svg, { duration: dur, easing: 'ease-out' }));
  }

  const token = st.token;
  return new Promise<void>((resolve) => {
    st.resolve = resolve;
    const done = () => {
      if (st.token !== token) return;
      if (st.timer) clearTimeout(st.timer);
      st.timer = undefined;
      st.resolve = undefined;
      if (anim !== 'die') {
        for (const a of st.anims) a.cancel();
        st.anims = [];
        el.dataset.anim = 'idle';
      }
      resolve();
    };
    // Timer is the source of truth (animations can be throttled in hidden tabs); finished settles early when possible.
    st.timer = setTimeout(done, dur + 30);
    if (st.anims.length) {
      Promise.all(st.anims.map((a) => a.finished)).then(done, () => undefined);
    }
  });
}
