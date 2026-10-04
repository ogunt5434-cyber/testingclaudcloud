// Persistence: new game, (de)serialization with validation/defaults, and storage access that never throws.
import { HEROIC_PITY, MAX_HEROES, MAX_STARS, TEAM_SIZE } from './constants';
import { autoFormationSlots } from './formation';
import { levelCap, PLAYER_MAX_LEVEL } from './progression';
import { createHero } from './summon';
import { EQUIP_SLOTS } from './types';
import { getEquipDef, isEquipId } from '../data/equipment';
import { isHeroId, STARTER_HERO_IDS } from '../data/heroes';
import type { EquipSlot, GameState, HeroInstance, Resources } from './types';

export const SAVE_KEY = 'diyar-kahramanlari-save';
export const SAVE_VERSION = 1;

export const DEFAULT_PLAYER_NAME = 'Kahraman';
export const PLAYER_NAME_MIN = 2;
export const PLAYER_NAME_MAX = 16;

export const STARTING_RESOURCES: Readonly<Resources> = {
  gold: 20000,
  spirit: 8000,
  gems: 900,
  basicScroll: 10,
  heroicScroll: 3,
};

/** Starter formation by hero id: front [batur, arslan], back [barutcu, cakmak, alevnur]. */
const STARTER_FORMATION: readonly (string | null)[] = ['batur', 'arslan', 'barutcu', 'cakmak', 'alevnur', null];

function emptyState(now: number): GameState {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSeen: now,
    player: { name: DEFAULT_PLAYER_NAME, level: 1, exp: 0 },
    resources: { ...STARTING_RESOURCES },
    heroes: [],
    equipment: {},
    formation: Array.from({ length: TEAM_SIZE }, () => null),
    campaign: { cleared: 0, idleSince: now },
    tower: { cleared: 0 },
    summon: { heroicPity: 0, totalPulls: 0 },
    nextUid: 1,
  };
}

/** Fresh account: starter heroes in formation, starter scrolls/gems. */
export function newGameState(now: number): GameState {
  const state = emptyState(now);
  const uidById = new Map<string, string>();
  for (const id of STARTER_HERO_IDS) uidById.set(id, createHero(state, id).uid);
  const layout = STARTER_FORMATION.map((id) => (id ? uidById.get(id) ?? null : null));
  // If the starter roster ever changes without updating the layout, fall back to the auto formation.
  const allPlaced = state.heroes.every((h) => layout.includes(h.uid));
  state.formation = allPlaced ? layout : autoFormationSlots(state.heroes);
  return state;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

// ---------------------------------------------------------------------------
// Validation helpers: coerce unknown JSON into well-formed values.
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Integer clamped to [min, max]; fallback when not a finite number. */
function int(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return Math.min(max, Math.max(min, Math.floor(num(v, fallback))));
}

function readEquipment(v: unknown): HeroInstance['equipment'] {
  const out: HeroInstance['equipment'] = {};
  if (!isObj(v)) return out;
  for (const slot of EQUIP_SLOTS) {
    const id = v[slot];
    if (typeof id === 'string' && isEquipId(id) && getEquipDef(id).slot === slot) out[slot as EquipSlot] = id;
  }
  return out;
}

function readHero(v: unknown): HeroInstance | null {
  if (!isObj(v) || typeof v.uid !== 'string' || v.uid === '') return null;
  if (typeof v.heroId !== 'string' || !isHeroId(v.heroId)) return null;
  const stars = int(v.stars, 1, 1, MAX_STARS);
  return {
    uid: v.uid,
    heroId: v.heroId,
    stars,
    level: int(v.level, 1, 1, levelCap(stars)),
    equipment: readEquipment(v.equipment),
    locked: v.locked === true,
  };
}

function readHeroes(v: unknown): HeroInstance[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const heroes: HeroInstance[] = [];
  for (const entry of v) {
    const hero = readHero(entry);
    if (!hero || seen.has(hero.uid) || heroes.length >= MAX_HEROES) continue;
    seen.add(hero.uid);
    heroes.push(hero);
  }
  return heroes;
}

/** Missing or invalid amounts become 0 (never the starting amounts, so deleting fields gains nothing). */
function readResources(v: unknown): Resources {
  const src = isObj(v) ? v : {};
  return {
    gold: int(src.gold, 0),
    spirit: int(src.spirit, 0),
    gems: int(src.gems, 0),
    basicScroll: int(src.basicScroll, 0),
    heroicScroll: int(src.heroicScroll, 0),
  };
}

function readStock(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [id, count] of Object.entries(v)) {
    const n = int(count, 0);
    if (isEquipId(id) && n > 0) out[id] = n;
  }
  return out;
}

