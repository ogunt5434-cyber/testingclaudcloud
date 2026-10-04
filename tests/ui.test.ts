// Pure UI logic: number/time formatting, reward rows, battle replay model and playback pacing.
import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/core/battle/engine';
import { Game } from '../src/core/game';
import { affordableLevels, grantPlayerExp, levelUpCost, playerExpToNext, starUpHero } from '../src/core/progression';
import { newGameState } from '../src/core/save';
import { Rng } from '../src/core/rng';
import { toBattleUnit } from '../src/core/stats';
import type { BattleEvent, BattleUnitSetup, GameState, HeroInstance, UnitSnapshot } from '../src/core/types';
import { HEROES } from '../src/data/heroes';
import { BattleModel, refKey, replayAll } from '../src/ui/battle/model';
import { delayAfter, totalDuration } from '../src/ui/battle/timing';
import { progressBarWidth, rewardAmountText } from '../src/ui/components';
import { fmtBuff, fmtDuration, fmtNum, fmtPercent, fraction, hyphenateTr, plainText, rewardEntries, rewardSummary, SOFT_HYPHEN } from '../src/ui/format';
import { IDLE_BADGE_MS, levelUpGems, levelUpText, navBadges, saveNotice, starUpReady, starUpReadyUids } from '../src/ui/hints';
import { BLEED_ART_X, STAGE_H, STAGE_W, fitStage, stageBleed, toStagePoint } from '../src/ui/stage';
import { SLOT_BADGES, SLOT_LABELS } from '../src/ui/modals/formation';
import { bestStockTier } from '../src/ui/modals/heroEquipment';
import { towerBestText } from '../src/ui/screens/tower';
import indexHtml from '../index.html?raw';
import styleCss from '../src/style.css?raw';

