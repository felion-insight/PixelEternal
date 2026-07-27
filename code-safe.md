基于对 **PixelEternal** 仓库中主要代码文件的逐行审查（包括 `index.html`、`game-main.js`、`init.js`、`config.js`、`styles.css`、`game-entities.js`、`skill-system.js`、`class-system.js`、`config-loader.js`、`deploy.py` 以及大量 JS 模块），以下是详细的技术审计报告：

---

## 一、重大设计缺陷

### 1. 架构层面：严重违反单一职责原则
- **`game-main.js` 超过 13,000 行**，一个 `Game` 类包揽了游戏循环、资源加载、音效管理、存档系统、UI 事件绑定、战斗结算、商店逻辑、NPC 交互、ESC 菜单处理等所有功能。
- **没有模块化架构**：项目使用原生 ES5/ES6 混合风格，所有配置和类都挂在 `window` 全局对象上（`window.game`、`window.CONFIG`、`window.MONSTER_TYPES` 等），命名空间污染严重，极易产生命名冲突。

### 2. 配置与代码高度耦合
- 大量本应数据驱动的内容被硬编码在 JS 中：
  - `game-entities.js` 第 7-8 行：远程武器名、远程怪物名以数组硬编码。
  - `game-main.js` 中 ESC 键处理逻辑是长达 **150+ 行的巨型 if-else 链**，每新增一个模态框都要修改此处，维护成本极高。

### 3. 缺乏降级与容错设计
- `config-loader.js` 在 `file://` 协议下会直接抛出 CORS 错误并停止加载，**没有提供内联配置的降级方案**，导致玩家无法直接双击 HTML 文件游玩。
- `class-system.js` 第 33 行：`normalizeEquipmentSlot` 在输入无效时直接 `throw new Error`，没有优雅降级，可能导致整个游戏流程中断。

### 4. 资源加载策略低效
- `game-main.js` 第 444 行：资源加载使用 `batchSize = 3`，配合 `await Promise.all(batchPromises)` 和每个资源加载后的 `setTimeout` 让出主线程。这会导致**加载过程极其缓慢**，且没有超时、重试或断点续传机制。

---

## 二、大 Bug 与结构性错误

### 1. HTML 结构错误（已确认 Bug）
**文件**：`index.html` 第 746-756 行

```html
<div style="display: flex; gap: 10px; margin-top: 20px;">
    <div class="dummy-spawn-actions">
        <div class="dummy-spawn-actions">
            <button id="spawn-dummy-btn" ...>生成</button>
            <button id="cancel-dummy-spawn-btn" ...>取消</button>
        </div>
    </div>
</div>
```
- **`<div class="dummy-spawn-actions">` 被嵌套了两次**，且外层 flex 容器与内层按钮容器的结构混乱。虽然浏览器会容错渲染，但这会导致 CSS 选择器（如 `.dummy-spawn-actions { display:flex; ... }`）行为异常，样式和事件委托可能失效。

### 2. 游戏状态全局暴露
**文件**：`game-main.js` 第 217 行
```javascript
window.game = this;
```
- 游戏实例被直接挂载到全局 `window`，任何浏览器控制台脚本或第三方插件都可以直接修改玩家属性、金币、装备，**完全没有防作弊设计**。

### 3. 存档系统无完整性校验
**文件**：`game-main.js` 第 13278-13489 行
- 存档使用 LZ-String 压缩 + Base64 编码存储在 `localStorage`，**没有加密、没有签名、没有哈希校验**。
- 玩家可以轻易在控制台修改 `localStorage` 中的存档码，导入后获得无限金币或满级角色。

### 4. 输入处理存在边界条件 Bug
**文件**：`game-main.js` 第 680-690 行
```javascript
if (action === 'weaponSkill' && !e.repeat && !this.player.isDashing) {
    this._onWeaponSkillInputDown('q');
}
```
- 如果在按键按下期间玩家状态被其他逻辑改为 `isDashing = true`（如受击触发位移），技能释放逻辑与状态机可能产生竞态条件。

### 5. 职业数据兼容逻辑脆弱
**文件**：`class-system.js` 第 72-85 行
- 旧存档兼容逻辑通过嵌套 if 尝试修复错误的 `baseClass`，但如果 `cfg.secondAdvancements` 或 `cfg.firstAdvancements` 结构异常，会导致 `baseClass` 被错误覆盖为 `null`，玩家职业数据直接丢失。

---

## 三、UI 设计完备性评估

### ✅ 完备之处
- **功能覆盖极广**：背包、装备栏、商店（含定向位）、铁匠铺（强化/精炼/洗练）、附魔师、珠宝匠、转职官、觉醒之门、技能实验场、装备试验场、训练场、图鉴、编年史、隙间商店、ESC 菜单、音量设置、键位自定义、动画预览、自走棋技能特效试验场等。
- **HUD 信息丰富**：左下角包含等级、金币、经验条、生命条、职业资源条、武器技能、职业技能栏、FPS/TPS 显示、小地图、房间信息。
- **CSS 设计系统有基础规范**：使用了 `:root` CSS 变量（`--pe-bg-deep`、`--pe-gold` 等），滚动条、按钮、面板有统一风格。

