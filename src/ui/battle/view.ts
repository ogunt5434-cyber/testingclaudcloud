// Side-view battle stage (1280x720 design px): painted backdrop, chibi hero sprites standing in two
// mirrored 2-4 formations, IH-style bar blocks over their heads, projectiles / slashes / skill effects,
// floating numbers and the round / title / control HUD. Driven event by event by modals/battle.ts.
import { factionIconName, heroPortrait, heroSprite, icon, playVfx, sceneBackground, setSpriteAnim } from '../../art';
import type { IconName, SceneKind, SpriteAnim, VfxKind } from '../../art/types';
import { FACTION_INFO, STATUS_INFO } from '../../core/constants';
import type { ControlStatus, DotStatus, Faction, HeroDef, Side, StatKey, StatusKind, UnitRef } from '../../core/types';
import { getHeroDef, isHeroId } from '../../data/heroes';
import { h, mount, prefersReducedMotion } from '../dom';
import { fmtNum } from '../format';
import type { Timers } from '../timers';
import { dotStatusOf, STAT_TAG, strikeStyle, type SkillPlan, type SkillShape, type StrikeStyle } from './choreo';
import {
  barLift,
  bodyPoint,
  centroid,
  depthOf,
  facingDir,
  launchPoint,
  slotPoint,
  SPRITE_FEET,
  SPRITE_H,
  SPRITE_W,
  strikePoint,
  type Point,
} from './layout';
import { refKey, type BattleModel, type UnitView } from './model';
import { DASH_BACK_MS, DASH_HOLD_MS, DASH_OUT_MS, ENTRANCE_MS, FLOAT_MS, IMPACT_SKILL_MS } from './timing';
import './battle.css';

type VfxOptions = NonNullable<Parameters<typeof playVfx>[4]>;

interface UnitNode {
  ref: UnitRef;
  key: string;
  heroId: string;
  dir: 1 | -1;
  home: Point;
  lift: number;
  def: HeroDef | null;
  faction: Faction;
  style: StrikeStyle;
  el: HTMLElement;
  body: HTMLElement;
  sprite: HTMLElement;
  bar: HTMLElement;
  hpFill: HTMLElement;
  hpLag: HTMLElement;
  enFill: HTMLElement;
  stRow: HTMLElement;
  statusSig: string;
  /** Two float lanes: numbers over the head, status / buff text over the body. */
  lanes: Record<'num' | 'text', { seq: number; at: number }>;
  dead: boolean;
}

interface TurnState {
  actor: UnitRef | null;
  kind: 'basic' | 'skill' | null;
  shape: SkillShape | null;
  /** A melee hero dashed in for this skill (its hits get slashes). */
  melee: boolean;
  shaken: boolean;
  /** Effects already shown this turn (one heal glow per target even if several heals land). */
  shown: Set<string>;
  /** The caster's skill-name ribbon (travels with a dashing caster). */
  ribbon: HTMLElement | null;
}

const emptyTurn = (): TurnState => ({ actor: null, kind: null, shape: null, melee: false, shaken: false, shown: new Set(), ribbon: null });

/** Horizontal offsets cycled through so stacked floating numbers fan out instead of covering each other. */
const FLOAT_DX = [0, -46, 42, -24, 56, -62, 22];

/** Number lane: this far above the top of the bar block (the bar, level and faction icon stay readable). */
const NUM_LANE_GAP = 26;
/** Height of the bar block (status row + HP / energy bars). */
const BAR_BLOCK_H = 30;

/** Stat icon shown on a buff / debuff chip. */
const STAT_ICON: Partial<Record<StatKey, IconName>> = {
  hp: 'hp',
  atk: 'atk',
  armor: 'def',
  spd: 'spd',
  crit: 'star',
  critDmg: 'star',
  hit: 'swords',
  dodge: 'spd',
  skillDmg: 'power',
  dmgReduce: 'def',
};

const CONTROL: readonly StatusKind[] = ['stun', 'freeze', 'petrify', 'silence'];

export type FloatKind = 'dmg' | 'skill' | 'crit' | 'heal' | 'dodge' | 'dot' | 'status' | 'chip' | 'passive';

interface BuffNote {
  unit: UnitNode;
  stat: StatKey;
  up: boolean;
}

export interface BattleViewOptions {
  scene: SceneKind;
  title: string;
  maxRounds: number;
  /** Tower fights show a tower glyph next to the title. */
  tower?: boolean;
}

/** Approximate projectile flight times of the art module's effects (ms at ×1, `big` is 1.3× slower). */
const FLIGHT_MS: Record<'arrow' | 'magic-bolt', number> = { arrow: 250, 'magic-bolt': 320 };

function isCssDriven(a: Animation): boolean {
  return 'animationName' in a || 'transitionProperty' in a;
}

