#!/usr/bin/env python3
"""生成 class-config.json 与 skill-config.json（v2.0，无需 Node）"""
import json, os, copy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(ROOT, 'config')

# ---- gen-class-config (mirror of gen-class-config.js) ----
BATTLE_ROLES = {
    'warrior': {'battleRole': 'striker', 'battleRoleName': '强攻手·基础'},
    'archer': {'battleRole': 'striker', 'battleRoleName': '强攻手·远程'},
    'mage': {'battleRole': 'anomaly', 'battleRoleName': '异常手·元素'},
    'assassin': {'battleRole': 'switch', 'battleRoleName': '速切手·敏捷'},
    'knight': {'battleRole': 'breaker', 'battleRoleName': '击破手·坦克'},
    'berserker': {'battleRole': 'striker', 'battleRoleName': '强攻手·近战'},
    'guardian': {'battleRole': 'support', 'battleRoleName': '支援手·坦辅'},
    'ranger': {'battleRole': 'anomaly', 'battleRoleName': '异常手·宠物'},
    'marksman': {'battleRole': 'striker', 'battleRoleName': '强攻手·远程'},
    'windrunner': {'battleRole': 'switch', 'battleRoleName': '速切手·机动'},
    'wizard': {'battleRole': 'striker', 'battleRoleName': '强攻手·AOE'},
    'sage': {'battleRole': 'support', 'battleRoleName': '支援手·治疗'},
    'warlock': {'battleRole': 'anomaly', 'battleRoleName': '异常手·召唤'},
    'shadowdancer': {'battleRole': 'breaker', 'battleRoleName': '击破手·爆发'},
    'trickster': {'battleRole': 'switch', 'battleRoleName': '速切手·控制'},
    'venomancer': {'battleRole': 'anomaly', 'battleRoleName': '异常手·DOT'},
    'paladin': {'battleRole': 'breaker', 'battleRoleName': '击破手·支援坦'},
    'destroyer': {'battleRole': 'striker', 'battleRoleName': '强攻手·斩杀'},
    'temple_knight': {'battleRole': 'support', 'battleRoleName': '支援手·守护坦'},
    'beastmaster': {'battleRole': 'anomaly', 'battleRoleName': '异常手·宠物领主'},
    'deadeye': {'battleRole': 'striker', 'battleRoleName': '强攻手·狙击'},
    'phantom': {'battleRole': 'switch', 'battleRoleName': '速切手·分身'},
    'archmage': {'battleRole': 'striker', 'battleRoleName': '强攻手·元素'},
    'oracle': {'battleRole': 'support', 'battleRoleName': '支援手·时空'},
    'necromancer': {'battleRole': 'anomaly', 'battleRoleName': '异常手·亡灵'},
    'nightblade': {'battleRole': 'breaker', 'battleRoleName': '击破手·暗杀'},
    'illusionist': {'battleRole': 'switch', 'battleRoleName': '速切手·幻象'},
    'plaguebringer': {'battleRole': 'anomaly', 'battleRoleName': '异常手·瘟疫'},
}

EVOLUTION_SLOTS = {
    'knight': {'slot': 'core1', 'first': 'holy_shield_bash', 'second': 'judgment_shield'},
    'berserker': {'slot': 'core2', 'first': 'furious_charge', 'second': 'devastation_charge'},
    'guardian': {'slot': 'survival', 'first': 'guardian_stance', 'second': 'holy_domain'},
    'ranger': {'slot': 'core1', 'first': 'summon_wolf', 'second': 'beast_pack'},
    'marksman': {'slot': 'core2', 'first': 'aimed_shot', 'second': 'perfect_shot'},
    'windrunner': {'slot': 'survival', 'first': 'wind_step', 'second': 'phantom_clone'},
    'wizard': {'slot': 'core1', 'first': 'flame_bolt', 'second': 'lava_storm'},
    'sage': {'slot': 'core2', 'first': 'healing_wave', 'second': 'foresight'},
    'warlock': {'slot': 'survival', 'first': 'summon_skeleton', 'second': 'skeleton_legion'},
    'shadowdancer': {'slot': 'core1', 'first': 'shadow_strike', 'second': 'shadow_assault'},
    'trickster': {'slot': 'core2', 'first': 'illusion', 'second': 'quintuple_illusion'},
    'venomancer': {'slot': 'survival', 'first': 'venom_blade', 'second': 'plague'},
}

def gen_class_config():
    # Import structure from existing file and patch, or build fresh
    import importlib.util
    spec_path = os.path.join(ROOT, 'tools', 'gen-class-config.js')
    # Build manually from known templates (same as JS)
    exec(open(spec_path, encoding='utf-8').read().split('const out =')[0], globals())
    # Can't exec JS in Python - build inline
    pass

