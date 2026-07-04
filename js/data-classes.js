/**
 * Pixel Eternal - 数据类模块
 * 包含 Equipment、Consumable 等类及其生成函数
 */

/** 装备机制类数值：不受强化/精炼倍率放大，按配置固定值参与汇总 */
const EQUIPMENT_MECHANIC_KEYS = new Set(['lifeSteal', 'thorn', 'skillHaste', 'damageReduction', 'towerGoldBonus']);

const EQUIPMENT_STAT_NAMES = {
    attack: '攻击力', magicAttack: '魔法攻击', critRate: '暴击率', critDamage: '暴击伤害',
    health: '生命值', defense: '防御力', magicDefense: '魔法防御', dodge: '闪避率',
    attackSpeed: '攻击速度', moveSpeed: '移动速度', lifeSteal: '吸血', thorn: '荆棘反伤',
    skillHaste: '技能急速', damageReduction: '受到伤害减免', towerGoldBonus: '恶魔塔金币加成'
};

const EQUIPMENT_PCT_STATS = new Set(['critRate', 'attackSpeed', 'moveSpeed', 'dodge', 'lifeSteal', 'thorn', 'skillHaste', 'damageReduction', 'towerGoldBonus', 'critDamage']);

function formatEquipmentStatLine(key, value, color) {
    const isPct = key.includes('Rate') || key.includes('Speed') || key === 'dodge' || EQUIPMENT_PCT_STATS.has(key);
    const c = color ? ` style="color: #${color}; font-size: 11px;"` : '';
    return `<p${c}>${EQUIPMENT_STAT_NAMES[key] || key}: ${value}${isPct ? '%' : ''}</p>`;
}

/** 深阶装备品质字 → 索引（凡=普通 … 曜=传说） */
const DEEP_QUALITY_HAN_ORDER = { '凡': 0, '良': 1, '湛': 2, '炽': 3, '曜': 4 };

/** 主题 → 等级档 0～7（25～60 级，每 5 级一档），词条 id 后缀与之一一对应 */
const DEEP_THEME_TO_TIER = {
    '渊隙': 0, '虚印': 1, '腐噬': 2, '黑曜': 3, '终幕': 4, '星骸': 5, '裂点': 6, '终焉': 7
};

/**
 * 深阶部位线 → 凡/良/湛/炽/曜 各品质对应的词条家族 id（实际 id = 家族 + '_' + 主题等级档 0～7）
 * 显示后缀由 config/deep-suffix-table.json 按「等级档×品质」取字，不再与旧版单后缀共用一名。
 */
const DEEP_TRAIT_FAMILY_BY_LINE = {
    melee: ['void_w_sigil', 'void_w_rend', 'void_w_mire', 'void_w_fork', 'void_w_cull'],
    ranged: ['void_b_snipe', 'void_b_ricochet', 'void_b_weaken', 'void_b_volley', 'void_b_star'],
    helmet: ['void_h_aegis', 'void_h_bastion', 'void_h_pulse', 'void_h_mirror', 'void_h_last'],
    body: ['void_c_spike', 'void_c_dampen', 'void_c_echo', 'void_c_riposte', 'void_c_bulwark'],
    legs: ['void_l_surge', 'void_l_grit', 'void_l_ram', 'void_l_strike', 'void_l_overdrive'],
    feet: ['void_f_chase', 'void_f_rush', 'void_f_trace', 'void_f_flash', 'void_f_surge'],
    amulet: ['void_n_mend', 'void_n_skill', 'void_n_snare', 'void_n_arc', 'void_n_well'],
    ring: ['void_r_twin', 'void_r_sever', 'void_r_fervor', 'void_r_tempo', 'void_r_greed'],
    belt: ['void_g_tithe', 'void_g_hoard', 'void_g_covet', 'void_g_elite', 'void_g_fortune']
};

const DEEP_SUFFIX_LINE_ORDER = ['melee', 'ranged', 'helmet', 'body', 'legs', 'feet', 'amulet', 'ring', 'belt'];

/** 后缀 → { line, qIdx, themeTier }，由 DEEP_SUFFIX_TABLE 惰性构建 */
let _deepSuffixTraitResolveMap = null;

function getDeepSuffixTraitResolveMap() {
    if (_deepSuffixTraitResolveMap) return _deepSuffixTraitResolveMap;
    const table = typeof DEEP_SUFFIX_TABLE !== 'undefined' ? DEEP_SUFFIX_TABLE : null;
    if (!table || typeof table !== 'object') return null;
    const map = Object.create(null);
    for (const line of DEEP_SUFFIX_LINE_ORDER) {
        const tiers = table[line];
        if (!Array.isArray(tiers)) continue;
        for (let t = 0; t < 8; t++) {
            const row = tiers[t];
            if (!Array.isArray(row)) continue;
            for (let q = 0; q < 5; q++) {
                const suf = row[q];
                if (suf == null) continue;
                if (map[suf]) {
                    console.warn('Pixel Eternal: 深阶后缀表存在重复键', suf);
                }
                map[suf] = { line, qIdx: q, themeTier: t };
            }
        }
    }
    _deepSuffixTraitResolveMap = map;
    return _deepSuffixTraitResolveMap;
}

/**
 * 按等级档 t（0=25级…7=60级）生成与 game-entities 缩放一致的中文说明
 * @param {string} family
 * @param {number} t
 * @returns {string}
 */
