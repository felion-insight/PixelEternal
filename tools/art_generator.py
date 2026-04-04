#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pixel Eternal - 游戏美术资源生成工具
使用自然语言描述需求，通过 GPT 规划提示词与风格，再调用 Imagen 生成图片并自动写入项目。
技能/增幅/批量武器贴图等图标类输出经后处理为 EXPORT_ICON_SIZE×EXPORT_ICON_SIZE 的 RGBA 透明底 PNG（默认 68）。

装备生成约定与深阶提示词表见 tools/art-requirements-2026-03-19.md（主题×品质批量可用 --deep-theme / --deep-quality）。
"""

import os
import re
import sys
import json
import base64
import hashlib
import argparse
from collections import deque
from pathlib import Path
from datetime import datetime

# 项目根目录（脚本在 tools/ 下时，上级为项目根）
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _load_env_files() -> None:
    """从项目根或 tools 下的 .env 注入变量；不覆盖已在环境中的键。"""
    for path in (PROJECT_ROOT / ".env", PROJECT_ROOT / "tools" / ".env"):
        if not path.is_file():
            continue
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for line in raw.splitlines():
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            if s.lower().startswith("export "):
                s = s[7:].strip()
            if "=" not in s:
                continue
            key, _, val = s.partition("=")
            key = key.strip()
            if not key or key in os.environ:
                continue
            val = val.strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                val = val[1:-1]
            os.environ[key] = val


_load_env_files()

# 可被环境变量覆盖。必须设置 PE_ART_API_KEY（或写入 .env）；网关根地址默认如下，也可用 PE_API_BASE 覆盖后自动拼接路径。
_API_BASE_DEFAULT = "http://35.220.164.252:3888"
API_BASE = (os.environ.get("PE_API_BASE") or _API_BASE_DEFAULT).rstrip("/")
API_KEY = (os.environ.get("PE_ART_API_KEY") or "").strip()
CHAT_URL = (os.environ.get("PE_CHAT_URL") or f"{API_BASE}/v1/chat/completions").strip()
IMAGE_URL = (os.environ.get("PE_IMAGE_URL") or f"{API_BASE}/v1/images/generations").strip()
CHAT_MODEL = os.environ.get("PE_CHAT_MODEL", "gpt-4o-mini")
IMAGE_MODEL = os.environ.get("PE_IMAGE_MODEL", "imagen-4.0-ultra-generate-001")
# 生图通道：openai | gemini | auto（先 OpenAI 式，403 再试 generateContent，适配常见网关）
PE_IMAGE_BACKEND = (os.environ.get("PE_IMAGE_BACKEND") or "auto").strip().lower()
GEMINI_IMAGE_URL = (
    os.environ.get("PE_GEMINI_IMAGE_URL")
    or f"{API_BASE}/v1beta/models/{IMAGE_MODEL}:generateContent"
).strip()


def require_art_api_key(purpose: str = "调用 LLM 或生图接口") -> None:
    if not API_KEY:
        raise RuntimeError(
            f"{purpose} 需要 PE_ART_API_KEY。"
            " 可在项目根或 tools 目录创建 .env，写入 PE_ART_API_KEY=你的密钥（勿提交 git）；"
            "或 PowerShell: $env:PE_ART_API_KEY='你的密钥'"
        )


ART_FOLDER = PROJECT_ROOT / "asset"
ART_SKILL_ICONS = ART_FOLDER / "skill_icons"
ART_BUFF_ICONS = ART_FOLDER / "buff_icons"  # 增幅/效果图标，画风与技能图标一致
SKILL_ICON_EXAMPLES_DIR = ART_SKILL_ICONS / "Examples"  # 风格参考图目录
# 深阶装备统一输出目录（相对 asset），可用环境变量覆盖
DEEP_EQUIPMENT_FOLDER = os.environ.get("PE_DEEP_EQUIPMENT_FOLDER", "deep_equipment").strip() or "deep_equipment"
EQUIPMENT_CONFIG = PROJECT_ROOT / "config" / "equipment-config.json"
EQUIPMENT_DEEP_CONFIG = PROJECT_ROOT / "config" / "equipment-deep-config.json"
DATA_CLASSES = PROJECT_ROOT / "js" / "data-classes.js"
SKILL_ICON_CONFIG = PROJECT_ROOT / "config" / "skill-icon-config.json"
BUFF_ICON_CONFIG = PROJECT_ROOT / "config" / "buff-icon-config.json"
SET_CONFIG = PROJECT_ROOT / "config" / "set-config.json"
MAPPINGS_CONFIG = PROJECT_ROOT / "config" / "mappings.json"

# 导出图标边长（技能/增幅/装备武器等经后处理统一为此尺寸，透明底 RGBA PNG）
EXPORT_ICON_SIZE = int(os.environ.get("PE_EXPORT_ICON_SIZE", "68"))
# 与边缘连通的「背景黑」判据（RGB 均不超过此值则从边缘 flood 为透明；主体内闭合黑色会保留）
CHROMA_KEY_THRESHOLD = int(os.environ.get("PE_CHROMA_KEY_THRESHOLD", "10"))

# 技能图标核心画风模板（生图仍用匀质黑底便于抠透明；保存为 68×68 透明 PNG）
SKILL_ICON_CORE_TEMPLATE = (
    "Pixel art skill icon, retro 16-bit style, ultra-detailed pixel clusters, clean central composition, "
    "solid pure black background (#000000) only behind the subject, flat uniform backdrop, no gradient sky, "
    "no decorative borders, no text, no stars, no level numbers, no element symbols, "
    "minimalistic design, razor-sharp edges, no anti-aliasing, fully opaque subject pixels"
)
# 三变量拼成 "... {shape} with {texture} in {color} palette"
SKILL_ICON_NEGATIVE_PROMPT = "text, numbers, stars, borders, UI elements, decorations"

# 武器装备栏贴图：与 tools/equipment-art-requirements.md 一致；远程与近战共用（仅主体由 GPT 描述，避免画风漂移）
EQUIPMENT_WEAPON_TEXTURE_STYLE_TEMPLATE = (
    "Pixel art equipment icon, retro 16-bit style, ultra-detailed pixel clusters, "
    "single weapon centered in frame, inventory item still-life, static pose, no action scene, "
    "solid pure black background (#000000) flat uniform behind the weapon only, no text, no watermark, no decorative border, no UI frame, "
    "minimalistic, razor-sharp pixel edges, no anti-aliasing, no photorealism, no 3D render look, "
    "same art style and pixel density as other melee weapon inventory icons in this game"
)
EQUIPMENT_WEAPON_NEGATIVE_PROMPT = (
    "photorealistic, realistic photo, photograph, 3d render, octane render, unreal engine, cinematic lighting, "
    "vector illustration, smooth gradients, oil painting, watercolor, sketch, anime screenshot, "
    "watermarks, text, letters, multiple weapons, character holding weapon, full body, busy background, "
    "motion blur, flying projectile filling frame, explosion, battlefield scene"
)
# 非武器部位（头盔/胸甲/护腿/鞋/项链/指环/腰带）：与 art-requirements-2026-03-19.md 「固定风格段」对应的英文模板（仍用黑底抠透明）
EQUIPMENT_NON_WEAPON_TEXTURE_STYLE_TEMPLATE = (
    "Pixel art equipment icon, dark fantasy RPG, retro 16-bit style, ultra-detailed pixel clusters, "
    "45-degree top-down view, inventory prop still-life, single piece centered in frame, static pose, no action scene, "
    "solid pure black background (#000000) flat uniform behind the item only, no text, no watermark, no decorative border, no UI frame, "
    "minimalistic, razor-sharp pixel edges, no anti-aliasing, no photorealism, no 3D render look, "
    "consistent pixel density with other equipment inventory icons in this game"
)
EQUIPMENT_NON_WEAPON_NEGATIVE_PROMPT = (
    "photorealistic, realistic photo, photograph, 3d render, octane render, unreal engine, cinematic lighting, "
    "vector illustration, smooth gradients, oil painting, watercolor, sketch, anime screenshot, "
    "watermarks, text, letters, multiple items, character wearing armor, full body portrait, busy background, "
    "motion blur, explosion, battlefield scene, dramatic cinematic scene"
)
# 兼容旧逻辑命名：边缘暗像素在透明流程中同样视为可扩展背景
EDGE_CLEAN_THRESHOLD = 10

# 深阶装备：8 主题 × 5 品质（英文关键词供拼接提示词），见 tools/art-requirements-2026-03-19.md 第四节
DEEP_THEME_KEYWORDS_CN = {
    "渊隙": "abyss, cracked earth, glowing purple fissures, void, dark rock",
    "虚印": "rune, ethereal, ghostly light, silver-blue, spiritual",
    "腐噬": "corrosion, green slime, rotted metal, decay, mold",
    "黑曜": "obsidian, sharp edges, black crystal, volcanic glass",
    "终幕": "curtain, shadow, draped fabric, dark gold, theatrical",
    "星骸": "star fragments, meteor iron, cosmic dust, dark blue, cracks",
    "裂点": "fracture, cracked crystal, shattered, lightning cracks",
    "终焉": "apocalyptic, ruined, dark sun, crimson, ash",
}
DEEP_QUALITY_MODIFIERS_CN = {
    "凡": "simple, minimal decoration",
    "良": "some details, minor ornaments",
    "湛": "intricate, detailed engravings",
    "炽": "ornate, glowing accents, rich details",
    "曜": "magnificent, radiant aura, legendary",
}
# 深阶资源文件名用英文 slug（与中文主题/品质一一对应）
DEEP_THEME_FILE_SLUG = {
    "渊隙": "abyss_rift",
    "虚印": "spectral_sigil",
    "腐噬": "rot_devour",
    "黑曜": "obsidian",
    "终幕": "final_curtain",
    "星骸": "star_wreck",
    "裂点": "fracture_node",
    "终焉": "terminus",
}
DEEP_QUALITY_FILE_SLUG = {
    "凡": "q01",
    "良": "q02",
    "湛": "q03",
    "炽": "q04",
    "曜": "q05",
}
# 深阶主题“视觉指纹”：主色调 + 核心材质 + 装饰符号 + 光效（用于降低主题间同质化）
DEEP_THEME_FINGERPRINTS = {
    "渊隙": {
        "palette": "dark purple and deep gray",
        "material": "rift rock and dark metal",
        "symbols": "crack patterns and glowing fissures",
        "fx": "violet fissure glow and undercurrent swirl",
    },
    "虚印": {
        "palette": "silver-blue and pale white",
        "material": "runic stone and spectral material",
        "symbols": "luminous runes and ghostly contours",
        "fx": "blue-white bloom and semi-transparent sheen",
    },
    "腐噬": {
        "palette": "dark green and rusty brown",
        "material": "corroded metal and viscous slime",
        "symbols": "fungal stains and corrosion holes",
        "fx": "toxic green mist and dripping slime",
    },
    "黑曜": {
        "palette": "pure black and dark red",
        "material": "obsidian and volcanic rock",
        "symbols": "sharp facets and magma veins",
        "fx": "crimson cracks and mirror-like highlights",
    },
    "终幕": {
        "palette": "deep violet and dark gold",
        "material": "draped cloth and aged bronze",
        "symbols": "curtain folds and ritual trims",
        "fx": "shadow gradients and dim golden halo",
    },
    "星骸": {
        "palette": "deep blue and dark silver",
        "material": "meteor iron and cosmic dust",
        "symbols": "star specks and fractured lines",
        "fx": "starlight glints and metallic reflections",
    },
    "裂点": {
        "palette": "dark blue and silver gray",
        "material": "cracked crystal and charged metal",
        "symbols": "lightning fractures and shard motifs",
        "fx": "blue electric arcs and shattered energy feel",
    },
    "终焉": {
        "palette": "dark crimson and charred black",
        "material": "ruined metal and ash deposits",
        "symbols": "broken structures and eclipse marks",
        "fx": "pulsing red glow and burning embers",
    },
}
# 品质五档视觉阶梯（见 tools/deep-equipment-prompt-feedback-v2.md）：复杂度 / 光效 / 装饰 / 材质质感
DEEP_QUALITY_VISUAL = {
    "凡": {
        "complexity": "lowest tier silhouette, basic shape only",
        "glow": "no glow, fully matte",
        "details": "no ornaments, flat even surfaces, no gems",
        "material": "rough base metal or crude stone, unpolished",
    },
    "良": {
        "complexity": "simple build with a few accents",
        "glow": "faint self-light from cracks or runes only",
        "details": "small rivets, simple etched lines, one or two tiny trims",
        "material": "lightly worn metal with basic texture",
    },
    "湛": {
        "complexity": "clear layered structure",
        "glow": "steady visible glow from fissures or runes",
        "details": "fine engravings, one small gem inlay, layered plates",
        "material": "refined polished metal, clean edges",
    },
    "炽": {
        "complexity": "high ornament density",
        "glow": "strong glow with floating particles and soft halo",
        "details": "multiple gems, ornate filigree, runic symbols, rich borders",
        "material": "premium dark gold or dark silver fantasy alloy",
    },
    "曜": {
        "complexity": "legendary intricate silhouette, complex geometry",
        "glow": "radiant aura, dynamic particle streams, outer halo",
        "details": "full-surface runes or cracks, mythic ornaments, rare crystal accents",
        "material": "meteor iron, stardust flecks, obsidian glass fusion, epic rarity",
    },
}
# 深阶远程：仅弓类或法杖类，禁止枪械（negative 追加）
DEEP_RANGED_FIREARMS_NEGATIVE = (
    "gun, rifle, pistol, musket, firearm, cannon, shotgun, revolver, modern gun, sci-fi gun, "
    "crossbow that looks like a gun, mechanical firearm, bullet, cartridge, scope on rifle"
)
# 主题强度分层（低/中/高主题的材质老化、结构、光效强度）
DEEP_THEME_INTENSITY = {
    "渊隙": "low-tier presence: rough material, simple fissures, restrained glow",
    "虚印": "low-tier presence: clean structure, subtle glyph light, restrained glow",
    "腐噬": "mid-tier presence: stronger corrosion, richer details, visible toxic aura",
    "黑曜": "mid-tier presence: sharp geometry, heavier contrast, obvious crack glow",
    "终幕": "mid-tier presence: layered trims, dramatic folds, noticeable dark-gold halo",
    "星骸": "high-tier presence: rare material feel, complex structure, strong luminous glints",
    "裂点": "high-tier presence: reconstructed fractured form, intense electric accents",
    "终焉": "high-tier presence: catastrophic silhouette, heavy damage motifs, intense ember glow",
}
# 批量深阶：部位中文标签 + 规划用一句「重点」（写入用户描述，供 GPT 或直连生图）
# 深阶一键批量：slot_key、asset 子目录、映射/文件名后缀、中文补充、英文主体（武器行为近战；远程见 run_deep_equipment_batch）
DEEP_SLOT_BATCH_ROWS = [
    {
        "slot": "weapon",
        "folder": "weapons",
        "suffix": "武器",
        "cn_extra": "近战武器，强调刃型、柄部、护手，静物道具，无挥砍动态",
        "cn_extra_ranged": "远程武器仅为长弓/反曲弓或法杖魔杖，禁止枪械弩炮；静物，无箭矢飞行",
        "en_subject": "Single melee weapon inventory icon, blade haft crossguard and pommel, static dark fantasy still life",
        "en_subject_ranged": "Single fantasy ranged prop: longbow or recurve bow with string and quiver, OR magical staff wand scepter with crystal top, static still life, no firearms",
    },
    {"slot": "helmet", "folder": "helmets", "suffix": "头盔", "cn_extra": "头盔，强调面甲、角、冠饰", "en_subject": "Helmet icon, faceplate horns crown details, static inventory still life"},
    {"slot": "chest", "folder": "chests", "suffix": "胸甲", "cn_extra": "胸甲，强调肩甲、胸板纹理", "en_subject": "Chest armor, pauldrons breastplate texture, static icon"},
    {"slot": "legs", "folder": "legs", "suffix": "腿甲", "cn_extra": "腿甲，强调膝甲、裙甲", "en_subject": "Leg armor, knee guards tassets, static icon"},
    {"slot": "boots", "folder": "boots", "suffix": "足具", "cn_extra": "足具，强调靴型、护踝", "en_subject": "Boots or greaves, ankle guards, static icon"},
    {"slot": "necklace", "folder": "necklaces", "suffix": "项链", "cn_extra": "项链，小型装备，强调主宝石与链节", "en_subject": "Necklace jewelry, focal gem and chain links, small static icon"},
    {"slot": "ring", "folder": "rings", "suffix": "指环", "cn_extra": "指环，小型装备，强调戒面纹饰与宝石", "en_subject": "Ring jewelry, band engravings focal gem, small static icon"},
    {"slot": "belt", "folder": "belts", "suffix": "腰带", "cn_extra": "腰带，强调带扣与链节搭扣", "en_subject": "Belt buckle plates chain links, static icon"},
]

# 当 GPT 因内容策略(content_filter)拒绝时，使用硬编码方案直接生成图标，避免敏感词
SKILL_ICON_FALLBACK_PLANS = {
    "星坠审判": {
        "shape": "falling star and meteor silhouette",
        "texture": "radiating light trails and particle sparks",
        "color": "golden white and deep blue",
    },
}

# 增幅/效果图标提示词（与 tools/icon-requirements.md 一致，画风与技能图标一致：用 SKILL_ICON_CORE_TEMPLATE + 下表后缀）
BUFF_ICON_PROMPTS = {
    # 一、基础属性增幅
    "attack": "centered upward-thrusting sword with fiery glow, vibrant red color",
    "defense": "centered sturdy shield with metallic sheen, deep blue color",
    "health": "centered pulsing heart with soft glow, warm red color",
    "critRate": "centered lightning bolt inside a circle, electric yellow color",
    "critDamage": "centered exploding star with sharp rays, bright orange color",
    "dodge": "centered ghostly silhouette with afterimage, misty purple color",
    "attackSpeed": "crossed daggers with motion trails, vibrant green color",
    "moveSpeed": "winged boot with speed lines, swift cyan color",
    "allStats": "four-pointed star with multicolor glow (red, blue, green, yellow)",
    # 二、药水/Buff
    "duration": "centered hourglass with falling sand particles, glowing white color",
    # 三、武器精炼增幅
    "damageMultiplier": "sword engulfed in fiery aura, intense red-orange color",
    "cooldownReduction": "clockwise arrow looping around a gear, cool blue color",
    "rangeMultiplier": "expanding concentric circles, vibrant purple color",
    "dodgeInvincibleDuration": "ghost figure with protective halo, ethereal white color",
    "guaranteedCrit": "bullseye target with lightning strike, electric yellow color",
    "dotDamage": "toxic droplet with green fumes, venomous green color",
    "freezeEffect": "sharp snowflake with icy mist, frosty blue color",
    "healPercent": "plus sign inside a glowing heart, restorative green color",
    "pierce": "arrow piercing through shield, piercing orange color",
    "refine_resetSkillCooldownOnKill": "circular arrow with skull motif, dark purple color",
    # 四、套装特殊效果
    "killHeal": "skull with green plus sign, necrotic green color",
    "damageToHeal": "shield absorbing arrow into heart, pink aura",
    "deathImmunity": "phoenix rising from flames, fiery orange-red color",
    "flameExplosion": "fireball erupting into smaller flames, blazing red color",
    "chainLightning": "lightning bolt branching to smaller bolts, electric yellow",
    "dragonCounter": "dragon head breathing fire at arrow, fierce red color",
    "dragonRage": "cracked heart with fiery core, burning red color",
    "damageImmunity": "crossed swords over shield, metallic silver color",
    "divineProtection": "glowing halo with feather wings, golden white light",
    "areaFreeze": "snowflake with expanding icy rings, frost blue color",
    # 五、装备词条（通用）
    "extra_damage": "sword with extra blade fragment, sharp red color",
    "heal": "heart with pulsating plus sign, healing green",
    "freeze": "ice crystal with frost spikes, cold blue",
    "move_speed": "boot with wind swirls, swift cyan",
    "kill_heal": "skull with heart in mouth, dark red",
    "low_hp_buff": "cracked shield with fire, danger orange",
    "cooldown": "hourglass with lightning, electric blue",
    "combo": "three swords in sequence, metallic gray",
    "aoe_damage": "explosion with radial lines, fiery orange",
    "reflect_damage": "spiked shield, silver with red accents",
    # 六、炼金（通用）
    "alchemy_material": "crystal cluster with multicolor glow, mineral texture",
    "potion_effect": "bubbling flask with glowing liquid, glass texture",
}

# 装备部位与子文件夹对应（保持项目整洁）
SLOT_TO_SUBFOLDER = {
    "weapon": "weapons",
    "helmet": "helmets",
    "chest": "chests",
    "legs": "legs",
    "boots": "boots",
    "necklace": "necklaces",
    "ring": "rings",
    "belt": "belts",
}
FOLDER_TO_SLOT = {v: k for k, v in SLOT_TO_SUBFOLDER.items()}
DEEP_SLOT_FEATURES = {
    "weapon": "single weapon silhouette, blade/body/core grip details",
    "helmet": "faceplate, crown or horn details",
    "chest": "breastplate and shoulder structure emphasis",
    "legs": "knee guards and layered tassets",
    "boots": "boot silhouette, ankle guard, sole accents",
    "necklace": "focal gemstone and chain links",
    "ring": "band engravings and focal gem seat",
    "belt": "buckle assembly and chain/strap joints",
}


def infer_equipment_slot_from_plan(plan: dict) -> str:
    """从规划结果推断装备 slot（weapon/helmet/...），未知返回空串。"""
    slot = (plan.get("equipment_slot") or "").strip().lower()
    if slot in SLOT_TO_SUBFOLDER:
        return slot
    entry = plan.get("equipment_entry")
    if isinstance(entry, dict):
        es = (entry.get("slot") or "").strip().lower()
        if es in SLOT_TO_SUBFOLDER:
            return es
    rel = (plan.get("relative_folder") or "").strip().replace("\\", "/")
    if rel in FOLDER_TO_SLOT:
        return FOLDER_TO_SLOT[rel]
    return ""


def parse_deep_equipment_name(name: str) -> tuple:
    """从深阶名中提取 (theme_cn, quality_cn, suffix)。非深阶返回空串。"""
    n = (name or "").strip()
    if not n or "·" not in n:
        return "", "", ""
    left, suffix = n.split("·", 1)
    if not left:
        return "", "", suffix.strip()
    quality = left[-1]
    theme = left[:-1]
    if theme in DEEP_THEME_FINGERPRINTS and quality in DEEP_QUALITY_VISUAL:
        return theme, quality, suffix.strip()
    return "", "", suffix.strip()


def deep_ranged_weapon_inventory_phrase(name: str) -> str:
    """深阶远程：仅弓类或法杖/魔杖/权杖，稳定二选一（按名称 hash），语义排除枪械。"""
    h = sum(ord(c) for c in (name or "")) % 2
    if h == 0:
        return (
            "single fantasy longbow or recurve bow inventory icon, taut bowstring, "
            "quiver with arrows beside bow, bow limbs and grip clearly visible, static still life, "
            "no flying arrows, no firearm parts"
        )
    return (
        "single fantasy magical staff wand or scepter inventory icon, ornate carved shaft, "
        "crystal orb or gem focal at top, arcane rod prop, static still life, "
        "no gun barrel trigger or stock"
    )


def build_deep_equipment_subject(eq: dict) -> str:
    """为深阶装备生成强约束英文主体提示词：主题指纹 + 品质五档（复杂度/光效/装饰/材质）。"""
    name = (eq.get("name") or "").strip()
    slot = (eq.get("slot") or "").strip().lower()
    wtype = (eq.get("weaponType") or "melee").strip().lower()
    theme, quality, _suffix = parse_deep_equipment_name(name)
    if not theme:
        theme = "渊隙"
    if not quality:
        quality = "凡"
    fp = DEEP_THEME_FINGERPRINTS[theme]
    qv = DEEP_QUALITY_VISUAL.get(quality) or DEEP_QUALITY_VISUAL["凡"]
    intensity = DEEP_THEME_INTENSITY.get(theme, "")
    if slot == "weapon":
        if wtype == "ranged":
            slot_core = deep_ranged_weapon_inventory_phrase(name)
        else:
            slot_core = (
                "single melee weapon inventory icon: sword axe mace or polearm, "
                "blade haft crossguard pommel, static still life"
            )
    else:
        slot_core = DEEP_SLOT_FEATURES.get(slot, "single equipment piece inventory icon")
    q_block = (
        f"quality tier ({quality}): complexity {qv['complexity']}; "
        f"light {qv['glow']}; ornaments {qv['details']}; surface feel {qv['material']}"
    )
    return (
        f"{slot_core}, {theme} theme visual fingerprint, "
        f"palette {fp['palette']}, core material {fp['material']}, "
        f"ornament symbols {fp['symbols']}, texture and light {fp['fx']}, "
        f"{q_block}, {intensity}, distinct silhouette, readable at small icon size"
    )


def collect_project_context():
    """读取项目文件夹下的关键内容，供 GPT 决策使用。"""
    context = {
        "project_md": "",
        "equipment_list": [],
        "existing_assets": [],
        "asset_subfolders": [],
    }

    # PROJECT.md
    pmd = PROJECT_ROOT / "PROJECT.md"
    if pmd.exists():
        context["project_md"] = pmd.read_text(encoding="utf-8")

    # 装备配置：从 equipment-config.json 提取装备名与部位
    if EQUIPMENT_CONFIG.exists():
        with open(EQUIPMENT_CONFIG, 'r', encoding='utf-8') as f:
            data = json.load(f)
            equipment_defs = data.get("EQUIPMENT_DEFINITIONS", [])
            for eq in equipment_defs:
                context["equipment_list"].append({"slot": eq.get("slot", ""), "name": eq.get("name", "")})

    # asset 下已有文件（含子文件夹）
    if ART_FOLDER.exists():
        for f in ART_FOLDER.rglob("*"):
            if f.is_file() and f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
                rel = f.relative_to(ART_FOLDER)
                context["existing_assets"].append(rel.as_posix())
                if len(rel.parts) > 1:
                    sub = rel.parts[0]
                    if sub not in context["asset_subfolders"]:
                        context["asset_subfolders"].append(sub)

    return context


def collect_weapon_entries_from_config() -> list:
    """从 equipment-config.json 读取所有武器定义（名称、weaponType、品质等）。"""
    if not EQUIPMENT_CONFIG.exists():
        return []
    with open(EQUIPMENT_CONFIG, "r", encoding="utf-8") as f:
        data = json.load(f)
    out = []
    for eq in data.get("EQUIPMENT_DEFINITIONS", []):
        if eq.get("slot") != "weapon":
            continue
        wt = (eq.get("weaponType") or "melee").strip().lower()
        if wt not in ("melee", "ranged"):
            wt = "melee"
        out.append(
            {
                "name": eq.get("name", "").strip(),
                "weaponType": wt,
                "quality": eq.get("quality", "common"),
                "level": eq.get("level", 1),
            }
        )
    return [w for w in out if w["name"]]


def build_weapon_type_by_name() -> dict:
    """装备中文名 -> 'melee' | 'ranged'（供技能图标规划判断远程）。"""
    m = {}
    for w in collect_weapon_entries_from_config():
        m[w["name"]] = w["weaponType"]
    return m


def _asset_digest8(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()[:8]


def _equipment_row_with_deep_flag(eq: dict) -> dict:
    row = dict(eq)
    if row.get("isDeep"):
        return row
    theme, quality, _suf = parse_deep_equipment_name((row.get("name") or "").strip())
    if theme and quality:
        row["isDeep"] = True
    return row


def equipment_english_basename_stem(eq: dict) -> str:
    """不含扩展名，仅 a-z0-9_（深阶 deep_主题_品质_摘要；否则 eq_槽位_摘要）。"""
    eq = _equipment_row_with_deep_flag(eq)
    name = (eq.get("name") or "").strip()
    slot = (eq.get("slot") or "weapon").strip().lower()
    theme, quality, _suffix = parse_deep_equipment_name(name)
    if theme and quality:
        tslug = DEEP_THEME_FILE_SLUG.get(theme) or _asset_digest8(theme)
        qslug = DEEP_QUALITY_FILE_SLUG.get(quality) or _asset_digest8(quality)
        return f"deep_{tslug}_{qslug}_{_asset_digest8(name)}"
    digest = _asset_digest8(f"{slot}|{name}")
    return f"eq_{slot}_{digest}"


def equipment_english_relpath(eq: dict) -> str:
    """新生成装备贴图写入的相对 asset 路径（英文文件名）。"""
    eq = _equipment_row_with_deep_flag(eq)
    stem = equipment_english_basename_stem(eq) + ".png"
    slot = (eq.get("slot") or "weapon").strip().lower()
    if eq.get("isDeep"):
        return f"{DEEP_EQUIPMENT_FOLDER}/{stem}"
    sub = SLOT_TO_SUBFOLDER.get(slot)
    if sub:
        return f"{sub}/{stem}"
    return stem


def _mapping_relpath_for_equipment_name(name: str) -> str:
    if not name or not MAPPINGS_CONFIG.exists():
        return ""
    try:
        with open(MAPPINGS_CONFIG, "r", encoding="utf-8") as f:
            data = json.load(f)
        rel = str((data.get("equipment") or {}).get(name) or "").strip().replace("\\", "/")
        return rel
    except (OSError, json.JSONDecodeError):
        return ""


def equipment_existing_texture_abs_path(eq: dict):
    """若已有任意兼容路径下的贴图文件则返回其绝对路径，否则 None。"""
    eq = _equipment_row_with_deep_flag(eq)
    name = (eq.get("name") or "").strip()
    slot = (eq.get("slot") or "weapon").strip().lower()
    if not name:
        return None
    rel_map = _mapping_relpath_for_equipment_name(name)
    if rel_map:
        p = ART_FOLDER / rel_map
        if p.is_file():
            return p
    rel_en = equipment_english_relpath(eq)
    p_en = ART_FOLDER / rel_en
    if p_en.is_file():
        return p_en
    if eq.get("isDeep"):
        leg = ART_FOLDER / DEEP_EQUIPMENT_FOLDER / f"{name}.png"
        if leg.is_file():
            return leg
    if slot in SLOT_TO_SUBFOLDER:
        leg2 = ART_FOLDER / SLOT_TO_SUBFOLDER[slot] / f"{name}.png"
        if leg2.is_file():
            return leg2
    leg_root = ART_FOLDER / f"{name}.png"
    if leg_root.is_file():
        return leg_root
    return None


def get_weapon_asset_relpath(weapon_name: str) -> str:
    """游戏内装备图相对 asset 的路径（与 AssetManager.getEquipmentImageName 一致）。"""
    name = (weapon_name or "").strip()
    rel_map = _mapping_relpath_for_equipment_name(name)
    if rel_map:
        return rel_map
    wt = "melee"
    for w in collect_weapon_entries_from_config():
        if w.get("slot") == "weapon" and w.get("name") == name:
            wt = (w.get("weaponType") or "melee").strip().lower()
            if wt not in ("melee", "ranged"):
                wt = "melee"
            break
    row = {"name": name, "slot": "weapon", "weaponType": wt, "isDeep": False}
    ex = equipment_existing_texture_abs_path(row)
    if ex is not None:
        try:
            return ex.relative_to(ART_FOLDER).as_posix()
        except ValueError:
            pass
    return equipment_english_relpath(row)


def weapon_texture_resolved_path(weapon_name: str) -> Path:
    """asset 目录下该武器贴图应存在的绝对路径。"""
    rel = get_weapon_asset_relpath(weapon_name)
    return ART_FOLDER / rel


def resolve_equipment_texture_relpath(eq: dict) -> str:
    """装备贴图相对 asset 的路径：优先 mappings；否则已有兼容文件；再否则为将使用的英文路径。"""
    name = (eq.get("name") or "").strip()
    slot = (eq.get("slot") or "weapon").strip().lower()
    if not name:
        return ""
    rel_map = _mapping_relpath_for_equipment_name(name)
    if rel_map:
        return rel_map
    ex = equipment_existing_texture_abs_path(eq)
    if ex is not None:
        try:
            return ex.relative_to(ART_FOLDER).as_posix()
        except ValueError:
            pass
    return equipment_english_relpath(eq)


def equipment_texture_resolved_path_from_eq(eq: dict) -> Path:
    """asset 下该装备贴图期望路径（绝对路径）。"""
    rel = resolve_equipment_texture_relpath(eq)
    return ART_FOLDER / rel if rel else ART_FOLDER


def resolve_batch_texture_relpath(eq: dict) -> str:
    """批量/列表展示用：新生成将写入的相对路径（英文文件名）。"""
    return equipment_english_relpath(eq)


def equipment_batch_resolved_path(eq: dict) -> Path:
    """批量流程中判定「文件是否已存在」；若不存在则目标为英文路径。"""
    ex = equipment_existing_texture_abs_path(eq)
    if ex is not None:
        return ex
    rel = equipment_english_relpath(eq)
    return ART_FOLDER / rel if rel else ART_FOLDER


def _equipment_row_from_json(eq: dict) -> dict:
    """将单条 JSON 装备定义转为批量贴图用的 dict；不合法返回 None。"""
    name = (eq.get("name") or "").strip()
    slot = (eq.get("slot") or "").strip().lower()
    if not name or slot not in SLOT_TO_SUBFOLDER:
        return None
    wt = "melee"
    if slot == "weapon":
        wt = (eq.get("weaponType") or "melee").strip().lower()
        if wt not in ("melee", "ranged"):
            wt = "melee"
    return {
        "name": name,
        "slot": slot,
        "weaponType": wt,
        "quality": eq.get("quality", "common"),
        "level": eq.get("level", 1),
        "isDeep": False,
    }


def collect_all_equipment_entries_from_config() -> list:
    """从 equipment-config.json 读取全部装备（含武器与各防具/饰品槽位）。"""
    if not EQUIPMENT_CONFIG.exists():
        return []
    with open(EQUIPMENT_CONFIG, "r", encoding="utf-8") as f:
        data = json.load(f)
    out = []
    for eq in data.get("EQUIPMENT_DEFINITIONS", []):
        row = _equipment_row_from_json(eq)
        if row:
            out.append(row)
    return out


def collect_deep_equipment_entries_from_config() -> list:
    """从 equipment-deep-config.json 读取全部深阶装备（真实名称如 渊隙凡·低语）。"""
    if not EQUIPMENT_DEEP_CONFIG.exists():
        return []
    with open(EQUIPMENT_DEEP_CONFIG, "r", encoding="utf-8") as f:
        data = json.load(f)
    out = []
    for eq in data.get("EQUIPMENT_DEEP_DEFINITIONS", []):
        row = _equipment_row_from_json(eq)
        if row:
            row["isDeep"] = True
            out.append(row)
    return out


def add_equipment_mapping(weapon_name: str, relative_path: str) -> None:
    """在 mappings.json 的 equipment 中写入或更新 装备名 -> 相对路径。"""
    MAPPINGS_CONFIG.parent.mkdir(parents=True, exist_ok=True)
    if not MAPPINGS_CONFIG.exists():
        data = {"equipment": {}}
    else:
        with open(MAPPINGS_CONFIG, "r", encoding="utf-8") as f:
            data = json.load(f)
    if "equipment" not in data:
        data["equipment"] = {}
    data["equipment"][weapon_name] = relative_path.replace("\\", "/")
    with open(MAPPINGS_CONFIG, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _get_weapon_skills_js_weapon_block() -> str:
    """从 data-classes.js 截取 weaponSkills 对象片段（不含 qualitySkills），失败返回空串。"""
    if not DATA_CLASSES.exists():
        return ""
    text = DATA_CLASSES.read_text(encoding="utf-8")
    start = text.find("getWeaponSkill() {")
    if start < 0:
        return ""
    end = text.find("generateEquipmentTraits()", start)
    if end < 0:
        end = len(text)
    block = text[start:end]
    weapon_block_end = block.find("if (weaponSkills[this.name])")
    if weapon_block_end < 0:
        weapon_block_end = block.find("qualitySkills = {")
    if weapon_block_end < 0:
        weapon_block_end = len(block)
    return block[:weapon_block_end]


_WEAPON_SKILL_BY_WEAPON_CACHE = None


def get_weapon_skill_lookup() -> dict:
    """武器中文名 -> {skill_name, description}（来自 weaponSkills，供贴图规划体现技能主题）。"""
    global _WEAPON_SKILL_BY_WEAPON_CACHE
    if _WEAPON_SKILL_BY_WEAPON_CACHE is not None:
        return _WEAPON_SKILL_BY_WEAPON_CACHE
    _WEAPON_SKILL_BY_WEAPON_CACHE = {}
    weapon_block = _get_weapon_skills_js_weapon_block()
    if not weapon_block:
        return _WEAPON_SKILL_BY_WEAPON_CACHE
    for m in re.finditer(r"\s*['\"]([^'\"]+)['\"]\s*:\s*\{\s*name\s*:\s*['\"]([^'\"]+)['\"]", weapon_block):
        wn, skill_name = m.group(1).strip(), m.group(2).strip()
        desc_m = re.search(r"description\s*:\s*['\"]([^'\"]*)['\"]", weapon_block[m.end() : m.end() + 400])
        desc = desc_m.group(1).strip() if desc_m else ""
        _WEAPON_SKILL_BY_WEAPON_CACHE[wn] = {"skill_name": skill_name, "description": desc}
    return _WEAPON_SKILL_BY_WEAPON_CACHE


def collect_weapon_skills() -> list:
    """从 data-classes.js 的 getWeaponSkill 中解析出所有武器技能（名称、描述、对应武器列表），去重。"""
    if not DATA_CLASSES.exists():
        return []
    text = DATA_CLASSES.read_text(encoding="utf-8")
    start = text.find("getWeaponSkill() {")
    if start < 0:
        return []
    end = text.find("generateEquipmentTraits()", start)
    if end < 0:
        end = len(text)
    block = text[start:end]
    # 只从 weaponSkills 段解析「武器名 -> 技能名」，避免把 qualitySkills 的 common/rare 等当武器
    weapon_block_end = block.find("if (weaponSkills[this.name])")
    if weapon_block_end < 0:
        weapon_block_end = block.find("qualitySkills = {")
    if weapon_block_end < 0:
        weapon_block_end = len(block)
    weapon_block = block[:weapon_block_end]
    by_skill = {}
    for m in re.finditer(r"\s*['\"]([^'\"]+)['\"]\s*:\s*\{\s*name\s*:\s*['\"]([^'\"]+)['\"]", weapon_block):
        weapon_name, skill_name = m.group(1).strip(), m.group(2).strip()
        if not skill_name:
            continue
        desc_m = re.search(r"description\s*:\s*['\"]([^'\"]*)['\"]", weapon_block[m.end() : m.end() + 350])
        desc = desc_m.group(1).strip() if desc_m else ""
        if skill_name not in by_skill:
            by_skill[skill_name] = {"description": desc, "weapon_names": []}
        by_skill[skill_name]["weapon_names"].append(weapon_name)
        by_skill[skill_name]["description"] = desc
    # qualitySkills 中出现的技能名（若无武器则 weapon_names 为空）
    quality_start = block.find("const qualitySkills = {")
    if quality_start >= 0:
        quality_block = block[quality_start : quality_start + 2500]
        for m in re.finditer(r"name\s*:\s*['\"]([^'\"]+)['\"]", quality_block):
            skill_name = m.group(1).strip()
            if not skill_name or skill_name in by_skill:
                continue
            desc_m = re.search(r"description\s*:\s*['\"]([^'\"]*)['\"]", quality_block[m.end() : m.end() + 250])
            by_skill[skill_name] = {
                "description": desc_m.group(1).strip() if desc_m else "",
                "weapon_names": [],
            }
    return [
        {"name": k, "description": v["description"], "weapon_names": v["weapon_names"]}
        for k, v in by_skill.items()
    ]


def get_weapon_trait(weapon_name: str) -> str:
    """从 data-classes.js 的 nameTraits 中读取武器词条描述，无则返回空字符串。"""
    if not DATA_CLASSES.exists() or not weapon_name:
        return ""
    text = DATA_CLASSES.read_text(encoding="utf-8")
    start = text.find("const nameTraits = {")
    if start < 0:
        return ""
    end = text.find("if (nameTraits[this.name])", start)
    if end < 0:
        end = start + 8000
    block = text[start:end]
    # 匹配 '武器名': { id: '...', description: '...' }
    esc = re.escape(weapon_name)
    m = re.search(r"['\"]" + esc + r"['\"]\s*:\s*\{\s*id\s*:[^}]*description\s*:\s*['\"]([^'\"]*)['\"]", block)
    if m:
        return m.group(1).strip()
    m = re.search(r"['\"]" + esc + r"['\"]\s*:\s*\{[^}]*description\s*:\s*['\"]([^'\"]*)['\"]", block, re.DOTALL)
    return m.group(1).strip() if m else ""


def get_set_for_weapon(weapon_name: str) -> str:
    """从 set-config.json 的 SET_DEFINITIONS 中读取武器所属套装名称，无则返回空字符串。"""
    if not SET_CONFIG.exists() or not weapon_name:
        return ""
    with open(SET_CONFIG, 'r', encoding='utf-8') as f:
        data = json.load(f)
        set_defs = data.get("SET_DEFINITIONS", {})
        for set_id, set_data in set_defs.items():
            pieces = set_data.get("pieces", [])
            if weapon_name in pieces:
                return set_data.get("name", "")
    return ""


def get_set_for_equipment(equipment_name: str) -> str:
    """任意装备部位：从 set-config 读取所属套装中文名。"""
    return get_set_for_weapon(equipment_name)


# 非武器批量规划时注入 GPT 的部位重点（中文）
NON_WEAPON_SLOT_PLAN_HINTS = {
    "helmet": "头盔静物图标：强调面甲、角饰或冠饰；不要头肩肖像或真人脸。",
    "chest": "胸甲静物：强调肩甲、胸板纹理与材质。",
    "legs": "腿甲静物：强调膝甲、裙甲或胫甲。",
    "boots": "足具静物：强调靴型、护踝、靴底。",
    "necklace": "项链静物：小型道具，强调主宝石与链节。",
    "ring": "指环静物：强调戒面纹饰与宝石。",
    "belt": "腰带静物：强调带扣、链节与搭扣。",
}


def _skill_icon_filename(skill_name: str) -> str:
    """技能图标：稳定英文文件名（映射仍用游戏内技能中文名）。"""
    d = _asset_digest8((skill_name or "").strip() or "skill")
    return f"skill_{d}.png"


def _buff_icon_filename(key: str) -> str:
    """增幅图标：键已为安全 ASCII 时沿用，否则英文摘要名。"""
    k = (key or "").strip()
    if k and re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", k):
        return f"{k}.png"
    return f"buff_{_asset_digest8(k)}.png"


def collect_existing_skill_icons() -> dict:
    """返回已有图标的技能名 -> 文件名（从 skill-icon-config.json 的 SKILL_ICON_MAP 读取）。
    仅当配置中有条目且对应文件存在时，才视为「已配置」。
    """
    out = {}
    if not SKILL_ICON_CONFIG.exists():
        return out
    with open(SKILL_ICON_CONFIG, 'r', encoding='utf-8') as f:
        data = json.load(f)
        skill_map = data.get("SKILL_ICON_MAP", {})
        for key, val in skill_map.items():
            if key and val:
                # 排除明显不是技能名的键（如纯英文变量名）
                if not (key.isascii() and len(key) < 2):
                    out[key] = val
    return out


def detect_batch_skill_icons(user_input: str) -> bool:
    """判断用户是否在要求「生成/补齐所有武器技能图标」。"""
    t = user_input.strip()
    if not t:
        return False
    has_all = "所有" in t or "全部" in t or "批量" in t
    has_skill = "武器技能" in t or "技能" in t
    has_icon = "图标" in t or "icon" in t.lower() or "图" in t
    has_generate = "生成" in t or "补齐" in t or "补全" in t or "做" in t
    return (has_all or "武器技能" in t) and has_skill and (has_icon or has_generate)


def _skill_effect_to_english(desc: str) -> str:
    """把技能描述转成简短英文，用于 content_filter 重试时的中性提示，避免敏感词。"""
    if not (desc or desc.strip()):
        return "single-target damage"
    d = desc.strip()
    parts = []
    if "周围" in d or "所有敌人" in d or "范围" in d:
        parts.append("area damage")
    elif "目标" in d or "对目标" in d:
        parts.append("single-target damage")
    if "恢复生命" in d or "恢复生命值" in d or "治疗" in d:
        parts.append("heals the caster")
    if "持续伤害" in d or "附加" in d and "伤害" in d:
        parts.append("damage over time")
    if "暴击" in d or "必定暴击" in d:
        parts.append("critical hit")
    if "减速" in d or "降低" in d and "速度" in d:
        parts.append("slows enemies")
    if "冰冻" in d or "冰冻效果" in d:
        parts.append("freeze effect")
    if "提升" in d and ("攻击" in d or "移速" in d or "闪避" in d):
        parts.append("self buff")
    if not parts:
        return "RPG ability effect"
    return ", ".join(parts)


def call_gpt_plan_skill_icon(
    context: dict,
    skill_name: str,
    skill_description: str,
    weapon_names: list = None,
    weapon_trait: str = "",
    set_name: str = "",
    is_ranged_weapon_skill: bool = False,
) -> dict:
    """为单个技能图标向 GPT 要三变量（主体形状、动态纹理、主色调），结合武器特征、套装、技能效果与攻击方式。"""
    try:
        import requests
    except ImportError:
        sys.exit("请安装 requests: pip install requests")

    require_art_api_key("技能图标 GPT 规划")
    weapon_names = weapon_names or []
    weapon_info = "、".join(weapon_names) if weapon_names else "（通用/品质默认）"
    extra = []
    if weapon_trait:
        extra.append(f"该技能对应武器在游戏中的特征（词条）：{weapon_trait}")
    if set_name:
        extra.append(f"所属套装：{set_name}")
    extra_block = "\n".join(extra) if extra else ""
    ranged_block = ""
    if is_ranged_weapon_skill:
        ranged_block = (
            "\n【攻击类型】该技能属于远程武器（弓、弩等）：图标必须体现远程作战感（如箭矢、弹道、弓弦张力、瞄准/穿透、飞矢轨迹等），"
            "避免画成近战挥砍、剑气贴脸、巨剑劈砍；shape 与 texture 应与「从远处命中锁定目标」的玩法一致。\n"
        )

    base_message = f"""为像素风 RPG 的武器技能「{skill_name}」设计技能图标的三个英文变量，用于拼进固定画风模板。

