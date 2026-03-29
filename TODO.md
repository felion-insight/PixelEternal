# TODO（已完成）

以下需求已在代码中落地，细节见各文件注释与配置。

1. **恶魔塔 240 层与 Boss / 隙间商店**  
   - `CONFIG.TOWER_MAX_FLOOR`、`TOWER_BOSS_INTERVAL`（默认 240 / 20）在 `js/config.js` 与 `config/game-config.json`。  
   - 每第 `20n` 层为 Boss；其前一层固定为**隙间商店**（传送门强制，恶魔干扰不会改这条路线）。  
   - 隙间商店：`index.html` 中 `#gap-shop-modal`，金币购买回血、满血、本次爬塔生命上限 +5%、随机精英加护、额外复活次数；可出售物品；**前往 Boss 层**后出现唯一向上的 Boss 传送门。  
   - 12 个 Boss 配置与不同技能组合：`config/boss-config.json`（`boss_20` … `boss_240`）。  
   - 通关第 240 层 Boss 后仅保留返回主城传送门。

2. **装备与怪物等级上限 60**  
   - `MONSTER_MAX_LEVEL: 60`；战斗/精英房按楼层线性映射目标等级，并对模板怪做数值拉升。  
   - 装备：在 `generateEquipments()` 中由 20 级模板生成 25～60 级衍生装（`js/data-classes.js`）。  
   - 掉落：`processKillRewards` 使用 1～60 阶梯等级池。  
   - 图鉴筛选补充 25～60 级选项（`index.html`）。

3. **数值平衡**  
   - Boss 血量/伤害/技能冷却、商店价格（约 `8×层`～`95×层`）、怪物缩放系数 `1.082^Δ等级` 与装备 `+5.5%/级` 为初版可调参数，可按实测再调 `boss-config.json` 与 `tryGapShopBuy` 中的系数。
