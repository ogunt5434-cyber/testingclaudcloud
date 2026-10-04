// Shared helpers for battle tests: fixture hero registration, setup builders and an event-stream
// invariant checker. Fixture ids are prefixed "test_" so they never collide with the real roster.
import { ENERGY_MAX, MAX_ROUNDS, SPD_PER_STAR, STAR_MULT, LEVEL_GROWTH, TEAM_SIZE } from '../src/core/constants';
import type {
  BattleResult,
  BattleSetup,
  BattleUnitSetup,
  HeroDef,
  PassiveDef,
  SkillDef,
  Stats,
  UnitRef,
} from '../src/core/types';
import { HEROES } from '../src/data/heroes';

export function makeStats(partial: Partial<Stats> = {}): Stats {
  return {
    hp: 1000,
    atk: 100,
    armor: 0,
    spd: 100,
    crit: 0,
    critDmg: 0,
    hit: 0,
    dodge: 0,
    skillDmg: 0,
    dmgReduce: 0,
    controlImmune: 0,
    armorBreak: 0,
    ...partial,
  };
}

const NO_OP_SKILL: SkillDef = {
  name: 'Bekleyiş',
  description: 'Kendine 1 tur %0 saldırı.',
  effects: [{ type: 'buff', target: { selector: 'self' }, stat: 'atk', amount: 0, duration: 1 }],
};

export function fixtureHero(id: string, overrides: Partial<HeroDef> = {}): HeroDef {
  return {
    id,
    name: id,
    title: 'Deneme',
    faction: 'fortress',
    heroClass: 'warrior',
    rarity: 3,
    base: { hp: 1000, atk: 80, armor: 20, spd: 100 },
    active: NO_OP_SKILL,
    passives: [],
    emoji: '🧪',
    ...overrides,
  };
}

export function passive(name: string, def: Omit<PassiveDef, 'name' | 'description'>): PassiveDef {
  return { name, description: name, ...def };
}

/** Pushes defs into HEROES; returns a function removing them again. */
export function registerHeroes(defs: HeroDef[]): () => void {
  HEROES.push(...defs);
  return () => {
    for (const def of defs) {
      const idx = HEROES.indexOf(def);
      if (idx >= 0) HEROES.splice(idx, 1);
    }
  };
}

export function unitSetup(heroId: string, stats: Partial<Stats> = {}, level = 1, stars = 1): BattleUnitSetup {
  return { heroId, level, stars, stats: makeStats(stats) };
}

/** Builds a 6-slot team from a sparse { pos: unit } map. */
export function team(slots: Record<number, BattleUnitSetup>): (BattleUnitSetup | null)[] {
  return Array.from({ length: TEAM_SIZE }, (_, pos) => slots[pos] ?? null);
}

/** Stats for a real roster hero per SPEC §2 (independent from stats.ts). */
export function rosterStats(def: HeroDef, level: number, stars: number): Stats {
  const growth = (1 + LEVEL_GROWTH * (level - 1)) * STAR_MULT[stars];
  return makeStats({
    ...def.innate,
    hp: def.base.hp * growth,
    atk: def.base.atk * growth,
    armor: def.base.armor * growth,
    spd: def.base.spd + SPD_PER_STAR * (stars - 1),
  });
}

export const refKey = (r: UnitRef): string => `${r.side}:${r.pos}`;

interface Tracked {
  hp: number;
  maxHp: number;
  energy: number;
  dead: boolean;
  dealt: number;
  taken: number;
  healed: number;
}

/**
 * Validates the internal consistency of a battle result. Returns a list of violations (empty = OK).
 * Checks hp bookkeeping, dead units never acting/being targeted, energy ranges, status on/off and buff/buffEnd pairing,
 * round counting, the single final battleEnd, winner logic, final snapshots and unitStats totals.
 */
