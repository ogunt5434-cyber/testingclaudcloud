// Hero roster: 30 original heroes, 5 per faction with natural rarities [2, 3, 4, 5, 5].
// Every faction has exactly one hero of each class (warrior, mage, ranger, assassin, priest).
// Descriptions are player-facing Turkish text and must state the real numbers of the effects
// (tests/content.test.ts verifies this).
import type {
  Faction,
  HeroDef,
  SkillEffect,
  SkillTarget,
  StatKey,
  StatusKind,
  TargetSelector,
} from '../core/types';

// ---------------------------------------------------------------------------
// Effect builders — keep the hero data below compact and readable.
// ---------------------------------------------------------------------------

type TargetSpec = TargetSelector | SkillTarget;
type DamageEffect = Extract<SkillEffect, { type: 'damage' }>;
type DamageOptions = Pick<DamageEffect, 'bonusVsStatus' | 'ignoreArmor'>;

function toTarget(target: TargetSpec): SkillTarget {
  return typeof target === 'string' ? { selector: target } : target;
}

function randomEnemies(count: number): SkillTarget {
  return { selector: 'randomEnemies', count };
}

function randomAllies(count: number): SkillTarget {
  return { selector: 'randomAllies', count };
}

function damage(target: TargetSpec, multiplier: number, opts: DamageOptions = {}): SkillEffect {
  return { type: 'damage', target: toTarget(target), multiplier, ...opts };
}

/** bonusVsStatus shorthand: `multiplier` 1.5 = +50% damage against targets with `status`. */
function vs(status: StatusKind, multiplier: number): DamageOptions['bonusVsStatus'] {
  return { status, multiplier };
}

function heal(target: TargetSpec, multiplier: number): SkillEffect {
  return { type: 'heal', target: toTarget(target), multiplier };
}

/** Timed stat modifier; negative amount = debuff. Never use with 'hp'. */
function buff(target: TargetSpec, stat: StatKey, amount: number, duration: number): SkillEffect {
  return { type: 'buff', target: toTarget(target), stat, amount, duration };
}

/** Control status (stun/freeze/petrify/silence). */
function control(target: TargetSpec, status: StatusKind, chance: number, duration: number): SkillEffect {
  return { type: 'status', target: toTarget(target), status, chance, duration };
}

/** Damage-over-time status; `value` = damage per tick as a fraction of caster ATK. */
function dot(target: TargetSpec, status: StatusKind, chance: number, duration: number, value: number): SkillEffect {
  return { type: 'status', target: toTarget(target), status, chance, duration, value };
}

function energy(target: TargetSpec, amount: number): SkillEffect {
  return { type: 'energy', target: toTarget(target), amount };
}

// ---------------------------------------------------------------------------
// Gölge (shadow) — night, mist, moon and illusions.
// ---------------------------------------------------------------------------

