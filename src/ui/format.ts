// Pure formatting helpers and Turkish display tables (no DOM access, unit-testable).
import { STAT_INFO } from '../core/constants';
import { PERCENT_STATS } from '../core/types';
import type { ResourceKey, Rewards, StatKey } from '../core/types';
import { EQUIP_SLOT_INFO, EQUIP_TIER_INFO, getEquipDef, isEquipId } from '../data/equipment';

export const RESOURCE_INFO: Record<ResourceKey, { name: string; icon: string }> = {
  gold: { name: 'Altın', icon: '🪙' },
  spirit: { name: 'Ruh Özü', icon: '💠' },
  gems: { name: 'Elmas', icon: '💎' },
  basicScroll: { name: 'Temel Parşömen', icon: '📜' },
  heroicScroll: { name: 'Kahraman Parşömeni', icon: '🎫' },
};
export const RESOURCE_ORDER: readonly ResourceKey[] = ['gold', 'spirit', 'gems', 'basicScroll', 'heroicScroll'];

export const EXP_INFO = { name: 'Hesap Deneyimi', icon: '🌟' };
export const POWER_ICON = '⚔️';

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
  icon: string;
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
      icon: EQUIP_SLOT_INFO[def.slot].icon,
      name: def.name,
      amount,
      color: EQUIP_TIER_INFO[def.tier]?.color,
    });
  }
  return rows;
}

/** One-line reward summary for toasts: "🪙 1200 · 💠 300". */
export function rewardSummary(rewards: Rewards | null | undefined): string {
  return rewardEntries(rewards)
    .map((r) => `${r.icon} ${fmtNum(r.amount)}`)
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
