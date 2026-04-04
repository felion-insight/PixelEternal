
```python
import pandas as pd
import os
from PIL import Image, ImageDraw, ImageEnhance, ImageOps
import numpy as np
from io import BytesIO
import matplotlib.pyplot as plt

# ================================================
# 配置参数
# ================================================
INPUT_CSV = "equipment-overview.csv"
OUTPUT_DIR = "generated_equipment"
BASE_SIZE = 1024# 生成图像的分辨率
TARGET_SIZE = 64# 最终输出的分辨率
BORDER_WIDTH = 2# 品质边框宽度
DEBUG_MODE = True# 调试模式，显示生成的图像预览

# ================================================
# 品质颜色映射
# ================================================
QUALITY_COLORS = {
"普通": (220, 220, 220),# 柔和的白色
"稀有": (50, 200, 50),# 亮绿色
"精良": (50, 120, 255),# 蓝色
"史诗": (180, 70, 255),# 紫色
"传说": (255, 165, 0)# 橙色
}

# ================================================
# 套装特效增强参数
# ================================================
SET_EFFECTS = {
"基础套装": {"saturation": 0.9, "brightness": 0.9},
"龙族套装": {"saturation": 1.3, "contrast": 1.2, "glow": (255, 100, 0, 30)},
"圣耀套装": {"saturation": 1.4, "brightness": 1.2, "glow": (255, 255, 180, 40)},
"青铜套装": {"saturation": 0.8, "contrast": 0.9, "vintage": True},
"银月套装": {"saturation": 0.8, "brightness": 1.1, "glow": (180, 200, 255, 30)},
"晶化套装": {"transparency": 0.7, "glow": (150, 50, 255, 50)},
"烈焰套装": {"saturation": 1.5, "contrast": 1.4, "glow": (255, 50, 0, 40)},
"霜寒套装": {"saturation": 0.7, "brightness": 1.1, "glow": (100, 200, 255, 40)},
"雷霆套装": {"saturation": 1.3, "contrast": 1.5, "glow": (255, 255, 0, 50)},
"星辰套装": {"saturation": 1.6, "contrast": 1.4, "glow": (180, 100, 255, 60)}
}

# ================================================
# 图像处理函数
# ================================================
def apply_glow_effect(image, glow_color):
"""添加辉光效果"""
if not glow_color:
return image

# 创建辉光层
r, g, b, alpha = glow_color
glow = Image.new('RGBA', image.size, (r, g, b, 0))

# 创建绘制对象
draw = ImageDraw.Draw(glow)

# 获取图像非透明区域
alpha_channel = image.split()[3]
mask = alpha_channel.point(lambda x: min(x, alpha) if x > 0 else 0)

# 应用辉光
glow.putalpha(mask)
return Image.alpha_composite(image, glow)

def apply_set_effect(image, set_name):
"""应用套装特效增强"""
if set_name not in SET_EFFECTS:
return image

effect = SET_EFFECTS[set_name]
img = image.copy()

# 饱和度调整
if 'saturation' in effect:
enhancer = ImageEnhance.Color(img)
img = enhancer.enhance(effect['saturation'])

# 对比度调整
if 'contrast' in effect:
enhancer = ImageEnhance.Contrast(img)
img = enhancer.enhance(effect['contrast'])

# 亮度调整
if 'brightness' in effect:
enhancer = ImageEnhance.Brightness(img)
img = enhancer.enhance(effect['brightness'])

# 复古效果（青铜套装）
if effect.get('vintage'):
brown_layer = Image.new('RGBA', img.size, (80, 60, 40, 30))
img = Image.alpha_composite(img, brown_layer)

# 辉光效果
if 'glow' in effect:
img = apply_glow_effect(img, effect['glow'])

return img

def add_quality_border(image, quality):
"""添加品质边框"""
if quality not in QUALITY_COLORS:
return image

border_color = QUALITY_COLORS[quality]

# 创建带边框的新图像
bordered = Image.new('RGBA',
(image.width + BORDER_WIDTH*2,
image.height + BORDER_WIDTH*2),
(*border_color, 255))

# 粘贴原图
bordered.paste(image, (BORDER_WIDTH, BORDER_WIDTH), image)
return bordered

def resize_with_pixel_style(image, size):
"""使用像素风格缩放"""
return image.resize(size, Image.NEAREST)

# ================================================
# 图像生成函数（模拟）
# ================================================
def generate_image_from_prompt(prompt, size=(1024, 1024)):
"""模拟图像生成函数 - 在实际使用中替换为真实API调用"""
# 创建纯黑背景
img = Image.new('RGBA', size, (0, 0, 0, 0))

# 根据提示词创建简单图形
draw = ImageDraw.Draw(img)

# 根据提示词内容生成不同形状
if "sword" in prompt:
# 武器形状
draw.polygon([(size[0]//2, size[1]//4),
(size[0]//4, size[1]//2),
(size[0]*3//4, size[1]//2)],
fill=(200, 200, 200, 255))
elif "helmet" in prompt:
# 头盔形状
draw.ellipse((size[0]//4, size[1]//4, size[0]*3//4, size[1]//2),
fill=(150, 150, 150, 255))
elif "chest" in prompt:
# 胸甲形状
draw.rectangle((size[0]//4, size[1]//4, size[0]*3//4, size[1]*3//4),
fill=(180, 180, 180, 255))
elif "amulet" in prompt:
# 项链形状
draw.ellipse((size[0]//3, size[1]//3, size[0]*2//3, size[1]*2//3),
fill=(255, 215, 0, 255))
else:
# 默认圆形
draw.ellipse((size[0]//4, size[1]//4, size[0]*3//4, size[1]*3//4),
fill=(100, 150, 255, 255))

# 添加套装特征
if "dragon" in prompt:
# 龙族特效
for i in range(5):
x = size[0]//2 + int(50 * np.sin(i))
y = size[1]//2 + int(50 * np.cos(i))
draw.ellipse((x-10, y-10, x+10, y+10), fill=(255, 100, 0, 200))

return img

# ================================================
# 主处理流程
# ================================================
def process_and_save_image(prompt, filename, quality, set_name):
"""处理并保存图像"""
try:
# 1. 生成图像 (替换为实际API调用)
# 实际使用时替换为:
# img = your_image_generation_api(prompt, size=(BASE_SIZE, BASE_SIZE))
img = generate_image_from_prompt(prompt, (BASE_SIZE, BASE_SIZE))

# 2. 应用套装特效
if set_name:
img = apply_set_effect(img, set_name)

# 3. 缩放（保留像素风格）
img = resize_with_pixel_style(img, (TARGET_SIZE, TARGET_SIZE))

# 4. 添加品质边框
img = add_quality_border(img, quality)

# 5. 保存图像
img.save(os.path.join(OUTPUT_DIR, filename), "PNG")

# 调试模式显示图像
if DEBUG_MODE:
plt.figure(figsize=(4, 4))
plt.imshow(img)
plt.title(f"{filename}\n{quality} | {set_name}")
plt.axis('off')
plt.show()

return True

except Exception as e:
print(f"× 处理失败: {filename} - {str(e)}")
return False

# ================================================
# 批量处理函数
# ================================================
def generate_equipment_images():
# 创建输出目录
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 读取CSV
df = pd.read_csv(INPUT_CSV)

# 统计进度
total = len(df)
success_count = 0

print(f"开始生成装备贴图 (共{total}件)...")
print("=" * 60)

for index, row in df.iterrows():
# 准备参数
name = row['名称']
prompt = row['贴图提示词']
quality = row['品质']
set_name = row['所属套装'] if not pd.isna(row['所属套装']) else ""
filename = f"{name}_{quality}.png"

print(f"生成: {name} ({quality})")
print(f"提示词: {prompt}")

# 处理并保存图像
if process_and_save_image(prompt, filename, quality, set_name):
success_count += 1
print(f"✓ 成功生成 ({index+1}/{total})")

print("-" * 60)

print("=" * 60)
print(f"生成完成! 成功率: {success_count}/{total} ({success_count/total:.1%})")

# ================================================
# 提示词样例展示
# ================================================
def show_prompt_examples():
"""显示提示词样例"""
examples = [
{
"名称": "逆鳞屠龙锋",
"品质": "史诗",
"套装": "龙族套装",
"提示词": "longsword or blade, dragon scale and dragon pattern, dark gold and red, imposing, pixel art icon, retro 16-bit style, pure black background, no text"
},
{
"名称": "圣耀·断罪",
"品质": "传说",
"套装": "圣耀套装",
"提示词": "longsword or blade, divine holy light, golden-white radiance, solemn, pixel art icon, retro 16-bit style, pure black background, no text"
},
{
"名称": "晶曜寒锋",
"品质": "精良",
"套装": "晶化套装",
"提示词": "longsword or blade, crystal or transparent prism, blue-purple glow, translucent, pixel art icon, retro 16-bit style, pure black background, no text"
}
]

print("\n装备提示词样例:")
print("=" * 60)
for ex in examples:
print(f"名称: {ex['名称']} ({ex['品质']}, {ex['套装']})")
print(f"提示词: {ex['提示词']}")
print("-" * 60)

# ================================================
# 执行主程序
# ================================================
if __name__ == "__main__":
# 显示提示词样例
show_prompt_examples()

# 生成装备图像
generate_equipment_images()

print("所有装备贴图生成完毕！")
```

