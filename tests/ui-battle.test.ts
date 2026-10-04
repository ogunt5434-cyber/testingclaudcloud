// Side-view battle playback: pure choreography planning, formation geometry and pacing (no DOM).
import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/core/battle/engine';
import { campaignEnemies } from '../src/core/campaign';
import { Game } from '../src/core/game';
import { Rng } from '../src/core/rng';
import { newGameState } from '../src/core/save';
import { toBattleUnit } from '../src/core/stats';
import type { BattleEvent, BattleUnitSetup, Side, UnitRef } from '../src/core/types';
import { HEROES } from '../src/data/heroes';
import { STAT_INFO } from '../src/core/constants';
import { dotStatusOf, planSkill, plainLabel, sameRef, sceneForBattle, STAT_TAG, strikeStyle, turnSlice } from '../src/ui/battle/choreo';
import {
  STAGE_H,
  STAGE_W,
  barLift,
  bodyPoint,
  centroid,
  depthOf,
  facingDir,
  launchPoint,
  slotPoint,
  SPRITE_FEET,
  SPRITE_H,
  strikePoint,
} from '../src/ui/battle/layout';
import { DASH_OUT_MS, IMPACT_BASIC_MS, IMPACT_SKILL_MS, delayAfter, isTurnBoundary, totalDuration } from '../src/ui/battle/timing';

function randomTeam(rng: Rng, size: number): (BattleUnitSetup | null)[] {
  const team: (BattleUnitSetup | null)[] = [null, null, null, null, null, null];
  for (const slot of rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, size)) {
    const def = rng.pick(HEROES);
    team[slot] = toBattleUnit({ uid: `u${slot}`, heroId: def.id, level: rng.int(1, 60), stars: rng.int(def.rarity, 5), equipment: {}, locked: false });
  }
  return team;
}

function battles(count: number, seed: number) {
  const rng = new Rng(seed);
  return Array.from({ length: count }, (_, i) => simulateBattle({ attackers: randomTeam(rng, rng.int(1, 6)), defenders: randomTeam(rng, rng.int(1, 6)), seed: seed + i }));
}

const ALL_REFS: UnitRef[] = (['attacker', 'defender'] as Side[]).flatMap((side) => [0, 1, 2, 3, 4, 5].map((pos) => ({ side, pos })));

