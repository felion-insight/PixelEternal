可以通过调用官方 `google-generativeai` SDK 或 REST API，结合具体的提示词和批量处理逻辑，来实现 `gemini-3.1-flash-image-preview` 模型的批量图片生成任务。

下面是一份包含核心代码的完整方案，可以直接在此基础上根据项目需求进行扩展。

### 🧱 前置准备

在开始之前，需要完成两项基础工作：

1.  **获取可用的API密钥并充值**
    `gemini-3.1-flash-image-preview` 是一个付费模型，免费API额度不包含它的图片生成能力。
    *   **官方渠道**：在 [Google AI Studio](https://aistudio.google.com) 创建API密钥，并在Google Cloud的结算中启用计费。
    *   **第三方网关**：也可以选择EvoLink等第三方服务商提供的API，流程更简单，通常还有折扣。
    *   **定价参考**：根据2026年2月27日的信息，Google官方2K分辨率的图片为$0.101/张，4K为$0.150/张。

2.  **安装官方的Python SDK**
    官方提供了 `google-generativeai` 包，这是最稳定和推荐的方式。
    ```bash
    pip install google-generativeai
    ```

### ⚙️ 方案概述与工具对比

为了更高效地完成任务，社区已有一些成熟的工具可供选择。下表对几个主流的批量生成工具进行了对比，方便你根据需求进行选择。

| 工具名称 | 类型 | 特点与优势 |
| :--- | :--- | :--- |
| **gemini-image-generator** | 第三方库 | 专为批量生成而设计，支持**恢复会话(resumable sessions)**和智能文件管理，适合处理大量任务时提供容错能力。 |
| **gemini-parallel-mongodb** | 第三方库 | 核心特点是**并行处理**，支持并行执行API调用并记录日志，能显著提高处理速度。 |
| **官方 google-generativeai SDK** | 官方库 | **最稳定，最标准**。作为基础，可以通过自行编写逻辑实现异步、重试和批量处理，灵活性最高。 |

如果你追求稳定和可控，可以基于官方SDK自行编写脚本；如果更看重效率和容错性，可以直接使用社区的 `gemini-image-generator` 库。

### 🚀 批量处理脚本实现（基于官方SDK）

这是一个完整的、生产级的批量生成脚本示例，你可以直接使用或根据需要修改。

```python
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
import base64
from io import BytesIO
from pathlib import Path
from PIL import Image
from typing import List, Dict, Optional
import time
import json
from datetime import datetime

# --- 配置区域 ---
API_KEY = "YOUR_API_KEY"  # 替换为你的API密钥
OUTPUT_DIR = Path("./generated_sprites")
PROMPTS_FILE = "prompts.json"  # 存放所有提示词的JSON文件
RETRY_ATTEMPTS = 3
RATE_LIMIT_PER_MINUTE = 2  # 免费层级的限制通常是每分钟2次，付费用户可忽略此项

# --- 初始化客户端 ---
genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-3.1-flash-image-preview')

def generate_single_sprite_sheet(prompt: str, aspect_ratio: str = "1:1") -> Optional[Image.Image]:
    """
    调用Gemini API为单个提示词生成精灵表。
    包含重试机制和详细的错误处理。
    """
    for attempt in range(RETRY_ATTEMPTS):
        try:
            print(f"  正在生成: '{prompt[:50]}...' (尝试 {attempt+1}/{RETRY_ATTEMPTS})")
            
            # 调用API生成内容
            response = model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    # 使用采样计数可以一次生成多个候选，但会增加成本
                    candidate_count=1,
                )
            )
            
            # 从响应中提取图像数据
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data:
                        image_data = part.inline_data.data
                        if part.inline_data.mime_type == 'image/png':
                            image = Image.open(BytesIO(image_data))
                            return image
                        else:
                            # 如果返回的不是PNG，可能是文本或其他
                            print(f"    警告: 生成的内容不是图片，可能是文本。内容: {part.text}")
                            # 可以选择继续尝试
                            continue
            
            # 如果未找到图片数据，打印响应以供调试
            print(f"    错误: 响应中没有图片数据。响应: {response}")
            if response.prompt_feedback:
                print(f"    安全过滤原因: {response.prompt_feedback}")

        except Exception as e:
            print(f"    生成失败 (尝试 {attempt+1}/{RETRY_ATTEMPTS}): {e}")
            if attempt < RETRY_ATTEMPTS - 1:
                wait_time = 2 ** attempt  # 指数退避
                print(f"    等待 {wait_time} 秒后重试...")
                time.sleep(wait_time)
            else:
                print(f"    最终失败，已跳过。")
                return None
    return None

def batch_generate_from_file(prompts_file: str):
    """
    从JSON文件读取所有提示词，并批量生成精灵表。
    """
    with open(prompts_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 支持多种JSON结构
    if isinstance(data, list):
        prompts = [{'id': i, 'prompt': p} for i, p in enumerate(data)]
    elif isinstance(data, dict) and 'prompts' in data:
        prompts = data['prompts']
    else:
        raise ValueError("不支持的JSON格式，请使用列表或包含'prompts'键的字典")
    
    # 创建输出目录
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    batch_dir = OUTPUT_DIR / f"batch_{timestamp}"
    batch_dir.mkdir(parents=True, exist_ok=True)
    
    # 保存提示词列表到输出目录，方便追溯
    with open(batch_dir / "prompts.json", 'w', encoding='utf-8') as f:
        json.dump(prompts, f, ensure_ascii=False, indent=2)
    
    print(f"\n开始批量生成，共 {len(prompts)} 个提示词")
    print(f"输出目录: {batch_dir}")
    print("-" * 50)
    
    # 速率限制器
    last_request_time = 0
    
    results = []
    for i, item in enumerate(prompts):
        prompt_id = item.get('id', i)
        prompt_text = item.get('prompt')
        
        if not prompt_text:
            continue
        
        # 速率限制
        if RATE_LIMIT_PER_MINUTE > 0:
            elapsed = time.time() - last_request_time
            if elapsed < 60.0 / RATE_LIMIT_PER_MINUTE:
                time.sleep(60.0 / RATE_LIMIT_PER_MINUTE - elapsed)
        
        print(f"\n[{i+1}/{len(prompts)}] 提示词ID: {prompt_id}")
        image = generate_single_sprite_sheet(prompt_text)
        
        if image:
            # 保存图片
            filename = f"sprite_{prompt_id}.png"
            image_path = batch_dir / filename
            image.save(image_path)
            results.append({'id': prompt_id, 'status': 'success', 'path': str(image_path)})
            print(f"    已保存至: {image_path}")
        else:
            results.append({'id': prompt_id, 'status': 'failed', 'prompt': prompt_text})
        
        last_request_time = time.time()
    
    # 保存处理结果
    with open(batch_dir / "results.json", 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    # 打印最终统计
    success_count = sum(1 for r in results if r['status'] == 'success')
    print("\n" + "=" * 50)
    print(f"批量生成完成！成功: {success_count}/{len(prompts)}")
    print(f"失败: {len(prompts) - success_count}")
    print(f"输出目录: {batch_dir}")

def main():
    """主函数入口"""
    print("Gemini 3.1 Flash 精灵表批量生成工具")
    print("=" * 50)
    
    # 检查输出目录
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # 执行批量生成
    batch_generate_from_file(PROMPTS_FILE)

if __name__ == "__main__":
    main()
```

**JSON数据文件 (`prompts.json`)** 的格式参考如下：
```json
{
  "prompts": [
    {"id": "001", "prompt": "一个2D横版、16-bit像素风格、披着红色披风的长剑骑士，做出三连击技能的前两击：第一剑左横扫，第二剑右上挑。纯黑背景。"},
    {"id": "002", "prompt": "同一个骑士，接招动作：举起盾牌格挡。帧数: 3帧, 抬起->格挡->收回。风格保持一致，纯黑背景。"}
  ]
}
```

### 💡 进阶技巧与最佳实践

*   **速率限制与重试**
    免费层级的API限制通常为每分钟2次请求。脚本中已实现了速率限制器和指数退避的重试逻辑，可以避免触发API的限制。如果需要更高的生成效率，可以考虑付费账户或使用支持并行处理的三方库如`gemini-parallel-mongodb`。

*   **提示词工程**
    脚本使用`genai.types.GenerationConfig`来配置生成参数。此外，还有一些通过参数控制效果的技巧：
    *   **主体一致性**：在生成复杂动画时，可以利用模型的特性，在提示词中要求其保持角色和物体的外观一致。模型原生支持在一次生成中最多控制5个角色和14个物体的外观一致性。
    *   **控制思考级别**：通过`generation_config`中的`thinking_level`参数可以平衡生成质量与速度。可以使用`"minimal"`（默认）来获得最快的生成速度，或用`"high"`或`"dynamic"`来处理更复杂的提示词。

*   **扩展方案**
    *   **集成到工具链**：可以将这个脚本集成到更完整的工具链中。例如，借鉴`gemini-image-generator`这类第三方库的思路，增加“可续传会话”和“智能文件管理”功能，让批量生成任务更健壮。
    *   **使用Batch API应对大规模需求**：如果需要生成海量图像，官方提供了专门的Batch API。它允许将大量请求打包提交，异步处理最长可达24小时，并享受更高速率限制。

*   **常见错误与排查**
    *   **配额超限**：检查是否使用的是付费API密钥，免费密钥不支持`gemini-3.1-flash-image-preview`。
    *   **图片未生成或生成文本**：检查提示词是否包含`"text"`和`"image"`的生成要求，并确认`generation_config`中未强制只返回文本。
    *   **网络超时/连接错误**：尝试增加超时时间。对于大量生成任务，同步请求可能导致超时，建议使用异步方法或官方Batch API。

### 💎 总结

*   **核心路径**：使用官方 `google-generativeai` SDK 是最稳定和推荐的方案，配合我提供的批量脚本可以快速完成生产级任务。
*   **提升效率**：如果需要更高的效率，可以采用支持并行处理的第三方库，或者直接使用官方Batch API来应对超大规模的需求。
*   **提示词迭代**：API的威力在于可以程序化地快速迭代提示词。建议先用小批量数据（如2-3个提示词）测试和优化你的提示词，成功后再扩展到完整数据集。

接下来，你可以先准备好API密钥和`prompts.json`文件，然后直接运行上面的脚本开始你的第一次批量生成。如果在执行过程中遇到任何具体的报错信息，或者想进一步调整脚本中的某部分逻辑，欢迎随时告诉我。