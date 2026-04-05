/**
 * 从 config/set-deep-config.json 重写 docs/equipment-overview.md 中「## 套装效果（深阶）」及以下全文。
 * 运行: node tools/sync_equipment_overview_deep_sets.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const overviewPath = path.join(root, 'docs', 'equipment-overview.md');
const setDeepPath = path.join(root, 'config', 'set-deep-config.json');

const t = fs.readFileSync(overviewPath, 'utf8');
const marker = '## 套装效果（深阶）';
const idx = t.indexOf(marker);
if (idx < 0) throw new Error('未找到章节标题: ' + marker);
const head = t.slice(0, idx);

const j = JSON.parse(fs.readFileSync(setDeepPath, 'utf8'));
const defs = j.SET_DEEP_DEFINITIONS;
const levels = [25, 30, 35, 40, 45, 50, 55, 60];
const qs = ['common', 'rare', 'fine', 'epic', 'legendary'];

let sec = `${marker}\n\n`;
sec +=
  '配置源：`config/set-deep-config.json`（加载时并入全局 `SET_DEFINITIONS`，与常规套装共用同一套结算逻辑）。\n\n';
sec +=
  '深阶共 **40 套**（8 个等级主题 × 5 档品质）。**2/6 件** 以基础数值为主；**4 件** 首次引入该档机制（多为 8 件的简化子集）；**8 件** 在「全属性%」之上强化同一机制（例如 **终焉·传说**：4 件为击杀回血，8 件为更高击杀回血并附加战斗中每秒回复）。具体文案与参数以 JSON 为准。\n\n';
sec += '| 主题 | 代表等级 | 套装 ID 前缀 |\n|------|----------|----------------|\n';
sec += '| 渊隙 | Lv.25 | `deep_25_` |\n';
sec += '| 虚印 | Lv.30 | `deep_30_` |\n';
sec += '| 腐噬 | Lv.35 | `deep_35_` |\n';
sec += '| 黑曜 | Lv.40 | `deep_40_` |\n';
sec += '| 终幕 | Lv.45 | `deep_45_` |\n';
sec += '| 星骸 | Lv.50 | `deep_50_` |\n';
sec += '| 裂点 | Lv.55 | `deep_55_` |\n';
sec += '| 终焉 | Lv.60 | `deep_60_` |\n';
sec +=
  '\n品质后缀：`common` 普通 · `rare` 稀有 · `fine` 精良 · `epic` 史诗 · `legendary` 传说。\n\n';

for (const lv of levels) {
  for (const q of qs) {
    const k = `deep_${lv}_${q}`;
    const s = defs[k];
    if (!s) throw new Error('缺少套装: ' + k);
    sec += `### ${s.name}（\`${k}\`）\n\n`;
    sec += `**散件：** ${s.pieces.join('、')}\n\n`;
    for (const pc of [2, 4, 6, 8]) {
      const e = s.effects[String(pc)];
      let extra = '';
      if (pc === 8) {
        const keys = Object.keys(e).filter((x) => x !== 'description' && x !== 'stats');
        if (keys.length) {
          extra =
            '\n  - 机制参数：`' +
            keys.map((key) => `${key}=${JSON.stringify(e[key])}`).join('`，`') +
            '`';
        }
      }
      sec += `- **${pc} 件：** ${e.description}${extra}\n`;
    }
    sec += '\n';
  }
}

fs.writeFileSync(overviewPath, head + sec, 'utf8');
console.log('Updated', overviewPath);