describe('battle formation geometry', () => {
  it('mirrors the two teams around the centre line, players on the left facing right', () => {
    for (let pos = 0; pos < 6; pos++) {
      const a = slotPoint({ side: 'attacker', pos });
      const d = slotPoint({ side: 'defender', pos });
      expect(a.x).toBeLessThan(STAGE_W / 2);
      expect(d.x).toBe(STAGE_W - a.x);
      expect(d.y).toBe(a.y);
    }
    expect(facingDir('attacker')).toBe(1);
    expect(facingDir('defender')).toBe(-1);
  });

  it('puts the front row nearest the middle and keeps everyone on the ground plane inside the stage', () => {
    const side = (s: Side) => [0, 1, 2, 3, 4, 5].map((pos) => slotPoint({ side: s, pos }));
    const left = side('attacker');
    const minFront = Math.min(left[0].x, left[1].x);
    for (const back of left.slice(2)) expect(back.x).toBeLessThan(minFront);
    for (const ref of ALL_REFS) {
      const p = slotPoint(ref);
      expect(p.y).toBeGreaterThanOrEqual(400);
      expect(p.y).toBeLessThanOrEqual(680);
      // whole sprite and its bar block stay on stage, below the 80 px top HUD band
      expect(p.y - SPRITE_FEET + SPRITE_H).toBeLessThanOrEqual(STAGE_H);
      expect(p.y - barLift('heavy') - 40).toBeGreaterThan(80);
      expect(p.x - 80).toBeGreaterThan(0);
      expect(p.x + 80).toBeLessThan(STAGE_W);
    }
  });

  it('keeps a wide centre gap and never puts a bar block on the head of the unit behind', () => {
    const left = [0, 1, 2, 3, 4, 5].map((pos) => slotPoint({ side: 'attacker', pos }));
    const right = [0, 1, 2, 3, 4, 5].map((pos) => slotPoint({ side: 'defender', pos }));
    expect(Math.min(...right.map((p) => p.x)) - Math.max(...left.map((p) => p.x))).toBeGreaterThanOrEqual(220);
    // bar block: ~140 px wide, 30 px tall, `barLift` above the feet; head: ~90 px wide just under it
    for (const a of left) {
      for (const b of left) {
        if (a === b || b.y >= a.y) continue;
        const barTop = a.y - barLift('heavy') - 30;
        const barBottom = a.y - barLift('normal');
        const headTop = b.y - barLift('heavy');
        const headBottom = b.y - barLift('normal') + 40;
        const xOverlap = Math.abs(a.x - b.x) < 70 + 45;
        const yOverlap = barTop < headBottom && barBottom > headTop;
        expect(xOverlap && yOverlap, `${a.x},${a.y} over ${b.x},${b.y}`).toBe(false);
      }
    }
  });

  it('never stacks two slots on the same spot and sorts lower units in front', () => {
    for (const a of ALL_REFS) {
      for (const b of ALL_REFS) {
        if (sameRef(a, b)) continue;
        const pa = slotPoint(a);
        const pb = slotPoint(b);
        expect(Math.hypot(pa.x - pb.x, pa.y - pb.y), `${a.side}${a.pos}/${b.side}${b.pos}`).toBeGreaterThan(110);
      }
    }
    expect(depthOf(600)).toBeGreaterThan(depthOf(400));
  });

  it('aims effects at the body, launches from the hand and stops melee strikers in front of the target', () => {
    const a = { side: 'attacker' as const, pos: 2 };
    const d = { side: 'defender' as const, pos: 0 };
    expect(bodyPoint(a).y).toBeLessThan(slotPoint(a).y);
    expect(launchPoint(a).x).toBeGreaterThan(slotPoint(a).x);
    const stop = strikePoint(a, d);
    expect(stop.x).toBeLessThan(slotPoint(d).x);
    expect(strikePoint(d, a).x).toBeGreaterThan(slotPoint(a).x);
    const c = centroid([d, { side: 'defender', pos: 1 }]);
    expect(c.x).toBeCloseTo((bodyPoint(d).x + bodyPoint({ side: 'defender', pos: 1 }).x) / 2);
    expect(centroid([])).toEqual({ x: STAGE_W / 2, y: 480 });
  });

  it('lifts the bar block above the head by body type, with a safe default', () => {
    expect(barLift('small')).toBeLessThan(barLift('normal'));
    expect(barLift('normal')).toBeLessThan(barLift('heavy'));
    expect(barLift(undefined)).toBe(barLift('normal'));
    expect(barLift('weird')).toBe(barLift('normal'));
  });
});