/** Keeps known, non-duplicate uids; falls back to an automatic formation if nothing valid is left. */
function readFormation(v: unknown, heroes: HeroInstance[]): (string | null)[] {
  const uids = new Set(heroes.map((h) => h.uid));
  const used = new Set<string>();
  const slots: (string | null)[] = [];
  for (let i = 0; i < TEAM_SIZE; i++) {
    const uid = Array.isArray(v) ? v[i] : null;
    const valid = typeof uid === 'string' && uids.has(uid) && !used.has(uid);
    if (valid) used.add(uid);
    slots.push(valid ? uid : null);
  }
  return used.size > 0 ? slots : autoFormationSlots(heroes);
}

/** Smallest uid counter that cannot collide with existing "h<n>" uids. */
function safeNextUid(stored: unknown, heroes: HeroInstance[]): number {
  let next = int(stored, 1, 1);
  for (const h of heroes) {
    const m = /^h(\d+)$/.exec(h.uid);
    if (m) next = Math.max(next, Number(m[1]) + 1);
  }
  return next;
}

function readPlayer(v: unknown): GameState['player'] {
  const src = isObj(v) ? v : {};
  const rawName = typeof src.name === 'string' ? src.name.trim().slice(0, PLAYER_NAME_MAX) : '';
  return {
    name: rawName || DEFAULT_PLAYER_NAME,
    level: int(src.level, 1, 1, PLAYER_MAX_LEVEL),
    exp: int(src.exp, 0),
  };
}

/** Returns null if raw is missing/corrupt. Migrates older versions and fills missing fields. */
export function deserialize(raw: string | null, now: number = Date.now()): GameState | null {
  if (typeof raw !== 'string' || raw === '') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(data)) return null;
  const heroes = readHeroes(data.heroes);
  if (heroes.length === 0) return null; // unplayable without heroes: treat as corrupt
  const campaign = isObj(data.campaign) ? data.campaign : {};
  const tower = isObj(data.tower) ? data.tower : {};
  const summon = isObj(data.summon) ? data.summon : {};
  const createdAt = num(data.createdAt, now);
  return {
    version: SAVE_VERSION,
    createdAt,
    lastSeen: num(data.lastSeen, createdAt),
    player: readPlayer(data.player),
    resources: readResources(data.resources),
    heroes,
    equipment: readStock(data.equipment),
    formation: readFormation(data.formation, heroes),
    campaign: { cleared: int(campaign.cleared, 0), idleSince: num(campaign.idleSince, now) },
    tower: { cleared: int(tower.cleared, 0) },
    summon: {
      heroicPity: int(summon.heroicPity, 0, 0, HEROIC_PITY - 1),
      totalPulls: int(summon.totalPulls, 0),
    },
    nextUid: safeNextUid(data.nextUid, heroes),
  };
}

/** storage may be null/throwing (private mode) — never throw. */
export function loadGame(storage: Storage | null, now: number): GameState {
  let raw: string | null = null;
  try {
    raw = storage ? storage.getItem(SAVE_KEY) : null;
  } catch {
    raw = null;
  }
  return deserialize(raw, now) ?? newGameState(now);
}

export function saveGame(storage: Storage | null, state: GameState): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, serialize(state));
  } catch {
    // Storage full or unavailable (private mode): the game keeps running in memory.
  }
}

/** Removes the save; never throws. */
export function clearSave(storage: Storage | null): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
