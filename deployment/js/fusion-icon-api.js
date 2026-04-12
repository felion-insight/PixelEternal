/**
 * 合铸成功后：调用与 tools/art_generator 相同的 OpenAI 兼容 Chat + Imagen 接口，
 * 生成与原材料装备名称、词条及新装备名有关联的装备贴图，写入 AssetManager 并持久化。
 * 规划/生图任一步失败时按指数退避自动重试直至成功（可选 CONFIG.HEZHU_FUSION_ICON_RETRY_INITIAL_MS / _MAX_MS）。
 */
(function () {
    'use strict';

    const EXPORT_SIZE = 68;
    const CHROMA_THRESHOLD = 10;
    const CHAT_MODEL = (typeof CONFIG !== 'undefined' && CONFIG.HEZHU_FUSION_ICON_CHAT_MODEL) ? CONFIG.HEZHU_FUSION_ICON_CHAT_MODEL : 'gpt-4o-mini';
    const IMAGE_MODEL = (typeof CONFIG !== 'undefined' && CONFIG.HEZHU_FUSION_ICON_IMAGE_MODEL) ? CONFIG.HEZHU_FUSION_ICON_IMAGE_MODEL : 'imagen-4.0-ultra-generate-001';

    function fusionIconRetryInitialMs() {
        const v = typeof CONFIG !== 'undefined' ? CONFIG.HEZHU_FUSION_ICON_RETRY_INITIAL_MS : null;
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : 3000;
    }

    function fusionIconRetryMaxMs() {
        const v = typeof CONFIG !== 'undefined' ? CONFIG.HEZHU_FUSION_ICON_RETRY_MAX_MS : null;
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : 90000;
    }

    function sleepMs(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    const STYLE_SUFFIX_BY_SLOT = {
        weapon: 'single weapon centered in frame, inventory item still-life, static pose, no action scene',
        helmet: 'single helmet centered in frame, inventory item still-life, static pose',
        chest: 'single chest armor centered in frame, inventory item still-life, static pose',
        legs: 'single leg armor piece centered in frame, inventory item still-life, static pose',
        boots: 'single boots centered in frame, inventory item still-life, static pose',
        necklace: 'single necklace or pendant centered in frame, inventory item still-life, static pose',
        ring: 'single ring centered in frame, inventory item still-life, static pose',
        belt: 'single belt centered in frame, inventory item still-life, static pose'
    };

    function styleTemplate(slot) {
        const mid = STYLE_SUFFIX_BY_SLOT[slot] || 'single equipment item centered in frame, inventory item still-life, static pose';
        return (
            'Pixel art equipment icon, retro 16-bit style, ultra-detailed pixel clusters, ' + mid + ', ' +
            'solid pure black background (#000000) flat uniform behind the subject only, no text, no watermark, no decorative border, no UI frame, ' +
            'minimalistic, razor-sharp pixel edges, no anti-aliasing, no photorealism, no 3D render look'
        );
    }

    const NEGATIVE = (
        'photorealistic, realistic photo, photograph, 3d render, octane render, unreal engine, cinematic lighting, ' +
        'vector illustration, smooth gradients, oil painting, watercolor, sketch, anime screenshot, ' +
        'watermarks, text, letters, multiple items, character holding item, full body, busy background, ' +
        'motion blur, explosion, battlefield scene'
    );

    function apiBase() {
        const b = (typeof CONFIG !== 'undefined' && CONFIG.HEZHU_API_BASE) ? String(CONFIG.HEZHU_API_BASE) : 'http://35.220.164.252:3888';
        return b.replace(/\/+$/, '');
    }

    function imageApiKey() {
        if (typeof CONFIG === 'undefined') return '';
        return (CONFIG.HEZHU_FUSION_ICON_API_KEY && String(CONFIG.HEZHU_FUSION_ICON_API_KEY).trim()) ||
            (CONFIG.HEZHU_ART_API_KEY && String(CONFIG.HEZHU_ART_API_KEY).trim()) || '';
    }

    /** 单件装备身份（与合铸是否成功时的校验字段一致：部位、名、词条 id、武器近战/远程、品质） */
    function equipmentSideKey(eq) {
        const slot = String(eq && eq.slot != null ? eq.slot : '');
        const name = String(eq && eq.name != null ? eq.name : '');
        const tid = (eq && eq.equipmentTraits && eq.equipmentTraits.id != null) ? String(eq.equipmentTraits.id) : '';
        const qt = String(eq && eq.quality != null ? eq.quality : '');
        const wt = (slot === 'weapon') ? String(eq && eq.weaponType != null ? eq.weaponType : '') : '';
        return slot + '<::>' + name + '<::>' + tid + '<::>' + wt + '<::>' + qt;
    }

    /** 原材料 A+B 的稳定键（顺序无关），用于同一存档内复用合铸贴图 */
    function computeFusionPairKey(eqA, eqB) {
        const a = equipmentSideKey(eqA);
        const b = equipmentSideKey(eqB);
        return (a < b) ? (a + '<<||>>' + b) : (b + '<<||>>' + a);
    }

    function buildPlanPrompt(newName, eqA, eqB, slot, quality, traitDescription) {
        const descA = (eqA.equipmentTraits && eqA.equipmentTraits.description) ? eqA.equipmentTraits.description : '';
        const descB = (eqB.equipmentTraits && eqB.equipmentTraits.description) ? eqB.equipmentTraits.description : '';
        return (
            '你是 Pixel Eternal 像素风 RPG 的装备图标规划助手。合铸得到一件新装备，需要英文「静物主体描述」供图像模型使用。\n\n' +
            '【新装备中文名】' + newName + '\n（请把名称的字面意境译成英文造型语言写入 subject，不要在画面里出现汉字。）\n\n' +
            '【部位 slot】' + slot + ' 【品质】' + quality + '\n\n' +
            '【原材料 A】名称：' + (eqA.name || '') + '；词条：' + descA + '\n' +
            '【原材料 B】名称：' + (eqB.name || '') + '；词条：' + descB + '\n\n' +
            '【新装备词条说明】' + (traitDescription || '') + '\n\n' +
            '要求：subject 仅描述一件静物的造型、材质、纹饰与配色，必须视觉融合两件原材料的名称意象与词条主题（例如冰霜+火焰可用双色水晶镶边、霜纹与余烬刻痕并存）。\n' +
            '禁止在 subject 中写 pixel art、background、lighting、3d、photo、cinematic、style 等渲染词。\n\n' +
            '只输出一个 JSON 对象，不要 markdown：\n{"subject":"英文名词短语与材质描述，一句到三句"}'
        );
    }

    /** OpenAI 兼容：message.content 可能是 string 或 content-part 数组 */
    function normalizeAssistantText(message) {
        if (!message || message.content == null) return '';
        const c = message.content;
        if (typeof c === 'string') return c.trim();
        if (Array.isArray(c)) {
            const parts = [];
            for (let i = 0; i < c.length; i++) {
                const part = c[i];
                if (typeof part === 'string') parts.push(part);
                else if (part && typeof part.text === 'string') parts.push(part.text);
            }
            return parts.join('').trim();
        }
        return String(c).trim();
    }

    /** 从 /v1/chat/completions 或部分网关返回的类 Gemini 结构中取出助手文本 */
    function extractPlanTextFromChatResponse(data) {
        if (!data || typeof data !== 'object') return '';
        const ch0 = data.choices && data.choices[0];
        if (ch0 && ch0.message) {
            return normalizeAssistantText(ch0.message);
        }
        const cand = data.candidates && data.candidates[0];
        if (cand && cand.content) {
            const cc = cand.content;
            if (typeof cc === 'string') return cc.trim();
            if (Array.isArray(cc.parts)) {
                let t = '';
                for (let j = 0; j < cc.parts.length; j++) {
                    const p = cc.parts[j];
                    if (p && typeof p.text === 'string') t += p.text;
                }
                return t.trim();
            }
        }
        return '';
    }

    /**
     * 从规划模型回复中解析 subject：整段 JSON、截取首个对象、或 "subject":"..." 正则（与 tools/art_generator 思路一致）。
     */
    function parsePlanSubjectFromAssistantText(raw) {
        let s = String(raw || '').trim();
        if (!s) return null;
        if (s.indexOf('```') !== -1) {
            s = s.replace(/^```\w*\s*\n?/m, '').replace(/\n?\s*```\s*$/m, '').trim();
        }
        function subjectFromObject(o) {
            if (!o || typeof o !== 'object') return null;
            const sub = o.subject;
            if (typeof sub !== 'string') return null;
            const t = sub.trim();
            return t || null;
        }
        function tryParseObject(str) {
            if (!str) return null;
            try {
                const o = JSON.parse(str);
                return subjectFromObject(o);
            } catch {
                return null;
            }
        }
        let out = tryParseObject(s);
        if (out) return out;
        const start = s.indexOf('{');
        const end = s.lastIndexOf('}');
        if (start !== -1 && end > start) {
            out = tryParseObject(s.slice(start, end + 1));
            if (out) return out;
        }
        const m = s.match(/"subject"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (m) {
            try {
                const inner = JSON.parse('"' + m[1] + '"');
                if (inner && String(inner).trim()) return String(inner).trim();
            } catch {
                /* ignore */
            }
        }
        if (start === -1 && s.length >= 20 && s.length <= 1200 && /[a-zA-Z]{12,}/.test(s) && s.indexOf('{') === -1) {
            return s.replace(/\s+/g, ' ').trim();
        }
        return null;
    }

    /** 解析网关返回的 JSON/text，便于排查鉴权类错误 */
    function formatFusionUpstreamError(status, rawBody, label) {
        const full = rawBody != null ? String(rawBody) : '';
        let credentialHint = '';
        if (/invalid_grant|account not found|access token|JWT|credentials|unauthorized|401|403/i.test(full)) {
            credentialHint =
                ' ［说明：多为网关用 Bearer 密钥换上游 token 失败——密钥错误/过期、或上游账号已删除；请核对 .env / pe-env.generated.js 中的 PE_ART_API_KEY（及网关文档要求的密钥），或联系 35.220.164.252 网关维护方。］';
        }
        try {
            const o = JSON.parse(full);
            const inner = o && o.error;
            const msg = inner && typeof inner === 'object' && inner.message != null
                ? String(inner.message)
                : (typeof o.message === 'string' ? o.message : '');
            if (msg) return label + ' HTTP ' + status + ': ' + msg.slice(0, 520) + credentialHint;
        } catch (e) {
            /* 非 JSON */
        }
        return label + ' HTTP ' + status + ': ' + full.slice(0, 400) + credentialHint;
    }

    async function chatPlanSubject(prompt, apiKey) {
        const url = apiBase() + '/v1/chat/completions';
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify({
                model: CHAT_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.4
            })
        });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(formatFusionUpstreamError(res.status, t, '合铸贴图规划失败'));
        }
        const data = await res.json();
        if (data.error) {
            const em = data.error.message != null ? String(data.error.message) : JSON.stringify(data.error);
            throw new Error('合铸贴图规划失败: ' + em.slice(0, 220));
        }
        const content = extractPlanTextFromChatResponse(data);
        const subject = parsePlanSubjectFromAssistantText(content);
        if (!subject) {
            const keys = data && typeof data === 'object' ? Object.keys(data).join(',') : '';
            const preview = content ? content.slice(0, 280) : '(空)';
            throw new Error(
                '合铸贴图：规划返回无法解析（需要含 subject 的 JSON）。响应键: ' + keys + '；正文前 280 字: ' + preview
            );
        }
        return subject;
    }

    async function generateImageB64(fullPrompt, apiKey) {
        const url = apiBase() + '/v1/images/generations';
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify({
                model: IMAGE_MODEL,
                prompt: fullPrompt,
                n: 1,
                size: '1024x1024',
                response_format: 'b64_json',
                negative_prompt: NEGATIVE
            })
        });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(formatFusionUpstreamError(res.status, t, '合铸贴图生图失败'));
        }
        const data = await res.json();
        if (!data.data || !data.data[0]) throw new Error('合铸贴图：无图像数据');
        const item = data.data[0];
        if (item.b64_json) return item.b64_json;
        if (item.url) {
            const r2 = await fetch(item.url);
            if (!r2.ok) throw new Error('合铸贴图：下载 url 失败');
            const buf = await r2.arrayBuffer();
            let binary = '';
            const bytes = new Uint8Array(buf);
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        }
        throw new Error('合铸贴图：响应无 b64_json/url');
    }

    function b64ToImageData(b64) {
        const binary = atob(b64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'image/png' });
        return URL.createObjectURL(blob);
    }

    function floodEdgeTransparent(imageData, w, h) {
        const d = imageData.data;
        const thr = CHROMA_THRESHOLD;
        /** 与边缘连通的暗底：纯黑附近 + 低饱和深灰（模型常给 #121212 而非纯黑） */
        function isBg(x, y) {
            const i = (y * w + x) * 4;
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            const M = Math.max(r, g, b);
            const m = Math.min(r, g, b);
            if (r <= thr && g <= thr && b <= thr) return true;
            if (M <= thr + 22 && (M - m) <= 24) return true;
            return false;
        }
        const seen = new Uint8Array(w * h);
        const q = [];
        function tryPush(x, y) {
            if (x < 0 || y < 0 || x >= w || y >= h) return;
            const k = y * w + x;
            if (seen[k]) return;
            if (!isBg(x, y)) return;
            seen[k] = 1;
            q.push(x, y);
        }
        for (let x = 0; x < w; x++) {
            tryPush(x, 0);
            tryPush(x, h - 1);
        }
        for (let y = 0; y < h; y++) {
            tryPush(0, y);
            tryPush(w - 1, y);
        }
        let qi = 0;
        while (qi < q.length) {
            const x = q[qi++];
            const y = q[qi++];
            const i = (y * w + x) * 4;
            d[i + 3] = 0;
            tryPush(x - 1, y);
            tryPush(x + 1, y);
            tryPush(x, y - 1);
            tryPush(x, y + 1);
        }
    }

    function processToDataUrl(b64, slot) {
        return new Promise(function (resolve, reject) {
            const blobUrl = b64ToImageData(b64);
            const img = new Image();
            img.onload = function () {
                try {
                    URL.revokeObjectURL(blobUrl);
                    const canvas = document.createElement('canvas');
                    canvas.width = EXPORT_SIZE;
                    canvas.height = EXPORT_SIZE;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = false;
                    ctx.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
                    ctx.drawImage(img, 0, 0, EXPORT_SIZE, EXPORT_SIZE);
                    const imageData = ctx.getImageData(0, 0, EXPORT_SIZE, EXPORT_SIZE);
                    floodEdgeTransparent(imageData, EXPORT_SIZE, EXPORT_SIZE);
                    ctx.putImageData(imageData, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    URL.revokeObjectURL(blobUrl);
                    reject(e);
                }
            };
            img.onerror = function () {
                URL.revokeObjectURL(blobUrl);
                reject(new Error('合铸贴图：无法解码 PNG'));
            };
            img.src = blobUrl;
        });
    }

    /**
     * 合铸成功后异步生成并注册贴图；API 报错时按指数退避持续重试直至成功。
     * @param {Game} game
     * @param {string} newName
     * @param {Object} eqA
     * @param {Object} eqB
     * @param {{ slot: string, quality: string, traitDescription: string }} meta
     */
    async function requestAndApply(game, newName, eqA, eqB, meta) {
        const pairKey = computeFusionPairKey(eqA, eqB);
        const am = game && game.assetManager;
        if (am && typeof am.getFusionIconDataUrlByPairKey === 'function' && typeof am.registerFusionEquipmentPairAndName === 'function') {
            const cached = am.getFusionIconDataUrlByPairKey(pairKey);
            if (cached) {
                am.registerFusionEquipmentPairAndName(pairKey, newName, cached);
                return;
            }
        }

        if (typeof CONFIG !== 'undefined' && CONFIG.HEZHU_FUSION_ICON_ENABLE === false) return;
        const apiKey = imageApiKey();
        if (!apiKey) {
            console.warn('合铸装备贴图：未配置 HEZHU_FUSION_ICON_API_KEY 或 HEZHU_ART_API_KEY，已跳过生图');
            return;
        }
        const slot = meta.slot || 'weapon';
        const quality = meta.quality || 'rare';
        const traitDescription = meta.traitDescription || '';
        const planPrompt = buildPlanPrompt(newName, eqA, eqB, slot, quality, traitDescription);

        let delay = fusionIconRetryInitialMs();
        const delayCap = fusionIconRetryMaxMs();
        for (let attempt = 1; ; attempt++) {
            try {
                const subject = await chatPlanSubject(planPrompt, apiKey);
                const fullPrompt = subject + '. ' + styleTemplate(slot);
                const b64 = await generateImageB64(fullPrompt, apiKey);
                const dataUrl = await processToDataUrl(b64, slot);
                if (am && typeof am.registerFusionEquipmentPairAndName === 'function') {
                    am.registerFusionEquipmentPairAndName(pairKey, newName, dataUrl);
                }
                if (attempt > 1) {
                    console.log('合铸贴图：第 ' + attempt + ' 次尝试后已成功生成');
                }
                return;
            } catch (err) {
                console.warn(
                    '合铸贴图第 ' + attempt + ' 次失败，约 ' + Math.round(delay / 1000) + ' 秒后重试（直至成功）',
                    err && err.message ? err.message : err
                );
                await sleepMs(delay);
                delay = Math.min(delayCap, Math.max(delay + 1000, Math.floor(delay * 1.45)));
            }
        }
    }

    window.FusionIconAPI = {
        requestAndApply: requestAndApply,
        computeFusionPairKey: computeFusionPairKey
    };
})();
