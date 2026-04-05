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

    setDefs[setId] = {
      name: `${theme}·${q.label}套装`,
      pieces,
      effects: buildDeepSetEffects(ti, qi)
    };
  }
}

function mergeStats(a, b) {
  const o = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (!v) continue;
    o[k] = (o[k] || 0) + v;
  }
  return o;
}

/** 将 4 件套原属性拆成两半，分别并入 2 件与 6 件 */
function halfStats(stats) {
  const first = {};
  const second = {};
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v !== 'number' || !v) continue;
    const h = Math.floor(v / 2);
    first[k] = h;
    second[k] = v - h;
  }
  return [first, second];
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}
function round4(x) {
  return Math.round(x * 10000) / 10000;
}

function formatSetStatDescription(stats) {
  if (!stats || !Object.keys(stats).length) return '';
  const p = [];
  if (stats.attack) p.push(`攻击力+${stats.attack}`);
  if (stats.defense) p.push(`防御力+${stats.defense}`);
  if (stats.health) p.push(`生命值+${stats.health}`);
  if (stats.critRate) p.push(`暴击率+${stats.critRate}%`);
  if (stats.critDamage) p.push(`暴击伤害+${stats.critDamage}%`);
  if (stats.dodge) p.push(`闪避率+${stats.dodge}%`);
  if (stats.attackSpeed) p.push(`攻击速度+${stats.attackSpeed}%`);
  if (stats.moveSpeed) p.push(`移动速度+${stats.moveSpeed}%`);
  return p.join('，');
}

/** 与 8 件套机制铭牌一致（用于「激活**铭牌**…」「**铭牌**获得强化…」） */
function deepMechanismName(ti, qi) {
  const T = [
    ['渊隙裂响', '渊隙迸痕', '渊隙奔流', '渊隙噬能', '渊隙终潮'],
    ['虚印回流', '虚印圣拒', '虚印凝识', '虚印焚印', '虚印归寂'],
    ['腐噬扩散', '腐噬溃解', '腐噬穿络', '腐噬霜僵', '腐噬饱食'],
    ['黑曜棘壳', '黑曜心经', '黑曜反响', '黑曜碎域', '黑曜霜封'],
    ['终幕变奏', '终幕谢幕', '终幕弧光', '终幕余焰', '终幕余晖'],
    ['星骸涓流', '星骸弧光', '星骸凝辉', '星潮归槽', '星骸归尘'],
    ['裂点弧爆', '裂点滞域', '裂点天殛', '裂点殛刃', '裂点超载'],
    ['归墟吞噬', '终焉变律', '终焉电弧', '终焉燎', '终焉双噬']
  ];
  return T[ti][qi];
}

