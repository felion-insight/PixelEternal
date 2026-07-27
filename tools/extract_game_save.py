#!/usr/bin/env python3
"""将存档系统从 game-main.js 提取到 game-save-module.js，并自 game-main.js 删除对应行。"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = os.path.join(ROOT, 'js', 'game-main.js')
OUT = os.path.join(ROOT, 'js', 'game-save-module.js')

# 1-based inclusive: buildSaveDataObject .. deserializePotion 块末尾
SAVE_START = 13267
SAVE_END = 14044

HEADER = '''/**
 * Pixel Eternal - 存档系统（从 game-main.js 拆分）
 */
(function () {
    'use strict';
    Object.assign(Game.prototype, {
'''

FOOTER = '''
    });
})();
'''


def main():
    with open(MAIN, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    body_lines = lines[SAVE_START - 1:SAVE_END]
    body = ''.join(body_lines)

    # 类方法 -> 对象字面量：去掉行首 4 空格，保留方法体
    # 已是 `    methodName()` 形式，Object.assign 内需要 8 空格
    indented = re.sub(r'^    ', '        ', body, flags=re.MULTILINE)
    # 方法之间补逗号（Object.assign 字面量）
    indented = re.sub(
        r'(\n        \})\n[ \t]*\n([ \t]*(?:\/\*\*|[_a-zA-Z]))',
        r'\1,\n\n\2',
        indented,
    )

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(HEADER)
        f.write(indented)
        f.write(FOOTER)
    print(f'Wrote {OUT}')

    new_lines = lines[:SAVE_START - 1] + lines[SAVE_END:]
    with open(MAIN, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f'Removed lines {SAVE_START}-{SAVE_END} from game-main.js ({len(lines) - len(new_lines)} lines)')


if __name__ == '__main__':
    main()