function heroDefOf(heroId: string): HeroDef | null {
  return isHeroId(heroId) ? getHeroDef(heroId) : null;
}

export class BattleView {
  readonly el: HTMLElement;
  /** Top-right slot for the playback controls (speed, skip). */
  readonly controls: HTMLElement;
  private readonly world: HTMLElement;
  private readonly dimEl: HTMLElement;
  private readonly unitsEl: HTMLElement;
  private readonly barsEl: HTMLElement;
  private readonly vfxEl: HTMLElement;
  private readonly floatsEl: HTMLElement;
  private readonly calloutsEl: HTMLElement;
  private readonly bannersEl: HTMLElement;
  private readonly roundEl: HTMLElement;
  private readonly roundNum: HTMLElement;
  private readonly units = new Map<string, UnitNode>();
  /** Every Web Animation this view started (or adopted from sprites / VFX) -> its extra rate factor. */
  private readonly live = new Map<Animation, number>();
  private speed = 1;
  private readonly reduced = prefersReducedMotion();
  private turn: TurnState = emptyTurn();
  private dimDepth = 0;
  private destroyed = false;
  /** Buffs arriving in one burst (a team-wide skill) are shown together; see flushBuffs. */
  private buffBatch: BuffNote[] = [];
  private buffSeq = 0;

  constructor(
    private readonly model: BattleModel,
    private readonly timers: Timers,
    opts: BattleViewOptions,
  ) {
    const scene = h('div', { class: 'bt-scene' }, sceneBackground(opts.scene));
    this.dimEl = h('div', { class: 'bt-dim' });
    this.unitsEl = h('div', { class: 'bt-units' });
    this.barsEl = h('div', { class: 'bt-bars' });
    this.vfxEl = h('div', { class: 'bt-vfx' });
    this.floatsEl = h('div', { class: 'bt-floats' });
    this.calloutsEl = h('div', { class: 'bt-callouts' });
    this.world = h('div', { class: 'bt-world' }, scene, this.dimEl, this.unitsEl, this.barsEl, this.vfxEl, this.floatsEl, this.calloutsEl);

    this.roundNum = h('span', { class: 'bt-round-num' }, '1');
    this.roundEl = h(
      'div',
      { class: 'bt-round', attrs: { 'aria-live': 'polite' } },
      h('span', { class: 'bt-round-label' }, 'Tur'),
      h('span', { class: 'bt-round-val' }, this.roundNum, h('small', null, `/${opts.maxRounds}`)),
    );
    this.controls = h('div', { class: 'bt-controls' });
    this.bannersEl = h('div', { class: 'bt-banners', attrs: { 'aria-hidden': 'true' } });
    const title = h('div', { class: 'bt-title' }, h('span', { class: 'bt-title-ic' }, icon(opts.tower ? 'trophy' : 'swords', 26)), h('span', { class: 'bt-title-txt' }, opts.title));
    const hud = h('div', { class: 'bt-hud' }, title, this.roundEl, this.controls, this.bannersEl);

    this.el = h('div', { class: ['bt-root', `bt-scene--${opts.scene}`], style: { '--spd': '1' } }, this.world, hud);
    for (const unit of model.units.values()) this.addUnit(unit);
    this.syncAll();
  }

  // ------------------------------------------------------------------ setup

  private addUnit(unit: UnitView): void {
    const def = heroDefOf(unit.heroId);
    const faction: Faction = def?.faction ?? 'fortress';
    const dir = facingDir(unit.ref.side);
    const home = slotPoint(unit.ref);
    let sprite: HTMLElement;
    try {
      sprite = heroSprite(unit.heroId, { facing: dir === 1 ? 'right' : 'left' });
    } catch {
      sprite = h('div', { class: 'hs-sprite bt-missing' });
    }
    const lift = barLift(sprite.dataset.body);
    const body = h('div', { class: 'bt-body', style: { left: `${-SPRITE_W / 2}px`, top: `${-SPRITE_FEET}px`, width: `${SPRITE_W}px`, height: `${SPRITE_H}px` } }, sprite);
    const sideClass = unit.ref.side === 'attacker' ? 'ally' : 'enemy';
    const el = h(
      'div',
      {
        class: ['bt-unit', sideClass],
        style: { left: `${home.x}px`, top: `${home.y}px`, 'z-index': depthOf(home.y), '--fc': FACTION_INFO[faction].color },
        attrs: { 'data-key': unit.key, 'data-hero': unit.heroId, role: 'img', 'aria-label': `${def?.name ?? 'Kahraman'}, seviye ${unit.level}` },
      },
      h('div', { class: 'bt-ring' }),
      h('div', { class: 'bt-aura' }),
      body,
    );
    const hpLag = h('div', { class: 'bt-hp-lag' });
    const hpFill = h('div', { class: 'bt-hp-fill' });
    const enFill = h('div', { class: 'bt-en-fill' });
    const stRow = h('div', { class: 'bt-st' });
    const bar = h(
      'div',
      { class: ['bt-ubar', sideClass], style: { left: `${home.x}px`, top: `${home.y - lift}px`, 'z-index': depthOf(home.y) }, attrs: { 'aria-hidden': 'true' } },
      stRow,
      h(
        'div',
        { class: 'bt-ubar-row' },
        h('span', { class: 'bt-lv' }, String(unit.level)),
        h('span', { class: 'bt-fac' }, icon(factionIconName(faction), 22)),
        h('div', { class: 'bt-meters' }, h('div', { class: 'bt-hp' }, hpLag, hpFill, h('i', { class: 'bt-hp-shine' })), h('div', { class: 'bt-en' }, enFill)),
      ),
    );
    this.unitsEl.append(el);
    this.barsEl.append(bar);
    this.units.set(unit.key, {
      ref: { ...unit.ref },
      key: unit.key,
      heroId: unit.heroId,
      dir,
      home,
      lift,
      def,
      faction,
      style: strikeStyle(def?.heroClass, sprite.dataset.attack),
      el,
      body,
      sprite,
      bar,
      hpFill,
      hpLag,
      enFill,
      stRow,
      statusSig: '',
      lanes: { num: { seq: 0, at: -1e9 }, text: { seq: 0, at: -1e9 } },
      dead: !unit.alive,
    });
  }

