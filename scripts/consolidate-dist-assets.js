/**
 * 将 dist / dist1 / dist2 / dist3 根目录下的 PNG 按 config 映射移动到 asset/，
 * 并在装备相关子目录内按内容（MD5）去重，更新 config 与 deployment 下的 mappings.json。
 *
 * 用法: node scripts/consolidate-dist-assets.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ASSET = path.join(ROOT, 'asset');
const DIST_DIRS = ['dist', 'dist1', 'dist2', 'dist3'].map((d) => path.join(ROOT, d));
const MAPPINGS_PATHS = [
  path.join(ROOT, 'config', 'mappings.json'),
  path.join(ROOT, 'deployment', 'config', 'mappings.json'),
];

const EQUIP_SUBDIRS = [
  'weapons',
  'helmets',
  'chests',
  'legs',
  'boots',
  'necklaces',
  'rings',
  'belts',
  'deep_equipment',
];

function md5File(filePath) {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
}

function collectPngStrings(obj, out) {
  if (obj == null) return;
  if (typeof obj === 'string' && obj.endsWith('.png')) {
    out.push(obj);
    return;
  }
  if (typeof obj !== 'object') return;
  for (const v of Object.values(obj)) collectPngStrings(v, out);
}

function buildLookup() {
  const mappings = JSON.parse(fs.readFileSync(MAPPINGS_PATHS[0], 'utf8'));
  const buff = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'buff-icon-config.json'), 'utf8'));
  const potion = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'potion-icon-config.json'), 'utf8'));

  /** @type {Map<string, string>} basename -> relative path under asset */
  const byBasename = new Map();
  const pngs = [];
  collectPngStrings(mappings, pngs);
  for (const rel of pngs) {
    const bn = path.posix.basename(rel);
    byBasename.set(bn, rel.replace(/\\/g, '/'));
  }

  const buffMap = buff.BUFF_ICON_MAP || {};
  for (const rel of Object.values(buffMap)) {
    if (typeof rel === 'string' && rel.endsWith('.png')) {
      byBasename.set(path.posix.basename(rel), rel.replace(/\\/g, '/'));
    }
  }

  const potMap = potion.POTION_ICON_MAP || {};
  for (const [name, rel] of Object.entries(potMap)) {
    if (typeof rel === 'string' && rel.endsWith('.png')) {
      byBasename.set(path.posix.basename(rel), rel.replace(/\\/g, '/'));
    }
  }

  /** 装备中文名.png -> 目标相对路径 */
  const byEquipmentChinese = new Map();
  const eq = mappings.equipment || {};
  for (const [zhName, rel] of Object.entries(eq)) {
    if (typeof rel === 'string' && rel.endsWith('.png')) {
      byEquipmentChinese.set(`${zhName}.png`, rel.replace(/\\/g, '/'));
    }
  }

  /** 炼金材料中文名.png */
  const byAlchemyChinese = new Map();
  const alch = mappings.alchemy_material || {};
  for (const [zhName, rel] of Object.entries(alch)) {
    if (typeof rel === 'string' && rel.endsWith('.png')) {
      byAlchemyChinese.set(`${zhName}.png`, rel.replace(/\\/g, '/'));
    }
  }

  /** 技能图标：技能名.png -> 路径（与 equipment 类似，dist 里可能是中文名） */
  const bySkillChinese = new Map();
  const sk = mappings.skill_icons || {};
  for (const [skillName, rel] of Object.entries(sk)) {
    if (typeof rel === 'string' && rel.endsWith('.png')) {
      bySkillChinese.set(`${skillName}.png`, rel.replace(/\\/g, '/'));
    }
  }

  return { byBasename, byEquipmentChinese, byAlchemyChinese, bySkillChinese };
}

