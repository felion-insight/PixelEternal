/**
 * Pixel Eternal - 安全工具（HTML 转义、JSON 安全解析、存档完整性校验）
 */
(function () {
    'use strict';

    const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

    /**
     * 转义 HTML 特殊字符，防止 innerHTML 注入 XSS
     * @param {*} value
     * @returns {string}
     */
    function escapeHtml(value) {
        if (value == null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 递归克隆对象，过滤原型链污染键
     * @param {*} input
     * @returns {*}
     */
    function safeCloneJson(input) {
        if (input === null || typeof input !== 'object') return input;
        if (Array.isArray(input)) return input.map(safeCloneJson);
        const out = Object.create(null);
        for (const key of Object.keys(input)) {
            if (DANGEROUS_KEYS.has(key)) continue;
            out[key] = safeCloneJson(input[key]);
        }
        return out;
    }

    /**
     * FNV-1a 32-bit 哈希（用于存档完整性校验，非加密）
     * @param {string} str
     * @returns {string}
     */
    function fnv1aHash(str) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    const SAVE_INTEGRITY_KEY = '_integrity';
    const SAVE_INTEGRITY_SALT = 'pe-save-v1';

    /**
     * 计算存档完整性哈希
     * @param {Object} saveData
     * @returns {string}
     */
    function computeSaveIntegrity(saveData) {
        const clone = JSON.parse(JSON.stringify(saveData));
        delete clone[SAVE_INTEGRITY_KEY];
        delete clone.timestamp;
        return fnv1aHash(SAVE_INTEGRITY_SALT + JSON.stringify(clone));
    }

    /**
     * 为存档对象附加完整性字段
     * @param {Object} saveData
     * @returns {Object}
     */
    function attachSaveIntegrity(saveData) {
        const data = JSON.parse(JSON.stringify(saveData));
        data[SAVE_INTEGRITY_KEY] = computeSaveIntegrity(data);
        return data;
    }

    /**
     * 验证并剥离完整性字段；旧版无存档校验字段时直接返回
     * @param {Object} saveData
     * @returns {{ ok: boolean, data: Object, tampered: boolean }}
     */
    function verifySaveIntegrity(saveData) {
        if (!saveData || typeof saveData !== 'object') {
            return { ok: false, data: saveData, tampered: false };
        }
        const stored = saveData[SAVE_INTEGRITY_KEY];
        if (!stored) {
            const legacy = JSON.parse(JSON.stringify(saveData));
            delete legacy[SAVE_INTEGRITY_KEY];
            return { ok: true, data: legacy, tampered: false };
        }
        const expected = computeSaveIntegrity(saveData);
        const clean = JSON.parse(JSON.stringify(saveData));
        delete clean[SAVE_INTEGRITY_KEY];
        if (expected !== stored) {
            return { ok: false, data: clean, tampered: true };
        }
        return { ok: true, data: clean, tampered: false };
    }

    window.escapeHtml = escapeHtml;
    window.peSafeCloneJson = safeCloneJson;
    window.peAttachSaveIntegrity = attachSaveIntegrity;
    window.peVerifySaveIntegrity = verifySaveIntegrity;
})();