【技能效果与攻击方式】{skill_description or '无'}

【对应武器】{weapon_info}
{extra_block}{ranged_block}
请结合以上：技能效果与攻击方式、对应武器的特征（词条）、所属套装风格，设计出与游戏设定一致的图标视觉（主体形状、动态纹理、主色调）。

请只输出以下 JSON，不要其他文字和 markdown 代码块：
{{ "shape": "主体形状，名词短语，如 ice crystal / dagger silhouette / flame vortex", "texture": "动态纹理，动词+名词，如 radiating frost spikes / smoky trail effect / pulsing shock rings", "color": "主色调，带质感的颜色词，如 pale blue / deep purple / molten orange / frosty cyan" }}

规则（与 art-requirements.md 一致）：
1. shape：用具体名词短语，避免抽象（如用 lightning spear 不用 powerful weapon）；需与武器/套装/技能效果呼应。
2. texture：用流动/爆发/粒子感的具体描述，如 swirling energy currents、glowing particle sparks，避免 dynamic effects 等笼统词。
3. color：用带质感的颜色词，如 frosty cyan、molten orange、ember red，避免单纯 blue/red；可与套装主题一致。"""

    # 当触发内容策略（content_filter）时使用的纯英文、中性描述，避免敏感词
    effect_english = _skill_effect_to_english(skill_description)
    ranged_en = ""
    if is_ranged_weapon_skill:
        ranged_en = (
            " This is a RANGED weapon skill (bow/crossbow): the icon must suggest projectiles, arrow flight, "
            "aiming or piercing at distance—not melee slash or sword clash. "
        )
    fallback_english_message = f"""Design a pixel art skill icon for a retro RPG.{ranged_en}The ability effect: {effect_english}.