export function checkInvariants(setup: BattleSetup, result: BattleResult): string[] {
  const errors: string[] = [];
  const fail = (i: number, msg: string): void => {
    if (errors.length < 20) errors.push(`#${i}: ${msg}`);
  };
  const maxRounds = setup.maxRounds ?? MAX_ROUNDS;
  const units = new Map<string, Tracked>();

  const expected = [
    ...setup.attackers.map((u, pos) => (u ? `attacker:${pos}` : null)),
    ...setup.defenders.map((u, pos) => (u ? `defender:${pos}` : null)),
  ].filter((k): k is string => k !== null);
  const initialKeys = result.initial.map((s) => refKey(s.ref));
  if (initialKeys.join() !== expected.join()) errors.push(`initial units ${initialKeys} != ${expected}`);
  for (const s of result.initial) {
    if (s.hp !== s.maxHp) errors.push(`initial hp != maxHp for ${refKey(s.ref)}`);
    units.set(refKey(s.ref), { hp: s.hp, maxHp: s.maxHp, energy: s.energy, dead: false, dealt: 0, taken: 0, healed: 0 });
  }

  const get = (i: number, ref: UnitRef): Tracked | null => {
    const u = units.get(refKey(ref));
    if (!u) fail(i, `unknown unit ${refKey(ref)}`);
    return u ?? null;
  };
  const alive = (i: number, ref: UnitRef, what: string): Tracked | null => {
    const u = get(i, ref);
    if (u && u.dead) fail(i, `${what} on dead unit ${refKey(ref)}`);
    return u;
  };

  const activeStatus = new Set<string>();
  /** `side:pos|stat|amount` -> number of active buffs (buff events not yet matched by buffEnd). */
  const activeBuffs = new Map<string, number>();
  let round = 0;
  let actedThisRound = new Set<string>();
  let endCount = 0;

  result.events.forEach((e, i) => {
    if (endCount > 0) fail(i, `event ${e.t} after battleEnd`);
    switch (e.t) {
      case 'roundStart':
        round++;
        actedThisRound = new Set();
        if (e.round !== round) fail(i, `roundStart ${e.round} expected ${round}`);
        break;
      case 'action':
      case 'skip': {
        alive(i, e.actor, e.t);
        const k = refKey(e.actor);
        if (actedThisRound.has(k)) fail(i, `${k} took two turns in round ${round}`);
        actedThisRound.add(k);
        if (e.t === 'action') e.targets.forEach((t) => alive(i, t, 'action target'));
        break;
      }
      case 'damage': {
        const t = alive(i, e.target, 'damage');
        if (!t) break;
        if (!(e.amount >= 1) || !Number.isInteger(e.amount)) fail(i, `bad damage amount ${e.amount}`);
        if (e.hpAfter !== t.hp - e.amount) fail(i, `damage hpAfter ${e.hpAfter} != ${t.hp} - ${e.amount}`);
        if (e.hpAfter < 0 || e.hpAfter > t.maxHp) fail(i, `hpAfter out of range ${e.hpAfter}`);
        t.hp = e.hpAfter;
        t.taken += e.amount;
        if (e.source) {
          const s = get(i, e.source);
          if (s) s.dealt += e.amount;
        }
        if (t.hp === 0) {
          const next = result.events[i + 1];
          if (!next || next.t !== 'death' || refKey(next.target) !== refKey(e.target)) fail(i, 'lethal damage not followed by death');
        }
        break;
      }
      case 'heal': {
        const t = alive(i, e.target, 'heal');
        if (!t) break;
        if (e.amount < 0) fail(i, `negative heal`);
        if (e.hpAfter !== t.hp + e.amount) fail(i, `heal hpAfter ${e.hpAfter} != ${t.hp} + ${e.amount}`);
        if (e.hpAfter > t.maxHp) fail(i, `heal above max hp`);
        t.hp = e.hpAfter;
        if (e.source) {
          const s = get(i, e.source);
          if (s) s.healed += e.amount;
        }
        break;
      }
      case 'dodge':
        alive(i, e.target, 'dodge');
        break;
      case 'energy': {
        const t = alive(i, e.target, 'energy');
        if (e.energyAfter < 0 || e.energyAfter > ENERGY_MAX) fail(i, `energy out of range ${e.energyAfter}`);
        if (t) t.energy = e.energyAfter;
        break;
      }
      case 'status': {
        const k = `${refKey(e.target)}|${e.status}`;
        if (e.on) {
          alive(i, e.target, 'status on');
          if (!(e.duration >= 1)) fail(i, `status on with duration ${e.duration}`);
          activeStatus.add(k);
        } else {
          if (!activeStatus.has(k)) fail(i, `status off without on: ${k}`);
          activeStatus.delete(k);
        }
        break;
      }
      case 'buff': {
        alive(i, e.target, 'buff');
        if (e.stat === 'hp') fail(i, 'hp buff emitted');
        if (!(e.duration >= 1)) fail(i, `buff with duration ${e.duration}`);
        const k = `${refKey(e.target)}|${e.stat}|${e.amount}`;
        activeBuffs.set(k, (activeBuffs.get(k) ?? 0) + 1);
        break;
      }
      case 'buffEnd': {
        get(i, e.target);
        const k = `${refKey(e.target)}|${e.stat}|${e.amount}`;
        const n = activeBuffs.get(k) ?? 0;
        if (n === 0) fail(i, `buffEnd without buff: ${k}`);
        else if (n === 1) activeBuffs.delete(k);
        else activeBuffs.set(k, n - 1);
        break;
      }
      case 'passive':
        get(i, e.actor);
        break;
      case 'death': {
        const t = get(i, e.target);
        if (t && (t.dead || t.hp !== 0)) fail(i, `bad death of ${refKey(e.target)} (hp ${t.hp})`);
        if (t) t.dead = true;
        break;
      }
      case 'battleEnd':
        endCount++;
        if (e.winner !== result.winner) fail(i, 'battleEnd winner mismatch');
        break;
    }
  });

  const last = result.events[result.events.length - 1];
  if (!last || last.t !== 'battleEnd') errors.push('last event is not battleEnd');
  if (endCount !== 1) errors.push(`battleEnd count ${endCount}`);
  if (result.rounds !== round) errors.push(`rounds ${result.rounds} != roundStart count ${round}`);
  if (result.rounds > maxRounds) errors.push(`rounds ${result.rounds} > maxRounds ${maxRounds}`);

  for (const k of activeStatus) {
    if (units.get(k.split('|')[0])?.dead) errors.push(`status still active on dead unit: ${k}`);
  }
  for (const k of activeBuffs.keys()) {
    if (units.get(k.split('|')[0])?.dead) errors.push(`buff still active on dead unit: ${k}`);
  }

  const sideDead = (side: string): boolean =>
    [...units.entries()].filter(([k]) => k.startsWith(side)).every(([, u]) => u.dead);
  const expectedWinner = sideDead('attacker') ? 'defender' : sideDead('defender') ? 'attacker' : 'defender';
  if (result.winner !== expectedWinner) errors.push(`winner ${result.winner} expected ${expectedWinner}`);
  if (!sideDead('attacker') && !sideDead('defender') && result.rounds !== maxRounds) {
    errors.push(`timeout win before maxRounds (${result.rounds})`);
  }

  for (const s of result.final) {
    const u = units.get(refKey(s.ref));
    if (!u) continue;
    if (s.hp !== u.hp) errors.push(`final hp ${s.hp} != tracked ${u.hp} for ${refKey(s.ref)}`);
    if (s.energy !== u.energy) errors.push(`final energy ${s.energy} != tracked ${u.energy} for ${refKey(s.ref)}`);
    if (s.hp < 0 || s.hp > s.maxHp) errors.push(`final hp out of range for ${refKey(s.ref)}`);
  }
  if (result.final.length !== result.initial.length) errors.push('final snapshot count mismatch');

  if (result.unitStats.length !== result.initial.length) errors.push('unitStats count mismatch');
  for (const st of result.unitStats) {
    const u = units.get(refKey(st.ref));
    if (!u) continue;
    if (st.damageDealt !== u.dealt) errors.push(`damageDealt ${st.damageDealt} != ${u.dealt} for ${refKey(st.ref)}`);
    if (st.damageTaken !== u.taken) errors.push(`damageTaken ${st.damageTaken} != ${u.taken} for ${refKey(st.ref)}`);
    if (st.healingDone !== u.healed) errors.push(`healingDone ${st.healingDone} != ${u.healed} for ${refKey(st.ref)}`);
  }
  return errors;
}