## 使用说明

### 1. 准备工作
- 确保安装所需库：`pip install pandas pillow numpy matplotlib`
- 将 `equipment-overview.csv` 放在脚本同目录下（或由 `tools/export_equipment_csv.py` 生成到 `docs/`）
- 创建输出目录：`generated_equipment`

### 2. 图像生成API集成
在`generate_image_from_prompt()`函数中：
```python
# 替换为实际的图像生成API调用
# img = your_image_generation_api(prompt, size=(BASE_SIZE, BASE_SIZE))
```

### 3. 运行脚本
```bash
python generate_equipment.py
```

### 4. 输出结果
- 所有装备贴图保存在`generated_equipment`目录
- 文件名格式：`装备名称_品质.png`
- 自动添加品质边框和套装特效
- 调试模式下会显示图像预览

## 特效增强系统详解

### 品质边框系统
| 品质| 颜色 (RGB)| 效果描述|
|--------|-----------------|------------------|
| 普通| (220, 220, 220) | 柔和的白色边框|
| 稀有| (50, 200, 50)| 鲜艳的绿色边框|
| 精良| (50, 120, 255)| 明亮的蓝色边框|
| 史诗| (180, 70, 255)| 华丽的紫色边框|
| 传说| (255, 165, 0)| 醒目的橙色边框|

