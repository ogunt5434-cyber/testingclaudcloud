// Settings: player name, account summary and "Oyunu Sıfırla" with confirmation.
import { stageLabel } from '../../core/campaign';
import { playerExpToNext } from '../../core/progression';
import { PLAYER_NAME_MAX } from '../../core/save';
import { button, progressBar, sectionTitle } from '../components';
import { runAction, safely, type Ui } from '../context';
import { h } from '../dom';
import { fmtNum, fraction } from '../format';
import { closeAllModals, confirmDialog, openModal } from '../overlay';

/** Renames the player through the store (which validates, saves and re-renders). */
export function renamePlayer(ui: Ui, raw: string): boolean {
  return runAction(ui, () => ui.game.setPlayerName(raw), 'İsim kaydedildi.') !== null;
}

async function resetGame(ui: Ui): Promise<void> {
  const ok = await confirmDialog({
    title: 'Oyunu Sıfırla',
    danger: true,
    confirmLabel: 'Her Şeyi Sil',
    message: h('p', null, 'Tüm kahramanların, kaynakların ve ilerlemen kalıcı olarak silinecek. Emin misin?'),
  });
  if (!ok) return;
  try {
    ui.game.reset();
    closeAllModals();
    ui.goTo('campaign');
    ui.toast('Yeni bir maceraya başladın!', 'success');
  } catch (err) {
    console.warn('reset failed', err);
    ui.toast('Oyun sıfırlanamadı.', 'error');
  }
}

export function openSettings(ui: Ui): void {
  const { state } = ui.game;
  const toNext = safely(() => playerExpToNext(state.player.level), 0);
  const input = h('input', {
    class: 'text-input',
    attrs: { type: 'text', value: state.player.name, maxlength: PLAYER_NAME_MAX, 'aria-label': 'Oyuncu adı', autocomplete: 'off' },
    on: {
      keydown: (ev) => {
        if (ev.key === 'Enter') renamePlayer(ui, input.value);
      },
    },
  });
  const row = (label: string, value: string): HTMLElement => h('div', { class: 'stat-row' }, h('span', { class: 'stat-name' }, label), h('span', { class: 'stat-value' }, value));

  openModal(
    { title: '⚙️ Ayarlar', className: 'compact settings-panel' },
    h(
      'div',
      { class: 'card' },
      sectionTitle('Oyuncu'),
      h('div', { class: 'settings-player' }, h('div', { class: 'avatar big' }, h('span', null, '🛡️'), h('span', { class: 'avatar-lv' }, String(state.player.level))), h('div', { class: 'settings-exp' }, h('span', null, `Seviye ${state.player.level}`), progressBar(fraction(state.player.exp, toNext), 'exp'), h('span', { class: 'muted' }, `${fmtNum(state.player.exp)} / ${fmtNum(toNext)} deneyim`))),
      h('label', { class: 'field-label' }, 'Oyuncu adı'),
      h('div', { class: 'input-row' }, input, button('Kaydet', () => renamePlayer(ui, input.value), { variant: 'primary' })),
    ),
    h(
      'div',
      { class: 'card' },
      sectionTitle('İlerleme'),
      row('Kahraman sayısı', String(state.heroes.length)),
      row('Geçilen son aşama', state.campaign.cleared > 0 ? safely(() => stageLabel(state.campaign.cleared), String(state.campaign.cleared)) : 'Henüz yok'),
      row('Kulede en yüksek kat', state.tower.cleared > 0 ? String(state.tower.cleared) : 'Henüz yok'),
      row('Toplam çağrı', String(state.summon.totalPulls)),
    ),
    h('div', { class: 'card danger-zone' }, sectionTitle('Tehlikeli Bölge'), h('p', { class: 'note' }, 'Kayıt silinir ve oyun baştan başlar.'), button('🗑️ Oyunu Sıfırla', () => void resetGame(ui), { variant: 'danger', class: 'btn-block' })),
  );
}