/** 根据 JSON 字段生成机制正文，带「入门档 / 满档强化」便于与 4 件对比 */
function deepMechanicBody(mechName, e, tier) {
  const sp = e.special;
  const tag = tier === 'four' ? '（入门档）' : '（满档强化）';
  const pct = (n) => Math.round((Number(n) || 0) * 100);
  const pct10 = (n) => Math.round((Number(n) || 0) * 1000) / 10;
  const sec = (ms) => Math.round((Number(ms) || 0) / 100) / 10;

  switch (sp) {
    case 'cooldownReduction': {
      const p = e.cooldownReductionPercent ?? 7;
      return `武器技能冷却缩短${p}%${tag}`;
    }
    case 'flameExplosion': {
      const ch = e.flameExplosionChance ?? 0.2;
      const m = e.flameExplosionMult ?? 0.5;
      return `攻击附带爆裂${tag}：约${pct(ch)}%触发、爆裂伤害约${pct(m)}%攻击力`;
    }
    case 'voidEcho': {
      const ch = e.voidEchoChance ?? 0.2;
      const f = e.voidEchoDamageFrac ?? 0.35;
      const d = e.voidEchoDelayMs ?? 220;
      return `虚回折返${tag}：约${pct(ch)}%触发、折返约${pct(f)}%伤害、延迟约${Math.round(d)}ms`;
    }
    case 'damageToHeal': {
      const ch = e.damageToHealChance ?? 0.12;
      const r = e.damageToHealRatio ?? 0.18;
      return `受击转伤为疗${tag}：约${pct(ch)}%触发、转化与减免约${pct(r)}%量级`;
    }
    case 'killBuff':
      return tier === 'four'
        ? `击杀回血并短时提升全属性${tag}（增幅与持续较低）`
        : `击杀回血并短时提升全属性${tag}（增幅与持续更高）`;
    case 'damageImmunity': {
      const ch = e.damageImmunityChance ?? 0.08;
      return `受击圣佑减伤${tag}：约${pct(ch)}%触发大幅减免`;
    }
    case 'exposeMark': {
      const ch = e.exposeMarkChance ?? 0.22;
      const dur = e.exposeMarkDurationMs ?? 3200;
      const mul = e.exposeMarkDamageMult ?? 1.12;
      return `攻击印蚀${tag}：约${pct(ch)}%触发、持续约${sec(dur)}秒、受伤系数约×${Math.round(mul * 100) / 100}`;
    }
    case 'killHeal': {
      const kh = e.killHealPercent ?? 0.05;
      const label = Math.round(kh * 1000) / 10;
      return `击杀回复生命${tag}：${label}%最大生命`;
    }
    case 'plagueDoT': {
      const ch = e.plagueDoTChance ?? 0.24;
      const dps = e.plagueDpsMult ?? 0.13;
      const dur = e.plagueDurationMs ?? 2800;
      return `溃烂持续伤${tag}：约${pct(ch)}%触发、每秒约${pct10(dps * 100)}%攻、持续约${sec(dur)}秒`;
    }
    case 'deepDoT': {
      const ch = e.deepDoTChance ?? 0.22;
      const dps = e.deepDoTDpsMult ?? 0.12;
      const dur = e.deepDoTDurationMs ?? 3000;
      const lab = e.deepDoTLabel || '持续';
      return `${lab}灼流${tag}：约${pct(ch)}%触发、每秒约${pct10(dps * 100)}%攻、持续约${sec(dur)}秒`;
    }
    case 'freezeChance': {
      const ch = e.freezeProcChance ?? 0.25;
      const dur = e.freezeDurationMs ?? 2000;
      return `攻击冰封${tag}：约${pct(ch)}%触发、冰封约${sec(dur)}秒`;
    }
    case 'deepRetaliate': {
      const ch = e.deepRetaliateChance ?? 0.14;
      const m = e.deepRetaliateMult ?? 0.38;
      return `受击反噬${tag}：约${pct(ch)}%触发、反伤约${pct(m)}%攻击力`;
    }
    case 'killShockwave': {
      const R = e.killShockwaveRadius ?? 76;
      const f = e.killShockwaveDamageFrac ?? 0.38;
      return `击杀殒震${tag}：半径约${Math.round(R)}、溅射约${pct(f)}%攻击力`;
    }
    case 'starRegen': {
      const srp = e.starRegenPercent ?? 0.01;
      return `战斗中缓回${tag}：每秒约${pct10(srp * 100)}%最大生命`;
    }
    case 'voltField': {
      const iv = e.voltFieldIntervalMs ?? 480;
      const R = e.voltFieldRadius ?? 110;
      const fr = e.voltFieldDamageFrac ?? 0.13;
      return `裂隙电场${tag}：约每${Math.round(iv / 100) / 10}秒、半径约${Math.round(R)}、伤害约${pct(fr)}%攻`;
    }
    case 'skyBolt': {
      const iv = e.skyBoltIntervalMs ?? 1700;
      const rg = e.skyBoltRange ?? 400;
      const m = e.skyBoltDamageMult ?? 1.0;
      return `天雷殛击${tag}：约每${Math.round(iv / 100) / 10}秒、射程约${Math.round(rg)}、伤害约${pct10(m * 100)}%攻`;
    }
    case 'voltStrike': {
      const ch = e.voltStrikeChance ?? 0.28;
      const m = e.voltStrikeDamageMult ?? 0.92;
      const sm = e.voltStrikeSlowMs ?? 900;
      return `殛刃强电${tag}：约${pct(ch)}%触发、伤害约${pct10(m * 100)}%攻、感电约${sec(sm)}秒`;
    }
    case 'chainLightning': {
      const ch = e.chainLightningChance ?? 0.28;
      const m = e.chainLightningDamageMult ?? 0.8;
      const rg = e.chainLightningRange ?? 100;
      return `连锁闪电${tag}：约${pct(ch)}%触发、弹射约${pct10(m * 100)}%攻、范围约${Math.round(rg)}`;
    }
    case 'killHealAndRegen': {
      const kh = e.killHealPercent ?? 0.08;
      const sr = e.starRegenPercent ?? 0.005;
      const khL = Math.round(kh * 1000) / 10;
      const srL = Math.round(sr * 1000) / 10;
      return `双噬续航${tag}：击杀${khL}%最大生命、战中每秒${srL}%最大生命`;
    }
    default:
      return `【${mechName}】套装机制${tag}`;
  }
}

