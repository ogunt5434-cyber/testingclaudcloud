// Procedural chibi characters: look data coverage and SVG builders (pure strings, no DOM needed).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANIM_MS, heroPortraitMarkup, heroSpriteMarkup, heroSpriteMetrics, LOOK_IDS, lookFor } from '../src/art/characters';
import { playSpriteAnim } from '../src/art/characters/anim';
import { buildFigure } from '../src/art/characters/build';
import { UID } from '../src/art/characters/pen';
import { HEROES } from '../src/data/heroes';

const EMOJI = /\p{Extended_Pictographic}/u;

function ids(markup: string): string[] {
  return [...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}

describe('hero looks', () => {
  it('every hero has a hand-made look and there are no orphan looks', () => {
    const heroIds = HEROES.map((h) => h.id).sort();
    expect([...LOOK_IDS].sort()).toEqual(heroIds);
  });

  it('looks are distinct (species / headgear / weapon / outfit combination)', () => {
    const sigs = HEROES.map((h) => {
      const l = lookFor(h.id);
      return [l.head, (l.hats ?? []).join('+'), l.weapon, l.offhand, l.outfit, (l.back ?? []).join('+'), l.hair?.style].join('|');
    });
    expect(new Set(sigs).size).toBe(HEROES.length);
  });

  it('rarer heroes get more ornament (aura on every 5-star, none on 2-star)', () => {
    for (const h of HEROES) {
      const l = lookFor(h.id);
      expect(l.ornate, h.id).toBe(h.rarity - 2);
      if (h.rarity === 5) expect(l.aura, h.id).toBe(true);
      if (h.rarity === 2) expect(l.aura ?? false, h.id).toBe(false);
    }
  });

  it('falls back to a generic look for unknown heroes (e.g. test fixtures)', () => {
    const l = lookFor('fixture_x', { faction: 'abyss', heroClass: 'mage', rarity: 4 });
    expect(l.id).toBe('fixture_x');
    expect(l.pose).toBe('staff');
    expect(() => buildFigure(l)).not.toThrow();
    expect(heroSpriteMarkup('totally_unknown_hero')).toContain('hs-fig');
  });
});

describe('sprite markup', () => {
  it.each(HEROES.map((h) => h.id))('%s builds a well-formed animatable sprite', (id) => {
    const svg = heroSpriteMarkup(id);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 160 200"');
    for (const cls of ['hs-shadow', 'hs-fig', 'hs-up', 'hs-head', 'hs-torso', 'hs-armn', 'hs-armf', 'hs-glow', 'hs-fx']) {
      expect(svg, cls).toContain(`class="${cls}`);
    }
    // balanced groups and no leftover placeholder
    expect((svg.match(/<g[\s>]/g) ?? []).length).toBe((svg.match(/<\/g>/g) ?? []).length);
    expect(svg).not.toContain(UID);
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    // ids unique, every url(#...) reference resolves
    const all = ids(svg);
    expect(new Set(all).size).toBe(all.length);
    for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) expect(all, ref[1]).toContain(ref[1]);
    expect(EMOJI.test(svg)).toBe(false);
  });

  it('instances get unique ids so many sprites can share a document', () => {
    const a = ids(heroSpriteMarkup('aycalan'));
    const b = ids(heroSpriteMarkup('aycalan'));
    expect(a.length).toBeGreaterThan(5);
    expect(a.some((x) => b.includes(x))).toBe(false);
  });

  it('facing left mirrors the svg', () => {
    expect(heroSpriteMarkup('arslan', 'left')).toContain('class="hs-svg hs-flip"');
    expect(heroSpriteMarkup('arslan', 'right')).not.toContain('hs-flip');
  });

  it('portraits are square bust crops of the same figure', () => {
    for (const h of HEROES) {
      const svg = heroPortraitMarkup(h.id);
      const vb = /viewBox="([^"]+)"/.exec(svg)?.[1].split(' ').map(Number) ?? [];
      expect(vb).toHaveLength(4);
      expect(vb[2]).toBeCloseTo(vb[3], 5);
      expect(vb[2]).toBeGreaterThan(60);
      expect(vb[2]).toBeLessThan(120);
      expect(svg).toContain('hs-head');
    }
  });

  it('reports head metrics inside the sprite box', () => {
    for (const h of HEROES) {
      const m = heroSpriteMetrics(h.id);
      expect(m.feetY).toBe(192);
      expect(m.headTop, h.id).toBeGreaterThan(40);
      expect(m.headTop, h.id).toBeLessThan(m.headCenter[1]);
      expect(m.headCenter[1], h.id).toBeLessThan(150);
      expect(m.headCenter[0], h.id).toBeGreaterThan(60);
      expect(m.headCenter[0], h.id).toBeLessThan(100);
    }
    // small heroes stand shorter than heavy ones
    expect(heroSpriteMetrics('ninni').headTop).toBeGreaterThan(heroSpriteMetrics('demirkol').headTop);
  });

  it('caches figures (same markup modulo instance ids)', () => {
    const strip = (s: string) => s.replace(/-[0-9a-z]+(?=[")])/g, '');
    expect(strip(heroSpriteMarkup('kefen'))).toBe(strip(heroSpriteMarkup('kefen')));
  });
});

describe('sprite animations', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the contract durations', () => {
    expect(ANIM_MS).toEqual({ attack: 450, cast: 600, hit: 250, die: 700, victory: 800 });
  });

  function fakeSprite(): HTMLElement {
    return { dataset: { anim: 'idle', attack: 'melee', pose: 'guard' }, querySelectorAll: () => [], querySelector: () => null } as unknown as HTMLElement;
  }

  it('one-shots resolve and return to idle; die stays down', async () => {
    vi.useFakeTimers();
    const el = fakeSprite();
    const hit = playSpriteAnim(el, 'hit');
    expect(el.dataset.anim).toBe('hit');
    vi.advanceTimersByTime(ANIM_MS.hit + 50);
    await hit;
    expect(el.dataset.anim).toBe('idle');

    const die = playSpriteAnim(el, 'die');
    vi.advanceTimersByTime(ANIM_MS.die + 50);
    await die;
    expect(el.dataset.anim).toBe('die');
  });

  it('a new animation interrupts (and resolves) the previous one', async () => {
    vi.useFakeTimers();
    const el = fakeSprite();
    let firstDone = false;
    const first = playSpriteAnim(el, 'victory').then(() => {
      firstDone = true;
    });
    const second = playSpriteAnim(el, 'attack');
    await first;
    expect(firstDone).toBe(true);
    expect(el.dataset.anim).toBe('attack');
    vi.advanceTimersByTime(ANIM_MS.attack + 50);
    await second;
    expect(el.dataset.anim).toBe('idle');
  });

  it('every sprite carries the groups the animation planner targets', () => {
    for (const h of HEROES) {
      const svg = heroSpriteMarkup(h.id);
      // transform origins are given for every animated group
      for (const cls of ['hs-fig', 'hs-armn', 'hs-armf', 'hs-head', 'hs-torso']) {
        expect(svg, `${h.id} ${cls}`).toMatch(new RegExp(`class="${cls}"[^>]*style="transform-origin:[\\d.]+px [\\d.]+px"`));
      }
    }
  });
});