describe('format', () => {
  it('formats compact numbers', () => {
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(999)).toBe('999');
    expect(fmtNum(9999)).toBe('9999');
    expect(fmtNum(12_345)).toBe('12.3K');
    expect(fmtNum(20_000)).toBe('20K');
    expect(fmtNum(123_456)).toBe('123K');
    expect(fmtNum(4_500_000)).toBe('4.5M');
    expect(fmtNum(1_250_000_000)).toBe('1.2B');
    expect(fmtNum(-15_500)).toBe('-15.5K');
    expect(fmtNum(Number.NaN)).toBe('0');
  });

  it('formats Turkish percents', () => {
    expect(fmtPercent(0.2)).toBe('%20');
    expect(fmtPercent(0.155)).toBe('%15.5');
    expect(fmtPercent(0.005, 2)).toBe('%0.5');
    expect(fmtPercent(0.095, 2)).toBe('%9.5');
    expect(fmtPercent(-0.1)).toBe('-%10');
  });

  it('formats durations as hh:mm:ss', () => {
    expect(fmtDuration(0)).toBe('00:00:00');
    expect(fmtDuration(3_725_000)).toBe('01:02:05');
    expect(fmtDuration(12 * 3_600_000)).toBe('12:00:00');
    expect(fmtDuration(-5)).toBe('00:00:00');
  });

  it('formats buffs with percent semantics for hp/atk/armor', () => {
    expect(fmtBuff('atk', 0.2)).toBe('+%20 Saldırı');
    expect(fmtBuff('spd', -15)).toBe('-15 Hız');
    expect(fmtBuff('crit', 0.1)).toBe('+%10 Kritik Şansı');
  });

  it('flattens rewards in a stable order and skips zero / unknown entries', () => {
    const rows = rewardEntries({
      resources: { gems: 20, gold: 500, spirit: 0 },
      playerExp: 35,
      equipment: { weapon_t3: 2, nonsense_t9: 1, boots_t1: 0 },
    });
    expect(rows.map((r) => r.key)).toEqual(['gold', 'gems', 'playerExp', 'weapon_t3']);
    expect(rows[3].color).toBeTruthy();
    expect(rewardEntries(null)).toEqual([]);
    expect(rewardSummary({ resources: { gold: 12_345, gems: 20 } })).toBe('12.3K Altın · 20 Yakut');
    // Rows carry art icon names (never emoji).
    expect(rows.map((r) => r.icon)).toEqual(['gold', 'gem', 'playerExp', 'weapon']);
  });

  it('strips pictographs from core messages shown in toasts', () => {
    expect(plainText('Yetersiz kopya: 2 adet 4★ Arslan gerekli.')).toBe('Yetersiz kopya: 2 adet 4 yıldızlı Arslan gerekli.');
    expect(plainText('Tekrar Dene ↻')).toBe('Tekrar Dene');
    expect(plainText('Toplandı: 12.3K Altın · 20 Yakut')).toBe('Toplandı: 12.3K Altın · 20 Yakut');
    // core messages use the resources' working names; the UI shows the display names
    expect(plainText('Yeterli altın veya ruh özü yok.')).toBe('Yeterli altın veya gök taşı yok.');
    expect(plainText('Yeterli kahraman parşömeni veya elmas yok.')).toBe('Yeterli kahraman parşömeni veya yakut yok.');
    expect(/\p{Extended_Pictographic}/u.test(plainText('Ateş 🔥 ☀️ hazır'))).toBe(false);
  });

  it('clamps fractions', () => {
    expect(fraction(5, 10)).toBe(0.5);
    expect(fraction(20, 10)).toBe(1);
    expect(fraction(1, 0)).toBe(0);
  });

  it('formats progress widths and reward chip amounts', () => {
    expect(progressBarWidth(0.5)).toBe('50%');
    expect(progressBarWidth(0.12345)).toBe('12.3%');
    expect(progressBarWidth(2)).toBe('100%');
    expect(progressBarWidth(Number.NaN)).toBe('0%');
    expect(rewardAmountText(12_345)).toBe('×12.3K');
  });

  it('hyphenates Turkish names at syllable boundaries so small cards can wrap them', () => {
    const shown = (name: string): string => hyphenateTr(name).split(SOFT_HYPHEN).join('-');
    expect(shown('Kızılboynuz')).toBe('Kı-zıl-boy-nuz');
    expect(shown('Karaca Bacı')).toBe('Ka-ra-ca Ba-cı');
    expect(shown('Meşeyürek')).toBe('Me-şe-yü-rek');
    expect(shown('Arslan')).toBe('Ars-lan');
    // never a single letter alone at either end of a word
    expect(shown('Alevnur')).toBe('Alev-nur');
    expect(shown('Kartal Ece')).toBe('Kar-tal Ece');
    for (const hero of HEROES) {
      const text = hyphenateTr(hero.name);
      expect(text.split(SOFT_HYPHEN).join('')).toBe(hero.name);
      for (const word of text.split(' ')) for (const part of word.split(SOFT_HYPHEN)) expect([...part].length, hero.name).toBeGreaterThanOrEqual(2);
    }
  });

  it('shows tower progress without "Kat 0" on a new save', () => {
    expect(towerBestText(0)).toBe('Henüz kat geçilmedi');
    expect(towerBestText(7)).toBe('En yüksek: Kat 7');
  });

  it('labels formation badges like the slots they sit in', () => {
    expect(SLOT_BADGES).toHaveLength(SLOT_LABELS.length);
    SLOT_LABELS.forEach((label, i) => {
      const [row, num] = label.split(' ');
      expect(SLOT_BADGES[i]).toBe(`${row === 'Ön' ? 'Ö' : 'A'}${num}`);
    });
  });
});

