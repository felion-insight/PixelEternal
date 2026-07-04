#!/usr/bin/env node
/**
 * 将 skill-effect-rules 应用到 config/skill-config.json
 */
const fs = require('fs');
const path = require('path');
const { patchAllSkills } = require('./skill-effect-rules');

const ROOT = path.resolve(__dirname, '..');
const target = path.join(ROOT, 'config', 'skill-config.json');
const deploy = path.join(ROOT, 'deployment', 'config', 'skill-config.json');

const data = JSON.parse(fs.readFileSync(target, 'utf8'));
const n = patchAllSkills(data.skills);
const out = JSON.stringify(data, null, 2);
fs.writeFileSync(target, out, 'utf8');
if (fs.existsSync(path.dirname(deploy))) {
    fs.writeFileSync(deploy, out, 'utf8');
}
console.log(`Patched ${n} skills in ${target}`);
