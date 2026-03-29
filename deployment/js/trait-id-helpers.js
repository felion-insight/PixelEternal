/**
 * 装备词条 id 解析：支持「基础id」或「基础id_档位」（任意正整数档位，兼容深阶 0～7 与低级装 0～3）
 */
function traitIdBase(id) {
    if (!id || typeof id !== 'string') return '';
    const m = id.match(/^(.*)_(\d+)$/);
    if (!m) return id;
    const n = parseInt(m[2], 10);
    if (!Number.isFinite(n) || n < 0 || n > 99) return id;
    return m[1];
}

function traitIdTier(id) {
    if (!id || typeof id !== 'string') return 0;
    const m = id.match(/^(.*)_(\d+)$/);
    if (!m) return 0;
    const n = parseInt(m[2], 10);
    return Number.isFinite(n) ? n : 0;
}

function traitIdsIncludeBase(traitIds, base) {
    if (!Array.isArray(traitIds) || !base) return false;
    for (let i = 0; i < traitIds.length; i++) {
        if (traitIdBase(traitIds[i]) === base) return true;
    }
    return false;
}

/** 多件同族时取最高档位 */
function traitTierFromList(traitIds, base) {
    if (!Array.isArray(traitIds)) return 0;
    let max = 0;
    let found = false;
    for (let i = 0; i < traitIds.length; i++) {
        const x = traitIds[i];
        if (traitIdBase(x) === base) {
            found = true;
            max = Math.max(max, traitIdTier(x));
        }
    }
    return found ? max : 0;
}

/**
 * 深阶主题档 0～7 → 四段机制带（同带内玩法一致、数值随 tier 变；跨带机制不同）
 * 0–1 渊隙·虚印 | 2–3 腐噬·黑曜 | 4–5 终幕·星骸 | 6–7 裂点·终焉
 */
function deepTraitBand(tier) {
    const t = tier | 0;
    if (t <= 1) return 0;
    if (t <= 3) return 1;
    if (t <= 5) return 2;
    return 3;
}

/** 20 级及以下：按 5 级一档共 4 档（0=1–5级 … 3=16–20级）；21+ 返回 null 表示不挂后缀 */
function standardEquipmentTier(level) {
    const L = level | 0;
    if (L <= 0 || L > 20) return null;
    return Math.min(3, Math.floor((L - 1) / 5));
}

/** 与历史代码兼容的别名（全局函数，供 game-entities 等直接调用） */
function voidEquipTraitBase(id) {
    return traitIdBase(id);
}
function voidEquipTraitTier(id) {
    return traitIdTier(id);
}
function voidTraitTierFromList(traitIds, base) {
    return traitTierFromList(traitIds, base);
}

if (typeof window !== 'undefined') {
    window.traitIdBase = traitIdBase;
    window.traitIdTier = traitIdTier;
    window.traitIdsIncludeBase = traitIdsIncludeBase;
    window.traitTierFromList = traitTierFromList;
    window.deepTraitBand = deepTraitBand;
    window.standardEquipmentTier = standardEquipmentTier;
    window.voidEquipTraitBase = voidEquipTraitBase;
    window.voidEquipTraitTier = voidEquipTraitTier;
    window.voidTraitTierFromList = voidTraitTierFromList;
}
