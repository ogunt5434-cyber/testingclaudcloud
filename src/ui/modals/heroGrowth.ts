// "Gelişim" tab of the hero detail: stats, level up (+1 / +10 / Maks) and star up.
import { icon, type IconName } from '../../art';
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

const PRIMARY: { key: StatKey; icon: IconName }[] = [
  { key: 'hp', icon: 'hp' },
  { key: 'atk', icon: 'atk' },
  { key: 'armor', icon: 'def' },
  { key: 'spd', icon: 'spd' },
];
const SECONDARY: StatKey[] = ['crit', 'critDmg', 'hit', 'dodge', 'skillDmg', 'dmgReduce', 'controlImmune', 'armorBreak'];

/** Runs an action with a celebration on the hero on success. */
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
      PRIMARY.map(({ key, icon: ic }) =>
        h('div', { class: 'stat-big' }, icon(ic, 36), h('span', { class: 'stat-text' }, h('span', { class: 'stat-name' }, STAT_INFO[key].name), h('span', { class: 'stat-value' }, fmtStat(key, stats[key])))),
      ),
    ),
    secondary.length ? h('div', { class: 'stat-list' }, secondary.map((key) => statRow(key, stats[key]))) : null,
    h('p', { class: 'note' }, 'Pasif yetenek bonusları savaşta eklenir.'),
  );
}

function canPay(cost: { gold: number; spirit: number }, res: Readonly<Resources>): boolean {
  return res.gold >= cost.gold && res.spirit >= cost.spirit;
}

/**
 * +1 / +10 / Maks level buttons with their costs. The hero panel pins them under the tab while
 * "Gelişim" is open, so the most used action never scrolls out of view.
 */
export function levelButtons(ctx: DetailCtx): HTMLElement {
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
      { variant: 'primary', disabled, sub: atCap ? 'Sınırda' : costView(cost, res), class: 'btn-level' },
    );
  };

  return h(
    'div',
    { class: 'btn-row three level-buttons' },
    levelButton('Seviye +1', 1, true),
    levelButton('Seviye +10', 10, true),
    levelButton(affordable > 0 ? `Maks +${affordable}` : 'Maks', affordable, false),
  );
}

function levelCard(ctx: DetailCtx): HTMLElement {
  const { hero, ui } = ctx;
  const cap = levelCap(hero.stars);
  const atCap = hero.level >= cap;
  const affordable = atCap ? 0 : affordableLevels(ui.game.state, hero, Infinity).gained;

  let reason: string | null = null;
  if (atCap) reason = hero.stars < MAX_STARS ? 'Seviye sınırına ulaşıldı — sınırı artırmak için yıldız yükselt.' : 'Maksimum seviyeye ulaşıldı!';
  else if (affordable === 0) reason = 'Yetersiz altın veya gök taşı.';

  return h(
    'div',
    { class: 'card level-card' },
    sectionTitle('Seviye', h('span', { class: 'level-num' }, h('strong', null, String(hero.level)), ` / ${cap}`)),
    progressBar(fraction(hero.level, cap), 'level'),
    reason ? h('p', { class: ['reason', atCap && hero.stars >= MAX_STARS ? 'good' : null] }, reason) : null,
  );
}

function requirementLine(ok: boolean, text: string): HTMLElement {
  return h('div', { class: ['req', ok ? 'ok' : 'missing'] }, h('span', { class: 'req-mark', attrs: { 'aria-label': ok ? 'Tamam' : 'Eksik', role: 'img' } }), text);
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
      h('p', null, `${def.name} ${hero.stars + 1} yıldız olacak. Şu kopyalar tüketilecek:`),
      h('div', { class: 'fodder-row' }, fodder.map((uid) => fodderChip(ui.game.hero(uid)))),
      h('p', { class: 'muted' }, 'Kopyaların seviye maliyetleri iade edilir, ekipmanları depoya döner.'),
    ),
  });
  if (ok) act(ctx, 'star', () => ui.game.starUp(hero.uid), `${def.name} ${hero.stars + 1} yıldız oldu!`);
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
    sectionTitle('Yıldız Yükselt', h('span', { class: 'star-arrow' }, starRow(hero.stars, undefined, 16), h('span', { class: 'arrow-right' }, icon('back', 20)), starRow(hero.stars + 1, undefined, 16))),
    h(
      'div',
      { class: 'star-body' },
      h(
        'div',
        { class: 'star-reqs' },
        requirementLine(levelOk, `Seviye ${req.levelRequired} (şu an ${hero.level})`),
        requirementLine(fodderOk, `${req.fodderCount}× aynı kahraman, ${hero.stars} yıldız — uygun: ${fodder.length}`),
        h('p', { class: 'note' }, `Yeni seviye sınırı: ${levelCap(hero.stars + 1)}. Kilitli ve takımdaki kopyalar kullanılmaz.`),
      ),
      h('div', { class: 'fodder-row' }, slots),
    ),
    button('Yıldız Yükselt', () => void confirmStarUp(ctx, used), { variant: 'gold', icon: 'star', disabled: !(levelOk && fodderOk), class: 'btn-block' }),
  );
}

export function growthTab(ctx: DetailCtx): HTMLElement {
  const stats = safely(() => ctx.ui.game.heroStats(ctx.hero.uid), null);
  return h('div', { class: 'growth-tab' }, stats ? statsCard(stats) : null, levelCard(ctx), starCard(ctx));
}