describe('progression hints', () => {
  it('announces account level-ups with the gems they granted', () => {
    const state = newGameState(0);
    const gemsBefore = state.resources.gems;
    const exp = playerExpToNext(1) + playerExpToNext(2) + 5;
    expect(grantPlayerExp(state, exp)).toBe(2);
    expect(levelUpGems(1, 3)).toBe(state.resources.gems - gemsBefore);
    expect(levelUpText(1, 3)).toBe(`Hesap seviyesi 3! +${state.resources.gems - gemsBefore} Yakut`);
    expect(levelUpText(3, 3)).toBeNull();
    expect(levelUpText(5, 1)).toBeNull();
    expect(levelUpGems(4, 4)).toBe(0);
  });

  it('marks exactly the heroes whose star-up would succeed', () => {
    const base = newGameState(0);
    const heroId = HEROES.find((def) => def.rarity === 3)?.id ?? HEROES[0].id;
    const copy = (uid: string, level: number, extra: Partial<HeroInstance> = {}): HeroInstance => ({
      uid,
      heroId,
      level,
      stars: 3,
      equipment: {},
      locked: false,
      ...extra,
    });
    const make = (heroes: HeroInstance[], formation: (string | null)[] = base.formation): GameState => ({
      ...base,
      heroes: [...base.heroes, ...heroes],
      formation: [...formation],
    });
    const check = (state: GameState): void => {
      for (const hero of state.heroes) {
        const trial: GameState = structuredClone(state);
        const ok = starUpHero(trial, hero.uid).ok;
        expect(starUpReady(state, hero), `${hero.uid}`).toBe(ok);
        expect(starUpReadyUids(state).has(hero.uid)).toBe(ok);
      }
    };
    // level 60/60 3★ hero + 3 eligible copies -> ready (the copies are below the cap -> not ready)
    const ready = make([copy('t0', 60), copy('t1', 1), copy('t2', 1), copy('t3', 1)]);
    expect([...starUpReadyUids(ready)]).toEqual(['t0']);
    check(ready);
    // not at the level cap
    check(make([copy('t0', 59), copy('t1', 1), copy('t2', 1)]));
    expect(starUpReadyUids(make([copy('t0', 59), copy('t1', 1), copy('t2', 1)])).size).toBe(0);
    // copies locked / in the team do not count
    const blocked = make([copy('t0', 60), copy('t1', 1, { locked: true }), copy('t2', 1)], ['t2', null, null, null, null, null]);
    expect(starUpReadyUids(blocked).size).toBe(0);
    check(blocked);
    // two capped copies can each use the other
    check(make([copy('t0', 60), copy('t1', 60), copy('t2', 1)]));
  });
});

describe('hero helpers', () => {
  it('counts affordable levels without passing the cap (the "Maks" button)', () => {
    // The level card uses the store's affordableLevels with an unlimited request.
    const rich = { gold: 1e12, spirit: 1e12, gems: 0, basicScroll: 0, heroicScroll: 0 };
    const state = newGameState(0);
    const hero = { ...state.heroes[0], stars: 1, level: 1 };
    const maxGain = (resources: typeof rich, level = 1) => affordableLevels({ ...state, resources }, { ...hero, level }, Infinity).gained;
    expect(maxGain(rich)).toBe(19);
    expect(maxGain(rich, 20)).toBe(0);
    const one = levelUpCost(1);
    expect(maxGain({ ...rich, gold: one.gold, spirit: one.spirit })).toBe(1);
    expect(maxGain({ ...rich, gold: 0 })).toBe(0);
  });

  it('finds the best stocked tier per slot', () => {
    const stock = { weapon_t2: 1, weapon_t4: 0, weapon_t3: 2, armor_t1: 1, junk: 5 };
    expect(bestStockTier(stock, 'weapon')).toBe(3);
    expect(bestStockTier(stock, 'armor')).toBe(1);
    expect(bestStockTier(stock, 'boots')).toBe(0);
  });
});

function randomTeam(rng: Rng, size: number): (BattleUnitSetup | null)[] {
  const team: (BattleUnitSetup | null)[] = [null, null, null, null, null, null];
  const slots = rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, size);
  for (const slot of slots) {
    const def = rng.pick(HEROES);
    const stars = rng.int(def.rarity, 5);
    team[slot] = toBattleUnit({ uid: `u${slot}`, heroId: def.id, level: rng.int(1, 60), stars, equipment: {}, locked: false });
  }
  return team;
}

function expectMatchesFinal(model: BattleModel, final: UnitSnapshot[]): void {
  for (const snap of final) {
    const unit = model.units.get(refKey(snap.ref));
    expect(unit, refKey(snap.ref)).toBeDefined();
    expect(unit?.hp).toBe(snap.hp);
    expect(unit?.energy).toBe(snap.energy);
    expect(unit?.alive).toBe(snap.hp > 0);
    if (snap.hp <= 0) expect(unit?.statuses.size).toBe(0);
  }
}

