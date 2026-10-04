// Environment art (icons, battle scenes, town hub, VFX): pure string builders, no DOM needed.
import { describe, expect, it } from 'vitest';
import type { Faction } from '../src/core/types';
import type { IconName, SceneKind, TownBuildingId, VfxKind } from '../src/art/types';
import { FACTION_COLOR, ICON_BUILDERS, ICON_NAMES, iconMarkup } from '../src/art/env/iconArt';
import { factionIconName } from '../src/art/icons';
import { hasEmoji, Ids } from '../src/art/env/kit';
import { Art } from '../src/art/env/props';
import { buildScene, SCENE_KINDS } from '../src/art/env/sceneArt';
import { cloudSvg, TOWN_BUILDINGS, townBackdrop } from '../src/art/env/townArt';
import { playVfx, VFX_KINDS } from '../src/art/vfx';
import envCss from '../src/art/env.css?raw';

// Type-level exhaustiveness: these objects fail to compile if a union member is missing or unknown.
const ALL_ICONS: Record<IconName, true> = {
  gold: true, spirit: true, gem: true, basicScroll: true, heroicScroll: true, playerExp: true,
  'faction-shadow': true, 'faction-fortress': true, 'faction-abyss': true, 'faction-forest': true, 'faction-dark': true, 'faction-light': true,
  'class-warrior': true, 'class-mage': true, 'class-ranger': true, 'class-assassin': true, 'class-priest': true,
  weapon: true, armor: true, helmet: true, boots: true,
  stun: true, freeze: true, petrify: true, silence: true, burn: true, poison: true, bleed: true, 'buff-up': true, 'buff-down': true,
  hp: true, atk: true, def: true, spd: true, power: true,
  star: true, 'star-empty': true, lock: true, unlock: true, settings: true, plus: true, close: true, back: true, info: true,
  speed: true, skip: true, chest: true, trophy: true, team: true, bag: true, mail: true, chat: true, quest: true, auto: true, swords: true,
};
const ALL_SCENES: Record<SceneKind, true> = { cave: true, forest: true, ruins: true, volcano: true, tower: true, void: true };
const ALL_BUILDINGS: Record<TownBuildingId, string> = {
  campaign: 'Sefer Kapısı',
  summon: 'Yıldız Sunağı',
  tower: 'Kadim Kule',
  heroes: 'Kahramanlar Salonu',
  arena: 'Arena',
  guild: 'Lonca',
  shop: 'Pazar',
};
const ALL_VFX: Record<VfxKind, true> = {
  slash: true, arrow: true, 'magic-bolt': true, explosion: true, 'aoe-wave': true, heal: true, buff: true, debuff: true, control: true, dot: true, death: true,
};
const FACTIONS: Faction[] = ['shadow', 'fortress', 'abyss', 'forest', 'dark', 'light'];

