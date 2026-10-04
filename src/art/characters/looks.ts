// Per-hero character design data. Every hero is an original design built from the hero's name,
// title and concept in src/data/heroes.ts; palettes follow the faction themes:
// shadow = violet/teal mist, fortress = gold/steel/blue, abyss = crimson/black/fire,
// forest = greens/browns/leaves, dark = black/purple/bone, light = white/gold/sky.
import type { Faction, HeroClass } from '../../core/types';
import type { HeroLook } from './model';

export interface FactionTheme {
  glow: string;
  trim: string;
  main: string;
  second: string;
  dark: string;
  /** Portrait backdrop: center, mid, edge. */
  bg: [string, string, string];
}

export const FACTION_THEME: Record<Faction, FactionTheme> = {
  shadow: { glow: '#8ef0ff', trim: '#c9b6ff', main: '#5a3f9e', second: '#2f8f9d', dark: '#2b2350', bg: ['#9d86f0', '#5b3f9e', '#1e1640'] },
  fortress: { glow: '#ffe27a', trim: '#f2c14e', main: '#2f63c4', second: '#d9dee8', dark: '#1f3566', bg: ['#9cc4ff', '#3a6ac8', '#14244a'] },
  abyss: { glow: '#ffb02e', trim: '#ff9a2e', main: '#c4302b', second: '#2a1a24', dark: '#1a0f14', bg: ['#ffb36a', '#c4382b', '#3a0c10'] },
  forest: { glow: '#b6ff6a', trim: '#c9e05a', main: '#4f9a3a', second: '#8a5a32', dark: '#2a4a20', bg: ['#c8f08a', '#4f9a3a', '#163a1c'] },
  dark: { glow: '#c77bff', trim: '#e8dcc0', main: '#3b2a52', second: '#1d1a26', dark: '#120e18', bg: ['#b78ae0', '#4a2f6e', '#140c20'] },
  light: { glow: '#fff3a0', trim: '#f2c14e', main: '#f7f3e8', second: '#7cc8ff', dark: '#c9a64a', bg: ['#fffbe0', '#f2cf6a', '#9a6a2a'] },
};

type LookDef = Omit<HeroLook, 'id'>;

