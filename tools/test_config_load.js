#!/usr/bin/env node
/** 验证 configLoader.loadAll 在 HTTP 模式下是否会因 Phase3 校验抛错 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { console, setTimeout, clearTimeout, Buffer, process, Object, JSON, Math, Date, parseInt, parseFloat, Error, Promise };
sandbox.window = sandbox;
sandbox.location = { protocol: 'http:', href: 'http://localhost/' };
sandbox.fetch = async (url) => {
    let rel = url.replace('http://localhost/', '');
    const fp = path.join(ROOT, rel.split('?')[0]);
    const buf = fs.readFileSync(fp);
    return { ok: true, async json() { return JSON.parse(buf.toString()); }, async text() { return buf.toString(); } };
};
const ctx = vm.createContext(sandbox);
for (const f of ['js/pe-security.js', 'js/config-loader.js', 'js/config.js', 'js/config-helpers.js', 'js/trait-id-helpers.js', 'js/data-classes.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
(async () => {
    try {
        await ctx.configLoader.loadAll();
        console.log('config load: OK');
        process.exit(0);
    } catch (e) {
        console.error('config load: FAIL', e.message);
        process.exit(1);
    }
})();
