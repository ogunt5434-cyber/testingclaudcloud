// Multi-step user flows shared by several screens: idle chest claim, formation confirm -> fight ->
// battle playback -> result.
import { campaignEnemies, stageLabel, stagePower } from '../core/campaign';
import type { FightOutcome } from '../core/game';
import { towerEnemies, towerPower } from '../core/tower';
import type { ActionResult } from '../core/types';
import { blockedBySave, runAction, safely, type Ui } from './context';
import { rewardEntries, rewardSummary } from './format';
import { openBattle } from './modals/battle';
import { openFormation } from './modals/formation';

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
    next: { winLabel: 'Sonraki Aşama', lossLabel: 'Tekrar Dene', run: () => fightCampaign(ui) },
  });
}

export function fightTower(ui: Ui): void {
  const res = fight(ui, () => ui.game.fightTower());
  if (!res) return;
  openBattle(ui, {
    outcome: res.outcome,
    levelUp: res.levelUp,
    title: `Kule · Kat ${res.outcome.level}`,
    next: { winLabel: 'Sonraki Kat', lossLabel: 'Tekrar Dene', run: () => fightTower(ui) },
  });
}

/** "Savaş" on the campaign screen: confirm the team against the stage's enemies, then fight. */
export function prepareCampaignFight(ui: Ui): void {
  const stage = ui.game.state.campaign.cleared + 1;
  openFormation(ui, {
    fight: {
      title: `Aşama ${stageLabel(stage)}`,
      enemies: safely(() => campaignEnemies(stage), []),
      enemyPower: safely(() => stagePower(stage), 0),
      run: () => fightCampaign(ui),
    },
  });
}

/** "Savaş" on the tower screen: confirm the team against the floor's guardians, then fight. */
export function prepareTowerFight(ui: Ui): void {
  const floor = ui.game.state.tower.cleared + 1;
  openFormation(ui, {
    fight: {
      title: `Kule · Kat ${floor}`,
      enemies: safely(() => towerEnemies(floor), []),
      enemyPower: safely(() => towerPower(floor), 0),
      run: () => fightTower(ui),
    },
  });
}

/** Collects the idle chest (hub chest button and campaign screen). */
export function claimIdle(ui: Ui): void {
  const { game } = ui;
  // A stale tab's claimIdle() collects nothing: say why instead of toasting an empty "Toplandı".
  if (blockedBySave(ui)) return;
  const preview = safely(() => game.idlePreview(), { resources: {} });
  if (rewardEntries(preview).length === 0) {
    ui.toast('Sandık henüz boş — biraz bekle.', 'info');
    return;
  }
  try {
    const got = game.claimIdle();
    if (rewardEntries(got).length === 0) {
      ui.toast(game.saveWarning() ?? 'Sandık henüz boş — biraz bekle.', game.saveProblem === 'conflict' ? 'error' : 'info');
      return;
    }
    ui.toast(`Toplandı: ${rewardSummary(got)}`, 'reward');
  } catch (err) {
    console.warn('claimIdle failed', err);
    ui.toast('Ödüller toplanamadı.', 'error');
  }
}
