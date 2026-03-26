#!/usr/bin/env python3
"""
图片背景移除工具
读取asset文件夹中的所有图片文件，根据指定颜色和容差去除背景，输出到dist文件夹
"""
import os
import argparse
from pathlib import Path
from PIL import Image
from collections import Counter

def find_dominant_color(image_path, color_quantization=8):
    """
    找出图片中占比最大的颜色
    
    Args:
        image_path: 图片路径
        color_quantization: 颜色量化级别，用于减少颜色数量（默认8，即每个通道分为8级）
                          值越大，颜色区分越精细，但计算量越大
    
    Returns:
        (R, G, B) 元组，表示占比最大的颜色
    """
    try:
        img = Image.open(image_path).convert("RGB")
        pixels = img.load()
        width, height = img.size
        
        # 颜色统计（使用量化后的颜色）
        color_counter = Counter()
        
        # 量化因子：将0-255映射到0-(color_quantization-1)
        quantize_factor = 256 / color_quantization
        
        for y in range(height):
            for x in range(width):
                r, g, b = pixels[x, y]
                # 量化颜色以减少颜色数量
                quantized_r = int(r / quantize_factor)
                quantized_g = int(g / quantize_factor)
                quantized_b = int(b / quantize_factor)
                color_counter[(quantized_r, quantized_g, quantized_b)] += 1
        
        # 找出占比最大的颜色
        if not color_counter:
            return (255, 255, 255)  # 默认返回白色
        
        dominant_quantized = color_counter.most_common(1)[0][0]
        
        # 将量化后的颜色转换回原始范围（取量化区间的中间值）
        dominant_color = (
            int((dominant_quantized[0] + 0.5) * quantize_factor),
            int((dominant_quantized[1] + 0.5) * quantize_factor),
            int((dominant_quantized[2] + 0.5) * quantize_factor)
        )
        
        # 确保值在0-255范围内
        dominant_color = tuple(max(0, min(255, c)) for c in dominant_color)
        
        return dominant_color
    except Exception as e:
        print(f"检测颜色时出错: {e}")
        return (255, 255, 255)  # 默认返回白色

def make_edges_transparent(img, edge_width):
    """
    将图片边缘设置为透明
    
    Args:
        img: PIL Image对象（RGBA模式）
        edge_width: 边缘宽度（像素）
    """
    if edge_width <= 0:
        return
    
    pixels = img.load()
    width, height = img.size
    
    for y in range(height):
        for x in range(width):
            # 检查是否在边缘区域内
            if (x < edge_width or x >= width - edge_width or 
                y < edge_width or y >= height - edge_width):
                pixel = pixels[x, y]
                # 保持RGB值，只将alpha设为0
                pixels[x, y] = (pixel[0], pixel[1], pixel[2], 0)

def remove_background(image_path, target_color, tolerance, output_path, auto_detect=False, edge_width=0):
    """
    移除图片背景
    
    Args:
        image_path: 输入图片路径
        target_color: 目标颜色 (R, G, B) 或 (R, G, B, A)，如果auto_detect为True则会被忽略
        tolerance: 容差值（0-255）
        output_path: 输出图片路径
        auto_detect: 是否自动检测占比最大的颜色作为目标颜色
        edge_width: 边缘透明化宽度（像素），0表示不启用
    """
    try:
        # 打开图片并转换为RGBA模式
        img = Image.open(image_path).convert("RGBA")
        
        # 如果启用自动检测，找出占比最大的颜色
        if auto_detect:
            target_color = find_dominant_color(image_path)
            print(f"  检测到占比最大的颜色: RGB{target_color}")
        
        # 确保target_color是RGB格式（如果是RGBA，只取前三个值）
        if len(target_color) == 4:
            target_rgb = target_color[:3]
        else:
            target_rgb = target_color
        
        # 计算容差的平方（避免每次计算平方根）
        tolerance_squared = tolerance ** 2
        
        # 获取图片数据
        pixels = img.load()
        width, height = img.size
        
        # 遍历每个像素
        for y in range(height):
            for x in range(width):
                pixel = pixels[x, y]
                pixel_rgb = pixel[:3]
                
                # 计算颜色距离的平方
                distance_squared = sum((a - b) ** 2 for a, b in zip(pixel_rgb, target_rgb))
                
                # 如果颜色在容差范围内，将alpha设为0（透明）
                if distance_squared <= tolerance_squared:
                    pixels[x, y] = (pixel_rgb[0], pixel_rgb[1], pixel_rgb[2], 0)
        
        # 如果启用了边缘透明化，处理边缘
        if edge_width > 0:
            make_edges_transparent(img, edge_width)
        
        # 确保输出目录存在
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 保存图片
        img.save(output_path, 'PNG')
        return True
    except Exception as e:
        print(f"处理 {image_path} 时出错: {e}")
        return False

def parse_color(color_str):
    """
    解析颜色字符串
    支持格式：
    - "255,0,0" (RGB)
    - "255,0,0,255" (RGBA)
    - "#FF0000" (十六进制)
    - "FF0000" (十六进制，不带#)
    """
    color_str = color_str.strip()
    
    # 如果是逗号分隔的RGB/RGBA
    if ',' in color_str:
        parts = [int(x.strip()) for x in color_str.split(',')]
        if len(parts) == 3:
            return tuple(parts)
        elif len(parts) == 4:
            return tuple(parts)
        else:
            raise ValueError(f"颜色格式错误: {color_str}")
    
    # 如果是十六进制格式
    if color_str.startswith('#'):
        color_str = color_str[1:]
    
    if len(color_str) == 6:
        r = int(color_str[0:2], 16)
        g = int(color_str[2:4], 16)
        b = int(color_str[4:6], 16)
        return (r, g, b)
    elif len(color_str) == 8:
        r = int(color_str[0:2], 16)
        g = int(color_str[2:4], 16)
        b = int(color_str[4:6], 16)
        a = int(color_str[6:8], 16)
        return (r, g, b, a)
    else:
        raise ValueError(f"颜色格式错误: {color_str}")

