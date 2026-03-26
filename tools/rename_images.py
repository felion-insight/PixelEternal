#!/usr/bin/env python3
"""
重命名图片文件，删除品质、时间戳等后缀
"""
import os
import re
from pathlib import Path

def rename_equipment_images():
    """重命名装备图片"""
    base_dir = Path(__file__).parent.parent
    equipment_dir = base_dir / "asset" / "NewEquipment_icons"
    
    if not equipment_dir.exists():
        print(f"目录不存在: {equipment_dir}")
        return
    
    renamed = []
    for file in equipment_dir.glob("*.png"):
        old_name = file.name
        # 删除 _品质 后缀（普通、稀有、精良、史诗、传说）
        new_name = re.sub(r'_(普通|稀有|精良|史诗|传说)\.png$', '.png', old_name)
        
        if new_name != old_name:
            new_path = equipment_dir / new_name
            if new_path.exists() and new_path != file:
                print(f"跳过（目标已存在）: {old_name} -> {new_name}")
            else:
                file.rename(new_path)
                renamed.append((old_name, new_name))
                print(f"重命名: {old_name} -> {new_name}")
    
    print(f"\n装备图片重命名完成，共 {len(renamed)} 个文件")
    return renamed

def rename_alchemy_material_images():
    """重命名炼金材料图片"""
    base_dir = Path(__file__).parent.parent
    material_dir = base_dir / "asset" / "alchemy_materials"
    
    if not material_dir.exists():
        print(f"目录不存在: {material_dir}")
        return
    
    renamed = []
    for file in material_dir.glob("*.png"):
        old_name = file.name
        # 删除 _时间戳_编号 后缀
        new_name = re.sub(r'_\d{8}_\d{6}_\d+\.png$', '.png', old_name)
        
        if new_name != old_name:
            new_path = material_dir / new_name
            if new_path.exists() and new_path != file:
                print(f"跳过（目标已存在）: {old_name} -> {new_name}")
            else:
                file.rename(new_path)
                renamed.append((old_name, new_name))
                print(f"重命名: {old_name} -> {new_name}")
    
    print(f"\n炼金材料图片重命名完成，共 {len(renamed)} 个文件")
    return renamed

if __name__ == "__main__":
    print("开始重命名图片文件...\n")
    
    equipment_renamed = rename_equipment_images()
    material_renamed = rename_alchemy_material_images()
    
    print(f"\n总共重命名了 {len(equipment_renamed) + len(material_renamed)} 个文件")

