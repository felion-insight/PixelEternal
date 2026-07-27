import os
import shutil
import sys
import traceback
from uuid import uuid4
import json
import glob


def get_file_extension(filename):
    """获取文件扩展名"""
    return os.path.splitext(filename)[1].lower()


def copy_asset_file(source_path, asset_name):
    """复制资源文件并返回新的文件名；失败时返回 None"""
    if not os.path.exists(source_path):
        print(f'Asset {asset_name} not found at {source_path}')
        return None

    ext = get_file_extension(asset_name)
    new_filename = str(uuid4()) + ext
    dest_path = os.path.join('deployment', 'asset', new_filename)
    shutil.copy(source_path, dest_path)
    return new_filename


def process_mappings():
    """处理 mappings.json 并复制关联资源"""
    mappings_path = 'config/mappings.json'
    if not os.path.exists(mappings_path):
        raise FileNotFoundError(f'配置文件不存在: {mappings_path}')

    with open(mappings_path, 'r', encoding='utf-8') as f:
        mappings = json.load(f)
    mappings_deployment = mappings.copy()

    for key, value in mappings.items():
        if key == 'sounds':
            for sound_name, sound_config in value.items():
                print(f'Processing sound: {sound_name}')
                if isinstance(sound_config, dict) and 'file' in sound_config:
                    sound_file = sound_config['file']
                    source_path = os.path.join('asset', sound_file)
                    new_filename = copy_asset_file(source_path, sound_file)
                    if new_filename:
                        mappings_deployment[key][sound_name]['file'] = new_filename
                        if 'volume' in sound_config:
                            mappings_deployment[key][sound_name]['volume'] = sound_config['volume']
                    else:
                        print(f'Warning: skipped missing sound asset {sound_file}')
                else:
                    print(f'Invalid sound config for {sound_name}: {sound_config}')

        elif key == 'bgm':
            for bgm_name, bgm_config in value.items():
                print(f'Processing BGM: {bgm_name}')
                if isinstance(bgm_config, dict) and 'file' in bgm_config:
                    bgm_file = bgm_config['file']
                    source_path = os.path.join('asset', bgm_file)
                    new_filename = copy_asset_file(source_path, bgm_file)
                    if new_filename:
                        mappings_deployment[key][bgm_name]['file'] = new_filename
                        if 'volume' in bgm_config:
                            mappings_deployment[key][bgm_name]['volume'] = bgm_config['volume']
                    else:
                        print(f'Warning: skipped missing BGM asset {bgm_file}')
                else:
                    print(f'Invalid BGM config for {bgm_name}: {bgm_config}')

        else:
            for subkey, subvalue in value.items():
                print(f'Processing {key}/{subkey}: {subvalue}')
                if isinstance(subvalue, dict):
                    if 'image' in subvalue:
                        image = subvalue['image']
                        source_path = os.path.join('asset', image)
                        new_filename = copy_asset_file(source_path, image)
                        if new_filename:
                            mappings_deployment[key][subkey]['image'] = new_filename
                            if 'scale' in subvalue:
                                mappings_deployment[key][subkey]['scale'] = subvalue['scale']
                        else:
                            print(f'Warning: skipped missing image asset {image}')
                    else:
                        print(f'No image field in {key}/{subkey}')
                else:
                    source_path = os.path.join('asset', subvalue)
                    new_filename = copy_asset_file(source_path, subvalue)
                    if new_filename:
                        mappings_deployment[key][subkey] = new_filename
                    else:
                        print(f'Warning: skipped missing asset {subvalue}')

    dest_mappings = os.path.join('deployment', 'config', 'mappings.json')
    with open(dest_mappings, 'w', encoding='utf-8') as f:
        json.dump(mappings_deployment, f, indent=4)
    print('mappings.json 已处理并保存到 deployment/config/')


def copy_config_files():
    """复制除 mappings 外的配置文件"""
    print('\n开始复制配置文件...')
    config_files = glob.glob('config/*.json')
    for config_file in config_files:
        filename = os.path.basename(config_file)
        if filename == 'mappings.json':
            continue
        dest_path = os.path.join('deployment', 'config', filename)
        shutil.copy(config_file, dest_path)
        print(f'已复制: {filename}')


def copy_js_files():
    """复制 JS 文件"""
    print('\n开始复制 JS 文件...')
    js_files = glob.glob('js/*.js')
    for js_file in js_files:
        filename = os.path.basename(js_file)
        dest_path = os.path.join('deployment', 'js', filename)
        shutil.copy(js_file, dest_path)
        print(f'已复制: {filename}')


def copy_styles_and_html():
    """复制样式与 HTML"""
    print('\n开始复制样式文件...')
    if os.path.exists('styles.css'):
        shutil.copy('styles.css', os.path.join('deployment', 'styles.css'))
        print('已复制: styles.css')
    else:
        print('警告: styles.css 不存在')

    print('\n开始处理 HTML 文件...')
    if os.path.exists('index.html'):
        with open('index.html', 'r', encoding='utf-8') as f:
            html_content = f.read()
        with open(os.path.join('deployment', 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html_content)
        print('已复制: index.html -> deployment/index.html')
    else:
        raise FileNotFoundError('index.html 不存在')


def main():
    if os.path.exists('deployment'):
        shutil.rmtree('deployment')

    os.makedirs(os.path.join('deployment', 'asset'), exist_ok=True)
    os.makedirs(os.path.join('deployment', 'config'), exist_ok=True)
    os.makedirs(os.path.join('deployment', 'js'), exist_ok=True)

    print('开始处理资源文件...')
    process_mappings()
    copy_config_files()
    copy_js_files()
    copy_styles_and_html()
    print('\n部署完成！所有文件已复制到 deployment/ 文件夹')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('\n部署失败:', exc, file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