### 套装特效系统
| 套装名称| 特效描述|
|------------|------------------------------|
| 龙族套装| 增强饱和度+对比度，添加红橙辉光 |
| 圣耀套装| 增强饱和度+亮度，添加金色辉光|
| 青铜套装| 降低饱和度+对比度，添加复古效果 |
| 银月套装| 调整饱和度+亮度，添加蓝白辉光|
| 晶化套装| 增加透明度，添加紫蓝辉光|
| 烈焰套装| 大幅增强饱和度+对比度，添加红橙辉光 |
| 霜寒套装| 降低饱和度，提高亮度，添加蓝白辉光 |
| 雷霆套装| 增强饱和度+对比度，添加黄紫电光 |
| 星辰套装| 大幅增强饱和度+对比度，添加紫金辉光 |

## 提示词样例

### 示例1: 逆鳞屠龙锋 (史诗, 龙族套装)
```
longsword or blade, dragon scale and dragon pattern, dark gold and red, imposing,
pixel art icon, retro 16-bit style, pure black background, no text
```
- **特效增强**: 饱和度+30%，对比度+20%，红橙辉光

### 示例2: 圣耀·断罪 (传说, 圣耀套装)
```
longsword or blade, divine holy light, golden-white radiance, solemn,
pixel art icon, retro 16-bit style, pure black background, no text
```
- **特效增强**: 饱和度+40%，亮度+20%，金色辉光

### 示例3: 晶曜寒锋 (精良, 晶化套装)
```
longsword or blade, crystal or transparent prism, blue-purple glow, translucent,
pixel art icon, retro 16-bit style, pure black background, no text
```
- **特效增强**: 透明度70%，紫蓝辉光

## 自定义调整指南

1. **调整边框粗细**:
```python
BORDER_WIDTH = 3# 增大边框宽度
```

2. **修改套装特效**:
```python
SET_EFFECTS["龙族套装"] = {
"saturation": 1.5,# 增强饱和度
"contrast": 1.3,# 增强对比度
"glow": (255, 80, 0, 50)# 更强烈的红橙辉光
}
```

3. **添加新套装**:
```python
SET_EFFECTS["暗影套装"] = {
"saturation": 0.7,
"brightness": 0.8,
"glow": (80, 0, 120, 40)# 深紫色辉光
}
```

4. **禁用调试模式**:
```python
DEBUG_MODE = False# 关闭图像预览
```