describe('battle choreography planning', () => {
  it('dashes warriors and assassins in, shoots arrows with rangers and bolts with casters', () => {
    expect(strikeStyle('warrior')).toBe('melee');
    expect(strikeStyle('assassin')).toBe('melee');
    expect(strikeStyle('ranger')).toBe('arrow');
    expect(strikeStyle('mage')).toBe('bolt');
    expect(strikeStyle('priest')).toBe('bolt');
    expect(strikeStyle(undefined, 'shoot')).toBe('arrow');
    expect(strikeStyle(undefined, 'magic')).toBe('bolt');
    expect(strikeStyle(undefined)).toBe('melee');
  });

  it('slices a turn up to the next actor / round / end', () => {
    const a0 = { side: 'attacker' as const, pos: 0 };
    const d0 = { side: 'defender' as const, pos: 0 };
    const events: BattleEvent[] = [
      { t: 'roundStart', round: 1 },
      { t: 'action', actor: a0, kind: 'basic', targets: [d0] },
      { t: 'damage', source: a0, target: d0, amount: 10, crit: false, kind: 'basic', hpAfter: 90 },
      { t: 'energy', target: a0, energyAfter: 50 },
      { t: 'action', actor: d0, kind: 'basic', targets: [a0] },
    ];
    expect(turnSlice(events, 1).map((e) => e.t)).toEqual(['damage', 'energy']);
    expect(turnSlice(events, 4)).toEqual([]);
    expect(isTurnBoundary(events[4])).toBe(true);
    expect(isTurnBoundary(events[2])).toBe(false);
  });

  it('summarises every skill of many real battles consistently with its events', () => {
    let skills = 0;
    const shapes = new Set<string>();
    for (const result of battles(120, 77)) {
      result.events.forEach((ev, i) => {
        if (ev.t !== 'action' || ev.kind !== 'skill') return;
        skills++;
        const plan = planSkill(result.events, i);
        shapes.add(plan.shape);
        expect(plan.shape === 'support').toBe(plan.hits.length === 0);
        if (plan.shape === 'single') expect(plan.hits).toHaveLength(1);
        if (plan.shape === 'multi') expect(plan.hits.length).toBeGreaterThan(1);
        for (const r of [...plan.hits, ...plan.afflicted]) expect(r.side).not.toBe(ev.actor.side);
        for (const r of plan.support) expect(r.side).toBe(ev.actor.side);
        // every skill blow of the caster (before its own passives) is a planned hit
        for (const next of turnSlice(result.events, i)) {
          if (next.t === 'passive') break;
          if (next.t === 'damage' && next.kind === 'skill' && sameRef(next.source, ev.actor)) expect(plan.hits.some((r) => sameRef(r, next.target))).toBe(true);
        }
        // no duplicates
        expect(new Set(plan.hits.map((r) => `${r.side}${r.pos}`)).size).toBe(plan.hits.length);
      });
    }
    expect(skills).toBeGreaterThan(200);
    expect([...shapes].sort()).toEqual(['multi', 'single', 'support']);
  });

  it('returns an empty plan for anything but a skill action', () => {
    const events: BattleEvent[] = [{ t: 'roundStart', round: 1 }];
    expect(planSkill(events, 0)).toEqual({ shape: 'support', hits: [], support: [], afflicted: [] });
    expect(planSkill(events, 5).shape).toBe('support');
  });

  it('picks the tower hall, the chapter scene, or a boss scene that differs from the chapter', () => {
    expect(sceneForBattle('Kule · Kat 7', 7)).toBe('tower');
    expect(sceneForBattle('Aşama 1-1', 1)).toBe('cave');
    expect(sceneForBattle('Aşama 2-3', 13)).toBe('forest');
    expect(sceneForBattle('Aşama 3-1', 21)).toBe('ruins');
    expect(sceneForBattle('Aşama 4-5', 35)).toBe('volcano');
    expect(sceneForBattle('Aşama 5-1', 41)).toBe('cave');
    for (let chapter = 1; chapter <= 12; chapter++) {
      const boss = sceneForBattle('Aşama', chapter * 10);
      expect(['void', 'volcano']).toContain(boss);
      expect(boss).not.toBe(sceneForBattle('Aşama', chapter * 10 - 1));
    }
    expect(sceneForBattle('Aşama', Number.NaN)).toBe('cave');
  });

  it('has a short pop-up tag for every stat', () => {
    expect(Object.keys(STAT_TAG).sort()).toEqual(Object.keys(STAT_INFO).sort());
    for (const tag of Object.values(STAT_TAG)) expect(tag.length).toBeLessThanOrEqual(12);
  });

  it('finds the DoT behind a tick and strips pictographs from button labels', () => {
    expect(dotStatusOf(['stun', 'poison', 'burn'])).toBe('poison');
    expect(dotStatusOf(['silence'])).toBeNull();
    expect(plainLabel('Sonraki Aşama ▶')).toBe('Sonraki Aşama');
    expect(plainLabel('Tekrar Dene ↻')).toBe('Tekrar Dene');
    expect(plainLabel('⚔️ Savaş')).toBe('Savaş');
    expect(plainLabel('Devam')).toBe('Devam');
  });
});

describe('battle pacing', () => {
  it('waits exactly until the blow lands after an action, and runs back before the next turn', () => {
    const a0 = { side: 'attacker' as const, pos: 0 };
    const basic: BattleEvent = { t: 'action', actor: a0, kind: 'basic', targets: [] };
    const skill: BattleEvent = { t: 'action', actor: a0, kind: 'skill', skillName: 'x', targets: [] };
    const dmg: BattleEvent = { t: 'damage', source: a0, target: a0, amount: 1, crit: false, kind: 'basic', hpAfter: 1 };
    expect(delayAfter(basic, dmg)).toBe(IMPACT_BASIC_MS);
    expect(delayAfter(skill, dmg)).toBe(IMPACT_SKILL_MS);
    expect(IMPACT_BASIC_MS).toBeGreaterThan(DASH_OUT_MS);
    expect(IMPACT_SKILL_MS).toBeGreaterThan(IMPACT_BASIC_MS);
  });

  it('keeps real campaign fights within a watchable length at ×1', () => {
    for (const stage of [1, 5, 10, 20]) {
      const game = new Game(newGameState(1_000), { storage: null, now: () => 1_000 });
      const enemies = campaignEnemies(stage);
      expect(enemies.some(Boolean)).toBe(true);
      const fight = game.fightCampaign();
      if (!fight.ok) throw new Error(fight.error);
      const ms = totalDuration(fight.value.result.events);
      expect(ms).toBeGreaterThan(5_000);
      expect(ms).toBeLessThan(3 * 60_000);
    }
  });
});
