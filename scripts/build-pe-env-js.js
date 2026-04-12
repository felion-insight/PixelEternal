#!/usr/bin/env node
/**
 * 从项目根目录与 tools/ 下的 .env 读取 API 相关变量，生成浏览器可加载的
 * js/pe-env.generated.js（与 tools/art_generator.py 的加载顺序一致：根目录 .env 优先）。
 *
 * 用法：在项目根执行  node scripts/build-pe-env-js.js
 * 勿将含真实密钥的生成文件提交到 git。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function parseEnvFile(filePath) {
    const out = {};
    if (!fs.existsSync(filePath)) return out;
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch {
        return out;
    }
    for (const line of raw.split(/\r?\n/)) {
        let s = line.trim();
        if (!s || s.startsWith('#')) continue;
        if (s.toLowerCase().startsWith('export ')) s = s.slice(7).trim();
        const eq = s.indexOf('=');
        if (eq <= 0) continue;
        const key = s.slice(0, eq).trim();
        if (!key) continue;
        let val = s.slice(eq + 1).trim();
        if (val.length >= 2 && val[0] === val[val.length - 1] && (val[0] === '"' || val[0] === "'")) {
            val = val.slice(1, -1);
        }
        out[key] = val;
    }
    return out;
}

/** 与 art_generator._load_env_files：先读根 .env，再读 tools/.env（tools 仅补充根中未出现的键） */
function loadMergedEnv() {
    const rootEnv = parseEnvFile(path.join(ROOT, '.env'));
    const toolsEnv = parseEnvFile(path.join(ROOT, 'tools', '.env'));
    const merged = { ...rootEnv };
    for (const k of Object.keys(toolsEnv)) {
        if (!(k in merged)) merged[k] = toolsEnv[k];
    }
    return merged;
}

function buildSecretsObject(env) {
    const get = (k) => (env[k] != null ? String(env[k]).trim() : '');
    const out = {};

    const artKey = get('HEZHU_ART_API_KEY') || get('PE_ART_API_KEY');
    if (artKey) out.HEZHU_ART_API_KEY = artKey;

    const fusionIcon = get('HEZHU_FUSION_ICON_API_KEY') || artKey;
    if (fusionIcon) out.HEZHU_FUSION_ICON_API_KEY = fusionIcon;

    const hezhuApi = get('HEZHU_API_KEY') || get('PE_GEMINI_API_KEY') || artKey;
    if (hezhuApi) out.HEZHU_API_KEY = hezhuApi;

    const base = get('HEZHU_API_BASE') || get('PE_API_BASE');
    if (base) out.HEZHU_API_BASE = base.replace(/\/+$/, '');

    return out;
}

function escapeJsString(s) {
    return JSON.stringify(s);
}

function main() {
    const merged = loadMergedEnv();
    const secrets = buildSecretsObject(merged);
    const lines = Object.keys(secrets).map((k) => `    ${JSON.stringify(k)}: ${escapeJsString(secrets[k])}`);
    const body = [
        '/**',
        ' * 由 scripts/build-pe-env-js.js 从 .env 生成，勿提交真实密钥。',
        ' * 生成：node scripts/build-pe-env-js.js',
        ' */',
        'window.__PE_SECRETS__ = {',
        lines.join(',\n'),
        '};',
        ''
    ].join('\n');

    const outMain = path.join(ROOT, 'js', 'pe-env.generated.js');
    const outDeploy = path.join(ROOT, 'deployment', 'js', 'pe-env.generated.js');
    fs.writeFileSync(outMain, body, 'utf8');
    fs.writeFileSync(outDeploy, body, 'utf8');
    console.log('已写入:', outMain);
    console.log('已写入:', outDeploy);
    if (Object.keys(secrets).length === 0) {
        console.warn('提示: .env 中未找到 HEZHU_* / PE_ART_API_KEY / PE_API_BASE 等变量，生成文件为空对象。');
    }
}

main();