function packDeepEight(ti, qi, c, effectFields) {
  const name = deepMechanismName(ti, qi);
  const eff = { ...effectFields };
  const body = deepMechanicBody(name, eff, 'eight');
  return {
    ...eff,
    description: `所有属性+${c.pct8}%，**${name}**获得强化，${body}`
  };
}

/** 4 件套：激活铭牌；以「击杀」开头时不加逗号（与终焉双噬等句式一致） */
function activateFourDesc(name, rest) {
  const r = String(rest || '').trim();
  if (!r) return `激活**${name}**`;
  if (/^击杀/.test(r)) return `激活**${name}**${r}`;
  return `激活**${name}**，${r}`;
}

/** 由 8 件机制生成 4 件弱化版：数值降低后按 deepMechanicBody 生成「入门档」叙述 */
function weakenToFourPieceNoPrefix(src, mechName) {
  const o = { ...src };
  delete o.description;

  for (const [k, v] of Object.entries(src)) {
    if (k === 'special' || k === 'description' || typeof v !== 'number') continue;
    if (/SlowMult$/i.test(k) || /SlowMs$/i.test(k)) {
      o[k] = v;
      continue;
    }
    if (/Chance$/.test(k) || k === 'freezeProcChance') o[k] = Math.min(0.9, round3(v * 0.62));
    else if (k === 'cooldownReductionPercent') o[k] = Math.max(3, Math.floor(v * 0.55));
    else if (k === 'killHealPercent') o[k] = round4(v * 0.55);
    else if (k === 'starRegenPercent' || k.endsWith('Ratio')) o[k] = round4(v * 0.45);
    else if (k.endsWith('IntervalMs')) o[k] = Math.floor(v * 1.12);
    else if (k.endsWith('Radius') || k.endsWith('Range')) o[k] = Math.floor(v * 0.8);
    else if (k.endsWith('Ms')) o[k] = Math.floor(v * 0.78);
    else if (k === 'exposeMarkDamageMult') o[k] = round4(1 + (v - 1) * 0.68);
    else if (v > 1 && v < 5 && k.endsWith('Mult')) o[k] = round4(v * 0.75);
    else if (v > 0 && v <= 1) o[k] = round4(v * 0.66);
    else o[k] = v;
  }
  o.description = deepMechanicBody(mechName, o, 'four');
  return o;
}

/**
 * 4 件：首次引入机制（常为 8 件简化子集）；终焉「双噬」档为击杀回血 vs 击杀回血+每秒回复。
 */
