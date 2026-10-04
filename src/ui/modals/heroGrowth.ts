// "Gelişim" tab of the hero detail: stats table, level up (+1 / +10 / Maks) and star up.
import { MAX_STARS, STAT_INFO } from '../../core/constants';
import { affordableLevels, findStarUpFodder, levelCap, levelRangeCost, starUpRequirement } from '../../core/progression';
import type { ActionResult, HeroInstance, Resources, StatKey, Stats } from '../../core/types';
import { getHeroDef } from '../../data/heroes';
import { button, costView, portrait, progressBar, sectionTitle, starRow, statRow } from '../components';
import { runAction, safely } from '../context';
import { h } from '../dom';
import { fmtStat, fraction } from '../format';
import { confirmDialog } from '../overlay';
import type { DetailCtx } from './heroDetail';

const PRIMARY: { key: StatKey; icon: string }[] = [
  { key: 'hp', icon: '❤️' },
  { key: 'atk', icon: '⚔️' },
  { key: 'armor', icon: '🛡️' },
  { key: 'spd', icon: '💨' },
];
const SECONDARY: StatKey[] = ['crit', 'critDmg', 'hit', 'dodge', 'skillDmg', 'dmgReduce', 'controlImmune', 'armorBreak'];

/** Runs an action with a portrait flash on success. */
function act<T>(ctx: DetailCtx, kind: 'level' | 'star', action: () => ActionResult<T>, success: string | ((v: T) => string)): void {
  ctx.flash(kind);
  if (!runAction(ctx.ui, action, success)) ctx.flash(null);
}

function statsCard(stats: Stats): HTMLElement {
  const secondary = SECONDARY.filter((key) => Math.abs(stats[key]) > 1e-9);
  return h(
    'div',
    { class: 'card stats-card' },
    h(
      'div',
      { class: 'stat-grid' },
      PRIMARY.map(({ key, icon }) =>
        h('div', { class: 'stat-big' }, h('span', { class: 'stat-icon' }, icon), h('span', { class: 'stat-name' }, STAT_INFO[key].name), h('span', { class: 'stat-value' }, fmtStat(key, stats[key]))),
      ),
    ),
    secondary.length
      ? h(
          'div',
          { class: 'stat-list' },
          secondary.map((key) => statRow(key, stats[key])),
        )
      : null,
    h('p', { class: 'note' }, 'Pasif yetenek bonusları savaşta eklenir.'),
  );
}

function canPay(cost: { gold: number; spirit: number }, res: Readonly<Resources>): boolean {
  return res.gold >= cost.gold && res.spirit >= cost.spirit;
}

function levelCard(ctx: DetailCtx): HTMLElement {
  const { hero, ui } = ctx;
  const res = ui.game.state.resources;
  const cap = levelCap(hero.stars);
  const atCap = hero.level >= cap;
  const affordable = atCap ? 0 : affordableLevels(ui.game.state, hero, Infinity).gained;
  const name = getHeroDef(hero.heroId).name;

  const levelButton = (label: string, levels: number, strict: boolean): HTMLElement => {
    const target = Math.min(cap, hero.level + Math.max(1, levels));
    const cost = levelRangeCost(hero.level, target);
    const disabled = atCap || levels <= 0 || (strict && !canPay(cost, res));
    return button(
      label,
      () => act(ctx, 'level', () => ui.game.levelUp(hero.uid, target - hero.level), (v) => `${name} +${v.gained} seviye!`),
      { variant: 'primary', disabled, sub: atCap ? '—' : costView(cost, res), class: 'btn-level' },
    );
  };

  let reason: string | null = null;
  if (atCap) reason = hero.stars < MAX_STARS ? 'Seviye sınırına ulaşıldı — sınırı artırmak için yıldız yükselt.' : 'Maksimum seviyeye ulaşıldı!';
  else if (affordable === 0) reason = 'Yetersiz altın veya ruh özü.';

  return h(
    'div',
    { class: 'card level-card' },
    sectionTitle('Seviye', h('span', { class: 'level-num' }, h('strong', null, String(hero.level)), ` / ${cap}`)),
    progressBar(fraction(hero.level, cap), 'level'),
    h(
      'div',
      { class: 'btn-row three' },
      levelButton('+1', 1, true),
      levelButton('+10', 10, true),
      levelButton(affordable > 0 ? `Maks +${affordable}` : 'Maks', affordable, false),
    ),
    reason ? h('p', { class: ['reason', atCap && hero.stars >= MAX_STARS ? 'good' : null] }, reason) : null,
  );
}

