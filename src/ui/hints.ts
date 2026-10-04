// Pure cues for the UI (no DOM): star-up readiness markers, account level-up notices and the save banner.
import { IDLE_CAP_HOURS } from '../core/constants';
import { SAVE_PROBLEM_TEXT, type SaveProblem } from '../core/game';
import { findStarUpFodder, playerLevelGems, starUpRequirement } from '../core/progression';
import type { GameState, HeroInstance } from '../core/types';
import type { TabId } from './context';
import { RESOURCE_INFO, fmtNum } from './format';

/** Show the campaign badge once the idle chest has filled this long. */
export const IDLE_BADGE_MS = 60 * 60 * 1000;

/** Red notification dots for the hub buildings / navigation buttons. */
export function navBadges(state: Readonly<GameState>, now: number): Partial<Record<TabId, boolean>> {
  const idleMs = Math.min(IDLE_CAP_HOURS * 3_600_000, now - state.campaign.idleSince);
  let heroes = false;
  try {
    heroes = starUpReadyUids(state).size > 0;
  } catch {
    heroes = false;
  }
  return {
    campaign: idleMs >= IDLE_BADGE_MS,
    heroes,
    summon: state.resources.basicScroll > 0 || state.resources.heroicScroll > 0,
  };
}

/** True when the star-up action would succeed right now (level at cap and enough eligible copies). */
export function starUpReady(state: Readonly<GameState>, hero: HeroInstance): boolean {
  const req = starUpRequirement(hero);
  if (!req || hero.level < req.levelRequired) return false;
  return findStarUpFodder(state as GameState, hero.uid).length >= req.fodderCount;
}

/** Uids of every hero that can be starred up now (drives the card marker and the "Kahramanlar" tab dot). */
export function starUpReadyUids(state: Readonly<GameState>): Set<string> {
  return new Set(state.heroes.filter((hero) => starUpReady(state, hero)).map((hero) => hero.uid));
}

/** Gems granted for going from account level `from` to `to` (one playerLevelGems per level reached). */
export function levelUpGems(from: number, to: number): number {
  let gems = 0;
  for (let level = Math.floor(from) + 1; level <= Math.floor(to); level++) gems += playerLevelGems(level);
  return gems;
}

/** "Hesap seviyesi 3! +150 Yakut", or null when the level did not go up. */
export function levelUpText(from: number, to: number): string | null {
  if (!(to > from)) return null;
  const gems = levelUpGems(from, to);
  return `Hesap seviyesi ${to}!${gems > 0 ? ` +${fmtNum(gems)} ${RESOURCE_INFO.gems.name}` : ''}`;
}

/** The banner shown while progress is not being saved. */
export interface SaveNotice {
  problem: SaveProblem;
  text: string;
  /** 'reload': a stale tab must reload ("Sayfayı Yenile"); 'dismiss': a one-time warning ("Tamam"). */
  action: 'reload' | 'dismiss';
  label: string;
}

/**
 * Banner for the game's saveProblem, or null. A conflict (another tab saved newer progress) cannot be
 * dismissed because every action is blocked until the page reloads; 'unavailable' is shown until the
 * player dismisses it (`dismissed`).
 */
export function saveNotice(problem: SaveProblem | null, dismissed: boolean): SaveNotice | null {
  if (problem === 'conflict') return { problem, text: SAVE_PROBLEM_TEXT.conflict, action: 'reload', label: 'Sayfayı Yenile' };
  if (problem === 'unavailable' && !dismissed) return { problem, text: SAVE_PROBLEM_TEXT.unavailable, action: 'dismiss', label: 'Tamam' };
  return null;
}
