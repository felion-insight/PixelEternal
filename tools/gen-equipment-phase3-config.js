#!/usr/bin/env node
/**
 * 生成 Phase 3 装备配置：base-types / affix-pool / legendary-powers / set-config-v2
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = (name) => path.join(ROOT, 'config', name);

const WEAPON_TYPES = ['sword', 'axe', 'hammer', 'spear', 'bow', 'crossbow', 'longbow', 'shortbow',
    'staff', 'book', 'orb', 'rune', 'dagger', 'claw', 'shortblade', 'chainblade'];

const WEAPON_BASE_VARIANTS = [
    { suffix: 'balanced', name: '均衡', atkMult: 1.0, spd: 1.2, implicit: { critDamage: 10 } },
    { suffix: 'heavy', name: '重击', atkMult: 1.35, spd: 0.8, implicit: { critDamage: 15 } },
    { suffix: 'swift', name: '迅捷', atkMult: 0.85, spd: 1.6, implicit: { critRate: 8 } },
    { suffix: 'arcane', name: '秘法', atkMult: 1.1, spd: 1.0, implicit: { lifeSteal: 2 } }
];

const MAGIC_WEAPON_TYPES = new Set(['staff', 'book', 'orb', 'rune']);
const ARMOR_SLOTS = ['helmet', 'body', 'hands', 'legs', 'feet'];
const ARMOR_STYLES = [
    { id: 'heavy', name: '重型', hpMult: 1.4, defMult: 1.5, implicit: { damageReduction: 2 } },
    { id: 'medium', name: '中型', hpMult: 1.0, defMult: 1.0, implicit: { dodge: 3 } },
    { id: 'light', name: '轻型', hpMult: 0.7, defMult: 0.7, implicit: { skillHaste: 5 } }
];

const OFFHAND_BY_CLASS = {
    warrior: [
        { id: 'light_shield', name: '轻盾', stats: { defense: 8, health: 20 }, implicit: { damageReduction: 1 } },
        { id: 'heavy_shield', name: '重盾', stats: { defense: 14, health: 40 }, implicit: { damageReduction: 3 } },
        { id: 'holy_shield', name: '圣盾', stats: { defense: 10, health: 30 }, implicit: { lifeSteal: 2 } }
    ],
    archer: [
        { id: 'light_quiver', name: '轻箭袋', stats: { attackSpeed: 8, critRate: 3 }, implicit: { attackSpeed: 5 } },
        { id: 'heavy_quiver', name: '重箭袋', stats: { attack: 6, critDamage: 12 }, implicit: { critDamage: 10 } },
        { id: 'element_quiver', name: '元素箭袋', stats: { attack: 4, critRate: 5 }, implicit: { skillHaste: 4 } }
    ],
    mage: [
        { id: 'spellbook', name: '魔典', stats: { magicAttack: 8, skillHaste: 5 }, implicit: { skillHaste: 5 } },
        { id: 'focus_orb', name: '法球', stats: { magicAttack: 6, magicDefense: 4 }, implicit: { skillHaste: 3 } },
        { id: 'element_orb', name: '元素球', stats: { magicAttack: 10 }, implicit: { critRate: 4 } }
    ],
    assassin: [
        { id: 'off_dagger', name: '副手匕首', stats: { critRate: 6, attackSpeed: 6 }, implicit: { critRate: 5 } },
        { id: 'poison_dagger', name: '毒匕', stats: { attack: 5, critRate: 4 }, implicit: { lifeSteal: 3 } },
        { id: 'shadow_dagger', name: '暗匕', stats: { critDamage: 15, dodge: 4 }, implicit: { dodge: 3 } }
    ]
};

const ACCESSORY_TYPES = {
    amulet: [
        { id: 'guard_amulet', name: '守护护符', stats: { damageReduction: 2, health: 15 } },
        { id: 'power_amulet', name: '力量护符', stats: { attack: 5, magicAttack: 5 } },
        { id: 'wisdom_amulet', name: '智慧护符', stats: { magicAttack: 8, skillHaste: 4 } }
    ],
    ring: [
        { id: 'attack_ring', name: '攻击戒指', stats: { critRate: 4, critDamage: 8 } },
        { id: 'defense_ring', name: '防御戒指', stats: { dodge: 4, defense: 4 } },
        { id: 'resource_ring', name: '资源戒指', stats: { skillHaste: 5, attackSpeed: 4 } }
    ],
    belt: [
        { id: 'vitality_belt', name: '巨力腰带', stats: { health: 30, defense: 3 } },
        { id: 'swift_belt', name: '迅捷腰带', stats: { moveSpeed: 5, attackSpeed: 4 } },
        { id: 'arcane_belt', name: '魔法腰带', stats: { skillHaste: 6, magicAttack: 4 } }
    ]
};

const QUALITY_PREFIXES = {
    normal: ['', ''],
    magic: ['微', '淬', '灵'],
    rare: ['辉', '湛', '锐'],
    epic: ['炽', '逆', '耀'],
    legendary: ['圣', '龙', '天'],
    mythic: ['神', '终', '无']
};

const CLASS_STYLE_WORDS = {
    warrior: ['铁', '钢', '龙', '圣', '盾'],
    archer: ['猎', '风', '羽', '迅', '踪'],
    mage: ['秘', '星', '咒', '织', '咏'],
    assassin: ['暗', '影', '夜', '潜', '隐']
};

function buildBaseTypes() {
    const weapons = {};
    for (const wt of WEAPON_TYPES) {
        const isMagic = MAGIC_WEAPON_TYPES.has(wt);
        for (const v of WEAPON_BASE_VARIANTS) {
            const id = `${wt}_${v.suffix}`;
            const atkKey = isMagic ? 'magicAttack' : 'attack';
            weapons[id] = {
                slot: 'weapon',
                weaponType: wt,
                name: `${v.name}${isMagic ? '法器' : '武器'}`,
                style: v.suffix,
                baseStatsPerLevel: {
                    [atkKey]: isMagic ? 1.8 * v.atkMult : 2.2 * v.atkMult,
                    critRate: v.suffix === 'swift' ? 0.3 : 0.15,
                    critDamage: v.suffix === 'heavy' ? 0.8 : 0.4
                },
                implicit: { ...v.implicit }
            };
        }
    }

    const offHand = {};
    for (const [cls, list] of Object.entries(OFFHAND_BY_CLASS)) {
        for (const o of list) {
            offHand[o.id] = { slot: 'offHand', name: o.name, classAffinity: cls, baseStats: o.stats, implicit: o.implicit || {} };
        }
    }

    const armor = {};
    for (const slot of ARMOR_SLOTS) {
        for (const st of ARMOR_STYLES) {
            const id = `${slot}_${st.id}`;
            armor[id] = {
                slot,
                name: `${st.name}${slot === 'helmet' ? '盔' : slot === 'body' ? '铠' : slot === 'hands' ? '手' : slot === 'legs' ? '腿' : '靴'}`,
                style: st.id,
                baseStatsPerLevel: {
                    health: 3 * st.hpMult,
                    defense: 1.2 * st.defMult,
                    magicDefense: 0.6 * st.defMult
                },
                implicit: { ...st.implicit }
            };
        }
    }

    const accessories = {};
    for (const [slot, list] of Object.entries(ACCESSORY_TYPES)) {
        for (const a of list) {
            accessories[a.id] = { slot, name: a.name, baseStatsPerLevel: scaleAccessory(a.stats), implicit: {} };
        }
    }

    function scaleAccessory(stats) {
        const out = {};
        for (const [k, v] of Object.entries(stats)) out[k] = v * 0.35;
        return out;
    }

    return {
        version: '1.0',
        qualityPrefixes: QUALITY_PREFIXES,
        classStyleWords: CLASS_STYLE_WORDS,
        weapons,
        offHand,
        armor,
        accessories
    };
}

function tierValues(min, max) {
    const tiers = [];
    const mults = [1, 1.3, 1.6, 2.0, 2.5];
    const minLv = [1, 10, 20, 35, 50];
    for (let i = 0; i < 5; i++) {
        tiers.push({
            tier: i + 1,
            minLevel: minLv[i],
            min: Math.round(min * mults[i]),
            max: Math.round(max * mults[i])
        });
    }
    return tiers;
}

function buildAffixPool() {
    const prefixes = [
        { id: 'assault', name: '强袭', stat: 'attack', isPercent: false, slots: ['weapon', 'hands', 'ring'], tiers: tierValues(5, 50), classWeights: { warrior: 2, assassin: 1.5 } },
        { id: 'vitality', name: '坚韧', stat: 'health', isPercent: false, slots: ['helmet', 'body', 'legs', 'belt'], tiers: tierValues(20, 200), classWeights: { warrior: 2 } },
        { id: 'bulwark', name: '壁垒', stat: 'defense', isPercent: false, slots: ['helmet', 'body', 'legs', 'feet'], tiers: tierValues(5, 40), classWeights: { warrior: 2 } },
        { id: 'arcane', name: '咒术', stat: 'magicAttack', isPercent: false, slots: ['weapon', 'helmet', 'amulet'], tiers: tierValues(4, 30), classWeights: { mage: 2 } },
        { id: 'mend', name: '治愈', stat: 'health', isPercent: false, slots: ['amulet', 'ring'], tiers: tierValues(15, 80), classWeights: { mage: 1.5 } },
        { id: 'leech', name: '汲取', stat: 'lifeSteal', isPercent: true, slots: ['weapon', 'hands'], tiers: tierValues(1, 5), classWeights: { assassin: 2, warrior: 1.5 } },
        { id: 'thorn', name: '荆棘', stat: 'thorn', isPercent: true, slots: ['body', 'legs'], tiers: tierValues(2, 25), classWeights: { warrior: 2 } },
        { id: 'flame', name: '火焰', stat: 'attack', isPercent: false, slots: ['weapon', 'amulet'], tiers: tierValues(3, 20), classWeights: { mage: 1.5 } }
    ];
    const suffixes = [
        { id: 'precision', name: '精准', stat: 'critRate', isPercent: true, slots: ['weapon', 'hands', 'ring'], tiers: tierValues(2, 12), classWeights: { archer: 2, assassin: 2 } },
        { id: 'deadly', name: '致命', stat: 'critDamage', isPercent: true, slots: ['weapon', 'hands', 'ring'], tiers: tierValues(8, 50), classWeights: { archer: 2, assassin: 2 } },
        { id: 'haste', name: '疾风', stat: 'attackSpeed', isPercent: true, slots: ['weapon', 'hands', 'feet'], tiers: tierValues(5, 25), classWeights: { archer: 2, assassin: 1.5 } },
        { id: 'swift', name: '迅捷', stat: 'moveSpeed', isPercent: true, slots: ['feet', 'belt'], tiers: tierValues(3, 15), classWeights: { archer: 2 } },
        { id: 'evasion', name: '闪避', stat: 'dodge', isPercent: true, slots: ['legs', 'feet', 'ring'], tiers: tierValues(2, 12), classWeights: { assassin: 2 } },
        { id: 'calm', name: '冷静', stat: 'skillHaste', isPercent: true, slots: ['helmet', 'amulet', 'belt'], tiers: tierValues(3, 15), classWeights: { mage: 2 } },
        { id: 'spring', name: '涌泉', stat: 'skillHaste', isPercent: true, slots: ['amulet', 'ring', 'belt'], tiers: tierValues(5, 25), classWeights: { mage: 2 } },
        { id: 'ward', name: '减伤', stat: 'damageReduction', isPercent: true, slots: ['body', 'helmet', 'amulet'], tiers: tierValues(1, 6), classWeights: { warrior: 2 } },
        { id: 'greed', name: '贪婪', stat: 'towerGoldBonus', isPercent: true, slots: ['belt', 'ring'], tiers: tierValues(5, 35), classWeights: {} }
    ];
    const tierColors = ['#cccccc', '#44cc44', '#4488ff', '#aa44ff', '#ff8800'];
    const tierNames = ['凡', '良', '湛', '炽', '曜'];
    return { version: '1.0', prefixes, suffixes, tierColors, tierNames,
        affixCounts: {
            normal: { prefixes: 0, suffixes: 0 },
            magic: { prefixes: 1, suffixes: [0, 1] },
            rare: { prefixes: [1, 2], suffixes: [1, 2] },
            epic: { prefixes: [2, 3], suffixes: 2 },
            legendary: { prefixes: 3, suffixes: 2 },
            mythic: { prefixes: 3, suffixes: 2 }
        }
    };
}

function buildLegendaryPowers() {
    const universal = [
        { id: 'dragon_breath', name: '龙息', description: '暴击时释放火焰吐息，对前方造成80%攻击力火焰伤害（冷却8s）', slots: ['weapon'], rarity: 'legendary' },
        { id: 'chain_lightning', name: '连锁闪电', description: '击杀敌人时释放闪电链，弹跳3次，每次50%攻击力伤害', slots: ['weapon'], rarity: 'legendary' },
        { id: 'thorn_aura', name: '荆棘光环', description: '常驻荆棘光环，每秒对周围敌人造成20%防御力伤害', slots: ['body'], rarity: 'legendary' },
        { id: 'phoenix', name: '不死鸟', description: '受到致命伤害时恢复40%最大HP并获得3秒无敌（冷却300s）', slots: ['body'], rarity: 'legendary' },
        { id: 'phantom_step', name: '幻影步', description: '闪避成功后移速+50%，持续2秒（冷却10s）', slots: ['feet'], rarity: 'legendary' },
        { id: 'frost_nova', name: '霜冻新星', description: '被击中时有20%概率释放冰霜新星，冰冻周围敌人2s', slots: ['helmet'], rarity: 'legendary' },
        { id: 'greed_power', name: '贪婪', description: '怪物掉落金币+50%，金币拾取范围+100%', slots: ['belt'], rarity: 'legendary' },
        { id: 'blood_rage', name: '血怒', description: 'HP每降低10%，伤害+5%', slots: ['amulet'], rarity: 'legendary' }
    ];
    const classPowers = {
        warrior: [
            { id: 'war_god_fury', name: '战神之怒', description: '使用职业技能后，4秒内普攻伤害+60%', slots: ['weapon', 'body'], rarity: 'legendary' },
            { id: 'immortal_shield', name: '不灭之盾', description: '格挡成功时回复8%最大HP（冷却6s）', slots: ['offHand', 'body'], rarity: 'legendary' },
            { id: 'titan_body', name: '泰坦之躯', description: '免疫击退，HP>80%时伤害+40%，HP<30%时减伤+40%', slots: ['body'], rarity: 'mythic' }
        ],
        archer: [
            { id: 'eagle_eye', name: '鹰眼', description: '与敌人距离>150时，伤害+35%，暴率+15%', slots: ['weapon'], rarity: 'legendary' },
            { id: 'arrow_rain', name: '箭雨', description: '使用职业技能后，3秒内对周围敌人造成300%总伤', slots: ['weapon'], rarity: 'legendary' },
            { id: 'wind_soul', name: '风行者之魂', description: '移动时积累风能，满层时下次攻击必暴击且+150%暴伤', slots: ['feet'], rarity: 'mythic' }
        ],
        mage: [
            { id: 'arcane_surge', name: '奥术洪流', description: '连续释放3个不同技能后，下一个技能伤害+80%且无消耗', slots: ['weapon', 'offHand'], rarity: 'legendary' },
            { id: 'mana_shield', name: '法力护盾', description: '消耗法力时30%转化为临时护盾（上限25%最大HP）', slots: ['amulet'], rarity: 'legendary' },
            { id: 'element_avatar', name: '元素化身', description: '法力>90%时所有伤害+50%，每秒对周围造成30%法强元素伤害', slots: ['body'], rarity: 'mythic' }
        ],
        assassin: [
            { id: 'assassinate', name: '暗杀', description: '对满血敌人首次伤害+150%，必定暴击', slots: ['weapon'], rarity: 'legendary' },
            { id: 'shadow_dance', name: '影之舞', description: '连续暴击3次后进入影舞状态4s：闪避+40%，暴伤+60%', slots: ['hands'], rarity: 'legendary' },
            { id: 'death_arrival', name: '死神降临', description: '击杀敌人时重置暗影步冷却，2s内下一个技能伤害+100%', slots: ['weapon'], rarity: 'mythic' }
        ]
    };
    return { version: '1.0', universal, classPowers, rollWeights: { universal: 0.6, class: 0.4 } };
}

function buildSetConfigV2() {
    return {
        version: '2.0',
        activationPieces: [2, 4],
        sets: {
            fireheart: {
                name: '烈焰之心',
                slots: ['weapon', 'body', 'hands', 'feet'],
                dropWeight: 1,
                effects: {
                    '2': { description: '攻击力+20，火属性伤害+25%', stats: { attack: 20 } },
                    '4': { description: '暴击时释放火焰新星（150%攻击力AOE，冷却6s）', special: 'fire_nova' }
                }
            },
            frostborn: {
                name: '霜寒之触',
                slots: ['helmet', 'body', 'legs', 'amulet'],
                dropWeight: 1,
                effects: {
                    '2': { description: '防御+15，HP+100', stats: { defense: 15, health: 100 } },
                    '4': { description: '被击中时25%概率冰冻攻击者2s', special: 'frost_touch' }
                }
            },
            stormfury: {
                name: '雷霆之怒',
                slots: ['weapon', 'hands', 'feet', 'ring'],
                dropWeight: 1,
                effects: {
                    '2': { description: '攻击速度+20%，移速+15%', stats: { attackSpeed: 20, moveSpeed: 15 } },
                    '4': { description: '每第5次攻击释放闪电（200%攻击力连锁3个敌人）', special: 'chain_strike' }
                }
            },
            starlight: {
                name: '星辰之辉',
                slots: ['helmet', 'body', 'amulet', 'ring'],
                dropWeight: 1,
                effects: {
                    '2': { description: '全属性+8%', stats: { allStats: 0.08 } },
                    '4': { description: '击杀敌人后全属性额外+5%（可叠3层，持续10s）', special: 'star_stack' }
                }
            },
            shadowmantle: {
                name: '暗影之拥',
                slots: ['hands', 'legs', 'feet', 'ring'],
                dropWeight: 1,
                effects: {
                    '2': { description: '闪避率+10%，暴伤+25%', stats: { dodge: 10, critDamage: 25 } },
                    '4': { description: '闪避成功时下一次攻击必暴击且+80%暴伤（冷却5s）', special: 'shadow_counter' }
                }
            },
            dragonblood: {
                name: '龙族血脉',
                slots: ['weapon', 'helmet', 'belt', 'amulet'],
                dropWeight: 0.8,
                effects: {
                    '2': { description: 'HP+150，防御+20', stats: { health: 150, defense: 20 } },
                    '4': { description: 'HP低于50%时伤害+30%，减伤+15%', special: 'dragon_rage' }
                }
            },
            valor: {
                name: '无畏壁垒',
                classAffinity: 'warrior',
                slots: ['helmet', 'body', 'offHand', 'belt'],
                dropWeight: 0.6,
                effects: {
                    '2': { description: '防御+25，生命+120', stats: { defense: 25, health: 120 } },
                    '4': { description: '受到攻击时20%概率获得护盾（15%最大HP）', special: 'valor_shield' }
                }
            },
            windchaser: {
                name: '追风者',
                classAffinity: 'archer',
                slots: ['hands', 'feet', 'ring', 'amulet'],
                dropWeight: 0.6,
                effects: {
                    '2': { description: '攻速+25%，移速+15%', stats: { attackSpeed: 25, moveSpeed: 15 } },
                    '4': { description: '与敌人距离>100时，伤害+20%', special: 'windchaser_range' }
                }
            },
            arcane: {
                name: '秘法之源',
                classAffinity: 'mage',
                slots: ['weapon', 'offHand', 'helmet', 'amulet'],
                dropWeight: 0.6,
                effects: {
                    '2': { description: '技能伤害+15%，法力恢复+30%', stats: { magicAttack: 15, skillHaste: 10 } },
                    '4': { description: '释放技能后2秒内下一个技能伤害+35%', special: 'arcane_combo' }
                }
            },
            shadow: {
                name: '暗影行者',
                classAffinity: 'assassin',
                slots: ['weapon', 'hands', 'legs', 'feet'],
                dropWeight: 0.6,
                effects: {
                    '2': { description: '暴率+12%，闪避+8%', stats: { critRate: 12, dodge: 8 } },
                    '4': { description: '背刺伤害+40%，暴击后移速+30%', special: 'shadow_strike' }
                }
            }
        }
    };
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    console.log('Wrote', path.relative(ROOT, file));
}

writeJson(OUT('base-types.json'), buildBaseTypes());
writeJson(OUT('affix-pool.json'), buildAffixPool());
writeJson(OUT('legendary-powers.json'), buildLegendaryPowers());
writeJson(OUT('set-config-v2.json'), buildSetConfigV2());

// deployment mirror
const DEP = path.join(ROOT, 'deployment', 'config');
for (const f of ['base-types.json', 'affix-pool.json', 'legendary-powers.json', 'set-config-v2.json']) {
    fs.copyFileSync(OUT(f), path.join(DEP, f));
}
console.log('Synced to deployment/config/');
