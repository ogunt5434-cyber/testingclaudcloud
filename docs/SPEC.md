# Diyar Kahramanları — Implementation Spec

An Idle-Heroes-style idle RPG in TypeScript (Vite, vanilla DOM, no UI framework).
All in-game text is **Turkish**. Code identifiers & comments are English.
All hero names, skill names and art are **original** — never reuse names, text or art from Idle Heroes or other games.

Contracts live in `src/core/types.ts` and `src/core/constants.ts` (DO NOT change existing
fields/signatures; additive changes only if truly needed). Module stubs list the exact exported signatures.

## Module ownership

| Area | Files |
|---|---|
| Content | `src/data/heroes.ts`, `src/data/equipment.ts` |
| Battle engine | `src/core/battle/**` |
| Meta systems & store | `src/core/stats.ts`, `progression.ts`, `summon.ts`, `campaign.ts`, `tower.ts`, `save.ts`, `game.ts` |
| Art (generated visuals) | `src/art/**` (facade `src/art/index.ts`) |
| UI | `src/main.ts`, `src/ui/**`, `src/style.css` |
| Tests | `tests/*.test.ts` (Vitest) |

## 1. Factions & classes

Factions: shadow (Gölge), fortress (Kale), abyss (Uçurum), forest (Orman), dark (Karanlık), light (Işık).
Advantage cycle: abyss → forest → shadow → fortress → abyss; light ↔ dark.
Advantage gives the attacker **+30% damage** and **+15% hit** (see constants).

Classes: warrior (tanky front-liner), mage (AoE damage), ranger (single-target/multi-hit DPS),
assassin (burst, crit, targets back line / low HP), priest (healing, buffs, energy).

## 2. Hero growth

- Stars 1..5 (MAX_STARS). A hero is summoned at its natural `rarity` (2..5) and can be starred up to 5.
- Level cap by stars: `LEVEL_CAP[stars]` (20/40/60/80/100).
- Stats at (level, stars):
  - hp/atk/armor = `base * (1 + LEVEL_GROWTH*(level-1)) * STAR_MULT[stars]`
  - spd = `base.spd + SPD_PER_STAR*(stars-1)` (no level growth)
  - secondary stats = innate values (crit, dodge…)
  - equipment adds flat bonuses on top.
  - Passive `stats` are applied by the battle engine (hp/atk/armor as percent of the setup value, others additive).
- Star up (stars → stars+1): hero must be at level cap; consumes `STAR_UP_FODDER[stars]` copies of the
  same hero with the same stars (not locked, not in formation). Fodder level costs are refunded, fodder gear returns to stock.
- Power (display): `round(hp*0.1 + atk*1 + armor*0.6 + spd*2 + 1000*(crit+dodge+hit+skillDmg+dmgReduce+armorBreak+controlImmune) + 500*critDmg)` roughly — any monotonic formula is fine, but keep it stable.

## 3. Battle rules (engine)

Teams: 6 slots, 0-1 front row, 2-5 back row; empty slots allowed (null).

**Build:** each unit gets `stats` from setup, plus its passives' `stats`. HP = max HP. Energy = ENERGY_START.
Units know their hero def (faction, skills), level and stars.

**Start:** emit `battleStart` passives in order: attacker pos 0..5, then defender 0..5.

**Rounds** 1..maxRounds (default 15):
1. Emit `roundStart`.
2. Turn order: all alive units sorted by current effective spd desc; ties → attacker side first, then lower pos.
   The order is fixed at round start; units that die before their turn don't act.
