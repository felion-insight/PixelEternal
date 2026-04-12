/**
 * Pixel Eternal - 数据类模块
 * 包含 Equipment、Consumable 等类及其生成函数
 */

/** 装备机制类数值：不受强化/精炼倍率放大，按配置固定值参与汇总 */
const EQUIPMENT_MECHANIC_KEYS = new Set(['lifeSteal', 'thorn', 'skillHaste', 'damageReduction', 'towerGoldBonus']);

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
    chest: ['void_c_spike', 'void_c_dampen', 'void_c_echo', 'void_c_riposte', 'void_c_bulwark'],
    legs: ['void_l_surge', 'void_l_grit', 'void_l_ram', 'void_l_strike', 'void_l_overdrive'],
    boots: ['void_f_chase', 'void_f_rush', 'void_f_trace', 'void_f_flash', 'void_f_surge'],
    necklace: ['void_n_mend', 'void_n_skill', 'void_n_snare', 'void_n_arc', 'void_n_well'],
    ring: ['void_r_twin', 'void_r_sever', 'void_r_fervor', 'void_r_tempo', 'void_r_greed'],
    belt: ['void_g_tithe', 'void_g_hoard', 'void_g_covet', 'void_g_elite', 'void_g_fortune']
};

const DEEP_SUFFIX_LINE_ORDER = ['melee', 'ranged', 'helmet', 'chest', 'legs', 'boots', 'necklace', 'ring', 'belt'];

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
    if (quality === 'common') {
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
    if (quality === 'fine') {
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
    if (quality === 'common') {
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
    if (quality === 'fine') {
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
        this.quality = data.quality || 'common'; // 品质
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
        this.slot = data.slot; // weapon, helmet, chest, legs, boots, necklace, ring, belt
        this.weaponType = data.weaponType || 'melee'; // melee | ranged，仅武器有效
        this.quality = data.quality; // common, rare, fine, epic, legendary
        this.level = data.level || 1;
        this.enhanceLevel = data.enhanceLevel || 0; // 强化等级
        this.refineLevel = data.refineLevel || 0; // 精炼等级（0-5）
        this.baseStats = JSON.parse(JSON.stringify(data.stats || {})); // 基础属性（用于强化计算）
        this.stats = data.stats || {};
        // 根据部位设置默认词条
        if (this.slot === 'weapon') {
            this.stats.attack = this.stats.attack || 0;
            this.stats.critRate = this.stats.critRate || 0;
            this.stats.critDamage = this.stats.critDamage || 0;
        } else if (['helmet', 'chest', 'legs', 'boots'].includes(this.slot)) {
            this.stats.health = this.stats.health || 0;
            this.stats.defense = this.stats.defense || 0;
        } else if (['necklace', 'ring', 'belt'].includes(this.slot)) {
            this.stats.dodge = this.stats.dodge || 0;
            this.stats.attackSpeed = this.stats.attackSpeed || 0;
            this.stats.moveSpeed = this.stats.moveSpeed || 0;
        }
        
        // 保存基础属性
        if (!this.baseStats.attack) this.baseStats.attack = this.stats.attack || 0;
        if (!this.baseStats.critRate) this.baseStats.critRate = this.stats.critRate || 0;
        if (!this.baseStats.critDamage) this.baseStats.critDamage = this.stats.critDamage || 0;
        if (!this.baseStats.health) this.baseStats.health = this.stats.health || 0;
        if (!this.baseStats.defense) this.baseStats.defense = this.stats.defense || 0;
        if (!this.baseStats.dodge) this.baseStats.dodge = this.stats.dodge || 0;
        if (!this.baseStats.attackSpeed) this.baseStats.attackSpeed = this.stats.attackSpeed || 0;
        if (!this.baseStats.moveSpeed) this.baseStats.moveSpeed = this.stats.moveSpeed || 0;
        
        // 强化与精炼由 applyEnhancement / calculateEnhancedStats 统一计算（机制类数值不参与倍率）
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
        
        // 装备词条系统（合铸装备可传入自定义词条）
        if (data.equipmentTraits && typeof data.equipmentTraits === 'object') {
            this.equipmentTraits = data.equipmentTraits;
        } else {
            this.equipmentTraits = this.generateEquipmentTraits();
        }
        
        // 是否为打造的装备（通过配方打造的装备）
        this.isCrafted = data.isCrafted || false;
        // 合铸装备：同时计入多个套装的件数（用于激活两套套装效果）
        this.fusionSetIds = data.fusionSetIds || null;
        // 合铸原材料对稳定键（与两件原料的名称+词条 id 等相关），用于同一存档内复用相同贴图
        this.fusionPairKey = data.fusionPairKey || null;
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
    
    /**
     * 获取武器精炼效果配置（1-5级）
     * @returns {Array} 精炼效果数组，每个元素对应一级精炼效果
     */
    getWeaponRefineEffects() {
        if (this.slot !== 'weapon') return null;
        
        const refineEffectsConfig = {
            // 普通品质武器
            '斑驳铁剑': [
                { // 1级：伤害+10%
                    damageMultiplier: 0.1,
                    description: '伤害+10%'
                },
                { // 2级：伤害+20%，冷却-1秒
                    damageMultiplier: 0.2,
                    cooldownReduction: 1000,
                    description: '伤害+20%，冷却-1秒'
                },
                { // 3级：伤害+30%，冷却-2秒
                    damageMultiplier: 0.3,
                    cooldownReduction: 2000,
                    description: '伤害+30%，冷却-2秒'
                },
                { // 4级：伤害+40%，冷却-3秒，范围+20%
                    damageMultiplier: 0.4,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.2,
                    description: '伤害+40%，冷却-3秒，范围+20%'
                },
                { // 5级：伤害+50%，冷却-4秒，范围+30%，额外造成50%伤害
                    damageMultiplier: 0.5,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.3,
                    extraDamage: 0.5,
                    description: '伤害+50%，冷却-4秒，范围+30%，额外造成50%伤害'
                }
            ],
            '锋锐骑士长剑': [
                { // 1级：伤害+10%，暴击率+5%
                    damageMultiplier: 0.1,
                    critRateBonus: 5,
                    description: '伤害+10%，暴击率+5%'
                },
                { // 2级：伤害+20%，暴击率+10%，冷却-1秒
                    damageMultiplier: 0.2,
                    critRateBonus: 10,
                    cooldownReduction: 1000,
                    description: '伤害+20%，暴击率+10%，冷却-1秒'
                },
                { // 3级：伤害+30%，暴击率+15%，冷却-2秒，暴击伤害+20%
                    damageMultiplier: 0.3,
                    critRateBonus: 15,
                    critDamageBonus: 0.2,
                    cooldownReduction: 2000,
                    description: '伤害+30%，暴击率+15%，冷却-2秒，暴击伤害+20%'
                },
                { // 4级：伤害+40%，暴击率+20%，冷却-3秒，暴击伤害+30%，范围+20%
                    damageMultiplier: 0.4,
                    critRateBonus: 20,
                    critDamageBonus: 0.3,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.2,
                    description: '伤害+40%，暴击率+20%，冷却-3秒，暴击伤害+30%，范围+20%'
                },
                { // 5级：伤害+50%，暴击率+25%，冷却-4秒，暴击伤害+50%，范围+30%，必定暴击
                    damageMultiplier: 0.5,
                    critRateBonus: 25,
                    critDamageBonus: 0.5,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.3,
                    guaranteedCrit: true,
                    description: '伤害+50%，暴击率+25%，冷却-4秒，暴击伤害+50%，范围+30%，必定暴击'
                }
            ],
            
            // 稀有品质武器
            '淬火精钢剑': [
                { // 1级：伤害+10%，移速提升+5%
                    damageMultiplier: 0.1,
                    speedBoostBonus: 0.05,
                    description: '伤害+10%，移速提升+5%'
                },
                { // 2级：伤害+20%，移速提升+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    speedBoostBonus: 0.1,
                    buffDurationBonus: 1000,
                    description: '伤害+20%，移速提升+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，移速提升+15%，持续时间+2秒，冷却-1秒
                    damageMultiplier: 0.3,
                    speedBoostBonus: 0.15,
                    buffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    description: '伤害+30%，移速提升+15%，持续时间+2秒，冷却-1秒'
                },
                { // 4级：伤害+40%，移速提升+20%，持续时间+3秒，冷却-2秒，范围+20%，附加持续伤害
                    damageMultiplier: 0.4,
                    speedBoostBonus: 0.2,
                    buffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.2,
                    dotDamage: 0.05,
                    dotDuration: 3000,
                    description: '伤害+40%，移速提升+20%，持续时间+3秒，冷却-2秒，范围+20%，附加持续伤害'
                },
                { // 5级：伤害+50%，移速提升+30%，持续时间+4秒，冷却-3秒，范围+30%，持续伤害翻倍，技能后3秒内攻击附加火焰伤害
                    damageMultiplier: 0.5,
                    speedBoostBonus: 0.3,
                    buffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.3,
                    dotDamage: 0.1,
                    dotDuration: 3000,
                    postSkillFireDamage: 0.2,
                    postSkillFireDuration: 3000,
                    description: '伤害+50%，移速提升+30%，持续时间+4秒，冷却-3秒，范围+30%，持续伤害翻倍，技能后3秒内攻击附加20%火焰伤害'
                }
            ],
            '幽冥绝影刃': [
                { // 1级：伤害+10%，闪避率+5%
                    damageMultiplier: 0.1,
                    dodgeBoostBonus: 0.05,
                    description: '伤害+10%，闪避率+5%'
                },
                { // 2级：伤害+20%，闪避率+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    dodgeBoostBonus: 0.1,
                    buffDurationBonus: 1000,
                    description: '伤害+20%，闪避率+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，闪避率+15%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    dodgeBoostBonus: 0.15,
                    buffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，闪避率+15%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，闪避率+20%，持续时间+3秒，冷却-2秒，范围+30%，闪避后下次攻击必定暴击
                    damageMultiplier: 0.4,
                    dodgeBoostBonus: 0.2,
                    buffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    dodgeCritBonus: true,
                    description: '伤害+40%，闪避率+20%，持续时间+3秒，冷却-2秒，范围+30%，闪避后下次攻击必定暴击'
                },
                { // 5级：伤害+50%，闪避率+30%，持续时间+4秒，冷却-3秒，范围+40%，闪避后3秒内无敌，技能可穿透敌人
                    damageMultiplier: 0.5,
                    dodgeBoostBonus: 0.3,
                    buffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    dodgeCritBonus: true,
                    dodgeInvincibleDuration: 3000,
                    pierce: true,
                    description: '伤害+50%，闪避率+30%，持续时间+4秒，冷却-3秒，范围+40%，闪避后3秒内无敌，技能可穿透敌人'
                }
            ],
            '鸣霜青铜剑': [
                { // 1级：伤害+10%，减速效果+5%
                    damageMultiplier: 0.1,
                    slowEffectBonus: 0.05,
                    description: '伤害+10%，减速效果+5%'
                },
                { // 2级：伤害+20%，减速效果+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    slowEffectBonus: 0.1,
                    debuffDurationBonus: 1000,
                    description: '伤害+20%，减速效果+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，减速效果+15%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    slowEffectBonus: 0.15,
                    debuffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，减速效果+15%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，减速效果+20%，持续时间+3秒，冷却-2秒，范围+30%，减速叠加
                    damageMultiplier: 0.4,
                    slowEffectBonus: 0.2,
                    debuffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    slowStackable: true,
                    description: '伤害+40%，减速效果+20%，持续时间+3秒，冷却-2秒，范围+30%，减速叠加'
                },
                { // 5级：伤害+50%，减速效果+30%，持续时间+4秒，冷却-3秒，范围+40%，减速叠加，减速达到50%时冰冻敌人
                    damageMultiplier: 0.5,
                    slowEffectBonus: 0.3,
                    debuffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    slowStackable: true,
                    slowToFreeze: 0.5,
                    freezeDuration: 2000,
                    description: '伤害+50%，减速效果+30%，持续时间+4秒，冷却-3秒，范围+40%，减速叠加，减速达到50%时冰冻敌人2秒'
                }
            ],
            
            // 精良品质武器
            '辉光秘银刃': [
                { // 1级：伤害+10%，暴击伤害+10%
                    damageMultiplier: 0.1,
                    critDamageBonus: 0.1,
                    description: '伤害+10%，暴击伤害+10%'
                },
                { // 2级：伤害+20%，暴击伤害+20%，冷却-1秒
                    damageMultiplier: 0.2,
                    critDamageBonus: 0.2,
                    cooldownReduction: 1000,
                    description: '伤害+20%，暴击伤害+20%，冷却-1秒'
                },
                { // 3级：伤害+30%，暴击伤害+30%，冷却-2秒，范围+20%，暴击时触发连锁闪电
                    damageMultiplier: 0.3,
                    critDamageBonus: 0.3,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.2,
                    chainLightning: true,
                    chainDamage: 0.5,
                    chainRange: CONFIG.PLAYER_ATTACK_RANGE * 1.5,
                    description: '伤害+30%，暴击伤害+30%，冷却-2秒，范围+20%，暴击时触发连锁闪电'
                },
                { // 4级：伤害+40%，暴击伤害+40%，冷却-3秒，范围+30%，连锁闪电伤害+50%，可连锁2次
                    damageMultiplier: 0.4,
                    critDamageBonus: 0.4,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.3,
                    chainLightning: true,
                    chainDamage: 0.75,
                    chainRange: CONFIG.PLAYER_ATTACK_RANGE * 1.5,
                    chainCount: 2,
                    description: '伤害+40%，暴击伤害+40%，冷却-3秒，范围+30%，连锁闪电伤害+75%，可连锁2次'
                },
                { // 5级：伤害+50%，暴击伤害+50%，冷却-4秒，范围+40%，连锁闪电伤害+100%，可连锁3次，暴击必定触发
                    damageMultiplier: 0.5,
                    critDamageBonus: 0.5,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.4,
                    chainLightning: true,
                    chainDamage: 1.0,
                    chainRange: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                    chainCount: 3,
                    guaranteedChain: true,
                    description: '伤害+50%，暴击伤害+50%，冷却-4秒，范围+40%，连锁闪电伤害+100%，可连锁3次，暴击必定触发'
                }
            ],
            '逐月银芒剑': [
                { // 1级：伤害+10%，攻击速度+5%
                    damageMultiplier: 0.1,
                    attackSpeedBoostBonus: 0.05,
                    description: '伤害+10%，攻击速度+5%'
                },
                { // 2级：伤害+20%，攻击速度+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    attackSpeedBoostBonus: 0.1,
                    buffDurationBonus: 1000,
                    description: '伤害+20%，攻击速度+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，攻击速度+15%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    attackSpeedBoostBonus: 0.15,
                    buffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，攻击速度+15%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，攻击速度+20%，持续时间+3秒，冷却-2秒，范围+30%，攻击速度提升时移动速度也提升
                    damageMultiplier: 0.4,
                    attackSpeedBoostBonus: 0.2,
                    buffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    attackSpeedAlsoBoostsMoveSpeed: true,
                    description: '伤害+40%，攻击速度+20%，持续时间+3秒，冷却-2秒，范围+30%，攻击速度提升时移动速度也提升'
                },
                { // 5级：伤害+50%，攻击速度+30%，持续时间+4秒，冷却-3秒，范围+40%，攻击速度提升时移动速度也提升，技能命中敌人后重置普通攻击冷却
                    damageMultiplier: 0.5,
                    attackSpeedBoostBonus: 0.3,
                    buffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    attackSpeedAlsoBoostsMoveSpeed: true,
                    resetAttackCooldown: true,
                    description: '伤害+50%，攻击速度+30%，持续时间+4秒，冷却-3秒，范围+40%，攻击速度提升时移动速度也提升，技能命中敌人后重置普通攻击冷却'
                }
            ],
            '晶曜寒锋': [
                { // 1级：伤害+10%，冰冻持续时间+0.5秒
                    damageMultiplier: 0.1,
                    freezeDurationBonus: 500,
                    description: '伤害+10%，冰冻持续时间+0.5秒'
                },
                { // 2级：伤害+20%，冰冻持续时间+1秒，冷却-1秒
                    damageMultiplier: 0.2,
                    freezeDurationBonus: 1000,
                    cooldownReduction: 1000,
                    description: '伤害+20%，冰冻持续时间+1秒，冷却-1秒'
                },
                { // 3级：伤害+30%，冰冻持续时间+1.5秒，冷却-2秒，范围+20%，冰冻时造成额外伤害
                    damageMultiplier: 0.3,
                    freezeDurationBonus: 1500,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.2,
                    freezeExtraDamage: 0.3,
                    description: '伤害+30%，冰冻持续时间+1.5秒，冷却-2秒，范围+20%，冰冻时造成额外30%伤害'
                },
                { // 4级：伤害+40%，冰冻持续时间+2秒，冷却-3秒，范围+30%，冰冻时造成额外50%伤害，冰冻可扩散
                    damageMultiplier: 0.4,
                    freezeDurationBonus: 2000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.3,
                    freezeExtraDamage: 0.5,
                    freezeSpread: true,
                    freezeSpreadRange: CONFIG.PLAYER_ATTACK_RANGE * 1.5,
                    description: '伤害+40%，冰冻持续时间+2秒，冷却-3秒，范围+30%，冰冻时造成额外50%伤害，冰冻可扩散'
                },
                { // 5级：伤害+50%，冰冻持续时间+3秒，冷却-4秒，范围+40%，冰冻时造成额外100%伤害，冰冻可扩散，冰冻敌人死亡时爆炸造成范围伤害
                    damageMultiplier: 0.5,
                    freezeDurationBonus: 3000,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.4,
                    freezeExtraDamage: 1.0,
                    freezeSpread: true,
                    freezeSpreadRange: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                    freezeExplosion: true,
                    freezeExplosionDamage: 0.5,
                    freezeExplosionRange: CONFIG.PLAYER_ATTACK_RANGE * 1.5,
                    description: '伤害+50%，冰冻持续时间+3秒，冷却-4秒，范围+40%，冰冻时造成额外100%伤害，冰冻可扩散，冰冻敌人死亡时爆炸造成50%范围伤害'
                }
            ],
            
            // 史诗品质武器
            '逆鳞屠龙锋': [
                { // 1级：伤害+10%，持续伤害+2%
                    damageMultiplier: 0.1,
                    dotDamageBonus: 0.02,
                    description: '伤害+10%，持续伤害+2%'
                },
                { // 2级：伤害+20%，持续伤害+4%，持续时间+1秒
                    damageMultiplier: 0.2,
                    dotDamageBonus: 0.04,
                    dotDurationBonus: 1000,
                    description: '伤害+20%，持续伤害+4%，持续时间+1秒'
                },
                { // 3级：伤害+30%，持续伤害+6%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    dotDamageBonus: 0.06,
                    dotDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，持续伤害+6%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，持续伤害+8%，持续时间+3秒，冷却-2秒，范围+30%，持续伤害可叠加
                    damageMultiplier: 0.4,
                    dotDamageBonus: 0.08,
                    dotDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    dotStackable: true,
                    description: '伤害+40%，持续伤害+8%，持续时间+3秒，冷却-2秒，范围+30%，持续伤害可叠加'
                },
                { // 5级：伤害+50%，持续伤害+10%，持续时间+4秒，冷却-3秒，范围+40%，持续伤害可叠加，持续伤害达到5层时触发爆炸
                    damageMultiplier: 0.5,
                    dotDamageBonus: 0.1,
                    dotDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    dotStackable: true,
                    dotExplosionThreshold: 5,
                    dotExplosionDamage: 2.0,
                    dotExplosionRange: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                    description: '伤害+50%，持续伤害+10%，持续时间+4秒，冷却-3秒，范围+40%，持续伤害可叠加，持续伤害达到5层时触发200%爆炸伤害'
                }
            ],
            '劫火焚伤': [
                { // 1级：伤害+10%，攻击力提升+5%
                    damageMultiplier: 0.1,
                    attackBoostBonus: 0.05,
                    description: '伤害+10%，攻击力提升+5%'
                },
                { // 2级：伤害+20%，攻击力提升+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    attackBoostBonus: 0.1,
                    buffDurationBonus: 1000,
                    description: '伤害+20%，攻击力提升+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，攻击力提升+15%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    attackBoostBonus: 0.15,
                    buffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，攻击力提升+15%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，攻击力提升+20%，持续时间+3秒，冷却-2秒，范围+30%，攻击力提升时暴击率也提升
                    damageMultiplier: 0.4,
                    attackBoostBonus: 0.2,
                    buffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    attackBoostAlsoBoostsCrit: true,
                    critRateFromAttackBoost: 0.15,
                    description: '伤害+40%，攻击力提升+20%，持续时间+3秒，冷却-2秒，范围+30%，攻击力提升时暴击率也提升15%'
                },
                { // 5级：伤害+50%，攻击力提升+30%，持续时间+4秒，冷却-3秒，范围+40%，攻击力提升时暴击率也提升，技能命中敌人后刷新攻击力提升持续时间
                    damageMultiplier: 0.5,
                    attackBoostBonus: 0.3,
                    buffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    attackBoostAlsoBoostsCrit: true,
                    critRateFromAttackBoost: 0.25,
                    refreshAttackBoostOnHit: true,
                    description: '伤害+50%，攻击力提升+30%，持续时间+4秒，冷却-3秒，范围+40%，攻击力提升时暴击率也提升25%，技能命中敌人后刷新攻击力提升持续时间'
                }
            ],
            '凛冬之拥': [
                { // 1级：伤害+10%，敌人攻击速度降低+5%
                    damageMultiplier: 0.1,
                    enemySlowEffectBonus: 0.05,
                    description: '伤害+10%，敌人攻击速度降低+5%'
                },
                { // 2级：伤害+20%，敌人攻击速度降低+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    enemySlowEffectBonus: 0.1,
                    debuffDurationBonus: 1000,
                    description: '伤害+20%，敌人攻击速度降低+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，敌人攻击速度降低+15%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    enemySlowEffectBonus: 0.15,
                    debuffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，敌人攻击速度降低+15%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，敌人攻击速度降低+20%，持续时间+3秒，冷却-2秒，范围+30%，减速可叠加，减速敌人时提升自身防御
                    damageMultiplier: 0.4,
                    enemySlowEffectBonus: 0.2,
                    debuffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    enemySlowStackable: true,
                    defenseBoostFromSlow: 0.1,
                    description: '伤害+40%，敌人攻击速度降低+20%，持续时间+3秒，冷却-2秒，范围+30%，减速可叠加，减速敌人时提升自身10%防御'
                },
                { // 5级：伤害+50%，敌人攻击速度降低+30%，持续时间+4秒，冷却-3秒，范围+40%，减速可叠加，减速敌人时提升自身防御，减速达到50%时冰冻敌人
                    damageMultiplier: 0.5,
                    enemySlowEffectBonus: 0.3,
                    debuffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    enemySlowStackable: true,
                    defenseBoostFromSlow: 0.2,
                    slowToFreeze: 0.5,
                    freezeDuration: 2000,
                    description: '伤害+50%，敌人攻击速度降低+30%，持续时间+4秒，冷却-3秒，范围+40%，减速可叠加，减速敌人时提升自身20%防御，减速达到50%时冰冻敌人2秒'
                }
            ],
            
            // 传说品质武器
            '圣耀·断罪': [
                { // 1级：伤害+10%，冷却-1秒
                    damageMultiplier: 0.1,
                    cooldownReduction: 1000,
                    description: '伤害+10%，冷却-1秒'
                },
                { // 2级：伤害+20%，冷却-2秒，范围+10%
                    damageMultiplier: 0.2,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.1,
                    description: '伤害+20%，冷却-2秒，范围+10%'
                },
                { // 3级：伤害+30%，冷却-3秒，范围+20%，暴击伤害+50%
                    damageMultiplier: 0.3,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.2,
                    critDamageBonus: 0.5,
                    description: '伤害+30%，冷却-3秒，范围+20%，暴击伤害+50%'
                },
                { // 4级：伤害+40%，冷却-4秒，范围+30%，暴击伤害+100%，技能命中敌人后减少所有技能冷却时间
                    damageMultiplier: 0.4,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.3,
                    critDamageBonus: 1.0,
                    reduceAllCooldownsOnHit: 2000,
                    description: '伤害+40%，冷却-4秒，范围+30%，暴击伤害+100%，技能命中敌人后减少所有技能冷却时间2秒'
                },
                { // 5级：伤害+50%，冷却-5秒，范围+40%，暴击伤害+150%，技能命中敌人后减少所有技能冷却时间，击杀敌人后重置技能冷却
                    damageMultiplier: 0.5,
                    cooldownReduction: 5000,
                    rangeMultiplier: 0.4,
                    critDamageBonus: 1.5,
                    reduceAllCooldownsOnHit: 3000,
                    resetCooldownOnKill: true,
                    description: '伤害+50%，冷却-5秒，范围+40%，暴击伤害+150%，技能命中敌人后减少所有技能冷却时间3秒，击杀敌人后重置技能冷却'
                }
            ],
            '惊雷破晓': [
                { // 1级：伤害+10%，全属性提升+3%
                    damageMultiplier: 0.1,
                    allStatsBoostBonus: 0.03,
                    description: '伤害+10%，全属性提升+3%'
                },
                { // 2级：伤害+20%，全属性提升+6%，持续时间+1秒
                    damageMultiplier: 0.2,
                    allStatsBoostBonus: 0.06,
                    buffDurationBonus: 1000,
                    description: '伤害+20%，全属性提升+6%，持续时间+1秒'
                },
                { // 3级：伤害+30%，全属性提升+9%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    allStatsBoostBonus: 0.09,
                    buffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，全属性提升+9%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，全属性提升+12%，持续时间+3秒，冷却-2秒，范围+30%，全属性提升时免疫控制效果
                    damageMultiplier: 0.4,
                    allStatsBoostBonus: 0.12,
                    buffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    immuneToCC: true,
                    description: '伤害+40%，全属性提升+12%，持续时间+3秒，冷却-2秒，范围+30%，全属性提升时免疫控制效果'
                },
                { // 5级：伤害+50%，全属性提升+15%，持续时间+4秒，冷却-3秒，范围+40%，全属性提升时免疫控制效果，技能命中敌人后触发连锁闪电
                    damageMultiplier: 0.5,
                    allStatsBoostBonus: 0.15,
                    buffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    immuneToCC: true,
                    chainLightning: true,
                    chainDamage: 0.8,
                    chainRange: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                    chainCount: 3,
                    description: '伤害+50%，全属性提升+15%，持续时间+4秒，冷却-3秒，范围+40%，全属性提升时免疫控制效果，技能命中敌人后触发连锁闪电（80%伤害，3次）'
                }
            ],
            '坠星裁决': [
                { // 1级：伤害+10%，生命恢复+5%
                    damageMultiplier: 0.1,
                    healPercentBonus: 0.05,
                    description: '伤害+10%，生命恢复+5%'
                },
                { // 2级：伤害+20%，生命恢复+10%，冷却-1秒
                    damageMultiplier: 0.2,
                    healPercentBonus: 0.1,
                    cooldownReduction: 1000,
                    description: '伤害+20%，生命恢复+10%，冷却-1秒'
                },
                { // 3级：伤害+30%，生命恢复+15%，冷却-2秒，范围+20%，恢复生命时提升攻击力
                    damageMultiplier: 0.3,
                    healPercentBonus: 0.15,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.2,
                    healBoostsAttack: true,
                    healAttackBoost: 0.1,
                    healAttackBoostDuration: 5000,
                    description: '伤害+30%，生命恢复+15%，冷却-2秒，范围+20%，恢复生命时提升10%攻击力5秒'
                },
                { // 4级：伤害+40%，生命恢复+20%，冷却-3秒，范围+30%，恢复生命时提升攻击力，技能命中敌人后恢复生命
                    damageMultiplier: 0.4,
                    healPercentBonus: 0.2,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.3,
                    healBoostsAttack: true,
                    healAttackBoost: 0.15,
                    healAttackBoostDuration: 5000,
                    healOnHit: 0.05,
                    description: '伤害+40%，生命恢复+20%，冷却-3秒，范围+30%，恢复生命时提升15%攻击力5秒，技能命中敌人后恢复5%最大生命值'
                },
                { // 5级：伤害+50%，生命恢复+25%，冷却-4秒，范围+40%，恢复生命时提升攻击力，技能命中敌人后恢复生命，生命值低于50%时技能伤害翻倍
                    damageMultiplier: 0.5,
                    healPercentBonus: 0.25,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.4,
                    healBoostsAttack: true,
                    healAttackBoost: 0.2,
                    healAttackBoostDuration: 5000,
                    healOnHit: 0.1,
                    lowHpDamageBonus: true,
                    lowHpThreshold: 0.5,
                    lowHpDamageMultiplier: 2.0,
                    description: '伤害+50%，生命恢复+25%，冷却-4秒，范围+40%，恢复生命时提升20%攻击力5秒，技能命中敌人后恢复10%最大生命值，生命值低于50%时技能伤害翻倍'
                }
            ],
            
            // 打造武器精炼效果
            '精钢长剑': [
                { // 1级：伤害+10%，攻击力提升+3%
                    damageMultiplier: 0.1,
                    attackBoostBonus: 0.03,
                    description: '伤害+10%，攻击力提升+3%'
                },
                { // 2级：伤害+20%，攻击力提升+6%，持续时间+1秒
                    damageMultiplier: 0.2,
                    attackBoostBonus: 0.06,
                    buffDurationBonus: 1000,
                    description: '伤害+20%，攻击力提升+6%，持续时间+1秒'
                },
                { // 3级：伤害+30%，攻击力提升+9%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    attackBoostBonus: 0.09,
                    buffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，攻击力提升+9%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，攻击力提升+12%，持续时间+3秒，冷却-2秒，范围+30%，攻击力提升可叠加2层
                    damageMultiplier: 0.4,
                    attackBoostBonus: 0.12,
                    buffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    attackBoostStackable: true,
                    attackBoostMaxStacks: 2,
                    description: '伤害+40%，攻击力提升+12%，持续时间+3秒，冷却-2秒，范围+30%，攻击力提升可叠加2层'
                },
                { // 5级：伤害+50%，攻击力提升+15%，持续时间+4秒，冷却-3秒，范围+40%，攻击力提升可叠加2层，技能命中敌人后额外提升攻击力
                    damageMultiplier: 0.5,
                    attackBoostBonus: 0.15,
                    buffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    attackBoostStackable: true,
                    attackBoostMaxStacks: 2,
                    attackBoostOnHit: 0.1,
                    description: '伤害+50%，攻击力提升+15%，持续时间+4秒，冷却-3秒，范围+40%，攻击力提升可叠加2层，技能命中敌人后额外提升10%攻击力'
                }
            ],
            '魔法水晶剑': [
                { // 1级：伤害+10%，范围伤害+5%
                    damageMultiplier: 0.1,
                    aoeDamageBonus: 0.05,
                    description: '伤害+10%，范围伤害+5%'
                },
                { // 2级：伤害+20%，范围伤害+10%，冷却-1秒
                    damageMultiplier: 0.2,
                    aoeDamageBonus: 0.1,
                    cooldownReduction: 1000,
                    description: '伤害+20%，范围伤害+10%，冷却-1秒'
                },
                { // 3级：伤害+30%，范围伤害+15%，冷却-2秒，范围+20%，魔法爆炸范围扩大
                    damageMultiplier: 0.3,
                    aoeDamageBonus: 0.15,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.2,
                    aoeRangeBonus: 0.2,
                    description: '伤害+30%，范围伤害+15%，冷却-2秒，范围+20%，魔法爆炸范围扩大20%'
                },
                { // 4级：伤害+40%，范围伤害+20%，冷却-3秒，范围+30%，魔法爆炸范围扩大，爆炸命中敌人后触发二次爆炸
                    damageMultiplier: 0.4,
                    aoeDamageBonus: 0.2,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.3,
                    aoeRangeBonus: 0.3,
                    chainExplosion: true,
                    chainExplosionDamage: 0.5,
                    description: '伤害+40%，范围伤害+20%，冷却-3秒，范围+30%，魔法爆炸范围扩大，爆炸命中敌人后触发二次爆炸（50%伤害）'
                },
                { // 5级：伤害+50%，范围伤害+25%，冷却-4秒，范围+40%，魔法爆炸范围扩大，爆炸命中敌人后触发二次爆炸，技能必定触发魔法爆炸词条效果
                    damageMultiplier: 0.5,
                    aoeDamageBonus: 0.25,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.4,
                    aoeRangeBonus: 0.4,
                    chainExplosion: true,
                    chainExplosionDamage: 0.75,
                    guaranteedCrystalMagic: true,
                    description: '伤害+50%，范围伤害+25%，冷却-4秒，范围+40%，魔法爆炸范围扩大，爆炸命中敌人后触发二次爆炸（75%伤害），技能必定触发魔法爆炸词条效果'
                }
            ],
            '远古龙刃': [
                { // 1级：伤害+10%，持续伤害+3%
                    damageMultiplier: 0.1,
                    dotDamageBonus: 0.03,
                    description: '伤害+10%，持续伤害+3%'
                },
                { // 2级：伤害+20%，持续伤害+6%，持续时间+1秒
                    damageMultiplier: 0.2,
                    dotDamageBonus: 0.06,
                    dotDurationBonus: 1000,
                    description: '伤害+20%，持续伤害+6%，持续时间+1秒'
                },
                { // 3级：伤害+30%，持续伤害+9%，持续时间+2秒，冷却-1秒，扇形角度+20%
                    damageMultiplier: 0.3,
                    dotDamageBonus: 0.09,
                    dotDurationBonus: 2000,
                    cooldownReduction: 1000,
                    coneAngleBonus: 0.2,
                    description: '伤害+30%，持续伤害+9%，持续时间+2秒，冷却-1秒，扇形角度+20%'
                },
                { // 4级：伤害+40%，持续伤害+12%，持续时间+3秒，冷却-2秒，扇形角度+30%，龙息可穿透敌人
                    damageMultiplier: 0.4,
                    dotDamageBonus: 0.12,
                    dotDurationBonus: 3000,
                    cooldownReduction: 2000,
                    coneAngleBonus: 0.3,
                    pierce: true,
                    description: '伤害+40%，持续伤害+12%，持续时间+3秒，冷却-2秒，扇形角度+30%，龙息可穿透敌人'
                },
                { // 5级：伤害+50%，持续伤害+15%，持续时间+4秒，冷却-3秒，扇形角度+40%，龙息可穿透敌人，技能必定触发龙息词条效果
                    damageMultiplier: 0.5,
                    dotDamageBonus: 0.15,
                    dotDurationBonus: 4000,
                    cooldownReduction: 3000,
                    coneAngleBonus: 0.4,
                    pierce: true,
                    guaranteedDragonBreath: true,
                    description: '伤害+50%，持续伤害+15%，持续时间+4秒，冷却-3秒，扇形角度+40%，龙息可穿透敌人，技能必定触发龙息词条效果'
                }
            ],
            '混沌之刃': [
                { // 1级：伤害+10%，敌人属性降低+5%
                    damageMultiplier: 0.1,
                    enemyDebuffBonus: 0.05,
                    description: '伤害+10%，敌人属性降低+5%'
                },
                { // 2级：伤害+20%，敌人属性降低+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    enemyDebuffBonus: 0.1,
                    debuffDurationBonus: 1000,
                    description: '伤害+20%，敌人属性降低+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，敌人属性降低+15%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    enemyDebuffBonus: 0.15,
                    debuffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，敌人属性降低+15%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，敌人属性降低+20%，持续时间+3秒，冷却-2秒，范围+30%，debuff可叠加
                    damageMultiplier: 0.4,
                    enemyDebuffBonus: 0.2,
                    debuffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    debuffStackable: true,
                    description: '伤害+40%，敌人属性降低+20%，持续时间+3秒，冷却-2秒，范围+30%，debuff可叠加'
                },
                { // 5级：伤害+50%，敌人属性降低+25%，持续时间+4秒，冷却-3秒，范围+40%，debuff可叠加，技能必定触发混沌词条效果，debuff达到3层时造成额外伤害
                    damageMultiplier: 0.5,
                    enemyDebuffBonus: 0.25,
                    debuffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    debuffStackable: true,
                    guaranteedChaosBlade: true,
                    debuffExplosionThreshold: 3,
                    debuffExplosionDamage: 1.5,
                    description: '伤害+50%，敌人属性降低+25%，持续时间+4秒，冷却-3秒，范围+40%，debuff可叠加，技能必定触发混沌词条效果，debuff达到3层时造成150%额外伤害'
                }
            ],
            // 远程武器精炼效果（1–5级：伤害/射程/冷却）
            '猎风短弓': [ { damageMultiplier: 0.1, description: '伤害+10%' }, { damageMultiplier: 0.2, rangeMultiplier: 0.05, description: '伤害+20%，射程+5%' }, { damageMultiplier: 0.3, rangeMultiplier: 0.1, cooldownReduction: 500, description: '伤害+30%，射程+10%，冷却-0.5秒' }, { damageMultiplier: 0.4, rangeMultiplier: 0.15, cooldownReduction: 1000, description: '伤害+40%，射程+15%，冷却-1秒' }, { damageMultiplier: 0.5, rangeMultiplier: 0.2, cooldownReduction: 1500, description: '伤害+50%，射程+20%，冷却-1.5秒' } ],
            '幽影弩': [ { damageMultiplier: 0.1, description: '伤害+10%' }, { damageMultiplier: 0.2, rangeMultiplier: 0.05, description: '伤害+20%，射程+5%' }, { damageMultiplier: 0.3, rangeMultiplier: 0.1, cooldownReduction: 500, description: '伤害+30%，射程+10%，冷却-0.5秒' }, { damageMultiplier: 0.4, rangeMultiplier: 0.15, cooldownReduction: 1000, description: '伤害+40%，射程+15%，冷却-1秒' }, { damageMultiplier: 0.5, rangeMultiplier: 0.2, cooldownReduction: 1500, description: '伤害+50%，射程+20%，冷却-1.5秒' } ],
            '曦光长弓': [ { damageMultiplier: 0.1, description: '伤害+10%' }, { damageMultiplier: 0.2, rangeMultiplier: 0.05, description: '伤害+20%，射程+5%' }, { damageMultiplier: 0.3, rangeMultiplier: 0.1, cooldownReduction: 500, description: '伤害+30%，射程+10%，冷却-0.5秒' }, { damageMultiplier: 0.4, rangeMultiplier: 0.15, cooldownReduction: 1000, description: '伤害+40%，射程+15%，冷却-1秒' }, { damageMultiplier: 0.5, rangeMultiplier: 0.2, cooldownReduction: 1500, description: '伤害+50%，射程+20%，冷却-1.5秒' } ],
            '穿云破月': [ { damageMultiplier: 0.1, description: '伤害+10%' }, { damageMultiplier: 0.2, rangeMultiplier: 0.05, description: '伤害+20%，射程+5%' }, { damageMultiplier: 0.3, rangeMultiplier: 0.1, cooldownReduction: 500, description: '伤害+30%，射程+10%，冷却-0.5秒' }, { damageMultiplier: 0.4, rangeMultiplier: 0.15, cooldownReduction: 1000, description: '伤害+40%，射程+15%，冷却-1秒' }, { damageMultiplier: 0.5, rangeMultiplier: 0.2, cooldownReduction: 1500, description: '伤害+50%，射程+20%，冷却-1.5秒' } ],
            '永夜·星坠': [ { damageMultiplier: 0.1, description: '伤害+10%' }, { damageMultiplier: 0.2, rangeMultiplier: 0.05, description: '伤害+20%，射程+5%' }, { damageMultiplier: 0.3, rangeMultiplier: 0.1, cooldownReduction: 500, description: '伤害+30%，射程+10%，冷却-0.5秒' }, { damageMultiplier: 0.4, rangeMultiplier: 0.15, cooldownReduction: 1000, description: '伤害+40%，射程+15%，冷却-1秒' }, { damageMultiplier: 0.5, rangeMultiplier: 0.2, cooldownReduction: 1500, description: '伤害+50%，射程+20%，冷却-1.5秒' } ]
        };
        
        const byName = refineEffectsConfig[this.name];
        if (byName) return byName;
        if (this.name && resolveDeepEquipmentTrait(this.name)) {
            return getDeepWeaponRefineEffectsList(this.weaponType, this.quality, parseDeepWeaponThemeTierFromName(this.name));
        }
        return null;
    }
    
    /**
     * 根据武器名称和品质获取技能定义
     * @returns {Object|null} 技能对象，包含名称、冷却时间、效果等
     */
    getWeaponSkill() {
        // 根据武器名称匹配特定技能
        const weaponSkills = {
            // 普通品质武器技能
            '斑驳铁剑': {
                name: '崩山击',
                cooldown: 8000, // 8秒冷却
                description: '对锁定目标造成150%攻击力伤害（准星方向优先）',
                damageMultiplier: 1.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.0,
                castMode: 'target_lock',
                showLockMarker: true
            },
            '锋锐骑士长剑': {
                name: '银芒贯刺',
                cooldown: 8000,
                description: '对锁定目标造成160%攻击力伤害，小幅提升暴击率',
                damageMultiplier: 1.6,
                critBonus: 0.2,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.1,
                castMode: 'target_lock',
                showLockMarker: true
            },
            
            // 稀有品质武器技能
            '淬火精钢剑': {
                name: '赤炎斩',
                cooldown: 9000, // 9秒冷却
                description: '对锁定目标造成180%攻击力伤害，并提升移动速度',
                damageMultiplier: 1.8,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.1,
                speedBoost: 0.2, // 提升20%移动速度
                speedBoostDuration: 3000, // 持续3秒
                castMode: 'target_lock',
                showLockMarker: true
            },
            '幽冥绝影刃': {
                name: '幽冥闪袭',
                cooldown: 9000,
                description: '对锁定目标造成175%攻击力伤害，提升闪避率',
                damageMultiplier: 1.75,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.2,
                dodgeBoost: 0.15, // 提升15%闪避率
                dodgeBoostDuration: 3000,
                castMode: 'target_lock',
                showLockMarker: true
            },
            '鸣霜青铜剑': {
                name: '凛冬刺',
                cooldown: 9000,
                description: '对锁定目标造成180%攻击力伤害，并降低目标移动速度',
                damageMultiplier: 1.8,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.1,
                slowEffect: 0.3, // 降低30%移动速度
                slowDuration: 2000, // 持续2秒
                castMode: 'target_lock',
                showLockMarker: true
            },
            
            // 精良品质武器技能
            '辉光秘银刃': {
                name: '鸣雷裁决',
                cooldown: 10000, // 10秒冷却
                description: '对锁定目标造成200%攻击力伤害，并额外造成50%暴击伤害',
                damageMultiplier: 2.0,
                critBonus: 0.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.2,
                castMode: 'target_lock',
                showLockMarker: true
            },
            '逐月银芒剑': {
                name: '银月弧光',
                cooldown: 10000,
                description: '对周围敌人造成180%攻击力伤害，提升攻击速度',
                damageMultiplier: 1.8,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.5,
                attackSpeedBoost: 0.25, // 提升25%攻击速度
                attackSpeedBoostDuration: 4000,
                castMode: 'radial'
            },
            '晶曜寒锋': {
                name: '霜华碎灭',
                cooldown: 10000,
                description: '对锁定目标造成195%攻击力伤害，并附加冰冻效果',
                damageMultiplier: 1.95,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.2,
                freezeEffect: true,
                freezeDuration: 1500, // 冰冻1.5秒
                castMode: 'target_lock',
                showLockMarker: true
            },
            
            // 史诗品质武器技能
            '逆鳞屠龙锋': {
                name: '龙炎漩涡',
                cooldown: 12000, // 12秒冷却
                description: '对周围所有敌人造成250%攻击力伤害，并附加持续伤害',
                damageMultiplier: 2.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                dotDamage: 0.1, // 持续伤害：每秒10%攻击力
                dotDuration: 3000, // 持续3秒
                castMode: 'radial'
            },
            '劫火焚伤': {
                name: '烬灭天火',
                cooldown: 12000,
                description: '对准星方向落点范围造成240%攻击力伤害，并提升自身攻击力',
                damageMultiplier: 2.4,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                attackBoost: 0.2, // 提升20%攻击力
                attackBoostDuration: 5000,
                castMode: 'ground_aoe',
                groundCastRange: CONFIG.PLAYER_ATTACK_RANGE * 1.95,
                groundAoERadius: CONFIG.PLAYER_ATTACK_RANGE * 1.15
            },
            '凛冬之拥': {
                name: '永冻新星',
                cooldown: 12000,
                description: '对周围所有敌人造成245%攻击力伤害，并降低敌人攻击速度',
                damageMultiplier: 2.45,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                enemySlowEffect: 0.4, // 降低敌人40%攻击速度
                slowDuration: 4000,
                castMode: 'radial'
            },
            
            // 传说品质武器技能
            '圣耀·断罪': {
                name: '神裁',
                cooldown: 15000, // 15秒冷却
                description: '对周围所有敌人造成300%攻击力伤害，必定暴击',
                damageMultiplier: 3.0,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.5,
                guaranteedCrit: true,
                castMode: 'radial'
            },
            '惊雷破晓': {
                name: '万钧雷狱',
                cooldown: 15000,
                description: '对准星方向落点范围造成280%攻击力伤害，并提升自身所有属性',
                damageMultiplier: 2.8,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.5,
                allStatsBoost: 0.15, // 提升15%所有属性
                allStatsBoostDuration: 6000,
                castMode: 'ground_aoe',
                groundCastRange: CONFIG.PLAYER_ATTACK_RANGE * 2.4,
                groundAoERadius: CONFIG.PLAYER_ATTACK_RANGE * 1.35
            },
            '坠星裁决': {
                name: '星坠审判',
                cooldown: 15000,
                description: '对周围所有敌人造成290%攻击力伤害，并恢复生命值',
                damageMultiplier: 2.9,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.5,
                healPercent: 0.2, // 恢复20%最大生命值
                castMode: 'radial'
            },
            
            // 打造武器技能
            '精钢长剑': {
                name: '钢魂崩击',
                cooldown: 8500,
                description: '对锁定目标造成180%攻击力伤害，并提升15%攻击力，持续5秒',
                damageMultiplier: 1.8,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.1,
                attackBoost: 0.15,
                attackBoostDuration: 5000,
                castMode: 'target_lock',
                showLockMarker: true
            },
            '魔法水晶剑': {
                name: '魔晶绽裂',
                cooldown: 10000,
                description: '对准星方向落点范围内造成200%攻击力伤害，并附加魔晶爆发',
                damageMultiplier: 2.0,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.5,
                aoeDamage: 0.8,
                castMode: 'ground_aoe',
                groundCastRange: CONFIG.PLAYER_ATTACK_RANGE * 1.62,
                groundAoERadius: CONFIG.PLAYER_ATTACK_RANGE * 0.98
            },
            '远古龙刃': {
                name: '古龙吐息',
                cooldown: 12000,
                description: '向前方扇形区域释放龙息，造成250%攻击力伤害，并附加持续火焰伤害',
                damageMultiplier: 2.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                dotDamage: 0.15, // 持续伤害：每秒15%攻击力
                dotDuration: 4000, // 持续4秒
                castMode: 'radial'
            },
            '混沌之刃': {
                name: '虚空崩解',
                cooldown: 15000,
                description: '对周围所有敌人造成320%攻击力伤害，并降低敌人30%所有属性，持续5秒',
                damageMultiplier: 3.2,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.5,
                enemyDebuff: 0.3, // 降低30%所有属性
                debuffDuration: 5000,
                castMode: 'radial'
            },
            // 远程武器技能（射程使用 PLAYER_RANGED_ATTACK_RANGE）
            '猎风短弓': { name: '追风箭', cooldown: 8000, description: '对锁定目标造成150%攻击力伤害（带锁定标记）', damageMultiplier: 1.5, range: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 1.0, castMode: 'target_lock', showLockMarker: true },
            '幽影弩': { name: '暗影贯穿', cooldown: 9000, description: '对锁定目标造成175%攻击力伤害（带锁定标记）', damageMultiplier: 1.75, range: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 1.0, castMode: 'target_lock', showLockMarker: true },
            '曦光长弓': { name: '破晓之矢', cooldown: 10000, description: '对锁定目标造成200%攻击力伤害（带锁定标记）', damageMultiplier: 2.0, range: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 1.0, castMode: 'target_lock', showLockMarker: true },
            '穿云破月': { name: '贯月连珠', cooldown: 12000, description: '对准星落点范围造成250%攻击力伤害', damageMultiplier: 2.5, range: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 1.08, castMode: 'ground_aoe', groundCastRange: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 1.05, groundAoERadius: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 0.72 },
            '永夜·星坠': { name: '星陨', cooldown: 15000, description: '对准星落点范围造成300%攻击力伤害，必定暴击', damageMultiplier: 3.0, range: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 1.1, guaranteedCrit: true, castMode: 'ground_aoe', groundCastRange: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 1.08, groundAoERadius: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 0.78 }
        };
        
        // 优先匹配武器名称，如果没有匹配则根据品质使用默认技能
        if (weaponSkills[this.name]) {
            return weaponSkills[this.name];
        }
        
        // 品质默认技能（作为后备，名称与武器技能区分开以免图标雷同）
        const qualitySkills = {
            common: {
                name: '破势一击',
                cooldown: 8000,
                description: '对锁定目标造成150%攻击力伤害（准星方向优先锁定）',
                damageMultiplier: 1.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.0,
                castMode: 'target_lock',
                showLockMarker: true
            },
            rare: {
                name: '战意迸发',
                cooldown: 9000,
                description: '对锁定目标造成175%攻击力伤害（准星方向优先锁定）',
                damageMultiplier: 1.75,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.1,
                castMode: 'target_lock',
                showLockMarker: true
            },
            fine: {
                name: '闪霆',
                cooldown: 10000,
                description: '对锁定目标造成200%攻击力伤害，并额外造成50%暴击伤害',
                damageMultiplier: 2.0,
                critBonus: 0.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.2,
                castMode: 'target_lock',
                showLockMarker: true
            },
            epic: {
                name: '炎狱风暴',
                cooldown: 12000,
                description: '对周围所有敌人造成250%攻击力伤害，并附加持续伤害',
                damageMultiplier: 2.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                dotDamage: 0.1,
                dotDuration: 3000,
                castMode: 'radial'
            },
            legendary: {
                name: '天谴',
                cooldown: 15000,
                description: '对准星方向落点范围造成300%攻击力伤害，必定暴击',
                damageMultiplier: 3.0,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.5,
                guaranteedCrit: true,
                castMode: 'ground_aoe',
                groundCastRange: CONFIG.PLAYER_ATTACK_RANGE * 2.35,
                groundAoERadius: CONFIG.PLAYER_ATTACK_RANGE * 1.45
            }
        };
        
        if (this.slot === 'weapon' && this.name && resolveDeepEquipmentTrait(this.name)) {
            const deep = getDeepWeaponSkillObject(this.weaponType, this.quality, this.name);
            if (deep) return deep;
        }
        
        return qualitySkills[this.quality] || null;
    }
    
    /**
     * 生成装备词条
     * 根据装备名称、品质和部位生成特色词条
     * @returns {Object} 装备词条对象
     */
    generateEquipmentTraits() {
        const traits = {};
        
        const deepTrait = resolveDeepEquipmentTrait(this.name);
        if (deepTrait) {
            traits.id = deepTrait.id;
            traits.description = deepTrait.description;
            return traits;
        }
        
        // 根据装备名称匹配特定词条
        const nameTraits = {
            // 武器词条
            '斑驳铁剑': { id: 'toughness', description: '坚韧：受到伤害时，有10%概率恢复5%最大生命值' },
            '锋锐骑士长剑': { id: 'knight_spirit', description: '骑士精神：攻击时有15%概率提升10%防御力，持续3秒' },
            '淬火精钢剑': { id: 'quench', description: '淬火：暴击时有20%概率触发额外伤害，造成50%攻击力伤害' },
            '幽冥绝影刃': { id: 'shadow', description: '暗影：闪避攻击后，下次攻击必定暴击' },
            '鸣霜青铜剑': { id: 'frost', description: '霜寒：攻击时有15%概率降低目标20%移动速度，持续2秒' },
            '辉光秘银刃': { id: 'radiance', description: '辉光：每次攻击有10%概率提升15%攻击速度，持续5秒' },
            '逐月银芒剑': { id: 'moonlight', description: '月华：在夜晚（或低血量时）提升20%所有属性' },
            '晶曜寒锋': { id: 'ice_crystal', description: '冰晶：攻击时有20%概率冰冻目标1秒' },
            '逆鳞屠龙锋': { id: 'reverse_scale', description: '逆鳞：生命值低于30%时，攻击力提升30%' },
            '劫火焚伤': { id: 'flame_burn', description: '焚天：击杀敌人后，攻击力提升5%，最多叠加5层' },
            '凛冬之拥': { id: 'winter', description: '极地：受到攻击时，有25%概率降低攻击者30%攻击速度，持续3秒' },
            '圣耀·断罪': { id: 'divine_judgment', description: '圣耀：暴击伤害提升50%，暴击时有30%概率触发范围伤害' },
            '惊雷破晓': { id: 'thunder_god', description: '雷神：攻击时有20%概率触发连锁闪电，对附近敌人造成80%攻击力伤害' },
            '坠星裁决': { id: 'starfall', description: '星辰：每次击杀敌人恢复10%最大生命值，并提升5%所有属性，持续10秒' },
            
            // 打造装备词条（武器）
            '精钢长剑': { id: 'steel_blade', description: '精钢：攻击时有20%概率提升15%攻击力，持续5秒，可叠加2层' },
            '魔法水晶剑': { id: 'crystal_magic', description: '水晶魔法：攻击时有25%概率触发魔法爆炸，对目标及周围敌人造成100%攻击力伤害' },
            '远古龙刃': { id: 'ancient_dragon', description: '龙族之力：每次攻击有15%概率召唤龙息，对前方扇形区域造成150%攻击力伤害' },
            '混沌之刃': { id: 'chaos_blade', description: '混沌：攻击时有30%概率触发混沌之力，造成200%攻击力伤害并降低目标30%所有属性，持续5秒' },
            '猎风短弓': { id: 'hunt_wind', description: '猎风：远程命中时提升5%移速，持续2秒' },
            '幽影弩': { id: 'shadow_crossbow', description: '幽影：远程暴击时额外造成20%伤害' },
            '曦光长弓': { id: 'dawn_bow', description: '曦光：远程攻击有10%概率穿透目标' },
            '穿云破月': { id: 'cloud_pierce', description: '穿云：远程攻击射程+10%' },
            '永夜·星坠': { id: 'starfall_bow', description: '星坠：远程暴击时对目标周围小范围造成50%伤害' },
            
            // 防具词条（头盔）
            '猎手皮帽': { id: 'hunter', description: '猎手：攻击怪物时，有10%概率获得额外经验' },
            '古朴青铜盔': { id: 'ancient', description: '古朴：受到暴击时，有12%概率使该次暴击伤害减半' },
            '坚毅铁盔': { id: 'perseverance', description: '坚毅：生命值低于50%时，防御力提升20%' },
            '骁勇钢盔': { id: 'brave', description: '骁勇：击杀敌人后，攻击力提升3%，最多叠加3层' },
            '龙息战盔': { id: 'dragon_breath_helmet', description: '龙息：受到攻击时，有15%概率对攻击者造成50%攻击力的火焰伤害' },
            '众神冠冕': { id: 'divine_crown', description: '神威：所有属性提升10%，受击时低概率小幅减伤' },
            '占星秘法帽': { id: 'astrology', description: '占星：暴击率提升5%，暴击时有10%概率触发额外暴击' },
            '皎月银冠': { id: 'bright_moon', description: '皎月：在低血量时，闪避率提升15%' },
            '莹彻晶盔': { id: 'crystal_helmet', description: '晶化：受到伤害时，有20%概率将30%伤害转化为生命值恢复' },
            '炽焰重盔': { id: 'blazing_helmet', description: '炽焰：攻击时有10%概率对目标造成持续火焰伤害' },
            '绝尘霜盔': { id: 'frost_helmet', description: '霜寒：受到攻击时，有25%概率降低攻击者移动速度' },
            '轰鸣雷冠': { id: 'thunder_crown', description: '雷鸣：攻击时有15%概率触发雷电，对周围敌人造成伤害' },
            '瀚海星冕': { id: 'star_sea', description: '星海：所有技能冷却时间减少15%' },
            
            // 打造装备词条（头盔）
            '神威头盔': { id: 'divine_helmet', description: '神威：所有属性提升12%，受击时约12%概率减伤，击杀敌人后恢复15%最大生命值' },
            
            // 防具词条（胸甲）
            '苦行者长衫': { id: 'ascetic', description: '苦行：受到伤害时，有5%概率恢复10%最大生命值' },
            '斑驳青铜铠': { id: 'mottled', description: '斑驳：防御力提升5%，受到攻击时有10%概率反弹伤害' },
            '荆棘皮甲': { id: 'thorn', description: '荆棘：受到近战攻击时，反弹20%伤害给攻击者' },
            '细密锁子甲': { id: 'chain', description: '锁链：受到攻击时，有15%概率降低攻击者攻击速度' },
            '雄狮板甲': { id: 'lion', description: '雄狮：生命值高于70%时，攻击力提升15%' },
            '咏咒师长袍': { id: 'chant', description: '咏咒：使用技能后，下次攻击伤害提升30%' },
            '逆鳞龙铠': { id: 'reverse_scale_armor', description: '逆鳞：受到致命伤害时，90秒冷却内至多一次，约15%概率将该次伤害压至不超过最大生命12%' },
            '永恒神威': { id: 'eternal_divine', description: '永恒：每秒恢复1%最大生命值，受到伤害时提升20%防御力' },
            '晶化内衬甲': { id: 'crystal_chest', description: '晶化：受到伤害时，有25%概率将伤害降低50%' },
            '熔岩重铠': { id: 'lava', description: '熔岩：受到攻击时，对周围敌人造成持续火焰伤害' },
            '凛风冰衣': { id: 'cold_wind', description: '凛风：受到攻击时，有30%概率冰冻攻击者1秒' },
            '电光战袍': { id: 'lightning_robe', description: '电光：移动时，有10%概率触发闪电，对路径上的敌人造成伤害' },
            '极星护佑': { id: 'star_guard', description: '极星：所有抗性提升15%，受到元素伤害时恢复生命值' },
            
            // 打造装备词条（胸甲）
            '龙鳞护甲': { id: 'dragon_scale', description: '龙鳞：防御力提升15%，受到攻击时有30%概率反弹50%伤害，并恢复反弹伤害50%的生命值' },
            '秘银战甲': { id: 'mithril_armor', description: '秘银：防御力提升20%，受到伤害时有35%概率将伤害降低60%，并提升10%攻击力，持续5秒' },
            '永恒战甲': { id: 'eternal_armor', description: '永恒：每秒恢复2%最大生命值，受到伤害时提升30%防御力，生命值低于50%时所有属性提升20%' },
            
            // 防具词条（腿甲）
            '游侠布裤': { id: 'ranger', description: '游侠：移动速度提升5%，闪避率提升3%' },
            '沉重青铜卫': { id: 'heavy', description: '沉重：防御力提升8%，但移动速度降低5%' },
            '兽纹皮裤': { id: 'beast_pattern', description: '兽纹：攻击时有10%概率提升15%移动速度，持续3秒' },
            '铁卫护腿': { id: 'iron_guard', description: '铁卫：受到攻击时，有15%概率提升20%防御力，持续5秒' },
            '陷阵重护腿': { id: 'charge', description: '陷阵：生命值低于40%时，攻击力和防御力各提升20%' },
            '龙筋护腿': { id: 'dragon_tendon', description: '龙筋：移动速度提升10%，攻击时有10%概率触发冲刺' },
            '律法圣带': { id: 'law', description: '律法：所有属性提升8%，受击时约10%概率减伤' },
            '流银护胫': { id: 'flowing_silver', description: '流银：攻击速度提升5%，攻击时有15%概率触发连击' },
            '琉璃晶胫': { id: 'glazed', description: '琉璃：受到伤害时，有20%概率将伤害转化为护盾' },
            '灰烬护足': { id: 'ash', description: '灰烬：击杀敌人后，移动速度提升10%，持续5秒' },
            '疾雷腿甲': { id: 'swift_thunder', description: '疾雷：移动时，有15%概率触发雷电，对周围敌人造成伤害' },
            '银河轨迹': { id: 'galaxy_trail', description: '银河：移动时留下轨迹，对经过的敌人造成持续伤害' },
            
            // 防具词条（足具）
            '旅人草鞋': { id: 'traveler', description: '旅人：移动速度提升8%，脱离战斗后恢复生命值' },
            '坚固青铜靴': { id: 'sturdy', description: '坚固：防御力提升5%，移动速度提升3%' },
            '硬革皮靴': { id: 'hard_leather', description: '硬革：受到攻击时，有10%概率提升15%移动速度' },
            '猎豹疾靴': { id: 'cheetah', description: '猎豹：移动速度提升10%，攻击时有10%概率触发额外攻击' },
            '征战铁靴': { id: 'war', description: '征战：攻击时有15%概率提升20%移动速度，持续3秒' },
            '龙踏云靴': { id: 'cloud_step', description: '云踏：移动时，有10%概率触发瞬移，对路径上的敌人造成伤害' },
            '逐神之迹': { id: 'god_chase', description: '逐神：移动速度提升15%，攻击时有20%概率触发范围伤害' },
            '烁光银靴': { id: 'shimmer', description: '烁光：移动时，有15%概率触发闪光，对周围敌人造成伤害' },
            '踏火余烬': { id: 'fire_trail', description: '余烬：移动时留下火焰轨迹，对经过的敌人造成持续伤害' },
            '凝霜远行': { id: 'frost_walk', description: '凝霜：移动时，有20%概率冰冻路径上的敌人' },
            '迅雷闪步': { id: 'thunder_step', description: '闪步：移动时，有25%概率触发闪电，对周围敌人造成伤害' },
            '星轨漫步': { id: 'star_trail', description: '星轨：移动时，有15%概率触发星辰，对周围敌人造成伤害' },
            
            // 挂饰词条（项链）
            '黄铜勋章': { id: 'medal', description: '勋章：所有属性提升2%' },
            '古遗青铜环': { id: 'ancient_relic', description: '古遗：攻击时有10%概率触发额外伤害' },
            '纯银吊坠': { id: 'silver', description: '纯银：受到伤害时，有10%概率恢复5%最大生命值' },
            '蛮力之源': { id: 'brute_force', description: '蛮力：攻击力提升5%，但防御力降低3%' },
            '黄金契约': { id: 'golden_contract', description: '契约：击杀敌人后，获得额外金币和经验' },
            '龙心垂饰': { id: 'dragon_heart', description: '龙心：生命值低于30%时，每秒恢复5%最大生命值' },
            '诸神眷顾': { id: 'divine_favor', description: '眷顾：所有属性提升12%，受击时低概率小幅减伤' },
            '月影流光': { id: 'moon_shadow', description: '月影：在低血量时，闪避率和攻击速度各提升15%' },
            '秘法晶髓': { id: 'arcane_core', description: '秘法：技能冷却时间减少10%' },
            '烬灭红莲': { id: 'crimson_lotus', description: '红莲：攻击时有15%概率触发火焰爆炸' },
            '极地永冻': { id: 'eternal_freeze', description: '永冻：攻击时有20%概率冰冻目标，持续2秒' },
            '裂空雷纹': { id: 'thunder_pattern', description: '雷纹：攻击时有20%概率触发连锁闪电' },
            '璀璨星图': { id: 'star_map', description: '星图：所有技能效果提升20%' },
            
            // 挂饰词条（指环）
            '铜制扳指': { id: 'thumb_ring', description: '扳指：攻击速度提升3%' },
            '岁月青铜': { id: 'years', description: '岁月：击杀敌人后，有10%概率获得额外经验' },
            '秘银私语': { id: 'whisper', description: '私语：攻击时有10%概率触发额外攻击' },
            '金权戒律': { id: 'discipline', description: '戒律：暴击率提升5%，暴击伤害提升10%' },
            '迅影之触': { id: 'swift_shadow', description: '迅影：攻击速度提升8%，移动速度提升5%' },
            '龙息之握': { id: 'dragon_breath_ring', description: '龙息：攻击时有15%概率触发火焰伤害' },
            '创世法则': { id: 'creation_law', description: '法则：所有属性提升15%，技能冷却时间减少20%' },
            '孤星寒芒': { id: 'cold_star', description: '寒芒：攻击时有20%概率冰冻目标' },
            '灵能谐振': { id: 'resonance', description: '谐振：技能伤害提升15%' },
            '炎魔之瞳': { id: 'demon_eye', description: '炎魔：攻击时有15%概率触发火焰爆炸' },
            '霜魂凝视': { id: 'frost_soul', description: '霜魂：攻击时有25%概率冰冻目标' },
            '狂雷怒吼': { id: 'thunder_roar', description: '狂雷：攻击时有20%概率触发雷电，对周围敌人造成伤害' },
            '永恒星辰': { id: 'eternal_star', description: '星辰：所有技能效果提升25%' },
            
            // 挂饰词条（腰带）
            '编织腰带': { id: 'woven', description: '编织：所有属性提升1%' },
            '青铜甲带': { id: 'armor_belt', description: '甲带：防御力提升3%' },
            '钢扣皮带': { id: 'steel_buckle', description: '钢扣：攻击力和防御力各提升3%' },
            '铁质束腰': { id: 'iron_belt', description: '束腰：所有属性提升5%' },
            '壁垒腰带': { id: 'fortress', description: '壁垒：防御力提升10%，但攻击力降低5%' },
            '龙革腰带': { id: 'dragon_leather', description: '龙革：生命值提升15%，防御力提升8%' },
            '天庭之束': { id: 'celestial', description: '天庭：所有属性提升12%，受击时约10%概率减伤' },
            '银翼束带': { id: 'silver_wing', description: '银翼：移动速度和攻击速度各提升5%' },
            '晶纹饰带': { id: 'crystal_pattern', description: '晶纹：受到伤害时，有20%概率将伤害降低30%' },
            '炽炎之环': { id: 'blazing_ring', description: '炽炎：攻击时有10%概率触发火焰伤害' },
            '霜冻之触': { id: 'frost_touch', description: '霜冻：攻击时有15%概率冰冻目标' },
            '奔雷束缚': { id: 'thunder_bind', description: '奔雷：攻击时有15%概率触发雷电' },
            '星界纽带': { id: 'star_bond', description: '星界：所有技能冷却时间减少15%' }
        };
        
        // 如果装备有特定词条，使用特定词条（20 级及以下加 _0～_3 档位，玩法随档分化）
        if (nameTraits[this.name]) {
            const base = nameTraits[this.name];
            const st = typeof standardEquipmentTier === 'function' ? standardEquipmentTier(this.level) : null;
            if (st !== null) {
                traits.id = `${base.id}_${st}`;
                traits.description = formatStandardTierTraitDescription(base.description, st, this.level);
            } else {
                traits.id = base.id;
                traits.description = base.description;
            }
        } else {
            // 否则根据品质和部位生成通用词条
            const qualityTraits = {
                common: {
                    weapon: '基础：攻击时有5%概率造成额外伤害',
                    armor: '基础：防御力提升3%',
                    accessory: '基础：所有属性提升2%'
                },
                rare: {
                    weapon: '强化：攻击时有10%概率造成额外伤害',
                    armor: '强化：防御力提升5%',
                    accessory: '强化：所有属性提升4%'
                },
                fine: {
                    weapon: '精良：攻击时有15%概率造成额外伤害，并提升暴击率',
                    armor: '精良：防御力提升8%，受到伤害时有10%概率免疫',
                    accessory: '精良：所有属性提升6%，技能冷却时间减少5%'
                },
                epic: {
                    weapon: '史诗：攻击时有20%概率造成额外伤害，并触发范围效果',
                    armor: '史诗：防御力提升12%，受到伤害时有15%概率免疫',
                    accessory: '史诗：所有属性提升10%，技能冷却时间减少10%'
                },
                legendary: {
                    weapon: '传说：攻击时有25%概率造成额外伤害，并触发强力效果',
                    armor: '传说：防御力提升15%，受到伤害时有20%概率免疫',
                    accessory: '传说：所有属性提升15%，技能冷却时间减少15%'
                }
            };
            
            const slotType = this.slot === 'weapon' ? 'weapon' : 
                           ['helmet', 'chest', 'legs', 'boots'].includes(this.slot) ? 'armor' : 'accessory';
            
            const baseQ = qualityTraits[this.quality]?.[slotType] || '无特殊效果';
            const stGen = typeof standardEquipmentTier === 'function' ? standardEquipmentTier(this.level) : null;
            if (stGen !== null) {
                traits.id = `gen_${this.quality}_${slotType}_${stGen}`;
                traits.description = formatStandardTierTraitDescription(baseQ, stGen, this.level);
            } else {
                traits.id = `gen_${this.quality}_${slotType}`;
                traits.description = baseQ;
            }
        }
        
        return traits;
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
    }

    getTooltipHTML(currentEquipment = null) {
        let html = `<h4 style="color: ${QUALITY_COLORS[this.quality]}">${this.name}</h4>`;
        html += `<p>部位: ${SLOT_NAMES[this.slot]}</p>`;
        html += `<p>品质: ${QUALITY_NAMES[this.quality]}</p>`;
        html += `<p style="color: #ffaa00;">需要等级: ${this.level}</p>`;
        if (this.enhanceLevel > 0) {
            html += `<p style="color: #ffd700;">强化等级: +${this.enhanceLevel}</p>`;
        }
        if (this.refineLevel > 0) {
            html += `<p style="color: #ffd700;">精炼等级: ${'★'.repeat(this.refineLevel)}</p>`;
        }
        html += `<p>---</p>`;
        
        for (const [key, value] of Object.entries(this.stats)) {
            if (value !== 0) {
                const statNames = {
                    attack: '攻击力',
                    critRate: '暴击率',
                    critDamage: '暴击伤害',
                    health: '生命值',
                    defense: '防御力',
                    dodge: '闪避率',
                    attackSpeed: '攻击速度',
                    moveSpeed: '移动速度',
                    lifeSteal: '吸血',
                    thorn: '荆棘反伤',
                    skillHaste: '技能急速',
                    damageReduction: '受到伤害减免',
                    towerGoldBonus: '恶魔塔金币加成'
                };
                const pctKeys = ['critRate', 'attackSpeed', 'moveSpeed', 'dodge', 'lifeSteal', 'thorn', 'skillHaste', 'damageReduction', 'towerGoldBonus'];
                const isPct = key.includes('Rate') || key.includes('Speed') || key === 'dodge' || pctKeys.includes(key);
                html += `<p>${statNames[key] || key}: ${value}${isPct ? '%' : ''}</p>`;
            }
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
        
        // 显示套装信息（合铸装备可显示多个套装）
        const setIdsToShow = (this.fusionSetIds && this.fusionSetIds.length) ? this.fusionSetIds : (getSetForEquipment(this.name) ? [getSetForEquipment(this.name)] : []);
        let activeSet = new Set();
        if (currentEquipment && typeof getActiveSetEffects === 'function') {
            getActiveSetEffects(currentEquipment).forEach(e => activeSet.add(e.setId + '-' + e.pieceCount));
        }
        setIdsToShow.forEach(setId => {
            if (!setId || typeof SET_DEFINITIONS === 'undefined' || !SET_DEFINITIONS[setId]) return;
            const setData = SET_DEFINITIONS[setId];
            html += `<p>---</p>`;
            html += `<p style="color: #ffaa00;"><strong>套装: ${setData.name}</strong></p>`;
            html += `<p style="color: #aaa; font-size: 11px;">套装效果:</p>`;
            for (const [pieceCount, effect] of Object.entries(setData.effects)) {
                const active = activeSet.has(setId + '-' + pieceCount);
                const color = active ? '#33ff33' : '#888888';
                html += `<p style="color: ${color}; font-size: 10px;">${pieceCount}件: ${typeof stripSetDescriptionMarkdown === 'function' ? stripSetDescriptionMarkdown(effect.description) : effect.description}</p>`;
            }
        });
        
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
    const equipments = [];
    
    // 从全局配置中读取装备定义
    const equipmentDefinitions = EQUIPMENT_DEFINITIONS;

    let id = 0;
    equipmentDefinitions.forEach(def => {
        const stats = {};
        
        // 根据部位设置主属性（只保留需要的属性）
        if (def.slot === 'weapon') {
            // 武器：只保留攻击力、暴击率、暴击伤害
            stats.attack = def.attack || 0;
            stats.critRate = def.critRate || 0;
            stats.critDamage = def.critDamage || 0;
        } else if (['helmet', 'chest', 'legs', 'boots'].includes(def.slot)) {
            // 防具：只保留生命值、防御力
            stats.health = def.health || 0;
            stats.defense = def.defense || 0;
        } else if (['necklace', 'ring', 'belt'].includes(def.slot)) {
            // 挂饰：只保留攻击速度、移动速度、闪避率
            stats.dodge = def.dodge || 0;
            stats.attackSpeed = def.attackSpeed || 0;
            stats.moveSpeed = def.moveSpeed || 0;
        }
        EQUIPMENT_MECHANIC_KEYS.forEach(k => {
            if (def[k] != null && def[k] !== '') stats[k] = def[k];
        });
        
        equipments.push(new Equipment({
            id: id++,
            name: def.name,
            slot: def.slot,
            weaponType: def.weaponType,
            quality: def.quality,
            level: def.level,
            stats: stats
        }));
    });
    
    return equipments;
}

