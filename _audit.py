import json

with open('config/skill-config.json', 'r', encoding='utf-8') as f:
    sc = json.load(f)

targets = [
    'weakness_mark_de', 'breath_hold', 'deadeye_snipe', 'death_gaze',
    'phantom_clone', 'phantom_echo_blade', 'phantom_mark', 'void_storm',
    'wind_step', 'wind_blade', 'wind_mark', 'phantom_storm',
    'perfect_shot', 'death_mark', 'executioner_gaze',
    'aimed_shot', 'backstep_shot'
]

for tid in targets:
    s = sc['skills'].get(tid)
    if s:
        print(f'=== {tid} ===')
        print(f'  classId: {s.get("classId")}')
        print(f'  slotType: {s.get("slotType")}')
        print(f'  resourceType: {s.get("resourceType")}')
        print(f'  resourceCost: {s.get("resourceCost")}')
        print(f'  cooldownMs: {s.get("cooldownMs")}')
        print(f'  damageMultiplier: {s.get("damageMultiplier")}')
        print(f'  entityType: {s.get("entityType")}')
        print(f'  breakDamageMultiplier: {s.get("breakDamageMultiplier")}')
        ep = s.get('evolutionPath')
        if ep:
            print(f'  evolutionPath: baseSkillId={ep.get("baseSkillId")}')
            fa = ep.get('firstAdvancement', {})
            sa = ep.get('secondAdvancement', {})
            for k, v in fa.items():
                print(f'    firstAdv: {k} -> {v.get("newSkillId")} (Lv{v.get("unlockLevel")})')
            for k, v in sa.items():
                print(f'    secondAdv: {k} -> {v.get("newSkillId")}')
        ec = s.get('entityConfig', {})
        for k, v in ec.items():
            if isinstance(v, (int, float, str, bool)):
                print(f'  entityConfig.{k}: {v}')
        print()
    else:
        print(f'=== {tid} === NOT FOUND\n')
