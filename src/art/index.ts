// Art facade: every visual asset in the game is generated in src/art (SVG/CSS/canvas) — no emoji, no copied art.
// The game renders on a 1280x720 landscape stage (SPEC §6); sizes are in stage px.
export * from './types';
export { heroSprite, setSpriteAnim, heroPortrait } from './characters';
export { icon, factionIconName } from './icons';
export { sceneBackground } from './scenes';
export { townScene, updateTownScene } from './town';
export { playVfx } from './vfx';
