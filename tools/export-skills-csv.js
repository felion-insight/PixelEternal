#!/usr/bin/env node
/**
 * 导出全部职业技能到 CSV（含描述与实现说明）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'skill-config.json'), 'utf8'));

const CLASS_NAMES = {
    warrior: '战士', archer: '弓手', mage: '法师', assassin: '刺客',
    knight: '骑士', berserker: '狂战士', guardian: '守护者', ranger: '游侠',
    marksman: '神射手', windrunner: '风行者', wizard: '巫师', sage: '贤者',
    warlock: '术士', shadowdancer: '影舞者', trickster: '诡术师', venomancer: '毒师',
    paladin: '圣骑士', destroyer: '毁灭者', temple_knight: '神殿骑士',
    beastmaster: '兽王', deadeye: '死神', phantom: '幻影', archmage: '大法师',
    oracle: '先知', necromancer: '死灵法师', nightblade: '夜刃',
    illusionist: '幻术师', plaguebringer: '瘟疫使者'
};

const IMPL_DESC = {
    basic_attack: '普攻 — 走玩家普通攻击逻辑 Player.attack()，非 executeClassSkill',
    passive: '被动 — executeClassSkill 直接跳过，无战斗释放逻辑',
    standard_damage: '标准伤害 — executeClassSkill 单目标/AOE 伤害（burst 标签仅描述用）',
    'primary:damage_reduction': '减伤 Buff — applyClassSkillPrimaryEffect → player.buffs + updateStats',
    'primary:attack_buff': '加攻 Buff — player.buffs.effects.attackPercent',
    'primary:attack_speed_buff': '攻速 Buff — player.buffs.effects.attackSpeedPercent',
    'primary:shield': '护盾 — player.buffs.shieldRemaining，takeDamage 时吸收',
    'primary:heal': '治疗 — 直接恢复 maxHp 百分比',
    'primary:mark': '标记 — monster._classSkillMark，getClassSkillMarkBonus 加成伤害',
    'primary:blink': '位移 — blinkTo 瞬移 + 短暂无敌',
    'primary:stealth': '潜行 — dodge/moveSpeed Buff',
    'primary:taunt': '嘲讽 — 减伤 Buff + monster._tauntTarget',
    'primary:guard': '援护 — 高减伤 Buff',
    'primary:berserk': '狂暴 — attackPercent/attackSpeed/defensePenalty Buff',
    'primary:dodge_buff': '闪避 Buff — dodge/moveSpeed',
    'primary:cleanse': '净化 — 清除 slowEffects + slowImmune Buff',
    'primary:ice_armor': '冰甲 — 减伤 Buff + applyPlayerDefenseSkillOnHit 近战减速',
    'hybrid:stun': '伤害+眩晕 — takeDamage 后 monster.frozenUntil',
    'hybrid:slow': '伤害+减速 — monster.slowEffects',
    'hybrid:poison_dot': '伤害+毒 DOT — player.weaponSkillDots 每秒 tick',
    'hybrid:charge': '冲锋 — blinkTo 接近目标 + 路径伤害 + 减速',
    'hybrid:backstep': '后跳 — 反向 blink + 多箭 takeDamage',
    'hybrid:fireball': '火球 AOE — 范围伤害 + 爆炸特效',
    'hybrid:freeze': '冰冻陷阱 — 范围 frozenUntil',
    'hybrid:life_drain': '生命吸取 — 伤害 + 自身回血',
    'hybrid:blink_behind': '暗影步 — 瞬移背后 + 背刺伤害',
    'hybrid:dodge_buff': '烟雾/闪避 — dodge Buff（无伤害时）'
};

function getImpl(s) {
    if (s.skillEffect) return s.skillEffect.mode + ':' + s.skillEffect.type;
    if (s.type === 'passive') return 'passive';
    if (s.type === 'basic') return 'basic_attack';
    return 'standard_damage';
}

function getCodeFile(impl) {
    if (impl === 'basic_attack') return 'js/game-entities.js (Player.attack)';
    if (impl === 'passive') return 'js/skill-system.js (跳过释放)';
    if (impl.startsWith('primary:') || impl.startsWith('hybrid:')) {
        return 'js/skill-system.js + js/class-skill-effects.js';
    }
    return 'js/skill-system.js (executeClassSkill)';
}

function esc(v) {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

const headers = [
    '职业ID', '职业名称', '技能ID', '技能名称', '槽位', '技能类型',
    '解锁等级', '资源类型', '资源消耗', '冷却毫秒', '伤害倍率', '射程', 'AOE半径',
    '效果标签', 'skillEffect类型', 'skillEffect模式', '游戏内描述', '实现类型', '实现说明',
    '配置来源文件', '主要代码文件'
];

const rows = [headers.join(',')];
const sorted = Object.entries(d.skills).sort((a, b) => {
    const ca = a[1].classId;
    const cb = b[1].classId;
    if (ca !== cb) return ca.localeCompare(cb);
    return a[0].localeCompare(b[0]);
});

for (const [id, s] of sorted) {
    const impl = getImpl(s);
    const se = s.skillEffect || {};
    rows.push([
        s.classId,
        CLASS_NAMES[s.classId] || s.classId,
        id,
        s.name,
        s.slotType,
        s.type,
        s.unlockLevel,
        s.resourceType || '',
        s.resourceCost ?? '',
        s.cooldownMs ?? '',
        s.damageMultiplier ?? '',
        s.range ?? '',
        s.aoeRadius ?? '',
        (s.effectTags || []).join('|'),
        se.type || '',
        se.mode || '',
        s.description || '',
        impl,
        IMPL_DESC[impl] || impl,
        'config/skill-config.json',
        getCodeFile(impl)
    ].map(esc).join(','));
}

const outDir = path.join(ROOT, 'docs');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'skills-export.csv');
fs.writeFileSync(out, '\ufeff' + rows.join('\n'), 'utf8');
console.log('Wrote ' + out + ' — ' + sorted.length + ' skills');
