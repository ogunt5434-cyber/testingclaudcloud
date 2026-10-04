// Global game rules and tuning constants shared by every module.
import type { Faction, HeroClass, StatKey } from './types';

// ---------------------------------------------------------------------------
// Factions
// ---------------------------------------------------------------------------

export const FACTIONS: readonly Faction[] = ['shadow', 'fortress', 'abyss', 'forest', 'dark', 'light'];

/** attacker faction -> the faction it has advantage against. */
export const FACTION_ADVANTAGE: Record<Faction, Faction> = {
  abyss: 'forest',
  forest: 'shadow',
  shadow: 'fortress',
  fortress: 'abyss',
  light: 'dark',
  dark: 'light',
};

/** Damage bonus and hit bonus when attacking a faction you have advantage against. */
export const FACTION_DMG_BONUS = 0.3;
export const FACTION_HIT_BONUS = 0.15;

export function hasFactionAdvantage(attacker: Faction, defender: Faction): boolean {
  return FACTION_ADVANTAGE[attacker] === defender;
}

export const FACTION_INFO: Record<Faction, { name: string; color: string; icon: string }> = {
  shadow: { name: 'Gölge', color: '#8e5bd6', icon: '🌑' },
  fortress: { name: 'Kale', color: '#d9a03f', icon: '🏰' },
  abyss: { name: 'Uçurum', color: '#d6453d', icon: '🔥' },
  forest: { name: 'Orman', color: '#4caf50', icon: '🌿' },
  dark: { name: 'Karanlık', color: '#5b2a86', icon: '💀' },
  light: { name: 'Işık', color: '#f2d660', icon: '☀️' },
};

export const CLASS_INFO: Record<HeroClass, { name: string; icon: string }> = {
  warrior: { name: 'Savaşçı', icon: '🛡️' },
  mage: { name: 'Büyücü', icon: '🔮' },
  ranger: { name: 'Okçu', icon: '🏹' },
  assassin: { name: 'Suikastçı', icon: '🗡️' },
  priest: { name: 'Rahip', icon: '✨' },
};

export const STAT_INFO: Record<StatKey, { name: string; percent: boolean }> = {
  hp: { name: 'Can', percent: false },
  atk: { name: 'Saldırı', percent: false },
  armor: { name: 'Zırh', percent: false },
  spd: { name: 'Hız', percent: false },
  crit: { name: 'Kritik Şansı', percent: true },
  critDmg: { name: 'Kritik Hasarı', percent: true },
  hit: { name: 'İsabet', percent: true },
  dodge: { name: 'Kaçınma', percent: true },
  skillDmg: { name: 'Yetenek Hasarı', percent: true },
  dmgReduce: { name: 'Hasar Azaltma', percent: true },
  controlImmune: { name: 'Kontrol Bağışıklığı', percent: true },
  armorBreak: { name: 'Zırh Delme', percent: true },
};

export const STATUS_INFO: Record<string, { name: string; icon: string }> = {
  stun: { name: 'Sersemletme', icon: '💫' },
  freeze: { name: 'Dondurma', icon: '❄️' },
  petrify: { name: 'Taşlaşma', icon: '🗿' },
  silence: { name: 'Susturma', icon: '🤐' },
  burn: { name: 'Yanma', icon: '🔥' },
  poison: { name: 'Zehir', icon: '☠️' },
  bleed: { name: 'Kanama', icon: '🩸' },
};

// ---------------------------------------------------------------------------
// Hero growth
// ---------------------------------------------------------------------------

export const MAX_STARS = 5;
/** Index = stars. */
export const STAR_MULT = [0, 1, 1.25, 1.6, 2.1, 2.8];
/** Max level for a hero with that many stars. Index = stars. */
export const LEVEL_CAP = [0, 20, 40, 60, 80, 100];
/** Each level above 1 adds this fraction of the base value to hp/atk/armor. spd does not grow with level. */
export const LEVEL_GROWTH = 0.1;
/** Speed bonus per star above 1. */
export const SPD_PER_STAR = 2;
/** Copies of the same hero at the same star level required to go from index stars -> stars+1. */
export const STAR_UP_FODDER = [0, 1, 2, 2, 3];

// ---------------------------------------------------------------------------
// Battle rules
// ---------------------------------------------------------------------------

export const TEAM_SIZE = 6;
export const FRONT_ROW: readonly number[] = [0, 1];
export const BACK_ROW: readonly number[] = [2, 3, 4, 5];
export const MAX_ROUNDS = 15;

export const ENERGY_START = 50;
export const ENERGY_PER_BASIC = 50;
export const ENERGY_PER_HIT = 10;
export const ENERGY_TO_CAST = 100;
export const ENERGY_MAX = 300;

export const CRIT_BASE_MULT = 1.5;

/**
 * Armor mitigation: reduction = effArmor / (effArmor + ARMOR_K_BASE + ARMOR_K_PER_LEVEL * attackerLevel),
 * capped at ARMOR_CAP.
 */
export const ARMOR_K_BASE = 100;
export const ARMOR_K_PER_LEVEL = 15;
export const ARMOR_CAP = 0.75;
/** dmgReduce stat is capped at this value. */
export const DMG_REDUCE_CAP = 0.6;
/** Every damage roll is multiplied by a uniform random factor in [1 - DAMAGE_VARIANCE, 1 + DAMAGE_VARIANCE]. */
export const DAMAGE_VARIANCE = 0.05;

// ---------------------------------------------------------------------------
// Idle / economy
// ---------------------------------------------------------------------------

export const IDLE_CAP_HOURS = 12;
export const HEROIC_PITY = 50;
export const GEMS_PER_HEROIC_PULL = 300;
export const GEMS_PER_HEROIC_TEN = 2700;
export const MAX_HEROES = 200;