3. On a unit's turn:
   - If it has stun/freeze/petrify → emit `skip`, decrement the remaining turns of each control status on it
     (remove at 0 and emit `status on:false`). Silence also decrements here. Turn ends.
   - Else if energy ≥ ENERGY_TO_CAST and not silenced → **active skill**: energy set to 0 (emit `energy`),
     emit `action kind:'skill'` (targets = first effect's targets), run effects in order. Silence decrements here too.
   - Else → **basic attack**: 1.0×ATK damage to `defaultEnemy`, then +ENERGY_PER_BASIC energy (emit `energy`).
     Silence decrements here too.
   - After the action, fire this unit's `onAttack` passives.
4. **Round end** (only alive units, in turn order): DoTs tick (emit `damage kind:'dot'`, ignores armor/dodge/crit), then
   `roundEnd` passives, then buffs and DoTs decrement duration (remove at 0; emit `status on:false` for DoTs, `buffEnd` for buffs; a dying unit's buffs also emit `buffEnd`).
5. After any damage, if one side has no alive units → emit `battleEnd` and stop immediately.

If `maxRounds` ends with both sides alive → **defender wins**.

**Damage (attack/skill/passive):**
```
dodgeChance = clamp(target.dodge - attacker.hit - (advantage ? FACTION_HIT_BONUS : 0), 0, 0.75)
if dodged → emit dodge, no damage, no energy gain for target.
raw = atk * multiplier * (bonusVsStatus applies ? bonus.multiplier : 1)
if skill: raw *= (1 + attacker.skillDmg)
crit = rng.chance(attacker.crit) → raw *= CRIT_BASE_MULT + attacker.critDmg
effArmor = target.armor * max(0, 1 - attacker.armorBreak - (effect.ignoreArmor ?? 0))
reduction = min(ARMOR_CAP, effArmor / (effArmor + ARMOR_K_BASE + ARMOR_K_PER_LEVEL * attacker.level))
dmg = raw * (1 - reduction) * (advantage ? 1 + FACTION_DMG_BONUS : 1) * (1 - min(DMG_REDUCE_CAP, target.dmgReduce))
dmg *= uniform(1 - DAMAGE_VARIANCE, 1 + DAMAGE_VARIANCE); dmg = max(1, round(dmg))
```
Target that took damage from an attack/skill (not DoT, not passive) gains ENERGY_PER_HIT (if alive) and fires `onHit` passives.
Passive-triggered damage never fires onHit/onAttack (prevents loops). Recursion of onDeath/onAllyDeath is bounded.

**Heal:** `atk * multiplier`, capped at max HP, never revives dead units.

**Status:** control statuses (stun/freeze/petrify/silence) succeed with `chance * (1 - target.controlImmune)`;
DoTs with `chance`. Reapplying the same status keeps the max remaining duration (DoT keeps the higher value).
Control `duration` = number of the target's turns affected. DoT `duration` = number of round-end ticks;
DoT damage per tick = `value * caster ATK at application time`.

**Buffs:** timed stat modifiers (amount negative = debuff). Percent semantics for hp/atk/armor (never buff `hp`),
additive otherwise. Effective stat = `base*(1+Σpercent)` or `base+Σadd`; clamp fractions to sane ranges and
spd/atk/armor ≥ 0. Duration counts round-end ticks.

**Energy effect:** clamp to [0, ENERGY_MAX], emit `energy`.

**Targets:** `defaultEnemy` = random alive front enemy, else random alive back enemy. `previous` = previous
effect's targets (still alive). Random choices use the battle Rng seeded from `setup.seed`.

The engine must be **pure & deterministic**, never throw for valid setups, and terminate.
It must record `initial`, `events`, `final`, `unitStats` per `BattleResult`.

## 4. Content

- 30 heroes: 5 per faction with rarities `[2, 3, 4, 5, 5]`. Spread classes so every faction has a tank and healer option across rarities.
- Base stat ballpark (level 1, 1★): warrior hp 900-1100 atk 60-75 armor 25-35 spd 85-95;
  mage hp 600-750 atk 85-100 armor 12-18 spd 95-105; ranger hp 650-800 atk 85-100 armor 15-20 spd 100-110;
  assassin hp 600-720 atk 90-105 armor 12-18 spd 105-115; priest hp 700-850 atk 65-80 armor 15-22 spd 95-105.
  Higher rarity heroes get ~+5-12% better base stats and stronger skills.
- Active skill damage multipliers: AoE (allEnemies) 0.8-1.3, row 1.2-1.8, single target 2.5-4.0; heals 1.0-2.0 on lowest/2.0 multiplier totals.
- 1-3 passives per hero (rarity 2: 1, rarity 3-4: 2, rarity 5: 3).
- Equipment: 4 slots × 6 tiers. Weapon: atk (+ crit at high tiers). Armor: hp + armor. Helmet: hp + armor. Boots: spd + hp.
  Rough tier-1 values: weapon atk 20, armor hp 200 armor 8, helmet hp 150 armor 6, boots spd 3 hp 80; each tier ~×1.8.
- Turkish names, titles, descriptions; one emoji each. Descriptions must state the real numbers (e.g. "%120 saldırı hasarı").

## 5. Economy & modes

- New game: 5 starter heroes in formation (mix of 2★/3★, include a warrior and a priest), resources
  gold 20000, spirit 8000, gems 900, basicScroll 10, heroicScroll 3. Formation pre-filled.
- Level-up cost grows ~ level^1.6 in gold and spirit. Early levels are cheap (lvl1→2 ~ 100 gold, 60 spirit).
- Campaign: stage N enemy team built from real hero defs; level & stars ramp; early stages have fewer than 6 enemies.
  Stage 1 must be easy for the starter team; the curve should require regular leveling/summoning.
  First clear rewards: gold, spirit, gems (more on boss stage = every 10th), occasional scrolls.
- Idle income per hour grows with cleared stage: gold, spirit, player exp; and expected-value drops of
  equipment (tier grows with chapter) & basic scrolls. Cap IDLE_CAP_HOURS. Must be deterministic (use elapsed-time
  based expected values; fractional items may accumulate via floor of totals).
  - The cap counts from `idleSince` (the last claim): the chest pays for `[idleSince, idleSince + cap]`.
  - Clearing a stage banks the chest's income so far at the old stage's rate (`campaign.idleBank`); only later
    time pays the new rate. Totals do not depend on how often the player claims.
  - Clock safety: a timer ahead of the clock restarts at "now"; `campaign.idlePaidUntil` (never decreases) keeps
    already-paid time from being paid twice after the clock is set back.
- Saving: every write stores a save revision. An instance (browser tab) whose stored revision was replaced by
  another instance stops saving and blocks actions (`saveProblem 'conflict'`); a failed write sets
  `saveProblem 'unavailable'`. The UI shows a banner for both (reload button for a conflict).
- Tower: floor F harder than campaign at equal number, first-clear rewards with gems; every 5th floor bonus.
- Summon rates in `summon.ts`. Heroic: heroicScroll or gems (GEMS_PER_HEROIC_PULL / GEMS_PER_HEROIC_TEN). Basic: basicScroll.
  Light/Dark 5★ heroes have half the weight of other 5★ heroes in the pool.
- Player level: exp from idle & battles; level-up gives gems.

## 6. UI v2 — Idle-Heroes-style presentation (landscape, cartoon)

The look & layout follow the genre conventions of Idle Heroes (landscape 16:9, illustrated town hub, side-view
battles with chibi cartoon heroes), but **every asset is original**: no art, characters, logos, names or text
copied from Idle Heroes or any other game. All art is generated in `src/art/**` (SVG/CSS/canvas). **No emoji
anywhere in the UI** (they render inconsistently, e.g. 🪙 is a missing glyph on Windows) — use `icon()`.

**Stage:** fixed design resolution 1280×720, scaled uniformly to fit the viewport (letterboxed with a themed
backdrop). In a portrait viewport the stage is rotated 90° so it fills the screen when the phone is turned
sideways (common mobile web-game technique), with a small one-time hint "Daha iyi görüntü için telefonu yan çevir".
Pinch-zoom stays available; `viewport-fit=cover` + safe-area insets.

**Town hub (home):** full-stage `townScene()` illustration with clickable buildings + ribbon labels:
Sefer Kapısı (campaign), Çağırma Çemberi (summon), Kadim Kule (tower), Kahramanlar Salonu (heroes); locked
"Yakında": Arena, Lonca, Pazar. Overlaid HUD: top-left avatar with player level & exp ring + name; top-center
resource pills (gold, spirit, gems) with "+" buttons; top-right settings; left column round buttons (Takım, Görevler
placeholder); bottom-left current chapter & stage progress ("Bölüm 3 · 4/10") with the idle chest button (glows when
rewards are waiting, shows a live counter); bottom-right icon row (Kahramanlar, Çanta/ekipman, Çağır, Takım).

**Campaign screen:** chapter map with stage nodes along a path over a painted backdrop, current stage highlighted;
panel with enemy lineup portraits, enemy power vs team power, first-clear rewards, idle chest with live ticking
loot & "Topla", "Savaş" (opens formation confirm → battle).

**Heroes:** IH-style grid of square portrait cards (frame color by stars, faction badge top-left, level bottom-left,
stars along the bottom), faction filter tabs on the side/top, sorted by power. Hero detail: large full-body sprite on
the left on a faction-themed pedestal, stats/skills/equipment tabs on the right, level-up / star-up / equip actions.

**Summon (Çağırma Çemberi):** glowing summoning circle scene; Temel & Kahraman banners with ×1/×10 and costs, rates,
pity counter; reveal: heroes appear from the circle one by one, card flip, 5★ special glow.

**Tower:** vertical tower illustration with floor number, enemy power vs team, rewards, "Savaş".

**Formation:** side-view arrangement, 2 front + 4 back slots like the battle layout, hero bench below, "Otomatik".
(Otomatik: 6 strongest by power, warriors beyond the two strongest weighted `EXTRA_WARRIOR_WEIGHT`; warriors then
highest hp in front.)

**Battle (side view):** painted `sceneBackground()`; player team on the LEFT facing right, enemy team on the RIGHT
facing left; front row (2) nearer the middle, back row (4) behind, staggered vertically like a 2-4 formation on the
ground. Over each hero: HP bar (green, red for enemies) + thin yellow energy bar, level number + faction icon at the
bar's left, status icons. Top-center "Tur N/15"; top-right speed button (×1/×2/×4) and "Atla"; bottom corners show
small portraits of each side? (optional). Events animate with `setSpriteAnim` + `playVfx`: basic attack = melee
dash-and-strike (warriors/assassins) or projectile (rangers/mages/priests); skills = cast pose + skill-name banner +
big VFX on targets; floating damage numbers (white with dark outline, crit bigger orange "Kritik!", heal green,
dodge "Iska"); hit flash & knockback; death = fall + fade. Result: Zafer/Yenilgi banner with rewards, per-unit damage
meter, "Devam" / "Sonraki Aşama".

Toasts for errors/success. Buttons are chunky, glossy cartoon buttons (gold/orange primary, blue secondary)
with thick outlines and drop shadows; panels are framed parchment/stone-blue panels with ornate corners, mimicking
the genre feel with original drawing.
