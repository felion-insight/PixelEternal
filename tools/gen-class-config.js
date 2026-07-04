const fs = require('fs');
const path = require('path');

/** 战场定位：breaker / striker / anomaly / support / switch */
const BATTLE_ROLES = {
    warrior: { role: 'mdps', battleRole: 'striker', battleRoleName: '强攻手·基础' },
    archer: { role: 'rdps', battleRole: 'striker', battleRoleName: '强攻手·远程' },
    mage: { role: 'rdps', battleRole: 'anomaly', battleRoleName: '异常手·元素' },
    assassin: { role: 'mdps', battleRole: 'switch', battleRoleName: '速切手·敏捷' },
    knight: { role: 'tank', battleRole: 'breaker', battleRoleName: '击破手·坦克' },
    berserker: { role: 'mdps', battleRole: 'striker', battleRoleName: '强攻手·近战' },
    guardian: { role: 'tank', battleRole: 'support', battleRoleName: '支援手·坦辅' },
    ranger: { role: 'rdps', battleRole: 'anomaly', battleRoleName: '异常手·宠物' },
    marksman: { role: 'rdps', battleRole: 'striker', battleRoleName: '强攻手·远程' },
    windrunner: { role: 'mdps', battleRole: 'switch', battleRoleName: '速切手·机动' },
    wizard: { role: 'rdps', battleRole: 'striker', battleRoleName: '强攻手·AOE' },
    sage: { role: 'healer', battleRole: 'support', battleRoleName: '支援手·治疗' },
    warlock: { role: 'rdps', battleRole: 'anomaly', battleRoleName: '异常手·召唤' },
    shadowdancer: { role: 'mdps', battleRole: 'breaker', battleRoleName: '击破手·爆发' },
    trickster: { role: 'support', battleRole: 'switch', battleRoleName: '速切手·控制' },
    venomancer: { role: 'mdps', battleRole: 'anomaly', battleRoleName: '异常手·DOT' },
    paladin: { role: 'tank', battleRole: 'breaker', battleRoleName: '击破手·支援坦' },
    destroyer: { role: 'mdps', battleRole: 'striker', battleRoleName: '强攻手·斩杀' },
    temple_knight: { role: 'tank', battleRole: 'support', battleRoleName: '支援手·守护坦' },
    beastmaster: { role: 'rdps', battleRole: 'anomaly', battleRoleName: '异常手·宠物领主' },
    deadeye: { role: 'rdps', battleRole: 'striker', battleRoleName: '强攻手·狙击' },
    phantom: { role: 'mdps', battleRole: 'switch', battleRoleName: '速切手·分身' },
    archmage: { role: 'rdps', battleRole: 'striker', battleRoleName: '强攻手·元素' },
    oracle: { role: 'healer', battleRole: 'support', battleRoleName: '支援手·时空' },
    necromancer: { role: 'rdps', battleRole: 'anomaly', battleRoleName: '异常手·亡灵' },
    nightblade: { role: 'mdps', battleRole: 'breaker', battleRoleName: '击破手·暗杀' },
    illusionist: { role: 'support', battleRole: 'switch', battleRoleName: '速切手·幻象' },
    plaguebringer: { role: 'mdps', battleRole: 'anomaly', battleRoleName: '异常手·瘟疫' }
};

/** 核心技能进化槽位（一转20级 / 二转40级替换对应核心技能形态） */
const EVOLUTION_SLOTS = {
    knight: { slot: 'core1', first: 'holy_shield_bash', second: 'judgment_shield' },
    berserker: { slot: 'core2', first: 'furious_charge', second: 'devastation_charge' },
    guardian: { slot: 'survival', first: 'guardian_stance', second: 'holy_domain' },
    ranger: { slot: 'core1', first: 'summon_wolf', second: 'beast_pack' },
    marksman: { slot: 'core2', first: 'aimed_shot', second: 'perfect_shot' },
    windrunner: { slot: 'survival', first: 'wind_step', second: 'phantom_clone' },
    wizard: { slot: 'core1', first: 'flame_bolt', second: 'lava_storm' },
    sage: { slot: 'core2', first: 'healing_wave', second: 'foresight' },
    warlock: { slot: 'survival', first: 'summon_skeleton', second: 'skeleton_legion' },
    shadowdancer: { slot: 'core1', first: 'shadow_strike', second: 'shadow_assault' },
    trickster: { slot: 'core2', first: 'illusion', second: 'quintuple_illusion' },
    venomancer: { slot: 'survival', first: 'venom_blade', second: 'plague' }
};

