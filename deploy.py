import os
import shutil
from uuid import uuid4
import json
import glob

# 清理旧的部署文件夹
os.system('rm -rf deployment')

# 创建部署文件夹结构
os.makedirs('deployment/asset', exist_ok=True)
os.makedirs('deployment/config', exist_ok=True)
os.makedirs('deployment/js', exist_ok=True)

def get_file_extension(filename):
    """获取文件扩展名"""
    return os.path.splitext(filename)[1].lower()

def copy_asset_file(source_path, asset_name):
    """复制资源文件并返回新的文件名"""
    if not os.path.exists(source_path):
        print(f'Asset {asset_name} not found at {source_path}')
        return None
    
    # 获取原始文件扩展名
    ext = get_file_extension(asset_name)
    # 生成新的文件名（保持原始扩展名）
    new_filename = str(uuid4()) + ext
    dest_path = 'deployment/asset/' + new_filename
    shutil.copy(source_path, dest_path)
    return new_filename

print('开始处理资源文件...')
# 处理 mappings.json
with open('config/mappings.json', 'r') as f:
    mappings = json.load(f)
    mappings_deployment = mappings.copy()
    
    for key, value in mappings.items():
        # 处理 sounds 部分（音效）
        if key == 'sounds':
            for sound_name, sound_config in value.items():
                print(f'Processing sound: {sound_name}')
                if isinstance(sound_config, dict) and 'file' in sound_config:
                    sound_file = sound_config['file']
                    source_path = 'asset/' + sound_file
                    new_filename = copy_asset_file(source_path, sound_file)
                    if new_filename:
                        mappings_deployment[key][sound_name]['file'] = new_filename
                        # 保留 volume 配置
                        if 'volume' in sound_config:
                            mappings_deployment[key][sound_name]['volume'] = sound_config['volume']
                else:
                    print(f'Invalid sound config for {sound_name}: {sound_config}')
        
        # 处理 bgm 部分（背景音乐）
        elif key == 'bgm':
            for bgm_name, bgm_config in value.items():
                print(f'Processing BGM: {bgm_name}')
                if isinstance(bgm_config, dict) and 'file' in bgm_config:
                    bgm_file = bgm_config['file']
                    source_path = 'asset/' + bgm_file
                    new_filename = copy_asset_file(source_path, bgm_file)
                    if new_filename:
                        mappings_deployment[key][bgm_name]['file'] = new_filename
                        # 保留 volume 配置
                        if 'volume' in bgm_config:
                            mappings_deployment[key][bgm_name]['volume'] = bgm_config['volume']
                else:
                    print(f'Invalid BGM config for {bgm_name}: {bgm_config}')
        
        # 处理其他部分（图片等）
        else:
            for subkey, subvalue in value.items():
                print(f'Processing {key}/{subkey}: {subvalue}')
                if isinstance(subvalue, dict):
                    # 处理包含 image 和 scale 的对象
                    if 'image' in subvalue:
                        image = subvalue['image']
                        source_path = 'asset/' + image
                        new_filename = copy_asset_file(source_path, image)
                        if new_filename:
                            mappings_deployment[key][subkey]['image'] = new_filename
                            # 保留 scale 配置
                            if 'scale' in subvalue:
                                mappings_deployment[key][subkey]['scale'] = subvalue['scale']
                    else:
                        print(f'No image field in {key}/{subkey}')
                else:
                    # 处理直接的文件路径
                    source_path = 'asset/' + subvalue
                    new_filename = copy_asset_file(source_path, subvalue)
                    if new_filename:
                        mappings_deployment[key][subkey] = new_filename
    
    # 保存处理后的 mappings.json
    with open('deployment/config/mappings.json', 'w') as f:
        json.dump(mappings_deployment, f, indent=4)
    print('mappings.json 已处理并保存到 deployment/config/')

print('\n开始复制配置文件...')
# 复制所有配置文件到 deployment/config/
config_files = glob.glob('config/*.json')
for config_file in config_files:
    filename = os.path.basename(config_file)
    # 跳过原始的 mappings.json，因为已经处理过了
    if filename == 'mappings.json':
        continue
    dest_path = 'deployment/config/' + filename
    shutil.copy(config_file, dest_path)
    print(f'已复制: {filename}')

print('\n开始复制 JS 文件...')
# 复制所有 JS 文件到 deployment/js/
js_files = glob.glob('js/*.js')
for js_file in js_files:
    filename = os.path.basename(js_file)
    dest_path = 'deployment/js/' + filename
    shutil.copy(js_file, dest_path)
    print(f'已复制: {filename}')

print('\n开始复制样式文件...')
# 复制 styles.css 到 deployment/
if os.path.exists('styles.css'):
    shutil.copy('styles.css', 'deployment/styles.css')
    print('已复制: styles.css')
else:
    print('警告: styles.css 不存在')

print('\n开始处理 HTML 文件...')
# 复制根目录 index.html 到 deployment（主入口统一为 index.html）
if os.path.exists('index.html'):
    with open('index.html', 'r', encoding='utf-8') as f:
        html_content = f.read()
    with open('deployment/index.html', 'w', encoding='utf-8') as f:
        f.write(html_content)
    print('已复制: index.html -> deployment/index.html')
else:
    print('错误: index.html 不存在')
        
print('\n部署完成！所有文件已复制到 deployment/ 文件夹')