# 像素技能图标批量生成API工具需求文档

## 1. 核心功能
开发一个基于Imagen 4.0 Ultra API的自动化工具，实现：
- 批量生成游戏技能图标
- 确保统一的像素艺术风格
- 自动后处理（缩放+格式转换）
- 错误处理和日志记录

## 2. 技术栈要求
- **语言**: Python 3.10+
- **核心库**:
- `requests` (API调用)
- `Pillow` (图像处理)
- `pandas` (数据处理)
- **配置管理**: `configparser` 或 `.env`

## 3. API调用规范

### 请求参数模板
```python
{
"model": "imagen-4.0-ultra-generate-001",
"prompt": "Pixel art skill icon, retro 16-bit style, blocky pixel clusters, clean central composition, solid black background, no decorative borders, no text, no stars, no level numbers, no element symbols, minimalistic design, sharp edges, no anti-aliasing, {shape} with {texture} in {color} palette",
"size": "512x512",
"quality": "ultra-detail",
"style_strength": 0.9,
"steps": 50,
"negative_prompt": "text, numbers, stars, borders, UI elements, decorations"
}
```

### 响应处理
- 保存原始PNG到`/raw/{skill_id}.png`
- 错误时重试3次（指数退避）

## 4. 数据处理流程

### 输入CSV格式 (skills.csv)
```csv
skill_id,skill_name,shape,texture,color
101,雷枪术,lightning_spear,crackling_electricity,vibrant_cyan
102,火焰弹,fireball,flickering_flames,fiery_red
103,冰霜箭,ice_arrow,glowing_frost,icy_blue
```

### 图像后处理要求
```python
from PIL import Image

def process_image(input_path, output_path):
img = Image.open(input_path)

# 确保纯黑背景
if img.mode != 'RGBA':
img = img.convert('RGBA')

# 创建纯黑背景
black_bg = Image.new('RGBA', img.size, (0, 0, 0, 255))
black_bg.paste(img, (0, 0), img)

# 像素精确缩放
resized = black_bg.resize((64, 64), Image.NEAREST)
resized.save(output_path, "PNG")
```

## 5. 目录结构
```
/icons_generator/
├── config.ini
├── skills.csv
├── main.py
├── requirements.txt
├── /raw/# 原始512x512图片
├── /processed/# 处理后的64x64图标
└── /logs/# 生成日志
```

## 6. 核心代码框架

```python
import pandas as pd
import requests
import os
from PIL import Image
from datetime import datetime

# 配置加载
API_KEY = os.getenv('IMAGEN_API_KEY')
BASE_URL = "https://api.imagen.ai/v1/images/generate"

def generate_icon(prompt):
headers = {"Authorization": f"Bearer {API_KEY}"}
payload = {
"prompt": prompt,
"size": "512x512",
"quality": "ultra-detail",
"style_strength": 0.9,
"steps": 50
}

for attempt in range(3):
try:
response = requests.post(BASE_URL, json=payload, headers=headers)
response.raise_for_status()
return response.content
except Exception as e:
log_error(f"Attempt {attempt+1} failed: {str(e)}")

raise Exception("API call failed after 3 attempts")

def process_skills(csv_path):
df = pd.read_csv(csv_path)

for _, row in df.iterrows():
prompt = f"Pixel art skill icon... {row['shape']} with {row['texture']} in {row['color']} palette"

try:
# 生成原始图像
raw_data = generate_icon(prompt)
raw_path = f"raw/{row['skill_id']}.png"
with open(raw_path, "wb") as f:
f.write(raw_data)

# 处理后处理
processed_path = f"processed/{row['skill_id']}.png"
process_image(raw_path, processed_path)

log_success(row['skill_id'], prompt)

except Exception as e:
log_error(f"Failed for {row['skill_id']}: {str(e)}")

if __name__ == "__main__":
process_skills("skills.csv")
```

## 7. 环境配置

### config.ini
```ini
[API]
endpoint = https://api.imagen.ai/v1/images/generate
api_key = your_api_key_here

[Paths]
raw_dir = ./raw
processed_dir = ./processed
```

### requirements.txt
```
requests>=2.28
pandas>=1.5
Pillow>=9.4
python-dotenv>=0.21
```

## 8. 测试方案
1. 单元测试：验证提示词构建逻辑
2. 集成测试：使用Mock API测试完整流程
3. 视觉测试：生成5个样本图标人工验证
4. 压力测试：批量生成50+图标检查内存/性能

## 9. 交付物
- 完整的Python项目包
- 安装使用说明（README.md）
- 示例技能CSV文件
- 测试报告

## 使用说明

1. 将本文档完整复制给Cursor
2. 说明需要实现的核心功能：
- 从CSV读取技能配置
- 动态构建提示词
- 调用Imagen API生成图像
- 后处理（纯黑背景+像素缩放）
- 错误处理和日志记录

3. 特别强调要求：
- **必须使用NEAREST插值算法缩放**
- **强制纯黑背景处理**
- **详细的错误日志记录**
- **重试机制应对API不稳定**

4. 要求输出完整可运行代码，包含：
- 主程序框架
- 图像处理函数
- 配置文件示例
- 依赖文件