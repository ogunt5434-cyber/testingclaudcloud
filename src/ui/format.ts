// Pure formatting helpers and Turkish display tables (no DOM access, unit-testable).
// Icons are art icon names (src/art icon()), never emoji: emoji render inconsistently across platforms.
import { STAT_INFO } from '../core/constants';
import { PERCENT_STATS } from '../core/types';
import type { EquipSlot, Faction, HeroClass, ResourceKey, Rewards, StatKey, StatusKind } from '../core/types';
import type { IconName } from '../art/types';
import { EQUIP_TIER_INFO, getEquipDef, isEquipId } from '../data/equipment';

export const RESOURCE_INFO: Record<ResourceKey, { name: string; icon: IconName }> = {
  gold: { name: 'Altın', icon: 'gold' },
  spirit: { name: 'Gök Taşı', icon: 'spirit' },
  gems: { name: 'Yakut', icon: 'gem' },
  basicScroll: { name: 'Temel Parşömen', icon: 'basicScroll' },
  heroicScroll: { name: 'Kahraman Parşömeni', icon: 'heroicScroll' },
};
export const RESOURCE_ORDER: readonly ResourceKey[] = ['gold', 'spirit', 'gems', 'basicScroll', 'heroicScroll'];

export const EXP_INFO: { name: string; icon: IconName } = { name: 'Hesap Deneyimi', icon: 'playerExp' };
export const POWER_ICON: IconName = 'power';

export function factionIcon(faction: Faction): IconName {
  return `faction-${faction}`;
}

export function classIcon(heroClass: HeroClass): IconName {
  return `class-${heroClass}`;
}

/** Equipment slots share their names with the slot icons. */
export function slotIcon(slot: EquipSlot): IconName {
  return slot;
}

export function statusIcon(status: StatusKind): IconName {
  return status;
}

/** Stat icons for the four primary stats (others have none). */
export const STAT_ICON: Partial<Record<StatKey, IconName>> = { hp: 'hp', atk: 'atk', armor: 'def', spd: 'spd' };

/** Frame colour per star count (index = stars). */
export const RARITY_COLORS: readonly string[] = ['#8a8a8a', '#9e9e9e', '#63d07a', '#4fa3ff', '#b377ff', '#ffc94d'];

export function rarityColor(stars: number): string {
  return RARITY_COLORS[Math.max(0, Math.min(RARITY_COLORS.length - 1, Math.floor(stars)))];
}

function trimZero(text: string): string {
  return text.replace(/\.0$/, '');
}

/** Compact number: 9999, 12.3K, 123K, 4.5M, 1.2B. Numbers below 10 000 are shown in full. */
export function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const sign = value < 0 ? '-' : '';
  const n = Math.abs(Math.floor(value));
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  if (n < 10_000) return sign + String(n);
  for (const [size, suffix] of units) {
    if (n >= size) {
      const scaled = n / size;
      const digits = scaled < 100 ? 1 : 0;
      const factor = 10 ** digits;
      return sign + trimZero((Math.floor(scaled * factor) / factor).toFixed(digits)) + suffix;
    }
  }
  return sign + String(n);
}

/** Turkish-style percent: 0.155 -> "%15.5", 0.2 -> "%20". */
export function fmtPercent(fraction: number, maxDigits = 1): string {
  const rounded = Number((fraction * 100).toFixed(maxDigits));
  const sign = rounded < 0 ? '-' : '';
  return `${sign}%${String(Math.abs(rounded))}`;
}

/** Milliseconds -> "hh:mm:ss" (hours not wrapped at 24). */
export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function fmtStat(key: StatKey, value: number): string {
  return STAT_INFO[key].percent ? fmtPercent(value) : fmtNum(Math.round(value));
}

/** Signed short buff label: "+%20 Saldırı", "-15 Hız". */
export function fmtBuff(key: StatKey, amount: number): string {
  const percent = STAT_INFO[key].percent || PERCENT_STATS.includes(key);
  const sign = amount >= 0 ? '+' : '-';
  const magnitude = percent ? fmtPercent(Math.abs(amount)) : String(Math.round(Math.abs(amount)));
  return `${sign}${magnitude} ${STAT_INFO[key].name}`;
}

export interface RewardEntry {
  key: string;
  icon: IconName;
  name: string;
  amount: number;
  /** Optional accent colour (equipment tier). */
  color?: string;
}

