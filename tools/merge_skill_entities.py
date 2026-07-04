#!/usr/bin/env python3
"""补全技能 stub、合并 entity/primary 配置到 skill-config.json"""
import json, os, copy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL_PATH = os.path.join(ROOT, 'config', 'skill-config.json')
ENTITY_PATH = os.path.join(ROOT, 'config', 'skill-entity-config.json')
PRIMARY_PATH = os.path.join(ROOT, 'config', 'skill-primary-effects.json')

PRIMARY_SKILL_IDS = {
    'defensive_stance', 'war_cry', 'ice_armor', 'berserk', 'taunt',
    'guardian_shield', 'healing_wave', 'hunters_mark', 'rapid_shot',
    'arcane_amplify', 'resurrection', 'foresight', 'fury', 'poison_blade',
    'final_guard', 'fate_reverse', 'guardian_stance', 'holy_domain', 'smoke_bomb',
    'prophecy', 'aegis', 'holy_shield_team', 'element_domain',
}

# entity 配置中存在但 skill-config 缺失的条目
ENTITY_STUBS = {
    'execute': ('处决', 'destroyer', 'adv_feature', 30, {'dmg': 8.0}),
    'beast_fusion': ('野兽融合', 'beastmaster', 'adv_feature', 30, {}),
    'headshot': ('爆头', 'deadeye', 'adv_feature', 30, {}),
    'void_arrow': ('虚空箭', 'phantom', 'adv_feature', 30, {}),
    'mind_control': ('精神控制', 'illusionist', 'adv_feature', 30, {}),
    'night_slash': ('夜刃斩', 'nightblade', 'adv_feature', 30, {}),
    'death_coil': ('死亡缠绕', 'necromancer', 'adv_feature', 30, {}),
    'contagion': ('传染', 'plaguebringer', 'adv_feature', 30, {}),
    'prophecy': ('预言', 'oracle', 'adv_feature', 30, {}),
    'holy_shield_team': ('神圣之盾', 'paladin', 'team', 10, {}),
    'aegis': ('神盾', 'temple_knight', 'team', 10, {}),
    'element_domain': ('元素领域', 'archmage', 'team', 10, {}),
}

def make_stub(sid, name, class_id, slot, lv, opts=None):
    opts = opts or {}
    return {
        'id': sid, 'name': name, 'classId': class_id, 'unlockLevel': lv, 'slotType': slot,
        'type': 'active', 'category': 'class', 'resourceType': 'rage',
        'resourceCost': int(15 + lv * 1.2), 'cooldownMs': int(4000 + lv * 180),
        'damageMultiplier': opts.get('dmg', 1.5), 'range': 90, 'aoeRadius': 0,
        'effectTags': opts.get('tags', []), 'statusEffects': [],
        'breakDamageMultiplier': opts.get('breakMult', 1),
        'evolutionPath': None, 'buildId': None,
        'description': f'{name} — {class_id}'
    }

def main():
    with open(SKILL_PATH, encoding='utf-8') as f:
        data = json.load(f)
    with open(ENTITY_PATH, encoding='utf-8') as f:
        ent_data = json.load(f)
    primary_effects = {}
    if os.path.isfile(PRIMARY_PATH):
        with open(PRIMARY_PATH, encoding='utf-8') as f:
            primary_effects = json.load(f).get('skills', {})

    skills = data['skills']
    ent_map = ent_data.get('skills', {})
    added = 0
    merged_entity = 0
    merged_primary = 0

    for sid, meta in ENTITY_STUBS.items():
        if sid not in skills:
            name, cid, slot, lv, opts = meta
            skills[sid] = make_stub(sid, name, cid, slot, lv, opts)
            added += 1
            for pid, prog in data.get('progressions', {}).items():
                if pid == cid and sid not in prog:
                    if slot == 'team':
                        idx = next((i for i, x in enumerate(prog) if skills.get(x, {}).get('slotType') == 'team'), -1)
                        if idx >= 0:
                            prog[idx] = sid
                        else:
                            prog.append(sid)
                    elif slot == 'adv_feature' and sid not in prog:
                        prog.append(sid)

    for sid, s in skills.items():
        if s.get('type') == 'passive' or s.get('slotType') in ('legendary', 'adv_passive'):
            continue
        if sid in PRIMARY_SKILL_IDS and sid in primary_effects:
            pe = primary_effects[sid]
            s['skillEffect'] = pe.get('skillEffect')
            s['effectTags'] = pe.get('effectTags', [])
            s['damageMultiplier'] = 0
            s.pop('entityType', None)
            s.pop('entityConfig', None)
            merged_primary += 1
            continue
        if sid in ent_map:
            ec = ent_map[sid]
            s['entityType'] = ec.get('entityType')
            s['entityConfig'] = copy.deepcopy(ec.get('entityConfig', {}))
            if s.get('entityType') == 'projectile':
                s['aoeRadius'] = 0
            merged_entity += 1

    with open(SKILL_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f'Added {added} stubs, merged {merged_entity} entity + {merged_primary} primary skills')

if __name__ == '__main__':
    main()