function requirementLine(ok: boolean, text: string): HTMLElement {
  return h('div', { class: ['req', ok ? 'ok' : 'missing'] }, h('span', { class: 'req-mark' }, ok ? '✔' : '✖'), text);
}

async function confirmStarUp(ctx: DetailCtx, fodder: string[]): Promise<void> {
  const { hero, ui } = ctx;
  const def = getHeroDef(hero.heroId);
  const ok = await confirmDialog({
    title: 'Yıldız Yükselt',
    confirmLabel: 'Yükselt',
    message: h(
      'div',
      { class: 'starup-confirm' },
      h('p', null, `${def.name} ${hero.stars + 1}★ olacak. Şu kopyalar tüketilecek:`),
      h('div', { class: 'fodder-row' }, fodder.map((uid) => fodderChip(ui.game.hero(uid)))),
      h('p', { class: 'muted' }, 'Kopyaların seviye maliyetleri iade edilir, ekipmanları depoya döner.'),
    ),
  });
  if (ok) act(ctx, 'star', () => ui.game.starUp(hero.uid), `${def.name} ${hero.stars + 1}★ oldu!`);
}

function fodderChip(hero: HeroInstance | undefined): HTMLElement | null {
  if (!hero) return null;
  return h('div', { class: 'fodder' }, portrait(hero.heroId, 'xs'), h('span', null, `Sv.${hero.level}`));
}

function starCard(ctx: DetailCtx): HTMLElement {
  const { hero, ui } = ctx;
  if (hero.stars >= MAX_STARS) {
    return h('div', { class: 'card star-card maxed' }, sectionTitle('Yıldız'), h('p', { class: 'reason good' }, starRow(MAX_STARS), ' En yüksek yıldıza ulaştı!'));
  }
  const req = safely(() => starUpRequirement(hero), null);
  if (!req) return h('div', { class: 'card star-card' }, sectionTitle('Yıldız'), h('p', { class: 'reason' }, 'Yıldız bilgisi yüklenemedi.'));
  const fodder = safely(() => findStarUpFodder(ui.game.state, hero.uid), [] as string[]);
  const levelOk = hero.level >= req.levelRequired;
  const fodderOk = fodder.length >= req.fodderCount;
  const used = fodder.slice(0, req.fodderCount);
  const slots = Array.from({ length: req.fodderCount }, (_, i) =>
    used[i] ? fodderChip(ui.game.hero(used[i])) : h('div', { class: 'fodder missing' }, portrait(hero.heroId, 'xs', 'ghost'), h('span', null, '?')),
  );
  return h(
    'div',
    { class: 'card star-card' },
    sectionTitle('Yıldız Yükselt', h('span', { class: 'star-arrow' }, starRow(hero.stars), ' ➜ ', starRow(hero.stars + 1))),
    requirementLine(levelOk, `Seviye ${req.levelRequired} (şu an ${hero.level})`),
    requirementLine(fodderOk, `${req.fodderCount}× aynı kahraman, ${hero.stars}★ — uygun: ${fodder.length}`),
    h('div', { class: 'fodder-row' }, slots),
    h('p', { class: 'note' }, `Yeni seviye sınırı: ${levelCap(hero.stars + 1)}. Kilitli ve takımdaki kopyalar kullanılmaz.`),
    button('⭐ Yıldız Yükselt', () => void confirmStarUp(ctx, used), { variant: 'gold', disabled: !(levelOk && fodderOk), class: 'btn-block' }),
  );
}

export function growthTab(ctx: DetailCtx): HTMLElement {
  const stats = safely(() => ctx.ui.game.heroStats(ctx.hero.uid), null);
  return h('div', { class: 'growth-tab' }, stats ? statsCard(stats) : null, levelCard(ctx), starCard(ctx));
}
