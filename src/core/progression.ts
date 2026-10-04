// Hero/player progression (SPEC §2, §5): leveling, star-ups, dismissing, equipment and player exp.
// All functions that take `state` MUTATE it in place. Actions validate everything first, so a failed
// action never leaves the state half-changed. Error strings are Turkish and shown to the player.
import { LEVEL_CAP, MAX_STARS, STAR_UP_FODDER } from './constants';
import { EQUIP_SLOTS } from './types';
import { getEquipDef, isEquipId } from '../data/equipment';
import { getHeroDef } from '../data/heroes';
import type { ActionResult, EquipSlot, GameState, HeroInstance, ResourceKey, Resources, Rewards } from './types';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Level-up cost = base * level^LEVEL_COST_EXP (level 1 -> 2 costs exactly the base). */
export const LEVEL_COST_EXP = 1.6;
export const LEVEL_GOLD_BASE = 100;
export const LEVEL_SPIRIT_BASE = 60;

/** Flat dismiss reward by star count (index = stars), on top of the refunded level costs. */
const DISMISS_BASE: readonly { gold: number; spirit: number }[] = [
  { gold: 0, spirit: 0 },
  { gold: 200, spirit: 100 },
  { gold: 500, spirit: 300 },
  { gold: 1500, spirit: 1000 },
  { gold: 5000, spirit: 3500 },
  { gold: 15000, spirit: 10000 },
];

export const PLAYER_MAX_LEVEL = 300;

