# artifacts/

本目录存放**工具脚本生成的测试、平衡与 playtest 报告**，不属于游戏运行时资源。

- 内容可随时删除并通过对应工具重新生成
- 已加入 `.gitignore`（本说明文件除外）
- 请勿将密钥、存档或手工设计文档放在此处

## 常见产出

| 文件模式 | 生成工具 |
|----------|----------|
| `balance_test_report.md`、`balance_*.json` | `python tools/run_balance_tests.py` |
| `equipment_system_test_report.json` | `python tools/run_equipment_system_tests.py` |
| `equipment_lab_audit.json` | `node tools/audit_equipment_lab.js` |
| `static-assets-report.json` | `python tools/generate_all_static_assets.py` |
| `tower_playtest_*.json` / `*.md` | `python tools/run_tower_playtest.py` |
| `tower_branch_*.json` / `tower_wall_*.md` 等 | 手动指定 `--json-output` / `--markdown-output` 的塔图/分支测试 |

默认输出路径已指向本目录；如需保留历史报告，请在运行工具时用自定义文件名（例如 `artifacts/tower_playtest_elite.md`）。
