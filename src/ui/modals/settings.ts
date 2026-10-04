// Settings: player name, account summary and "Oyunu Sıfırla" with confirmation.
import { icon } from '../../art';
import { stageLabel } from '../../core/campaign';
import { playerExpToNext } from '../../core/progression';
import { PLAYER_NAME_MAX } from '../../core/save';
import { button, portrait, progressBar, sectionTitle } from '../components';
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
    ui.goTo('hub');
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
  const row = (iconName: Parameters<typeof icon>[0], label: string, value: string): HTMLElement =>
    h('div', { class: 'stat-row' }, h('span', { class: 'stat-name' }, icon(iconName, 22), label), h('span', { class: 'stat-value' }, value));
  const leader = state.formation.find(Boolean);
  const leaderHero = leader ? state.heroes.find((hero) => hero.uid === leader) : state.heroes[0];
  const frac = fraction(state.player.exp, toNext);

  openModal(
    { title: 'Ayarlar', className: 'wide settings-panel' },
    h(
      'div',
      { class: 'settings-grid' },
      h(
        'div',
        { class: 'card settings-player' },
        sectionTitle('Oyuncu'),
        h(
          'div',
          { class: 'settings-id' },
          h('span', { class: 'avatar big', style: { '--exp': `${Math.round(frac * 360)}deg` } }, h('span', { class: 'avatar-ring' }), leaderHero ? portrait(leaderHero.heroId, 92, 'avatar-portrait') : null, h('span', { class: 'avatar-lv' }, String(state.player.level))),
          h('div', { class: 'settings-exp' }, h('strong', null, `Seviye ${state.player.level}`), progressBar(frac, 'exp'), h('span', { class: 'muted' }, `${fmtNum(state.player.exp)} / ${fmtNum(toNext)} deneyim`)),
        ),
        h('label', { class: 'field-label' }, 'Oyuncu adı'),
        h('div', { class: 'input-row' }, input, button('Kaydet', () => renamePlayer(ui, input.value), { variant: 'primary' })),
      ),
      h(
        'div',
        { class: 'card' },
        sectionTitle('İlerleme'),
        row('helmet', 'Kahraman sayısı', String(state.heroes.length)),
        row('swords', 'Geçilen son aşama', state.campaign.cleared > 0 ? safely(() => stageLabel(state.campaign.cleared), String(state.campaign.cleared)) : 'Henüz yok'),
        row('trophy', 'Kulede en yüksek kat', state.tower.cleared > 0 ? String(state.tower.cleared) : 'Henüz yok'),
        row('heroicScroll', 'Toplam çağrı', String(state.summon.totalPulls)),
        h('div', { class: 'danger-zone' }, h('p', { class: 'note' }, 'Kayıt silinir ve oyun baştan başlar.'), button('Oyunu Sıfırla', () => void resetGame(ui), { variant: 'danger', icon: 'close', class: 'btn-block' })),
      ),
    ),
  );
}
