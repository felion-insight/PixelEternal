/**
 * 根据旧版「每档单品质」深阶装备，生成每等级×每品质（5档）装备 + 套装定义。
 * 运行: node scripts/gen-deep-equipment-sets.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const oldPath = path.join(root, 'config', 'equipment-deep-config.json');
const old = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
const suffixTable = JSON.parse(fs.readFileSync(path.join(root, 'config', 'deep-suffix-table.json'), 'utf8'));

const levels = [25, 30, 35, 40, 45, 50, 55, 60];
const themes = ['渊隙', '虚印', '腐噬', '黑曜', '终幕', '星骸', '裂点', '终焉'];
const qualities = [
  { id: 'common', han: '凡', label: '普通' },
  { id: 'rare', han: '良', label: '稀有' },
  { id: 'fine', han: '湛', label: '精良' },
  { id: 'epic', han: '炽', label: '史诗' },
  { id: 'legendary', han: '曜', label: '传说' }
];

/** 每等级档相对锚点行的品质倍率 [凡,良,湛,炽,曜] */
const tierMul = [
  [1.0, 1.12, 1.26, 1.42, 1.58],
  [0.9, 1.0, 1.13, 1.28, 1.44],
  [0.81, 0.92, 1.0, 1.14, 1.3],
  [0.74, 0.84, 0.94, 1.0, 1.16],
  [0.74, 0.84, 0.94, 1.0, 1.16],
  [0.68, 0.78, 0.88, 0.96, 1.0],
  [0.66, 0.76, 0.86, 0.94, 1.0],
  [0.64, 0.74, 0.84, 0.92, 1.0]
];

function lineKeyFromBase(base) {
  if (base.slot === 'weapon' && base.weaponType === 'melee') return 'melee';
  if (base.slot === 'weapon' && base.weaponType === 'ranged') return 'ranged';
  if (base.slot === 'helmet') return 'helmet';
  if (base.slot === 'chest') return 'chest';
  if (base.slot === 'legs') return 'legs';
  if (base.slot === 'boots') return 'boots';
  if (base.slot === 'necklace') return 'necklace';
  if (base.slot === 'ring') return 'ring';
  if (base.slot === 'belt') return 'belt';
  return null;
}

function suffixFor(lineKey, tierIndex, qi) {
  const row = suffixTable[lineKey];
  if (!row || !row[tierIndex] || row[tierIndex][qi] == null) {
    throw new Error(`后缀表缺项: ${lineKey} tier=${tierIndex} q=${qi}`);
  }
  return row[tierIndex][qi];
}

function scaleField(key, v, mul) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v;
  const mech = ['lifeSteal', 'thorn', 'skillHaste', 'damageReduction', 'towerGoldBonus', 'moveSpeed', 'critRate', 'attackSpeed', 'dodge'].includes(key);
  if (mech) {
    const nv = Math.round(v * (0.82 + mul * 0.18));
    return Math.max(1, nv);
  }
  return Math.max(1, Math.floor(v * mul));
}

function scaleItem(base, mul) {
  const o = { ...base };
  const skip = new Set(['slot', 'name', 'weaponType', 'level', 'quality']);
  for (const [k, val] of Object.entries(o)) {
    if (skip.has(k)) continue;
    if (typeof val === 'number') o[k] = scaleField(k, val, mul);
  }
  return o;
}

const SLOT_ANCHOR_ORDER = [
  { slot: 'weapon', weaponType: 'melee' },
  { slot: 'weapon', weaponType: 'ranged' },
  { slot: 'helmet' },
  { slot: 'chest' },
  { slot: 'legs' },
  { slot: 'boots' },
  { slot: 'necklace' },
  { slot: 'ring' },
  { slot: 'belt' }
];

const byLevel = {};
for (const e of old.EQUIPMENT_DEEP_DEFINITIONS) {
  if (e.quality !== 'common') continue;
  if (!byLevel[e.level]) byLevel[e.level] = [];
  byLevel[e.level].push(e);
}
for (const lv of Object.keys(byLevel)) {
  const raw = byLevel[lv];
  byLevel[lv] = SLOT_ANCHOR_ORDER.map((o) => {
    const hit = raw.find(
      (x) =>
        x.slot === o.slot &&
        (o.weaponType == null ? !x.weaponType || x.weaponType === 'melee' : x.weaponType === o.weaponType)
    );
    if (!hit) throw new Error(`锚点缺失 Lv${lv} ${JSON.stringify(o)}`);
    return hit;
  });
}

const outEq = [];
const setDefs = {};

for (let ti = 0; ti < levels.length; ti++) {
  const lv = levels[ti];
  const theme = themes[ti];
  const row = byLevel[lv];
  if (!row || row.length !== 9) {
    console.error('Bad row for level', lv, row && row.length);
    process.exit(1);
  }
  const muls = tierMul[ti];

  for (let qi = 0; qi < qualities.length; qi++) {
    const q = qualities[qi];
    const m = muls[qi];
    const setId = `deep_${lv}_${q.id}`;
    const pieces = [];

    for (const base of row) {
      const scaled = scaleItem(base, m);
      const lk = lineKeyFromBase(base);
      if (!lk) throw new Error('未知部位: ' + JSON.stringify(base));
      const suf = suffixFor(lk, ti, qi);
      const name = `${theme}${q.han}·${suf}`;
      scaled.name = name;
      scaled.level = lv;
      scaled.quality = q.id;
      outEq.push(scaled);
      pieces.push(name);
    }

    const atk2 = Math.max(2, Math.floor(4 + ti * 1.2 + qi * 2));
    const def2 = Math.max(1, Math.floor(2 + ti * 0.8 + qi));
    const cr4 = Math.max(2, Math.floor(3 + qi * 2 + ti * 0.3));
    const hp4 = Math.max(20, Math.floor(25 + ti * 12 + qi * 15));
    const as6 = Math.max(4, Math.floor(6 + qi * 2 + ti * 0.5));
    const ms6 = Math.max(2, Math.floor(3 + qi + ti * 0.3));
    const all8 = Math.round((0.04 + qi * 0.025 + ti * 0.008) * 100) / 100;
    const pct8 = Math.round(all8 * 100);

    setDefs[setId] = {
      name: `${theme}·${q.label}套装`,
      pieces,
      effects: {
        '2': {
          description: `攻击力+${atk2}，防御力+${def2}`,
          stats: { attack: atk2, defense: def2 }
        },
        '4': {
          description: `暴击率+${cr4}%，生命值+${hp4}`,
          stats: { critRate: cr4, health: hp4 }
        },
        '6': {
          description: `攻击速度+${as6}%，移动速度+${ms6}%`,
          stats: { attackSpeed: as6, moveSpeed: ms6 }
        },
        '8': {
          description: `所有属性+${pct8}%，击杀敌人时恢复5%最大生命值`,
          stats: { allStats: all8 },
          special: 'killHeal'
        }
      }
    };
  }
}

fs.writeFileSync(
  path.join(root, 'config', 'equipment-deep-config.json'),
  JSON.stringify({ EQUIPMENT_DEEP_DEFINITIONS: outEq }, null, 2),
  'utf8'
);
fs.writeFileSync(
  path.join(root, 'config', 'set-deep-config.json'),
  JSON.stringify({ SET_DEEP_DEFINITIONS: setDefs }, null, 2),
  'utf8'
);

console.log('equipment', outEq.length, 'sets', Object.keys(setDefs).length);
