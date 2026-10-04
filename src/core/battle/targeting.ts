// Target selection for skill/passive effects. Only living units are ever returned.
import type { SkillTarget } from '../types';
import type { BattleContext } from './context';
import { hpFraction, isAlive, isBack, isFront, stat, type BattleUnit } from './unit';

const byPos = (a: BattleUnit, b: BattleUnit): number => a.ref.pos - b.ref.pos;

/** Random alive front enemy; if the front row is empty, a random alive back enemy. */
export function defaultEnemy(ctx: BattleContext, actor: BattleUnit): BattleUnit | null {
  const enemies = ctx.enemiesOf(actor);
  const front = enemies.filter(isFront);
  const pool = front.length > 0 ? front : enemies;
  return pool.length > 0 ? ctx.rng.pick(pool) : null;
}

/** The preferred row if anyone there is alive, otherwise everyone left. */
function rowOrFallback(units: BattleUnit[], inRow: (u: BattleUnit) => boolean): BattleUnit[] {
  const row = units.filter(inRow);
  return row.length > 0 ? row : units;
}

function randomSubset(ctx: BattleContext, units: BattleUnit[], count: number | undefined): BattleUnit[] {
  const n = Math.max(1, Math.floor(count ?? 1));
  return ctx.rng.shuffle(units).slice(0, n).sort(byPos);
}

/** First unit minimizing `score` (ties -> lower position, since input is ordered by pos). */
function minBy(units: BattleUnit[], score: (u: BattleUnit) => number): BattleUnit[] {
  let best: BattleUnit | null = null;
  for (const u of units) if (best === null || score(u) < score(best)) best = u;
  return best ? [best] : [];
}

export function selectTargets(
  ctx: BattleContext,
  actor: BattleUnit,
  target: SkillTarget,
  previous: readonly BattleUnit[],
): BattleUnit[] {
  const enemies = ctx.enemiesOf(actor);
  const allies = ctx.alliesOf(actor);
  switch (target.selector) {
    case 'self':
      return isAlive(actor) ? [actor] : [];
    case 'defaultEnemy': {
      const unit = defaultEnemy(ctx, actor);
      return unit ? [unit] : [];
    }
    case 'randomEnemies':
      return randomSubset(ctx, enemies, target.count);
    case 'allEnemies':
      return enemies;
    case 'frontEnemies':
      return rowOrFallback(enemies, isFront);
    case 'backEnemies':
      return rowOrFallback(enemies, isBack);
    case 'lowestHpEnemy':
      return minBy(enemies, hpFraction);
    case 'highestAtkEnemy':
      return minBy(enemies, (u) => -stat(u, 'atk'));
    case 'allAllies':
      return allies;
    case 'lowestHpAlly':
      return minBy(allies, hpFraction);
    case 'randomAllies':
      return randomSubset(ctx, allies, target.count);
    case 'previous':
      return previous.filter(isAlive);
    default:
      return [];
  }
}