  /** Both teams run in from the screen edges (after `lead` ms, e.g. while the screen wipe clears). */
  entrance(lead = 0): void {
    if (this.reduced) return;
    for (const u of this.units.values()) {
      const delay = lead + u.ref.pos * 55 + (u.ref.side === 'defender' ? 40 : 0);
      const frames: Keyframe[] = [
        { transform: `translate(${-u.dir * 360}px, 0)`, opacity: 0 },
        { transform: `translate(${-u.dir * 150}px, -14px)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${-u.dir * 40}px, 0)`, offset: 0.75 },
        { transform: 'translate(0, 0)', opacity: 1 },
      ];
      const ms = ENTRANCE_MS - 260;
      this.play(u.el, frames, ms, { delay, easing: 'cubic-bezier(.25,.7,.35,1)', fill: 'backwards' });
      this.play(u.bar, [{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], ms, { delay, fill: 'backwards' });
    }
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.el.style.setProperty('--spd', String(speed));
    for (const [a, factor] of this.live) {
      try {
        a.playbackRate = speed * factor;
      } catch {
        // finished/cancelled meanwhile
      }
    }
  }

  // ------------------------------------------------------------------ helpers

  private node(ref: UnitRef | null | undefined): UnitNode | undefined {
    return ref ? this.units.get(refKey(ref)) : undefined;
  }

  private later(ms: number, fn: () => void): void {
    this.timers.after(ms / this.speed, () => {
      if (!this.destroyed) fn();
    });
  }

  private track(a: Animation, factor = 1): void {
    try {
      a.playbackRate = this.speed * factor;
    } catch {
      return;
    }
    this.live.set(a, factor);
    const drop = (): void => {
      this.live.delete(a);
    };
    a.finished.then(drop, drop);
  }

  /** Web Animation at ×1 timing, sped up by the current playback speed. */
  private play(el: Element, frames: Keyframe[], ms: number, opts: KeyframeAnimationOptions = {}, factor = 1): Animation | null {
    if (this.destroyed || typeof (el as HTMLElement).animate !== 'function') return null;
    const a = (el as HTMLElement).animate(frames, { duration: ms, ...opts });
    this.track(a, factor);
    return a;
  }

  /** Speeds up script animations someone else (sprite rig, VFX) just started under `root`. */
  private adopt(root: Element, factor = 1): void {
    const list = typeof root.getAnimations === 'function' ? root.getAnimations({ subtree: true }) : [];
    for (const a of list) if (!isCssDriven(a) && !this.live.has(a)) this.track(a, factor);
  }

  private anim(u: UnitNode, name: SpriteAnim, factor = 1): void {
    if (this.destroyed || (u.dead && name !== 'die')) return;
    void setSpriteAnim(u.sprite, name).catch(() => undefined);
    this.adopt(u.sprite, factor);
  }

  private vfx(kind: VfxKind, from: Point, to: Point, opts: VfxOptions = {}): void {
    if (this.destroyed) return;
    const before = this.vfxEl.lastElementChild;
    try {
      void playVfx(this.vfxEl, kind, from, to, opts).catch(() => undefined);
    } catch {
      return;
    }
    for (let n = before ? before.nextElementSibling : this.vfxEl.firstElementChild; n; n = n.nextElementSibling) this.adopt(n);
  }

  /** Screen shake of the battlefield (not the HUD). */
  private shake(strength: number): void {
    if (this.reduced) return;
    const s = strength;
    this.play(
      this.world,
      [
        { transform: 'translate(0, 0)' },
        { transform: `translate(${-s}px, ${s * 0.7}px)` },
        { transform: `translate(${s * 0.9}px, ${-s * 0.5}px)` },
        { transform: `translate(${-s * 0.6}px, ${s * 0.3}px)` },
        { transform: `translate(${s * 0.3}px, 0)` },
        { transform: 'translate(0, 0)' },
      ],
      320,
      { easing: 'linear' },
    );
  }

  /** Brief full-field flash tinted by the caster's faction (big skill impact). */
  private flash(faction: Faction | undefined): void {
    if (this.reduced) return;
    const el = h('div', { class: 'bt-flash', style: { '--fc': FACTION_INFO[faction ?? 'light'].color } });
    this.calloutsEl.append(el);
    this.later(260, () => el.remove());
  }

  private dim(on: boolean): void {
    this.dimDepth = Math.max(0, this.dimDepth + (on ? 1 : -1));
    this.dimEl.classList.toggle('on', this.dimDepth > 0);
  }

  /**
   * Floating feedback in two lanes that never share space: numbers (and "Iska") pop in a lane above the bar
   * block and drift up and outward; control words and buff / debuff chips sit at mid-body.
   */
  private float(u: UnitNode, kind: FloatKind, text: string, extra?: { sub?: string; icon?: IconName; icon2?: IconName; up?: boolean }): void {
    const textLane = kind === 'status' || kind === 'chip';
    const lane = u.lanes[textLane ? 'text' : 'num'];
    const now = performance.now();
    // Floats arriving in a burst fan out and stack; a fresh beat starts again from the centre.
    if (now - lane.at > 650 / this.speed) lane.seq = 0;
    lane.at = now;
    const i = lane.seq++;
    const dx = FLOAT_DX[i % FLOAT_DX.length] * (textLane ? 0.7 : 1);
    const dy = -Math.min(3, i) * (textLane ? 26 : 30);
    const baseY = textLane ? u.home.y - Math.round(u.lift * 0.5) : u.home.y - u.lift - BAR_BLOCK_H - NUM_LANE_GAP;
    // drift away from the centre line (allies to the left, enemies to the right)
    const fx = -u.dir * (16 + (i % 3) * 10);
    const main =
      kind === 'chip'
        ? h('span', { class: 'bt-float-main' }, icon(extra?.up ? 'buff-up' : 'buff-down', 20), extra?.icon2 ? icon(extra.icon2, 20) : null)
        : h('span', { class: 'bt-float-main' }, extra?.icon ? icon(extra.icon, kind === 'status' ? 22 : 18) : null, text ? h('span', { class: 'bt-float-txt' }, text) : null);
    const el = h(
      'div',
      {
        class: ['bt-float', `bt-float--${kind}`, extra?.icon ? `is-${extra.icon}` : null, kind === 'chip' ? (extra?.up ? 'up' : 'down') : null],
        style: { left: `${u.home.x + dx}px`, top: `${baseY + dy}px`, '--fx': `${fx}px` },
      },
      extra?.sub ? h('span', { class: 'bt-float-sub' }, extra.sub) : null,
      main,
    );
    this.floatsEl.append(el);
    this.later(FLOAT_MS, () => el.remove());
  }

  // ------------------------------------------------------------------ state sync

  syncAll(): void {
    for (const unit of this.model.units.values()) this.sync(unit);
  }

  syncRef(ref: UnitRef): void {
    const unit = this.model.unit(ref);
    if (unit) this.sync(unit);
  }

  private sync(unit: UnitView): void {
    const u = this.units.get(unit.key);
    if (!u) return;
    const pct = unit.maxHp > 0 ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100)) : 0;
    const width = `${Math.round(pct * 10) / 10}%`;
    u.hpFill.style.width = width;
    u.hpLag.style.width = width;
    u.enFill.style.width = `${Math.max(0, Math.min(100, unit.energy))}%`;
    u.bar.classList.toggle('full', unit.alive && unit.energy >= 100);
    u.bar.classList.toggle('low', pct > 0 && pct < 30);
    u.bar.classList.toggle('dead', !unit.alive);
    u.el.classList.toggle('dead', !unit.alive);
    const statuses = [...unit.statuses.keys()];
    const up = unit.alive && unit.buffs.some((b) => b.amount > 0);
    const down = unit.alive && unit.buffs.some((b) => b.amount < 0);
    const sig = `${statuses.join(',')}|${up ? 1 : 0}${down ? 1 : 0}`;
    if (sig === u.statusSig) return;
    u.statusSig = sig;
    const chip = (name: IconName, title: string, cls = ''): HTMLElement => h('span', { class: ['bt-sti', cls], attrs: { title } }, icon(name, 18));
    mount(
      u.stRow,
      statuses.map((s) => chip(s, STATUS_INFO[s]?.name ?? s)),
      up ? chip('buff-up', 'Güçlendirme', 'up') : null,
      down ? chip('buff-down', 'Zayıflatma', 'down') : null,
    );
  }

  // ------------------------------------------------------------------ rounds & turns

  setRound(round: number): void {
    this.roundNum.textContent = String(round);
  }

  roundBanner(round: number, maxRounds: number): void {
    this.setRound(round);
    this.play(this.roundEl, [{ transform: 'translateX(-50%) scale(1)' }, { transform: 'translateX(-50%) scale(1.22)', offset: 0.3 }, { transform: 'translateX(-50%) scale(1)' }], 420);
    const last = round === maxRounds;
    const el = h(
      'div',
      { class: ['bt-roundbanner', last && 'last'] },
      h('span', { class: 'bt-rb-wing l' }),
      h('span', { class: 'bt-rb-plate' }, h('small', null, last ? 'Son Tur' : 'Tur'), h('b', null, String(round))),
      h('span', { class: 'bt-rb-wing r' }),
    );
    this.bannersEl.append(el);
    this.later(900, () => el.remove());
  }

  /** A new actor's turn: clears last turn's highlight. */
  beginTurn(actor: UnitRef | null): void {
    const prev = this.node(this.turn.actor);
    prev?.el.classList.remove('acting');
    this.turn = emptyTurn();
    this.turn.actor = actor;
    this.node(actor)?.el.classList.add('acting');
  }

  // ------------------------------------------------------------------ attacks

  /** Basic attack: melee dash-and-strike or a projectile, landing IMPACT_BASIC_MS later. */
  basicAttack(actor: UnitRef, target: UnitRef | undefined, impactMs: number): void {
    this.beginTurn(actor);
    this.turn.kind = 'basic';
    const a = this.node(actor);
    const t = this.node(target);
    if (!a) return;
    if (!t || t.ref.side === a.ref.side) {
      this.anim(a, 'attack');
      return;
    }
    if (a.style === 'melee') this.dashStrike(a, t, impactMs);
    else this.shoot(a, t, impactMs, false, true);
  }

  /** Runs to the target, strikes exactly at `impactMs`, holds a beat and runs back. */
  private dashStrike(a: UnitNode, t: UnitNode, impactMs: number): void {
    // Strike frame of the melee 'attack' rig is ~58% into its 450 ms.
    this.later(Math.max(0, impactMs - 262), () => this.anim(a, 'attack'));
    if (this.reduced) return;
    const stop = strikePoint(a.ref, t.ref);
    const dx = stop.x - a.home.x;
    const dy = stop.y - a.home.y;
    const arrive = Math.max(60, impactMs - 50);
    const leave = Math.max(0, arrive - DASH_OUT_MS);
    const back = impactMs + DASH_HOLD_MS;
    const total = back + DASH_BACK_MS;
    const at = (ms: number): number => Math.min(1, Math.max(0, ms / total));
    const frames: Keyframe[] = [
      { offset: 0, transform: 'translate(0, 0)' },
      { offset: at(leave), transform: 'translate(0, 0)', easing: 'cubic-bezier(.45,0,.75,.6)' },
      { offset: at((leave + arrive) / 2), transform: `translate(${dx / 2}px, ${dy / 2 - 22}px)`, easing: 'cubic-bezier(.25,.4,.55,1)' },
      { offset: at(arrive), transform: `translate(${dx}px, ${dy}px)` },
      { offset: at(back), transform: `translate(${dx}px, ${dy}px)`, easing: 'cubic-bezier(.4,0,.5,1)' },
      { offset: at(back + DASH_BACK_MS / 2), transform: `translate(${dx / 2}px, ${dy / 2 - 12}px)` },
      { offset: 1, transform: 'translate(0, 0)' },
    ];
    for (const el of [a.el, a.bar]) this.play(el, frames, total);
    // In front of the target while next to it.
    this.later(leave, () => {
      a.el.style.zIndex = String(depthOf(stop.y) + 2);
      a.bar.style.zIndex = String(depthOf(stop.y) + 2);
    });
    this.later(total, () => {
      a.el.style.zIndex = String(depthOf(a.home.y));
      a.bar.style.zIndex = String(depthOf(a.home.y));
    });
  }

  /** Ranged attack in place: draw / thrust, then a projectile that arrives at `impactMs`. */
  private shoot(a: UnitNode, t: UnitNode, impactMs: number, big: boolean, animate: boolean): void {
    if (animate) this.anim(a, 'attack', 1.6);
    const kind = a.style === 'arrow' ? 'arrow' : 'magic-bolt';
    const flight = FLIGHT_MS[kind] * (big ? 1.3 : 1);
    this.later(Math.max(0, impactMs - flight), () => this.vfx(kind, launchPoint(a.ref), bodyPoint(t.ref), { faction: a.faction, big }));
  }

  /** Active skill: cast pose, name ribbon, dimmed backdrop, then the big effect lands at IMPACT_SKILL_MS. */
  castSkill(actor: UnitRef, skillName: string, plan: SkillPlan): void {
    this.beginTurn(actor);
    this.turn.kind = 'skill';
    this.turn.shape = plan.shape;
    const a = this.node(actor);
    if (!a) return;
    this.turn.ribbon = this.skillRibbon(a, skillName);
    this.dim(true);
    this.later(IMPACT_SKILL_MS + 520, () => this.dim(false));
    a.el.classList.add('casting');
    this.later(IMPACT_SKILL_MS + 420, () => a.el.classList.remove('casting'));
    this.anim(a, 'cast');
    const targets = plan.hits.map((r) => this.node(r)).filter((n): n is UnitNode => !!n && n.ref.side !== a.ref.side);
    if (plan.shape === 'support' || targets.length === 0) return;

    if (plan.shape === 'single') {
      if (a.style === 'melee') {
        this.turn.melee = true;
        this.dashStrike(a, targets[0], IMPACT_SKILL_MS);
      } else {
        this.shoot(a, targets[0], IMPACT_SKILL_MS, true, false);
      }
      return;
    }
    // Several enemies.
    if (a.style === 'arrow') {
      targets.forEach((t, i) => this.later(Math.max(0, IMPACT_SKILL_MS - FLIGHT_MS.arrow - 40 + i * 25), () => this.vfx('arrow', launchPoint(a.ref), bodyPoint(t.ref), { faction: a.faction })));
      this.later(IMPACT_SKILL_MS - 300, () => this.anim(a, 'attack', 1.6));
      return;
    }
    if (a.style === 'melee') this.later(Math.max(0, IMPACT_SKILL_MS - 262), () => this.anim(a, 'attack'));
    const aim = centroid(targets.map((t) => t.ref));
    // The wave's flash reaches its aim point ~290 ms after launch (big effects run 1.3× longer).
    this.later(IMPACT_SKILL_MS - 300, () => this.vfx('aoe-wave', bodyPoint(a.ref), aim, { faction: a.faction, big: true }));
  }

  /**
   * Skill-name ribbon with the caster's portrait, in a fixed lane under the top HUD over the caster's half
   * of the field (it never covers a health bar or a number). Returns its pin (team lines hang under it).
   */
  private skillRibbon(u: UnitNode, name: string): HTMLElement {
    const ally = u.ref.side === 'attacker';
    let face: HTMLElement | null = null;
    try {
      face = heroPortrait(u.heroId, { size: 52 });
    } catch {
      face = null;
    }
    const pin = h(
      'div',
      { class: 'bt-skill-pin', style: { left: `${ally ? 330 : 950}px`, top: '150px' } },
      h(
        'div',
        { class: ['bt-skill', ally ? 'ally' : 'enemy'], style: { '--fc': FACTION_INFO[u.faction].color } },
        face ? h('span', { class: 'bt-skill-face' }, face) : null,
        h('span', { class: 'bt-skill-end l' }),
        h('span', { class: 'bt-skill-txt' }, name),
        h('span', { class: 'bt-skill-end r' }),
      ),
    );
    this.calloutsEl.append(pin);
    this.later(IMPACT_SKILL_MS + 560, () => pin.remove());
    return pin;
  }

  // ------------------------------------------------------------------ outcomes

  /** A hit lands (attack, skill, passive or DoT tick). */
  damage(target: UnitRef, source: UnitRef | null, amount: number, crit: boolean, kind: 'basic' | 'skill' | 'dot' | 'passive'): void {
    this.syncRef(target);
    const t = this.node(target);
    if (!t) return;
    const at = bodyPoint(t.ref);
    if (kind === 'dot') {
      const status = dotStatusOf(this.model.unit(target)?.statuses.keys() ?? []) ?? 'burn';
      this.vfx('dot', at, at, { status });
      this.float(t, 'dot', `-${fmtNum(amount)}`, { icon: status });
      t.el.dataset.dot = status;
      this.later(260, () => delete t.el.dataset.dot);
      return;
    }
    const src = this.node(source);
    if (kind === 'basic' && src?.style === 'melee') this.vfx('slash', at, at, { faction: src.faction, big: crit });
    if (kind === 'skill' && src) {
      // The first blow on a target is the big one; follow-up hits of the same skill stay lighter.
      const first = this.once(`sk:${t.key}`);
      if (this.turn.shape === 'single' && this.turn.melee) {
        this.vfx('slash', at, at, { faction: src.faction, big: first });
        if (first) this.vfx('explosion', at, at, { faction: src.faction });
      } else if (this.turn.shape === 'single') {
        this.vfx('explosion', at, at, { faction: src.faction, big: first });
      } else if (first) {
        this.vfx('explosion', at, at, { faction: src.faction });
      } else {
        this.vfx('slash', at, at, { faction: src.faction });
      }
    }
    this.anim(t, 'hit');
    this.knockback(t, kind === 'skill' || crit ? 16 : 10);
    if (kind === 'skill' && !this.turn.shaken) {
      this.turn.shaken = true;
      this.shake(this.turn.shape === 'multi' ? 9 : 7);
      this.flash(src?.faction);
    } else if (crit) {
      this.shake(5);
    }
    if (crit) this.float(t, 'crit', `-${fmtNum(amount)}`, { sub: 'Kritik!' });
    else this.float(t, kind === 'skill' ? 'skill' : 'dmg', `-${fmtNum(amount)}`);
  }

  private knockback(u: UnitNode, px: number): void {
    if (this.reduced || u.dead) return;
    const away = u.dir === 1 ? -px : px;
    this.play(u.body, [{ transform: 'translate(0, 0)' }, { transform: `translate(${away}px, 0)`, offset: 0.25 }, { transform: 'translate(0, 0)' }], 300, { easing: 'ease-out' });
  }

  dodge(target: UnitRef): void {
    const t = this.node(target);
    if (!t) return;
    this.float(t, 'dodge', 'Iska');
    if (this.reduced) return;
    const away = t.dir === 1 ? -34 : 34;
    this.play(
      t.body,
      [
        { transform: 'translate(0, 0)', opacity: 1 },
        { transform: `translate(${away}px, -10px)`, opacity: 0.55, offset: 0.35 },
        { transform: `translate(${away * 0.8}px, 0)`, opacity: 0.8, offset: 0.6 },
        { transform: 'translate(0, 0)', opacity: 1 },
      ],
      380,
      { easing: 'ease-out' },
    );
  }

  heal(target: UnitRef, amount: number): void {
    this.syncRef(target);
    const t = this.node(target);
    if (!t) return;
    if (this.once(`heal:${t.key}`)) this.vfx('heal', bodyPoint(t.ref), bodyPoint(t.ref));
    // A heal on a full-health hero still glows, but "+0" would only be noise.
    if (amount > 0) this.float(t, 'heal', `+${fmtNum(amount)}`);
  }

  status(target: UnitRef, status: StatusKind, on: boolean): void {
    this.syncRef(target);
    const t = this.node(target);
    if (!t || !on) return;
    const at = bodyPoint(t.ref);
    const control = CONTROL.includes(status);
    if (this.once(`st:${t.key}:${status}`)) this.vfx(control ? 'control' : 'dot', at, at, { status: status as ControlStatus | DotStatus });
    // Words only for control effects; a damage-over-time status is a small icon (its ticks show numbers).
    if (control) this.float(t, 'status', STATUS_INFO[status]?.name ?? status, { icon: status });
    else this.float(t, 'status', '', { icon: status });
  }

  buff(target: UnitRef, stat: StatKey, amount: number): void {
    this.syncRef(target);
    const t = this.node(target);
    if (!t) return;
    const up = amount >= 0;
    if (this.once(`bf:${t.key}:${up ? 1 : 0}`)) this.vfx(up ? 'buff' : 'debuff', bodyPoint(t.ref), bodyPoint(t.ref));
    this.buffBatch.push({ unit: t, stat, up });
    // Buff events of one skill arrive ~30 ms apart: wait for the burst to end, then show it once.
    const seq = ++this.buffSeq;
    this.later(70, () => {
      if (seq === this.buffSeq) this.flushBuffs();
    });
  }

  /** A burst hitting 3+ heroes of one side reads as one team line under the skill ribbon; else icon chips. */
  private flushBuffs(): void {
    const batch = this.buffBatch;
    this.buffBatch = [];
    const groups = new Map<string, BuffNote[]>();
    for (const b of batch) {
      const key = `${b.unit.ref.side}|${b.stat}|${b.up ? 1 : 0}`;
      const list = groups.get(key) ?? [];
      if (!list.some((x) => x.unit === b.unit)) list.push(b);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      const { stat, up } = list[0];
      if (list.length >= 3) {
        this.teamLine(list.map((b) => b.unit), stat, up);
        continue;
      }
      for (const b of list) this.float(b.unit, 'chip', '', { up, icon2: STAT_ICON[stat] ?? 'power' });
    }
  }

  /** One line for a team-wide buff / debuff: under the caster's skill ribbon, or over the affected team. */
  private teamLine(units: readonly UnitNode[], stat: StatKey, up: boolean): void {
    const sideName = units[0].ref.side === 'attacker' ? 'ally' : 'enemy';
    const line = h(
      'div',
      { class: ['bt-teamline', up ? 'up' : 'down', sideName] },
      icon(up ? 'buff-up' : 'buff-down', 18),
      h('span', null, `Takım: ${STAT_TAG[stat] ?? stat} ${up ? '+' : '−'}`),
    );
    const ribbon = this.turn.ribbon;
    if (ribbon?.isConnected) {
      ribbon.append(line);
    } else {
      const x = units.reduce((sum, u) => sum + u.home.x, 0) / units.length;
      const y = Math.min(...units.map((u) => u.home.y - u.lift - BAR_BLOCK_H)) - 12;
      const pin = h('div', { class: 'bt-skill-pin', style: { left: `${Math.max(150, Math.min(1130, x))}px`, top: `${Math.max(120, y)}px` } }, line);
      this.calloutsEl.append(pin);
      this.later(1100, () => pin.remove());
    }
  }

  passive(actor: UnitRef, name: string): void {
    const u = this.node(actor);
    if (!u) return;
    const x = Math.max(110, Math.min(1170, u.home.x));
    // In the number lane just above the bar block; numbers that follow stack above it.
    const lane = u.lanes.num;
    const now = performance.now();
    if (now - lane.at > 650 / this.speed) lane.seq = 0;
    lane.at = now;
    lane.seq = Math.max(lane.seq, 1);
    const el = h(
      'div',
      { class: ['bt-passive', u.ref.side === 'attacker' ? 'ally' : 'enemy'], style: { left: `${x}px`, top: `${u.home.y - u.lift - BAR_BLOCK_H - 6}px` } },
      icon('star', 18),
      h('span', null, name),
    );
    this.calloutsEl.append(el);
    this.later(1000, () => el.remove());
    u.el.classList.add('proc');
    this.later(520, () => u.el.classList.remove('proc'));
  }

  skipTurn(actor: UnitRef, reason: ControlStatus): void {
    this.beginTurn(actor);
    const u = this.node(actor);
    if (!u) return;
    this.float(u, 'status', 'Hareket edemiyor', { icon: reason });
    if (this.reduced) return;
    this.play(u.body, [0, -5, 5, -4, 4, -2, 0].map((x) => ({ transform: `translate(${x}px, 0)` })), 420, { easing: 'linear' });
  }

  die(target: UnitRef): void {
    this.syncRef(target);
    const u = this.node(target);
    if (!u || u.dead) return;
    this.anim(u, 'die');
    u.dead = true;
    u.el.classList.remove('acting', 'casting');
    this.vfx('death', bodyPoint(u.ref), bodyPoint(u.ref));
  }

  /** Survivors of the winning side cheer. */
  victory(winner: Side): void {
    this.beginTurn(null);
    let i = 0;
    for (const u of this.units.values()) {
      if (u.ref.side !== winner || u.dead) continue;
      const delay = (i++ % 6) * 70;
      this.later(delay, () => this.anim(u, 'victory'));
      this.later(delay + 950, () => this.anim(u, 'victory'));
    }
  }

  /** Remembers a per-turn effect key; true the first time. */
  private once(key: string): boolean {
    if (this.turn.shown.has(key)) return false;
    this.turn.shown.add(key);
    return true;
  }

  // ------------------------------------------------------------------ skip & teardown

  /** Drops every effect in flight (the caller already cleared the timers that would end them). */
  private clearTransient(): void {
    for (const a of [...this.live.keys()]) {
      try {
        a.cancel();
      } catch {
        // already gone
      }
    }
    this.live.clear();
    this.vfxEl.replaceChildren();
    this.floatsEl.replaceChildren();
    this.calloutsEl.replaceChildren();
    this.bannersEl.replaceChildren();
    this.buffBatch = [];
    this.buffSeq++;
    this.dimDepth = 0;
    this.dimEl.classList.remove('on');
    this.turn = emptyTurn();
    for (const u of this.units.values()) {
      u.el.classList.remove('acting', 'casting', 'proc');
      u.el.style.zIndex = String(depthOf(u.home.y));
      u.bar.style.zIndex = String(depthOf(u.home.y));
      delete u.el.dataset.dot;
    }
  }

  /** "Atla": shows the model's (final) state at once: bars, statuses, fallen heroes lying down. */
  settle(): void {
    this.clearTransient();
    this.el.classList.add('bt-instant');
    this.syncAll();
    for (const u of this.units.values()) {
      const alive = !!this.model.unit(u.ref)?.alive;
      u.dead = !alive;
      void setSpriteAnim(u.sprite, alive ? 'idle' : 'die').catch(() => undefined);
      if (!alive && typeof u.sprite.getAnimations === 'function') {
        for (const a of u.sprite.getAnimations({ subtree: true })) if (!isCssDriven(a)) a.finish();
      }
    }
    void this.el.offsetWidth;
    this.el.classList.remove('bt-instant');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clearTransient();
    this.destroyed = true;
  }
}
