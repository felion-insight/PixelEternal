# Pixel Eternal - 像素永恒

一款基于 HTML5 Canvas 的像素风格 RPG 游戏。

## 快速开始

### ⚠️ 重要提示

**不能直接双击打开 HTML 文件！** 由于浏览器安全限制（CORS 策略），必须使用本地服务器运行游戏。

### 运行方法

#### 方法 1：使用启动脚本（推荐）

**Python 脚本：**
```bash
python3 start-server.py
```

**Shell 脚本：**
```bash
./start-server.sh
```

脚本会自动：
- 启动本地服务器（端口 8000）
- 打开浏览器访问游戏

#### 方法 2：使用 Python 内置服务器

```bash
# 在项目根目录下运行
python3 -m http.server 8000
```

然后访问：`http://localhost:8000/index.html`

#### 方法 3：使用 Node.js（如果已安装）

```bash
npx http-server -p 8000
```

然后访问：`http://localhost:8000/index.html`

### 停止服务器

按 `Ctrl+C` 停止服务器。

## 游戏说明

详细游戏说明请查看 [PROJECT.md](PROJECT.md)

## 开发工具

- `tools/art_generator.py` - 美术资源生成工具
- `tools/export_equipment_csv.py` - 装备数据导出工具

## 技术栈

- HTML5 + CSS + 原生 JavaScript
- Canvas 2D 渲染
- LocalStorage 存档（支持导出/导入）

