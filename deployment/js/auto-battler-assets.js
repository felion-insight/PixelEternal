/**
 * 自走棋模式 — 预加载并绘制 auto_battler 精灵
 */
(function () {
    'use strict';

    const cache = new Map();
    let loadPromise = null;

    function loadImage(url) {
        if (!url) return Promise.resolve(null);
        if (cache.has(url)) {
            const c = cache.get(url);
            return c instanceof HTMLImageElement ? Promise.resolve(c) : c;
        }
        const p = new Promise((resolve) => {
            const img = new Image();
            img.onload = async () => {
                let finalImg = img;
                if (window.StaticArtProcessor) {
                    const opts = window.StaticArtProcessor.getProcessOptionsForUrl
                        ? window.StaticArtProcessor.getProcessOptionsForUrl(url)
                        : null;
                    const processed = await window.StaticArtProcessor.processImageElement(img, opts);
                    if (processed) finalImg = processed;
                }
                cache.set(url, finalImg);
                resolve(finalImg);
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

    function cfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||
            window.AUTO_BATTLER_CONFIG || {};
    }

    function ensureLoaded() {
        if (loadPromise) return loadPromise;
        const SAP = window.StaticArtPaths;
        if (!SAP) return Promise.resolve();

        const urls = new Set();
        (cfg().partyOrder || ['warrior', 'archer', 'mage', 'assassin']).forEach((cls) => {
            urls.add(SAP.getAutoBattlerHeroUrl(cls));
        });
        (cfg().enemyTemplates || []).forEach((t) => {
            if (t.id) urls.add(SAP.getAutoBattlerEnemyUrl(t.id));
        });
        ['battle', 'elite', 'rest', 'event', 'shop', 'boss', 'boss_final'].forEach((n) => {
            urls.add(SAP.getAutoBattlerNodeIconUrl(n));
        });
        (cfg().skillPool || []).forEach((s) => {
            if (s.id) urls.add(SAP.getAutoBattlerSkillIconUrl(s.id));
        });
        (cfg().relics || []).forEach((r) => {
            if (r.id) urls.add(SAP.getAutoBattlerRelicIconUrl(r.id));
        });
        if (SAP.getAutoBattlerSceneBgUrl) {
            ['battle', 'shop', 'event'].forEach((k) => {
                urls.add(SAP.getAutoBattlerSceneBgUrl(k));
            });
        }

        loadPromise = Promise.all(Array.from(urls).map(loadImage)).then(() => true);
        return loadPromise;
    }

    function getImage(url) {
        if (!url) return null;
        const v = cache.get(url);
        if (v instanceof HTMLImageElement && v.complete && v.naturalWidth > 0) return v;
        return null;
    }

    function drawSprite(ctx, url, x, y, radius, alpha) {
        const img = getImage(url);
        if (!img) return false;
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih) return false;
        const maxSize = Math.max(radius * 2.2, 32);
        const scale = Math.min(maxSize / iw, maxSize / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        ctx.save();
        ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
        ctx.restore();
        return true;
    }

    function drawHero(ctx, baseClass, x, y, radius, alpha) {
        const SAP = window.StaticArtPaths;
        if (!SAP) return false;
        return drawSprite(ctx, SAP.getAutoBattlerHeroUrl(baseClass), x, y, radius, alpha);
    }

    function drawEnemy(ctx, templateId, x, y, radius, alpha) {
        const SAP = window.StaticArtPaths;
        if (!SAP) return false;
        return drawSprite(ctx, SAP.getAutoBattlerEnemyUrl(templateId), x, y, radius, alpha);
    }

    window.AutoBattlerAssets = {
        ensureLoaded,
        getImage,
        drawSprite,
        drawHero,
        drawEnemy
    };
})();