const baseTemplates = {
    warrior: { name: '战士', role: 'mdps', resource: { type: 'rage', max: 100, regen: 5 }, baseStats: { hp: 150, attack: 10, defense: 8, magicAttack: 5, magicDefense: 6, speed: 5, critical: 5, dodge: 3 }, growth: { hp: 22, attack: 2.5, defense: 1.8, magicAttack: 0.5, magicDefense: 1, speed: 0.2, critical: 0.3, dodge: 0.15 }, skills: ['basic_attack', 'shield_bash', 'charge', 'defensive_stance'], adv: ['knight', 'berserker', 'guardian'] },
    archer: { name: '弓箭手', role: 'rdps', resource: { type: 'focus', max: 100, regen: 8 }, baseStats: { hp: 100, attack: 9, defense: 5, magicAttack: 4, magicDefense: 5, speed: 7, critical: 8, dodge: 8 }, growth: { hp: 15, attack: 2.2, defense: 1, magicAttack: 0.4, magicDefense: 0.8, speed: 0.35, critical: 0.5, dodge: 0.25 }, skills: ['basic_shot', 'backstep_shot', 'poison_arrow', 'rapid_shot'], adv: ['ranger', 'marksman', 'windrunner'] },
    mage: { name: '法师', role: 'rdps', resource: { type: 'mana', max: 200, regen: 10 }, baseStats: { hp: 80, attack: 5, defense: 4, magicAttack: 12, magicDefense: 8, speed: 4, critical: 6, dodge: 3 }, growth: { hp: 12, attack: 0.8, defense: 0.8, magicAttack: 3, magicDefense: 1.5, speed: 0.15, critical: 0.35, dodge: 0.1 }, skills: ['arcane_missile', 'fireball', 'ice_armor', 'blink'], adv: ['wizard', 'sage', 'warlock'] },
    assassin: { name: '刺客', role: 'mdps', resource: { type: 'energy', max: 120, regen: 12 }, baseStats: { hp: 90, attack: 11, defense: 4, magicAttack: 6, magicDefense: 5, speed: 8, critical: 10, dodge: 12 }, growth: { hp: 14, attack: 2.8, defense: 0.9, magicAttack: 0.6, magicDefense: 0.7, speed: 0.4, critical: 0.55, dodge: 0.35 }, skills: ['basic_stab', 'shadow_step', 'smoke_bomb', 'vanish'], adv: ['shadowdancer', 'trickster', 'venomancer'] }
};