export const RESOURCE_KEYS: readonly ResourceKey[] = ['gold', 'spirit', 'gems', 'basicScroll', 'heroicScroll'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const ok = <T>(value: T): ActionResult<T> => ({ ok: true, value });
const fail = <T = undefined>(error: string): ActionResult<T> => ({ ok: false, error });
const done: ActionResult = { ok: true, value: undefined };

const ERR_NO_HERO = 'Kahraman bulunamadı.';

export function findHero(state: GameState, uid: string): HeroInstance | undefined {
  return state.heroes.find((h) => h.uid === uid);
}

export function isInFormation(state: GameState, uid: string): boolean {
  return state.formation.includes(uid);
}

function heroName(hero: HeroInstance): string {
  return getHeroDef(hero.heroId).name;
}

function addStock(state: GameState, equipId: string, count = 1): void {
  state.equipment[equipId] = (state.equipment[equipId] ?? 0) + count;
}

function takeStock(state: GameState, equipId: string): void {
  const left = (state.equipment[equipId] ?? 0) - 1;
  if (left > 0) state.equipment[equipId] = left;
  else delete state.equipment[equipId];
}

/** Moves every equipped item of a hero back to stock. */
function stripGear(state: GameState, hero: HeroInstance): void {
  for (const id of Object.values(hero.equipment)) if (id) addStock(state, id);
  hero.equipment = {};
}

function removeHero(state: GameState, uid: string): void {
  state.heroes = state.heroes.filter((h) => h.uid !== uid);
  state.formation = state.formation.map((slot) => (slot === uid ? null : slot));
}

// ---------------------------------------------------------------------------
// Leveling
// ---------------------------------------------------------------------------

export function levelCap(stars: number): number {
  const s = Math.min(MAX_STARS, Math.max(1, Math.floor(stars) || 1));
  return LEVEL_CAP[s];
}

/** Cost to go from `level` to `level + 1`. */
export function levelUpCost(level: number): { gold: number; spirit: number } {
  const f = Math.pow(Math.max(1, Math.floor(level)), LEVEL_COST_EXP);
  return { gold: Math.round(LEVEL_GOLD_BASE * f), spirit: Math.round(LEVEL_SPIRIT_BASE * f) };
}

/** Total cost to go from `from` to `to`. */
export function levelRangeCost(from: number, to: number): { gold: number; spirit: number } {
  const total = { gold: 0, spirit: 0 };
  for (let level = Math.max(1, Math.floor(from)); level < to; level++) {
    const step = levelUpCost(level);
    total.gold += step.gold;
    total.spirit += step.spirit;
  }
  return total;
}

/** How many of `levels` can be bought now (affordable & below cap), and their total cost. */
export function affordableLevels(
  state: GameState,
  hero: HeroInstance,
  levels: number,
): { gained: number; cost: { gold: number; spirit: number } } {
  const cap = levelCap(hero.stars);
  const cost = { gold: 0, spirit: 0 };
  let gained = 0;
  while (gained < levels && hero.level + gained < cap) {
    const step = levelUpCost(hero.level + gained);
    if (cost.gold + step.gold > state.resources.gold || cost.spirit + step.spirit > state.resources.spirit) break;
    cost.gold += step.gold;
    cost.spirit += step.spirit;
    gained++;
  }
  return { gained, cost };
}

/** Levels up as many of `levels` as affordable & below cap. Error if 0 levels gained. */
export function levelUpHero(state: GameState, uid: string, levels: number): ActionResult<{ gained: number }> {
  const hero = findHero(state, uid);
  if (!hero) return fail(ERR_NO_HERO);
  if (!(levels >= 1)) return fail('Geçersiz seviye sayısı.');
  if (hero.level >= levelCap(hero.stars)) {
    return fail('Kahraman seviye sınırında. Daha fazla seviye için yıldız yükselt.');
  }
  const { gained, cost } = affordableLevels(state, hero, Math.floor(levels));
  if (gained === 0) return fail('Yeterli altın veya ruh özü yok.');
  spend(state, cost);
  hero.level += gained;
  return ok({ gained });
}

// ---------------------------------------------------------------------------
// Star up
// ---------------------------------------------------------------------------

/** null when already at MAX_STARS. */
export function starUpRequirement(hero: HeroInstance): { fodderCount: number; levelRequired: number } | null {
  if (hero.stars >= MAX_STARS) return null;
  return { fodderCount: STAR_UP_FODDER[hero.stars] ?? 1, levelRequired: levelCap(hero.stars) };
}

/** Valid fodder: same heroId, same stars, different uid, not locked, not in formation. Sorted lowest level first. */
export function findStarUpFodder(state: GameState, uid: string): string[] {
  const hero = findHero(state, uid);
  if (!hero) return [];
  return state.heroes
    .filter(
      (h) =>
        h.uid !== uid && h.heroId === hero.heroId && h.stars === hero.stars && !h.locked && !isInFormation(state, h.uid),
    )
    .sort((a, b) => a.level - b.level) // stable: keeps roster order for equal levels
    .map((h) => h.uid);
}

/** Picks the fodder to consume, or an error message. */
function chooseFodder(
  state: GameState,
  hero: HeroInstance,
  needed: number,
  requested: string[] | undefined,
): string[] | string {
  const valid = findStarUpFodder(state, hero.uid);
  if (!requested) {
    if (valid.length < needed) return `Yetersiz kopya: ${needed} adet ${hero.stars}★ ${heroName(hero)} gerekli.`;
    return valid.slice(0, needed);
  }
  const unique = new Set(requested);
  if (requested.length !== needed || unique.size !== needed || !requested.every((u) => valid.includes(u))) {
    return `Geçersiz seçim: ${needed} adet ${hero.stars}★ ${heroName(hero)} seçmelisin (kilitli veya takımdaki olamaz).`;
  }
  return requested;
}

/** Consumes fodder (auto-picked when omitted), refunds fodder level costs fully, unequips fodder gear to stock, stars+1. */
export function starUpHero(state: GameState, uid: string, fodderUids?: string[]): ActionResult {
  const hero = findHero(state, uid);
  if (!hero) return fail(ERR_NO_HERO);
  const req = starUpRequirement(hero);
  if (!req) return fail('Kahraman zaten en yüksek yıldızda.');
  if (hero.level < req.levelRequired) return fail(`Yıldız yükseltmek için seviye ${req.levelRequired} olmalı.`);
  const fodder = chooseFodder(state, hero, req.fodderCount, fodderUids);
  if (typeof fodder === 'string') return fail(fodder);

  for (const fodderUid of fodder) {
    const f = findHero(state, fodderUid)!;
    const refund = levelRangeCost(1, f.level);
    state.resources.gold += refund.gold;
    state.resources.spirit += refund.spirit;
    stripGear(state, f);
    removeHero(state, fodderUid);
  }
  hero.stars += 1;
  return done;
}

// ---------------------------------------------------------------------------
// Dismiss
// ---------------------------------------------------------------------------

/** Full refund of level costs + a star-based base reward; equipped gear comes back as `equipment`. */
export function dismissRewards(hero: HeroInstance): Rewards {
  const refund = levelRangeCost(1, hero.level);
  const base = DISMISS_BASE[Math.min(MAX_STARS, Math.max(0, hero.stars))] ?? DISMISS_BASE[0];
  const rewards: Rewards = { resources: { gold: refund.gold + base.gold, spirit: refund.spirit + base.spirit } };
  const gear: Record<string, number> = {};
  for (const id of Object.values(hero.equipment)) if (id) gear[id] = (gear[id] ?? 0) + 1;
  if (Object.keys(gear).length > 0) rewards.equipment = gear;
  return rewards;
}

/** Fails if locked or in formation or last hero. Returns gear to stock. */
export function dismissHero(state: GameState, uid: string): ActionResult<Rewards> {
  const hero = findHero(state, uid);
  if (!hero) return fail(ERR_NO_HERO);
  if (hero.locked) return fail('Kilitli kahraman serbest bırakılamaz.');
  if (isInFormation(state, uid)) return fail('Takımdaki kahraman serbest bırakılamaz. Önce takımdan çıkar.');
  if (state.heroes.length <= 1) return fail('Son kahramanını serbest bırakamazsın.');
  const rewards = dismissRewards(hero);
  removeHero(state, uid);
  addRewards(state, rewards);
  return ok(rewards);
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

export function equipItem(state: GameState, uid: string, equipId: string): ActionResult {
  const hero = findHero(state, uid);
  if (!hero) return fail(ERR_NO_HERO);
  if (!isEquipId(equipId)) return fail('Bilinmeyen ekipman.');
  if ((state.equipment[equipId] ?? 0) < 1) return fail('Bu ekipman stokta yok.');
  const { slot } = getEquipDef(equipId);
  const current = hero.equipment[slot];
  if (current === equipId) return fail('Bu ekipman zaten kuşanılmış.');
  if (current) addStock(state, current);
  takeStock(state, equipId);
  hero.equipment[slot] = equipId;
  return done;
}

export function unequip(state: GameState, uid: string, slot: EquipSlot): ActionResult {
  const hero = findHero(state, uid);
  if (!hero) return fail(ERR_NO_HERO);
  const current = hero.equipment[slot];
  if (!current) return fail('Bu yuvada ekipman yok.');
  addStock(state, current);
  delete hero.equipment[slot];
  return done;
}

function equippedTier(hero: HeroInstance, slot: EquipSlot): number {
  const id = hero.equipment[slot];
  return id && isEquipId(id) ? getEquipDef(id).tier : 0;
}

/** Highest-tier item of a slot currently in stock, or null. */
function bestInStock(state: GameState, slot: EquipSlot): string | null {
  let best: string | null = null;
  let bestTier = 0;
  for (const [id, count] of Object.entries(state.equipment)) {
    if (count < 1 || !isEquipId(id)) continue;
    const def = getEquipDef(id);
    if (def.slot === slot && def.tier > bestTier) {
      best = id;
      bestTier = def.tier;
    }
  }
  return best;
}

/** Equips the highest-tier available item per slot if better than current. Error if nothing changed. */
export function equipBest(state: GameState, uid: string): ActionResult<{ changed: number }> {
  const hero = findHero(state, uid);
  if (!hero) return fail(ERR_NO_HERO);
  let changed = 0;
  for (const slot of EQUIP_SLOTS) {
    const best = bestInStock(state, slot);
    if (best && getEquipDef(best).tier > equippedTier(hero, slot)) {
      equipItem(state, uid, best);
      changed++;
    }
  }
  if (changed === 0) return fail('Daha iyi ekipman yok.');
  return ok({ changed });
}

// ---------------------------------------------------------------------------
// Player level & resources
// ---------------------------------------------------------------------------

export function playerExpToNext(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return Math.round(60 * Math.pow(l, 1.5) + 140);
}

/** Gems granted when the player reaches `newLevel`. */
export function playerLevelGems(newLevel: number): number {
  return 50 + 10 * Math.max(0, Math.floor(newLevel));
}

/** Adds player exp, handling level-ups (each grants gems). Returns the number of levels gained. */
export function grantPlayerExp(state: GameState, exp: number): number {
  if (!(exp > 0)) return 0;
  const player = state.player;
  player.exp += Math.floor(exp);
  let gained = 0;
  while (player.level < PLAYER_MAX_LEVEL && player.exp >= playerExpToNext(player.level)) {
    player.exp -= playerExpToNext(player.level);
    player.level++;
    state.resources.gems += playerLevelGems(player.level);
    gained++;
  }
  if (player.level >= PLAYER_MAX_LEVEL) player.exp = 0;
  return gained;
}

/** Adds resources/equipment/player exp (handles player level-ups). */
export function addRewards(state: GameState, rewards: Rewards): void {
  for (const key of RESOURCE_KEYS) {
    const amount = rewards.resources[key];
    if (amount && Number.isFinite(amount)) state.resources[key] = Math.max(0, Math.floor(state.resources[key] + amount));
  }
  for (const [id, count] of Object.entries(rewards.equipment ?? {})) {
    const n = Math.floor(count);
    if (n > 0 && isEquipId(id)) addStock(state, id, n);
  }
  grantPlayerExp(state, rewards.playerExp ?? 0);
}

/** a + b as a new Rewards (keys present in either input are kept, even when 0). */
export function mergeRewards(a: Rewards, b: Rewards): Rewards {
  const resources: Partial<Resources> = {};
  for (const key of RESOURCE_KEYS) {
    if (a.resources[key] !== undefined || b.resources[key] !== undefined) {
      resources[key] = (a.resources[key] ?? 0) + (b.resources[key] ?? 0);
    }
  }
  const merged: Rewards = { resources };
  if (a.playerExp !== undefined || b.playerExp !== undefined) merged.playerExp = (a.playerExp ?? 0) + (b.playerExp ?? 0);
  if (a.equipment || b.equipment) {
    const equipment: Record<string, number> = { ...a.equipment };
    for (const [id, n] of Object.entries(b.equipment ?? {})) equipment[id] = (equipment[id] ?? 0) + n;
    merged.equipment = equipment;
  }
  return merged;
}

/** Rewards with every zero/invalid amount dropped (resources stays an object; playerExp/equipment only when > 0). */
export function compactRewards(rewards: Rewards): Rewards {
  const whole = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const resources: Partial<Resources> = {};
  for (const key of RESOURCE_KEYS) {
    const n = whole(rewards.resources?.[key]);
    if (n > 0) resources[key] = n;
  }
  const out: Rewards = { resources };
  const exp = whole(rewards.playerExp);
  if (exp > 0) out.playerExp = exp;
  const equipment: Record<string, number> = {};
  for (const [id, count] of Object.entries(rewards.equipment ?? {})) {
    const n = whole(count);
    if (n > 0 && isEquipId(id)) equipment[id] = n;
  }
  if (Object.keys(equipment).length > 0) out.equipment = equipment;
  return out;
}

export function canAfford(state: GameState, cost: Partial<Resources>): boolean {
  return RESOURCE_KEYS.every((key) => state.resources[key] >= (cost[key] ?? 0));
}

/** Returns false (and changes nothing) if unaffordable. */
export function spend(state: GameState, cost: Partial<Resources>): boolean {
  if (!canAfford(state, cost)) return false;
  for (const key of RESOURCE_KEYS) {
    const amount = cost[key] ?? 0;
    if (amount > 0) state.resources[key] -= amount;
  }
  return true;
}
