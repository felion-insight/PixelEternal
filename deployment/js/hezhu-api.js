/**
 * 合铸 API：调用 Gemini 生成融合装备的名称、词条与基础属性
 * 支持本地兜底：无网络或 API 不可用时自动用规则生成，无需 VPN
 */
(function () {
    'use strict';

    const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG.HEZHU_API_BASE) ? CONFIG.HEZHU_API_BASE : 'https://generativelanguage.googleapis.com';
    const MODEL = (typeof CONFIG !== 'undefined' && CONFIG.HEZHU_MODEL) ? CONFIG.HEZHU_MODEL : 'gemini-3.1-flash-lite-preview';
    const STAT_KEYS = ['attack', 'critRate', 'critDamage', 'health', 'defense', 'dodge', 'attackSpeed', 'moveSpeed'];

    /**
     * 本地合铸：不请求 API，用规则生成名称、词条与基础属性（无需 VPN）
     * @param {Object} eqA - 装备 A
     * @param {Object} eqB - 装备 B
     * @returns {{ name: string, traitId: string, traitDescription: string, baseStats: Object }}
     */
    function localFuse(eqA, eqB) {
        const nameA = (eqA.name || '未知').replace(/\s/g, '');
        const nameB = (eqB.name || '未知').replace(/\s/g, '');
        const take = (s, n) => (s && s.length >= n) ? s.slice(0, n) : (s || '');
        const name = '合铸·' + (take(nameA, 2) + take(nameB, 2)) || '融合装备';
        const idA = (eqA.equipmentTraits && eqA.equipmentTraits.id) ? String(eqA.equipmentTraits.id).replace(/\W/g, '_') : 'a';
        const idB = (eqB.equipmentTraits && eqB.equipmentTraits.id) ? String(eqB.equipmentTraits.id).replace(/\W/g, '_') : 'b';
        const traitId = 'fusion_' + idA + '_' + idB;
        const descA = (eqA.equipmentTraits && eqA.equipmentTraits.description) ? eqA.equipmentTraits.description : '未知';
        const descB = (eqB.equipmentTraits && eqB.equipmentTraits.description) ? eqB.equipmentTraits.description : '未知';
        const traitDescription = '融合：「' + descA + '」与「' + descB + '」，兼具两者特点。';
        const statsA = eqA.stats || eqA.baseStats || {};
        const statsB = eqB.stats || eqB.baseStats || {};
        const baseStats = {};
        STAT_KEYS.forEach(k => {
            const a = Number(statsA[k]) || 0;
            const b = Number(statsB[k]) || 0;
            baseStats[k] = Math.max(0, Math.floor((a + b) / 2) + (a + b > 0 ? 1 : 0));
        });
        return { name, traitId, traitDescription, baseStats };
    }

    /**
     * 构建发给 AI 的上下文与两件装备的 JSON，用于生成融合结果
     * @param {Object} gameContext - { traits: [{id, description}], sets: [{id, name, effects}], slots: string[] }
     * @param {Object} eqA - 装备 A（可序列化对象）
     * @param {Object} eqB - 装备 B（可序列化对象）
     * @returns {string} 提示文本
     */
    function buildPrompt(gameContext, eqA, eqB) {
        const traitsText = (gameContext.traits || []).map(t => `- ${t.id}: ${t.description}`).join('\n');
        const setsText = (gameContext.sets || []).map(s => {
            const effects = s.effects ? Object.entries(s.effects).map(([n, e]) => `${n}件: ${e.description || e}`).join('; ') : '';
            return `- ${s.id} (${s.name}): ${effects}`;
        }).join('\n');
        const slotsText = (gameContext.slots || ['weapon', 'helmet', 'chest', 'legs', 'boots', 'necklace', 'ring', 'belt']).join(', ');

        const payloadA = {
            name: eqA.name,
            slot: eqA.slot,
            quality: eqA.quality,
            level: eqA.level,
            stats: eqA.stats || eqA.baseStats,
            equipmentTraits: eqA.equipmentTraits ? { id: eqA.equipmentTraits.id, description: eqA.equipmentTraits.description } : null,
            setId: eqA.fusionSetIds ? eqA.fusionSetIds[0] : (typeof getSetForEquipment === 'function' ? getSetForEquipment(eqA.name) : null)
        };
        const payloadB = {
            name: eqB.name,
            slot: eqB.slot,
            quality: eqB.quality,
            level: eqB.level,
            stats: eqB.stats || eqB.baseStats,
            equipmentTraits: eqB.equipmentTraits ? { id: eqB.equipmentTraits.id, description: eqB.equipmentTraits.description } : null,
            setId: eqB.fusionSetIds ? eqB.fusionSetIds[0] : (typeof getSetForEquipment === 'function' ? getSetForEquipment(eqB.name) : null)
        };

        return `你是一款像素风 RPG 游戏的装备设计助手。请根据以下游戏设定与两件装备，设计一件“合铸”后的新装备。

【游戏设定】
装备部位（slot）：${slotsText}
装备词条示例（id 与 description）：
${traitsText}

套装示例（id、名称与效果）：
${setsText}

【原材料装备 A】
${JSON.stringify(payloadA, null, 2)}

【原材料装备 B】
${JSON.stringify(payloadB, null, 2)}

【要求】
1. 新装备名称需符合游戏风格，且与两件原装备的词条/主题有关联。
2. 新装备词条为“全新”设计：给出唯一的 traitId（英文/数字，如 fusion_frost_flame）和 traitDescription（中文描述，兼具两件装备词条特点）。
3. 新装备基础属性 baseStats 需根据两件装备的 stats 合理融合（数值介于两者之间或略优，不要过于夸张）。baseStats 只包含以下键（无则填 0）：attack, critRate, critDamage, health, defense, dodge, attackSpeed, moveSpeed。
4. 新装备部位（slot）必须与装备 A 相同。
5. 仅输出一个 JSON 对象，不要其他说明或 markdown 标记。格式如下：
{"name":"新装备名","traitId":"唯一id","traitDescription":"词条描述","baseStats":{"attack":0,"critRate":0,"critDamage":0,"health":0,"defense":0,"dodge":0,"attackSpeed":0,"moveSpeed":0}}`;
    }

    /**
     * 调用 Gemini 生成内容并解析为合铸结果
     * @param {Object} gameContext - 同上
     * @param {Object} eqA - 装备 A
     * @param {Object} eqB - 装备 B
     * @returns {Promise<{name: string, traitId: string, traitDescription: string, baseStats: Object}>}
     */
    window.HezhuAPI = {
        fuse: async function (gameContext, eqA, eqB) {
            const useLocal = typeof CONFIG !== 'undefined' && CONFIG.HEZHU_USE_LOCAL === true;
            if (useLocal) {
                return localFuse(eqA, eqB);
            }
            const apiKey = typeof CONFIG !== 'undefined' && CONFIG.HEZHU_API_KEY ? CONFIG.HEZHU_API_KEY : '';
            if (!apiKey) {
                return localFuse(eqA, eqB);
            }
            const url = `${API_BASE}/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const prompt = buildPrompt(gameContext, eqA, eqB);
            const body = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.6, maxOutputTokens: 1024, responseMimeType: 'application/json' }
            };
            let res;
            try {
                res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } catch (fetchErr) {
                const msg = (fetchErr && fetchErr.message) ? String(fetchErr.message) : '';
                if (msg.indexOf('fetch') !== -1 || msg.indexOf('NetworkError') !== -1 || msg.indexOf('Failed to fetch') !== -1 || msg.indexOf('timeout') !== -1) {
                    return localFuse(eqA, eqB);
                }
                throw fetchErr;
            }
            if (!res.ok) {
                const errText = await res.text();
                throw new Error('合铸 API 请求失败: ' + (res.status) + ' ' + errText);
            }
            const data = await res.json();
            const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
                ? data.candidates[0].content.parts[0].text
                : '';
            let parsed;
            try {
                const raw = text.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, '$1').trim();
                parsed = JSON.parse(raw);
            } catch (e) {
                return localFuse(eqA, eqB);
            }
            const baseStats = parsed.baseStats || {};
            const defaultStats = { attack: 0, critRate: 0, critDamage: 0, health: 0, defense: 0, dodge: 0, attackSpeed: 0, moveSpeed: 0 };
            Object.keys(defaultStats).forEach(k => { if (baseStats[k] === undefined) baseStats[k] = defaultStats[k]; });
            return {
                name: String(parsed.name || '合铸装备').trim(),
                traitId: String(parsed.traitId || 'fusion_unknown').trim(),
                traitDescription: String(parsed.traitDescription || '').trim(),
                baseStats: baseStats
            };
        }
    };
})();
