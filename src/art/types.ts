// Art module types: every visual asset in the game is generated here (SVG/CSS/canvas), never emoji or copied art.
// Design space: the game renders on a 1280x720 landscape stage (see SPEC §6); sizes below are in stage px.

export type IconName =
  // resources
  | 'gold' | 'spirit' | 'gem' | 'basicScroll' | 'heroicScroll' | 'playerExp'
  // factions & classes
  | 'faction-shadow' | 'faction-fortress' | 'faction-abyss' | 'faction-forest' | 'faction-dark' | 'faction-light'
  | 'class-warrior' | 'class-mage' | 'class-ranger' | 'class-assassin' | 'class-priest'
  // equipment slots
  | 'weapon' | 'armor' | 'helmet' | 'boots'
  // statuses
  | 'stun' | 'freeze' | 'petrify' | 'silence' | 'burn' | 'poison' | 'bleed' | 'buff-up' | 'buff-down'
  // stats
  | 'hp' | 'atk' | 'def' | 'spd' | 'power'
  // ui
  | 'star' | 'star-empty' | 'lock' | 'unlock' | 'settings' | 'plus' | 'close' | 'back' | 'info'
  | 'speed' | 'skip' | 'chest' | 'trophy' | 'team' | 'bag' | 'mail' | 'chat' | 'quest' | 'auto' | 'swords';

/** Clickable buildings in the town hub. Locked ones show "Yakında" in the UI. */
export type TownBuildingId = 'campaign' | 'summon' | 'tower' | 'heroes' | 'arena' | 'guild' | 'shop';

export type SpriteAnim = 'idle' | 'attack' | 'cast' | 'hit' | 'die' | 'victory';
export type SceneKind = 'cave' | 'forest' | 'ruins' | 'volcano' | 'tower' | 'void';
export type VfxKind =
  | 'slash' | 'arrow' | 'magic-bolt' | 'explosion' | 'aoe-wave' | 'heal' | 'buff' | 'debuff' | 'control' | 'dot' | 'death';

export interface Point { x: number; y: number }