Output only this JSON, no other text or markdown:
{{ "shape": "noun phrase, e.g. ice crystal / flame vortex", "texture": "verb+noun, e.g. radiating frost spikes / pulsing shock rings", "color": "color with texture, e.g. frosty cyan / molten orange" }}

Rules: shape = concrete noun; texture = flowing/particle feel; color = textured color phrase."""

    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    last_err_body = ""
    retry_reason = None  # "content_filter" | "same_request" | None
    for attempt in range(2):
        if attempt == 0:
            user_message = base_message
        else:
            if retry_reason == "content_filter":
                user_message = fallback_english_message
            else:
                user_message = base_message + f"\n\n【重试】请再次仅输出上述 JSON。（{datetime.now().isoformat()}）"
        body = {
            "model": CHAT_MODEL,
            "messages": [{"role": "user", "content": user_message}],
            "temperature": 0.3,
        }
        try:
            resp = requests.post(CHAT_URL, headers=headers, json=body, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            break
        except requests.exceptions.Timeout as e:
            raise RuntimeError(f"请求 GPT 超时（60 秒），请检查网络或 {CHAT_URL} 是否可达") from e
        except requests.exceptions.ConnectionError as e:
            raise RuntimeError(f"无法连接 GPT 服务（{CHAT_URL}），请检查网络或服务是否启动") from e
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code
            try:
                last_err_body = e.response.text[:500] if e.response.text else "(无响应体)"
            except Exception:
                last_err_body = "(无法读取)"
            if status != 400:
                raise RuntimeError(
                    f"GPT 返回错误状态码: {status}。响应内容: {last_err_body}"
                ) from e
            # 400：按原因选择是否重试
            is_content_filter = "content_filter" in last_err_body or "content management policy" in last_err_body
            is_same_request = "相同的请求" in last_err_body or "Same request has failed" in last_err_body
            if attempt == 0 and (is_content_filter or is_same_request):
                retry_reason = "content_filter" if is_content_filter else "same_request"
                continue
            raise RuntimeError(
                f"GPT 返回错误状态码: 400。响应内容: {last_err_body}"
            ) from e
        except ValueError as e:
            raise RuntimeError(f"GPT 响应不是合法 JSON: {e}") from e
    # 若上面 break 则 data 已赋值

    try:
        content = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f"GPT 响应结构异常（缺少 choices/message/content），原始键: {list(data.keys())}") from e

    # 去掉 markdown 代码块
    if "```" in content:
        content = re.sub(r"^```\w*\n?", "", content)
        content = re.sub(r"\n?```\s*$", "", content)
    content = content.strip()

    # 尝试从内容中提取 JSON 对象（应对 GPT 在前后加说明文字）
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(content[start : end + 1])
            except json.JSONDecodeError:
                pass
        raise RuntimeError(
            "GPT 返回内容无法解析为 JSON（请确认只输出 JSON、无多余说明）。"
            " 可设置环境变量 PE_CHAT_URL / PE_ART_API_KEY 检查接口。"
            f" 返回前 200 字: {content[:200]!r}"
        )


def add_to_skill_icon_map(skill_name: str, filename: str) -> None:
    """在 skill-icon-config.json 的 SKILL_ICON_MAP 中增加一条 技能名 -> 文件名。"""
    if not SKILL_ICON_CONFIG.exists():
        data = {"SKILL_ICON_MAP": {}}
    else:
        with open(SKILL_ICON_CONFIG, 'r', encoding='utf-8') as f:
            data = json.load(f)
    if "SKILL_ICON_MAP" not in data:
        data["SKILL_ICON_MAP"] = {}
    data["SKILL_ICON_MAP"][skill_name] = filename
    with open(SKILL_ICON_CONFIG, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def collect_existing_buff_icons() -> dict:
    """从 buff-icon-config.json 的 BUFF_ICON_MAP 读取 增幅键 -> 文件名。"""
    result = {}
    if not BUFF_ICON_CONFIG.exists():
        return result
    with open(BUFF_ICON_CONFIG, 'r', encoding='utf-8') as f:
        data = json.load(f)
        buff_map = data.get("BUFF_ICON_MAP", {})
        result.update(buff_map)
    return result


def add_to_buff_icon_map(key: str, filename: str) -> None:
    """在 buff-icon-config.json 的 BUFF_ICON_MAP 中增加一条 增幅键 -> 文件名。"""
    BUFF_ICON_CONFIG.parent.mkdir(parents=True, exist_ok=True)
    if not BUFF_ICON_CONFIG.exists():
        data = {"BUFF_ICON_MAP": {}}
    else:
        with open(BUFF_ICON_CONFIG, 'r', encoding='utf-8') as f:
            data = json.load(f)
    if "BUFF_ICON_MAP" not in data:
        data["BUFF_ICON_MAP"] = {}
    # 若该键已存在则跳过，避免重复
    if key in data["BUFF_ICON_MAP"]:
        return
    data["BUFF_ICON_MAP"][key] = filename
    with open(BUFF_ICON_CONFIG, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def run_batch_buff_icons(dry_run: bool = False) -> None:
    """根据 icon-requirements.md 为所有增幅类型生成图标，画风与技能图标一致。"""
    existing = collect_existing_buff_icons()
    ART_BUFF_ICONS.mkdir(parents=True, exist_ok=True)

    def is_configured(key: str) -> bool:
        if key not in existing:
            return False
        return (ART_BUFF_ICONS / existing[key]).is_file()

    missing = [k for k in BUFF_ICON_PROMPTS if not is_configured(k)]
    if not missing:
        print("所有增幅图标已存在，无需生成。")
        return

    print(f"共有 {len(BUFF_ICON_PROMPTS)} 种增幅，其中 {len(missing)} 个缺少图标，将为其生成（画风与技能图标一致）。")
    for i, key in enumerate(missing, 1):
        prompt_suffix = BUFF_ICON_PROMPTS[key]
        full_prompt = f"{SKILL_ICON_CORE_TEMPLATE}, {prompt_suffix}".strip()
        filename = _buff_icon_filename(key)
        print(f"[{i}/{len(missing)}] 增幅: {key} -> {filename}")
        if dry_run:
            print(f"  [dry-run] 完整提示词: {full_prompt[:140]}...")
            continue
        try:
            raw_bytes = generate_image(full_prompt, "", for_skill_icon=True)
            image_bytes = process_skill_icon_image(raw_bytes)
            save_image(image_bytes, "buff_icons", filename)
            add_to_buff_icon_map(key, filename)
            print(f"  已保存并写入映射: {filename}")
        except Exception as e:
            print(f"  生成或写入失败: {e}")

    print("批量增幅图标处理完成。")


def call_gpt_plan_weapon_texture(context: dict, weapon: dict) -> dict:
    """为单件武器装备栏贴图规划英文 image_prompt 与 style_notes（磁盘文件名为程序生成的英文路径）。"""
    try:
        import requests
    except ImportError:
        sys.exit("请安装 requests: pip install requests")

    require_art_api_key("武器贴图 GPT 规划")
    name = weapon.get("name", "")
    wtype = weapon.get("weaponType", "melee")
    quality = weapon.get("quality", "common")
    level = weapon.get("level", 1)
    trait = get_weapon_trait(name)
    set_name = get_set_for_weapon(name)
    ws = get_weapon_skill_lookup().get(name, {})
    skill_cn_name = (ws.get("skill_name") or "").strip()
    skill_cn_desc = (ws.get("description") or "").strip()
    type_hint = (
        "远程武器（弓/弩）：与近战武器完全相同的「装备栏静物图标」规格——静止展示弓臂、弦、弩身、箭袋或搭在弓上的单支箭；"
        "禁止弹道拖尾、箭雨、爆炸、战场、写实电影光效；禁止为了强调远程而把画面做成插画场景。"
        if wtype == "ranged"
        else "近战武器：静止展示刃、柄、护手与材质，同为装备栏静物图标，不要挥砍动态或人物持握全身像。"
    )
    extra = []
    if trait:
        extra.append(f"武器词条：{trait}")
    if set_name:
        extra.append(f"所属套装：{set_name}")
    extra_txt = "\n".join(extra) if extra else "（无额外词条/套装说明）"
    if skill_cn_name or skill_cn_desc:
        skill_txt = f"技能名称：{skill_cn_name or '（无）'}\n技能效果（游戏内文案）：{skill_cn_desc or '（无）'}"
    else:
        skill_txt = "（该武器在 weaponSkills 中无单独条目，请仅从武器中文名与词条推断装饰主题。）"
    deep_fmt = ""
    if "·" in name:
        deep_fmt = "（深阶命名：「·」前为主题与品质字，「·」后为后缀；纹饰与配色贴合主题即可，不必把后缀汉字逐字画进图里。）\n"

    user_message = f"""为 Pixel Eternal 生成一件武器的「装备栏道具图标」用的英文主体描述。远程与近战必须与项目中已有武器贴图共用同一套画风（程序会在后面统一追加 pixel art / 黑底 等），你只描述「画什么」。