# Simpler: read existing class-config and patch version + battle roles
def patch_class_config():
    path = os.path.join(CONFIG_DIR, 'class-config.json')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    data['version'] = '2.0'
    data['battleRoles'] = BATTLE_ROLES
    data['evolutionSlots'] = EVOLUTION_SLOTS
    for section in ('baseClasses', 'firstAdvancements', 'secondAdvancements'):
        for cid, cdef in data.get(section, {}).items():
            br = BATTLE_ROLES.get(cid, {})
            cdef['battleRole'] = br.get('battleRole', 'striker')
            cdef['battleRoleName'] = br.get('battleRoleName', cdef.get('name', cid))
            if cid in EVOLUTION_SLOTS:
                cdef['skillEvolution'] = EVOLUTION_SLOTS[cid]
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print('Patched', path)

def gen_skill_config_v2():
    """Generate skill-config from class-config using embedded logic."""
    class_path = os.path.join(CONFIG_DIR, 'class-config.json')
    with open(class_path, encoding='utf-8') as f:
        class_config = json.load(f)

    SLOT_UNLOCK = [1, 3, 6, 10, 15, 30, 55, 60]
    SLOT_TYPES = ['basic', 'core1', 'core2', 'team', 'survival', 'adv_feature', 'ultimate', 'legendary']
    RESOURCE_TO_FAMILY = {
        'rage': 'rage', 'guard': 'rage', 'focus': 'focus', 'pet_energy': 'focus',
        'ammo': 'focus', 'wind_mark': 'focus', 'mana': 'mana', 'soul_shard': 'mana',
        'energy': 'energy', 'combo_point': 'energy', 'illusion': 'energy', 'poison_stack': 'energy'
    }
    FAMILY_META = {
        'rage': {'name': '怒气', 'max': 100, 'regenPerSec': 5, 'onBasicAttack': 8, 'onHitTaken': 5, 'outOfCombatDecay': 3},
        'focus': {'name': '集中', 'max': 100, 'regenPerSec': 4, 'onCrit': 10},
        'mana': {'name': '法力', 'max': 200, 'regenPerSec': 6},
        'energy': {'name': '能量', 'max': 120, 'regenPerSec': 12},
    }

    BASE_SKILLS = {
        'warrior': {
            'basic': {'id': 'warrior_basic', 'name': '横斩'},
            'core1': {'id': 'shield_bash', 'name': '盾击', 'breakMult': 1.5},
            'core2': {'id': 'charge', 'name': '冲锋'},
            'team': {'id': 'war_cry', 'name': '战吼'},
            'survival': {'id': 'defensive_stance', 'name': '防御姿态'},
        },
        'archer': {
            'basic': {'id': 'archer_basic', 'name': '精准射击'},
            'core1': {'id': 'backstep_shot', 'name': '后跳射击'},
            'core2': {'id': 'poison_arrow', 'name': '毒箭', 'status': 'poison'},
            'team': {'id': 'hunters_mark', 'name': '猎人印记'},
            'survival': {'id': 'rapid_shot', 'name': '快速射击'},
        },
        'mage': {
            'basic': {'id': 'arcane_missile', 'name': '奥术飞弹'},
            'core1': {'id': 'fireball', 'name': '火球术', 'status': 'burn'},
            'core2': {'id': 'ice_armor', 'name': '冰甲术'},
            'team': {'id': 'arcane_amplify', 'name': '魔力增幅'},
            'survival': {'id': 'blink', 'name': '闪现'},
        },
        'assassin': {
            'basic': {'id': 'assassin_basic', 'name': '刺击'},
            'core1': {'id': 'shadow_step', 'name': '暗影步'},
            'core2': {'id': 'smoke_bomb', 'name': '烟雾弹'},
            'team': {'id': 'poison_blade', 'name': '毒刃', 'status': 'poison'},
            'survival': {'id': 'vanish', 'name': '消失'},
        },
    }

    EVOLUTION_SKILLS = {
        'holy_shield_bash': {'name': '神圣盾击', 'classId': 'knight', 'slotType': 'core1', 'unlockLevel': 20, 'status': 'dark_erosion', 'aoe': 100, 'dmg': 1.8, 'breakMult': 2},
        'judgment_shield': {'name': '审判之盾', 'classId': 'paladin', 'slotType': 'core1', 'unlockLevel': 40, 'status': 'dark_erosion', 'dmg': 2.0, 'breakMult': 2},
        'furious_charge': {'name': '狂暴冲锋', 'classId': 'berserker', 'slotType': 'core2', 'unlockLevel': 20, 'dmg': 1.2},
        'devastation_charge': {'name': '毁灭冲锋', 'classId': 'destroyer', 'slotType': 'core2', 'unlockLevel': 40, 'dmg': 2.5},
        'guardian_stance': {'name': '守护姿态', 'classId': 'guardian', 'slotType': 'survival', 'unlockLevel': 20},
        'holy_domain': {'name': '神圣领域', 'classId': 'temple_knight', 'slotType': 'survival', 'unlockLevel': 40},
        'flame_bolt': {'name': '烈焰弹', 'classId': 'wizard', 'slotType': 'core1', 'unlockLevel': 20, 'status': 'burn', 'aoe': 90, 'dmg': 2.88},
        'lava_storm': {'name': '熔岩风暴', 'classId': 'archmage', 'slotType': 'core1', 'unlockLevel': 40, 'status': 'burn', 'aoe': 110, 'dmg': 2.4},
        'shadow_strike': {'name': '背刺', 'classId': 'shadowdancer', 'slotType': 'core1', 'unlockLevel': 20, 'dmg': 2.5, 'breakMult': 2},
        'shadow_assault': {'name': '暗影突袭', 'classId': 'nightblade', 'slotType': 'core1', 'unlockLevel': 40, 'dmg': 3.2},
    }

    BUILD_PASSIVES = {
        'paladin': ('build_retribution', '流派·惩戒', 'retribution'),
        'destroyer': ('build_blood_demon', '流派·血魔', 'blood_demon'),
        'temple_knight': ('build_thorns', '流派·荆棘', 'thorns'),
        'deadeye': ('build_executioner', '流派·处刑人', 'executioner'),
        'archmage': ('build_arcane', '流派·奥术', 'arcane'),
        'oracle': ('build_chrono', '流派·时空', 'chrono'),
        'necromancer': ('build_corpse_explosion', '流派·尸爆', 'corpse_explosion'),
        'nightblade': ('build_night_lord', '流派·暗夜', 'night_lord'),
        'plaguebringer': ('build_infection', '流派·传染', 'infection'),
    }

    ADV_FEATURES = {
        'knight': ('taunt', '嘲讽'), 'berserker': ('berserk', '狂暴'), 'guardian': ('guardian_shield', '守护之盾'),
        'wizard': ('chain_lightning', '闪电链'), 'sage': ('healing_wave', '治疗波'), 'warlock': ('shadow_bolt', '暗影箭'),
        'shadowdancer': ('shadow_strike_feat', '影袭'), 'trickster': ('decoy', '替身'), 'venomancer': ('poison_mist', '毒雾'),
        'ranger': ('frozen_trap', '冰冻陷阱'), 'marksman': ('piercing_arrow', '穿透箭'), 'windrunner': ('wind_blade', '风刃'),
    }

    ULTIMATES = {
        'paladin': ('resurrection', '复活'), 'destroyer': ('fury', '狂怒'),
        'temple_knight': ('final_guard', '最终守护'), 'archmage': ('meteor', '陨石术'),
        'oracle': ('fate_reverse', '命运逆转'), 'necromancer': ('nether_gate', '冥界之门'),
        'nightblade': ('nightfall', '暗夜降临'), 'plaguebringer': ('plague_outbreak', '瘟疫爆发'),
        'deadeye': ('death_gaze', '死神之眼'), 'phantom': ('phantom_storm', '幻影风暴'),
        'beastmaster': ('natures_wrath', '自然之怒'), 'illusionist': ('reality_shift', '虚实转换'),
    }

    def fam(class_def):
        t = (class_def or {}).get('resource', {}).get('type')
        return RESOURCE_TO_FAMILY.get(t, 'rage')

    def make_skill(sid, class_id, unlock, slot, name, **opts):
        passive = slot == 'legendary' or opts.get('passive')
        basic = slot == 'basic'
        return {
            'id': sid, 'name': name, 'classId': class_id, 'unlockLevel': unlock, 'slotType': slot,
            'type': 'passive' if passive else ('basic' if basic else 'active'),
            'category': 'class',
            'resourceType': opts.get('resourceType'),
            'resourceCost': 0 if passive or basic else opts.get('resourceCost', int(15 + unlock * 1.2)),
            'cooldownMs': 800 if basic else (0 if passive else opts.get('cooldownMs', int(4000 + unlock * 180))),
            'damageMultiplier': 0 if passive else opts.get('dmg', 1.0 if basic else 1.5),
            'range': opts.get('range', 55 if basic else 90),
            'aoeRadius': opts.get('aoe', 0),
            'effectTags': opts.get('tags', []),
            'statusEffects': [{'type': opts['status'], 'durationMs': 4000}] if opts.get('status') else opts.get('statusEffects', []),
            'breakDamageMultiplier': opts.get('breakMult', 1.0),
            'evolutionPath': opts.get('evolutionPath'),
            'buildId': opts.get('buildId'),
            'description': opts.get('desc', f'{name} — {class_id} Lv{unlock}'),
        }

    skills = {}
    progressions = {}

    def reg(s):
        skills[s['id']] = s
        return s['id']

    for eid, m in EVOLUTION_SKILLS.items():
        reg(make_skill(eid, m['classId'], m['unlockLevel'], m['slotType'], m['name'],
                        resourceType=fam(class_config.get('firstAdvancements', {}).get(m['classId'])),
                        dmg=m.get('dmg'), aoe=m.get('aoe'), status=m.get('status'),
                        breakMult=m.get('breakMult', 1), tags=['burst']))

    def build_evo_path(base_id, slot, first_id, second_id):
        evo = EVOLUTION_SLOTS.get(first_id)
        if not evo or evo['slot'] != slot:
            return None
        path = {'baseSkillId': base_id, 'slotType': slot,
                'firstAdvancement': {first_id: {'newSkillId': evo['first'], 'unlockLevel': 20}},
                'secondAdvancement': {}}
        if second_id:
            path['secondAdvancement'][second_id] = {'newSkillId': evo['second'], 'unlockLevel': 40}
        return path

    for base_id, base_def in class_config['baseClasses'].items():
        defs = BASE_SKILLS[base_id]
        fam_id = fam(base_def)
        base_ids = []
        for i, key in enumerate(['basic', 'core1', 'core2', 'team', 'survival']):
            meta = defs[key]
            slot = SLOT_TYPES[i]
            tags = ['buff'] if slot == 'team' else []
            s = make_skill(meta['id'], base_id, SLOT_UNLOCK[i], slot, meta['name'],
                           resourceType=fam_id, status=meta.get('status'),
                           breakMult=meta.get('breakMult', 1), tags=tags)
            base_ids.append(reg(s))

        for first_id in base_def.get('advancements', []):
            evo = EVOLUTION_SLOTS.get(first_id)
            if evo:
                slot_key = evo['slot']
                base_skill = defs.get(slot_key.replace('survival', 'survival') if slot_key == 'survival' else slot_key)
                if base_skill and base_skill['id'] in skills:
                    second_id = class_config['firstAdvancements'][first_id]['advancements'][0]
                    skills[base_skill['id']]['evolutionPath'] = build_evo_path(
                        base_skill['id'], evo['slot'], first_id, second_id)

        progressions[base_id] = list(base_ids)

        for first_id in base_def.get('advancements', []):
            ids = list(base_ids)
            if first_id in ADV_FEATURES:
                fid, fname = ADV_FEATURES[first_id]
                ids.append(reg(make_skill(fid, first_id, 30, 'adv_feature', fname,
                                          resourceType=fam(class_config['firstAdvancements'][first_id]), tags=['feature'])))
            progressions[first_id] = ids
            for second_id in class_config['firstAdvancements'][first_id].get('advancements', []):
                sids = list(ids)
                if second_id in ULTIMATES:
                    uid, uname = ULTIMATES[second_id]
                    sids.append(reg(make_skill(uid, second_id, 55, 'ultimate', uname,
                                               resourceType=fam(class_config['firstAdvancements'][first_id]),
                                               resourceCost=100, cooldownMs=90000, dmg=3.0, tags=['ultimate', 'burst'])))
                if second_id in BUILD_PASSIVES:
                    bid, bname, build_id = BUILD_PASSIVES[second_id]
                    sids.append(reg(make_skill(bid, second_id, 60, 'legendary', bname,
                                               passive=True, buildId=build_id, tags=['passive', 'build'])))
                progressions[second_id] = sids

    out = {
        'version': '2.0',
        'slotUnlockLevels': SLOT_UNLOCK,
        'slotTypes': SLOT_TYPES,
        'evolutionLevels': {'first': 20, 'second': 40},
        'hotbarSlotCount': 4,
        'defaultHotbar': ['core1', 'core2', 'team', 'survival'],
        'resourceFamilies': FAMILY_META,
        'resourceToFamily': RESOURCE_TO_FAMILY,
        'enhanceConfig': {'maxLevel': 5, 'damagePerLevel': 0.1, 'goldByLevel': [500, 1000, 2000, 4000, 8000]},
        'skills': skills,
        'progressions': progressions,
    }
    path = os.path.join(CONFIG_DIR, 'skill-config.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f'Wrote {path} — {len(skills)} skills, {len(progressions)} progressions')

if __name__ == '__main__':
    patch_class_config()
    gen_skill_config_v2()
