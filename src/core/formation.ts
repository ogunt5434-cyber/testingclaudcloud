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

/** The 6 strongest heroes; warriors (then the highest-hp heroes) take the 2 front slots. */
export function autoFormationSlots(heroes: readonly HeroInstance[]): (string | null)[] {
  const team = sortByPower(heroes).slice(0, TEAM_SIZE);
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