function buildDeepTraitDescriptionLine(family, t) {
    const lv = 25 + t * 5;
    const pct = (base, perT) => (base + perT * t).toFixed(1);
    const pct0 = (base, perT) => Math.round(base + perT * t);
    const r = (base, perT) => Math.round(base + perT * t);
    /** 与 deepTraitBand 一致：四段机制命名 */
    const b = t <= 1 ? 0 : t <= 3 ? 1 : t <= 5 ? 2 : 3;
    const bn = ['渊隙虚印段', '腐噬黑曜段', '终幕星骸段', '裂点终焉段'];
    switch (family) {
        case 'void_w_sigil': {
            if (t <= 2) {
                return `魔印·${lv}式：近战命中叠虚印（至多${Math.min(6, 4 + Math.floor(t / 2))}层），受你的伤害每层+${pct(3.5, 0.3)}%，${5 + Math.floor(t / 2)}秒刷新`;
            }
            if (t === 3) {
                return `溃印·${lv}式：近战命中叠「溃印」（至多2层），每层使你对该目标近战伤害+${(6.5 + 0.8 * t).toFixed(1)}%，4.5秒刷新`;
            }
            if (t === 4) {
                return `誓刃·${lv}式：近战命中${Math.round(20 + t)}%施加「誓刃」，约3.2秒内下一次对该目标近战伤害×${(1.28 + 0.015 * t).toFixed(2)}后消耗`;
            }
            if (t === 5) {
                return `星链·${lv}式：近战命中${Math.round(22 + t)}%向${80 + 5 * t}像素内另一名敌人造成${(38 + 2 * t).toFixed(0)}%攻击力的虚空链伤（与分岔不同机制）`;
            }
            if (t === 6) {
                return `脉裂·${lv}式：近战命中${Math.round(20 + t)}%追加一段${(30 + 2.5 * t).toFixed(0)}%攻击力的裂脉伤害（独立结算）`;
            }
            return `墟印·${lv}式：每第3次近战命中同一目标，对周围${88 + 4 * t}像素造成${(55 + 3 * t).toFixed(0)}%攻击力的归墟冲击`;
        }
        case 'void_w_rend': {
            const core = `暴击时${pct0(18, 2)}%概率追加相当于本次伤害${pct(20, 2.5)}%的撕裂`;
            const tail = ['', '，并回复生命', '，撕裂可溅射邻近敌人', '，对残血暴击追加终割'];
            return `【${bn[b]}】${['裂伤', '血劫', '裂潮', '终裂'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_w_mire': {
            const core = `近战命中${pct0(9, 1)}%使目标移速降至${pct0(90, -1)}%，持续${r(2000, 80)}毫秒`;
            const tail = ['', '，并附加短暂虚蚀伤害', '，淤滞可蔓延至小范围', '，命中叠「淤核」满层时禁锢一瞬'];
            return `【${bn[b]}】${['淤滞', '虚淤', '淤域', '淤核'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_w_fork': {
            const core = `近战命中${pct0(12, 1)}%对${r(90, 5)}像素内另一敌人造成${pct(30, 1.8)}%攻击力伤害`;
            const tail = ['', '，分岔命中为你加速', '，有概率再分岔一次', '，分岔终点引发小爆'];
            return `【${bn[b]}】${['分岔', '双锋', '连环分岔', '爆岔'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_w_cull': {
            const core = `目标生命低于${pct(32, -0.9)}%时近战伤害+${pct(8, 1.2)}%`;
            const tail = ['', '，处决带吸血', '，对低血额外削防', '，极低血斩杀附带范围威慑'];
            return `【${bn[b]}】${['终戮', '血偿', '裂命', '归斩'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_b_snipe': {
            const core = `目标生命高于${pct(84, -0.6)}%时远程伤害+${pct(7, 0.8)}%`;
            const tail = ['', '，远射命中回能（表现为小幅自愈）', '，首箭可标记第二目标', '，高血目标额外承受穿透余波'];
            return `【${bn[b]}】${['远射', '穿虹', '双标', '天诛'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_b_ricochet': {
            const core = `远程命中${pct0(12, 1)}%弹射至${r(80, 4)}像素内另一目标，${pct(28, 1.2)}%攻击力`;
            const tail = ['', '，跳弹附带短暂易伤', '，可弹向第二名敌人（衰减）', '，跳弹终点小范围爆炸'];
            return `【${bn[b]}】${['跳弹', '回弹', '连弹', '星弹'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_b_weaken': {
            const core = `远程命中${pct0(11, 1)}%使目标移速${pct0(91, -0.8)}%，持续${r(1850, 70)}毫秒`;
            const tail = ['', '，并降低其造成的伤害', '，蚀弦可扩散至邻近', '，强蚀附带短暂定身'];
            return `【${bn[b]}】${['蚀弦', '蚀印', '蚀域', '缚弦'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_b_volley': {
            const core = `远程命中${pct0(10, 1)}%对周围${r(55, 4)}像素造成${pct(40, 2)}%攻击力溅射`;
            const tail = ['', '，中心目标额外受一段', '，溅射留下灼蚀', '，散矢可二次坍缩'];
            return `【${bn[b]}】${['散矢', '集点', '灼散', '坍矢'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_b_star': {
            const core = `远程暴击${pct0(19, 2)}%对${r(72, 5)}像素造成${pct(48, 2.2)}%攻击力爆发`;
            const tail = ['', '，星落为你回复少量生命', '，第二颗微星追加伤害', '，星落叠层满时大爆发'];
            return `【${bn[b]}】${['星落', '双星', '星雨', '星殒'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_h_aegis': {
            const core = `受击时${pct0(8, 1)}%使该次伤害再降低${pct(4, 0.35)}%`;
            const tail = ['', '，并反弹微量伤害', '，触发时短暂加防', '，可连锁虚弱攻击者'];
            return `【${bn[b]}】${['虚盾', '反盾', '盾域', '链盾'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_h_bastion': {
            const core = `受击时${pct0(10, 1)}%获得+${pct(8, 0.7)}%防御力，持续${r(3600, 120)}毫秒`;
            const tail = ['', '，并小幅回血', '，固守可叠加一层', '，触发时对周身震击'];
            return `【${bn[b]}】${['固守', '坚壁', '叠垒', '震垒'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_h_pulse': {
            const core = `受击时${pct0(6, 1)}%回复${pct(1.8, 0.22)}%最大生命`;
            const tail = ['', '，并净化减速', '，过量治疗转虚盾', '，脉动可弹射治疗邻近'];
            return `【${bn[b]}】${['脉动', '涌泉', '溢脉', '链脉'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_h_mirror': {
            const core = `受击时${pct0(7, 1)}%以${pct(28, 2)}%攻击力反击攻击者`;
            const tail = ['', '，反击附带吸血', '，折光可弹射第二目标', '，暴击反击造成眩晕'];
            return `【${bn[b]}】${['折光', '噬光', '双折', '眩光'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_h_last': {
            const core = `受击后生命将低于${pct(23, -0.4)}%最大时，${pct0(10, 1)}%使该次伤害减半（冷却约${r(30000, -1500)}毫秒）`;
            const tail = ['', '，触发后短暂无敌帧', '，残照可回光一击', '，免死后对周围反冲'];
            return `【${bn[b]}】${['残照', '续命', '回光', '墟照'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_c_spike': {
            const core = `受击时${pct0(9, 1)}%令攻击者承受该次伤害${pct(7, 0.6)}%的反噬`;
            const tail = ['', '，反噬附带流血', '，棘反可连锁', '，反噬暴击时追加虚爆'];
            return `【${bn[b]}】${['棘反', '血棘', '链棘', '爆棘'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_c_dampen': {
            const core = `受伤超过${r(16, 2)}点时${pct0(11, 1)}%该次伤害×${pct(90, -0.9)}%`;
            const tail = ['', '，缓冲成功回能', '，大额伤额外减一次', '，缓冲触发震退周围'];
            return `【${bn[b]}】${['缓冲', '卸力', '叠缓', '震缓'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_c_echo': {
            const core = `受击时${pct0(7, 1)}%向${r(95, 5)}像素释放${pct(23, 1.2)}%攻击力震击`;
            const tail = ['', '，回响附带减速', '，双段回响', '，回响中心牵引敌人'];
            return `【${bn[b]}】${['回响', '余震', '双响', '涡响'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_c_riposte': {
            const core = `受击时${pct0(6, 1)}%使下次你的攻击伤害+${pct(12, 1.2)}%`;
            const tail = ['', '，蓄势附带加速', '，可存两层蓄势', '，消耗蓄势时范围斩'];
            return `【${bn[b]}】${['蓄势', '疾势', '叠势', '斩势'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_c_bulwark': {
            const core = `单次受伤超过${pct(16, -0.9)}%最大生命时，${pct0(9, 1)}%该次伤害×${pct(85, -0.7)}%`;
            const tail = ['', '，重锚触发回血', '，锚定攻击者', '，重锚引发地裂'];
            return `【${bn[b]}】${['重锚', '血锚', '锁锚', '裂锚'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_l_surge': {
            const core = `击杀后${pct0(15, 1)}%获得+${pct(18, 1.2)}%移速，持续${r(2700, 120)}毫秒`;
            const tail = ['', '，追猎附带攻速', '，击杀刷新追猎', '，追猎结束时小爆发'];
            return `【${bn[b]}】${['追猎', '狂猎', '续猎', '爆猎'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_l_grit': {
            const core = `受击时${pct0(8, 1)}%获得+${pct(7.5, 0.7)}%防御力，持续${r(4800, 150)}毫秒`;
            const tail = ['', '，韧胫反伤', '，叠韧', '，满韧震地'];
            return `【${bn[b]}】${['韧胫', '刺胫', '叠韧', '震胫'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_l_ram':
            return `【${bn[b]}】冲刃·${lv}式：冲刺结束后${((420 + t * 40) / 1000).toFixed(2)}秒内近战伤害+${pct(6, 0.65)}%（${bn[b]}下附带额外突进感，表现为略高触发期望）`;
        case 'void_l_strike': {
            const core = `击杀后${pct0(12, 1)}%获得+${pct(10, 1)}%攻击力，持续${r(3600, 120)}毫秒`;
            const tail = ['', '，嗜战吸血', '，可叠嗜意', '，满层嗜战范围咆哮'];
            return `【${bn[b]}】${['嗜战', '血战', '叠战', '咆战'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_l_overdrive': {
            const core = `命中时${pct0(8, 1)}%获得+${pct(6, 0.9)}%攻击速度，持续${r(4800, 120)}毫秒`;
            const tail = ['', '，过载附带移速', '，过载可刷新', '，过载结束电弧'];
            return `【${bn[b]}】${['过载', '疾载', '续载', '雷载'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_f_chase': {
            const core = `击杀后${pct0(18, 1)}%获得下一击+${pct(15, 1.1)}%伤害，${5 + Math.floor(t / 4)}秒内消耗`;
            const tail = ['', '，追影附带穿透', '，可存双影', '，影击引爆'];
            return `【${bn[b]}】${['追影', '穿影', '双影', '影爆'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_f_rush': {
            const core = `受击时${pct0(9, 1)}%获得+${pct(12, 1)}%移速，持续${r(1600, 80)}毫秒`;
            const tail = ['', '，疾撤留下残影伤', '，疾撤可二段', '，疾撤结束回旋踢'];
            return `【${bn[b]}】${['疾撤', '影撤', '二撤', '旋撤'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_f_trace': {
            const core = `命中时${pct0(8, 1)}%获得+${pct(7.5, 0.9)}%攻击速度，持续${r(3600, 100)}毫秒`;
            const tail = ['', '，残痕叠攻', '，残痕可爆', '，残痕链导'];
            return `【${bn[b]}】${['残痕', '叠痕', '爆痕', '链痕'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_f_flash': {
            const core = `闪避成功时${pct0(14, 1)}%回复${pct(1.9, 0.22)}%最大生命`;
            const tail = ['', '，虚步短暂加闪', '，虚步可二连闪感', '，虚步落地震波'];
            return `【${bn[b]}】${['虚步', '闪步', '连步', '震步'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_f_surge': {
            const core = `击杀后${pct0(14, 1)}%获得+${pct(12, 1)}%攻击力，持续${r(3200, 120)}毫秒`;
            const tail = ['', '，踏杀回能', '，踏杀可叠', '，踏杀终结波'];
            return `【${bn[b]}】${['踏杀', '回踏', '叠踏', '终踏'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_n_mend': {
            const core = `命中时${pct0(7, 1)}%回复${pct(1.2, 0.2)}%最大生命`;
            const tail = ['', '，涌泉净化', '，过量转盾', '，涌泉链疗'];
            return `【${bn[b]}】${['涌泉', '净泉', '溢泉', '链泉'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_n_skill': {
            const core = `武器技能伤害+${pct(5, 0.65)}%（与星图类加法叠加）`;
            const tail = ['', '，技能命中回能', '，技能减技能冷却', '，技能终结追加虚刃'];
            return `【${bn[b]}】${['渊能', '回渊', '冷渊', '刃渊'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_n_snare': {
            const core = `命中时${pct0(6, 1)}%冰冻目标约${r(420, 35)}毫秒`;
            const tail = ['', '，缚链附带易伤', '，双缚', '，缚链扩散'];
            return `【${bn[b]}】${['缚链', '刺链', '双缚', '域缚'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_n_arc': {
            const core = `命中时${pct0(5, 1)}%对${r(92, 5)}像素内另一敌人造成${pct(28, 1.2)}%攻击力`;
            const tail = ['', '，弧光回能', '，双弧', '，弧光滞留'];
            return `【${bn[b]}】${['弧光', '回弧', '双弧', '滞弧'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_n_well': {
            const core = `近8秒内有战斗时，每${r(3000, -80)}毫秒回复${pct(0.85, 0.12)}%最大生命`;
            const tail = ['', '，深井附带回蓝感（略提攻速）', '，战斗越久回复越高', '，深井满时爆发治疗'];
            return `【${bn[b]}】${['深井', '活井', '涨井', '爆井'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_r_twin': {
            const core = `命中时${pct0(5, 1)}%追加一段${pct(24, 2)}%伤害的追击`;
            const tail = ['', '，双环吸血', '，三环', '，环击引爆'];
            return `【${bn[b]}】${['双环', '血环', '三环', '爆环'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_r_sever': {
            const core = `对生命低于${pct(31, -0.55)}%的目标伤害+${pct(9, 0.9)}%`;
            const tail = ['', '，断末击杀回金', '，断末可叠', '，断末斩范围'];
            return `【${bn[b]}】${['断末', '金末', '叠末', '域末'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_r_fervor': {
            const core = `暴击时获得+${pct(6.5, 0.9)}%攻击力，持续${r(4800, 120)}毫秒（刷新）`;
            const tail = ['', '，狂热吸血', '，狂热可叠层', '，狂热满层爆发'];
            return `【${bn[b]}】${['狂热', '血热', '叠热', '爆热'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_r_tempo': {
            const core = `命中时${pct0(7, 1)}%武器技能冷却缩短${r(320, 35)}毫秒`;
            const tail = ['', '，节律附带移速', '，双触节律', '，节律重置小技能'];
            return `【${bn[b]}】${['节律', '疾律', '双律', '溯律'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_r_greed': {
            const core = `击杀时${pct0(6, 1)}%额外获得${r(9, 2)}～${r(16, 2)}金币`;
            const tail = ['', '，贪噬吸血', '，双倍贪噬概率', '，贪噬爆炸金币'];
            return `【${bn[b]}】${['贪噬', '血贪', '倍贪', '爆贪'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_g_tithe': {
            const core = `击杀时${pct0(9, 1)}%额外获得${r(8, 2)}～${r(18, 2)}金币`;
            const tail = ['', '，课金附带经验', '，课金二次Roll', '，课金范围掉落'];
            return `【${bn[b]}】${['课金', '智课', '双课', '域课'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_g_hoard':
            return `【${bn[b]}】${['屯积', '金涌', '金域', '金潮'][b]}·${lv}式：恶魔塔内获得金币+${pct(4, 0.75)}%（${bn[b]}机制侧重${['稳定', '波动', '精英', 'Boss'][b]}收益）`;
        case 'void_g_covet': {
            const core = `获得金币时${pct(4.5, 0.75)}%概率该次金币翻倍`;
            const tail = ['', '，觊觎附带经验', '，三连翻倍衰减', '，觊觎范围金币雨'];
            return `【${bn[b]}】${['觊觎', '丰觊', '连觊', '雨觊'][b]}·${lv}式：${core}${tail[b]}`;
        }
        case 'void_g_elite':
            return `【${bn[b]}】${['猎爵', '爵印', '爵域', '爵殒'][b]}·${lv}式：击杀精英额外+${r(12, 2)}金币（高段对精英附加虚金爆）`;
        case 'void_g_fortune': {
            const core = `击杀时${pct0(6, 1)}%再获得一次等额金币`;
            const tail = ['', '，洪福附带药水感（回血）', '，洪福可连锁', '，洪福大奖池'];
            return `【${bn[b]}】${['洪福', '福泽', '连福', '巨福'][b]}·${lv}式：${core}${tail[b]}`;
        }
        default:
            return `虚空词条·${lv}式`;
    }
}

/**
 * 解析恶魔塔深阶装备名称（套装仍靠 set-deep-config）
 * @param {string} name
 * @returns {{ id: string, description: string }|null}
 */
function resolveDeepEquipmentTrait(name) {
    if (!name || typeof name !== 'string') return null;
    const m = name.match(/^(.+?)([凡良湛炽曜])·(.+)$/);
    if (!m) return null;
    const theme = m[1];
    const qHan = m[2];
    const suffix = m[3];
    const themeTier = DEEP_THEME_TO_TIER[theme];
    const qIdx = DEEP_QUALITY_HAN_ORDER[qHan];
    if (qIdx === undefined || themeTier === undefined) return null;
    const resolveMap = getDeepSuffixTraitResolveMap();
    if (!resolveMap) return null;
    const hit = resolveMap[suffix];
    if (!hit || hit.themeTier !== themeTier || hit.qIdx !== qIdx) return null;
    const lineFamilies = DEEP_TRAIT_FAMILY_BY_LINE[hit.line];
    if (!lineFamilies) return null;
    const family = lineFamilies[qIdx];
    if (!family) return null;
    const id = `${family}_${themeTier}`;
    const line = buildDeepTraitDescriptionLine(family, themeTier);
    const description = `【${theme}】${line}`;
    return { id, description };
}

/** 与 DEEP_THEME_TO_TIER 下标一致，用于展示主题档名称 */
const DEEP_THEME_ORDER = ['渊隙', '虚印', '腐噬', '黑曜', '终幕', '星骸', '裂点', '终焉'];

/**
 * 从深阶武器全名解析主题等级档 0～7（渊隙～终焉）
 */
function parseDeepWeaponThemeTierFromName(name) {
    if (!name || typeof name !== 'string') return 0;
    const m = name.match(/^(.+?)([凡良湛炽曜])·/);
    if (!m) return 0;
    const idx = DEEP_THEME_TO_TIER[m[1]];
    return typeof idx === 'number' ? Math.max(0, Math.min(7, idx)) : 0;
}

/** 同一品质下 8 档主题的技能名后缀（与 DEEP_THEME_ORDER 下标对齐，刻意拉开意象） */
const DEEP_MELEE_SKILL_STEM = {
    common: ['渊痕斩', '印脉裂', '溃噬牙', '黯印切', '裂幕断', '星屑雨', '临界点', '归墟引'],
    rare: ['虚印贯刺', '逆流刺', '腐噬穿', '黑曜断筋', '终幕连刺', '星骸挑', '裂点崩', '终焉绝刺'],
    fine: ['裂隙潮', '涡心斩', '黯潮引', '星涌回旋', '临界涡', '黑潮龙卷', '裂域震', '归潮灭'],
    epic: ['黑潮噬界', '黯域剥离', '殒潮葬送', '星噬漩涡', '裂界潮涌', '终幕吞噬', '临界点爆', '归渊归无'],
    legendary: ['终焉裁断', '虚空行刑', '星罚天倾', '裂界终式', '归墟敕令', '湮界归零', '终幕神谕', '天渊一斩']
};

const DEEP_RANGED_SKILL_STEM = {
    common: ['隙穿矢', '印轨矢', '溃蚀钉', '黯痕追', '裂幕散', '星屑骤雨', '临界钉', '归墟矢'],
    rare: ['穿墟箭', '逆流箭', '噬风贯', '黑曜钉刺', '终幕连珠', '星骸索', '裂点爆矢', '终焉追魂'],
    fine: ['星轨缚', '涡锁连射', '黯缚钉', '星坠囚', '临界网', '黑曜束', '裂域箭幕', '归缚审判'],
    epic: ['黯曜殒雨', '域殒倾泻', '星殒暴雨', '黑潮箭岚', '裂界箭狱', '终幕箭葬', '临界点射', '归殒天罗'],
    legendary: ['湮星天罚', '天罚贯日', '界罚连星', '星渊终矢', '终焉星陨', '湮界绝射', '天殒归一', '归星神罚']
};

function getDeepMeleeBase(quality) {
    const Rm = CONFIG.PLAYER_ATTACK_RANGE;
    const B = {
        common: {
            cooldown: 8200,
            damageMultiplier: 1.55,
            range: Rm * 1.05,
            dotDamage: 0.04,
            dotDuration: 2000
        },
        rare: {
            cooldown: 9000,
            damageMultiplier: 1.78,
            range: Rm * 1.12,
            critBonus: 0.12,
            speedBoost: 0.12,
            speedBoostDuration: 3000
        },
        fine: {
            cooldown: 10200,
            damageMultiplier: 2.05,
            range: Rm * 1.48,
            attackSpeedBoost: 0.18,
            attackSpeedBoostDuration: 3500
        },
        epic: {
            cooldown: 11800,
            damageMultiplier: 2.68,
            range: Rm * 1.92,
            dotDamage: 0.12,
            dotDuration: 3200
        },
        legendary: {
            cooldown: 14800,
            damageMultiplier: 4.05,
            range: Rm * 2.38,
            guaranteedCrit: true
        }
    };
    return B[quality] ? Object.assign({}, B[quality]) : null;
}

function getDeepRangedBase(quality) {
    const Rb = CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220;
    const B = {
        common: {
            cooldown: 8200,
            damageMultiplier: 1.52,
            range: Rb * 1.0,
            dotDamage: 0.035,
            dotDuration: 1800
        },
        rare: {
            cooldown: 9000,
            damageMultiplier: 1.82,
            range: Rb * 1.02,
            critBonus: 0.18
        },
        fine: {
            cooldown: 10200,
            damageMultiplier: 2.08,
            range: Rb * 1.05,
            slowEffect: 0.28,
            slowDuration: 2800
        },
        epic: {
            cooldown: 12000,
            damageMultiplier: 2.66,
            range: Rb * 1.08,
            dotDamage: 0.1,
            dotDuration: 3000
        },
        legendary: {
            cooldown: 14800,
            damageMultiplier: 4.1,
            range: Rb * 1.1,
            guaranteedCrit: true
        }
    };
    return B[quality] ? Object.assign({}, B[quality]) : null;
}

/** 8 档主题各不重复：组合伤害形态 + 控制/资源/团队向效果（与精炼表独立） */
function applyDeepMeleeTierVariant(skill, quality, tier) {
    const t = tier;
    if (quality === 'normal') {
        const bd = skill.dotDamage != null ? skill.dotDamage : 0.04;
        const bdur = skill.dotDuration || 2000;
        switch (t) {
            case 0:
                skill.dotDamage = bd * (1.08 + t * 0.04);
                break;
            case 1:
                skill.dotDamage = bd * 0.48;
                skill.dotDuration = Math.floor(bdur * 0.78);
                skill.speedBoost = 0.1 + t * 0.017;
                skill.speedBoostDuration = 2700 + t * 60;
                break;
            case 2:
                skill.dotDamage = bd * 0.72;
                skill.slowEffect = 0.15 + t * 0.012;
                skill.slowDuration = 2000 + t * 120;
                break;
            case 3:
                skill.dotDamage = bd * (1.42 + t * 0.03);
                skill.damageMultiplier += 0.05 + t * 0.006;
                break;
            case 4:
                skill.critRateBonus = 7 + Math.floor(t * 1.1);
                skill.dotDamage = bd * 0.62;
                skill.cooldown = Math.max(5400, skill.cooldown - 80);
                break;
            case 5:
                skill.cooldown = Math.max(5200, skill.cooldown - 220 - t * 48);
                skill.dotDamage = bd * (1.05 + t * 0.025);
                skill.range *= 1.03;
                break;
            case 6:
                skill.enemyDebuff = 0.12 + t * 0.014;
                skill.debuffDuration = 3000 + t * 100;
                skill.dotDamage = bd * 0.58;
                break;
            case 7:
                skill.freezeEffect = true;
                skill.freezeDuration = 900 + t * 110;
                skill.dotDamage = bd * 0.82;
                skill.damageMultiplier += 0.07;
                break;
            default: break;
        }
        return;
    }
    if (quality === 'rare') {
        const bc = skill.critBonus || 0.12;
        const bs = skill.speedBoost || 0.12;
        switch (t) {
            case 0:
                skill.critBonus = bc * (1.06 + t * 0.045);
                skill.speedBoost = bs * (1.05 + t * 0.02);
                break;
            case 1:
                skill.critBonus = bc * 1.38;
                skill.speedBoost = bs * 0.55;
                skill.damageMultiplier += 0.04;
                break;
            case 2:
                skill.dotDamage = 0.042 + t * 0.006;
                skill.dotDuration = 2200 + t * 90;
                skill.speedBoost = bs * 0.85;
                break;
            case 3:
                skill.slowEffect = 0.19 + t * 0.01;
                skill.slowDuration = 2300 + t * 100;
                skill.critBonus = bc * 0.92;
                break;
            case 4:
                skill.dodgeBoost = 0.12 + t * 0.013;
                skill.dodgeBoostDuration = 3400 + t * 70;
                skill.speedBoost = bs * 0.72;
                break;
            case 5:
                skill.cooldown = Math.max(6000, skill.cooldown - 180 - t * 42);
                skill.critBonus = bc * (1.12 + t * 0.04);
                skill.attackBoost = 0.08 + t * 0.01;
                skill.attackBoostDuration = 3500;
                break;
            case 6:
                skill.attackBoost = 0.14 + t * 0.012;
                skill.attackBoostDuration = 4200 + t * 50;
                skill.speedBoost = bs * 0.68;
                break;
            case 7:
                skill.enemyDebuff = 0.14 + t * 0.012;
                skill.debuffDuration = 3800 + t * 80;
                skill.critBonus = bc * 1.25;
                skill.damageMultiplier += 0.06;
                break;
            default: break;
        }
        return;
    }
    if (quality === 'magic') {
        const ba = skill.attackSpeedBoost || 0.18;
        switch (t) {
            case 0:
                skill.attackSpeedBoost = ba * (1.06 + t * 0.045);
                break;
            case 1:
                skill.dotDamage = 0.06 + t * 0.008;
                skill.dotDuration = 2800;
                skill.attackSpeedBoost = ba * 0.88;
                break;
            case 2:
                skill.slowEffect = 0.16 + t * 0.009;
                skill.slowDuration = 2600 + t * 75;
                break;
            case 3:
                skill.range *= 1.08 + t * 0.014;
                skill.damageMultiplier += 0.04 + t * 0.004;
                break;
            case 4:
                skill.critRateBonus = 8 + Math.floor(t * 0.75);
                skill.attackSpeedBoostDuration = (skill.attackSpeedBoostDuration || 3500) + 300 + t * 45;
                break;
            case 5:
                skill.cooldown = Math.max(6600, skill.cooldown - 200 - t * 38);
                skill.speedBoost = 0.09 + t * 0.012;
                skill.speedBoostDuration = 3200;
                break;
            case 6:
                skill.aoeDamage = 0.32 + t * 0.022;
                skill.attackSpeedBoost = ba * 0.95;
                break;
            case 7:
                skill.freezeEffect = true;
                skill.freezeDuration = 800 + t * 95;
                skill.range *= 1.05;
                skill.damageMultiplier += 0.055;
                break;
            default: break;
        }
        return;
    }
    if (quality === 'epic') {
        const bd = skill.dotDamage || 0.12;
        switch (t) {
            case 0:
                skill.dotDamage = bd * (1.08 + t * 0.04);
                break;
            case 1:
                skill.enemySlowEffect = 0.26 + t * 0.011;
                skill.slowDuration = 3400 + t * 85;
                break;
            case 2:
                skill.speedBoost = 0.12 + t * 0.013;
                skill.speedBoostDuration = 3400;
                skill.dotDamage = bd * 0.88;
                break;
            case 3:
                skill.dotDuration = (skill.dotDuration || 3200) + 450 + t * 60;
                skill.damageMultiplier += 0.045 + t * 0.005;
                break;
            case 4:
                skill.slowEffect = 0.18 + t * 0.008;
                skill.slowDuration = 2800;
                skill.dotDamage = bd * 1.1;
                break;
            case 5:
                skill.range *= 1.06 + t * 0.012;
                skill.cooldown = Math.max(7800, skill.cooldown - 140 - t * 35);
                break;
            case 6:
                skill.healPercent = 0.038 + t * 0.006;
                skill.dotDamage = bd * 0.92;
                break;
            case 7:
                skill.enemyDebuff = 0.1 + t * 0.012;
                skill.debuffDuration = 3600 + t * 70;
                skill.dotDamage = bd * (1.25 + t * 0.02);
                skill.damageMultiplier += 0.05;
                break;
            default: break;
        }
        return;
    }
    if (quality === 'legendary') {
        switch (t) {
            case 0:
                skill.damageMultiplier += 0.06 + t * 0.007;
                break;
            case 1:
                skill.healPercent = 0.07 + t * 0.009;
                break;
            case 2:
                skill.dotDamage = 0.09 + t * 0.007;
                skill.dotDuration = 3000 + t * 75;
                break;
            case 3:
                skill.enemySlowEffect = 0.3 + t * 0.01;
                skill.slowDuration = 3800 + t * 65;
                break;
            case 4:
                skill.allStatsBoost = 0.09 + t * 0.007;
                skill.allStatsBoostDuration = 4400 + t * 90;
                break;
            case 5:
                skill.cooldown = Math.max(9000, skill.cooldown - 200 - t * 45);
                skill.damageMultiplier += 0.08 + t * 0.006;
                skill.range *= 1.04;
                break;
            case 6:
                skill.attackBoost = 0.16 + t * 0.012;
                skill.attackBoostDuration = 5000 + t * 60;
                break;
            case 7:
                skill.enemyDebuff = 0.16 + t * 0.011;
                skill.debuffDuration = 4600 + t * 70;
                skill.damageMultiplier += 0.1;
                skill.aoeDamage = 0.25 + t * 0.015;
                break;
            default: break;
        }
    }
}

function applyDeepRangedTierVariant(skill, quality, tier) {
    const t = tier;
    if (quality === 'normal') {
        const bd = skill.dotDamage != null ? skill.dotDamage : 0.035;
        const bdur = skill.dotDuration || 1800;
        switch (t) {
            case 0:
                skill.dotDamage = bd * (1.1 + t * 0.038);
                break;
            case 1:
                skill.dotDamage = bd * 0.45;
                skill.dotDuration = Math.floor(bdur * 0.76);
                skill.speedBoost = 0.09 + t * 0.016;
                skill.speedBoostDuration = 2600 + t * 55;
                break;
            case 2:
                skill.slowEffect = 0.16 + t * 0.011;
                skill.slowDuration = 1900 + t * 105;
                skill.dotDamage = bd * 0.68;
                break;
            case 3:
                skill.dotDamage = bd * (1.38 + t * 0.032);
                skill.damageMultiplier += 0.045 + t * 0.005;
                break;
            case 4:
                skill.critRateBonus = 8 + Math.floor(t * 1.05);
                skill.dotDamage = bd * 0.58;
                skill.range *= 1.04;
                break;
            case 5:
                skill.cooldown = Math.max(5200, skill.cooldown - 200 - t * 46);
                skill.dotDamage = bd * (1.02 + t * 0.028);
                break;
            case 6:
                skill.enemyDebuff = 0.11 + t * 0.013;
                skill.debuffDuration = 2900 + t * 95;
                skill.dotDamage = bd * 0.55;
                break;
            case 7:
                skill.freezeEffect = true;
                skill.freezeDuration = 850 + t * 100;
                skill.damageMultiplier += 0.065;
                skill.dotDamage = bd * 0.78;
                break;
            default: break;
        }
        return;
    }
    if (quality === 'rare') {
        const bc = skill.critBonus || 0.18;
        switch (t) {
            case 0:
                skill.critBonus = bc * (1.08 + t * 0.042);
                break;
            case 1:
                skill.critBonus = bc * 1.26;
                skill.speedBoost = 0.11 + t * 0.011;
                skill.speedBoostDuration = 3000;
                break;
            case 2:
                skill.dotDamage = 0.048 + t * 0.0065;
                skill.dotDuration = 2100 + t * 80;
                break;
            case 3:
                skill.slowEffect = 0.18 + t * 0.01;
                skill.slowDuration = 2400 + t * 90;
                skill.critBonus = bc * 0.95;
                break;
            case 4:
                skill.range *= 1.08 + t * 0.01;
                skill.critRateBonus = 5 + Math.floor(t * 0.5);
                break;
            case 5:
                skill.cooldown = Math.max(6000, skill.cooldown - 170 - t * 40);
                skill.critBonus = bc * (1.15 + t * 0.038);
                break;
            case 6:
                skill.attackBoost = 0.12 + t * 0.011;
                skill.attackBoostDuration = 4000 + t * 55;
                break;
            case 7:
                skill.enemyDebuff = 0.13 + t * 0.012;
                skill.debuffDuration = 3600 + t * 75;
                skill.critBonus = bc * 1.22;
                skill.damageMultiplier += 0.055;
                break;
            default: break;
        }
        return;
    }
    if (quality === 'magic') {
        const sl = skill.slowEffect || 0.28;
        const sd = skill.slowDuration || 2800;
        switch (t) {
            case 0:
                skill.slowEffect = Math.min(0.52, sl * (1.06 + t * 0.028));
                break;
            case 1:
                skill.dotDamage = 0.055 + t * 0.007;
                skill.dotDuration = 2500;
                skill.slowEffect = sl * 0.9;
                break;
            case 2:
                skill.critRateBonus = 9 + Math.floor(t * 0.7);
                skill.slowDuration = sd + 180 + t * 65;
                break;
            case 3:
                skill.slowDuration = sd + 400 + t * 80;
                skill.enemySlowEffect = 0.15 + t * 0.008;
                break;
            case 4:
                skill.speedBoost = 0.12 + t * 0.012;
                skill.speedBoostDuration = 3200 + t * 55;
                break;
            case 5:
                skill.cooldown = Math.max(6600, skill.cooldown - 190 - t * 36);
                skill.slowEffect = Math.min(0.5, sl * (1.04 + t * 0.018));
                break;
            case 6:
                skill.aoeDamage = 0.28 + t * 0.02;
                skill.slowEffect = sl * 0.94;
                break;
            case 7:
                skill.freezeEffect = true;
                skill.freezeDuration = 750 + t * 90;
                skill.slowEffect = sl * 1.05;
                skill.damageMultiplier += 0.05;
                break;
            default: break;
        }
        return;
    }
    if (quality === 'epic') {
        const bd = skill.dotDamage || 0.1;
        switch (t) {
            case 0:
                skill.dotDamage = bd * (1.1 + t * 0.04);
                break;
            case 1:
                skill.slowEffect = 0.14 + t * 0.009;
                skill.slowDuration = 2700;
                break;
            case 2:
                skill.critBonus = 0.14 + t * 0.016;
                skill.dotDamage = bd * 0.9;
                break;
            case 3:
                skill.dotDuration = (skill.dotDuration || 3000) + 400 + t * 55;
                skill.healPercent = 0.025 + t * 0.005;
                break;
            case 4:
                skill.range *= 1.06 + t * 0.009;
                skill.enemySlowEffect = 0.18 + t * 0.009;
                skill.slowDuration = 3000;
                break;
            case 5:
                skill.cooldown = Math.max(7800, skill.cooldown - 120 - t * 32);
                skill.damageMultiplier += 0.04 + t * 0.005;
                break;
            case 6:
                skill.enemyDebuff = 0.09 + t * 0.01;
                skill.debuffDuration = 3200 + t * 60;
                skill.dotDamage = bd * 1.08;
                break;
            case 7:
                skill.aoeDamage = 0.35 + t * 0.018;
                skill.dotDamage = bd * (1.2 + t * 0.025);
                skill.damageMultiplier += 0.06;
                break;
            default: break;
        }
        return;
    }
    if (quality === 'legendary') {
        switch (t) {
            case 0:
                skill.damageMultiplier += 0.055 + t * 0.007;
                break;
            case 1:
                skill.healPercent = 0.06 + t * 0.01;
                break;
            case 2:
                skill.dotDamage = 0.08 + t * 0.008;
                skill.dotDuration = 2800 + t * 70;
                break;
            case 3:
                skill.slowEffect = 0.2 + t * 0.009;
                skill.slowDuration = 3000 + t * 75;
                break;
            case 4:
                skill.allStatsBoost = 0.08 + t * 0.008;
                skill.allStatsBoostDuration = 4000 + t * 80;
                break;
            case 5:
                skill.cooldown = Math.max(9000, skill.cooldown - 180 - t * 42);
                skill.range *= 1.05 + t * 0.007;
                break;
            case 6:
                skill.attackBoost = 0.14 + t * 0.013;
                skill.attackBoostDuration = 4800 + t * 55;
                break;
            case 7:
                skill.enemyDebuff = 0.15 + t * 0.011;
                skill.debuffDuration = 4200 + t * 65;
                skill.aoeDamage = 0.3 + t * 0.016;
                skill.damageMultiplier += 0.09;
                break;
            default: break;
        }
    }
}

function buildDeepWeaponSkillDescription(skill, theme, isRanged) {
    const pct = Math.round(skill.damageMultiplier * 100);
    const Rm = CONFIG.PLAYER_ATTACK_RANGE;
    let target = isRanged ? '锁定目标' : (skill.range > Rm * 1.34 ? '周围敌人' : '目标');
    if (skill.castMode === 'ground_aoe') target = '准星方向落点范围内敌人';
    else if (skill.castMode === 'target_lock') target = '锁定目标';
    const parts = [`【${theme}】对${target}造成${pct}%攻击力伤害`];
    if (skill.guaranteedCrit) parts.push('必定暴击');
    if (skill.dotDamage && skill.dotDuration) parts.push('附带虚蚀灼噬');
    if (skill.aoeDamage) parts.push('主目标周围溅射');
    if (skill.speedBoost) parts.push('命中后提升移速');
    if (skill.dodgeBoost) parts.push('命中后提升闪避');
    if (skill.attackBoost) parts.push('命中后提升攻击力');
    if (skill.slowEffect) parts.push('使目标减速');
    if (skill.freezeEffect) parts.push('附带冰冻');
    if (skill.critBonus) parts.push('额外暴击伤害');
    if (skill.critRateBonus) parts.push('暴击率提升');
    if (skill.attackSpeedBoost) parts.push('大幅提升攻速');
    if (skill.enemySlowEffect) parts.push('降低敌人攻速');
    if (skill.enemyDebuff) parts.push('降低敌人全属性');
    if (skill.healPercent) parts.push('回复生命');
    if (skill.allStatsBoost) parts.push('短暂提升全属性');
    return parts.join('；') + '。';
}

function buildDeepMeleeWeaponSkillTemplate(quality, themeTier) {
    const tier = Math.max(0, Math.min(7, +themeTier || 0));
    const theme = DEEP_THEME_ORDER[tier] || DEEP_THEME_ORDER[0];
    const skill = getDeepMeleeBase(quality);
    if (!skill) return null;
    skill.damageMultiplier = Math.round((skill.damageMultiplier + tier * 0.016) * 100) / 100;
    skill.cooldown = Math.max(4800, Math.floor(skill.cooldown - tier * 58));
    skill.range *= 1 + tier * 0.0085;
    applyDeepMeleeTierVariant(skill, quality, tier);
    const stems = DEEP_MELEE_SKILL_STEM[quality];
    skill.name = stems && stems[tier] ? `${theme}·${stems[tier]}` : `${theme}·深阶斩`;
    const modeRot = tier % 3;
    if (modeRot === 0) {
        skill.castMode = 'radial';
    } else if (modeRot === 1) {
        skill.castMode = 'ground_aoe';
        skill.groundCastRange = skill.range * 1.1;
        skill.groundAoERadius = skill.range * 0.63;
    } else {
        skill.castMode = 'target_lock';
        skill.showLockMarker = true;
    }
    skill.description = buildDeepWeaponSkillDescription(skill, theme, false);
    return skill;
}

function buildDeepRangedWeaponSkillTemplate(quality, themeTier) {
    const tier = Math.max(0, Math.min(7, +themeTier || 0));
    const theme = DEEP_THEME_ORDER[tier] || DEEP_THEME_ORDER[0];
    const skill = getDeepRangedBase(quality);
    if (!skill) return null;
    skill.damageMultiplier = Math.round((skill.damageMultiplier + tier * 0.016) * 100) / 100;
    skill.cooldown = Math.max(4800, Math.floor(skill.cooldown - tier * 58));
    skill.range *= 1 + tier * 0.0075;
    applyDeepRangedTierVariant(skill, quality, tier);
    const stems = DEEP_RANGED_SKILL_STEM[quality];
    skill.name = stems && stems[tier] ? `${theme}·${stems[tier]}` : `${theme}·深阶矢`;
    skill.castMode = 'target_lock';
    skill.showLockMarker = true;
    skill.description = buildDeepWeaponSkillDescription(skill, theme, true);
    return skill;
}

/**
 * 深阶武器技能实例（主题档 渊隙～终焉 决定同品质下的技能名与机制变体）
 * @param {'melee'|'ranged'} weaponType
 * @param {string} quality
 * @param {string} weaponName 全名，用于解析主题等级档
 */
function getDeepWeaponSkillObject(weaponType, quality, weaponName) {
    const themeTier = parseDeepWeaponThemeTierFromName(weaponName);
    const t = weaponType === 'ranged'
        ? buildDeepRangedWeaponSkillTemplate(quality, themeTier)
        : buildDeepMeleeWeaponSkillTemplate(quality, themeTier);
    return t ? Object.assign({}, t) : null;
}

/** 按主题档微调精炼并加段式前缀，高段略强化数值 */
function flavorDeepRefineListByTheme(list, themeTier) {
    if (!list) return null;
    const tt = Math.max(0, Math.min(7, +themeTier || 0));
    const theme = DEEP_THEME_ORDER[tt];
    const dmgExtra = Math.round(tt * 0.45) / 100;
    const cdExtra = tt * 28;
    return list.map((entry, starIdx) => {
        const e = Object.assign({}, entry);
        if (typeof e.damageMultiplier === 'number') e.damageMultiplier = Math.round((e.damageMultiplier + dmgExtra) * 1000) / 1000;
        if (typeof e.cooldownReduction === 'number') e.cooldownReduction = Math.floor(e.cooldownReduction + cdExtra);
        if (starIdx === 2 && tt >= 4 && e.critRateBonus == null) e.critRateBonus = 2 + Math.floor(tt / 2);
        if (starIdx === 4 && tt >= 5 && e.healOnHit == null && e.dotDamageBonus == null) {
            e.rangeMultiplier = (e.rangeMultiplier || 0) + 0.02 + tt * 0.004;
        }
        e.description = `[${theme}段式] ${e.description}`;
        return e;
    });
}

/** 深阶武器精炼 1～5 星（全新词条；themeTier 影响前缀与小幅数值） */
function getDeepWeaponRefineEffectsList(weaponType, quality, themeTier) {
    const melee = {
        common: [
            { damageMultiplier: 0.09, description: '虚痕加深：技能伤害+9%' },
            { damageMultiplier: 0.18, dotDamageBonus: 0.015, dotDurationBonus: 300, description: '灼噬扩散：伤害+18%，虚痕DoT略增强' },
            { damageMultiplier: 0.26, cooldownReduction: 900, description: '渊息回流：伤害+26%，冷却-0.9秒' },
            { damageMultiplier: 0.34, rangeMultiplier: 0.14, description: '裂痕扩张：伤害+34%，范围+14%' },
            { damageMultiplier: 0.42, cooldownReduction: 1800, extraDamage: 0.32, description: '终痕爆裂：伤害+42%，冷却-1.8秒，额外32%攻击力伤害' }
        ],
        rare: [
            { damageMultiplier: 0.1, critRateBonus: 5, description: '印刻：伤害+10%，暴击率+5%' },
            { damageMultiplier: 0.19, critRateBonus: 10, cooldownReduction: 500, description: '透印：伤害+19%，暴击+10%，冷却-0.5秒' },
            { damageMultiplier: 0.28, cooldownReduction: 1200, description: '虚涌：伤害+28%，冷却-1.2秒' },
            { damageMultiplier: 0.37, rangeMultiplier: 0.12, critDamageBonus: 0.15, description: '铭域：伤害+37%，范围+12%，暴击伤害+15%' },
            { damageMultiplier: 0.46, cooldownReduction: 2200, guaranteedCrit: true, description: '真印解放：伤害+46%，冷却-2.2秒，技能必定暴击' }
        ],
        fine: [
            { damageMultiplier: 0.1, attackSpeedBoostBonus: 0.04, description: '潮锋：伤害+10%，技能攻速增益+4%' },
            { damageMultiplier: 0.2, buffDurationBonus: 400, description: '逆流：伤害+20%，增益持续+0.4秒' },
            { damageMultiplier: 0.29, cooldownReduction: 1000, rangeMultiplier: 0.08, description: '扩涌：伤害+29%，冷却-1秒，范围+8%' },
            { damageMultiplier: 0.38, critRateBonus: 8, rangeMultiplier: 0.1, description: '隙震：伤害+38%，暴击率+8%，范围+10%' },
            { damageMultiplier: 0.48, cooldownReduction: 2400, extraDamage: 0.28, attackSpeedBoostBonus: 0.06, description: '潮尽天开：伤害+48%，冷却-2.4秒，额外28%攻击力，攻速增益+6%' }
        ],
        epic: [
            { damageMultiplier: 0.11, dotDamageBonus: 0.02, description: '黑潮：伤害+11%，持续伤害+2%' },
            { damageMultiplier: 0.21, dotDurationBonus: 400, description: '黯延：伤害+21%，灼噬持续+0.4秒' },
            { damageMultiplier: 0.31, cooldownReduction: 1100, description: '噬界加速：伤害+31%，冷却-1.1秒' },
            { damageMultiplier: 0.41, rangeMultiplier: 0.12, dotDamageBonus: 0.03, description: '潮卷：伤害+41%，范围+12%，DoT+3%' },
            { damageMultiplier: 0.52, cooldownReduction: 2600, critDamageBonus: 0.22, healOnHit: 0.05, description: '噬尽归渊：伤害+52%，冷却-2.6秒，暴伤+22%，命中回复5%生命' }
        ],
        legendary: [
            { damageMultiplier: 0.12, critDamageBonus: 0.08, description: '裁断初式：伤害+12%，暴击伤害+8%' },
            { damageMultiplier: 0.23, cooldownReduction: 600, rangeMultiplier: 0.06, description: '虚空步：伤害+23%，冷却-0.6秒，范围+6%' },
            { damageMultiplier: 0.34, cooldownReduction: 1400, critRateBonus: 6, description: '裂界：伤害+34%，冷却-1.4秒，暴击率+6%' },
            { damageMultiplier: 0.45, rangeMultiplier: 0.14, reduceAllCooldownsOnHit: 800, description: '终幕回响：伤害+45%，范围+14%，命中再减武器技冷却0.8秒' },
            { damageMultiplier: 0.56, cooldownReduction: 3000, extraDamage: 0.38, resetCooldownOnKill: true, description: '终焉见证：伤害+56%，冷却-3秒，额外38%攻击力，击杀重置武器技冷却' }
        ]
    };
    const ranged = {
        common: [
            { damageMultiplier: 0.09, rangeMultiplier: 0.04, description: '隙矢聚焦：伤害+9%，射程+4%' },
            { damageMultiplier: 0.18, dotDamageBonus: 0.012, description: '轨蚀：伤害+18%，虚蚀DoT略增强' },
            { damageMultiplier: 0.26, cooldownReduction: 700, description: '穿隙：伤害+26%，冷却-0.7秒' },
            { damageMultiplier: 0.34, rangeMultiplier: 0.1, description: '矢域延展：伤害+34%，射程+10%' },
            { damageMultiplier: 0.42, cooldownReduction: 1600, critRateBonus: 6, description: '隙尽星明：伤害+42%，冷却-1.6秒，暴击率+6%' }
        ],
        rare: [
            { damageMultiplier: 0.1, critRateBonus: 5, description: '墟印：伤害+10%，暴击率+5%' },
            { damageMultiplier: 0.19, rangeMultiplier: 0.05, cooldownReduction: 500, description: '穿远：伤害+19%，射程+5%，冷却-0.5秒' },
            { damageMultiplier: 0.28, cooldownReduction: 1100, description: '箭潮：伤害+28%，冷却-1.1秒' },
            { damageMultiplier: 0.37, rangeMultiplier: 0.08, critDamageBonus: 0.12, description: '殒芒：伤害+37%，射程+8%，暴击伤害+12%' },
            { damageMultiplier: 0.46, cooldownReduction: 2000, guaranteedCrit: true, description: '天穿：伤害+46%，冷却-2秒，技能必定暴击' }
        ],
        fine: [
            { damageMultiplier: 0.1, slowEffectBonus: 0.04, description: '缚轨：伤害+10%，减速效果+4%' },
            { damageMultiplier: 0.2, debuffDurationBonus: 300, description: '星锁：伤害+20%，减速持续+0.3秒' },
            { damageMultiplier: 0.29, cooldownReduction: 1000, rangeMultiplier: 0.06, description: '轨坠：伤害+29%，冷却-1秒，射程+6%' },
            { damageMultiplier: 0.38, slowEffectBonus: 0.06, critRateBonus: 6, description: '缚灭：伤害+38%，减速+6%，暴击率+6%' },
            { damageMultiplier: 0.48, cooldownReduction: 2300, slowEffectBonus: 0.08, description: '星骸囚域：伤害+48%，冷却-2.3秒，减速+8%' }
        ],
        epic: [
            { damageMultiplier: 0.11, dotDamageBonus: 0.018, description: '殒雨：伤害+11%，灼噬+1.8%' },
            { damageMultiplier: 0.22, dotDurationBonus: 350, description: '黯曜：伤害+22%，DoT持续+0.35秒' },
            { damageMultiplier: 0.32, cooldownReduction: 1050, description: '雨落加速：伤害+32%，冷却-1.05秒' },
            { damageMultiplier: 0.42, rangeMultiplier: 0.09, dotDamageBonus: 0.025, description: '殒星扩散：伤害+42%，射程+9%，DoT+2.5%' },
            { damageMultiplier: 0.52, cooldownReduction: 2500, healOnHit: 0.04, description: '雨尽还生：伤害+52%，冷却-2.5秒，命中回复4%生命' }
        ],
        legendary: [
            { damageMultiplier: 0.12, critDamageBonus: 0.1, description: '湮星初罚：伤害+12%，暴击伤害+10%' },
            { damageMultiplier: 0.23, cooldownReduction: 700, rangeMultiplier: 0.05, description: '天罚贯轨：伤害+23%，冷却-0.7秒，射程+5%' },
            { damageMultiplier: 0.35, cooldownReduction: 1500, reduceAllCooldownsOnHit: 600, description: '星罚回响：伤害+35%，冷却-1.5秒，命中再减武器技冷却0.6秒' },
            { damageMultiplier: 0.46, rangeMultiplier: 0.1, critRateBonus: 8, description: '湮界：伤害+46%，射程+10%，暴击率+8%' },
            { damageMultiplier: 0.58, cooldownReduction: 3000, extraDamage: 0.35, resetCooldownOnKill: true, description: '天罚终幕：伤害+58%，冷却-3秒，额外35%攻击力，击杀重置武器技冷却' }
        ]
    };
    const pack = weaponType === 'ranged' ? ranged : melee;
    return flavorDeepRefineListByTheme(pack[quality] || null, themeTier);
}

/**
 * 20 级及以下装备词条分档说明（与 trait-id-helpers.standardEquipmentTier 一致）
 */
function formatStandardTierTraitDescription(baseDesc, tier, level) {
    const bands = ['入门档(1-5级)', '熟练档(6-10级)', '精练档(11-15级)', '极限档(16-20级)'];
    const extra = [
        '同系列基础机制。',
        '触发率与强度提升，并附带小幅额外收益。',
        '机制扩展：更易触发溅射/连锁/短时增益。',
        '高阶变体：额外伤害段或更强控制/范围表现。'
    ];
    return `${baseDesc} 【${bands[tier]} · 装备Lv${level}】${extra[tier]}`;
}

/**
 * 消耗品类
 * 用于表示消耗品：背包扩容、副本门票、打造配方、神圣十字架等（药水已移除）
 */
class Consumable {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.type = 'consumable'; // 标识为消耗品类型
        this.consumableType = data.consumableType || 'misc'; // resurrection、recipe、backpack_expansion、dungeon_ticket、misc
        this.quality = data.quality || 'normal'; // 品质
        this.description = data.description || '';
        this.effects = data.effects || {}; // 效果（仅药水）：{ attack: 10, duration: 30000 } 表示攻击力+10，持续30秒
        this.duration = data.duration || 30000; // 持续时间（毫秒，仅药水）
        this.price = data.price || 50; // 价格
        this.isCrafted = data.isCrafted || false; // 是否为合成/打造的药水
        // 配方相关属性
        if (data.recipeId !== undefined) {
            this.recipeId = data.recipeId; // 配方ID（仅打造配方）
        }
    }

    getTooltipHTML() {
        let html = `<h4 style="color: ${QUALITY_COLORS[this.quality]}">${this.name}</h4>`;
        html += `<p>类型: 消耗品</p>`;
        
        if (this.consumableType === 'resurrection') {
            html += `<p>子类型: 复活道具</p>`;
            html += `<p>品质: ${QUALITY_NAMES[this.quality]}</p>`;
            if (this.description) {
                html += `<p>${this.description}</p>`;
            }
            html += `<p>---</p>`;
            html += `<p><strong>效果:</strong></p>`;
            html += `<p>死亡时可以使用，恢复满血并获得3秒无敌</p>`;
            html += `<p style="color: #aaa; font-size: 12px;">死亡时自动询问是否使用</p>`;
        } else if (this.consumableType === 'recipe') {
            html += `<p>子类型: 武器图纸</p>`;
            html += `<p>品质: ${QUALITY_NAMES[this.quality]}</p>`;
            if (this.description) {
                html += `<p>${this.description}</p>`;
            }
            html += `<p>---</p>`;
            html += `<p><strong>用途:</strong></p>`;
            html += `<p>在铁匠铺中使用此图纸打造装备</p>`;
            html += `<p style="color: #aaa; font-size: 12px;">在铁匠铺的打造界面使用</p>`;
        } else {
            html += `<p>子类型: ${this.consumableType}</p>`;
            html += `<p>品质: ${QUALITY_NAMES[this.quality]}</p>`;
            if (this.description) {
                html += `<p>${this.description}</p>`;
            }
        }
        
        return html;
    }
}

/**
 * 商店「装备」栏上架的神圣十字架（固定 id，便于锁定/去重）
 */
function createHolyCrossShopOffer() {
    return new Consumable({
        id: 399998,
        name: '神圣十字架',
        consumableType: 'resurrection',
        quality: 'epic',
        description: '死亡时可以使用，恢复满血并获得3秒无敌',
        price: 500
    });
}

/**
 * 装备类
 * 用于表示装备，包含属性、强化等级等信息
 */
class Equipment {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.type = 'equipment'; // 标识为装备类型
        this.slot = window.normalizeEquipmentSlot(data.slot);
        this.weaponType = data.weaponType || 'sword';
        this.quality = window.normalizeEquipmentQuality(data.quality || 'normal');
        this.level = data.level || 1;
        this.enhanceLevel = data.enhanceLevel || 0; // 强化等级
        this.refineLevel = data.refineLevel || 0; // 精炼等级（0-5）
        this.baseStats = JSON.parse(JSON.stringify(data.stats || {})); // 基础属性（用于强化计算）
        this.stats = data.stats || {};
        if (this.slot === 'weapon') {
            this.stats.attack = this.stats.attack || 0;
            this.stats.critRate = this.stats.critRate || 0;
            this.stats.critDamage = this.stats.critDamage || 0;
            this.stats.magicAttack = this.stats.magicAttack || 0;
        } else if (['helmet', 'body', 'hands', 'legs', 'feet'].includes(this.slot)) {
            this.stats.health = this.stats.health || 0;
            this.stats.defense = this.stats.defense || 0;
            this.stats.magicDefense = this.stats.magicDefense || 0;
        } else if (['amulet', 'ring', 'belt'].includes(this.slot)) {
            this.stats.dodge = this.stats.dodge || 0;
            this.stats.attackSpeed = this.stats.attackSpeed || 0;
            this.stats.moveSpeed = this.stats.moveSpeed || 0;
        } else if (this.slot === 'offHand') {
            this.stats.defense = this.stats.defense || 0;
            this.stats.attack = this.stats.attack || 0;
        }
        
        // 保存基础属性
        if (!this.baseStats.attack) this.baseStats.attack = this.stats.attack || 0;
        if (!this.baseStats.critRate) this.baseStats.critRate = this.stats.critRate || 0;
        if (!this.baseStats.critDamage) this.baseStats.critDamage = this.stats.critDamage || 0;
        if (!this.baseStats.health) this.baseStats.health = this.stats.health || 0;
        if (!this.baseStats.defense) this.baseStats.defense = this.stats.defense || 0;
        if (!this.baseStats.magicAttack) this.baseStats.magicAttack = this.stats.magicAttack || 0;
        if (!this.baseStats.magicDefense) this.baseStats.magicDefense = this.stats.magicDefense || 0;
        if (!this.baseStats.dodge) this.baseStats.dodge = this.stats.dodge || 0;
        if (!this.baseStats.attackSpeed) this.baseStats.attackSpeed = this.stats.attackSpeed || 0;
        if (!this.baseStats.moveSpeed) this.baseStats.moveSpeed = this.stats.moveSpeed || 0;
        
        // 强化与精炼由 applyEnhancement / calculateEnhancedStats 统一计算（机制类数值不参与倍率）
        this.procedural = !!data.procedural;
        this.baseTypeId = data.baseTypeId || null;
        this.applyEnhancement();
        
        // 为所有武器添加技能
        if (this.slot === 'weapon') {
            this.skill = this.getWeaponSkill();
            // 初始化精炼效果
            this.refineEffects = this.getWeaponRefineEffects();
        } else {
            this.skill = null;
            this.refineEffects = null;
        }
        
        // 装备词条（旧静态体系已移除）
        this.equipmentTraits = data.equipmentTraits || null;
        
        this.isCrafted = data.isCrafted || false;
        this.implicit = data.implicit || null;
        this.prefixes = data.prefixes || [];
        this.suffixes = data.suffixes || [];
        this.legendaryPowers = data.legendaryPowers || [];
        this.setId = data.setId || null;
        this.classAffinity = data.classAffinity || null;
        this.gearScore = (typeof window.computeEquipmentGearScoreV2 === 'function' && (this.procedural || this.baseTypeId))
            ? window.computeEquipmentGearScoreV2(this)
            : ((typeof window.computeEquipmentGearScore === 'function')
                ? window.computeEquipmentGearScore(this)
                : (data.gearScore || 0));
    }
    
    /**
     * 获取武器精炼效果
     * @param {number} refineLevel - 精炼等级 (1-5)
     * @returns {Object|null} 精炼效果对象
     */
    getRefineEffect(refineLevel) {
        if (!this.refineEffects || refineLevel < 1 || refineLevel > 5) {
            return null;
        }
        return this.refineEffects[refineLevel - 1] || null;
    }
    
    getWeaponRefineEffects() {
        return null;
    }

    /**
     * 根据武器类型与品质获取技能（程序化）
     */
    getWeaponSkill() {
        if (this.slot !== 'weapon') return null;
        if (typeof window.getProceduralWeaponSkill === 'function') {
            return window.getProceduralWeaponSkill(this.weaponType, this.quality);
        }
        return null;
    }

    generateEquipmentTraits() {
        return null;
    }

    // 计算强化后的属性（基于精炼后的基础值）
    calculateEnhancedStats() {
        const enhancedStats = {};
        const enhanceMultiplier = 1 + this.enhanceLevel * 0.1; // 每级+10%
        
        let refinedBaseStats = {};
        if (this.refineLevel > 0) {
            const refineMultiplier = 1 + this.refineLevel * 0.5;
            Object.keys(this.baseStats).forEach(key => {
                const v = this.baseStats[key];
                if (v === 0 && !EQUIPMENT_MECHANIC_KEYS.has(key)) return;
                if (EQUIPMENT_MECHANIC_KEYS.has(key)) {
                    refinedBaseStats[key] = typeof v === 'number' ? v : 0;
                } else if (v !== 0) {
                    refinedBaseStats[key] = Math.floor(v * refineMultiplier);
                }
            });
        } else {
            refinedBaseStats = { ...this.baseStats };
        }
        
        for (const [key, value] of Object.entries(refinedBaseStats)) {
            if (EQUIPMENT_MECHANIC_KEYS.has(key)) {
                enhancedStats[key] = typeof value === 'number' ? value : 0;
            } else if (value !== 0) {
                enhancedStats[key] = Math.floor(value * enhanceMultiplier);
            }
        }
        
        return enhancedStats;
    }

    // 应用强化属性
    applyEnhancement() {
        // 使用calculateEnhancedStats来计算最终属性（它会先应用精炼，再应用强化）
        const enhancedStats = this.calculateEnhancedStats();
        // 重置stats
        this.stats = {};
        // 应用计算后的属性
        for (const [key, value] of Object.entries(enhancedStats)) {
            this.stats[key] = value;
        }
        Object.keys(this.baseStats).forEach(key => {
            if (this.stats[key] === undefined) {
                this.stats[key] = EQUIPMENT_MECHANIC_KEYS.has(key) ? (this.baseStats[key] || 0) : 0;
            }
        });
        if (typeof window.computeEquipmentGearScore === 'function') {
            this.gearScore = window.computeEquipmentGearScore(this);
        }
    }

    getTooltipHTML(currentEquipment = null) {
        const qDisplay = (typeof window.resolveQualityDisplay === 'function')
            ? window.resolveQualityDisplay(this.quality || this.legacyQuality)
            : { color: QUALITY_COLORS[this.quality], name: QUALITY_NAMES[this.quality] };
        let html = `<h4 style="color: ${qDisplay.color}">${this.name}</h4>`;
        if (this.gearScore > 0) {
            const stars = typeof window.getGearScoreStars === 'function' ? window.getGearScoreStars(this.gearScore) : 0;
            html += `<p style="color: #ccc;">装备分数: ${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 5 - stars))} (${this.gearScore})</p>`;
        }
        html += `<p>部位: ${SLOT_NAMES[this.slot] || this.slot}</p>`;
        html += `<p>品质: ${qDisplay.name}</p>`;
        html += `<p style="color: #ffaa00;">需要等级: ${this.level}</p>`;

        if (this.baseTypeId && window.BASE_TYPES) {
            const btDef = (window.BASE_TYPES.weapons && window.BASE_TYPES.weapons[this.baseTypeId])
                || (window.BASE_TYPES.offHand && window.BASE_TYPES.offHand[this.baseTypeId])
                || (window.BASE_TYPES.armor && window.BASE_TYPES.armor[this.baseTypeId])
                || (window.BASE_TYPES.accessories && window.BASE_TYPES.accessories[this.baseTypeId]);
            if (btDef) {
                html += `<p style="color: #aaa;">基型: ${btDef.name}</p>`;
            }
        }

        if (this.implicit && Object.keys(this.implicit).length) {
            html += `<p style="color: #88ccff; font-size: 11px;">隐式属性</p>`;
            for (const [key, value] of Object.entries(this.implicit)) {
                if (value) html += formatEquipmentStatLine(key, value, '88ccff');
            }
        }

        if (this.enhanceLevel > 0) {
            html += `<p style="color: #ffd700;">强化等级: +${this.enhanceLevel}</p>`;
        }
        if (this.refineLevel > 0) {
            html += `<p style="color: #ffd700;">精炼等级: ${'★'.repeat(this.refineLevel)}</p>`;
        }
        html += `<p>---</p>`;
        
        for (const [key, value] of Object.entries(this.stats)) {
            if (value !== 0) {
                html += formatEquipmentStatLine(key, value);
            }
        }

        if ((this.prefixes && this.prefixes.length) || (this.suffixes && this.suffixes.length)) {
            html += `<p>---</p>`;
            html += `<p style="color: #88ff88;"><strong>随机词缀</strong></p>`;
            const tierColors = (window.AFFIX_POOL && window.AFFIX_POOL.tierColors) || ['#ccc', '#4c4', '#48f', '#a4f', '#f80'];
            const renderAffix = (a, sym) => {
                const tc = tierColors[(a.tier || 1) - 1] || '#ccc';
                const val = a.isPercent ? `${a.value}%` : a.value;
                html += `<p style="color: ${tc}; font-size: 11px;">${sym} ${a.name} T${a.tier} (+${val})</p>`;
            };
            (this.prefixes || []).forEach(a => renderAffix(a, '◆'));
            (this.suffixes || []).forEach(a => renderAffix(a, '◇'));
        }

        if (this.legendaryPowers && this.legendaryPowers.length) {
            html += `<p>---</p>`;
            html += `<p style="color: #ff8800;"><strong>传奇威能</strong></p>`;
            for (const p of this.legendaryPowers) {
                html += `<p style="color: #ffaa44; font-size: 11px;">★ ${p.name}: ${p.description}</p>`;
            }
        }

        if (this.classAffinity) {
            const clsNames = { warrior: '战士', archer: '弓箭手', mage: '法师', assassin: '刺客' };
            html += `<p style="color: #88ccff; font-size: 11px;">职业亲和: ${clsNames[this.classAffinity] || this.classAffinity}</p>`;
        }
        
        // 显示武器技能
        if (this.skill) {
            html += `<p>---</p>`;
            html += `<p style="color: #ffaa00;"><strong>武器技能: ${this.skill.name}</strong></p>`;
            html += `<p style="color: #aaa; font-size: 11px;">${this.skill.description}</p>`;
            html += `<p style="color: #aaa; font-size: 11px;">冷却时间: ${this.skill.cooldown / 1000}秒</p>`;
            
            // 显示精炼效果（仅武器）
            if (this.slot === 'weapon' && this.refineEffects) {
                html += `<p>---</p>`;
                html += `<p style="color: #ffd700;"><strong>精炼效果:</strong></p>`;
                html += `<p style="color: #aaa; font-size: 10px; margin-bottom: 5px;">精炼需要1把同名且同等精炼等级的武器</p>`;
                
                for (let i = 0; i < this.refineEffects.length; i++) {
                    const refineEffect = this.refineEffects[i];
                    const refineLevel = i + 1;
                    const isCurrentLevel = this.refineLevel === refineLevel;
                    const isUnlocked = this.refineLevel >= refineLevel;
                    const color = isCurrentLevel ? '#ffd700' : (isUnlocked ? '#88ff88' : '#888888');
                    const starText = '★'.repeat(refineLevel);
                    
                    html += `<p style="color: ${color}; font-size: 10px; margin-left: 10px; margin-top: 3px;">${starText} 精炼${refineLevel}级: ${refineEffect.description}</p>`;
                }
            }
        }
        
        // 显示装备词条
        if (this.equipmentTraits && this.equipmentTraits.description) {
            html += `<p>---</p>`;
            html += `<p style="color: #88ff88;"><strong>装备词条:</strong></p>`;
            html += `<p style="color: #88ff88; font-size: 11px;">${this.equipmentTraits.description}</p>`;
        }
        
        if (this.setId && typeof SET_DEFINITIONS_V2 !== 'undefined' && SET_DEFINITIONS_V2 && SET_DEFINITIONS_V2.sets && SET_DEFINITIONS_V2.sets[this.setId]) {
            const setData = SET_DEFINITIONS_V2.sets[this.setId];
            html += `<p>---</p>`;
            html += `<p style="color: #ffaa00;"><strong>套装: ${setData.name}</strong></p>`;
            let pieceCount = 0;
            if (currentEquipment && typeof getSetV2PieceCount === 'function') {
                pieceCount = getSetV2PieceCount(currentEquipment, this.setId);
            }
            html += `<p style="color: #aaa; font-size: 11px;">已装备 ${pieceCount} 件</p>`;
            for (const [pc, effect] of Object.entries(setData.effects || {})) {
                const active = pieceCount >= parseInt(pc, 10);
                const color = active ? '#33ff33' : '#888888';
                html += `<p style="color: ${color}; font-size: 10px;">${pc}件: ${typeof stripSetDescriptionMarkdown === 'function' ? stripSetDescriptionMarkdown(effect.description) : effect.description}</p>`;
            }
        }
        
        return html;
    }
}

/**
 * 生成装备数据
 * @returns {Equipment[]} 所有装备的数组
 * 总共98种装备，包含不同等级和品质的组合
 * 装备定义数据从 config/equipment-config.json 中读取
 */
function generateEquipments() {
    return [];
}