{deep_fmt}【武器中文名】{name}
你必须把中文名的字面意境译成英文造型语言写进 image_prompt（例如「星坠/永夜」→ subtle star chips、meteorite inlay、deep midnight blue metal；「猎风」→ wind-swept engravings、feather fletching motif；不要在画面里写汉字）。

【专属武器技能 — 必须体现在武器本体的纹饰、配色、镶嵌、轮廓细节上，不是画技能特效】
{skill_txt}

品质 tier：{quality}，等级感约：{level}
武器类型说明：{type_hint}
{extra_txt}

项目调性参考（摘要）：{context.get('project_md', '')[:1200]}

请只输出以下 JSON，不要其他文字和 markdown 代码块：
{{ "image_prompt": "英文，描述武器静物造型，并明确写出如何呼应武器中文名意境与上述技能主题（纹饰/配色/符号）；不要写 pixel art、background、lighting、3d、photo、cinematic、style 等渲染类词汇", "style_notes": "" }}

规则：
1. image_prompt 必须同时体现：(a) 武器类型与品质；(b) 中文名意境；(c) 专属技能主题在装饰层面的映射（例：高倍伤害技能可用更厚重刃形或能量纹；穿透/贯穿可用脊线、镂空箭槽造型暗示）。仍为单件静物，禁止满屏魔法阵、爆炸、飞行箭幕。
2. style_notes 必须为空字符串 ""。
3. 远程武器禁止 trajectory、muzzle flash、arrow streak、explosion 等动态或场景化词汇。"""

    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    body = {
        "model": CHAT_MODEL,
        "messages": [{"role": "user", "content": user_message}],
        "temperature": 0.42,
    }
    resp = requests.post(CHAT_URL, headers=headers, json=body, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"].strip()
    if "```" in content:
        content = re.sub(r"^```\w*\n?", "", content)
        content = re.sub(r"\n?```\s*$", "", content)
    content = content.strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(content[start : end + 1])
        raise RuntimeError(f"武器贴图规划返回非 JSON：{content[:200]!r}")


def call_gpt_plan_non_weapon_equipment_texture(context: dict, eq: dict) -> dict:
    """为头盔/胸甲等非武器装备栏贴图规划英文 image_prompt（程序追加统一非武器模板）。"""
    try:
        import requests
    except ImportError:
        sys.exit("请安装 requests: pip install requests")

    require_art_api_key("装备贴图 GPT 规划")
    name = eq.get("name", "")
    slot = eq.get("slot", "helmet")
    quality = eq.get("quality", "common")
    level = eq.get("level", 1)
    trait = get_weapon_trait(name)
    set_name = get_set_for_equipment(name)
    hint = NON_WEAPON_SLOT_PLAN_HINTS.get(slot, "装备静物道具图标，单件居中。")
    extra = []
    if trait:
        extra.append(f"装备词条：{trait}")
    if set_name:
        extra.append(f"所属套装：{set_name}")
    extra_txt = "\n".join(extra) if extra else "（无额外词条/套装说明）"
    deep_fmt = ""
    if "·" in name:
        deep_fmt = "（深阶命名：「·」前为主题与品质字，「·」后为后缀；画面气质贴合主题即可，不必把后缀汉字逐字画进图里。）\n"

    user_message = f"""为 Pixel Eternal 生成一件非武器装备的「装备栏道具图标」用的英文主体描述。画风由程序统一追加（pixel art / 纯黑底 / 16-bit），你只描述「画什么」。

