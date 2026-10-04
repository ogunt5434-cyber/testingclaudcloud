// Multi-step user flows shared by several screens (fight -> battle playback -> result).
import { stageLabel } from '../core/campaign';
import { runAction, type Ui } from './context';
import { openBattle } from './modals/battle';

export function fightCampaign(ui: Ui): void {
  const res = runAction(ui, () => ui.game.fightCampaign());
  if (!res) return;
  openBattle(ui, {
    outcome: res.value,
    title: `Aşama ${stageLabel(res.value.level)}`,
    next: { winLabel: 'Sonraki Aşama ▶', lossLabel: 'Tekrar Dene ↻', run: () => fightCampaign(ui) },
  });
}

export function fightTower(ui: Ui): void {
  const res = runAction(ui, () => ui.game.fightTower());
  if (!res) return;
  openBattle(ui, {
    outcome: res.value,
    title: `Kule · Kat ${res.value.level}`,
    next: { winLabel: 'Sonraki Kat ▶', lossLabel: 'Tekrar Dene ↻', run: () => fightTower(ui) },
  });
}