describe('battle replay model', () => {
  it('reproduces the engine final state for many real battles', () => {
    const rng = new Rng(1234);
    for (let i = 0; i < 150; i++) {
      const result = simulateBattle({ attackers: randomTeam(rng, rng.int(1, 6)), defenders: randomTeam(rng, rng.int(1, 6)), seed: i });
      const model = replayAll(result);
      expectMatchesFinal(model, result.final);
      expect(model.winner).toBe(result.winner);
      expect(model.round).toBe(result.rounds);
    }
  });

  it('expires turn buffs after round r+N-1 and round-end buffs after r+N', () => {
    const a0 = { side: 'attacker' as const, pos: 0 };
    const d0 = { side: 'defender' as const, pos: 0 };
    const snap = (ref: typeof a0 | typeof d0): UnitSnapshot => ({ ref, heroId: 'batur', level: 1, stars: 3, maxHp: 100, hp: 100, energy: 50 });
    const model = new BattleModel([snap(a0), snap(d0)]);
    const apply = (...events: BattleEvent[]): void => events.forEach((ev) => model.apply(ev));

    apply({ t: 'buff', target: a0, stat: 'spd', amount: 15, duration: 2 }); // battleStart counts as round end of round 0
    apply({ t: 'roundStart', round: 1 });
    apply({ t: 'action', actor: a0, kind: 'skill', skillName: 'x', targets: [a0] });
    apply({ t: 'buff', target: a0, stat: 'atk', amount: 0.2, duration: 1 }); // during turns -> lasts through round 1
    apply({ t: 'action', actor: d0, kind: 'basic', targets: [a0] });
    apply({ t: 'buff', target: d0, stat: 'armor', amount: -0.1, duration: 1 }); // round end -> lasts through round 2
    expect(model.units.get('a0')?.buffs).toHaveLength(2);

    apply({ t: 'roundStart', round: 2 });
    expect(model.units.get('a0')?.buffs.map((b) => b.stat)).toEqual(['spd']);
    expect(model.units.get('d0')?.buffs).toHaveLength(1);

    apply({ t: 'roundStart', round: 3 });
    expect(model.units.get('a0')?.buffs).toHaveLength(0);
    expect(model.units.get('d0')?.buffs).toHaveLength(0);
  });

  it('drops a buff when the engine announces its end (buffEnd), earliest-due copy first', () => {
    const a0 = { side: 'attacker' as const, pos: 0 };
    const model = new BattleModel([{ ref: a0, heroId: 'batur', level: 1, stars: 3, maxHp: 100, hp: 100, energy: 50 }]);
    model.apply({ t: 'roundStart', round: 1 });
    model.apply({ t: 'buff', target: a0, stat: 'atk', amount: 0.2, duration: 3 });
    model.apply({ t: 'buff', target: a0, stat: 'atk', amount: 0.2, duration: 1 });
    model.apply({ t: 'buff', target: a0, stat: 'spd', amount: -10, duration: 1 });
    model.apply({ t: 'buffEnd', target: a0, stat: 'atk', amount: 0.2 });
    expect(model.units.get('a0')?.buffs.map((b) => [b.stat, b.lastRound])).toEqual([
      ['atk', 3],
      ['spd', 1],
    ]);
    model.apply({ t: 'buffEnd', target: a0, stat: 'armor', amount: 0.5 }); // unknown: ignored
    expect(model.units.get('a0')?.buffs).toHaveLength(2);
  });

  it('keeps the same buffs as the engine at every round start and at the end of real battles', () => {
    // The battle cards draw ▲/▼ from model buffs: they must match what the engine still has active.
    const rng = new Rng(4321);
    let checked = 0;
    for (let i = 0; i < 150; i++) {
      const result = simulateBattle({ attackers: randomTeam(rng, rng.int(1, 6)), defenders: randomTeam(rng, rng.int(1, 6)), seed: 1000 + i });
      const model = new BattleModel(result.initial);
      const active = new Map<string, number>();
      const bump = (key: string, by: number): void => {
        active.set(key, (active.get(key) ?? 0) + by);
      };
      const expectSame = (where: string): void => {
        const modelCounts = new Map<string, number>();
        for (const unit of model.units.values()) for (const b of unit.buffs) modelCounts.set(`${unit.key}|${b.stat}|${b.amount}`, (modelCounts.get(`${unit.key}|${b.stat}|${b.amount}`) ?? 0) + 1);
        const engineCounts = new Map([...active].filter(([, n]) => n > 0));
        expect(modelCounts, `battle ${i} ${where}`).toEqual(engineCounts);
        checked++;
      };
      for (const ev of result.events) {
        model.apply(ev);
        if (ev.t === 'buff') bump(`${refKey(ev.target)}|${ev.stat}|${ev.amount}`, 1);
        if (ev.t === 'buffEnd') bump(`${refKey(ev.target)}|${ev.stat}|${ev.amount}`, -1);
        if (ev.t === 'roundStart') expectSame(`round ${ev.round}`);
      }
      expectSame('end');
    }
    expect(checked).toBeGreaterThan(300);
  });

  it('tracks statuses and death', () => {
    const d1 = { side: 'defender' as const, pos: 1 };
    const model = new BattleModel([{ ref: d1, heroId: 'batur', level: 1, stars: 3, maxHp: 100, hp: 100, energy: 50 }]);
    model.apply({ t: 'status', target: d1, status: 'burn', on: true, duration: 2 });
    expect(model.units.get('d1')?.statuses.get('burn')).toBe(2);
    model.apply({ t: 'damage', source: null, target: d1, amount: 100, crit: false, kind: 'dot', hpAfter: 0 });
    model.apply({ t: 'death', target: d1 });
    model.apply({ t: 'status', target: d1, status: 'burn', on: false, duration: 0 });
    const unit = model.units.get('d1');
    expect(unit?.alive).toBe(false);
    expect(unit?.hp).toBe(0);
    expect(unit?.statuses.size).toBe(0);
  });
});

