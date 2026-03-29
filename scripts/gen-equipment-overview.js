/**
 * 生成 docs/装备一览.md（常规 + 深阶 + 套装）
 * 运行: node scripts/gen-equipment-overview.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outPath = path.join(root, 'docs', '装备一览.md');

const base = JSON.parse(fs.readFileSync(path.join(root, 'config', 'equipment-config.json'), 'utf8')).EQUIPMENT_DEFINITIONS;
const deep = JSON.parse(fs.readFileSync(path.join(root, 'config', 'equipment-deep-config.json'), 'utf8')).EQUIPMENT_DEEP_DEFINITIONS;
const sets = JSON.parse(fs.readFileSync(path.join(root, 'config', 'set-config.json'), 'utf8')).SET_DEFINITIONS;
const deepSets = JSON.parse(fs.readFileSync(path.join(root, 'config', 'set-deep-config.json'), 'utf8')).SET_DEEP_DEFINITIONS;
const suffixTable = JSON.parse(fs.readFileSync(path.join(root, 'config', 'deep-suffix-table.json'), 'utf8'));

const SLOT = {
  weapon: '武器',
  helmet: '头盔',
  chest: '胸甲',
  legs: '腿甲',
  boots: '足具',
  necklace: '项链',
  ring: '指环',
  belt: '腰带'
};
const Q = { common: '普通', rare: '稀有', fine: '精良', epic: '史诗', legendary: '传说' };

const MECH = ['lifeSteal', 'thorn', 'skillHaste', 'damageReduction', 'towerGoldBonus'];

function mechTail(e) {
  const ex = [];
  MECH.forEach((k) => {
    if (e[k] != null) ex.push(`${k}:${e[k]}`);
  });
  return ex.length ? ` · ${ex.join(' ')}` : '';
}

function statLine(e) {
  if (e.slot === 'weapon') {
    const rt = e.weaponType === 'ranged' ? '远程' : '近战';
    return `${rt} 攻${e.attack} 暴率${e.critRate}% 暴伤${e.critDamage}%${mechTail(e)}`;
  }
  if (['helmet', 'chest', 'legs'].includes(e.slot)) {
    return `生命${e.health} 防御${e.defense}${mechTail(e)}`;
  }
  if (e.slot === 'boots') {
    let s = `生命${e.health} 防御${e.defense}${mechTail(e)}`;
    if (e.moveSpeed != null) s += ` · 靴移速+${e.moveSpeed}%`;
    return s;
  }
  const j = [];
  if (e.dodge != null) j.push(`闪避${e.dodge}%`);
  if (e.attackSpeed != null) j.push(`攻速${e.attackSpeed}%`);
  if (e.moveSpeed != null) j.push(`移速${e.moveSpeed}%`);
  return `${j.length ? j.join(' ') : '—'}${mechTail(e)}`;
}

function esc(s) {
  return String(s).replace(/\|/g, '\\|');
}

/** 与 js/data-classes.js DEEP_TRAIT_FAMILY_BY_LINE 一致（生成文档用） */
const LINE_FAMILIES = {
  melee: 'sigil, rend, mire, fork, cull',
  ranged: 'snipe, ricochet, weaken, volley, star',
  helmet: 'aegis, bastion, pulse, mirror, last',
  chest: 'spike, dampen, echo, riposte, bulwark',
  legs: 'surge, grit, ram, strike, overdrive',
  boots: 'chase, rush, trace, flash, surge',
  necklace: 'mend, skill, snare, arc, well',
  ring: 'twin, sever, fervor, tempo, greed',
  belt: 'tithe, hoard, covet, elite, fortune'
};

const LINE_LABEL = {
  melee: '武器·近战',
  ranged: '武器·远程',
  helmet: '头盔',
  chest: '胸甲',
  legs: '腿甲',
  boots: '足具',
  necklace: '项链',
  ring: '指环',
  belt: '腰带'
};

const LINE_ORDER = ['melee', 'ranged', 'helmet', 'chest', 'legs', 'boots', 'necklace', 'ring', 'belt'];
const THEMES = [
  ['渊隙', 25],
  ['虚印', 30],
  ['腐噬', 35],
  ['黑曜', 40],
  ['终幕', 45],
  ['星骸', 50],
  ['裂点', 55],
  ['终焉', 60]
];

