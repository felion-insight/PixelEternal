/**
 * 自走棋房间场景背景（战斗 / 商店 / 事件）— 四边装饰、中央留空
 */
(function () {
    'use strict';

    const SCENE_KEYS = ['battle', 'shop', 'event'];

    const NODE_TO_SCENE = {
        battle: 'battle',
        elite: 'battle',
        boss: 'battle',
        boss_final: 'battle',
        shop: 'shop',
        event: 'event',
        rest: 'event',
        map: 'battle'
    };

    const cache = new Map();
    let loadPromise = null;

    function cfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||
            window.AUTO_BATTLER_CONFIG || {};
    }

    function getSceneKeyForNodeType(nodeType) {
        return NODE_TO_SCENE[nodeType] || 'battle';
    }

    function getSceneUrl(sceneKey) {
        const SAP = window.StaticArtPaths;
        if (!SAP || !sceneKey) return '';
        return SAP.getAutoBattlerSceneBgUrl(sceneKey);
    }

    function loadImage(url) {
        if (!url) return Promise.resolve(null);
        if (cache.has(url)) {
            const c = cache.get(url);
            return c instanceof HTMLImageElement ? Promise.resolve(c) : c;
        }
        const p = new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                cache.set(url, img);
                resolve(img);
            };
            img.onerror = () => {
                cache.set(url, null);
                resolve(null);
            };
            img.src = url;
        });
        cache.set(url, p);
        return p;
    }

    function ensureLoaded() {
        if (loadPromise) return loadPromise;
        const urls = SCENE_KEYS.map(getSceneUrl).filter(Boolean);
        loadPromise = Promise.all(urls.map(loadImage)).then(() => true);
        return loadPromise;
    }

    function ensureScene(sceneKey) {
        return loadImage(getSceneUrl(sceneKey));
    }

    function getImage(sceneKey) {
        const url = getSceneUrl(sceneKey);
        if (!url) return null;
        const v = cache.get(url);
        if (v instanceof HTMLImageElement && v.complete && v.naturalWidth > 0) return v;
        return null;
    }

    function getCssUrl(sceneKey) {
        const SAP = window.StaticArtPaths;
        const raw = getSceneUrl(sceneKey);
        if (!raw || !SAP) return '';
        return SAP.resolveDisplayIconUrl(raw) || raw;
    }

    function sceneBaseColor(sceneKey) {
        const themes = {
            battle: '#121820',
            shop: '#1a1610',
            event: '#14101c'
        };
        return themes[sceneKey] || themes.battle;
    }

    /** 绘制场景背景（cover），可选水平偏移用于卷轴转场 */
    function drawSceneBackground(ctx, sceneKey, w, h, opts) {
        opts = opts || {};
        const img = getImage(sceneKey);
        const offsetX = opts.offsetX || 0;
        const dim = opts.dim != null ? opts.dim : 0.35;
        const base = sceneBaseColor(sceneKey);

        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);

        if (img) {
            const iw = img.naturalWidth;
            const ih = img.naturalHeight;
            const scale = Math.max(w / iw, h / ih);
            const dw = iw * scale;
            const dh = ih * scale;
            const dx = (w - dw) / 2 + offsetX;
            const dy = (h - dh) / 2;
            ctx.drawImage(img, dx, dy, dw, dh);
            if (offsetX < 0 && dx + dw < w) {
                ctx.fillStyle = base;
                ctx.fillRect(dx + dw, 0, w - (dx + dw) + 1, h);
            }
            if (offsetX > 0 && dx > 0) {
                ctx.fillStyle = base;
                ctx.fillRect(0, 0, dx + 1, h);
            }
        } else {
            drawFallbackGradient(ctx, sceneKey, w, h, offsetX);
        }

        if (dim > 0) {
            ctx.fillStyle = 'rgba(8, 10, 16, ' + dim + ')';
            ctx.fillRect(0, 0, w, h);
        }
    }

    function drawFallbackGradient(ctx, sceneKey, w, h, offsetX) {
        offsetX = offsetX || 0;
        const themes = {
            battle: ['#121820', '#10141c', '#140e12'],
            shop: ['#1a1610', '#2a2418', '#120e0a'],
            event: ['#14101c', '#241830', '#0c0a14']
        };
        const c = themes[sceneKey] || themes.battle;
        ctx.save();
        ctx.translate(offsetX, 0);
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, c[0]);
        g.addColorStop(0.55, c[1]);
        g.addColorStop(1, c[2]);
        ctx.fillStyle = g;
        ctx.fillRect(-Math.abs(offsetX), 0, w + Math.abs(offsetX) * 2, h);
        ctx.strokeStyle = 'rgba(212, 180, 90, 0.1)';
        ctx.lineWidth = 2;
        ctx.strokeRect(24, 48, w - 48, h - 96);
        ctx.restore();
    }

    window.AutoBattlerSceneBg = {
        SCENE_KEYS,
        getSceneKeyForNodeType,
        getSceneUrl,
        getCssUrl,
        ensureLoaded,
        ensureScene,
        getImage,
        drawSceneBackground,
        drawFallbackGradient
    };
})();