describe('playback pacing', () => {
  it('adds a beat between turns and keeps energy updates instant', () => {
    const a0 = { side: 'attacker' as const, pos: 0 };
    const action: BattleEvent = { t: 'action', actor: a0, kind: 'basic', targets: [] };
    const energy: BattleEvent = { t: 'energy', target: a0, energyAfter: 100 };
    expect(delayAfter(energy, energy)).toBe(0);
    expect(delayAfter(energy, action)).toBeGreaterThan(0);
  });

  it('plays the first campaign stage in about half a minute at ×1 (was ~44 s)', () => {
    const times: number[] = [];
    for (let t = 0; t < 8; t++) {
      const now = 1_000 + t * 7_919;
      const game = new Game(newGameState(now), { storage: null, now: () => now });
      const fight = game.fightCampaign();
      if (!fight.ok) throw new Error(fight.error);
      times.push(totalDuration(fight.value.result.events));
    }
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    expect(mean).toBeLessThan(32_000);
    expect(Math.min(...times)).toBeGreaterThan(8_000);
  });

  it('keeps a full 6v6 battle watchable at ×1', () => {
    const rng = new Rng(99);
    const result = simulateBattle({ attackers: randomTeam(rng, 6), defenders: randomTeam(rng, 6), seed: 5 });
    const ms = totalDuration(result.events);
    expect(ms).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(15 * 60_000);
  });
});