const firstAdv = {
    knight: { name: '骑士', base: 'warrior', role: 'tank', mod: { hp: 1.2, attack: 0.9, defense: 1.3, magicAttack: 0.8, magicDefense: 1.1, speed: 0.9, critical: 0.8, dodge: 0.7 }, resource: { type: 'rage', max: 100, regen: 6 }, adv: ['paladin'] },
    berserker: { name: '狂战士', base: 'warrior', role: 'mdps', mod: { hp: 1.1, attack: 1.35, defense: 0.85, magicAttack: 0.7, magicDefense: 0.9, speed: 1.05, critical: 1.2, dodge: 0.6 }, resource: { type: 'rage', max: 120, regen: 8 }, adv: ['destroyer'] },
    guardian: { name: '守护者', base: 'warrior', role: 'tank', mod: { hp: 1.35, attack: 0.85, defense: 1.4, magicAttack: 0.75, magicDefense: 1.2, speed: 0.85, critical: 0.75, dodge: 0.65 }, resource: { type: 'guard', max: 100, regen: 4 }, adv: ['temple_knight'] },
    ranger: { name: '游侠', base: 'archer', role: 'rdps', mod: { hp: 1.05, attack: 1.1, defense: 1, magicAttack: 0.9, magicDefense: 1, speed: 1.1, critical: 1.05, dodge: 1.1 }, resource: { type: 'pet_energy', max: 100, regen: 5 }, adv: ['beastmaster'] },
    marksman: { name: '神射手', base: 'archer', role: 'rdps', mod: { hp: 0.95, attack: 1.25, defense: 0.9, magicAttack: 0.85, magicDefense: 0.95, speed: 0.95, critical: 1.3, dodge: 0.9 }, resource: { type: 'ammo', max: 30, regen: 3 }, adv: ['deadeye'] },
    windrunner: { name: '风行者', base: 'archer', role: 'mdps', mod: { hp: 1, attack: 1.05, defense: 0.95, magicAttack: 0.9, magicDefense: 1, speed: 1.25, critical: 1.1, dodge: 1.25 }, resource: { type: 'wind_mark', max: 100, regen: 10 }, adv: ['phantom'] },
    wizard: { name: '巫师', base: 'mage', role: 'rdps', mod: { hp: 0.9, attack: 0.85, defense: 0.85, magicAttack: 1.35, magicDefense: 1.05, speed: 0.95, critical: 1.1, dodge: 0.9 }, resource: { type: 'mana', max: 220, regen: 12 }, adv: ['archmage'] },
    sage: { name: '贤者', base: 'mage', role: 'healer', mod: { hp: 1.15, attack: 0.8, defense: 1.1, magicAttack: 1.05, magicDefense: 1.25, speed: 0.9, critical: 0.85, dodge: 0.95 }, resource: { type: 'mana', max: 250, regen: 15 }, adv: ['oracle'] },
    warlock: { name: '术士', base: 'mage', role: 'rdps', mod: { hp: 0.95, attack: 0.9, defense: 0.9, magicAttack: 1.25, magicDefense: 1, speed: 0.95, critical: 1.05, dodge: 0.85 }, resource: { type: 'soul_shard', max: 100, regen: 6 }, adv: ['necromancer'] },
    shadowdancer: { name: '影舞者', base: 'assassin', role: 'mdps', mod: { hp: 0.95, attack: 1.2, defense: 0.9, magicAttack: 0.95, magicDefense: 0.95, speed: 1.15, critical: 1.25, dodge: 1.2 }, resource: { type: 'combo_point', max: 5, regen: 0 }, adv: ['nightblade'] },
    trickster: { name: '骗术师', base: 'assassin', role: 'support', mod: { hp: 1, attack: 1, defense: 1, magicAttack: 1.1, magicDefense: 1.05, speed: 1.1, critical: 1, dodge: 1.15 }, resource: { type: 'illusion', max: 100, regen: 8 }, adv: ['illusionist'] },
    venomancer: { name: '毒师', base: 'assassin', role: 'mdps', mod: { hp: 1.05, attack: 1.05, defense: 1, magicAttack: 1.15, magicDefense: 1, speed: 1, critical: 1, dodge: 1 }, resource: { type: 'poison_stack', max: 10, regen: 0 }, adv: ['plaguebringer'] }
};

