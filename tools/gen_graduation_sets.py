# -*- coding: utf-8 -*-
"""Generate set-config-v2.json: 6 generic + 12 first + 12 second (6-piece graduation).

文案必须与 js/equipment-effect-system.js 及职业系统 modifiers 的实际行为一致。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 满编毕业：主武器 + 头盔/胸甲/手套/腿甲/足具
GRAD_SLOTS = ["weapon", "helmet", "body", "hands", "legs", "feet"]


def fx(desc, special=None, stats=None, modifiers=None):
    out = {"description": desc}
    if stats:
        out["stats"] = stats
    if modifiers:
        out["modifiers"] = modifiers
    if special:
        out["special"] = special
    return out


sets = {}

# --- Generic (transition only; lower weight; keep 2/4 on mixed slots) ---
generics = [
    ("fireheart", "烈焰之心", ["weapon", "body", "hands", "feet"], 0.35,
     fx("攻击力+20", stats={"attack": 20}),
     fx("暴击时释放火焰新星（150%攻击力范围伤害，冷却6秒）", special="fire_nova")),
    ("frostborn", "霜寒之触", ["helmet", "body", "legs", "amulet"], 0.35,
     fx("防御+15，生命+100", stats={"defense": 15, "health": 100}),
     fx("受到伤害时，25%概率冰冻攻击者2秒", special="frost_touch")),
    ("stormfury", "雷霆之怒", ["weapon", "hands", "feet", "ring"], 0.35,
     fx("攻击速度+20%，移动速度+15%", stats={"attackSpeed": 20, "moveSpeed": 15}),
     fx("每第5次普攻释放闪电（200%攻击力，连锁最多3个敌人）", special="chain_strike")),
    ("starlight", "星辰之辉", ["helmet", "body", "amulet", "ring"], 0.35,
     fx("全属性+8%", stats={"allStats": 0.08}),
     fx("击杀敌人后全属性额外+5%（最多叠3层，持续10秒）", special="star_stack")),
    ("shadowmantle", "暗影之拥", ["hands", "legs", "feet", "ring"], 0.35,
     fx("闪避率+10%，暴击伤害+25%", stats={"dodge": 10, "critDamage": 25}),
     fx("闪避成功后，下一次攻击必定暴击且暴击伤害+80%（冷却5秒）", special="shadow_counter")),
    ("dragonblood", "龙族血脉", ["weapon", "helmet", "belt", "amulet"], 0.3,
     fx("生命+150，防御+20", stats={"health": 150, "defense": 20}),
     fx("生命低于50%时，伤害+30%，受到伤害降低15%", special="dragon_rage")),
]
for sid, name, slots, w, e2, e4 in generics:
    sets[sid] = {
        "name": name, "tier": "generic", "slots": slots, "dropWeight": w,
        "minLevelHint": 1, "effects": {"2": e2, "4": e4}
    }

# --- First advancement: 6-piece small graduation ---
first_sets = [
    ("oath_shield", "宣誓之盾", "knight",
     fx("减伤+3%，生命+100；圣盾承伤减免与上限提高",
        stats={"damageReduction": 3, "health": 100},
        modifiers={"holyShieldDR": 8, "holyShieldMaxBonus": 1}),
     fx("盾击/奉献等圣光技能命中时释放圣光余波（80%攻击力，冷却4秒）；受击时也有概率获得短护盾",
        special="oath_shield"),
     fx("受击后短时减伤+10%（持续3秒，冷却8秒）", special="oath_shield_apex")),
    ("crimson_scar", "赤怒战痕", "berserker",
     fx("攻击+18，暴击伤害+18%；生命低于60%时伤害+12%",
        stats={"attack": 18, "critDamage": 18},
        modifiers={"lowHpThreshold": 0.6, "lowHpDamage": 0.12}),
     fx("生命低于阈值时普攻与技能伤害提高；命中时回复1%最大生命（冷却0.8秒）",
        special="crimson_scar"),
     fx("生命越低伤害越高（额外最多+35%）；命中回复提升至2%最大生命",
        special="crimson_scar_apex")),
    ("bulwark_oath", "壁垒誓约", "guardian",
     fx("减伤+4%，生命+120；格挡减伤与格挡回复提高",
        stats={"damageReduction": 4, "health": 120},
        modifiers={"blockHealGuard": 1, "blockDRBonus": 6}),
     fx("格挡成功时获得相当于10%最大生命的护盾（持续4秒，冷却5秒）",
        special="bulwark_oath"),
     fx("格挡成功时额外获得减伤+8%（持续2.5秒）", special="bulwark_oath_apex")),
    ("trail_sigil", "林踪猎印", "ranger",
     fx("攻击速度+12%，生命+80；召唤物伤害与能量回复提高",
        stats={"attackSpeed": 12, "health": 80},
        modifiers={"petDamagePercent": 18, "petEnergyRegenPercent": 15}),
     fx("每只有活召唤物使自身伤害+4%（最多3只）", special="trail_sigil"),
     fx("普攻标记目标3秒；对标记目标伤害+15%", special="trail_sigil_apex")),
    ("hundred_pace", "百步凝视", "marksman",
     fx("暴击率+8%，攻击+16；精准层获取加快25%",
        stats={"critRate": 8, "attack": 16},
        modifiers={"precisionGainBonus": 0.25}),
     fx("攻击90距离外目标时伤害+10%，暴击伤害+10%", special="hundred_pace"),
     fx("连续普攻5次后下一击触发「凝视」：必定暴击且伤害×1.35",
        special="hundred_pace_apex")),
    ("swift_plume", "疾羽之风", "windrunner",
     fx("攻击速度+14%，移动速度+12%；风之步效果提高",
        stats={"attackSpeed": 14, "moveSpeed": 12},
        modifiers={"windStepBonus": 0.12}),
     fx("闪避成功后获得移速+35%（持续2秒，冷却4秒）", special="swift_plume"),
     fx("闪避成功后疾羽强化：移速+45%、攻速+12%（持续2.8秒）",
        special="swift_plume_apex")),
    ("ember_residue", "元素余烬", "wizard",
     fx("法强+16，技能急速+10；共鸣获取与相位技能伤害提高",
        stats={"magicAttack": 16, "skillHaste": 10},
        modifiers={"resonanceGainBonus": 0.2, "phaseSkillDamage": 0.08}),
     fx("释放职业技能时留下元素余波（55%法强范围伤害，冷却3.5秒）；下一技能伤害+28%",
        special="ember_residue"),
     fx("技能可额外触发一次元素连锁余波（40%法强，冷却5秒）",
        special="ember_residue_apex")),
    ("star_oracle", "星轨启示", "sage",
     fx("技能急速+12，生命+90；预知之盾吸收与时砂回复提高",
        stats={"skillHaste": 12, "health": 90},
        modifiers={"foresightAbsorbBonus": 0.15, "chronosRegenBonus": 0.1}),
     fx("释放职业技能时获得8%最大生命短护盾（冷却6秒）；下一技能伤害提高",
        special="star_oracle"),
     fx("释放技能后短时技能急速+12、攻速+10%（持续4秒，冷却8秒）",
        special="star_oracle_apex")),
    ("curse_echo", "咒缚残响", "warlock",
     fx("法强+14，生命偷取+2%；诅咒叠层与诅咒持续伤害提高",
        stats={"magicAttack": 14, "lifeSteal": 2},
        modifiers={"curseStackBonus": 0.2, "curseDotBonus": 0.1}),
     fx("诅咒/收割类技能命中时对附近敌人造成残响连锁（60%法强，冷却4秒）",
        special="curse_echo"),
     fx("额外触发灵魂爆发（90%法强范围伤害，冷却7秒）", special="curse_echo_apex")),
    ("night_veil", "夜帷残影", "shadowdancer",
     fx("暴击率+8%，闪避+8%；连击点获取加快，背刺角度更宽",
        stats={"critRate": 8, "dodge": 8},
        modifiers={"comboGainBonus": 0.15, "backstabAngleBonus": 0.1}),
     fx("暴击后追加一次残影斩（45%攻击力，冷却1.5秒），并获得移速+30%（2秒）",
        special="night_veil"),
     fx("背刺伤害额外提高；暴击残影斩效果保留", special="night_veil_apex")),
    ("mirror_mask", "镜戏面具", "trickster",
     fx("闪避+10%，移动速度+10%；诱饵耐久与幻术资源回复提高",
        stats={"dodge": 10, "moveSpeed": 10},
        modifiers={"decoyDurability": 0.2, "illusionRegenBonus": 0.1}),
     fx("闪避成功后下一击伤害+20%且更容易暴击（冷却5秒），并获得短时移速",
        special="mirror_mask"),
     fx("闪避成功时对周围造成镜碎伤害（80%攻击力，冷却8秒）",
        special="mirror_mask_apex")),
    ("venom_censer", "毒雾薰笼", "venomancer",
     fx("攻击+14，技能急速+8；额外叠毒层数与催化获取提高",
        stats={"attack": 14, "skillHaste": 8},
        modifiers={"poisonExtraStack": 1, "catalystGainBonus": 0.1}),
     fx("对中毒目标伤害+12%；每第5次普攻释放毒链（160%攻击力，连锁3个）",
        special="venom_censer"),
     fx("对中毒目标伤害再+10%；毒链效果增强", special="venom_censer_apex")),
]
for sid, name, cls, e2, e4, e6 in first_sets:
    sets[sid] = {
        "name": name, "tier": "first", "classAffinity": cls,
        "slots": list(GRAD_SLOTS), "dropWeight": 1.25, "minLevelHint": 20,
        "effects": {"2": e2, "4": e4, "6": e6}
    }

# --- Second advancement: 6-piece big graduation ---
second_sets = [
    ("holy_balance", "圣裁天平", "paladin",
     fx("攻击+12，防御+20，生命+100；审判类技能伤害+15%，命中回复神圣能量",
        stats={"attack": 12, "defense": 20, "health": 100},
        modifiers={"judgmentDamage": 0.15, "holyEnergyOnHit": 1}),
     fx("审判/圣光技能积蓄能量；就绪后下一次审判释放神罚范围爆发（140%攻击力）",
        special="holy_balance"),
     fx("审判/圣光技能直接强化并附带神罚爆发；审判伤害进一步提高",
        special="holy_balance_apex")),
    ("rift_howl", "碎界怒嚎", "destroyer",
     fx("攻击+22，暴击伤害+20%；碎界印记叠层加快25%",
        stats={"attack": 22, "critDamage": 20},
        modifiers={"destroyMarkGain": 0.25}),
     fx("狂暴碎击/毁灭裂波命中时，向左前与右前斜向射出地面裂波（各70%攻击力）",
        special="rift_howl"),
     fx("释放碎击时短时攻速+20%；斜向裂波伤害提高15%",
        special="rift_howl_apex")),
    ("temple_covenant", "圣殿永约", "temple_knight",
     fx("生命+120，减伤+3%，防御+18；圣约链接双方共享减伤提高",
        stats={"health": 120, "damageReduction": 3, "defense": 18},
        modifiers={"bondSharedDR": 0.08}),
     fx("受击时有概率获得18%最大生命护盾（冷却6秒）", special="temple_covenant"),
     fx("致命伤害时触发圣殿庇护：保留20%生命并获得35%最大生命护盾（冷却120秒）",
        special="temple_covenant_apex")),
    ("beast_pact", "万兽盟约", "beastmaster",
     fx("攻击速度+14%，生命+80；猎物标记获取加快，切换指令后宠物伤害提高",
        stats={"attackSpeed": 14, "health": 80},
        modifiers={"preyMarkGain": 0.2, "commandSwapPetDamage": 0.2}),
     fx("自身伤害+12%，每只有活召唤物再+5%（最多3只）", special="beast_pact"),
     fx("在4件基础上额外伤害+20%", special="beast_pact_apex")),
    ("breathless_hunt", "绝息猎杀", "deadeye",
     fx("暴击率+10%，攻击+18，暴击伤害+12%；对弱点目标伤害+20%，精准更易维持",
        stats={"critRate": 10, "attack": 18, "critDamage": 12},
        modifiers={"weaknessDamage": 0.2, "precisionSustain": 1}),
     fx("攻击弱点标记目标时伤害与暴击伤害大幅提高；远距目标伤害+12%",
        special="breathless_hunt"),
     fx("对生命低于35%的目标额外伤害+25%；弱点暴击伤害进一步提高",
        special="breathless_hunt_apex")),
    ("echo_fold", "叠影回响", "phantom",
     fx("攻击速度+14%，移动速度+12%，闪避+6%；残影回声伤害+18%，有残影时闪避再+8",
        stats={"attackSpeed": 14, "moveSpeed": 12, "dodge": 6},
        modifiers={"echoDamageBonus": 0.18, "echoDodge": 8}),
     fx("闪避获得移速；风刃/幻影类技能追加叠影斩（45%攻击力，冷却6秒）",
        special="echo_fold"),
     fx("闪避可预备额外复读；叠影斩伤害提高至65%，复读延迟缩短",
        special="echo_fold_apex")),
    ("torrent_throne", "洪流法座", "archmage",
     fx("法强+22，技能急速+12；熔合技能伤害+15%，共鸣上限+1",
        stats={"magicAttack": 22, "skillHaste": 12},
        modifiers={"fusionDamage": 0.15, "resonanceCapBonus": 1}),
     fx("释放职业技能后下一技能伤害+28%，并留下元素余波",
        special="torrent_throne"),
     fx("下一技能伤害提高至+40%；可额外触发元素连锁余波（冷却5秒）",
        special="torrent_throne_apex")),
    ("fate_web", "命运织网", "oracle",
     fx("技能急速+14，生命+100；命运编织期间急速提高12%",
        stats={"skillHaste": 14, "health": 100},
        modifiers={"fateHaste": 0.12}),
     fx("命运/时光类技能伤害+12%；击杀叠层强化全属性（与星辉同源机制）",
        special="fate_web"),
     fx("命运/时光技能可短暂冻结附近敌人（约1.2秒）", special="fate_web_apex")),
    ("grave_throne", "坟海王座", "necromancer",
     fx("法强+18，生命+110，生命偷取+2%；召唤物强度与死亡共鸣提高15%",
        stats={"magicAttack": 18, "health": 110, "lifeSteal": 2},
        modifiers={"summonPower": 0.15, "deathResonanceBonus": 0.15}),
     fx("亡灵/灵魂类技能伤害提高；击杀时对周围造成坟火伤害（40%法强）",
        special="grave_throne"),
     fx("击杀坟火伤害提高至70%法强", special="grave_throne_apex")),
    ("evernight_seal", "永夜契印", "nightblade",
     fx("暴击率+10%，闪避+8%，暴击伤害+18%；影舞期间暴率与暴伤提高",
        stats={"critRate": 10, "dodge": 8, "critDamage": 18},
        modifiers={"shadowDanceCrit": 0.12, "shadowDanceCritDmg": 0.2}),
     fx("背刺伤害大幅提高；暴击后追加残影斩并获得短时移速",
        special="evernight_seal"),
     fx("背刺伤害再提高；暴击残影斩效果保留", special="evernight_seal_apex")),
    ("myriad_mirror", "万象镜牢", "illusionist",
     fx("闪避+10%，移动速度+12%，暴击伤害+12%；镜像伤害+15%，镜域持续时间+1秒",
        stats={"dodge": 10, "moveSpeed": 12, "critDamage": 12},
        modifiers={"mirrorDamage": 0.15, "mirrorDurationAdd": 1000}),
     fx("闪避成功后下一击伤害提高，并获得短时移速", special="myriad_mirror"),
     fx("幻术/镜像类技能可短暂束缚附近敌人（约1秒，冷却8秒）",
        special="myriad_mirror_apex")),
    ("plague_altar", "瘟神祭坛", "plaguebringer",
     fx("攻击+18，技能急速+10%；毒传播与毒伤提高",
        stats={"attack": 18, "skillHaste": 10},
        modifiers={"poisonSpreadBonus": 0.2, "poisonDamage": 0.12}),
     fx("对中毒目标伤害提高；每第5次普攻释放毒链（最多连锁3个）",
        special="plague_altar"),
     fx("对中毒目标伤害再提高；毒链最多连锁4个", special="plague_altar_apex")),
]
for sid, name, cls, e2, e4, e6 in second_sets:
    sets[sid] = {
        "name": name, "tier": "second", "classAffinity": cls,
        "slots": list(GRAD_SLOTS), "dropWeight": 1.0, "minLevelHint": 40,
        "effects": {"2": e2, "4": e4, "6": e6}
    }

cfg = {
    "version": "4.1",
    "activationPieces": [2, 4, 6],
    "graduationSlots": GRAD_SLOTS,
    "loadoutFormula": {
        "set": GRAD_SLOTS,
        "classCore": ["offHand"],
        "legendaryPowers": ["amulet", "ring", "belt"]
    },
    "description": "通用过渡 + 12一转/12二转六件毕业（武器+五甲）；副手=核心，护符/指环/腰带=威能；文案与运行时效果对齐",
    "sets": sets
}

out = ROOT / "config" / "set-config-v2.json"
out.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote", out, "sets", len(sets), "activation", cfg["activationPieces"])