/** Flattens a Rewards object into display rows, skipping zero amounts. */
export function rewardEntries(rewards: Rewards | null | undefined): RewardEntry[] {
  if (!rewards) return [];
  const rows: RewardEntry[] = [];
  for (const key of RESOURCE_ORDER) {
    const amount = Math.floor(rewards.resources?.[key] ?? 0);
    if (amount > 0) rows.push({ key, icon: RESOURCE_INFO[key].icon, name: RESOURCE_INFO[key].name, amount });
  }
  const exp = Math.floor(rewards.playerExp ?? 0);
  if (exp > 0) rows.push({ key: 'playerExp', icon: EXP_INFO.icon, name: EXP_INFO.name, amount: exp });
  for (const [id, count] of Object.entries(rewards.equipment ?? {})) {
    const amount = Math.floor(count);
    if (amount <= 0 || !isEquipId(id)) continue;
    const def = getEquipDef(id);
    rows.push({
      key: id,
      icon: slotIcon(def.slot),
      name: def.name,
      amount,
      color: EQUIP_TIER_INFO[def.tier]?.color,
    });
  }
  return rows;
}

/** One-line reward summary for toasts: "1200 Altın · 300 Gök Taşı". */
export function rewardSummary(rewards: Rewards | null | undefined): string {
  return rewardEntries(rewards)
    .map((r) => `${fmtNum(r.amount)} ${r.name}`)
    .join(' · ');
}

const CHAPTER_NAMES: readonly string[] = [
  'Sisli Vadi',
  'Kızıl Bozkır',
  'Yankılı Mağaralar',
  'Kül Ormanı',
  'Buzul Geçidi',
  'Unutulmuş Kale',
  'Zehirli Bataklık',
  'Ejder Sırtı',
  'Gölge Tapınağı',
  'Yıldız Kapısı',
];

/** Flavour name for a 1-based chapter number (cycles after the list ends). */
export function chapterName(chapter: number): string {
  const index = (Math.max(1, Math.floor(chapter)) - 1) % CHAPTER_NAMES.length;
  return CHAPTER_NAMES[index];
}

/** Clamped 0..1 fraction (safe for zero/NaN denominators). */
export function fraction(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value / max));
}

const TR_VOWELS = new Set('aeıioöuüâîûAEIİOÖUÜÂÎÛ');
/** Soft hyphen: invisible unless the browser breaks the line there. */
export const SOFT_HYPHEN = '­';

/**
 * Inserts soft hyphens at Turkish syllable boundaries so long names can wrap inside small cards
 * ("Kızılboynuz" -> "Kızıl-" / "boynuz") instead of being cut off. Turkish syllables have exactly one vowel;
 * between two vowels the boundary goes before the last consonant (V-V, V-CV, VC-CV, VCC-CV).
 * Breaks that would leave a single letter at either end of a word are skipped.
 */
export function hyphenateTr(text: string): string {
  return text
    .split(' ')
    .map((word) => {
      const chars = [...word];
      const vowels = chars.flatMap((c, i) => (TR_VOWELS.has(c) ? [i] : []));
      const breaks = new Set<number>();
      for (let k = 1; k < vowels.length; k++) {
        const consonants = vowels[k] - vowels[k - 1] - 1;
        const at = consonants <= 1 ? vowels[k - 1] + 1 : vowels[k] - 1;
        if (at >= 2 && at <= chars.length - 2) breaks.add(at);
      }
      return chars.map((c, i) => (breaks.has(i) ? SOFT_HYPHEN + c : c)).join('');
    })
    .join(' ');
}

/**
 * Text from the game core (error messages) shown in the UI without pictographs: a star count written with
 * a star glyph ("4" + U+2605) becomes "4 yıldızlı" and any remaining emoji / dingbat is dropped (they
 * render as boxes on some systems).
 */
const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
/** A star glyph (black / white star, optional emoji variation selector) after a number. */
const STAR_COUNT = new RegExp(`(\\d+)\\s*[${cp(0x2605, 0x2606)}]${cp(0xfe0f)}?`, 'gu');
/** Arrows, technical symbols, geometric shapes, dingbats, misc symbols, variation selector, ZWJ, emoji. */
const PICTOGRAPHS = new RegExp(
  `[${cp(0x2190)}-${cp(0x21ff)}${cp(0x2300)}-${cp(0x23ff)}${cp(0x25a0)}-${cp(0x27bf)}${cp(0x2b00)}-${cp(0x2bff)}${cp(0xfe0f)}${cp(0x200d)}]|\\p{Extended_Pictographic}`,
  'gu',
);

export function plainText(text: string): string {
  return CORE_NAMES.reduce((t, [re, name]) => t.replace(re, name), text.replace(STAR_COUNT, '$1 yıldızlı'))
    .replace(PICTOGRAPHS, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Core messages use the resources' internal working names; the UI shows their display names. */
const CORE_NAMES: readonly [RegExp, string][] = [
  [/ruh özü/g, 'gök taşı'],
  [/Ruh özü/g, 'Gök taşı'],
  [/\belmas\b/g, 'yakut'],
  [/\bElmas\b/g, 'Yakut'],
];
