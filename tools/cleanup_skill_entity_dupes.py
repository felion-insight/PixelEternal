#!/usr/bin/env python3
"""Remove duplicate functions accidentally inserted during assassin merge."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'js' / 'skill-entity-system.js'


def remove_function_block(text: str, signature: str) -> str:
    idx = text.find(signature)
    if idx < 0:
        return text
    # keep first occurrence only
    idx2 = text.find(signature, idx + len(signature))
    if idx2 < 0:
        return text
    # find end: next top-level function at same indent inside IIFE
    start = idx2
    rest = text[start:]
    depth = 0
    end = 0
    for i, ch in enumerate(rest):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end:
        # swallow trailing blank lines
        while end < len(rest) and rest[end] in '\r\n':
            end += 1
        return text[:start] + rest[end:]
    return text


def main():
    text = TARGET.read_text(encoding='utf-8')
    before = text
    text = remove_function_block(text, '    function onInstantSkillKill(')
    text = remove_function_block(text, '    function finishCharge(')
    text = remove_function_block(text, '    function collectPierceTargets(')
    text = remove_function_block(text, '    function resolveChargeEndFinish(')
    text = remove_function_block(text, '    function applyChargeBuffOnEnd(')
    if text != before:
        TARGET.write_text(text, encoding='utf-8')
        print('Removed duplicate function blocks')
    else:
        print('No duplicates found')


if __name__ == '__main__':
    main()
