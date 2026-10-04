// Pure choreography planning for the side-view battle (no DOM): who dashes, who shoots, what a skill
// looks like (single blow / sweeping wave / support), and which painted backdrop a fight uses.
import { isBossStage, STAGES_PER_CHAPTER } from '../../core/campaign';
import type { BattleEvent, HeroClass, StatKey, StatusKind, UnitRef } from '../../core/types';
import type { SceneKind } from '../../art/types';
import { plainText } from '../format';
import { isTurnBoundary } from './timing';

/** How a hero delivers a basic attack: run in and strike, or stay back and fire a projectile. */
export type StrikeStyle = 'melee' | 'arrow' | 'bolt';

export function strikeStyle(heroClass: HeroClass | undefined, spriteAttack?: string): StrikeStyle {
  switch (heroClass) {
    case 'warrior':
    case 'assassin':
      return 'melee';
    case 'ranger':
      return 'arrow';
    case 'mage':
    case 'priest':
      return 'bolt';
  }
  // Unknown hero (test fixture): fall back to what the sprite says about itself.
  return spriteAttack === 'shoot' ? 'arrow' : spriteAttack === 'magic' ? 'bolt' : 'melee';
}

export function sameRef(a: UnitRef | null | undefined, b: UnitRef | null | undefined): boolean {
  return !!a && !!b && a.side === b.side && a.pos === b.pos;
}

/** The events that belong to the turn opened by `events[index]` (exclusive), up to the next turn boundary. */
export function turnSlice(events: readonly BattleEvent[], index: number): BattleEvent[] {
  const out: BattleEvent[] = [];
  for (let i = index + 1; i < events.length; i++) {
    const ev = events[i];
    if (isTurnBoundary(ev)) break;
    out.push(ev);
  }
  return out;
}

export type SkillShape =
  /** One enemy takes a big blow. */
  | 'single'
  /** Several enemies: a sweeping wave. */
  | 'multi'
  /** No enemy is damaged: heals, buffs, cleanses, controls only. */
  | 'support';

export interface SkillPlan {
  shape: SkillShape;
  /** Enemies the skill damages or that dodge it, in hit order, without duplicates. */
  hits: UnitRef[];
  /** Units on the caster's side that are healed or buffed. */
  support: UnitRef[];
  /** Enemies that only receive statuses / debuffs. */
  afflicted: UnitRef[];
}

function pushUnique(list: UnitRef[], ref: UnitRef): void {
  if (!list.some((r) => sameRef(r, ref))) list.push(ref);
}

/**
 * Looks ahead from a skill `action` event and summarises what the skill does, so the cast can be staged
 * before its numbers arrive. Stops at the caster's own passives (their hits are not part of the skill).
 */
export function planSkill(events: readonly BattleEvent[], index: number): SkillPlan {
  const action = events[index];
  const actor = action && action.t === 'action' ? action.actor : null;
  const plan: SkillPlan = { shape: 'support', hits: [], support: [], afflicted: [] };
  if (!actor) return plan;
  for (const ev of turnSlice(events, index)) {
    if (ev.t === 'passive') break;
    if (ev.t === 'damage' && ev.kind === 'skill' && sameRef(ev.source, actor)) pushUnique(plan.hits, ev.target);
    else if (ev.t === 'dodge' && sameRef(ev.source, actor)) pushUnique(plan.hits, ev.target);
    else if (ev.t === 'heal' && sameRef(ev.source, actor)) pushUnique(plan.support, ev.target);
    else if ((ev.t === 'buff' || ev.t === 'status') && ev.target.side === actor.side && (ev.t === 'status' ? ev.on : true)) pushUnique(plan.support, ev.target);
    else if ((ev.t === 'buff' || (ev.t === 'status' && ev.on)) && ev.target.side !== actor.side) pushUnique(plan.afflicted, ev.target);
  }
  // A curse without damage (stun, debuff) is still aimed at the enemies it lands on.
  const aimed = plan.hits.length > 0 ? plan.hits : plan.afflicted;
  plan.shape = aimed.length === 0 ? 'support' : aimed.length === 1 ? 'single' : 'multi';
  if (plan.hits.length === 0) plan.hits = [...aimed];
  return plan;
}

const CHAPTER_SCENES: readonly SceneKind[] = ['cave', 'forest', 'ruins', 'volcano'];

/**
 * Backdrop for a fight: the tower has its own hall; campaign chapters cycle cave, forest, ruins, volcano,
 * and every chapter's boss stage (x-10) is fought in the volcano or the void (never the chapter's own scene).
 */
export function sceneForBattle(title: string, level: number): SceneKind {
  if (/^\s*kule/i.test(title)) return 'tower';
  const stage = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  const chapter = Math.ceil(stage / STAGES_PER_CHAPTER);
  const own = CHAPTER_SCENES[(chapter - 1) % CHAPTER_SCENES.length];
  if (!isBossStage(stage)) return own;
  const boss: SceneKind = chapter % 2 === 1 ? 'void' : 'volcano';
  return boss === own ? 'void' : boss;
}

/** The damage-over-time status a tick most likely came from (first one the unit carries). */
export function dotStatusOf(statuses: Iterable<StatusKind>): 'burn' | 'poison' | 'bleed' | null {
  for (const s of statuses) if (s === 'burn' || s === 'poison' || s === 'bleed') return s;
  return null;
}

/** Strips arrows / pictographs from labels coming from call sites (buttons draw their own icons). */
export function plainLabel(text: string): string {
  return plainText(text);
}

/** Short stat tags for buff / debuff pop-ups ("Saldırı" with an up arrow), so team-wide buffs stay readable. */
export const STAT_TAG: Record<StatKey, string> = {
  hp: 'Can',
  atk: 'Saldırı',
  armor: 'Zırh',
  spd: 'Hız',
  crit: 'Kritik',
  critDmg: 'Kritik Hasar',
  hit: 'İsabet',
  dodge: 'Kaçınma',
  skillDmg: 'Yetenek',
  dmgReduce: 'Direnç',
  controlImmune: 'Bağışıklık',
  armorBreak: 'Zırh Delme',
};