function deepFourEffect(ti, qi, c) {
  const eight = deepEightEffect(ti, qi, c);
  const name = deepMechanismName(ti, qi);
  if (eight.special === 'killHealAndRegen') {
    const full = typeof eight.killHealPercent === 'number' ? eight.killHealPercent : c.killPct;
    const kh = Math.round(full * (4 / 8.4) * 10000) / 10000;
    return {
      description: activateFourDesc(
        name,
        deepMechanicBody(name, { special: 'killHeal', killHealPercent: kh }, 'four')
      ),
      special: 'killHeal',
      killHealPercent: kh,
      stats: {}
    };
  }
  const weak = weakenToFourPieceNoPrefix(eight, name);
  weak.description = activateFourDesc(name, weak.description);
  return weak;
}

/**
 * 深阶套装：2/6 件为基础数值（由原 2、6 与原 4 件属性拆分合并）；4 件首次引入机制（常为 8 件简化版，终焉双噬档为仅击杀回血）；8 件为全属性% + 强化机制。
 */
function buildDeepSetEffects(ti, qi) {
  const atk2 = Math.max(2, Math.floor(4 + ti * 1.2 + qi * 2));
  const def2 = Math.max(1, Math.floor(2 + ti * 0.8 + qi));
  const cr2 = Math.max(2, Math.floor(3 + qi * 2 + Math.floor(ti * 0.35)));
  const hp2 = Math.max(18, Math.floor(20 + ti * 10 + qi * 12));
  const cr4 = Math.max(2, Math.floor(3 + qi * 2 + ti * 0.3));
  const hp4 = Math.max(20, Math.floor(25 + ti * 12 + qi * 15));
  const cd4 = Math.max(6, Math.floor(9 + qi * 3 + Math.floor(ti * 0.45)));
  const def4 = Math.max(2, Math.floor(4 + ti * 0.9 + qi * 1.5));
  const dodge4 = Math.max(2, Math.floor(3 + qi * 2 + Math.floor(ti * 0.25)));
  const as6 = Math.max(4, Math.floor(6 + qi * 2 + ti * 0.5));
  const ms6 = Math.max(2, Math.floor(3 + qi + ti * 0.3));
  const all8 = Math.round((0.04 + qi * 0.025 + ti * 0.008) * 100) / 100;
  const pct8 = Math.round(all8 * 100);
  const cdr8 = Math.min(14, Math.floor(7 + qi * 1.5 + ti * 0.2));
  const killPct = Math.round((0.052 + qi * 0.006 + (ti >= 7 ? 0.008 : 0)) * 1000) / 1000;
  const killPctLabel = Math.round(killPct * 1000) / 10;
  const c = {
    atk2,
    def2,
    cr2,
    hp2,
    cr4,
    hp4,
    cd4,
    def4,
    dodge4,
    as6,
    ms6,
    all8,
    pct8,
    cdr8,
    killPct,
    killPctLabel,
    cdrMid: Math.max(6, cdr8 - 1)
  };

  const tierStatProfiles = [
    // 渊隙：冷却与暴伤曲线
    {
      2: {
        description: `攻击力+${atk2}，暴击伤害+${cd4}%`,
        stats: { attack: atk2, critDamage: cd4 }
      },
      4: {
        description: `暴击率+${cr4}%，生命值+${hp4}`,
        stats: { critRate: cr4, health: hp4 }
      },
      6: {
        description: `防御力+${def4}，闪避率+${dodge4}%`,
        stats: { defense: def4, dodge: dodge4 }
      }
    },
    // 虚印：承伤转化
    {
      2: {
        description: `防御力+${def2}，生命值+${hp2}`,
        stats: { defense: def2, health: hp2 }
      },
      4: {
        description: `攻击力+${atk2}，暴击率+${cr2}%`,
        stats: { attack: atk2, critRate: cr2 }
      },
      6: {
        description: `暴击伤害+${cd4}%，移动速度+${ms6}%`,
        stats: { critDamage: cd4, moveSpeed: ms6 }
      }
    },
    // 腐噬：侵蚀爆发
    {
      2: {
        description: `攻击力+${atk2}，暴击率+${cr2}%`,
        stats: { attack: atk2, critRate: cr2 }
      },
      4: {
        description: `暴击伤害+${cd4}%，生命值+${hp4}`,
        stats: { critDamage: cd4, health: hp4 }
      },
      6: {
        description: `攻击速度+${as6}%，防御力+${def4}`,
        stats: { attackSpeed: as6, defense: def4 }
      }
    },
    // 黑曜：圣拒式减伤
    {
      2: {
        description: `防御力+${def2}，生命值+${hp2}`,
        stats: { defense: def2, health: hp2 }
      },
      4: {
        description: `闪避率+${dodge4}%，防御力+${def4}`,
        stats: { dodge: dodge4, defense: def4 }
      },
      6: {
        description: `攻击力+${atk2}，暴击伤害+${cd4}%`,
        stats: { attack: atk2, critDamage: cd4 }
      }
    },
    // 终幕：击杀强化
    {
      2: {
        description: `攻击力+${atk2}，暴击伤害+${cd4}%`,
        stats: { attack: atk2, critDamage: cd4 }
      },
      4: {
        description: `暴击率+${cr4}%，生命值+${hp4}`,
        stats: { critRate: cr4, health: hp4 }
      },
      6: {
        description: `攻击速度+${as6}%，暴击率+${Math.max(1, Math.floor(2 + qi))}%`,
        stats: { attackSpeed: as6, critRate: Math.max(1, Math.floor(2 + qi)) }
      }
    },
    // 星骸：持续星涌
    {
      2: {
        description: `攻击力+${atk2}，防御力+${def2}`,
        stats: { attack: atk2, defense: def2 }
      },
      4: {
        description: `暴击伤害+${cd4}%，生命值+${hp4}`,
        stats: { critDamage: cd4, health: hp4 }
      },
      6: {
        description: `攻击速度+${as6}%，移动速度+${ms6}%`,
        stats: { attackSpeed: as6, moveSpeed: ms6 }
      }
    },
    // 裂点：连锁电击
    {
      2: {
        description: `暴击率+${cr2}%，攻击力+${atk2}`,
        stats: { critRate: cr2, attack: atk2 }
      },
      4: {
        description: `闪避率+${dodge4}%，生命值+${hp4}`,
        stats: { dodge: dodge4, health: hp4 }
      },
      6: {
        description: `防御力+${def4}，生命值+${Math.floor(hp4 * 0.85)}`,
        stats: { defense: def4, health: Math.floor(hp4 * 0.85) }
      }
    },
    // 终焉：斩杀续航
    {
      2: {
        description: `攻击力+${atk2}，防御力+${def2}`,
        stats: { attack: atk2, defense: def2 }
      },
      4: {
        description: `暴击率+${cr4}%，暴击伤害+${cd4}%`,
        stats: { critRate: cr4, critDamage: cd4 }
      },
      6: {
        description: `攻击速度+${as6}%，移动速度+${ms6}%`,
        stats: { attackSpeed: as6, moveSpeed: ms6 }
      }
    }
  ];

  const base = tierStatProfiles[ti] || tierStatProfiles[0];
  const [h4a, h4b] = halfStats(base[4].stats);
  const stats2 = mergeStats(base[2].stats, h4a);
  const stats6 = mergeStats(base[6].stats, h4b);
  const four = deepFourEffect(ti, qi, c);
  const eight = deepEightEffect(ti, qi, c);
  return {
    2: { description: formatSetStatDescription(stats2), stats: stats2 },
    4: Object.assign({ stats: {} }, four),
    6: { description: formatSetStatDescription(stats6), stats: stats6 },
    8: Object.assign({ stats: { allStats: all8 } }, eight)
  };
}