{deep_fmt}【装备中文名】{name}
你必须把中文名的字面意境译成英文造型语言写进 image_prompt（不要在画面里写汉字）。

【部位与构图】{hint}

品质 tier：{quality}，等级感约：{level}
{extra_txt}

项目调性参考（摘要）：{context.get('project_md', '')[:1200]}

请只输出以下 JSON，不要其他文字和 markdown 代码块：
{{ "image_prompt": "英文，描述该部位静物造型与材质，呼应中文名与套装/词条氛围；不要写 pixel art、background、3d、photo、cinematic 等渲染类词汇", "style_notes": "" }}

规则：
1. image_prompt 为单件静物，居中，无角色全身、无战斗场景。
2. style_notes 必须为空字符串 ""。
"""

    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    body = {
        "model": CHAT_MODEL,
        "messages": [{"role": "user", "content": user_message}],
        "temperature": 0.42,
    }
    resp = requests.post(CHAT_URL, headers=headers, json=body, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"].strip()
    if "```" in content:
        content = re.sub(r"^```\w*\n?", "", content)
        content = re.sub(r"\n?```\s*$", "", content)
    content = content.strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(content[start : end + 1])
        raise RuntimeError(f"装备贴图规划返回非 JSON：{content[:200]!r}")


def detect_batch_deep_equipment_textures(user_input: str) -> bool:
    """「一键/全部 深阶 装备贴图」：走 equipment-deep-config.json（须在含「所有装备」类指令之前判断）。"""
    t = user_input.strip()
    if not t or "武器技能" in t:
        return False
    if "深阶" not in t and "deep" not in t.lower():
        return False
    has_scope = (
        "所有" in t
        or "全部" in t
        or "批量" in t
        or "每个" in t
        or "全套" in t
        or "一键" in t
    )
    if not has_scope:
        return False
    has_asset = (
        "贴图" in t
        or "装备图" in t
        or "图标" in t
        or "生图" in t
        or ("装备" in t and ("图" in t or "贴" in t))
        or (
            "装备" in t
            and ("生成" in t or "补齐" in t or "补全" in t or "做" in t)
        )
    )
    if not has_asset:
        return False
    has_fill = "补齐" in t or "补全" in t or "生成" in t or "做" in t
    if not has_fill and "一键" not in t:
        return False
    return True


def detect_batch_all_equipment_textures(user_input: str) -> bool:
    """「补齐/生成 所有装备 贴图」等：覆盖全部部位（含武器）。不含「装备」一词的仍走仅武器分支。"""
    t = user_input.strip()
    if not t or "武器技能" in t:
        return False
    if "装备" not in t:
        return False
    has_asset = (
        "贴图" in t
        or "装备图" in t
        or ("装备" in t and "图标" in t)
        or ("图标" in t and "技能" not in t)
    )
    if not has_asset:
        return False
    if not ("所有" in t or "全部" in t or "批量" in t or "每个" in t or "全套" in t):
        return False
    if not ("补齐" in t or "补全" in t or "生成" in t or "做" in t):
        return False
    if "武器" in t and "装备" not in t:
        return False
    return True


def detect_batch_weapon_textures(user_input: str) -> bool:
    """判断用户是否要求批量补齐所有武器的装备贴图（与「武器技能图标」区分）。"""
    t = user_input.strip()
    if not t or "武器技能" in t:
        return False
    # 「武器技能」走技能批处理；含「技能」且不是明确装备贴图时，不误触
    if "技能" in t and "贴图" not in t and "装备图" not in t:
        if "装备" not in t or "图标" not in t:
            return False
    if "武器" not in t:
        return False
    # 装备栏用的武器图：贴图 / 装备图 / 武器图标（排除「技能」相关）
    has_asset = (
        "贴图" in t
        or "装备图" in t
        or ("装备" in t and "图标" in t)
        or ("图标" in t and "技能" not in t)
    )
    if not has_asset:
        return False
    has_all = "所有" in t or "全部" in t or "批量" in t or "每个" in t
    has_fill = "补齐" in t or "补全" in t or "生成" in t or "做" in t
    return has_all or has_fill


def run_batch_weapon_textures(
    dry_run: bool = False,
    force: bool = False,
    only_ranged: bool = False,
) -> None:
    """为 equipment-config 中武器检查 asset 贴图；缺失则规划、生图并写入 mappings.json。
    force=True 时重绘已有文件（用于统一画风）。only_ranged=True 时仅处理远程武器。
    """
    weapons = collect_weapon_entries_from_config()
    if only_ranged:
        weapons = [w for w in weapons if w.get("weaponType") == "ranged"]
    if not weapons:
        print("未从 equipment-config.json 读取到符合条件的武器。")
        return
    if force:
        missing = list(weapons)
    else:
        missing = [w for w in weapons if not weapon_texture_resolved_path(w["name"]).is_file()]
    if not missing:
        scope = "远程" if only_ranged else "全部"
        print(f"共 {len(weapons)} 件武器（{scope}），贴图文件均已存在；若需按新画风替换请使用 --force-weapon-textures。")
        return
    mode = "强制重绘" if force else "补缺"
    scope = "仅远程" if only_ranged else "全部"
    print(
        f"武器贴图批量（{scope}，{mode}）：共 {len(weapons)} 件在范围内，本次处理 {len(missing)} 件，将更新 config/mappings.json。"
    )
    context = collect_project_context()
    ART_FOLDER.mkdir(parents=True, exist_ok=True)

    for i, w in enumerate(missing, 1):
        name = w["name"]
        rel = equipment_english_relpath(w)
        dest = ART_FOLDER / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"[{i}/{len(missing)}] 武器贴图：{name} -> {rel}")
        if dry_run:
            print("  [dry-run] 将调用 GPT 规划并生图，未实际请求 API。")
            continue
        try:
            plan = call_gpt_plan_weapon_texture(context, w)
            subject = (plan.get("image_prompt") or "").strip()
            if not subject:
                print("  规划缺少 image_prompt，跳过")
                continue
            # 画风统一由固定模板追加，忽略 GPT 的 style_notes，避免远程与近战不一致
            full_weapon_prompt = f"{subject}. {EQUIPMENT_WEAPON_TEXTURE_STYLE_TEMPLATE}".strip()
            raw = generate_image(
                full_weapon_prompt, "", for_skill_icon=False, for_equipment_weapon=True
            )
            image_bytes = process_transparent_icon_image(raw)
            dest.write_bytes(image_bytes)
            add_equipment_mapping(name, rel)
            print(f"  已保存并写入 mappings：{rel}")
        except Exception as e:
            print(f"  失败: {e}")

    print("批量武器贴图处理完成。")


def run_equipment_texture_batch_for_entries(
    config_label: str,
    all_eq: list,
    dry_run: bool = False,
    force: bool = False,
    only_slot: str = "",
    only_ranged_weapons: bool = False,
    force_hint: str = "--force-all-equipment-textures 或 --force-deep-equipment-textures",
) -> None:
    """对给定装备列表逐项检查贴图；缺失则 GPT 规划、生图并写 mappings.json（基础装备与深阶共用）。"""
    only_slot = (only_slot or "").strip().lower()
    eff = list(all_eq)
    if only_slot:
        if only_slot not in SLOT_TO_SUBFOLDER:
            print(f"未知的部位过滤: {only_slot}，可选: {', '.join(SLOT_TO_SUBFOLDER)}")
            return
        eff = [e for e in eff if e["slot"] == only_slot]
    if only_ranged_weapons:
        eff = [
            e for e in eff
            if e["slot"] != "weapon" or e.get("weaponType") == "ranged"
        ]
    if not eff:
        print(f"未读取到符合条件的装备（{config_label}）。")
        return
    if force:
        missing = list(eff)
    else:
        missing = [e for e in eff if not equipment_batch_resolved_path(e).is_file()]
    if not missing:
        print(
            f"共 {len(eff)} 件装备在范围内（{config_label}），贴图均已存在；"
            f"若需统一重绘请加 {force_hint}。"
        )
        return
    mode = "强制重绘" if force else "补缺"
    print(
        f"装备贴图批量（{config_label}，{mode}）：配置内共 {len(eff)} 件，本次处理 {len(missing)} 件，将更新 config/mappings.json。"
    )
    context = collect_project_context()
    ART_FOLDER.mkdir(parents=True, exist_ok=True)

    for i, eq in enumerate(missing, 1):
        name = eq["name"]
        slot = eq["slot"]
        rel = equipment_english_relpath(eq)
        dest = ART_FOLDER / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"[{i}/{len(missing)}] {slot}：{name} -> {rel}")
        if dry_run:
            print("  [dry-run] 将调用 GPT 规划并生图，未实际请求 API。")
            continue
        try:
            is_deep = bool(eq.get("isDeep"))
            if is_deep:
                # 深阶改为模板驱动，强制注入主题指纹与品质复杂度，降低同质化
                subject = build_deep_equipment_subject(eq)
                wtype = (eq.get("weaponType") or "melee").strip().lower()
                extra_neg = (
                    DEEP_RANGED_FIREARMS_NEGATIVE
                    if slot == "weapon" and wtype == "ranged"
                    else ""
                )
                if slot == "weapon":
                    full_prompt = f"{subject}. {EQUIPMENT_WEAPON_TEXTURE_STYLE_TEMPLATE}".strip()
                    raw = generate_image(
                        full_prompt,
                        "",
                        for_skill_icon=False,
                        for_equipment_weapon=True,
                        extra_negative=extra_neg,
                    )
                else:
                    full_prompt = f"{subject}. {EQUIPMENT_NON_WEAPON_TEXTURE_STYLE_TEMPLATE}".strip()
                    raw = generate_image(
                        full_prompt, "", for_skill_icon=False, for_equipment_non_weapon=True
                    )
            else:
                if slot == "weapon":
                    plan = call_gpt_plan_weapon_texture(context, eq)
                    subject = (plan.get("image_prompt") or "").strip()
                    if not subject:
                        print("  规划缺少 image_prompt，跳过")
                        continue
                    full_prompt = f"{subject}. {EQUIPMENT_WEAPON_TEXTURE_STYLE_TEMPLATE}".strip()
                    raw = generate_image(
                        full_prompt, "", for_skill_icon=False, for_equipment_weapon=True
                    )
                else:
                    plan = call_gpt_plan_non_weapon_equipment_texture(context, eq)
                    subject = (plan.get("image_prompt") or "").strip()
                    if not subject:
                        print("  规划缺少 image_prompt，跳过")
                        continue
                    full_prompt = f"{subject}. {EQUIPMENT_NON_WEAPON_TEXTURE_STYLE_TEMPLATE}".strip()
                    raw = generate_image(
                        full_prompt, "", for_skill_icon=False, for_equipment_non_weapon=True
                    )
            image_bytes = process_transparent_icon_image(raw)
            dest.write_bytes(image_bytes)
            add_equipment_mapping(name, rel)
            print(f"  已保存并写入 mappings：{rel}")
        except Exception as e:
            print(f"  失败: {e}")

    print(f"装备贴图批量处理完成（{config_label}）。")


def run_batch_all_equipment_textures(
    dry_run: bool = False,
    force: bool = False,
    only_slot: str = "",
    only_ranged_weapons: bool = False,
) -> None:
    """为 equipment-config.json 中全部装备检查贴图。"""
    all_eq = collect_all_equipment_entries_from_config()
    run_equipment_texture_batch_for_entries(
        "基础装备 equipment-config.json",
        all_eq,
        dry_run=dry_run,
        force=force,
        only_slot=only_slot,
        only_ranged_weapons=only_ranged_weapons,
        force_hint="--force-all-equipment-textures",
    )


def run_batch_deep_equipment_textures(
    dry_run: bool = False,
    force: bool = False,
    only_slot: str = "",
    only_ranged_weapons: bool = False,
) -> None:
    """为 equipment-deep-config.json 中全部深阶装备检查贴图（一键真实名称批量）。
    新生成贴图统一写入 asset/DEEP_EQUIPMENT_FOLDER。
    """
    all_eq = collect_deep_equipment_entries_from_config()
    run_equipment_texture_batch_for_entries(
        "深阶装备 equipment-deep-config.json",
        all_eq,
        dry_run=dry_run,
        force=force,
        only_slot=only_slot,
        only_ranged_weapons=only_ranged_weapons,
        force_hint="--force-deep-equipment-textures",
    )


def run_deep_equipment_batch(
    theme_cn: str,
    quality_cn: str,
    dry_run: bool = False,
    ranged_weapon: bool = False,
    sleep_sec: float = 2.0,
) -> None:
    """按文档模板生成某主题+品质下 8 张占位部位图（文件名如 渊隙凡·武器），非 equipment-deep-config 全量。
    生成路径统一为 asset/DEEP_EQUIPMENT_FOLDER。全量请用 run_batch_deep_equipment_textures / --batch-deep-equipment-textures。
    """
    import time

    if theme_cn not in DEEP_THEME_KEYWORDS_CN:
        print(f"未知主题「{theme_cn}」。可选: {', '.join(DEEP_THEME_KEYWORDS_CN)}")
        return
    if quality_cn not in DEEP_QUALITY_VISUAL:
        print(f"未知品质字「{quality_cn}」。可选: {', '.join(DEEP_QUALITY_VISUAL)}")
        return
    ART_FOLDER.mkdir(parents=True, exist_ok=True)
    total = len(DEEP_SLOT_BATCH_ROWS)
    print(
        f"深阶批量：主题={theme_cn}，品质={quality_cn}，共 {total} 个部位"
        + ("（武器按远程）" if ranged_weapon else "（武器按近战）")
        + "。"
    )

    for i, row in enumerate(DEEP_SLOT_BATCH_ROWS, 1):
        slot = row["slot"]
        suffix = row["suffix"]
        display = f"{theme_cn}{quality_cn}·{suffix}"
        eq_row = {
            "name": display,
            "slot": slot,
            "weaponType": ("ranged" if (slot == "weapon" and ranged_weapon) else "melee"),
            "isDeep": True,
        }
        rel_path = equipment_english_relpath(eq_row)
        filename = Path(rel_path).name
        subject_en = build_deep_equipment_subject(eq_row)
        print(f"[{i}/{total}] {display} -> {rel_path}")
        if dry_run:
            print(f"  [dry-run] prompt 前缀: {subject_en[:120]}...")
            continue
        try:
            if slot == "weapon":
                full_prompt = f"{subject_en} {EQUIPMENT_WEAPON_TEXTURE_STYLE_TEMPLATE}".strip()
                extra = DEEP_RANGED_FIREARMS_NEGATIVE if ranged_weapon else ""
                raw = generate_image(
                    full_prompt, "", for_equipment_weapon=True, extra_negative=extra
                )
            else:
                full_prompt = f"{subject_en} {EQUIPMENT_NON_WEAPON_TEXTURE_STYLE_TEMPLATE}".strip()
                raw = generate_image(full_prompt, "", for_equipment_non_weapon=True)
            image_bytes = process_transparent_icon_image(raw)
            dest = ART_FOLDER / rel_path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(image_bytes)
            add_equipment_mapping(display, rel_path)
            print(f"  已保存并写入 mappings.json: {rel_path}")
        except Exception as e:
            print(f"  失败: {e}")
        if i < total and sleep_sec > 0:
            time.sleep(sleep_sec)
    print("深阶全套部位批量完成。")


def run_batch_skill_icons(dry_run: bool = False) -> None:
    """列出所有武器技能、找出缺图标的，逐个生成并写入项目。"""
    print("正在从 data-classes.js 读取武器技能列表…")
    weapon_type_by_name = build_weapon_type_by_name()
    all_skills = collect_weapon_skills()
    if not all_skills:
        print("未解析到任何武器技能，请检查 js/data-classes.js 中的 getWeaponSkill。")
        return
    print("正在读取已有技能图标配置与 skill_icons 目录…")
    existing_map = collect_existing_skill_icons()
    # 未配置 = 配置中无该技能，或配置了但对应文件不存在
    def is_configured(skill_name: str) -> bool:
        if skill_name not in existing_map:
            return False
        path = ART_SKILL_ICONS / existing_map[skill_name]
        return path.is_file()

    missing = [s for s in all_skills if not is_configured(s["name"])]
    if not missing:
        print("所有武器技能已有图标且文件存在，无需生成。")
        return
    print(f"共有 {len(all_skills)} 个武器技能，其中 {len(missing)} 个缺少图标或文件缺失，将为其生成。")
    context = collect_project_context()
    ART_SKILL_ICONS.mkdir(parents=True, exist_ok=True)

    for i, skill in enumerate(missing, 1):
        name = skill["name"]
        desc = skill.get("description", "")
        weapon_names = skill.get("weapon_names", [])
        first_weapon = weapon_names[0] if weapon_names else ""
        weapon_trait = get_weapon_trait(first_weapon) if first_weapon else ""
        set_name = get_set_for_weapon(first_weapon) if first_weapon else ""
        is_ranged_skill = any(weapon_type_by_name.get(wn, "melee") == "ranged" for wn in weapon_names)
        print(f"[{i}/{len(missing)}] 规划并生成：{name}" + (f"（武器：{first_weapon}）" if first_weapon else ""))
        if is_ranged_skill:
            print("  （远程武器技能：图标规划将强调弹道/箭矢等远程特征）")
        filename = _skill_icon_filename(name)
        full_prompt = ""
        try:
            plan = call_gpt_plan_skill_icon(
                context, name, desc,
                weapon_names=weapon_names,
                weapon_trait=weapon_trait,
                set_name=set_name,
                is_ranged_weapon_skill=is_ranged_skill,
            )
            shape = (plan.get("shape") or "").strip()
            texture = (plan.get("texture") or "").strip()
            color = (plan.get("color") or "").strip()
            full_prompt = f"{SKILL_ICON_CORE_TEMPLATE}, {shape} with {texture} in {color} palette".strip()
            if not shape or not texture or not color:
                print(f"  规划缺少 shape/texture/color，跳过")
                continue
        except Exception as e:
            err_msg = str(e)
            # 内容策略拦截时，若该技能有硬编码兜底方案则直接用其生成图标
            if ("content_filter" in err_msg or "content management policy" in err_msg) and name in SKILL_ICON_FALLBACK_PLANS:
                fallback = SKILL_ICON_FALLBACK_PLANS[name]
                shape = (fallback.get("shape") or "").strip()
                texture = (fallback.get("texture") or "").strip()
                color = (fallback.get("color") or "").strip()
                full_prompt = f"{SKILL_ICON_CORE_TEMPLATE}, {shape} with {texture} in {color} palette".strip()
                print(f"  规划被内容策略拦截，使用兜底方案生成：{name}")
            else:
                print(f"  规划失败: {e}")
                print("    常见原因: 1) 网络/服务不可达 2) PE_ART_API_KEY 或 PE_CHAT_URL 未配置/错误 3) GPT 返回了非 JSON")
                continue
        if dry_run:
            print(f"  [dry-run] 将保存为 skill_icons/{filename}（技能名：{name}），不请求生图。")
            print(f"  完整提示词: {full_prompt[:120]}...")
            continue
        try:
            raw_bytes = generate_image(full_prompt, "", for_skill_icon=True)
            image_bytes = process_skill_icon_image(raw_bytes)
            save_image(image_bytes, "skill_icons", filename)
            add_to_skill_icon_map(name, filename)
            _log_skill_icon(name, filename, full_prompt, success=True)
            print(f"  已保存并写入映射：{filename}")
        except Exception as e:
            _log_skill_icon(name, filename, full_prompt, success=False, error=str(e))
            print(f"  生成或写入失败: {e}")

    print("批量技能图标处理完成。")


def call_gpt_plan(context: dict, user_input: str) -> dict:
    """使用 gpt-4o-mini 根据项目上下文和用户输入，决定生图提示词、风格、保存路径等。"""
    try:
        import requests
    except ImportError:
        sys.exit("请安装 requests: pip install requests")

    require_art_api_key("自然语言 GPT 规划")
    system_prompt = """你是 Pixel Eternal 项目的美术资源规划助手。项目是暗黑像素风 RPG，装备贴图放在 asset 目录（约定见 tools/art-requirements-2026-03-19.md）。
