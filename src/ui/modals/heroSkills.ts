// "Yetenekler" tab of the hero detail: active skill and passives with their Turkish descriptions.
import { icon } from '../../art';
import { ENERGY_TO_CAST } from '../../core/constants';
import type { HeroDef, PassiveDef, PassiveTrigger } from '../../core/types';
import { h } from '../dom';

const TRIGGER_LABELS: Record<PassiveTrigger, string> = {
  battleStart: 'Savaş başında',
  roundEnd: 'Tur sonunda',
  onAttack: 'Saldırdıktan sonra',
  onHit: 'Hasar alınca',
  onAllyDeath: 'Müttefik ölünce',
  onDeath: 'Ölünce',
};

function passiveTag(p: PassiveDef): string {
  const trigger = p.trigger ? TRIGGER_LABELS[p.trigger] : 'Kalıcı';
  return p.chance !== undefined && p.chance < 1 ? `${trigger} · %${Math.round(p.chance * 100)}` : trigger;
}

export function skillsTab(def: HeroDef): HTMLElement {
  return h(
    'div',
    { class: 'skills-tab' },
    h(
      'div',
      { class: 'skill active-skill' },
      h('div', { class: 'skill-head' }, h('span', { class: 'skill-icon' }, icon('speed', 34)), h('span', { class: 'skill-name' }, def.active.name), h('span', { class: 'skill-tag' }, `Aktif · ${ENERGY_TO_CAST} Enerji`)),
      h('p', { class: 'skill-desc' }, def.active.description),
    ),
    def.passives.map((p) =>
      h(
        'div',
        { class: 'skill passive-skill' },
        h('div', { class: 'skill-head' }, h('span', { class: 'skill-icon' }, icon('buff-up', 30)), h('span', { class: 'skill-name' }, p.name), h('span', { class: 'skill-tag' }, passiveTag(p))),
        h('p', { class: 'skill-desc' }, p.description),
      ),
    ),
  );
}
