/**
 * Pixel Eternal - 配置辅助函数模块
 * 包含与配置相关的辅助函数
 */

/**
 * 获取装备所属的套装
 * @param {string} equipmentName - 装备名称
 * @returns {string|null} 套装ID，如果不属于任何套装则返回null
 */
function getSetForEquipment(equipmentName) {
    if (typeof SET_DEFINITIONS === 'undefined') return null;
    
    for (const [setId, setData] of Object.entries(SET_DEFINITIONS)) {
        if (setData.pieces.includes(equipmentName)) {
            return setId;
        }
    }
    return null;
}

/**
 * 获取套装的装备数量
 * @param {Object} equipment - 玩家装备对象
 * @param {string} setId - 套装ID
 * @returns {number} 已装备的套装件数
 */
function getSetPieceCount(equipment, setId) {
    if (typeof SET_DEFINITIONS === 'undefined') return 0;
    
    const setData = SET_DEFINITIONS[setId];
    if (!setData) return 0;
    
    let count = 0;
    Object.values(equipment).forEach(eq => {
        if (!eq) return;
        if (setData.pieces.includes(eq.name)) {
            count++;
        }
    });
    
    return count;
}

/**
 * 获取激活的套装效果
 * @param {Object} equipment - 玩家装备对象
 * @returns {Array} 激活的套装效果列表
 */
function getActiveSetEffects(equipment) {
    if (typeof SET_DEFINITIONS === 'undefined') return [];
    
    const activeEffects = [];
    const setCounts = {}; // 记录每个套装的件数
    
    // 统计每个套装的件数
    Object.values(equipment).forEach(eq => {
        if (eq) {
            const setId = getSetForEquipment(eq.name);
            if (setId) {
                setCounts[setId] = (setCounts[setId] || 0) + 1;
            }
        }
    });
    
    // 检查每个套装的激活效果
    for (const [setId, count] of Object.entries(setCounts)) {
        const setData = SET_DEFINITIONS[setId];
        if (!setData) continue;
        
        // 检查2件、4件、6件、8件效果
        for (const pieceCount of [2, 4, 6, 8]) {
            if (count >= pieceCount && setData.effects[pieceCount]) {
                activeEffects.push({
                    setId: setId,
                    setName: setData.name,
                    pieceCount: pieceCount,
                    effect: setData.effects[pieceCount]
                });
            }
        }
    }
    
    return activeEffects;
}

/**
 * 获取装备所属的新版套装 ID（2/4 件激活）
 */
function getSetV2ForEquipment(equipment) {
    if (!equipment) return null;
    if (equipment.setId) return equipment.setId;
    return null;
}

/**
 * 统计新版套装已装备件数
 */
function getSetV2PieceCount(equipment, setId) {
    if (!setId || !equipment) return 0;
    let count = 0;
    Object.values(equipment).forEach(eq => {
        if (eq && eq.setId === setId) count++;
    });
    return count;
}

/**
 * 获取新版套装激活效果（2/4 件）
 */
function getActiveSetEffectsV2(equipment) {
    if (typeof SET_DEFINITIONS_V2 === 'undefined' || !SET_DEFINITIONS_V2 || !SET_DEFINITIONS_V2.sets) return [];
    const activeEffects = [];
    const setCounts = {};
    Object.values(equipment || {}).forEach(eq => {
        if (eq && eq.setId) {
            setCounts[eq.setId] = (setCounts[eq.setId] || 0) + 1;
        }
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

/**
 * 合并旧版与新版套装效果
 */
function getAllActiveSetEffects(equipment) {
    const legacy = typeof getActiveSetEffects === 'function' ? getActiveSetEffects(equipment) : [];
    const v2 = typeof getActiveSetEffectsV2 === 'function' ? getActiveSetEffectsV2(equipment) : [];
    return legacy.concat(v2);
}

/**
 * 套装描述中的 **铭牌** 为 Markdown 强调；游戏内 HTML 需去掉星号
 */
function stripSetDescriptionMarkdown(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\*\*([^*]+)\*\*/g, '$1');
}