const SHADOW_HEROES: HeroDef[] = [
  {
    id: 'ninni',
    name: 'Ninni',
    title: 'Düş Fısıldayan',
    faction: 'shadow',
    heroClass: 'priest',
    rarity: 2,
    base: { hp: 710, atk: 66, armor: 16, spd: 97 },
    emoji: '🌙',
    active: {
      name: 'Uyku Şarkısı',
      description: 'Canı en düşük müttefiki %150 saldırı gücü kadar iyileştirir ve ona 20 enerji verir.',
      effects: [heal('lowestHpAlly', 1.5), energy('previous', 20)],
    },
    passives: [
      {
        name: 'Gece Masalı',
        description: 'Her tur sonunda canı en düşük müttefiki %40 saldırı gücü kadar iyileştirir.',
        trigger: 'roundEnd',
        effects: [heal('lowestHpAlly', 0.4)],
      },
    ],
  },
  {
    id: 'batur',
    name: 'Batur',
    title: 'Gece Nöbetçisi',
    faction: 'shadow',
    heroClass: 'warrior',
    rarity: 3,
    base: { hp: 960, atk: 64, armor: 28, spd: 89 },
    innate: { dmgReduce: 0.05 },
    emoji: '🦇',
    active: {
      name: 'Yarasa Sürüsü',
      description:
        'Ön sıradaki düşmanlara %130 saldırı hasarı verir, %50 şansla 2 tur boyunca her tur %15 saldırı hasarı kadar kanama uygular ve kendi zırhını 2 tur %20 artırır.',
      effects: [
        damage('frontEnemies', 1.3),
        dot('previous', 'bleed', 0.5, 2, 0.15),
        buff('self', 'armor', 0.2, 2),
      ],
    },
    passives: [
      {
        name: 'Gece Derisi',
        description: 'Kalıcı olarak %12 can ve %10 zırh kazanır.',
        stats: { hp: 0.12, armor: 0.1 },
      },
      {
        name: 'Nöbet Yemini',
        description: 'Hasar aldığında %20 şansla 20 enerji kazanır.',
        trigger: 'onHit',
        chance: 0.2,
        effects: [energy('self', 20)],
      },
    ],
  },
  {
    id: 'sisgoz',
    name: 'Sisgöz',
    title: 'Pus Avcısı',
    faction: 'shadow',
    heroClass: 'ranger',
    rarity: 4,
    base: { hp: 730, atk: 93, armor: 17, spd: 106 },
    innate: { hit: 0.1, crit: 0.05 },
    emoji: '🦉',
    active: {
      name: 'Ayaz Okları',
      description: 'Rastgele 3 düşmana %150 saldırı hasarı verir ve %20 şansla 1 tur dondurur.',
      effects: [damage(randomEnemies(3), 1.5), control('previous', 'freeze', 0.2, 1)],
    },
    passives: [
      {
        name: 'Avcı İçgüdüsü',
        description: 'Kalıcı olarak %12 saldırı ve %8 kritik şansı kazanır.',
        stats: { atk: 0.12, crit: 0.08 },
      },
      {
        name: 'Sis Perdesi',
        description: 'Hasar aldığında %25 şansla 2 tur %15 kaçınma kazanır.',
        trigger: 'onHit',
        chance: 0.25,
        effects: [buff('self', 'dodge', 0.15, 2)],
      },
    ],
  },
  {
    id: 'aycalan',
    name: 'Ayçalan',
    title: 'Tutulma Cadısı',
    faction: 'shadow',
    heroClass: 'mage',
    rarity: 5,
    base: { hp: 720, atk: 96, armor: 17, spd: 104 },
    innate: { skillDmg: 0.1 },
    emoji: '🌘️',
    active: {
      name: 'Kara Tutulma',
      description: 'Tüm düşmanlara %110 saldırı hasarı verir, enerjilerini 30 azaltır ve %25 şansla 2 tur susturur.',
      effects: [damage('allEnemies', 1.1), energy('previous', -30), control('previous', 'silence', 0.25, 2)],
    },
    passives: [
      {
        name: 'Ay Işığı Örtüsü',
        description: 'Kalıcı olarak %15 saldırı ve %10 can kazanır.',
        stats: { atk: 0.15, hp: 0.1 },
      },
      {
        name: 'Yeni Ay',
        description: 'Savaş başında tüm müttefiklerin yetenek hasarını 3 tur %15 artırır.',
        trigger: 'battleStart',
        effects: [buff('allAllies', 'skillDmg', 0.15, 3)],
      },
      {
        name: 'Gölge Emici',
        description: 'Her tur sonunda saldırısı en yüksek düşmanın enerjisini 20 azaltır.',
        trigger: 'roundEnd',
        effects: [energy('highestAtkEnemy', -20)],
      },
    ],
  },
  {
    id: 'karayel',
    name: 'Karayel',
    title: 'Gecenin Bıçağı',
    faction: 'shadow',
    heroClass: 'assassin',
    rarity: 5,
    base: { hp: 690, atk: 105, armor: 15, spd: 115 },
    innate: { crit: 0.15, critDmg: 0.2 },
    emoji: '🥷',
    active: {
      name: 'Gece Yarısı İnfazı',
      description:
        "Canı en düşük düşmana zırhının %30'unu yok sayarak %300 saldırı hasarı verir (kanayan hedeflere %40 fazla), 3 tur boyunca her tur %30 saldırı hasarı kadar kanama uygular ve kendi saldırısını 2 tur %20 artırır.",
      effects: [
        damage('lowestHpEnemy', 3.0, { ignoreArmor: 0.3, bonusVsStatus: vs('bleed', 1.4) }),
        dot('previous', 'bleed', 1, 3, 0.3),
        buff('self', 'atk', 0.2, 2),
      ],
    },
    passives: [
      {
        name: 'Gölge Adımı',
        description: 'Kalıcı olarak %10 kritik şansı ve %10 kaçınma kazanır.',
        stats: { crit: 0.1, dodge: 0.1 },
      },
      {
        name: 'Kan Kokusu',
        description: 'Her saldırıdan sonra %35 şansla canı en düşük düşmana %100 saldırı hasarı verir.',
        trigger: 'onAttack',
        chance: 0.35,
        effects: [damage('lowestHpEnemy', 1.0)],
      },
      {
        name: 'Kaybolan İz',
        description: 'Bir müttefik öldüğünde 3 tur %30 kritik hasarı ve 30 enerji kazanır.',
        trigger: 'onAllyDeath',
        effects: [buff('self', 'critDmg', 0.3, 3), energy('self', 30)],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Kale (fortress) — stone walls, steel discipline and siege craft.
// ---------------------------------------------------------------------------

const FORTRESS_HEROES: HeroDef[] = [
  {
    id: 'tilki',
    name: 'Tilki',
    title: 'Mazgal Sızanı',
    faction: 'fortress',
    heroClass: 'assassin',
    rarity: 2,
    base: { hp: 610, atk: 91, armor: 12, spd: 106 },
    innate: { crit: 0.1, critDmg: 0.1 },
    emoji: '🦊',
    active: {
      name: 'Mazgal Hançeri',
      description:
        'Arka sıradaki düşmanlara %130 saldırı hasarı verir ve %40 şansla 2 tur boyunca her tur %15 saldırı hasarı kadar kanama uygular.',
      effects: [damage('backEnemies', 1.3), dot('previous', 'bleed', 0.4, 2, 0.15)],
    },
    passives: [
      {
        name: 'Çevik Pençe',
        description: 'Kalıcı olarak %8 kritik şansı ve %5 kaçınma kazanır.',
        stats: { crit: 0.08, dodge: 0.05 },
      },
    ],
  },
  {
    id: 'barutcu',
    name: 'Barutçu',
    title: 'Kuşatma Simyacısı',
    faction: 'fortress',
    heroClass: 'mage',
    rarity: 3,
    base: { hp: 640, atk: 89, armor: 14, spd: 97 },
    innate: { hit: 0.05 },
    emoji: '💣',
    active: {
      name: 'Barut Fıçısı',
      description:
        'Tüm düşmanlara %90 saldırı hasarı verir ve %40 şansla 2 tur boyunca her tur %20 saldırı hasarı kadar yanma uygular.',
      effects: [damage('allEnemies', 0.9), dot('previous', 'burn', 0.4, 2, 0.2)],
    },
    passives: [
      {
        name: 'Kuşatma Ustası',
        description: 'Kalıcı olarak %10 saldırı ve %10 zırh delme kazanır.',
        stats: { atk: 0.1, armorBreak: 0.1 },
      },
      {
        name: 'Yedek Fitil',
        description: 'Bir müttefik öldüğünde 40 enerji kazanır.',
        trigger: 'onAllyDeath',
        effects: [energy('self', 40)],
      },
    ],
  },
  {
    id: 'selvinur',
    name: 'Selvinur',
    title: 'Çan Kulesi Rahibesi',
    faction: 'fortress',
    heroClass: 'priest',
    rarity: 4,
    base: { hp: 790, atk: 72, armor: 19, spd: 100 },
    innate: { controlImmune: 0.05 },
    emoji: '🔔',
    active: {
      name: 'Kutsal Çan',
      description: 'Tüm müttefikleri %60 saldırı gücü kadar iyileştirir ve zırhlarını 2 tur %20 artırır.',
      effects: [heal('allAllies', 0.6), buff('previous', 'armor', 0.2, 2)],
    },
    passives: [
      {
        name: 'İnanç Zırhı',
        description: 'Kalıcı olarak %12 can ve %10 kontrol bağışıklığı kazanır.',
        stats: { hp: 0.12, controlImmune: 0.1 },
      },
      {
        name: 'Akşam Duası',
        description: 'Her tur sonunda canı en düşük müttefiki %50 saldırı gücü kadar iyileştirir.',
        trigger: 'roundEnd',
        effects: [heal('lowestHpAlly', 0.5)],
      },
    ],
  },
  {
    id: 'kartal_ece',
    name: 'Kartal Ece',
    title: 'Burç Nişancısı',
    faction: 'fortress',
    heroClass: 'ranger',
    rarity: 5,
    base: { hp: 760, atk: 100, armor: 19, spd: 107 },
    innate: { hit: 0.15, crit: 0.05 },
    emoji: '🦅',
    active: {
      name: 'Delici Cıvata',
      description:
        "Saldırısı en yüksek düşmana zırhının %50'sini yok sayarak %300 saldırı hasarı verir, saldırısını 2 tur %20 azaltır ve kendisi 25 enerji kazanır.",
      effects: [
        damage('highestAtkEnemy', 3.0, { ignoreArmor: 0.5 }),
        buff('previous', 'atk', -0.2, 2),
        energy('self', 25),
      ],
    },
    passives: [
      {
        name: 'Kartal Bakışı',
        description: 'Kalıcı olarak %18 saldırı ve %10 zırh delme kazanır.',
        stats: { atk: 0.18, armorBreak: 0.1 },
      },
      {
        name: 'Nişancı Disiplini',
        description: 'Savaş başında 3 tur %20 kritik şansı kazanır.',
        trigger: 'battleStart',
        effects: [buff('self', 'crit', 0.2, 3)],
      },
      {
        name: 'Ardışık Atış',
        description: 'Her saldırıdan sonra %25 şansla rastgele bir düşmana %120 saldırı hasarı verir.',
        trigger: 'onAttack',
        chance: 0.25,
        effects: [damage(randomEnemies(1), 1.2)],
      },
    ],
  },
  {
    id: 'demirkol',
    name: 'Demirkol',
    title: 'Surların Muhafızı',
    faction: 'fortress',
    heroClass: 'warrior',
    rarity: 5,
    base: { hp: 1100, atk: 66, armor: 35, spd: 90 },
    innate: { controlImmune: 0.15, dmgReduce: 0.05 },
    emoji: '🛡️',
    active: {
      name: 'Taş Sur Darbesi',
      description:
        'Ön sıradaki düşmanlara %150 saldırı hasarı verir, %30 şansla 1 tur taşlaştırır ve tüm müttefiklerin hasar azaltmasını 2 tur %10 artırır.',
      effects: [
        damage('frontEnemies', 1.5),
        control('previous', 'petrify', 0.3, 1),
        buff('allAllies', 'dmgReduce', 0.1, 2),
      ],
    },
    passives: [
      {
        name: 'Çelik Beden',
        description: 'Kalıcı olarak %20 can ve %15 zırh kazanır.',
        stats: { hp: 0.2, armor: 0.15 },
      },
      {
        name: 'Sarsılmaz',
        description: 'Hasar aldığında %30 şansla 2 tur %15 zırh kazanır.',
        trigger: 'onHit',
        chance: 0.3,
        effects: [buff('self', 'armor', 0.15, 2)],
      },
      {
        name: 'Son Siper',
        description: 'Öldüğünde tüm müttefiklerin hasar azaltmasını 3 tur %15 artırır.',
        trigger: 'onDeath',
        effects: [buff('allAllies', 'dmgReduce', 0.15, 3)],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Uçurum (abyss) — lava, brimstone and hellfire.
// ---------------------------------------------------------------------------

const ABYSS_HEROES: HeroDef[] = [
  {
    id: 'cakmak',
    name: 'Çakmak',
    title: 'Kükürt Okçusu',
    faction: 'abyss',
    heroClass: 'ranger',
    rarity: 2,
    base: { hp: 660, atk: 86, armor: 15, spd: 101 },
    innate: { hit: 0.08 },
    emoji: '🎯',
    active: {
      name: 'Çifte Kükürt',
      description: 'Ön sıradaki rastgele bir düşmana iki ok atarak %140 ve %130 saldırı hasarı verir.',
      effects: [damage('defaultEnemy', 1.4), damage('previous', 1.3)],
    },
    passives: [
      {
        name: 'Kıvılcımlı Uç',
        description:
          'Her saldırıdan sonra %25 şansla ön sıradaki rastgele bir düşmana 2 tur boyunca her tur %15 saldırı hasarı kadar yanma uygular.',
        trigger: 'onAttack',
        chance: 0.25,
        effects: [dot('defaultEnemy', 'burn', 1, 2, 0.15)],
      },
    ],
  },
  {
    id: 'alevnur',
    name: 'Alevnur',
    title: 'Kor Şifacısı',
    faction: 'abyss',
    heroClass: 'priest',
    rarity: 3,
    base: { hp: 750, atk: 69, armor: 18, spd: 99 },
    emoji: '🕯️',
    active: {
      name: 'Kor Duası',
      description:
        'Canı en düşük müttefiki %160 saldırı gücü kadar iyileştirir ve tüm müttefiklerin saldırısını 2 tur %12 artırır.',
      effects: [heal('lowestHpAlly', 1.6), buff('allAllies', 'atk', 0.12, 2)],
    },
    passives: [
      {
        name: 'Sıcak Eller',
        description: 'Kalıcı olarak %10 can ve %8 saldırı kazanır.',
        stats: { hp: 0.1, atk: 0.08 },
      },
      {
        name: 'Ocak Bekçisi',
        description: 'Her tur sonunda %50 şansla rastgele bir müttefike 20 enerji verir.',
        trigger: 'roundEnd',
        chance: 0.5,
        effects: [energy(randomAllies(1), 20)],
      },
    ],
  },
  {
    id: 'semender',
    name: 'Semender',
    title: 'Kül Dansçısı',
    faction: 'abyss',
    heroClass: 'assassin',
    rarity: 4,
    base: { hp: 660, atk: 98, armor: 14, spd: 110 },
    innate: { crit: 0.12, critDmg: 0.15 },
    emoji: '🦎',
    active: {
      name: 'Kül Dansı',
      description:
        'Arka sıradaki düşmanlara %140 saldırı hasarı verir (yanan hedeflere %40 fazla) ve %50 şansla 2 tur boyunca her tur %25 saldırı hasarı kadar yanma uygular.',
      effects: [
        damage('backEnemies', 1.4, { bonusVsStatus: vs('burn', 1.4) }),
        dot('previous', 'burn', 0.5, 2, 0.25),
      ],
    },
    passives: [
      {
        name: 'Ateş Yürüyüşü',
        description: 'Kalıcı olarak %10 kritik şansı ve 5 hız kazanır.',
        stats: { crit: 0.1, spd: 5 },
      },
      {
        name: 'Kıvılcım İzi',
        description:
          'Her saldırıdan sonra %30 şansla canı en düşük düşmana 2 tur boyunca her tur %20 saldırı hasarı kadar yanma uygular.',
        trigger: 'onAttack',
        chance: 0.3,
        effects: [dot('lowestHpEnemy', 'burn', 1, 2, 0.2)],
      },
    ],
  },
  {
    id: 'kozhan',
    name: 'Közhan',
    title: 'Lav Hükümdarı',
    faction: 'abyss',
    heroClass: 'mage',
    rarity: 5,
    base: { hp: 700, atk: 100, armor: 16, spd: 101 },
    innate: { hit: 0.05, crit: 0.05 },
    emoji: '🌋',
    active: {
      name: 'Lav Seli',
      description:
        'Tüm düşmanlara %105 saldırı hasarı verir, %75 şansla 3 tur boyunca her tur %30 saldırı hasarı kadar yanma uygular ve zırhlarını 2 tur %15 azaltır.',
      effects: [
        damage('allEnemies', 1.05),
        dot('previous', 'burn', 0.75, 3, 0.3),
        buff('previous', 'armor', -0.15, 2),
      ],
    },
    passives: [
      {
        name: 'Magma Kalbi',
        description: 'Kalıcı olarak %20 saldırı ve %10 yetenek hasarı kazanır.',
        stats: { atk: 0.2, skillDmg: 0.1 },
      },
      {
        name: 'Alev Dalgası',
        description: 'Her tur sonunda %35 şansla rastgele 2 düşmana %60 saldırı hasarı verir.',
        trigger: 'roundEnd',
        chance: 0.35,
        effects: [damage(randomEnemies(2), 0.6)],
      },
      {
        name: 'Küllerden Doğuş',
        description:
          'Öldüğünde tüm düşmanlara %80 saldırı hasarı verir ve 2 tur boyunca her tur %20 saldırı hasarı kadar yanma uygular.',
        trigger: 'onDeath',
        effects: [damage('allEnemies', 0.8), dot('previous', 'burn', 1, 2, 0.2)],
      },
    ],
  },
  {
    id: 'kizilboynuz',
    name: 'Kızılboynuz',
    title: 'Cehennem Kapısı Bekçisi',
    faction: 'abyss',
    heroClass: 'warrior',
    rarity: 5,
    base: { hp: 1040, atk: 74, armor: 30, spd: 93 },
    innate: { controlImmune: 0.1, crit: 0.05 },
    emoji: '👹',
    active: {
      name: 'Cehennem Kükremesi',
      description:
        'Ön sıradaki düşmanlara %160 saldırı hasarı verir (yanan hedeflere %50 fazla), %30 şansla 1 tur sersemletir ve kendini %120 saldırı gücü kadar iyileştirir.',
      effects: [
        damage('frontEnemies', 1.6, { bonusVsStatus: vs('burn', 1.5) }),
        control('previous', 'stun', 0.3, 1),
        heal('self', 1.2),
      ],
    },
    passives: [
      {
        name: 'Kızgın Deri',
        description: 'Kalıcı olarak %18 can ve %10 saldırı kazanır.',
        stats: { hp: 0.18, atk: 0.1 },
      },
      {
        name: 'Öfke Ateşi',
        description: 'Hasar aldığında %25 şansla 2 tur %15 saldırı kazanır.',
        trigger: 'onHit',
        chance: 0.25,
        effects: [buff('self', 'atk', 0.15, 2)],
      },
      {
        name: 'Yanan Toprak',
        description:
          'Savaş başında ön sıradaki düşmanlara %50 şansla 2 tur boyunca her tur %15 saldırı hasarı kadar yanma uygular.',
        trigger: 'battleStart',
        effects: [dot('frontEnemies', 'burn', 0.5, 2, 0.15)],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Orman (forest) — ancient trees, wild beasts, spores and venom.
// ---------------------------------------------------------------------------

const FOREST_HEROES: HeroDef[] = [
  {
    id: 'gobelek',
    name: 'Göbelek',
    title: 'Spor Büyücüsü',
    faction: 'forest',
    heroClass: 'mage',
    rarity: 2,
    base: { hp: 610, atk: 86, armor: 13, spd: 96 },
    emoji: '🍄',
    active: {
      name: 'Spor Bulutu',
      description:
        'Tüm düşmanlara %85 saldırı hasarı verir ve %25 şansla 2 tur boyunca her tur %15 saldırı hasarı kadar zehirler.',
      effects: [damage('allEnemies', 0.85), dot('previous', 'poison', 0.25, 2, 0.15)],
    },
    passives: [
      {
        name: 'Mantar Ağı',
        description: 'Kalıcı olarak %8 can ve %8 yetenek hasarı kazanır.',
        stats: { hp: 0.08, skillDmg: 0.08 },
      },
    ],
  },
  {
    id: 'sarmasik',
    name: 'Sarmaşık',
    title: 'Zehir Dikeni',
    faction: 'forest',
    heroClass: 'assassin',
    rarity: 3,
    base: { hp: 630, atk: 94, armor: 13, spd: 108 },
    innate: { crit: 0.1, critDmg: 0.1 },
    emoji: '🐍',
    active: {
      name: 'Zehirli Sarmal',
      description:
        'Canı en düşük düşmana %260 saldırı hasarı verir ve 3 tur boyunca her tur %25 saldırı hasarı kadar zehirler.',
      effects: [damage('lowestHpEnemy', 2.6), dot('previous', 'poison', 1, 3, 0.25)],
    },
    passives: [
      {
        name: 'Yosun Örtüsü',
        description: 'Kalıcı olarak %8 kaçınma ve %5 kritik şansı kazanır.',
        stats: { dodge: 0.08, crit: 0.05 },
      },
      {
        name: 'Zehir Kesesi',
        description:
          'Öldüğünde tüm düşmanlara %50 şansla 2 tur boyunca her tur %20 saldırı hasarı kadar zehir uygular.',
        trigger: 'onDeath',
        effects: [dot('allEnemies', 'poison', 0.5, 2, 0.2)],
      },
    ],
  },
  {
    id: 'meseyurek',
    name: 'Meşeyürek',
    title: 'Koru Bekçisi',
    faction: 'forest',
    heroClass: 'warrior',
    rarity: 4,
    base: { hp: 1010, atk: 66, armor: 31, spd: 88 },
    innate: { controlImmune: 0.1 },
    emoji: '🐻',
    active: {
      name: 'Kök Kıskacı',
      description:
        'Ön sıradaki düşmanlara %140 saldırı hasarı verir, %30 şansla 1 tur sersemletir ve kendi hasar azaltmasını 2 tur %15 artırır.',
      effects: [
        damage('frontEnemies', 1.4),
        control('previous', 'stun', 0.3, 1),
        buff('self', 'dmgReduce', 0.15, 2),
      ],
    },
    passives: [
      {
        name: 'Kalın Kabuk',
        description: 'Kalıcı olarak %15 can ve %15 zırh kazanır.',
        stats: { hp: 0.15, armor: 0.15 },
      },
      {
        name: 'Özsu',
        description: 'Her tur sonunda kendini %60 saldırı gücü kadar iyileştirir.',
        trigger: 'roundEnd',
        effects: [heal('self', 0.6)],
      },
    ],
  },
  {
    id: 'dikenok',
    name: 'Dikenok',
    title: 'Yaban Avcısı',
    faction: 'forest',
    heroClass: 'ranger',
    rarity: 5,
    base: { hp: 780, atk: 97, armor: 18, spd: 109 },
    innate: { hit: 0.1, crit: 0.08 },
    emoji: '🦌',
    active: {
      name: 'Diken Fırtınası',
      description:
        'Rastgele 3 düşmana %140 saldırı hasarı verir ve %80 şansla 3 tur boyunca her tur %30 saldırı hasarı kadar zehirler; ardından canı en düşük düşmana %100 saldırı hasarı verir (zehirli hedeflere %50 fazla).',
      effects: [
        damage(randomEnemies(3), 1.4),
        dot('previous', 'poison', 0.8, 3, 0.3),
        damage('lowestHpEnemy', 1.0, { bonusVsStatus: vs('poison', 1.5) }),
      ],
    },
    passives: [
      {
        name: 'Yaban Ruhu',
        description: 'Kalıcı olarak %15 saldırı ve %10 isabet kazanır.',
        stats: { atk: 0.15, hit: 0.1 },
      },
      {
        name: 'Rüzgâr Gibi',
        description: 'Savaş başında 2 tur 15 hız kazanır.',
        trigger: 'battleStart',
        effects: [buff('self', 'spd', 15, 2)],
      },
      {
        name: 'Sürü Öfkesi',
        description: 'Bir müttefik öldüğünde 3 tur %25 saldırı kazanır.',
        trigger: 'onAllyDeath',
        effects: [buff('self', 'atk', 0.25, 3)],
      },
    ],
  },
  {
    id: 'kokbilge',
    name: 'Kökbilge',
    title: 'Kadim Ağaç Ruhu',
    faction: 'forest',
    heroClass: 'priest',
    rarity: 5,
    base: { hp: 850, atk: 77, armor: 22, spd: 102 },
    innate: { dmgReduce: 0.05, controlImmune: 0.05 },
    emoji: '🌳',
    active: {
      name: 'Kadim Filiz',
      description:
        'Tüm müttefikleri %75 saldırı gücü kadar iyileştirir ve onlara 15 enerji verir; ardından canı en düşük müttefiki %100 saldırı gücü kadar daha iyileştirir.',
      effects: [heal('allAllies', 0.75), energy('previous', 15), heal('lowestHpAlly', 1.0)],
    },
    passives: [
      {
        name: 'Kök Salmış',
        description: 'Kalıcı olarak %20 can ve %15 kontrol bağışıklığı kazanır.',
        stats: { hp: 0.2, controlImmune: 0.15 },
      },
      {
        name: 'Yaprak Yağmuru',
        description: 'Her tur sonunda tüm müttefikleri %25 saldırı gücü kadar iyileştirir.',
        trigger: 'roundEnd',
        effects: [heal('allAllies', 0.25)],
      },
      {
        name: 'Toprağa Dönüş',
        description: 'Bir müttefik öldüğünde tüm müttefikleri %60 saldırı gücü kadar iyileştirir.',
        trigger: 'onAllyDeath',
        effects: [heal('allAllies', 0.6)],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Karanlık (dark) — graves, curses, bone and restless spirits.
// ---------------------------------------------------------------------------

const DARK_HEROES: HeroDef[] = [
  {
    id: 'karaca_baci',
    name: 'Karaca Bacı',
    title: 'Ruh Çağıran',
    faction: 'dark',
    heroClass: 'priest',
    rarity: 2,
    base: { hp: 720, atk: 65, armor: 17, spd: 96 },
    emoji: '⚱️',
    active: {
      name: 'Ruh Merhemi',
      description:
        'Tüm müttefikleri %45 saldırı gücü kadar iyileştirir ve saldırısı en yüksek düşmanın saldırısını 2 tur %15 azaltır.',
      effects: [heal('allAllies', 0.45), buff('highestAtkEnemy', 'atk', -0.15, 2)],
    },
    passives: [
      {
        name: 'Yas Ağıdı',
        description: 'Bir müttefik öldüğünde tüm müttefiklere 15 enerji verir.',
        trigger: 'onAllyDeath',
        effects: [energy('allAllies', 15)],
      },
    ],
  },
  {
    id: 'kara_akrep',
    name: 'Kara Akrep',
    title: 'Lanetli Nişancı',
    faction: 'dark',
    heroClass: 'ranger',
    rarity: 3,
    base: { hp: 690, atk: 89, armor: 16, spd: 103 },
    innate: { hit: 0.1 },
    emoji: '🦂',
    active: {
      name: 'Akrep İğnesi',
      description:
        'Rastgele bir düşmana %260 saldırı hasarı verir ve %60 şansla 3 tur boyunca her tur %25 saldırı hasarı kadar zehirler.',
      effects: [damage(randomEnemies(1), 2.6), dot('previous', 'poison', 0.6, 3, 0.25)],
    },
    passives: [
      {
        name: 'Sert Kabuk',
        description: 'Kalıcı olarak %10 zırh ve %8 isabet kazanır.',
        stats: { armor: 0.1, hit: 0.08 },
      },
      {
        name: 'Zehirli Kuyruk',
        description: 'Her tur sonunda rastgele bir düşmana %50 saldırı hasarı verir (zehirli hedeflere %100 fazla).',
        trigger: 'roundEnd',
        effects: [damage(randomEnemies(1), 0.5, { bonusVsStatus: vs('poison', 2.0) })],
      },
    ],
  },
  {
    id: 'zifir',
    name: 'Zifir',
    title: 'Lanet Örücü',
    faction: 'dark',
    heroClass: 'mage',
    rarity: 4,
    base: { hp: 670, atk: 93, armor: 15, spd: 99 },
    innate: { skillDmg: 0.05 },
    emoji: '🕸️',
    active: {
      name: 'Taş Laneti',
      description: 'Tüm düşmanlara %95 saldırı hasarı verir ve %15 şansla 2 tur taşlaştırır.',
      effects: [damage('allEnemies', 0.95), control('previous', 'petrify', 0.15, 2)],
    },
    passives: [
      {
        name: 'Yasak Bilgi',
        description: 'Kalıcı olarak %12 saldırı ve %8 yetenek hasarı kazanır.',
        stats: { atk: 0.12, skillDmg: 0.08 },
      },
      {
        name: 'Lanet Ağı',
        description: 'Her tur sonunda %30 şansla rastgele 2 düşmanın saldırısını 2 tur %10 azaltır.',
        trigger: 'roundEnd',
        chance: 0.3,
        effects: [buff(randomEnemies(2), 'atk', -0.1, 2)],
      },
    ],
  },
  {
    id: 'kefen',
    name: 'Kefen',
    title: 'Mezarlık Hayaleti',
    faction: 'dark',
    heroClass: 'assassin',
    rarity: 5,
    base: { hp: 710, atk: 102, armor: 16, spd: 113 },
    innate: { crit: 0.12, critDmg: 0.2 },
    emoji: '👻',
    active: {
      name: 'Ruh Hasadı',
      description:
        'Arka sıradaki düşmanlara %170 saldırı hasarı verir, enerjilerini 25 azaltır ve %20 şansla 1 tur dondurur.',
      effects: [damage('backEnemies', 1.7), energy('previous', -25), control('previous', 'freeze', 0.2, 1)],
    },
    passives: [
      {
        name: 'Ölümsüz Gölge',
        description: 'Kalıcı olarak %12 saldırı ve %12 kaçınma kazanır.',
        stats: { atk: 0.12, dodge: 0.12 },
      },
      {
        name: 'Ruh Emici',
        description: 'Her saldırıdan sonra %40 şansla kendini %80 saldırı gücü kadar iyileştirir.',
        trigger: 'onAttack',
        chance: 0.4,
        effects: [heal('self', 0.8)],
      },
      {
        name: 'Son Nefes',
        description: 'Öldüğünde canı en düşük düşmana %200 saldırı hasarı verir.',
        trigger: 'onDeath',
        effects: [damage('lowestHpEnemy', 2.0)],
      },
    ],
  },
  {
    id: 'kemikkiran',
    name: 'Kemikkıran',
    title: 'Kemik Taht Şövalyesi',
    faction: 'dark',
    heroClass: 'warrior',
    rarity: 5,
    base: { hp: 1080, atk: 70, armor: 33, spd: 91 },
    innate: { controlImmune: 0.1, dmgReduce: 0.05 },
    emoji: '🦴',
    active: {
      name: 'Kemik Yarması',
      description:
        'Ön sıradaki düşmanlara %150 saldırı hasarı verir, zırhlarını 2 tur %25 azaltır ve kendini %150 saldırı gücü kadar iyileştirir.',
      effects: [damage('frontEnemies', 1.5), buff('previous', 'armor', -0.25, 2), heal('self', 1.5)],
    },
    passives: [
      {
        name: 'Kemik Zırh',
        description: 'Kalıcı olarak %20 can, %10 zırh ve %5 hasar azaltma kazanır.',
        stats: { hp: 0.2, armor: 0.1, dmgReduce: 0.05 },
      },
      {
        name: 'Ölüm Reddi',
        description: 'Hasar aldığında %20 şansla kendini %100 saldırı gücü kadar iyileştirir.',
        trigger: 'onHit',
        chance: 0.2,
        effects: [heal('self', 1.0)],
      },
      {
        name: 'Lejyon Çağrısı',
        description: 'Bir müttefik öldüğünde kendini %150 saldırı gücü kadar iyileştirir ve 3 tur %20 zırh kazanır.',
        trigger: 'onAllyDeath',
        effects: [heal('self', 1.5), buff('self', 'armor', 0.2, 3)],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Işık (light) — sun, stars, dawn and holy oaths.
// ---------------------------------------------------------------------------

const LIGHT_HEROES: HeroDef[] = [
  {
    id: 'arslan',
    name: 'Arslan',
    title: 'Tapınak Muhafızı',
    faction: 'light',
    heroClass: 'warrior',
    rarity: 2,
    base: { hp: 920, atk: 62, armor: 26, spd: 87 },
    innate: { controlImmune: 0.05 },
    emoji: '🦁',
    active: {
      name: 'Aslan Pençesi',
      description: 'Ön sıradaki rastgele bir düşmana %250 saldırı hasarı verir ve %25 şansla 1 tur sersemletir.',
      effects: [damage('defaultEnemy', 2.5), control('previous', 'stun', 0.25, 1)],
    },
    passives: [
      {
        name: 'Yiğit Yürek',
        description: 'Kalıcı olarak %10 can ve %10 zırh kazanır.',
        stats: { hp: 0.1, armor: 0.1 },
      },
    ],
  },
  {
    id: 'akkanat',
    name: 'Akkanat',
    title: 'Gün Işığı Okçusu',
    faction: 'light',
    heroClass: 'ranger',
    rarity: 3,
    base: { hp: 700, atk: 88, armor: 16, spd: 104 },
    innate: { hit: 0.08, crit: 0.05 },
    emoji: '🕊️',
    active: {
      name: 'Gün Oku',
      description: 'Saldırısı en yüksek düşmana %260 saldırı hasarı verir ve zırhını 2 tur %20 azaltır.',
      effects: [damage('highestAtkEnemy', 2.6), buff('previous', 'armor', -0.2, 2)],
    },
    passives: [
      {
        name: 'Beyaz Tüy',
        description: 'Kalıcı olarak %8 isabet ve 4 hız kazanır.',
        stats: { hit: 0.08, spd: 4 },
      },
      {
        name: 'Umut Işığı',
        description: 'Her saldırıdan sonra %30 şansla canı en düşük müttefiki %80 saldırı gücü kadar iyileştirir.',
        trigger: 'onAttack',
        chance: 0.3,
        effects: [heal('lowestHpAlly', 0.8)],
      },
    ],
  },
  {
    id: 'simsek',
    name: 'Şimşek',
    title: 'Gök Hançeri',
    faction: 'light',
    heroClass: 'assassin',
    rarity: 4,
    base: { hp: 650, atk: 97, armor: 14, spd: 112 },
    innate: { crit: 0.12, critDmg: 0.1 },
    emoji: '⚡️',
    active: {
      name: 'Yıldırım Sıçraması',
      description: 'Rastgele 2 düşmana %190 saldırı hasarı verir ve %20 şansla 1 tur sersemletir.',
      effects: [damage(randomEnemies(2), 1.9), control('previous', 'stun', 0.2, 1)],
    },
    passives: [
      {
        name: 'Hızlı Adım',
        description: 'Kalıcı olarak %8 kritik şansı ve 6 hız kazanır.',
        stats: { crit: 0.08, spd: 6 },
      },
      {
        name: 'Statik Yük',
        description: 'Her saldırıdan sonra %25 şansla 30 enerji kazanır.',
        trigger: 'onAttack',
        chance: 0.25,
        effects: [energy('self', 30)],
      },
    ],
  },
  {
    id: 'yildizhan',
    name: 'Yıldızhan',
    title: 'Gök Kubbe Büyücüsü',
    faction: 'light',
    heroClass: 'mage',
    rarity: 5,
    base: { hp: 710, atk: 98, armor: 16, spd: 102 },
    innate: { skillDmg: 0.1 },
    emoji: '🌟',
    active: {
      name: 'Göksel Hüküm',
      description:
        'Tüm düşmanlara %110 saldırı hasarı verir ve %25 şansla 1 tur sersemletir; ardından canı en düşük düşmana %120 saldırı hasarı verir (sersemlemiş hedeflere %50 fazla).',
      effects: [
        damage('allEnemies', 1.1),
        control('previous', 'stun', 0.25, 1),
        damage('lowestHpEnemy', 1.2, { bonusVsStatus: vs('stun', 1.5) }),
      ],
    },
    passives: [
      {
        name: 'Yıldız Tozu',
        description: 'Kalıcı olarak %15 saldırı ve %8 kritik şansı kazanır.',
        stats: { atk: 0.15, crit: 0.08 },
      },
      {
        name: 'Kutup Yıldızı',
        description: 'Savaş başında tüm müttefiklerin isabetini 3 tur %10 artırır.',
        trigger: 'battleStart',
        effects: [buff('allAllies', 'hit', 0.1, 3)],
      },
      {
        name: 'Kayan Yıldız',
        description: 'Bir müttefik öldüğünde 3 tur %20 yetenek hasarı kazanır.',
        trigger: 'onAllyDeath',
        effects: [buff('self', 'skillDmg', 0.2, 3)],
      },
    ],
  },
  {
    id: 'tanyeri',
    name: 'Tanyeri',
    title: 'Şafak Rahibesi',
    faction: 'light',
    heroClass: 'priest',
    rarity: 5,
    base: { hp: 820, atk: 80, armor: 20, spd: 105 },
    innate: { controlImmune: 0.1 },
    emoji: '🌅',
    active: {
      name: 'Şafak Işığı',
      description:
        'Tüm müttefikleri %70 saldırı gücü kadar iyileştirir, saldırılarını 2 tur %20 ve kritik şanslarını 2 tur %10 artırır.',
      effects: [heal('allAllies', 0.7), buff('previous', 'atk', 0.2, 2), buff('previous', 'crit', 0.1, 2)],
    },
    passives: [
      {
        name: 'Gün Doğumu',
        description: 'Kalıcı olarak %15 can ve %10 saldırı kazanır.',
        stats: { hp: 0.15, atk: 0.1 },
      },
      {
        name: 'Kutsal Uyanış',
        description: 'Savaş başında tüm müttefiklere 20 enerji verir.',
        trigger: 'battleStart',
        effects: [energy('allAllies', 20)],
      },
      {
        name: 'Güneş Bereketi',
        description: 'Her tur sonunda %50 şansla canı en düşük müttefiki %80 saldırı gücü kadar iyileştirir.',
        trigger: 'roundEnd',
        chance: 0.5,
        effects: [heal('lowestHpAlly', 0.8)],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Roster & lookups
// ---------------------------------------------------------------------------

export const HEROES: HeroDef[] = [
  ...SHADOW_HEROES,
  ...FORTRESS_HEROES,
  ...ABYSS_HEROES,
  ...FOREST_HEROES,
  ...DARK_HEROES,
  ...LIGHT_HEROES,
];

const HEROES_BY_ID: ReadonlyMap<string, HeroDef> = new Map(HEROES.map((h) => [h.id, h]));

/**
 * Suggested new-game team (all rarity 2-3, includes warriors and a priest).
 * Suggested formation: front [batur, arslan], back [barutcu, cakmak, alevnur].
 */
export const STARTER_HERO_IDS: readonly string[] = ['batur', 'arslan', 'barutcu', 'cakmak', 'alevnur'];

/** Map lookup, falling back to the live list so defs registered after load (test fixtures) resolve too. */
function findHeroDef(id: string): HeroDef | undefined {
  return HEROES_BY_ID.get(id) ?? HEROES.find((h) => h.id === id);
}

/** Throws on unknown id. */
export function getHeroDef(id: string): HeroDef {
  const def = findHeroDef(id);
  if (!def) throw new Error(`Unknown hero: ${id}`);
  return def;
}

/** True if `id` is a known hero id (useful when validating save data). */
export function isHeroId(id: string): boolean {
  return findHeroDef(id) !== undefined;
}

/** Heroes grouped by natural rarity (2..5). */
export function heroesByRarity(rarity: number): HeroDef[] {
  return HEROES.filter((h) => h.rarity === rarity);
}

export function heroesByFaction(faction: Faction): HeroDef[] {
  return HEROES.filter((h) => h.faction === faction);
}