根据用户自然语言描述和当前项目内容，你必须输出一份严格的 JSON，且只输出该 JSON，不要其他文字。

JSON 格式如下（所有字段必填，除非注明可选）：
{
  "image_prompt": "给图像模型用的英文描述，要具体，描述主体造型与材质；不要重复程序会统一追加的 pixel art / 纯黑底 / 16-bit 套话",
  "style_notes": "可填空字符串 \"\"；若需少量补充可写英文短语，会拼进最终 prompt",
  "filename": "保存文件名，必须仅用英文字母/数字/下划线/连字符，扩展名 .png，如 dragon_helm_v1.png；游戏内显示名仍用中文，由 display_name_for_icon_map 与 mappings 关联",
  "relative_folder": "在 asset 下的子文件夹：weapons、helmets、chests、legs、boots、necklaces、rings、belts；非装备图可 items 或 \"\"",
  "equipment_slot": "weapon|helmet|chest|legs|boots|necklace|ring|belt 之一；非装备填空字符串 \"\"",
  "add_to_equipment_config": false,
  "equipment_entry": null,
  "add_to_icon_map": false,
  "display_name_for_icon_map": ""
}

规则：
1. image_prompt 必须为英文。深阶装备（主题+品质+后缀命名）无需把中文后缀硬译进画面；用主题视觉与品质复杂度即可（参见文档第四节关键词）。
2. 装备栏图标：近战写 melee weapon，远程必须写 ranged weapon / bow / crossbow 并强调静物、无飞行箭矢与战场。小型饰品（项链/指环/腰带）强调宝石与链节/搭扣。
3. 若用户要“新装备”或写入配置，add_to_equipment_config 为 true，equipment_entry 含 slot/name 等，slot 只能是 weapon/helmet/chest/legs/boots/necklace/ring/belt；quality 为 common/rare/fine/epic/legendary。
4. 若该图作为游戏内装备贴图使用，add_to_icon_map 为 true，display_name_for_icon_map 为装备中文名；游戏通过 config/mappings.json 加载，工具会写入 mappings.json 的 equipment 字段（不再改 game-main.js）。
5. relative_folder 必须与 equipment_slot 一致：weapon→weapons，helmet→helmets，chest→chests，legs→legs，boots→boots，necklace→necklaces，ring→rings，belt→belts。
6. 非装备纯展示图：add_to_equipment_config、add_to_icon_map 均为 false，equipment_entry 为 null，equipment_slot 为 \"\"。
7. 程序会在装备类生图时自动追加统一画风模板（武器与非武器模板不同）并输出透明底 PNG（默认边长 PE_EXPORT_ICON_SIZE）。"""

    user_message = f"""当前项目信息：