function resolveDest(basename, lookup) {
  return (
    lookup.byEquipmentChinese.get(basename) ||
    lookup.byAlchemyChinese.get(basename) ||
    lookup.bySkillChinese.get(basename) ||
    lookup.byBasename.get(basename) ||
    null
  );
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function moveIntoAsset(srcFile, destRel, log) {
  const destRelN = destRel.replace(/\\/g, '/');
  const destAbs = path.join(ASSET, ...destRelN.split('/'));

  ensureDir(path.dirname(destAbs));

  if (!fs.existsSync(srcFile)) return;

  if (!fs.existsSync(destAbs)) {
    fs.copyFileSync(srcFile, destAbs);
    fs.unlinkSync(srcFile);
    log.moved.push({ from: srcFile, to: destRelN });
    return;
  }

  const hSrc = md5File(srcFile);
  const hDst = md5File(destAbs);
  if (hSrc === hDst) {
    fs.unlinkSync(srcFile);
    log.dedupSkipped.push({ file: srcFile, reason: 'same as asset' });
    return;
  }

  fs.copyFileSync(srcFile, destAbs);
  fs.unlinkSync(srcFile);
  log.overwritten.push({ from: srcFile, to: destRelN });
}

/** 与 asset 根目录文件名一致的资源（地砖/怪物/boss 等），映射中未逐项列出时落到 asset 根目录 */
function fallbackRootAssetName(basename) {
  if (!basename.toLowerCase().endsWith('.png')) return null;
  if (/^(tile_|monster_|boss_)/i.test(basename)) return basename;
  return null;
}

function phaseMoveFromDist() {
  const lookup = buildLookup();
  const log = { moved: [], overwritten: [], dedupSkipped: [], unmapped: [] };

  for (const distRoot of DIST_DIRS) {
    if (!fs.existsSync(distRoot)) continue;
    const entries = fs.readdirSync(distRoot);
    for (const name of entries) {
      if (!name.toLowerCase().endsWith('.png')) continue;
      const full = path.join(distRoot, name);
      if (!fs.statSync(full).isFile()) continue;

      const destRel = resolveDest(name, lookup) || fallbackRootAssetName(name);
      if (!destRel) {
        log.unmapped.push(full);
        continue;
      }
      moveIntoAsset(full, destRel, log);
    }
  }

  return log;
}

function countPathRefsInMappings(mappingsObj, targetPath) {
  let n = 0;
  function walk(o) {
    if (o == null) return;
    if (typeof o === 'string') {
      if (o === targetPath) n++;
      return;
    }
    if (typeof o !== 'object') return;
    for (const v of Object.values(o)) walk(v);
  }
  walk(mappingsObj);
  return n;
}

function loadAllMappings() {
  return MAPPINGS_PATHS.map((p) => ({
    path: p,
    data: JSON.parse(fs.readFileSync(p, 'utf8')),
  }));
}

function deepReplaceString(obj, from, to) {
  if (obj == null) return;
  if (typeof obj === 'string') {
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'string' && obj[i] === from) obj[i] = to;
      else deepReplaceString(obj[i], from, to);
    }
    return;
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === 'string' && v === from) obj[k] = to;
      else deepReplaceString(v, from, to);
    }
  }
}

function phaseDedupeEquipmentImages() {
  const hashToPaths = new Map();

  for (const sub of EQUIP_SUBDIRS) {
    const dir = path.join(ASSET, sub);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'));
    for (const f of files) {
      const abs = path.join(dir, f);
      const rel = `${sub}/${f}`.replace(/\\/g, '/');
      const h = md5File(abs);
      if (!hashToPaths.has(h)) hashToPaths.set(h, []);
      hashToPaths.get(h).push(rel);
    }
  }

  const copies = loadAllMappings();
  const primary = copies[0].data;

  const log = { merged: [], deleted: [] };

  for (const [h, paths] of hashToPaths) {
    if (paths.length < 2) continue;

    paths.sort();
    let keeper = paths[0];
    let bestRefs = countPathRefsInMappings(primary, keeper);
    for (const p of paths.slice(1)) {
      const r = countPathRefsInMappings(primary, p);
      if (r > bestRefs) {
        bestRefs = r;
        keeper = p;
      } else if (r === bestRefs && p < keeper) {
        keeper = p;
      }
    }

    for (const p of paths) {
      if (p === keeper) continue;
      for (const { data } of copies) {
        deepReplaceString(data, p, keeper);
      }
      const abs = path.join(ASSET, ...p.split('/'));
      if (fs.existsSync(abs)) {
        fs.unlinkSync(abs);
        log.deleted.push(p);
      }
      log.merged.push({ hash: h.slice(0, 8), removed: p, keeper });
    }
  }

  for (const { path: filePath, data } of copies) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  return log;
}

function main() {
  console.log('Phase 1: move PNG from dist* -> asset');
  const mlog = phaseMoveFromDist();
  console.log('  moved:', mlog.moved.length);
  console.log('  overwritten (asset updated):', mlog.overwritten.length);
  console.log('  removed dist duplicate (same hash as asset):', mlog.dedupSkipped.length);
  console.log('  unmapped (left in dist):', mlog.unmapped.length);
  if (mlog.unmapped.length && mlog.unmapped.length <= 30) {
    mlog.unmapped.forEach((f) => console.log('    ', f));
  } else if (mlog.unmapped.length) {
    console.log('    (first 15)');
    mlog.unmapped.slice(0, 15).forEach((f) => console.log('    ', f));
  }

  console.log('Phase 2: dedupe equipment images by MD5 under asset');
  const dlog = phaseDedupeEquipmentImages();
  console.log('  duplicate groups merged:', dlog.merged.length);
  if (dlog.merged.length) {
    dlog.merged.slice(0, 20).forEach((x) => console.log('   ', x.removed, '->', x.keeper));
    if (dlog.merged.length > 20) console.log('   ...');
  }

  console.log('Done.');
}

main();