/** 8 件套：ti=主题索引 0～7，qi=品质 0～4 */
function deepEightEffect(ti, qi, c) {
  const { cdr8, cdrMid, killPct, killPctLabel } = c;
  if (ti === 0) {
    if (qi === 0)
      return packDeepEight(ti, qi, c, {
        special: 'cooldownReduction',
        cooldownReductionPercent: cdr8
      });
    if (qi === 1)
      return packDeepEight(ti, qi, c, {
        special: 'flameExplosion',
        flameExplosionChance: 0.22,
        flameExplosionMult: 0.42
      });
    if (qi === 2)
      return packDeepEight(ti, qi, c, {
        special: 'voidEcho',
        voidEchoChance: 0.22,
        voidEchoDamageFrac: 0.38,
        voidEchoDelayMs: 200
      });
    if (qi === 3)
      return packDeepEight(ti, qi, c, {
        special: 'damageToHeal',
        damageToHealChance: 0.14,
        damageToHealRatio: 0.16
      });
    return packDeepEight(ti, qi, c, { special: 'killBuff' });
  }
  if (ti === 1) {
    if (qi === 0)
      return packDeepEight(ti, qi, c, {
        special: 'damageToHeal',
        damageToHealChance: 0.12,
        damageToHealRatio: 0.18
      });
    if (qi === 1)
      return packDeepEight(ti, qi, c, {
        special: 'damageImmunity',
        damageImmunityChance: 0.075
      });
    if (qi === 2)
      return packDeepEight(ti, qi, c, {
        special: 'exposeMark',
        exposeMarkChance: 0.24,
        exposeMarkDurationMs: 3400,
        exposeMarkDamageMult: 1.14
      });
    if (qi === 3)
      return packDeepEight(ti, qi, c, {
        special: 'flameExplosion',
        flameExplosionChance: 0.2,
        flameExplosionMult: 0.48
      });
    return packDeepEight(ti, qi, c, {
      special: 'killHeal',
      killHealPercent: killPct
    });
  }
  if (ti === 2) {
    if (qi === 0)
      return packDeepEight(ti, qi, c, {
        special: 'flameExplosion',
        flameExplosionChance: 0.22,
        flameExplosionMult: 0.45
      });
    if (qi === 1)
      return packDeepEight(ti, qi, c, {
        special: 'plagueDoT',
        plagueDoTChance: 0.24,
        plagueDpsMult: 0.13,
        plagueDurationMs: 2800
      });
    if (qi === 2)
      return packDeepEight(ti, qi, c, {
        special: 'deepDoT',
        deepDoTChance: 0.26,
        deepDoTDpsMult: 0.14,
        deepDoTDurationMs: 3200,
        deepDoTLabel: '腐穿',
        deepDoTColor: '#99dd77'
      });
    if (qi === 3)
      return packDeepEight(ti, qi, c, {
        special: 'freezeChance',
        freezeProcChance: 0.25,
        freezeDurationMs: 2000
      });
    return packDeepEight(ti, qi, c, { special: 'killBuff' });
  }
  if (ti === 3) {
    if (qi === 0)
      return packDeepEight(ti, qi, c, {
        special: 'deepRetaliate',
        deepRetaliateChance: 0.16,
        deepRetaliateMult: 0.42
      });
    if (qi === 1)
      return packDeepEight(ti, qi, c, {
        special: 'cooldownReduction',
        cooldownReductionPercent: cdrMid
      });
    if (qi === 2)
      return packDeepEight(ti, qi, c, {
        special: 'damageToHeal',
        damageToHealChance: 0.13,
        damageToHealRatio: 0.17
      });
    if (qi === 3)
      return packDeepEight(ti, qi, c, {
        special: 'flameExplosion',
        flameExplosionChance: 0.18,
        flameExplosionMult: 0.55
      });
    return packDeepEight(ti, qi, c, {
      special: 'killShockwave',
      killShockwaveRadius: 80,
      killShockwaveDamageFrac: 0.4
    });
  }
  if (ti === 4) {
    if (qi === 0)
      return packDeepEight(ti, qi, c, { special: 'killBuff' });
    if (qi === 1)
      return packDeepEight(ti, qi, c, {
        special: 'killHeal',
        killHealPercent: killPct
      });
    if (qi === 2)
      return packDeepEight(ti, qi, c, {
        special: 'voidEcho',
        voidEchoChance: 0.2,
        voidEchoDamageFrac: 0.4,
        voidEchoDelayMs: 240
      });
    if (qi === 3)
      return packDeepEight(ti, qi, c, {
        special: 'flameExplosion',
        flameExplosionChance: 0.21,
        flameExplosionMult: 0.52
      });
    return packDeepEight(ti, qi, c, {
      special: 'starRegen',
      starRegenPercent: 0.008
    });
  }
  if (ti === 5) {
    if (qi === 0)
      return packDeepEight(ti, qi, c, {
        special: 'starRegen',
        starRegenPercent: 0.01
      });
    if (qi === 1)
      return packDeepEight(ti, qi, c, {
        special: 'exposeMark',
        exposeMarkChance: 0.23,
        exposeMarkDurationMs: 3000,
        exposeMarkDamageMult: 1.13
      });
    if (qi === 2)
      return packDeepEight(ti, qi, c, {
        special: 'deepDoT',
        deepDoTChance: 0.24,
        deepDoTDpsMult: 0.13,
        deepDoTDurationMs: 2800,
        deepDoTLabel: '星烬',
        deepDoTColor: '#ffcc66'
      });
    if (qi === 3)
      return packDeepEight(ti, qi, c, {
        special: 'damageToHeal',
        damageToHealChance: 0.11,
        damageToHealRatio: 0.19
      });
    {
      const kh = Math.round(killPct * 1.08 * 1000) / 1000;
      return packDeepEight(ti, qi, c, {
        special: 'killHeal',
        killHealPercent: kh
      });
    }
  }
  if (ti === 6) {
    if (qi === 0)
      return packDeepEight(ti, qi, c, {
        special: 'deepDoT',
        deepDoTChance: 0.22,
        deepDoTDpsMult: 0.12,
        deepDoTDurationMs: 3000,
        deepDoTLabel: '裂伤',
        deepDoTColor: '#aa99ff'
      });
    if (qi === 1)
      return packDeepEight(ti, qi, c, {
        special: 'voltField',
        voltFieldIntervalMs: 460,
        voltFieldRadius: 118,
        voltFieldDamageFrac: 0.14,
        voltSlowMult: 0.72,
        voltSlowDurationMs: 720
      });
    if (qi === 2)
      return packDeepEight(ti, qi, c, {
        special: 'skyBolt',
        skyBoltIntervalMs: 1650,
        skyBoltRange: 430,
        skyBoltDamageMult: 1.05
      });
    if (qi === 3)
      return packDeepEight(ti, qi, c, {
        special: 'voltStrike',
        voltStrikeChance: 0.3,
        voltStrikeDamageMult: 0.95,
        voltStrikeSlowMs: 950,
        voltStrikeSlowMult: 0.66
      });
    return packDeepEight(ti, qi, c, {
      special: 'chainLightning',
      chainLightningChance: 0.32,
      chainLightningDamageMult: 1.0,
      chainLightningRange: 130,
      chainLightningApplySlow: true,
      chainLightningSlowMs: 800,
      chainLightningSlowMult: 0.72
    });
  }
  if (qi === 0)
    return packDeepEight(ti, qi, c, {
      special: 'killHeal',
      killHealPercent: killPct
    });
  if (qi === 1)
    return packDeepEight(ti, qi, c, { special: 'killBuff' });
  if (qi === 2)
    return packDeepEight(ti, qi, c, {
      special: 'killShockwave',
      killShockwaveRadius: 88,
      killShockwaveDamageFrac: 0.44
    });
  if (qi === 3)
    return packDeepEight(ti, qi, c, {
      special: 'flameExplosion',
      flameExplosionChance: 0.2,
      flameExplosionMult: 0.58
    });
  return packDeepEight(ti, qi, c, {
    special: 'killHealAndRegen',
    killHealPercent: killPct,
    starRegenPercent: 0.005
  });
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
