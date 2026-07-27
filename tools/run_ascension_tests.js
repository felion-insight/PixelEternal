#!/usr/bin/env node
'use strict';
/**
 * Ascension 回归测试入口：本地 CI / 一键验收
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tests = [
    'tools/test_config_load.js',
    'tools/test_ascension_systems.js',
    'tools/test_ascension_advanced.js',
    'tools/test_skirmish.js',
    'tools/test_rogue_systems.js',
    'tools/test_combat_effects_bridge.js'
];

let failed = 0;
tests.forEach((rel) => {
    const fp = path.join(ROOT, rel);
    process.stdout.write(`\n>> ${rel}\n`);
    const res = spawnSync(process.execPath, [fp], { cwd: ROOT, stdio: 'inherit' });
    if (res.status !== 0) {
        failed += 1;
        console.error(`FAIL: ${rel}`);
    }
});

if (failed) {
    console.error(`\nrun_ascension_tests: ${failed}/${tests.length} failed`);
    process.exit(1);
}
console.log(`\nrun_ascension_tests: all ${tests.length} passed`);
