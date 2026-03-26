#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 config/equipment-config.json 解析装备定义，导出为 CSV（装备一览）。
"""
import json
import csv
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PROJECT_ROOT / "config" / "equipment-config.json"
SET_CONFIG_PATH = PROJECT_ROOT / "config" / "set-config.json"
OUTPUT_PATH = PROJECT_ROOT / "docs" / "装备一览.csv"

SLOT_CN = {
    "weapon": "武器",
    "helmet": "头盔",
    "chest": "胸甲",
    "legs": "腿甲",
    "boots": "足具",
    "necklace": "项链",
    "ring": "指环",
    "belt": "腰带",
}

QUALITY_CN = {
    "common": "普通",
    "rare": "稀有",
    "fine": "精良",
    "epic": "史诗",
    "legendary": "传说",
}

# 部位 -> 物品类型（中文/英文），用于特点与贴图提示
SLOT_ITEM_CN = {
    "武器": "长剑/刃",
    "头盔": "头盔/帽/冠",
    "胸甲": "胸甲/袍/衫",
    "腿甲": "护腿/裤/裙甲",
    "足具": "靴/鞋",
    "项链": "项链/吊坠/勋章",
    "指环": "指环/戒指",
    "腰带": "腰带/束带",
}
SLOT_ITEM_EN = {
    "武器": "longsword or blade",
    "头盔": "helmet or crown",
    "胸甲": "chest plate or robe",
    "腿甲": "leg guards or greaves",
    "足具": "boots or shoes",
    "项链": "necklace or pendant",
    "指环": "ring",
    "腰带": "belt",
}

# 套装 -> 视觉特点（中文简述 / 英文贴图提示片段）
SET_THEME_CN = {
    "基础套装": "朴素铁皮布，灰褐/暗色，无华丽装饰",
    "青铜套装": "青铜材质、铜绿锈迹，古朴厚重",
    "银月套装": "银白冷色、月光质感，简洁利落",
    "晶化套装": "水晶/透明晶棱，蓝紫冷光，剔透",
    "烈焰套装": "火焰纹饰、熔岩赤红橙，炽热感",
    "霜寒套装": "冰霜雪纹、冰蓝白色，寒冷雾气",
    "雷霆套装": "闪电雷纹、黄紫电光，电弧感",
    "星辰套装": "星空星芒、深蓝紫金，神秘光泽",
    "龙族套装": "龙鳞龙纹、暗金赤色，威严",
    "圣耀套装": "神圣光明、金白圣辉，庄严",
}
SET_THEME_EN = {
    "基础套装": "rusty iron and leather, brown-gray, no decoration",
    "青铜套装": "bronze with patina, antique copper-green, heavy",
    "银月套装": "silver-white cold tone, moonlight sheen, clean",
    "晶化套装": "crystal or transparent prism, blue-purple glow, translucent",
    "烈焰套装": "flame pattern, lava red-orange, fiery glow",
    "霜寒套装": "frost and snow pattern, ice blue-white, chilly mist",
    "雷霆套装": "lightning and thunder pattern, electric yellow-purple, crackling",
    "星辰套装": "star and cosmos motif, deep blue-purple-gold, mystical sheen",
    "龙族套装": "dragon scale and dragon pattern, dark gold and red, imposing",
    "圣耀套装": "divine holy light, golden-white radiance, solemn",
}


def _name_hint_en(name: str, set_name: str) -> str:
    """从装备名称提取英文关键词（无套装时用于贴图提示）。"""
    if set_name:
        return ""
    if "龙" in name or "鳞" in name:
        return "dragon scale motif, "
    if "圣" in name or "神" in name or "耀" in name:
        return "holy golden light, "
    if "霜" in name or "冰" in name or "凛" in name:
        return "frost ice, "
    if "雷" in name or "电" in name or "惊" in name:
        return "lightning electric, "
    if "星" in name or "辰" in name:
        return "stellar cosmic, "
    if ("火" in name or "焰" in name or "烬" in name) and "淬火" not in name:
        return "flame fire, "
    if "晶" in name or "莹" in name or "琉璃" in name:
        return "crystal translucent, "
    if "银" in name or "月" in name:
        return "silver moonlight, "
    if "铜" in name or "青铜" in name:
        return "bronze patina, "
    if "幽冥" in name or "绝影" in name:
        return "shadow dark, "
    if "骑士" in name:
        return "knight style, "
    if "占星" in name or "咏咒" in name:
        return "mage mystic, "
    return ""


def get_equipment_traits(slot_cn: str, set_name: str, name: str) -> tuple[str, str]:
    """根据部位、套装、名称生成 特点（中文）与 贴图提示词（英文）。"""
    item_cn = SLOT_ITEM_CN.get(slot_cn, slot_cn)
    item_en = SLOT_ITEM_EN.get(slot_cn, slot_cn)
    if set_name and set_name in SET_THEME_CN:
        theme_cn = SET_THEME_CN[set_name]
        theme_en = SET_THEME_EN[set_name]
    else:
        theme_cn = "通用金属/皮甲，中性色调"
        theme_en = "generic metal or leather, neutral tone"
    # 名称关键词加强中文特点（无套装时更依赖名称）
    name_hint_cn = ""
    if not set_name:
        if "龙" in name or "鳞" in name:
            name_hint_cn = "龙鳞/龙纹 "
        elif "圣" in name or "神" in name or "耀" in name:
            name_hint_cn = "神圣/光明 "
        elif "霜" in name or "冰" in name or "凛" in name:
            name_hint_cn = "冰霜 "
        elif "雷" in name or "电" in name or "惊" in name:
            name_hint_cn = "雷电 "
        elif "星" in name or "辰" in name:
            name_hint_cn = "星辰 "
        elif ("火" in name or "焰" in name or "烬" in name) and "淬火" not in name:
            name_hint_cn = "火焰 "
        elif "晶" in name or "莹" in name or "琉璃" in name:
            name_hint_cn = "晶透 "
        elif "银" in name or "月" in name:
            name_hint_cn = "银月 "
        elif "铜" in name or "青铜" in name:
            name_hint_cn = "青铜 "
    if "幽冥" in name or "绝影" in name:
        name_hint_cn = "暗影/幽暗 "
    elif "骑士" in name:
        name_hint_cn = "骑士风格 "
    elif "占星" in name or "咏咒" in name:
        name_hint_cn = "法师/秘法 "
    theme_cn = name_hint_cn + theme_cn
    extra_en = _name_hint_en(name, set_name)
    trait_cn = f"{item_cn}；{theme_cn}"
    prompt_en = f"{item_en}, {extra_en}{theme_en}, pixel art icon, retro 16-bit style, pure black background, no text"
    return trait_cn, prompt_en


def parse_equipment(eq: dict) -> dict:
    """从 JSON 装备对象解析出装备定义。"""
    slot = eq.get("slot", "")
    name = eq.get("name", "")
    level = eq.get("level", 1)
    quality = eq.get("quality", "common")
    return {
        "部位": SLOT_CN.get(slot, slot),
        "名称": name,
        "等级": level,
        "品质": QUALITY_CN.get(quality, quality),
        "所属套装": "",  # 由 main 中根据 set-config 填充
        "攻击力": eq.get("attack", ""),
        "暴击率": eq.get("critRate", ""),
        "暴击伤害": eq.get("critDamage", ""),
        "生命值": eq.get("health", ""),
        "防御力": eq.get("defense", ""),
        "闪避率": eq.get("dodge", ""),
        "攻击速度": eq.get("attackSpeed", ""),
        "移动速度": eq.get("moveSpeed", ""),
    }


def build_equipment_to_set_name() -> dict[str, str]:
    """从 set-config.json 解析装备名 -> 套装名称（中文）映射。"""
    equipment_to_set: dict[str, str] = {}
    if not SET_CONFIG_PATH.exists():
        return equipment_to_set
    with open(SET_CONFIG_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
        set_defs = data.get("SET_DEFINITIONS", {})
        for set_id, set_data in set_defs.items():
            set_name = set_data.get("name", "")
            pieces = set_data.get("pieces", [])
            for piece in pieces:
                equipment_to_set[piece] = set_name
    return equipment_to_set


def main():
    equipment_to_set = build_equipment_to_set_name()

    if not CONFIG_PATH.exists():
        print(f"配置文件不存在: {CONFIG_PATH}")
        return
    
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
        equipment_defs = data.get("EQUIPMENT_DEFINITIONS", [])
    
    rows = []
    for eq in equipment_defs:
        row = parse_equipment(eq)
        row["所属套装"] = equipment_to_set.get(row["名称"], "")
        trait_cn, prompt_en = get_equipment_traits(
            row["部位"], row["所属套装"], row["名称"]
        )
        row["特点"] = trait_cn
        row["贴图提示词"] = prompt_en
        rows.append(row)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "部位", "名称", "等级", "品质", "所属套装", "特点", "贴图提示词",
                "攻击力", "暴击率", "暴击伤害",
                "生命值", "防御力",
                "闪避率", "攻击速度", "移动速度",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"已导出 {len(rows)} 条装备至 {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