const secondAdv = {
    paladin: { name: '圣骑士', first: 'knight', role: 'tank', mod: { hp: 1.15, attack: 0.95, defense: 1.2, magicAttack: 1.1, magicDefense: 1.3, speed: 0.9, critical: 0.85, dodge: 0.7 } },
    destroyer: { name: '毁灭者', first: 'berserker', role: 'mdps', mod: { hp: 1.05, attack: 1.2, defense: 0.8, magicAttack: 0.75, magicDefense: 0.85, speed: 1, critical: 1.25, dodge: 0.55 } },
    temple_knight: { name: '神殿骑士', first: 'guardian', role: 'tank', mod: { hp: 1.2, attack: 0.9, defense: 1.25, magicAttack: 1, magicDefense: 1.35, speed: 0.85, critical: 0.8, dodge: 0.65 } },
    beastmaster: { name: '兽王', first: 'ranger', role: 'rdps', mod: { hp: 1.1, attack: 1.15, defense: 1.05, magicAttack: 0.95, magicDefense: 1, speed: 1.05, critical: 1.1, dodge: 1 } },
    deadeye: { name: '死眼', first: 'marksman', role: 'rdps', mod: { hp: 0.9, attack: 1.3, defense: 0.85, magicAttack: 0.8, magicDefense: 0.9, speed: 0.9, critical: 1.4, dodge: 0.85 } },
    phantom: { name: '幻影', first: 'windrunner', role: 'mdps', mod: { hp: 0.95, attack: 1.1, defense: 0.9, magicAttack: 0.95, magicDefense: 0.95, speed: 1.35, critical: 1.15, dodge: 1.35 } },
    archmage: { name: '大魔导师', first: 'wizard', role: 'rdps', mod: { hp: 0.85, attack: 0.8, defense: 0.8, magicAttack: 1.45, magicDefense: 1.1, speed: 0.9, critical: 1.15, dodge: 0.85 } },
    oracle: { name: '先知', first: 'sage', role: 'healer', mod: { hp: 1.1, attack: 0.85, defense: 1.15, magicAttack: 1.15, magicDefense: 1.35, speed: 0.85, critical: 0.8, dodge: 0.9 } },
    necromancer: { name: '死灵法师', first: 'warlock', role: 'rdps', mod: { hp: 1, attack: 0.85, defense: 0.95, magicAttack: 1.35, magicDefense: 1.05, speed: 0.9, critical: 1, dodge: 0.8 } },
    nightblade: { name: '夜刃', first: 'shadowdancer', role: 'mdps', mod: { hp: 0.9, attack: 1.3, defense: 0.85, magicAttack: 1, magicDefense: 0.9, speed: 1.2, critical: 1.35, dodge: 1.25 } },
    illusionist: { name: '幻术师', first: 'trickster', role: 'support', mod: { hp: 0.95, attack: 1.05, defense: 0.95, magicAttack: 1.25, magicDefense: 1.1, speed: 1.15, critical: 1.05, dodge: 1.2 } },
    plaguebringer: { name: '瘟疫使者', first: 'venomancer', role: 'mdps', mod: { hp: 1.1, attack: 1.1, defense: 1.05, magicAttack: 1.25, magicDefense: 1.05, speed: 0.95, critical: 1.05, dodge: 0.95 } }
};

function attachBattleRole(def, classId) {
    const br = BATTLE_ROLES[classId] || {};
    def.battleRole = br.battleRole || 'striker';
    def.battleRoleName = br.battleRoleName || def.name;
    if (EVOLUTION_SLOTS[classId]) {
        def.skillEvolution = EVOLUTION_SLOTS[classId];
    }
    return def;
}

const out = { version: '2.0', baseClasses: {}, firstAdvancements: {}, secondAdvancements: {}, battleRoles: BATTLE_ROLES, evolutionSlots: EVOLUTION_SLOTS };

for (const [id, t] of Object.entries(baseTemplates)) {
    out.baseClasses[id] = attachBattleRole({
        id,
        name: t.name,
        description: `${t.name} — 基础职业`,
        icon: `assets/icons/classes/${id}.png`,
        role: t.role,
        baseStats: t.baseStats,
        growthPerLevel: t.growth,
        resource: t.resource,
        skills: t.skills,
        advancements: t.adv
    }, id);
}

for (const [id, t] of Object.entries(firstAdv)) {
    out.firstAdvancements[id] = attachBattleRole({
        id,
        name: t.name,
        baseClass: t.base,
        requiredLevel: 20,
        description: t.name,
        icon: `assets/icons/classes/${id}.png`,
        role: t.role,
        statsModifier: t.mod,
        resource: t.resource,
        advancements: t.adv
    }, id);
}

for (const [id, t] of Object.entries(secondAdv)) {
    out.secondAdvancements[id] = attachBattleRole({
        id,
        name: t.name,
        firstAdvancement: t.first,
        requiredLevel: 40,
        description: t.name,
        icon: `assets/icons/classes/${id}.png`,
        role: t.role,
        statsModifier: t.mod
    }, id);
}

const target = path.join(__dirname, '..', 'config', 'class-config.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote', target);
