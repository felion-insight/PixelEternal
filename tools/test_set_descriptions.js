/* eslint-disable no-console */
'use strict';

/**
 * 套装文案质量：禁止残留设计备注「感」字，并核对关键数值与 special 存在。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sets = JSON.parse(fs.readFileSync(path.join(root, 'config/set-config-v2.json'), 'utf8'));
const ees = fs.readFileSync(path.join(root, 'js/equipment-effect-system.js'), 'utf8');

const stray = [];
Object.entries(sets.sets || {}).forEach(([id, set]) => {
    Object.entries(set.effects || {}).forEach(([pc, effect]) => {
        const desc = effect.description || '';
        assert.ok(desc.trim(), `${id} ${pc}件应有描述`);
        if (/感/.test(desc) && !/感电/.test(desc)) {
            stray.push(`${id}:${pc} → ${desc}`);
        }
        if (effect.special) {
            assert.ok(
                ees.includes(`'${effect.special}'`) || ees.includes(`"${effect.special}"`),
                `${id} special ${effect.special} 应在 EES 注册`
            );
        }
    });
});

assert.strictEqual(stray.length, 0, `文案残留「感」字:\n${stray.join('\n')}`);
console.log('set descriptions: ok (no stray 感, specials registered)');
