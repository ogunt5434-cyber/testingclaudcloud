// Summoning (gacha, SPEC §5): basic scrolls, heroic scrolls or gems, heroic pity and a weighted hero pool.
import { GEMS_PER_HEROIC_PULL, GEMS_PER_HEROIC_TEN, HEROIC_PITY, MAX_HEROES, MAX_STARS } from './constants';
import { canAfford, spend } from './progression';
import { getHeroDef, heroesByRarity } from '../data/heroes';
import type { ActionResult, GameState, HeroInstance, Resources } from './types';
import type { Rng } from './rng';

export type SummonType = 'basic' | 'heroic';

/** Star rarity -> probability. Rarities are 2..5. */
export const SUMMON_RATES: Record<SummonType, Record<number, number>> = {
  basic: { 2: 0.5, 3: 0.4, 4: 0.095, 5: 0.005 },
  heroic: { 3: 0.55, 4: 0.41, 5: 0.04 },
};

/** Light/Dark 5★ heroes are half as likely as other 5★ heroes. */
export const LIGHT_DARK_5_WEIGHT = 0.5;

/** Cost options in priority order (scrolls first, then gems for heroic). */
export function summonCostOptions(type: SummonType, count: 1 | 10): Partial<Resources>[] {
  if (type === 'basic') return [{ basicScroll: count }];
  return [{ heroicScroll: count }, { gems: count === 1 ? GEMS_PER_HEROIC_PULL : GEMS_PER_HEROIC_TEN }];
}

/** Weighted pool of hero ids for a rarity. */
export function summonPool(rarity: number): [string, number][] {
  return heroesByRarity(rarity).map((def) => {
    const halved = rarity === 5 && (def.faction === 'light' || def.faction === 'dark');
    return [def.id, halved ? LIGHT_DARK_5_WEIGHT : 1];
  });
}

/** Probability that one pull of `type` yields `heroId` (ignoring pity), for UI info screens. */
export function heroSummonChance(type: SummonType, heroId: string): number {
  const rarity = getHeroDef(heroId).rarity;
  const pool = summonPool(rarity);
  const total = pool.reduce((sum, [, w]) => sum + w, 0);
  const weight = pool.find(([id]) => id === heroId)?.[1] ?? 0;
  return (SUMMON_RATES[type][rarity] ?? 0) * (total > 0 ? weight / total : 0);
}

function rarityWeights(type: SummonType): [number, number][] {
  return Object.entries(SUMMON_RATES[type]).map(([r, p]) => [Number(r), p]);
}

/** Hero uid counters stay below this, far from 2^53, so `nextUid++` always changes the value. */
export const UID_LIMIT = 1_000_000_000;

function nextFreeUid(state: GameState): string {
  const taken = new Set(state.heroes.map((h) => h.uid));
  // A crafted/corrupt counter (huge, fractional, NaN) restarts at 1; from a sane start the loop below
  // ends within taken.size + 1 tries because every step moves to a new uid.
  if (!Number.isSafeInteger(state.nextUid) || state.nextUid < 1 || state.nextUid >= UID_LIMIT) state.nextUid = 1;
  let uid = `h${state.nextUid}`;
  while (taken.has(uid)) {
    state.nextUid++;
    uid = `h${state.nextUid}`;
  }
  state.nextUid++;
  return uid;
}

/** Adds a new hero instance (level 1, stars = rarity unless given) to state and returns it. */
export function createHero(state: GameState, heroId: string, stars?: number): HeroInstance {
  if (state.heroes.length >= MAX_HEROES) throw new Error(`Hero limit reached (${MAX_HEROES})`);
  const def = getHeroDef(heroId);
  const hero: HeroInstance = {
    uid: nextFreeUid(state),
    heroId,
    level: 1,
    stars: Math.min(MAX_STARS, Math.max(1, Math.floor(stars ?? def.rarity))),
    equipment: {},
    locked: false,
  };
  state.heroes.push(hero);
  return hero;
}

/** Rolls one rarity, applying (and updating) heroic pity. */
function rollRarity(state: GameState, type: SummonType, rng: Rng): number {
  if (type === 'basic') return rng.weighted(rarityWeights('basic'));
  const forced = state.summon.heroicPity >= HEROIC_PITY - 1;
  const rarity = forced ? 5 : rng.weighted(rarityWeights('heroic'));
  state.summon.heroicPity = rarity === 5 ? 0 : state.summon.heroicPity + 1;
  return rarity;
}

/** Pays the first affordable cost option, rolls, adds heroes. Heroic pity guarantees a 5-star at HEROIC_PITY. */
export function summon(state: GameState, type: SummonType, count: 1 | 10, rng: Rng): ActionResult<HeroInstance[]> {
  if (type !== 'basic' && type !== 'heroic') return { ok: false, error: 'Bilinmeyen çağrı türü.' };
  if (count !== 1 && count !== 10) return { ok: false, error: 'Geçersiz çağrı sayısı.' };
  if (state.heroes.length + count > MAX_HEROES) {
    return { ok: false, error: `Kahraman sınırı (${MAX_HEROES}) doldu. Önce bazı kahramanları serbest bırak.` };
  }
  const cost = summonCostOptions(type, count).find((option) => canAfford(state, option));
  if (!cost) {
    const error = type === 'basic' ? 'Yeterli temel parşömen yok.' : 'Yeterli kahraman parşömeni veya elmas yok.';
    return { ok: false, error };
  }
  spend(state, cost);
  const heroes: HeroInstance[] = [];
  for (let i = 0; i < count; i++) {
    const rarity = rollRarity(state, type, rng);
    heroes.push(createHero(state, rng.weighted(summonPool(rarity))));
  }
  state.summon.totalPulls += count;
  return { ok: true, value: heroes };
}