/** Every url(#id) / href="#id" reference must point at an id defined in `defs` (same document). */
function danglingRefs(markup: string, defs = markup): string[] {
  const defined = new Set([...defs.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const refs = [...markup.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
  return refs.filter((r) => !defined.has(r));
}

function duplicateIds(markup: string): string[] {
  const seen = new Set<string>();
  const dup: string[] = [];
  for (const m of markup.matchAll(/\sid="([^"]+)"/g)) {
    if (seen.has(m[1])) dup.push(m[1]);
    seen.add(m[1]);
  }
  return dup;
}

describe('icons', () => {
  it('implements every IconName exactly once', () => {
    expect([...ICON_NAMES].sort()).toEqual(Object.keys(ALL_ICONS).sort());
    for (const name of ICON_NAMES) expect(typeof ICON_BUILDERS[name]).toBe('function');
  });

  it('builds standalone, emoji-free SVG with resolvable, instance-scoped ids', () => {
    for (const name of ICON_NAMES) {
      const svg = iconMarkup(name, 32, 'tst1');
      expect(svg.startsWith('<svg'), name).toBe(true);
      expect(svg).toContain('viewBox="0 0 64 64"');
      expect(svg).toContain('width="32"');
      expect(hasEmoji(svg), name).toBe(false);
      expect(danglingRefs(svg), name).toEqual([]);
      expect(duplicateIds(svg), name).toEqual([]);
      for (const m of svg.matchAll(/\sid="([^"]+)"/g)) expect(m[1].startsWith('tst1-'), `${name}: ${m[1]}`).toBe(true);
    }
  });

  it('gives two instances disjoint ids', () => {
    const a = iconMarkup('gold', 24, 'one');
    const b = iconMarkup('gold', 24, 'two');
    const ids = (s: string): string[] => [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(a).some((id) => ids(b).includes(id))).toBe(false);
  });

  it('maps every faction to its emblem and a color', () => {
    for (const f of FACTIONS) {
      expect(factionIconName(f)).toBe(`faction-${f}`);
      expect(FACTION_COLOR[f].glow).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('battle scenes', () => {
  it('defines all six kinds', () => {
    expect([...SCENE_KINDS].sort()).toEqual(Object.keys(ALL_SCENES).sort());
  });

  it('builds layered, emoji-free scenes whose references resolve', () => {
    for (const kind of SCENE_KINDS) {
      const art = buildScene(kind, 'scn');
      expect(art.back.length, kind).toBeGreaterThan(1000);
      expect(art.front.length, kind).toBeGreaterThan(1000);
      expect(art.motes.length, kind).toBeGreaterThan(0);
      const all = art.defs + art.back + art.front + art.spins.map((s) => s.svg).join('');
      expect(hasEmoji(all), kind).toBe(false);
      expect(danglingRefs(all), kind).toEqual([]);
      expect(duplicateIds(all), kind).toEqual([]);
      expect(art.base).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('is deterministic per kind', () => {
    expect(buildScene('cave', 'x').front).toBe(buildScene('cave', 'x').front);
  });
});

describe('town', () => {
  it('defines all seven buildings with their Turkish labels', () => {
    expect(TOWN_BUILDINGS.map((b) => b.id).sort()).toEqual(Object.keys(ALL_BUILDINGS).sort());
    for (const b of TOWN_BUILDINGS) expect(b.label).toBe(ALL_BUILDINGS[b.id]);
  });

  it('keeps buildings inside the stage and labels clear of the HUD bands', () => {
    for (const b of TOWN_BUILDINGS) {
      expect(b.x, b.id).toBeGreaterThanOrEqual(90); // left HUD column
      expect(b.x + b.w, b.id).toBeLessThanOrEqual(1280);
      expect(b.y, b.id).toBeGreaterThanOrEqual(60); // only decorative tips may enter the top band
      const ribbonTop = b.y + b.ribbon.y;
      expect(ribbonTop, b.id).toBeGreaterThanOrEqual(80);
      expect(ribbonTop + 34, b.id).toBeLessThanOrEqual(610); // bottom HUD band
    }
  });

  it('keeps buildings apart: ribbons never overlap, boxes barely touch', () => {
    const list = TOWN_BUILDINGS;
    const ribbonRect = (b: (typeof list)[number]): [number, number, number, number] => {
      const w = b.label.length * (b.ribbon.big ? 11 : 9.5) + 60;
      return [b.x + b.ribbon.x - w / 2, b.y + b.ribbon.y, w, 34];
    };
    const inter = (p: [number, number, number, number], q: [number, number, number, number]): number =>
      Math.max(0, Math.min(p[0] + p[2], q[0] + q[2]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[1] + p[3], q[1] + q[3]) - Math.max(p[1], q[1]));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const p = list[i];
        const q = list[j];
        expect(inter(ribbonRect(p), ribbonRect(q)), `${p.id} vs ${q.id} ribbons`).toBe(0);
        const boxP: [number, number, number, number] = [p.x, p.y, p.w, p.h];
        const boxQ: [number, number, number, number] = [q.x, q.y, q.w, q.h];
        const smaller = Math.min(p.w * p.h, q.w * q.h);
        // Buttons only hit-test their painted shapes, so a sliver of overlapping empty box is harmless.
        expect(inter(boxP, boxQ) / smaller, `${p.id} vs ${q.id} boxes`).toBeLessThan(0.06);
      }
    }
  });

  it('draws emoji-free art whose references resolve', () => {
    const a = new Art(new Ids('twn'), 1);
    let markup = '';
    for (const b of TOWN_BUILDINGS) {
      markup += b.art(a) + (b.front ? b.front(a) : '');
      for (const o of b.overlays(a)) markup += o.html;
    }
    const bd = townBackdrop(a);
    markup += bd.sky + bd.land + bd.front + cloudSvg(1);
    const all = a.defs.join('') + markup;
    expect(hasEmoji(all)).toBe(false);
    expect(danglingRefs(all)).toEqual([]);
    expect(duplicateIds(all)).toEqual([]);
  });
});

describe('vfx', () => {
  it('lists every effect kind', () => {
    expect([...VFX_KINDS].sort()).toEqual(Object.keys(ALL_VFX).sort());
  });

  it('resolves (and does nothing) without a DOM', async () => {
    await expect(playVfx({} as HTMLElement, 'slash', { x: 0, y: 0 }, { x: 10, y: 0 })).resolves.toBeUndefined();
  });
});

describe('no emoji', () => {
  it('keeps the stylesheet emoji-free', () => {
    expect(hasEmoji(envCss)).toBe(false);
  });

  it('detects emoji (sanity check of the helper)', () => {
    expect(hasEmoji('Altın \u{1FA99}')).toBe(true);
    expect(hasEmoji('Yıldız Sunağı')).toBe(false);
  });
});
