/**
 * 静态图标运行时抠图（黑/白/边缘主色 flood-fill → 透明）
 */
(function () {
    'use strict';

    const DARK_KEY = 32;
    const LIGHT_KEY = 248;
    const EDGE_COLOR_TOL = 28;

    const ICON_URL_PATTERNS = [
        '/equipment/',
        '/skill_icons/',
        '/icons/classes/',
        '/auto_battler/skills/',
        '/auto_battler/nodes/',
        '/auto_battler/relics/',
        '/buff_icons/',
        '/potion_icons/'
    ];

    function idx(w, x, y) {
        return y * w + x;
    }

    function pixelAt(data, w, x, y) {
        const i = idx(w, x, y) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    }

    function isDarkBg(r, g, b, darkKey) {
        return r <= darkKey && g <= darkKey && b <= darkKey;
    }

    function isLightBg(r, g, b, lightKey) {
        return r >= lightKey && g >= lightKey && b >= lightKey;
    }

    function isNearColor(r, g, b, tr, tg, tb, tol) {
        return Math.abs(r - tr) <= tol && Math.abs(g - tg) <= tol && Math.abs(b - tb) <= tol;
    }

    function isIconAssetUrl(url) {
        if (!url) return false;
        const u = String(url).toLowerCase();
        return ICON_URL_PATTERNS.some((p) => u.includes(p));
    }

    function sampleEdgeDominantColor(data, w, h) {
        const counts = new Map();
        function sample(x, y) {
            const p = pixelAt(data, w, x, y);
            if (p[3] < 128) return;
            const qr = p[0] >> 4;
            const qg = p[1] >> 4;
            const qb = p[2] >> 4;
            const key = (qr << 12) | (qg << 6) | qb;
            const prev = counts.get(key);
            if (prev) prev.n++;
            else counts.set(key, { n: 1, r: p[0], g: p[1], b: p[2] });
        }
        for (let x = 0; x < w; x++) {
            sample(x, 0);
            sample(x, h - 1);
        }
        for (let y = 0; y < h; y++) {
            sample(0, y);
            sample(w - 1, y);
        }
        let best = null;
        counts.forEach((v) => {
            if (!best || v.n > best.n) best = v;
        });
        return best ? [best.r, best.g, best.b] : null;
    }

    function isBgPixel(r, g, b, options, edgeColor) {
        const darkKey = (options && options.darkKey != null) ? options.darkKey : DARK_KEY;
        const lightKey = (options && options.lightKey != null) ? options.lightKey : LIGHT_KEY;
        if (isDarkBg(r, g, b, darkKey) || isLightBg(r, g, b, lightKey)) return true;
        if (options && options.force && edgeColor) {
            return isNearColor(r, g, b, edgeColor[0], edgeColor[1], edgeColor[2], EDGE_COLOR_TOL);
        }
        return false;
    }

    function needsBackgroundRemoval(imageData, w, h, options, edgeColor) {
        const data = imageData.data;
        const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
        for (let c = 0; c < corners.length; c++) {
            const x = corners[c][0];
            const y = corners[c][1];
            const p = pixelAt(data, w, x, y);
            if (p[3] > 16 && isBgPixel(p[0], p[1], p[2], options, edgeColor)) {
                return true;
            }
        }
        if (options && options.force && edgeColor) return true;
        return false;
    }

    function removeBackgroundFromImageData(imageData, w, h, options, edgeColor) {
        const data = imageData.data;
        const visited = new Uint8Array(w * h);
        const queue = new Int32Array(w * h * 2);
        let qHead = 0;
        let qTail = 0;

        function isBg(x, y) {
            const p = pixelAt(data, w, x, y);
            return isBgPixel(p[0], p[1], p[2], options, edgeColor);
        }

        function enqueue(x, y) {
            const id = idx(w, x, y);
            if (visited[id] || !isBg(x, y)) return;
            visited[id] = 1;
            queue[qTail++] = x;
            queue[qTail++] = y;
        }

        for (let x = 0; x < w; x++) {
            enqueue(x, 0);
            enqueue(x, h - 1);
        }
        for (let y = 0; y < h; y++) {
            enqueue(0, y);
            enqueue(w - 1, y);
        }

        while (qHead < qTail) {
            const x = queue[qHead++];
            const y = queue[qHead++];
            const i = idx(w, x, y) * 4;
            data[i + 3] = 0;
            if (x > 0) enqueue(x - 1, y);
            if (x < w - 1) enqueue(x + 1, y);
            if (y > 0) enqueue(x, y - 1);
            if (y < h - 1) enqueue(x, y + 1);
        }

        return imageData;
    }

    function getProcessOptionsForUrl(url) {
        return {
            force: isIconAssetUrl(url),
            url: url
        };
    }

    function processImage(img, options) {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) return null;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        let imageData = ctx.getImageData(0, 0, w, h);
        const edgeColor = sampleEdgeDominantColor(imageData.data, w, h);
        const force = !!(options && options.force);

        if (!force && !needsBackgroundRemoval(imageData, w, h, options, edgeColor)) {
            return { canvas: canvas, dataUrl: canvas.toDataURL('image/png'), skipped: true };
        }

        imageData = removeBackgroundFromImageData(imageData, w, h, options, edgeColor);
        ctx.putImageData(imageData, 0, 0);
        return { canvas: canvas, dataUrl: canvas.toDataURL('image/png'), skipped: false };
    }

    function loadImageFromDataUrl(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    async function processImageElement(img, options) {
        if (!img) return null;
        try {
            const result = processImage(img, options);
            if (!result || result.skipped) return img;
            const out = await loadImageFromDataUrl(result.dataUrl);
            return out || img;
        } catch (e) {
            console.warn('StaticArtProcessor: 抠图失败', e);
            return img;
        }
    }

    async function processImageUrl(url, options) {
        if (!url) return null;
        const opts = options || getProcessOptionsForUrl(url);
        const img = await new Promise((resolve) => {
            const el = new Image();
            el.crossOrigin = 'anonymous';
            el.onload = () => resolve(el);
            el.onerror = () => resolve(null);
            el.src = url;
        });
        if (!img) return null;
        const result = processImage(img, opts);
        if (!result || !result.dataUrl || result.skipped) return url;
        return result.dataUrl;
    }

    function resolveDisplayIconUrl(url) {
        if (!url) return '';
        const am = window.game && window.game.assetManager;
        if (am && typeof am.getCachedDisplayUrl === 'function') {
            return am.getCachedDisplayUrl(url) || url;
        }
        return url;
    }

    window.StaticArtProcessor = {
        DARK_KEY,
        LIGHT_KEY,
        EDGE_COLOR_TOL,
        ICON_URL_PATTERNS,
        isIconAssetUrl,
        getProcessOptionsForUrl,
        needsBackgroundRemoval,
        removeBackgroundFromImageData,
        processImage,
        processImageElement,
        processImageUrl,
        resolveDisplayIconUrl
    };
})();
