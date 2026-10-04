// Persistent painted backdrop for a screen: the art scene is only rebuilt when its kind changes (scenes are
// large SVGs, a screen re-render must not rebuild them).
import { sceneBackground, type SceneKind } from '../art';
import { h } from './dom';

export interface Backdrop {
  readonly el: HTMLElement;
  set(kind: SceneKind): void;
}

export function createBackdrop(extraClass?: string): Backdrop {
  const el = h('div', { class: ['backdrop', extraClass], attrs: { 'aria-hidden': 'true' } });
  let current: SceneKind | null = null;
  return {
    el,
    set(kind: SceneKind): void {
      if (kind === current) return;
      current = kind;
      try {
        el.replaceChildren(sceneBackground(kind), h('div', { class: 'backdrop-shade' }));
      } catch (err) {
        console.warn('scene failed', kind, err);
        el.replaceChildren(h('div', { class: 'backdrop-shade' }));
      }
    },
  };
}

const CHAPTER_SCENES: readonly SceneKind[] = ['forest', 'ruins', 'cave', 'volcano', 'cave', 'ruins', 'forest', 'volcano', 'void', 'void'];

/** Painted scene of a campaign chapter (cycles after the list ends). */
export function chapterScene(chapter: number): SceneKind {
  return CHAPTER_SCENES[(Math.max(1, Math.floor(chapter)) - 1) % CHAPTER_SCENES.length];
}