const LOOKS: Record<string, LookDef> = {
  // ---------------------------------------------------------------- shadow
  ninni: {
    body: 'small', head: 'human', skin: '#fbd9c6', expr: 'sleepy', mouth: 'smile', eye: '#8a6cff', blush: true,
    hair: { style: 'bob', color: '#b8a2ff' },
    hats: ['nightcap'], hat: '#4b3a9a', hat2: '#ffe9a0',
    outfit: 'robe', cloth: '#6a52c4', cloth2: '#9be7f0', trim: '#c9b6ff',
    pose: 'staff', weapon: 'moon-staff', wood: '#e8dcff',
    glow: '#a6f4ff', ornate: 0,
  },
  batur: {
    body: 'normal', head: 'human', skin: '#e8b694', expr: 'brave', eye: '#4de0e8',
    hair: { style: 'short', color: '#2c2448' },
    hats: ['helm-bat'], hat2: '#c9b6ff',
    outfit: 'plate', cloth: '#4a3a86', cloth2: '#2b2350', trim: '#7fd8e0', metal: '#7280a8',
    pose: 'onehand', weapon: 'bat-axe', blade: '#d6ecf2', wood: '#3a2f5a',
    back: ['wings-bat'], backColor: '#4a3a86',
    glow: '#8ef0ff', ornate: 1,
  },
  sisgoz: {
    body: 'small', head: 'owl', skin: '#6d8fa6', skin2: '#e8f0f4', expr: 'brave', eye: '#ffd23a',
    outfit: 'cloak', cloth: '#35586e', cloth2: '#5a3f9e', trim: '#c9b6ff', boots: '#e89a3a', hand: '#e89a3a',
    pose: 'bow', weapon: 'bow', wood: '#3a2f5a',
    back: ['quiver'],
    glow: '#8ef0ff', ornate: 2,
  },
  aycalan: {
    body: 'normal', head: 'human', skin: '#f6d5c8', expr: 'calm', mouth: 'smirk', eye: '#5ae6f0', ear: 'none',
    hair: { style: 'long', color: '#3a2a6e' },
    hats: ['witch'], hat: '#2b2350', hat2: '#5ad0e0',
    outfit: 'robe', cloth: '#4b3594', cloth2: '#2b2350', trim: '#c9b6ff',
    pose: 'staff', weapon: 'eclipse-staff', wood: '#2b2350',
    back: ['cape'], backColor: '#2b2350',
    glow: '#8ef0ff', aura: true, particles: 'motes', ornate: 3,
  },
  karayel: {
    body: 'normal', head: 'human', skin: '#b98f7a', expr: 'glow', eye: '#8ef0ff', ear: 'none',
    hats: ['hood', 'mask'], hat: '#2e2552', hat2: '#3f3474',
    outfit: 'ninja', cloth: '#2e2552', cloth2: '#5a3f9e', trim: '#2f9fad', hand: '#1e1838', boots: '#1e1838',
    pose: 'daggers', weapon: 'dagger', offhand: 'dagger', blade: '#d8f6ff',
    back: ['scarf'], backColor: '#7a52d6',
    glow: '#8ef0ff', aura: true, particles: 'wisps', ornate: 3,
  },
  // -------------------------------------------------------------- fortress
  tilki: {
    body: 'small', head: 'fox', skin: '#f08a3a', skin2: '#fff4e6', expr: 'sly', eye: '#2fbf6a',
    outfit: 'tunic', cloth: '#2f63c4', cloth2: '#d9dee8', trim: '#f2c14e', hand: '#5a3a2a', boots: '#3a4a7a',
    pose: 'daggers', weapon: 'dagger',
    back: ['tail-fox', 'scarf'], backColor: '#f2c14e',
    glow: '#ffe27a', ornate: 0,
  },
  barutcu: {
    body: 'heavy', head: 'human', skin: '#f0b48a', expr: 'brave', mouth: 'grin', eye: '#3a6ad0',
    hair: { style: 'short', color: '#c8642a' }, beard: { style: 'full', color: '#c8642a' },
    hats: ['goggles'], hat: '#7a4a2a',
    outfit: 'apron', cloth: '#2f63c4', cloth2: '#d9dee8', trim: '#c99a4a',
    pose: 'hold', weapon: 'bomb',
    back: ['barrel'], wood: '#8a5a32',
    glow: '#ffd23a', ornate: 1,
  },
  selvinur: {
    body: 'normal', head: 'human', skin: '#fde0cc', expr: 'calm', eye: '#3a8ae0', blush: true, ear: 'none',
    hair: { style: 'bob', color: '#f2d27a' },
    hats: ['bell-veil'], hat: '#f4f6ff', hat2: '#2f63c4',
    outfit: 'robe', cloth: '#f4f6ff', cloth2: '#2f63c4', trim: '#f2c14e',
    pose: 'staff', weapon: 'bell-staff', wood: '#f4f6ff',
    glow: '#ffe27a', particles: 'motes', ornate: 2,
  },
  kartal_ece: {
    body: 'normal', head: 'human', skin: '#f0c4a0', expr: 'brave', mouth: 'smirk', eye: '#e0a030',
    hair: { style: 'ponytail', color: '#6a3a22' },
    hats: ['helm-eagle'],
    outfit: 'plate', cloth: '#2f63c4', cloth2: '#2f63c4', trim: '#f2c14e', metal: '#e3e9f3',
    pose: 'crossbow', weapon: 'crossbow', wood: '#6a3a22', blade: '#e3e9f3',
    back: ['wings-eagle'], backColor: '#9a6a3a',
    glow: '#ffe27a', aura: true, particles: 'feathers', ornate: 3,
  },
  demirkol: {
    body: 'heavy', head: 'human', skin: '#e8b694', expr: 'glow', eye: '#ffe27a',
    hats: ['helm-great'], hat: '#2f63c4', hat2: '#f2c14e',
    outfit: 'plate', cloth: '#2f63c4', cloth2: '#1f3566', trim: '#f2c14e', metal: '#cdd6e6',
    pose: 'guard', weapon: 'mace', offhand: 'shield-tower', blade: '#e3e9f3',
    back: ['cape'], backColor: '#2f63c4',
    glow: '#ffe27a', aura: true, particles: 'motes', ornate: 3,
  },
  // ----------------------------------------------------------------- abyss
  cakmak: {
    body: 'small', head: 'human', skin: '#e8604a', expr: 'fierce', eye: '#ffd23a', ear: 'pointy',
    hair: { style: 'spiky', color: '#2a1a24' },
    hats: ['horns-small'], hat: '#3a2430',
    outfit: 'leather', cloth: '#6a2a2a', cloth2: '#2a1a24', trim: '#ff9a2e',
    pose: 'bow', weapon: 'bow', wood: '#3a2430',
    back: ['quiver', 'tail-devil'],
    glow: '#ffb02e', ornate: 0,
  },
  alevnur: {
    body: 'normal', head: 'human', skin: '#f0bf98', expr: 'calm', mouth: 'smile', eye: '#ff8a2e', blush: true,
    hair: { style: 'flame', color: '#e8402a', tip: '#ffd25a' },
    hats: ['ember-tiara'],
    outfit: 'robe', cloth: '#b8302a', cloth2: '#2a1a24', trim: '#ff9a2e',
    pose: 'staff', weapon: 'lantern-staff', wood: '#3a2430',
    glow: '#ffb02e', ornate: 1,
  },
  semender: {
    body: 'normal', head: 'lizard', skin: '#e8562a', skin2: '#ffd27a', expr: 'fierce', eye: '#ffe14a',
    outfit: 'scales', cloth: '#2a1a24', cloth2: '#c8462a', trim: '#ff9a2e', boots: '#c8462a',
    pose: 'daggers', weapon: 'kris', offhand: 'kris', blade: '#8a7a84',
    back: ['tail-lizard'],
    glow: '#ffb02e', particles: 'embers', ornate: 2,
  },
  kozhan: {
    body: 'heavy', head: 'rock', skin: '#3d2c33', expr: 'glow', eye: '#ffb02e',
    hats: ['flame-crown'],
    outfit: 'rock', cloth: '#3d2c33', cloth2: '#2a1e24', trim: '#ff9a2e', boots: '#2a1e24', hand: '#3d2c33',
    pose: 'staff', weapon: 'magma-staff',
    back: ['cape'], backColor: '#b8302a',
    glow: '#ffb02e', aura: true, particles: 'embers', ornate: 3,
  },
  kizilboynuz: {
    body: 'heavy', head: 'demon', skin: '#d8402e', expr: 'glow', eye: '#ffd23a',
    hats: ['horns-big'],
    outfit: 'plate', cloth: '#2a1a24', cloth2: '#2a1a24', trim: '#ff9a2e', metal: '#4e3e48', hand: '#d8402e',
    pose: 'shoulder', weapon: 'great-axe', blade: '#5a4a55',
    glow: '#ffb02e', aura: true, particles: 'embers', ornate: 3,
  },
  // ---------------------------------------------------------------- forest
  gobelek: {
    body: 'small', head: 'mushroom', skin: '#f6dcc0', expr: 'cute', eye: '#3a8a4a', blush: true,
    hats: ['mushroom-cap'], hat: '#d8402e', hat2: '#fff6e8',
    outfit: 'robe', cloth: '#6a8a3a', cloth2: '#8a5a32', trim: '#c9e05a',
    pose: 'staff', weapon: 'spore-staff', wood: '#8a5a32',
    glow: '#b6ff6a', ornate: 0,
  },
  sarmasik: {
    body: 'normal', head: 'human', skin: '#bfe0a6', expr: 'sly', eye: '#ffe14a', ear: 'none',
    hats: ['snake-hood', 'mask'], hat: '#3f8a3a', hat2: '#2a5a28',
    outfit: 'ninja', cloth: '#3f8a3a', cloth2: '#8a5a32', trim: '#c9e05a', hand: '#2a4a20', boots: '#4a3a22',
    pose: 'daggers', weapon: 'sickle', offhand: 'dagger', blade: '#d8e8c8', wAngle: 52,
    glow: '#b6ff6a', ornate: 1,
  },
  meseyurek: {
    body: 'heavy', head: 'bear', skin: '#8a5a32', skin2: '#d8b080', expr: 'angry', eye: '#2a1a12',
    outfit: 'plate', cloth: '#5a7a2a', cloth2: '#4a3a22', trim: '#c9e05a', metal: '#a8784a', boots: '#5a3a22', hand: '#8a5a32',
    pose: 'guard', weapon: 'club', offhand: 'shield-wood', wood: '#8a5a32',
    glow: '#b6ff6a', ornate: 2,
  },
  dikenok: {
    body: 'normal', head: 'human', skin: '#f0c8a0', expr: 'brave', mouth: 'smile', eye: '#3ac05a', ear: 'pointy',
    hair: { style: 'long', color: '#4a7a3a' },
    hats: ['antlers'], hat: '#b08050',
    outfit: 'cloak', cloth: '#5a8a3a', cloth2: '#3f6a2a', trim: '#c9e05a',
    pose: 'bow', weapon: 'thorn-bow', wood: '#7a4e2e',
    back: ['quiver'],
    glow: '#b6ff6a', aura: true, particles: 'leaves', ornate: 3,
  },
  kokbilge: {
    body: 'heavy', head: 'tree', skin: '#8a6a4a', expr: 'glow', eye: '#b6ff6a',
    beard: { style: 'moss', color: '#6a9a3a' },
    hats: ['leaf-crown'], hat: '#5aa83a', hat2: '#ffb0d0',
    outfit: 'bark', cloth: '#7a5a3a', cloth2: '#5a8a3a', trim: '#c9e05a', hand: '#7a5a3a',
    pose: 'staff', weapon: 'branch-staff', wood: '#6a4a2a',
    glow: '#b6ff6a', aura: true, particles: 'leaves', ornate: 3,
  },
  // ------------------------------------------------------------------ dark
  karaca_baci: {
    body: 'small', head: 'human', skin: '#e8c4b0', expr: 'old', eye: '#8a6aaa',
    hair: { style: 'wisps', color: '#d8d4e0' },
    hats: ['headscarf'], hat: '#4a3266', hat2: '#e8dcc0',
    outfit: 'robe', cloth: '#3b2a52', cloth2: '#5a4a6a', trim: '#e8dcc0',
    pose: 'hold', weapon: 'urn', blade: '#e8dcc0',
    back: ['wisp'],
    glow: '#d49bff', ornate: 0,
  },
  kara_akrep: {
    body: 'normal', head: 'human', skin: '#b8a8c8', expr: 'angry', mouth: 'frown', eye: '#ff5ad0',
    hair: { style: 'short', color: '#1d1a26' },
    hats: ['carapace'], hat: '#3b2a52',
    outfit: 'carapace', cloth: '#3b2a52', cloth2: '#1d1a26', trim: '#e8dcc0',
    pose: 'crossbow', weapon: 'crossbow', wood: '#2a1e2e', blade: '#e8dcc0',
    back: ['tail-scorpion'], backColor: '#3b2a52',
    glow: '#ff5ad0', ornate: 1,
  },
  zifir: {
    body: 'normal', head: 'human', skin: '#ece2f4', expr: 'sly', eye: '#c77bff', ear: 'none',
    hair: { style: 'long', color: '#f0ecf8' },
    hats: ['spider-hood'], hat: '#2a2238',
    outfit: 'robe', cloth: '#2a2238', cloth2: '#6a3a8a', trim: '#c77bff',
    pose: 'staff', weapon: 'web-staff', wood: '#1d1a26',
    back: ['spider-legs'], backColor: '#4a3a6a',
    glow: '#d07bff', ornate: 2,
  },
  kefen: {
    body: 'ghost', head: 'shroud', skin: '#e8e4f4', expr: 'glow', eye: '#b07bff',
    outfit: 'shroud', cloth: '#d8d2ec', cloth2: '#2a1a40', trim: '#8a7aa0', hand: '#d8d2ec',
    pose: 'claws', weapon: 'claws', offhand: 'claws', blade: '#efe6ff',
    glow: '#b07bff', aura: true, particles: 'wisps', ornate: 3,
  },
  kemikkiran: {
    body: 'heavy', head: 'skull', skin: '#efe3c8', expr: 'glow', eye: '#c77bff',
    hats: ['bone-crown'], hat: '#efe3c8',
    outfit: 'plate', cloth: '#3b2a52', cloth2: '#1d1a26', trim: '#e8dcc0', metal: '#4e3e6a', hand: '#efe3c8',
    pose: 'twohand', weapon: 'greatsword', blade: '#efe3c8',
    back: ['cape'], backColor: '#5a2a6a',
    glow: '#c77bff', aura: true, particles: 'wisps', ornate: 3,
  },
  // ----------------------------------------------------------------- light
  arslan: {
    body: 'normal', head: 'lion', skin: '#f2c35a', skin2: '#fff1d0', expr: 'brave', eye: '#c0602a',
    hair: { style: 'none', color: '#c8682a' },
    outfit: 'plate', cloth: '#f7f3e8', cloth2: '#7cc8ff', trim: '#f2c14e', metal: '#f4f1e6', hand: '#f2c35a',
    pose: 'guard', weapon: 'sword', offhand: 'shield-round', blade: '#e8eef7',
    back: ['tail-lion'],
    glow: '#fff3a0', ornate: 0,
  },
  akkanat: {
    body: 'normal', head: 'human', skin: '#fde0cc', expr: 'brave', mouth: 'smile', eye: '#3aa0e0', blush: true,
    hair: { style: 'ponytail', color: '#f8dc7a' },
    hats: ['feather-band'],
    outfit: 'tunic', cloth: '#f7f3e8', cloth2: '#7cc8ff', trim: '#f2c14e',
    pose: 'bow', weapon: 'bow', wood: '#f2c14e',
    back: ['wings-feather'], backColor: '#ffffff',
    glow: '#fff3a0', ornate: 1,
  },
  simsek: {
    body: 'normal', head: 'human', skin: '#f0c4a0', expr: 'fierce', mouth: 'grin', eye: '#3ad0ff',
    hair: { style: 'wild', color: '#fff6c0' },
    hats: ['visor'],
    outfit: 'ninja', cloth: '#f7f3e8', cloth2: '#3a8ad6', trim: '#f2c14e', boots: '#3a8ad6',
    pose: 'daggers', weapon: 'zap-dagger', offhand: 'zap-dagger',
    back: ['scarf'], backColor: '#3ad0ff',
    glow: '#fff06a', particles: 'sparks', ornate: 2,
  },
  yildizhan: {
    body: 'normal', head: 'human', skin: '#f0c8a8', expr: 'old', eye: '#3a6ad0',
    hair: { style: 'long', color: '#f4f4ff' }, beard: { style: 'long', color: '#f4f4ff' },
    hats: ['wizard'], hat: '#2a3a8a', hat2: '#f2c14e',
    outfit: 'robe', cloth: '#2a3a8a', cloth2: '#f7f3e8', trim: '#f2c14e',
    pose: 'staff', weapon: 'star-staff', wood: '#8a6a4a',
    back: ['cape'], backColor: '#1d2a6a',
    glow: '#fff3a0', aura: true, particles: 'stars', ornate: 3,
  },
  tanyeri: {
    body: 'normal', head: 'human', skin: '#fde0cc', expr: 'calm', mouth: 'smile', eye: '#ff7a4a', blush: true, ear: 'none',
    hair: { style: 'long', color: '#ffae72' },
    hats: ['sun-halo', 'circlet'], hat2: '#f2c14e',
    outfit: 'robe', cloth: '#fff8ee', cloth2: '#ffb0a0', trim: '#f2c14e',
    pose: 'staff', weapon: 'sun-staff', wood: '#f2c14e',
    back: ['wings-light'], backColor: '#fff3d0',
    glow: '#ffe27a', aura: true, particles: 'motes', ornate: 3,
  },
};