def process_images(input_dir, output_dir, target_color, tolerance, extensions=None, auto_detect=False, edge_width=0):
    """
    处理所有图片文件
    
    Args:
        input_dir: 输入目录
        output_dir: 输出目录
        target_color: 目标颜色（auto_detect为True时会被忽略）
        tolerance: 容差值
        extensions: 支持的图片扩展名列表，默认为['.png', '.jpg', '.jpeg']
        auto_detect: 是否自动检测每张图片占比最大的颜色
        edge_width: 边缘透明化宽度（像素），0表示不启用
    """
    if extensions is None:
        extensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp']
    
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    
    if not input_path.exists():
        print(f"错误: 输入目录不存在: {input_path}")
        return
    
    # 统计信息
    total = 0
    success = 0
    failed = 0
    
    # 遍历所有图片文件
    for ext in extensions:
        for img_file in input_path.rglob(f"*{ext}"):
            total += 1
            # 保持相对路径结构
            relative_path = img_file.relative_to(input_path)
            output_file = output_path / relative_path
            
            print(f"处理: {relative_path}")
            
            if remove_background(img_file, target_color, tolerance, output_file, auto_detect, edge_width):
                success += 1
            else:
                failed += 1
    
    print(f"\n处理完成!")
    print(f"总计: {total} 个文件")
    print(f"成功: {success} 个文件")
    print(f"失败: {failed} 个文件")

def main():
    parser = argparse.ArgumentParser(
        description="图片背景移除工具 - 根据指定颜色和容差去除背景",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 使用RGB颜色和容差30
  python remove_background.py --color "255,0,0" --tolerance 30
  
  # 使用十六进制颜色
  python remove_background.py --color "#00FF00" --tolerance 20
  
  # 指定输入输出目录
  python remove_background.py --input ./asset --output ./dist --color "255,255,255" --tolerance 10
  
  # 自动检测每张图片占比最大的颜色并抠掉
  python remove_background.py --auto-detect --tolerance 20
  
  # 将图片周围3px设置为透明
  python remove_background.py --color "255,255,255" --tolerance 10 --edge-width 3
  
  # 组合使用：自动检测颜色 + 边缘透明化
  python remove_background.py --auto-detect --tolerance 20 --edge-width 3
        """
    )
    
    parser.add_argument(
        '--input', '-i',
        type=str,
        default='asset',
        help='输入目录（默认: asset）'
    )
    
    parser.add_argument(
        '--output', '-o',
        type=str,
        default='dist',
        help='输出目录（默认: dist）'
    )
    
    parser.add_argument(
        '--color', '-c',
        type=str,
        default=None,
        help='目标颜色，格式: "R,G,B" 或 "#RRGGBB" 或 "R,G,B,A" 或 "#RRGGBBAA"（与--auto-detect二选一）'
    )
    
    parser.add_argument(
        '--auto-detect', '-a',
        action='store_true',
        help='自动检测每张图片占比最大的颜色作为目标颜色（与--color二选一）'
    )
    
    parser.add_argument(
        '--tolerance', '-t',
        type=int,
        required=True,
        help='容差值（0-255），值越大，匹配的颜色范围越广'
    )
    
    parser.add_argument(
        '--extensions', '-e',
        type=str,
        nargs='+',
        default=['.png', '.jpg', '.jpeg', '.gif', '.bmp'],
        help='支持的图片扩展名（默认: .png .jpg .jpeg .gif .bmp）'
    )
    
    parser.add_argument(
        '--edge-width', '-w',
        type=int,
        default=0,
        help='边缘透明化宽度（像素），0表示不启用（默认: 0）'
    )
    
    args = parser.parse_args()
    
    # 验证参数：必须指定--color或--auto-detect之一
    if not args.auto_detect and args.color is None:
        parser.error("必须指定 --color 或 --auto-detect 之一")
    
    if args.auto_detect and args.color is not None:
        parser.error("--color 和 --auto-detect 不能同时使用")
    
    # 解析颜色（如果不是自动检测模式）
    target_color = None
    if not args.auto_detect:
        try:
            target_color = parse_color(args.color)
            print(f"目标颜色: {target_color}")
        except ValueError as e:
            print(f"错误: {e}")
            return
    
    # 验证容差值
    if args.tolerance < 0 or args.tolerance > 255:
        print("错误: 容差值必须在0-255之间")
        return
    
    # 验证边缘宽度
    if args.edge_width < 0:
        print("错误: 边缘宽度不能为负数")
        return
    
    print(f"容差: {args.tolerance}")
    if args.auto_detect:
        print(f"模式: 自动检测占比最大的颜色")
    if args.edge_width > 0:
        print(f"边缘透明化: {args.edge_width}px")
    print(f"输入目录: {args.input}")
    print(f"输出目录: {args.output}")
    print(f"支持的扩展名: {args.extensions}")
    print("-" * 50)
    
    # 处理图片
    process_images(
        args.input,
        args.output,
        target_color,
        args.tolerance,
        args.extensions,
        args.auto_detect,
        args.edge_width
    )

if __name__ == "__main__":
    main()

