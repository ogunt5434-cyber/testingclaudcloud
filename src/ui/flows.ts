// Multi-step user flows shared by several screens (fight -> battle playback -> result).
import { stageLabel } from '../core/campaign';
import type { ActionResult } from '../core/types';
import type { FightOutcome } from '../core/game';
import { runAction, type Ui } from './context';
import { openBattle } from './modals/battle';

/**
 * Runs a fight action. An account level-up from its rewards is announced on the result screen, not by
 * the usual toast (which would pop up over the battle before it is played).
 */
function fight(ui: Ui, action: () => ActionResult<FightOutcome>): { outcome: FightOutcome; levelUp: { from: number; to: number } | null } | null {
  const from = ui.game.state.player.level;
  const res = ui.withoutLevelUpToast(() => runAction(ui, action));
  if (!res) return null;
  const to = ui.game.state.player.level;
  return { outcome: res.value, levelUp: to > from ? { from, to } : null };
}

export function fightCampaign(ui: Ui): void {
  const res = fight(ui, () => ui.game.fightCampaign());
  if (!res) return;
  openBattle(ui, {
    outcome: res.outcome,
    levelUp: res.levelUp,
    title: `Aşama ${stageLabel(res.outcome.level)}`,
    next: { winLabel: 'Sonraki Aşama ▶', lossLabel: 'Tekrar Dene ↻', run: () => fightCampaign(ui) },
  });
}

export function fightTower(ui: Ui): void {
  const res = fight(ui, () => ui.game.fightTower());
  if (!res) return;
  openBattle(ui, {
    outcome: res.outcome,
    levelUp: res.levelUp,
    title: `Kule · Kat ${res.outcome.level}`,
    next: { winLabel: 'Sonraki Kat ▶', lossLabel: 'Tekrar Dene ↻', run: () => fightTower(ui) },
  });
}