describe('save banner', () => {
  it('asks a stale tab to reload, warns once about unavailable storage, and hides when saving works', () => {
    expect(saveNotice(null, false)).toBeNull();
    expect(saveNotice(null, true)).toBeNull();
    const conflict = saveNotice('conflict', true);
    expect(conflict).toMatchObject({ action: 'reload', label: 'Sayfayı Yenile' });
    expect(conflict!.text).toMatch(/başka bir sekmede/);
    expect(saveNotice('unavailable', false)).toMatchObject({ action: 'dismiss', label: 'Tamam' });
    expect(saveNotice('unavailable', true)).toBeNull();
  });

  it('follows a real stale instance (the banner the app shell shows for it)', () => {
    const storage = new Map<string, string>();
    const memory = {
      get length() {
        return storage.size;
      },
      clear: () => storage.clear(),
      getItem: (k: string) => storage.get(k) ?? null,
      key: (i: number) => [...storage.keys()][i] ?? null,
      removeItem: (k: string) => void storage.delete(k),
      setItem: (k: string, v: string) => void storage.set(k, String(v)),
    } satisfies Storage;
    const tabA = Game.load({ storage: memory, now: () => 1_000 });
    const tabB = Game.load({ storage: memory, now: () => 1_000 });
    expect(saveNotice(tabB.refreshSaveStatus(), false)).toBeNull();
    expect(tabA.summon('heroic', 1).ok).toBe(true);
    expect(saveNotice(tabB.refreshSaveStatus(), false)?.text).toBe(tabB.saveWarning());
    expect(tabB.claimIdle()).toEqual({ resources: {} });
  });
});

describe('page shell', () => {
  const viewport = /<meta\s+name="viewport"\s+content="([^"]*)"/.exec(indexHtml)?.[1] ?? '';

  it('lets players pinch-zoom (no maximum-scale / user-scalable=no) and covers notched screens', () => {
    const parts = new Map(
      viewport.split(',').map((part) => {
        const [key, value = ''] = part.split('=').map((s) => s.trim());
        return [key, value] as const;
      }),
    );
    expect(parts.get('width')).toBe('device-width');
    expect(parts.has('user-scalable')).toBe(false);
    expect(parts.has('maximum-scale')).toBe(false);
    // Without viewport-fit=cover every env(safe-area-inset-*) used by style.css resolves to 0.
    expect(parts.get('viewport-fit')).toBe('cover');
    expect(styleCss).toMatch(/env\(safe-area-inset-top/);
  });

  it('keeps double-tap zoom off everywhere and text inputs at 16px (no iOS focus zoom)', () => {
    expect(styleCss).toMatch(/(^|\n)\*\s*\{\s*touch-action:\s*manipulation;\s*\}/);
    const textInput = /\n\.text-input\s*\{([^}]*)\}/.exec(styleCss)?.[1] ?? '';
    const size = /font-size:\s*(\d+)px/.exec(textInput)?.[1];
    expect(Number(size)).toBeGreaterThanOrEqual(16);
  });
});

