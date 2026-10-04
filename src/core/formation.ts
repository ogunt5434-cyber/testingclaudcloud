// Formation helpers shared by the game store, save validation and the balance simulation.
import { TEAM_SIZE } from './constants';
import { getHeroDef } from '../data/heroes';
import { heroPower, heroStats } from './stats';
import type { HeroInstance } from './types';

const FRONT_SLOTS = 2;

/** Heroes sorted by power desc (ties: more stars, higher level, roster order). */
export function sortByPower(heroes: readonly HeroInstance[]): HeroInstance[] {
  const power = new Map(heroes.map((h) => [h.uid, heroPower(h)]));
  return heroes
    .slice()
    .sort((a, b) => power.get(b.uid)! - power.get(a.uid)! || b.stars - a.stars || b.level - a.level);
}

function isWarrior(hero: HeroInstance): boolean {
  return getHeroDef(hero.heroId).heroClass === 'warrior';
}

/**
 * Share of its power a warrior beyond the two strongest ones counts with when the auto formation picks
 * the team. Power favours warriors (hp and armor weigh heavily), but only 2 front slots exist: an extra
 * warrior fights from the back row with a warrior's low attack. Measured with the real engine, a team
 * that swaps such a third warrior for the next-strongest non-warrior wins about 65-80% of head-to-heads.
 */
export const EXTRA_WARRIOR_WEIGHT = 0.8;

/**
 * The 6 heroes the auto formation fields: the strongest by power, except that warriors beyond the two
 * strongest count with EXTRA_WARRIOR_WEIGHT of their power. Ties keep the sortByPower order.
 */
export function autoFormationTeam(heroes: readonly HeroInstance[]): HeroInstance[] {
  const sorted = sortByPower(heroes);
  const power = new Map(sorted.map((h) => [h.uid, heroPower(h)]));
  const frontWarriors = new Set(sorted.filter(isWarrior).slice(0, FRONT_SLOTS));
  const weight = (h: HeroInstance) => (isWarrior(h) && !frontWarriors.has(h) ? EXTRA_WARRIOR_WEIGHT : 1);
  return sorted
    .map((h, i) => ({ h, i, value: power.get(h.uid)! * weight(h) }))
    .sort((a, b) => b.value - a.value || a.i - b.i)
    .slice(0, TEAM_SIZE)
    .map((x) => x.h);
}

/** The autoFormationTeam; warriors (then the highest-hp heroes) take the 2 front slots. */
export function autoFormationSlots(heroes: readonly HeroInstance[]): (string | null)[] {
  const team = autoFormationTeam(heroes);
  const hp = new Map(team.map((h) => [h.uid, heroStats(h).hp]));
  const frontFirst = team
    .slice()
    .sort((a, b) => Number(isWarrior(b)) - Number(isWarrior(a)) || hp.get(b.uid)! - hp.get(a.uid)!);
  const front = frontFirst.slice(0, FRONT_SLOTS);
  const back = team.filter((h) => !front.includes(h));
  const slots: (string | null)[] = [...front, ...back].map((h) => h.uid);
  while (slots.length < TEAM_SIZE) slots.push(null);
  return slots;
}

/** Returns a Turkish error message, or null when the slots are a valid formation for `heroes`. */
export function formationError(heroes: readonly HeroInstance[], slots: readonly (string | null)[]): string | null {
  if (!Array.isArray(slots) || slots.length !== TEAM_SIZE) return `Takım ${TEAM_SIZE} yuvadan oluşmalı.`;
  const uids = new Set(heroes.map((h) => h.uid));
  const used = new Set<string>();
  for (const slot of slots) {
    if (slot === null) continue;
    if (typeof slot !== 'string' || !uids.has(slot)) return 'Takımda bilinmeyen bir kahraman var.';
    if (used.has(slot)) return 'Bir kahraman takıma iki kez konamaz.';
    used.add(slot);
  }
  if (used.size === 0) return 'Takımda en az bir kahraman olmalı.';
  return null;
}
