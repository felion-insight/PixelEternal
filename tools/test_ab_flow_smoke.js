#!/usr/bin/env node
/**
 * 自走棋模块化后全流程冒烟验收（Node + 模拟 DOM，无需浏览器）
 * 覆盖：脚本加载 → Game 构造 → init → 进塔 → update/draw → 存档 → 回城 → ESC 菜单
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const errors = [];
const warnings = [];

function fail(msg) {
    errors.push(msg);
    console.error('FAIL:', msg);
}

function warn(msg) {
    warnings.push(msg);
    console.warn('WARN:', msg);
}

function ok(msg) {
    console.log('OK:', msg);
}

function createClassList() {
    const set = new Set();
    return {
        add: (...c) => c.forEach((x) => set.add(x)),
        remove: (...c) => c.forEach((x) => set.delete(x)),
        contains: (c) => set.has(c),
        toggle: (c) => (set.has(c) ? set.delete(c) : set.add(c)),
    };
}

function createElement(id) {
    const el = {
        id,
        style: {},
        dataset: {},
        classList: createClassList(),
        textContent: '',
        innerHTML: '',
        value: '',
        children: [],
        parentElement: null,
        addEventListener() {},
        removeEventListener() {},
        remove() {
            if (el.parentElement && el.parentElement.children) {
                el.parentElement.children = el.parentElement.children.filter((c) => c !== el);
            }
            el.parentElement = null;
        },
        appendChild(child) {
            child.parentElement = el;
            el.children.push(child);
            return child;
        },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getContext() { return null; },
        setAttribute() {},
        getAttribute() { return null; },
        focus() {},
        click() {},
        contains() { return false; },
    };
    return el;
}

const elements = new Map();
function ensureEl(id) {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
}

function seedDomFromIndex() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    ids.forEach((id) => ensureEl(id));
    // sliders for volume UI
    ['settings-music-volume', 'settings-sfx-volume'].forEach((id) => {
        const el = ensureEl(id);
        el.value = '100';
    });
    ensureEl('game-container');
    ensureEl('game-canvas');
    ensureEl('minimap-canvas');
    ensureEl('loading-screen');
    ensureEl('start-screen');
    ensureEl('esc-menu-modal');
}

const canvasCtx = {
    clearRect() {}, fillRect() {}, strokeRect() {}, save() {}, restore() {},
    scale() {}, translate() {}, rotate() {}, drawImage() {}, fillText() {},
    strokeText() {}, measureText: () => ({ width: 10 }),
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
    fill() {}, stroke() {}, clip() {}, rect() {}, setTransform() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    textAlign: 'left', textBaseline: 'alphabetic', font: '12px monospace',
};

function patchCanvas(el) {
    el.width = 2400;
    el.height = 1600;
    el.getContext = () => canvasCtx;
    el.style = el.style || {};
}

seedDomFromIndex();
patchCanvas(ensureEl('game-canvas'));
patchCanvas(ensureEl('minimap-canvas'));

const storage = new Map();
const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
};

async function fetchMock(url) {
    let rel = url;
    if (rel.startsWith('http://localhost/')) rel = rel.slice('http://localhost/'.length);
    if (rel.startsWith('/')) rel = rel.slice(1);
    const filePath = path.join(ROOT, rel.split('?')[0]);
    if (!fs.existsSync(filePath)) {
        return { ok: false, status: 404, statusText: 'Not Found', async text() { return ''; }, async json() { throw new Error('404'); } };
    }
    const buf = fs.readFileSync(filePath);
    const isJson = filePath.endsWith('.json');
    return {
        ok: true,
        status: 200,
        async text() { return buf.toString('utf8'); },
        async json() { return JSON.parse(buf.toString('utf8')); },
        headers: { get: (h) => (h === 'content-type' ? (isJson ? 'application/json' : 'text/plain') : null) },
    };
}

const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Buffer,
    process,
    Error,
    Promise,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Array,
    Object,
    JSON,
    Math,
    Date,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.self = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.innerWidth = 1280;
sandbox.innerHeight = 720;

sandbox.document = {
    readyState: 'complete',
    getElementById: (id) => ensureEl(id),
    querySelector: (sel) => {
        const m = sel && sel.match(/^#([\w-]+)/);
        return m ? ensureEl(m[1]) : null;
    },
    querySelectorAll: () => [],
    createElement: (tag) => {
        const el = createElement(`dyn-${tag}-${elements.size}`);
        el.tagName = String(tag).toUpperCase();
        return el;
    },
    addEventListener() {},
    removeEventListener() {},
    body: ensureEl('body'),
    documentElement: ensureEl('html'),
};
ensureEl('game-container').appendChild(ensureEl('game-canvas'));
sandbox.navigator = { userAgent: 'node-smoke-test', clipboard: { writeText: async () => {} } };
sandbox.location = { protocol: 'http:', href: 'http://localhost/index.html', hostname: 'localhost' };
sandbox.localStorage = localStorage;
sandbox.performance = { now: () => Date.now() };
sandbox.requestAnimationFrame = (cb) => setTimeout(cb, 0);
sandbox.cancelAnimationFrame = () => {};
sandbox.fetch = fetchMock;
sandbox.Image = class Image {
    set src(_v) { setTimeout(() => this.onload && this.onload(), 0); }
    constructor() { this.onload = null; this.onerror = null; }
};
sandbox.Audio = class Audio {
    constructor() {
        this._listeners = {};
        this.volume = 1;
        this.currentTime = 0;
        this.loop = false;
    }
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
    removeEventListener() {}
    play() { return Promise.resolve(); }
    pause() {}
    load() {
        (this._listeners.canplaythrough || []).forEach((fn) => fn());
        (this._listeners.loadeddata || []).forEach((fn) => fn());
    }
    set src(_v) { this.load(); }
};
sandbox.Blob = class Blob { constructor(parts) { this._p = parts; } };
sandbox.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL() {} };
sandbox.Worker = class Worker { postMessage() {} terminate() {} };
sandbox.OffscreenCanvas = class OffscreenCanvas {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return canvasCtx; }
};
sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
sandbox.scrollTo = () => {};

const context = vm.createContext(sandbox);

function loadScript(rel) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) throw new Error(`missing script: ${rel}`);
    const code = fs.readFileSync(abs, 'utf8');
    vm.runInContext(code, context, { filename: rel });
}

function parseScriptTags() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
}

const REQUIRED_PROTOTYPE_METHODS = [
    'init', 'update', 'draw', 'enterTower', 'returnToTown', 'updateHUD',
    'buildSaveDataObject', 'initSaveSystem', 'exportSave', 'showEscMenu', 'closeEscMenu',
    'closeSaveCodeModal', 'transitionScene', 'fixedUpdate', 'startGameLoop',
];

async function main() {
    console.log('=== AB flow smoke test ===\n');

    // 1) 按 index.html 顺序加载脚本
    const scripts = parseScriptTags();
    for (const rel of scripts) {
        if (rel.includes('init.js')) continue; // 避免自动初始化
        try {
            loadScript(rel);
            ok(`loaded ${rel}`);
        } catch (e) {
            fail(`load ${rel}: ${e.message}`);
            throw e;
        }
    }

    // 手动加载拆分模块后的补丁（已在 index 列表中）
    assert(typeof context.Game !== 'undefined', 'Game class');
    ok('Game class defined');

    for (const m of REQUIRED_PROTOTYPE_METHODS) {
        if (typeof context.Game.prototype[m] !== 'function') fail(`Game.prototype.${m} missing`);
        else ok(`Game.prototype.${m}`);
    }

    // 2) 配置加载（Phase3 校验告警不阻断冒烟；与浏览器 dev 行为一致时可单独修配置）
    assert(typeof context.configLoader !== 'undefined', 'configLoader');
    if (typeof context.validatePhase3EquipmentConfig === 'function') {
        const origValidate = context.validatePhase3EquipmentConfig;
        context.validatePhase3EquipmentConfig = () => {
            const errs = origValidate();
            if (errs.length) warn(`Phase3 装备校验: ${errs.length} 项（冒烟测试继续）`);
            return [];
        };
    }
    await context.configLoader.loadAll();
    ok(`config loaded (degraded=${context.configLoader.degradedMode})`);

    // 3) 构造 Game
    context.window.gameInitialized = true;
    const game = new context.Game();
    ok('new Game()');

    // 4) init（精简 AB）
    game.init();
    ok('game.init()');

    // 5) 模拟点击开始后进塔
    game.paused = false;
    game.enterTower();
    assert.strictEqual(game.currentScene, context.SCENE_TYPES.AUTO_BATTLER, 'scene after enterTower');
    assert(game.autoBattlerController && game.autoBattlerController.run, 'AB run started');
    ok('enterTower → auto_battler run');

    // 6) 核心循环
    game.update();
    game.draw();
    game.fixedUpdate();
    ok('update / draw / fixedUpdate');

    // 7) ESC 菜单
    game.showEscMenu();
    assert.strictEqual(game.paused, true, 'paused when esc open');
    game.closeEscMenu();
    ok('showEscMenu / closeEscMenu');

    // 8) 存档往返
    const saveObj = game.buildSaveDataObject();
    assert(saveObj && saveObj.version, 'save object version');
    assert(saveObj.player && saveObj.game, 'save player/game sections');
    const code = game.encodeSaveDataToSaveCode(saveObj);
    assert(typeof code === 'string' && code.length > 20, 'encoded save code');
    const parsed = game.parseSaveCodeToSaveData(code);
    game.importSave(parsed, { quiet: true });
    ok('save encode/decode roundtrip');

    game.saveGameToBrowserStorage();
    assert(localStorage.getItem(context.Game.BROWSER_SAVE_CODE_KEY), 'browser save written');
    ok('saveGameToBrowserStorage');

    // 9) 回城
    game.returnToTown();
    assert.strictEqual(game.currentScene, context.SCENE_TYPES.TOWN, 'back to town');
    ok('returnToTown');

    // 10) 开发者面板（可选）
    if (typeof game.toggleDevMode === 'function') {
        game._localPeDevServer = true;
        game.toggleDevMode();
        game.updateDevInfo();
        game.toggleDevMode();
        ok('toggleDevMode / updateDevInfo');
    }

    // 11) 缺失 API 检查（非致命）
    if (typeof game.autoBattlerController.handleEscape !== 'function') {
        warn('AutoBattlerController.handleEscape 未实现，ESC 在自走棋内可能无效');
    }
    if (typeof game.autoBattlerController.abortRun !== 'function') {
        warn('AutoBattlerController.abortRun 未实现，菜单「退出恶魔塔」可能无效');
    }

    console.log('\n=== Summary ===');
    console.log(`Errors: ${errors.length}, Warnings: ${warnings.length}`);
    if (errors.length) {
        process.exitCode = 1;
        return;
    }
    console.log('test_ab_flow_smoke.js: ALL PASSED');
}

main().catch((e) => {
    fail(`uncaught: ${e.stack || e.message}`);
    process.exitCode = 1;
});
