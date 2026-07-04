/**
 * Pixel Eternal - 配置辅助函数模块
 */

/** @deprecated 旧静态套装已移除，请使用 equipment.setId */
function getSetForEquipment(equipmentName) {
    void equipmentName;
    return null;
}

/** @deprecated 旧 8 件套已移除 */
function getSetPieceCount(equipment, setId) {
    void equipment;
    void setId;
    return 0;
}

/** @deprecated 旧 8 件套已移除 */
function getActiveSetEffects(equipment) {
    void equipment;
    return [];
}

function getSetV2ForEquipment(equipment) {
    if (!equipment) return null;
    return equipment.setId || null;
}

function getSetV2PieceCount(equipment, setId) {
    if (!setId || !equipment) return 0;
    let count = 0;
    Object.values(equipment).forEach(eq => {
        if (eq && eq.setId === setId) count++;
    });
    return count;
}

function getActiveSetEffectsV2(equipment) {
    if (typeof SET_DEFINITIONS_V2 === 'undefined' || !SET_DEFINITIONS_V2 || !SET_DEFINITIONS_V2.sets) return [];
    const activeEffects = [];
    const setCounts = {};
    Object.values(equipment || {}).forEach(eq => {
        if (eq && eq.setId) setCounts[eq.setId] = (setCounts[eq.setId] || 0) + 1;
    });
    const pieceTargets = SET_DEFINITIONS_V2.activationPieces || [2, 4];
    for (const [setId, count] of Object.entries(setCounts)) {
        const setData = SET_DEFINITIONS_V2.sets[setId];
        if (!setData) continue;
        for (const pieceCount of pieceTargets) {
            const pc = String(pieceCount);
            if (count >= pieceCount && setData.effects && setData.effects[pc]) {
                activeEffects.push({
                    setId,
                    setName: setData.name,
                    pieceCount: pieceCount,
                    effect: setData.effects[pc],
                    version: 2
                });
            }
        }
    }
    return activeEffects;
}

function getAllActiveSetEffects(equipment) {
    return getActiveSetEffectsV2(equipment);
}

function resolveSetDefinition(setId) {
    if (!setId) return null;
    if (typeof SET_DEFINITIONS_V2 !== 'undefined' && SET_DEFINITIONS_V2.sets && SET_DEFINITIONS_V2.sets[setId]) {
        return SET_DEFINITIONS_V2.sets[setId];
    }
    return null;
}

function stripSetDescriptionMarkdown(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\*\*([^*]+)\*\*/g, '$1');
}