const out = [];
out.push('# Pixel Eternal 装备一览');
out.push('');
out.push(
  '> 由 `config/equipment-config.json`、`config/equipment-deep-config.json`、`config/deep-suffix-table.json` 与套装配置整理。游戏内数值会随强化、精炼变化；机制类字段（吸血、反伤、技能急速、减伤、塔金币加成等）不按强化倍率放大。'
);
out.push('');
out.push('## 部位与品质');
out.push('');
out.push('| 部位代码 | 中文 |');
out.push('|----------|------|');
Object.entries(SLOT).forEach(([k, v]) => out.push(`| \`${k}\` | ${v} |`));
out.push('');
out.push('| 品质代码 | 中文 |');
out.push('|----------|------|');
Object.entries(Q).forEach(([k, v]) => out.push(`| \`${k}\` | ${v} |`));
out.push('');
out.push(`## 常规装备（${base.length} 件）`);
out.push('');
['weapon', 'helmet', 'chest', 'legs', 'boots', 'necklace', 'ring', 'belt'].forEach((slot) => {
  const list = base
    .filter((e) => e.slot === slot)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'zh'));
  out.push(`### ${SLOT[slot]}`);
  out.push('');
  out.push('| 名称 | 等级 | 品质 | 基础属性摘要 |');
  out.push('|------|------|------|----------------|');
  list.forEach((e) => {
    out.push(`| ${esc(e.name)} | ${e.level} | ${Q[e.quality]} | ${esc(statLine(e))} |`);
  });
  out.push('');
});

out.push(`## 深阶装备（${deep.length} 件）`);
out.push('');
out.push('### 命名规则');
out.push('');
out.push('形如 **`{主题}{凡|良|湛|炽|曜}·{后缀}`**。');
out.push('');
out.push(
  '- **后缀**来自 `config/deep-suffix-table.json`：按 **部位线**（melee / ranged / helmet …）× **主题等级档**（0=渊隙…7=终焉，对应 Lv.25～60）× **品质**（凡→曜 = 索引 0～4）取 **两字名**，同一后缀全局唯一。'
);
out.push(
  '- **词条**：由 `js/data-classes.js` 的 `DEEP_TRAIT_FAMILY_BY_LINE` 决定 `void_*` 家族；**主题**决定档位数 `_0`～`_7`；品质字须与后缀表中的品质列一致，否则游戏内无法解析。'
);
out.push('');
out.push('| 部位线 | 部位 | 词条家族（省略 void\\_ 前缀） |');
out.push('|--------|------|--------------------------------|');
LINE_ORDER.forEach((lk) => {
  out.push(`| \`${lk}\` | ${LINE_LABEL[lk]} | ${LINE_FAMILIES[lk]} |`);
});
out.push('');
out.push('### 主题与等级');
out.push('');
out.push('| 主题 | 等级要求 | 表内档位数 |');
out.push('|------|----------|------------|');
THEMES.forEach(([t, lv], i) => out.push(`| ${t} | Lv.${lv} | ${i} |`));
out.push('');
out.push('### 后缀表示例（渊隙档 · 凡品 各部位两字后缀）');
out.push('');
out.push('| 部位线 | 后缀 |');
out.push('|--------|------|');
LINE_ORDER.forEach((lk) => {
  const suf = suffixTable[lk] && suffixTable[lk][0] ? suffixTable[lk][0][0] : '—';
  out.push(`| ${lk} | ${suf} |`);
});
out.push('');
out.push('### 完整列表（按等级 → 品质 → 部位）');
out.push('');

const qOrder = { common: 0, rare: 1, fine: 2, epic: 3, legendary: 4 };
const slotOrder = { weapon: 0, helmet: 1, chest: 2, legs: 3, boots: 4, necklace: 5, ring: 6, belt: 7 };
const deepSorted = [...deep].sort((a, b) => {
  if (a.level !== b.level) return a.level - b.level;
  if (qOrder[a.quality] !== qOrder[b.quality]) return qOrder[a.quality] - qOrder[b.quality];
  return slotOrder[a.slot] - slotOrder[b.slot] || a.name.localeCompare(b.name, 'zh');
});

let lastLv = null;
deepSorted.forEach((e) => {
  if (e.level !== lastLv) {
    lastLv = e.level;
    out.push('');
    out.push(`#### Lv.${e.level}`);
    out.push('');
    out.push('| 名称 | 部位 | 品质 | 属性摘要 |');
    out.push('|------|------|------|----------|');
  }
  out.push(`| ${esc(e.name)} | ${SLOT[e.slot]} | ${Q[e.quality]} | ${esc(statLine(e))} |`);
});
out.push('');

out.push('## 套装效果（常规）');
out.push('');
Object.entries(sets).forEach(([id, s]) => {
  out.push(`### ${s.name}（\`${id}\`）`);
  out.push('');
  out.push(`**散件：** ${s.pieces.join('、')}`);
  out.push('');
  Object.entries(s.effects || {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([n, fx]) => {
      out.push(`- **${n} 件：** ${fx.description}`);
    });
  out.push('');
});

out.push('## 套装效果（深阶）');
out.push('');
Object.entries(deepSets).forEach(([id, s]) => {
  out.push(`### ${s.name}（\`${id}\`）`);
  out.push('');
  out.push(`**散件：** ${s.pieces.join('、')}`);
  out.push('');
  Object.entries(s.effects || {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([n, fx]) => {
      out.push(`- **${n} 件：** ${fx.description}`);
    });
  out.push('');
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out.join('\n'), 'utf8');
console.log('Wrote', outPath, 'lines', out.length);