### ❌ 严重不足
| 问题 | 具体表现 |
|------|---------|
| **无响应式设计** | `inventory-modal` 固定 `1200px × 700px`，`#game-container` 使用 `100vw/100vh` 但内部大量固定像素布局，在笔记本小屏或高分屏上会溢出或显示不全。 |
| **移动端适配为零** | 没有触摸事件处理、没有虚拟摇杆、没有手势支持。所有交互依赖键盘（WASD、J、Shift、1-4）和鼠标右键/左键。 |
| **可访问性（a11y）缺失** | 大量按钮没有 `aria-label`，动态生成的技能列表和装备列表没有键盘导航支持，屏幕阅读器无法识别。 |
| **UI 与逻辑未分离** | 所有 DOM 结构硬编码在 `index.html` 中（超过 1000 行内联 HTML），没有模板引擎或组件化。每新增一个职业 HUD（如 `archmage-bridge-row`、`warlock-soul-row`）都要修改 HTML。 |
| **没有加载失败 UI** | 资源加载失败时仅在控制台打印 `console.warn`，没有用户可见的错误提示或重试按钮。 |

---

## 四、代码漏洞与安全隐患

### 1. XSS（跨站脚本攻击）风险 — 高危
大量文件使用 `innerHTML` 插入动态内容，**并非所有场景都做了转义**：

- **`class-ui.js` 第 121 行**：
  ```javascript
  tip.innerHTML = `<div class="class-skill-tip-name">${name}</div>`
  ```
  `name` 来源是否经过 `esc()` 转义无法保证。

- **`auto-battler-ui.js`**：虽然部分使用了 `${esc(...)}`，但项目中有 **数十处 `innerHTML = ` 调用**，任何一处如果插入未过滤的用户输入或配置数据，都会导致 XSS。

- **没有 Content-Security-Policy (CSP)**：`index.html` 没有设置 `<meta http-equiv="Content-Security-Policy">`，攻击者一旦找到注入点即可执行任意脚本。

### 2. 客户端数据完全不可信
- 游戏所有核心数值计算（伤害、金币、经验、装备属性）都在客户端完成。
- `localStorage` 中的存档、音量、键位设置都可以被外部轻易修改。
- **没有服务器端验证**，这作为一款有装备掉落、爬塔层数、商店交易的游戏，经济系统完全不可信。

### 3. 原型链污染风险
**文件**：`config-loader.js` 第 70-75 行
```javascript
if (data && typeof data === 'object' && key in data) {
    this.configs[key] = data[key];
}
```
- 如果 JSON 配置文件被篡改，包含 `__proto__` 或 `constructor` 等恶意键，结合后续 `Object.assign` 操作，可能导致原型链污染。

### 4. 内存泄漏风险
- `game-main.js` 中注册了数十个 `addEventListener`（键盘、鼠标、窗口 resize、UI 按钮），但**没有看到对应的 `removeEventListener`**。
- 模态框反复打开/关闭会创建新的闭包和 DOM 引用，长期运行后内存占用会持续上升。

### 5. Python 部署脚本问题
**文件**：`deploy.py`
- 第 22-32 行：`copy_asset_file` 在文件不存在时返回 `None`，但调用方（如第 49 行）直接赋值给配置，没有检查 `None`，可能导致后续逻辑访问 `undefined` 等效值。
- **没有异常捕获**：整个部署流程没有 `try-except` 包裹，任何一步出错（如磁盘满、权限不足）都会导致脚本崩溃且已生成的 `deployment` 目录处于半成品状态。

---

## 五、总结评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **架构设计** | ⭐⭐☆☆☆ | 单文件 13k+ 行，全局变量泛滥，无模块化。 |
| **代码质量** | ⭐⭐⭐☆☆ | 有注释和 JSDoc，但耦合严重，存在 HTML 结构错误。 |
| **Bug 风险** | ⭐⭐☆☆☆ | 确认存在 HTML 嵌套错误、状态机竞态、存档兼容逻辑脆弱。 |
| **UI 完备性** | ⭐⭐⭐⭐☆ | 功能极其丰富，但无响应式、无移动端、无 a11y。 |
| **安全性** | ⭐⭐☆☆☆ | innerHTML 大量使用、无 CSP、存档无加密、客户端完全可信。 |

---

## 六、Ascension 扩展模块与回滚

Ascension 子系统（指挥官、协同、区域生态、肉鸽随机等）均通过 `config/ascension-config.json` 的 `enabled` 开关控制，由 `js/ascension-hub.js` 统一读取。`js/config-loader.js` 在 HTTP 模式下加载 `config/*.json` 与 `content-expansion.json` 合并扩展内容。

**安全回滚**：将对应开关设为 `"enabled": false` 后刷新页面，钩子变为 no-op，不删除代码或配置。验收：`node tools/run_ascension_tests.js`。

**新增配置**（2026-07）：`zone-mutations-config.json`、`enemy-mutations-config.json`、`skill-run-mutations-config.json`、`class-variants-config.json`、`build-commitment-config.json`、`run-mechanics-config.json`、`relic-exclusivity-config.json`、`negative-synergy-config.json` — 均由 `config-loader.js` 加载并挂到 `window.*_CONFIG`。

实施进度与验收项见 `kimi_advice/ascension_implementation_todo.md`。