- PROJECT.md 摘要：{context['project_md'][:3000]}
- 已有装备（slot -> name）：{json.dumps(context['equipment_list'], ensure_ascii=False)}
- 已有资源文件列表：{context['existing_assets'][:200]}
- 已有子文件夹：{context['asset_subfolders']}

用户描述：{user_input}

请只输出上述格式的 JSON，不要 markdown 代码块包裹。"""

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": CHAT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.3,
    }

    resp = requests.post(CHAT_URL, headers=headers, json=body, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"].strip()
    # 去掉可能的 markdown 代码块
    if "```" in content:
        content = re.sub(r"^```\w*\n?", "", content)
        content = re.sub(r"\n?```\s*$", "", content)
        content = content.strip()
    plan = json.loads(content)
    plan.setdefault("equipment_slot", "")
    return plan


def _bytes_from_gemini_style_response(data):
    """从 generateContent 类 JSON 中递归查找 inlineData/base64 图片。"""

    def walk(o):
        if isinstance(o, dict):
            inline = o.get("inlineData") or o.get("inline_data")
            if isinstance(inline, dict):
                b64 = inline.get("data")
                if isinstance(b64, str) and b64.strip():
                    try:
                        return base64.b64decode(b64)
                    except Exception:
                        pass
            for v in o.values():
                r = walk(v)
                if r is not None:
                    return r
        elif isinstance(o, list):
            for x in o:
                r = walk(x)
                if r is not None:
                    return r
        return None

    return walk(data)


def _generate_image_via_gemini(
    full_prompt: str,
    headers: dict,
    negative_combined: str,
) -> bytes:
    import requests

    text = full_prompt
    if negative_combined:
        text = f"{full_prompt}\n\nAvoid / do not render: {negative_combined}"
    body = {"contents": [{"role": "user", "parts": [{"text": text}]}]}
    resp = requests.post(GEMINI_IMAGE_URL, headers=headers, json=body, timeout=180)
    resp.raise_for_status()
    data = resp.json()
    raw = _bytes_from_gemini_style_response(data)
    if raw is not None:
        return raw
    raise RuntimeError(
        "Gemini 式生图响应中未解析到图片数据（inlineData）。"
        f" 响应片段: {str(data)[:400]!r}… 若网关请求体不同，请对照服务文档调整 PE_IMAGE_BACKEND 或联系服务方。"
    )


def generate_image(
    prompt: str,
    style_notes: str,
    for_skill_icon: bool = False,
    for_equipment_weapon: bool = False,
    for_equipment_non_weapon: bool = False,
    extra_negative: str = "",
) -> bytes:
    """调用 Imagen API 生成图片，返回 PNG 字节。技能图标与装备贴图可带专用 negative_prompt。"""
    try:
        import requests
    except ImportError:
        sys.exit("请安装 requests: pip install requests")

    require_art_api_key("生图")
    full_prompt = f"{prompt}. {style_notes}".strip() if style_notes else prompt
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": IMAGE_MODEL,
        "prompt": full_prompt,
        "n": 1,
        "size": "1024x1024",
        "response_format": "b64_json",
    }
    base_neg = ""
    if for_skill_icon and SKILL_ICON_NEGATIVE_PROMPT:
        base_neg = SKILL_ICON_NEGATIVE_PROMPT
    elif for_equipment_weapon and EQUIPMENT_WEAPON_NEGATIVE_PROMPT:
        base_neg = EQUIPMENT_WEAPON_NEGATIVE_PROMPT
    elif for_equipment_non_weapon and EQUIPMENT_NON_WEAPON_NEGATIVE_PROMPT:
        base_neg = EQUIPMENT_NON_WEAPON_NEGATIVE_PROMPT
    neg_parts = [p for p in (base_neg, (extra_negative or "").strip()) if p]
    if neg_parts:
        body["negative_prompt"] = ", ".join(neg_parts)
    if for_skill_icon:
        body["quality"] = "ultra-detail"
        body["style_strength"] = 0.95
        body["steps"] = 60

    neg_combined = ", ".join(neg_parts) if neg_parts else ""

    last_err = None
    for attempt in range(3):
        try:
            if PE_IMAGE_BACKEND in ("gemini", "google", "vertex", "generatecontent"):
                return _generate_image_via_gemini(full_prompt, headers, neg_combined)
            resp = requests.post(IMAGE_URL, headers=headers, json=body, timeout=120)
            if resp.status_code == 403 and PE_IMAGE_BACKEND == "auto":
                return _generate_image_via_gemini(full_prompt, headers, neg_combined)
            resp.raise_for_status()
            data = resp.json()
            if "data" not in data or not data["data"]:
                raise RuntimeError("API 未返回图片数据：" + str(data)[:200])
            item = data["data"][0]
            if "b64_json" in item:
                return base64.b64decode(item["b64_json"])
            if "url" in item:
                r2 = requests.get(item["url"], timeout=60)
                r2.raise_for_status()
                return r2.content
            raise RuntimeError("API 返回中既无 b64_json 也无 url：" + str(item)[:200])
        except Exception as e:
            last_err = e
            if attempt < 2:
                import time
                time.sleep(2 ** attempt)
            continue
    raise last_err


def process_transparent_icon_image(raw_png_bytes: bytes, size: int = None) -> bytes:
    """将生图结果缩放为 size×size（默认 EXPORT_ICON_SIZE），NEAREST；从四边对匀质黑底做 flood-fill 为透明，输出 RGBA PNG。"""
    if size is None:
        size = EXPORT_ICON_SIZE
    try:
        from PIL import Image
        import io
    except ImportError:
        sys.exit("请安装 Pillow: pip install Pillow")

    img = Image.open(io.BytesIO(raw_png_bytes)).convert("RGBA")
    img = img.resize((size, size), Image.NEAREST)
    w, h = img.size
    pixels = img.load()
    key = CHROMA_KEY_THRESHOLD

    def is_bg(x: int, y: int) -> bool:
        r, g, b, _a = pixels[x, y]
        return r <= key and g <= key and b <= key

    visited = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not visited[y][x] and is_bg(x, y):
                visited[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y][x] and is_bg(x, y):
                visited[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        pixels[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and is_bg(nx, ny):
                visited[ny][nx] = True
                q.append((nx, ny))

    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def process_skill_icon_image(raw_png_bytes: bytes) -> bytes:
    """技能/增幅图标：透明底 + EXPORT_ICON_SIZE 方形（与 process_transparent_icon_image 相同）。"""
    return process_transparent_icon_image(raw_png_bytes)


def _log_skill_icon(skill_name: str, filename: str, prompt: str, success: bool, error: str = "") -> None:
    """生图要求：记录每条技能图标的成功/失败日志到 asset/skill_icons/logs/。"""
    log_dir = ART_SKILL_ICONS / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"generate_{datetime.now().strftime('%Y%m%d')}.log"
    line = f"{datetime.now().isoformat()} | {'OK' if success else 'FAIL'} | {skill_name} | {filename} | {error or '-'}\n"
    if not success and prompt:
        line += f"  prompt: {prompt[:200]}...\n"
    try:
        content = log_file.read_text(encoding="utf-8")
    except FileNotFoundError:
        content = ""
    log_file.write_text(content + line, encoding="utf-8")


def sanitize_generated_asset_filename(filename: str, seed: str = "") -> str:
    """非装备批量等场景：强制英文安全文件名（ASCII，仅字母数字._-）。"""
    raw = (filename or "").strip()
    if not raw.lower().endswith(".png"):
        raw = f"{raw}.png" if raw else "asset.png"
    stem, _, _ext = raw.rpartition(".")
    stem = stem or "asset"
    if (not stem.isascii()) or re.search(r"[^a-zA-Z0-9._-]", stem):
        stem = f"asset_{_asset_digest8(seed + stem)}"
    stem = re.sub(r"[^a-zA-Z0-9._-]+", "_", stem).strip("._") or f"asset_{_asset_digest8(seed)}"
    return f"{stem}.png"


def save_image(image_bytes: bytes, relative_folder: str, filename: str) -> Path:
    """将图片保存到 asset[/relative_folder]/filename，必要时创建目录。"""
    if relative_folder:
        folder = ART_FOLDER / relative_folder.strip()
    else:
        folder = ART_FOLDER
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / filename
    path.write_bytes(image_bytes)
    return path


def add_equipment_to_config(entry: dict) -> None:
    """在 equipment-config.json 的 EQUIPMENT_DEFINITIONS 中追加一条装备定义。"""
    if not EQUIPMENT_CONFIG.exists():
        data = {"EQUIPMENT_DEFINITIONS": []}
    else:
        with open(EQUIPMENT_CONFIG, 'r', encoding='utf-8') as f:
            data = json.load(f)
    if "EQUIPMENT_DEFINITIONS" not in data:
        data["EQUIPMENT_DEFINITIONS"] = []
    
    # 构建装备条目
    new_entry = {
        "slot": entry.get("slot", "weapon"),
        "name": entry.get("name", "未命名"),
        "level": entry.get("level", 1),
        "quality": entry.get("quality", "common")
    }
    slot = new_entry["slot"]
    if slot == "weapon":
        new_entry["attack"] = entry.get("attack", 12)
        new_entry["critRate"] = entry.get("critRate", 4)
        new_entry["critDamage"] = entry.get("critDamage", 18)
    elif slot in ("necklace", "ring", "belt"):
        new_entry["dodge"] = entry.get("dodge", 1)
        new_entry["attackSpeed"] = entry.get("attackSpeed", 3)
        new_entry["moveSpeed"] = entry.get("moveSpeed", 2)
    else:
        new_entry["health"] = entry.get("health", 20)
        new_entry["defense"] = entry.get("defense", 2)
    
    data["EQUIPMENT_DEFINITIONS"].append(new_entry)
    with open(EQUIPMENT_CONFIG, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def detect_batch_buff_icons(user_input: str) -> bool:
    """判断用户是否在要求「生成/补齐所有增幅图标」。"""
    t = user_input.strip()
    if not t:
        return False
    has_buff = "增幅" in t or "效果" in t or "buff" in t.lower()
    has_icon = "图标" in t or "icon" in t.lower() or "图" in t
    has_generate = "生成" in t or "补齐" in t or "补全" in t or "做" in t
    return has_buff and has_icon and (has_generate or "全部" in t or "所有" in t)


def main():
    parser = argparse.ArgumentParser(description="自然语言生成游戏美术资源并写入项目")
    parser.add_argument("input", nargs="?", help="自然语言描述，例如：为游戏生成一把龙炎剑的装备图标")
    parser.add_argument("--dry-run", action="store_true", help="只调用 GPT 规划，不请求生图与写文件")
    parser.add_argument("--list-missing", action="store_true", help="仅列出尚未配置图标的武器技能（不调用 API）")
    parser.add_argument("--list-missing-buff", action="store_true", help="仅列出尚未配置图标的增幅类型（不调用 API）")
    parser.add_argument(
        "--list-missing-weapons",
        action="store_true",
        help="仅列出 equipment-config 中缺少贴图文件的武器（不调用 API）",
    )
    parser.add_argument(
        "--list-missing-equipment",
        action="store_true",
        help="列出所有部位装备中缺少贴图文件的条目（不调用 API）；可与 --only-equipment-slot 联用",
    )
    parser.add_argument(
        "--list-missing-deep-equipment",
        action="store_true",
        help="列出 equipment-deep-config 中深阶装备缺少贴图的条目（不调用 API）；可与 --only-equipment-slot 联用",
    )
    parser.add_argument(
        "--batch-all-equipment-textures",
        action="store_true",
        help="不依赖自然语言：直接按 equipment-config 对全部位执行贴图补缺（同「补齐所有装备贴图」）",
    )
    parser.add_argument(
        "--batch-deep-equipment-textures",
        action="store_true",
        help="按 equipment-deep-config.json 对全部深阶装备逐项补缺/生图（真实名称如 渊隙凡·低语）",
    )
    parser.add_argument(
        "--force-all-equipment-textures",
        action="store_true",
        help="全装备批量时重绘已有 PNG（与 --batch-all-equipment-textures 或自然语言全装备指令联用）",
    )
    parser.add_argument(
        "--force-deep-equipment-textures",
        action="store_true",
        help="深阶装备批量时重绘已有 PNG（与 --batch-deep-equipment-textures 或自然语言深阶指令联用）",
    )
    parser.add_argument(
        "--only-equipment-slot",
        default="",
        metavar="SLOT",
        help="全装备批量或 list-missing-equipment 时只处理该部位：weapon/helmet/chest/legs/boots/necklace/ring/belt",
    )
    parser.add_argument(
        "--force-weapon-textures",
        action="store_true",
        help="批量武器贴图时重绘已存在的 PNG（修正画风后与「补齐所有武器贴图」类指令联用）",
    )
    parser.add_argument(
        "--only-ranged-weapon-textures",
        action="store_true",
        help="批量武器贴图时仅处理 weaponType 为 ranged 的武器",
    )
    parser.add_argument(
        "--deep-theme",
        default="",
        metavar="主题",
        help="与 --deep-quality 联用：按 art-requirements-2026-03-19 生成该主题+品质下 8 部位贴图并写 mappings.json",
    )
    parser.add_argument(
        "--deep-quality",
        default="",
        metavar="品质",
        help="深阶品质字：凡/良/湛/炽/曜",
    )
    parser.add_argument(
        "--deep-ranged-weapon",
        action="store_true",
        help="深阶批量时武器格使用远程武器描述",
    )
    parser.add_argument(
        "--deep-sleep",
        type=float,
        default=2.0,
        help="深阶批量时每件之间的间隔秒数（缓解 API 限流）",
    )
    args = parser.parse_args()

    if args.deep_theme or args.deep_quality:
        if not (args.deep_theme and args.deep_quality):
            print("请同时提供 --deep-theme 与 --deep-quality，例如：--deep-theme 渊隙 --deep-quality 凡")
            sys.exit(1)
        run_deep_equipment_batch(
            args.deep_theme.strip(),
            args.deep_quality.strip(),
            dry_run=args.dry_run,
            ranged_weapon=args.deep_ranged_weapon,
            sleep_sec=max(0.0, args.deep_sleep),
        )
        return

    if args.list_missing:
        all_skills = collect_weapon_skills()
        existing_map = collect_existing_skill_icons()
        missing = [
            s for s in all_skills
            if s["name"] not in existing_map or not (ART_SKILL_ICONS / existing_map[s["name"]]).is_file()
        ]
        print(f"武器技能总数: {len(all_skills)}，已配置且文件存在: {len(all_skills) - len(missing)}，缺失: {len(missing)}")
        for s in missing:
            status = "无配置" if s["name"] not in existing_map else "配置存在但文件缺失"
            print(f"  - {s['name']} ({status})")
        return

    if args.list_missing_buff:
        existing = collect_existing_buff_icons()
        missing = [
            k for k in BUFF_ICON_PROMPTS
            if k not in existing or not (ART_BUFF_ICONS / existing[k]).is_file()
        ]
        print(f"增幅类型总数: {len(BUFF_ICON_PROMPTS)}，已配置且文件存在: {len(BUFF_ICON_PROMPTS) - len(missing)}，缺失: {len(missing)}")
        for k in missing:
            status = "无配置" if k not in existing else "配置存在但文件缺失"
            print(f"  - {k} ({status})")
        return

    if args.list_missing_weapons:
        weapons = collect_weapon_entries_from_config()
        missing = [w for w in weapons if not weapon_texture_resolved_path(w["name"]).is_file()]
        print(f"武器总数: {len(weapons)}，贴图文件已存在: {len(weapons) - len(missing)}，缺失: {len(missing)}")
        for w in missing:
            rel = get_weapon_asset_relpath(w["name"])
            print(f"  - {w['name']} (期望文件: asset/{rel})")
        return

    if args.list_missing_equipment:
        all_eq = collect_all_equipment_entries_from_config()
        oslot = (args.only_equipment_slot or "").strip().lower()
        if oslot:
            if oslot not in SLOT_TO_SUBFOLDER:
                print(f"未知的 --only-equipment-slot: {oslot}")
                sys.exit(1)
            all_eq = [e for e in all_eq if e["slot"] == oslot]
        missing = [e for e in all_eq if not equipment_batch_resolved_path(e).is_file()]
        print(f"装备总数（范围内）: {len(all_eq)}，贴图已存在: {len(all_eq) - len(missing)}，缺失: {len(missing)}")
        for e in missing:
            rel = resolve_batch_texture_relpath(e)
            print(f"  - [{e['slot']}] {e['name']} (期望: asset/{rel})")
        return

    if args.list_missing_deep_equipment:
        all_eq = collect_deep_equipment_entries_from_config()
        oslot = (args.only_equipment_slot or "").strip().lower()
        if oslot:
            if oslot not in SLOT_TO_SUBFOLDER:
                print(f"未知的 --only-equipment-slot: {oslot}")
                sys.exit(1)
            all_eq = [e for e in all_eq if e["slot"] == oslot]
        missing = [e for e in all_eq if not equipment_batch_resolved_path(e).is_file()]
        print(f"深阶装备总数（范围内）: {len(all_eq)}，贴图已存在: {len(all_eq) - len(missing)}，缺失: {len(missing)}")
        for e in missing:
            rel = resolve_batch_texture_relpath(e)
            print(f"  - [{e['slot']}] {e['name']} (期望: asset/{rel})")
        return

    if args.batch_all_equipment_textures:
        run_batch_all_equipment_textures(
            dry_run=args.dry_run,
            force=args.force_all_equipment_textures,
            only_slot=args.only_equipment_slot,
            only_ranged_weapons=args.only_ranged_weapon_textures,
        )
        return

    if args.batch_deep_equipment_textures:
        run_batch_deep_equipment_textures(
            dry_run=args.dry_run,
            force=args.force_deep_equipment_textures or args.force_all_equipment_textures,
            only_slot=args.only_equipment_slot,
            only_ranged_weapons=args.only_ranged_weapon_textures,
        )
        return

    user_input = args.input
    if not user_input:
        user_input = input("请用自然语言描述要生成的美术资源（例如：一把传说品质的龙炎剑图标 / 生成所有武器技能的图标 / 生成所有增幅的图标）：\n").strip()
    if not user_input:
        print("未输入描述，退出。")
        sys.exit(1)

    # 识别「生成所有增幅图标」类请求，走批量增幅图标流程
    if detect_batch_buff_icons(user_input):
        run_batch_buff_icons(dry_run=args.dry_run)
        return

    # 识别「生成所有武器技能图标」类请求，走批量补齐流程
    if detect_batch_skill_icons(user_input):
        run_batch_skill_icons(dry_run=args.dry_run)
        return

    # 深阶：equipment-deep-config.json（先于「所有装备」以免「所有深阶装备」误走基础表）
    if detect_batch_deep_equipment_textures(user_input):
        run_batch_deep_equipment_textures(
            dry_run=args.dry_run,
            force=args.force_deep_equipment_textures or args.force_all_equipment_textures,
            only_slot=args.only_equipment_slot,
            only_ranged_weapons=args.only_ranged_weapon_textures,
        )
        return

    # 「补齐所有装备贴图」等：equipment-config，全部位（含武器）
    if detect_batch_all_equipment_textures(user_input):
        run_batch_all_equipment_textures(
            dry_run=args.dry_run,
            force=args.force_all_equipment_textures,
            only_slot=args.only_equipment_slot,
            only_ranged_weapons=args.only_ranged_weapon_textures,
        )
        return

    # 识别「补齐所有武器贴图 / 装备栏武器图标」类请求（文案中无「装备」时）
    if detect_batch_weapon_textures(user_input):
        run_batch_weapon_textures(
            dry_run=args.dry_run,
            force=args.force_weapon_textures,
            only_ranged=args.only_ranged_weapon_textures,
        )
        return

    print("正在收集项目上下文…")
    context = collect_project_context()
    print("正在用 GPT 规划提示词与保存位置…")
    plan = call_gpt_plan(context, user_input)

    print("规划结果：")
    print(json.dumps(plan, ensure_ascii=False, indent=2))

    if args.dry_run:
        print("（dry-run，未生图与写文件）")
        return

    print("正在调用 Imagen 生成图片…")
    rel_folder = (plan.get("relative_folder") or "").strip()
    slot = infer_equipment_slot_from_plan(plan)
    is_equipment_icon = bool(
        plan.get("add_to_equipment_config")
        or plan.get("add_to_icon_map")
        or slot
        or rel_folder in FOLDER_TO_SLOT
    )
    base_prompt = (plan.get("image_prompt") or "").strip()
    notes = (plan.get("style_notes") or "").strip()

    if is_equipment_icon:
        eff_slot = slot or (FOLDER_TO_SLOT[rel_folder] if rel_folder in FOLDER_TO_SLOT else "")
        if eff_slot == "weapon" or rel_folder == "weapons":
            full_prompt = f"{base_prompt}. {notes}. {EQUIPMENT_WEAPON_TEXTURE_STYLE_TEMPLATE}".strip()
            raw_bytes = generate_image(full_prompt, "", for_equipment_weapon=True)
        else:
            full_prompt = f"{base_prompt}. {notes}. {EQUIPMENT_NON_WEAPON_TEXTURE_STYLE_TEMPLATE}".strip()
            raw_bytes = generate_image(full_prompt, "", for_equipment_non_weapon=True)
        image_bytes = process_transparent_icon_image(raw_bytes)
        print(f"已后处理为 {EXPORT_ICON_SIZE}×{EXPORT_ICON_SIZE} 透明底 PNG。")
    else:
        image_bytes = generate_image(base_prompt, notes)

    eq_entry = plan.get("equipment_entry")
    eq_name = ""
    if isinstance(eq_entry, dict):
        eq_name = (eq_entry.get("name") or "").strip()
    disp = (plan.get("display_name_for_icon_map") or "").strip()
    name_for_map = disp or eq_name

    print("正在保存到项目…")
    filename = plan.get("filename") or f"generated_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    if not filename.lower().endswith(".png"):
        filename += ".png"
    rel_folder_effective = rel_folder
    eff_slot_save = (
        slot or (FOLDER_TO_SLOT[rel_folder] if rel_folder in FOLDER_TO_SLOT else "")
        if is_equipment_icon
        else ""
    )
    if is_equipment_icon and name_for_map and eff_slot_save:
        wt = "melee"
        if isinstance(eq_entry, dict):
            w = (eq_entry.get("weaponType") or "melee").strip().lower()
            if w in ("melee", "ranged"):
                wt = w
        full_rel = equipment_english_relpath(
            {
                "name": name_for_map,
                "slot": eff_slot_save,
                "weaponType": wt,
                "isDeep": False,
            }
        )
        if "/" in full_rel:
            rel_folder_effective, filename = full_rel.split("/", 1)
        else:
            rel_folder_effective, filename = "", full_rel
    else:
        filename = sanitize_generated_asset_filename(filename, seed=f"{base_prompt}\n{user_input}")

    saved_path = save_image(image_bytes, rel_folder_effective, filename)
    print(f"已保存：{saved_path}")

    # 游戏内引用路径：子文件夹/文件名 或 文件名（与 AssetManager / mappings.json 一致）
    if rel_folder_effective:
        icon_map_value = f"{rel_folder_effective}/{filename}"
    else:
        icon_map_value = filename

    if plan.get("add_to_equipment_config") and plan.get("equipment_entry"):
        add_equipment_to_config(plan["equipment_entry"])
        print("已向 equipment-config.json 添加装备条目。")
    if (
        name_for_map
        and is_equipment_icon
        and (plan.get("add_to_icon_map") or plan.get("add_to_equipment_config"))
    ):
        add_equipment_mapping(name_for_map, icon_map_value)
        print(f"已写入 config/mappings.json：{name_for_map} -> {icon_map_value}")

    print("完成。")


if __name__ == "__main__":
    main()