/** Hero ids that have a hand-made look. */
export const LOOK_IDS: readonly string[] = Object.keys(LOOKS);

/** Generic look for heroes without a dedicated design (e.g. test fixtures). */
function fallbackLook(id: string, faction: Faction, cls: HeroClass, rarity: number): HeroLook {
  const t = FACTION_THEME[faction];
  const ornate = Math.max(0, Math.min(3, rarity - 2));
  const base: HeroLook = {
    id, body: 'normal', head: 'human', skin: '#f0c4a0', expr: 'brave', eye: t.glow,
    hair: { style: 'short', color: '#4a3a2a' },
    outfit: 'tunic', cloth: t.main, cloth2: t.dark, trim: t.trim,
    pose: 'onehand', weapon: 'sword', glow: t.glow, ornate,
  };
  switch (cls) {
    case 'warrior':
      return { ...base, outfit: 'plate', pose: 'guard', weapon: 'sword', offhand: 'shield-round', metal: '#cdd6e6' };
    case 'mage':
      return { ...base, outfit: 'robe', pose: 'staff', weapon: 'eclipse-staff', hats: ['witch'], hat: t.dark, expr: 'calm' };
    case 'ranger':
      return { ...base, outfit: 'cloak', pose: 'bow', weapon: 'bow', back: ['quiver'] };
    case 'assassin':
      return { ...base, outfit: 'ninja', pose: 'daggers', weapon: 'dagger', offhand: 'dagger', hats: ['hood', 'mask'], hat: t.dark, hat2: t.main, expr: 'glow' };
    case 'priest':
      return { ...base, outfit: 'robe', pose: 'staff', weapon: 'sun-staff', hats: ['halo'], expr: 'calm', mouth: 'smile' };
  }
}

export function lookFor(id: string, def?: { faction: Faction; heroClass: HeroClass; rarity: number }): HeroLook {
  const l = LOOKS[id];
  if (l) return { ...l, id };
  return fallbackLook(id, def?.faction ?? 'fortress', def?.heroClass ?? 'warrior', def?.rarity ?? 2);
}