describe('stage', () => {
  const close = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(1e-6);

  it('scales the 1280x720 stage uniformly and centres it (letterbox)', () => {
    const big = fitStage(1920, 1080);
    expect(big).toMatchObject({ rotated: false, x: 0, y: 0 });
    close(big.scale, 1.5);
    const phone = fitStage(844, 390);
    expect(phone.rotated).toBe(false);
    close(phone.scale, 390 / STAGE_H);
    close(phone.x, (844 - STAGE_W * phone.scale) / 2);
    close(phone.y, 0);
    const tall = fitStage(1280, 1000);
    close(tall.scale, 1);
    close(tall.y, 140);
  });

  it('turns the stage 90° in a portrait viewport so it fills the screen sideways', () => {
    const fit = fitStage(390, 844);
    expect(fit.rotated).toBe(true);
    close(fit.scale, Math.min(844 / STAGE_W, 390 / STAGE_H));
    // stage corners land inside the viewport: top-left at the top-right of the screen
    const s = fit.scale;
    const toScreen = (x: number, y: number): [number, number] => [fit.x - y * s, fit.y + x * s];
    const corners = [toScreen(0, 0), toScreen(STAGE_W, 0), toScreen(0, STAGE_H), toScreen(STAGE_W, STAGE_H)];
    for (const [x, y] of corners) {
      expect(x).toBeGreaterThanOrEqual(-1e-6);
      expect(x).toBeLessThanOrEqual(390 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(844 + 1e-6);
    }
    // and the inverse mapping brings screen points back to stage px
    for (const [sx, sy] of [[0, 0], [STAGE_W, STAGE_H], [640, 360], [100, 600]]) {
      const [px, py] = toScreen(sx, sy);
      const back = toStagePoint(fit, px, py);
      close(back.x, sx);
      close(back.y, sy);
    }
  });

  it('measures the full bleed: a wide phone gets painted sides and HUD corners on the real screen edges', () => {
    const fit = fitStage(844, 390);
    const b = stageBleed(fit, { left: 0, top: 0, right: 844, bottom: 390 });
    const side = (844 / fit.scale - STAGE_W) / 2;
    expect(b.bleedX).toBeCloseTo(side, 1);
    expect(b.bleedY).toBe(0);
    expect(b.edgeL).toBeCloseTo(side, 1);
    expect(b.edgeR).toBeCloseTo(side, 1);
    // a 16:9 screen has no bleed at all
    expect(stageBleed(fitStage(1920, 1080), { left: 0, top: 0, right: 1920, bottom: 1080 })).toEqual({ bleedX: 0, bleedY: 0, edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0 });
    // a notch on the left: the art still bleeds to the screen edge, the HUD stops at the safe area
    const safe = { left: 44, top: 0, right: 844, bottom: 390 };
    const notched = fitStage(800, 390);
    notched.x += 44;
    const n = stageBleed(notched, { left: 0, top: 0, right: 844, bottom: 390 }, safe);
    expect(n.edgeL).toBeLessThan(n.bleedX);
    expect(n.edgeL).toBeCloseTo((800 / notched.scale - STAGE_W) / 2, 1);
    // ultra-wide monitors are capped at the painted bleed
    expect(stageBleed(fitStage(3440, 1000), { left: 0, top: 0, right: 3440, bottom: 1000 }).bleedX).toBe(BLEED_ART_X);
  });

  it('measures the bleed along the long side of a rotated (portrait) phone', () => {
    const fit = fitStage(390, 844);
    const b = stageBleed(fit, { left: 0, top: 0, right: 390, bottom: 844 });
    expect(b.bleedX).toBeCloseTo((844 / fit.scale - STAGE_W) / 2, 1);
    expect(b.bleedY).toBeCloseTo(0, 1);
  });

  it('maps pointer positions back to stage px without rotation too', () => {
    const fit = fitStage(1600, 1000);
    const p = toStagePoint(fit, fit.x + 640 * fit.scale, fit.y + 360 * fit.scale);
    close(p.x, 640);
    close(p.y, 360);
  });
});

describe('navigation badges', () => {
  it('lights the campaign after an hour of idle loot, summon with scrolls, heroes when a star-up is ready', () => {
    const state = newGameState(0);
    expect(navBadges(state, IDLE_BADGE_MS - 1).campaign).toBe(false);
    expect(navBadges(state, IDLE_BADGE_MS).campaign).toBe(true);
    expect(navBadges(state, 0).summon).toBe(state.resources.basicScroll > 0 || state.resources.heroicScroll > 0);
    const empty: GameState = { ...state, resources: { ...state.resources, basicScroll: 0, heroicScroll: 0 } };
    expect(navBadges(empty, 0).summon).toBe(false);
    expect(navBadges(state, 0).heroes).toBe(starUpReadyUids(state).size > 0);
  });
});

describe('no emoji in the UI', () => {
  // SPEC §6: emoji render inconsistently (e.g. a missing-glyph box on Windows); the UI uses art icons.
  const EMOJI = /\p{Extended_Pictographic}/u;
  const owned = import.meta.glob(['../src/ui/**/*.ts', '../src/ui/**/*.css', '../src/main.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('finds the UI sources', () => {
    expect(Object.keys(owned).length).toBeGreaterThan(30);
    expect(Object.keys(owned).some((name) => name.endsWith('battle/view.ts'))).toBe(true);
    expect(Object.keys(owned).some((name) => name.endsWith('battle/battle.css'))).toBe(true);
  });

  it('has no emoji in UI code, the stylesheet or the page shell', () => {
    const files: [string, string][] = [...Object.entries(owned), ['src/style.css', styleCss], ['index.html', indexHtml]];
    for (const [name, text] of files) {
      const line = text.split('\n').findIndex((l) => EMOJI.test(l));
      expect(line, `${name}:${line + 1}`).toBe(-1);
    }
  });
});
