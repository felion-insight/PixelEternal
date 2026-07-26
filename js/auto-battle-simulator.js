/**
 * 自走棋自动战斗：横向棋盘（左己右敌）+ 寻敌走位 + 普攻/技能 AI + 攻击特效
 */
(function () {
    'use strict';

    function cfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||
            window.AUTO_BATTLER_CONFIG || {};
    }

    function skillDef(id) {
        const pool = cfg().skillPool || [];
        return pool.find((s) => s.id === id) || null;
    }

    /**
     * 横向棋盘：左己右敌（透视映射后的格心）
     */
    function cellToWorld(col, row, side, board, originX, originY) {
        return quadCenter(cellQuad(col, row, side, board, originX, originY));
    }

    function fieldSize(board) {
        const cell = (board && board.cellSize) || 72;
        const gap = (board && board.gap) || 8;
        const lanes = (board && board.cols) || 4;
        const depth = (board && board.rows) || 3;
        const midGap = (board && board.midGap != null) ? board.midGap : 56;
        const stride = cell + gap;
        return {
            width: depth * stride * 2 + midGap - gap,
            height: lanes * stride - gap,
            stride: stride,
            midGap: midGap
        };
    }

    function boardPerspective() {
        const b = cfg().board || {};
        const p = b.perspective || {};
        return {
            topScale: p.topScale != null ? p.topScale : 0.76,
            bottomScale: p.bottomScale != null ? p.bottomScale : 1.08,
            vanishLift: p.vanishLift != null ? p.vanishLift : 0.34,
            topYScale: p.topYScale != null ? p.topYScale : 0.9
        };
    }

    function lerpNum(a, b, t) {
        return a + (b - a) * t;
    }

    function lerpPt(a, b, t) {
        return { x: lerpNum(a.x, b.x, t), y: lerpNum(a.y, b.y, t) };
    }

    /** 逻辑平面坐标 → 梯形地面（上窄下宽，贴合场景地板透视） */
    function mapBoardPoint(x, y, originX, originY, board) {
        const size = fieldSize(board);
        const pers = boardPerspective();
        const t = Math.max(0, Math.min(1, (y - originY) / Math.max(1, size.height)));
        const xScale = lerpNum(pers.topScale, pers.bottomScale, t);
        const yScale = lerpNum(pers.topYScale, 1, t);
        const vanishX = originX + size.width / 2;
        const vanishY = originY - size.height * pers.vanishLift;
        return {
            x: vanishX + (x - vanishX) * xScale,
            y: vanishY + (y - vanishY) * yScale
        };
    }

    function cellLogicalRect(col, row, side, board, originX, originY) {
        const cell = board.cellSize || 72;
        const gap = board.gap || 8;
        const depth = board.rows || 3;
        const stride = cell + gap;
        const midGap = board.midGap != null ? board.midGap : 56;
        const y0 = originY + col * stride;
        let x0;
        if (side === 'ally') {
            x0 = originX + (depth - 1 - row) * stride;
        } else {
            x0 = originX + depth * stride + midGap + row * stride;
        }
        return { x0: x0, y0: y0, x1: x0 + cell, y1: y0 + cell };
    }

    function cellQuad(col, row, side, board, originX, originY) {
        const r = cellLogicalRect(col, row, side, board, originX, originY);
        return {
            tl: mapBoardPoint(r.x0, r.y0, originX, originY, board),
            tr: mapBoardPoint(r.x1, r.y0, originX, originY, board),
            br: mapBoardPoint(r.x1, r.y1, originX, originY, board),
            bl: mapBoardPoint(r.x0, r.y1, originX, originY, board)
        };
    }

    function quadCenter(q) {
        return {
            x: (q.tl.x + q.tr.x + q.br.x + q.bl.x) / 4,
            y: (q.tl.y + q.tr.y + q.br.y + q.bl.y) / 4
        };
    }

    function pointInTri(px, py, a, b, c) {
        const v0x = c.x - a.x;
        const v0y = c.y - a.y;
        const v1x = b.x - a.x;
        const v1y = b.y - a.y;
        const v2x = px - a.x;
        const v2y = py - a.y;
        const dot00 = v0x * v0x + v0y * v0y;
        const dot01 = v0x * v1x + v0y * v1y;
        const dot02 = v0x * v2x + v0y * v2y;
        const dot11 = v1x * v1x + v1y * v1y;
        const dot12 = v1x * v2x + v1y * v2y;
        const denom = dot00 * dot11 - dot01 * dot01;
        if (!denom) return false;
        const inv = 1 / denom;
        const u = (dot11 * dot02 - dot01 * dot12) * inv;
        const v = (dot00 * dot12 - dot01 * dot02) * inv;
        return u >= 0 && v >= 0 && (u + v) <= 1;
    }

    function pointInQuad(px, py, q) {
        return pointInTri(px, py, q.tl, q.tr, q.br) || pointInTri(px, py, q.tl, q.br, q.bl);
    }

    /** 按画布尺寸放大横向棋盘 */
    function fitBoardToCanvas(board, canvasWidth, canvasHeight) {
        const lanes = board.cols || 4;
        const depth = board.rows || 3;
        const topPad = 54;
        const bottomPad = 128;
        const sidePad = 28;
        const availW = Math.max(240, canvasWidth - sidePad * 2);
        const availH = Math.max(200, canvasHeight - topPad - bottomPad);
        const midGap = Math.max(36, Math.floor(availW * 0.05));
        board.midGap = midGap;
        board.orientation = 'horizontal';

        let cellByW = Math.floor((availW - midGap) / (2 * depth) - 2);
        let cellByH = Math.floor(availH / lanes - 4);
        let cell = Math.min(cellByW, cellByH);
        const layoutScale = (cfg().board && cfg().board.layoutScale) || 1.12;
        cell = Math.floor(cell * layoutScale);
        cell = Math.max(76, Math.min(176, cell));
        board.cellSize = cell;
        board.gap = Math.max(6, Math.floor(cell * 0.1));
        return board;
    }

    /** 技能特效试验场：缩小棋盘，为右侧技能面板留出空间 */
    function fitBoardToVfxLab(board, canvasWidth, canvasHeight) {
        const lanes = board.cols || 4;
        const depth = board.rows || 3;
        const topPad = 52;
        const bottomPad = 96;
        const sidePad = 20;
        const panelReserve = 240;
        const availW = Math.max(200, canvasWidth - sidePad * 2 - panelReserve);
        const availH = Math.max(168, canvasHeight - topPad - bottomPad);
        const midGap = Math.max(28, Math.floor(availW * 0.045));
        board.midGap = midGap;
        board.orientation = 'horizontal';

        let cellByW = Math.floor((availW - midGap) / (2 * depth) - 2);
        let cellByH = Math.floor(availH / lanes - 4);
        let cell = Math.min(cellByW, cellByH);
        cell = Math.floor(cell * 0.56);
        cell = Math.max(40, Math.min(68, cell));
        board.cellSize = cell;
        board.gap = Math.max(4, Math.floor(cell * 0.08));
        board.vfxLabScale = cell / 72;
        return board;
    }

    function battleOriginVfxLab(canvasWidth, canvasHeight, board) {
        const size = fieldSize(board);
        const topPad = 58;
        const bottomPad = 108;
        const panelReserve = 230;
        const availH = canvasHeight - topPad - bottomPad;
        const availW = canvasWidth - panelReserve;
        const ox = Math.max(12, Math.floor((availW - size.width) / 2));
        const oy = topPad + Math.max(0, Math.floor((availH - size.height) / 2));
        return { x: ox, y: oy };
    }

    function stampUnitHome(unit) {
        if (!unit) return;
        unit.homeX = unit.x;
        unit.homeY = unit.y;
    }

    function resetVfxLabUnits(battle) {
        if (!battle) return;
        (battle.allies || []).concat(battle.enemies || []).forEach((u) => {
            u.auras = [];
            u.hitFlash = 0;
            u.vfxMove = null;
            if (u.homeX != null) u.x = u.homeX;
            if (u.homeY != null) u.y = u.homeY;
        });
        battle.fx = [];
    }

    function previewClassForSkill(def) {
        const tags = (def && def.classTags) || [];
        if (tags.includes('warrior')) return 'warrior';
        if (tags.includes('archer')) return 'archer';
        if (tags.includes('mage')) return 'mage';
        if (tags.includes('assassin')) return 'assassin';
        return 'mage';
    }

    function unitSpriteRadius(cellSize) {
        const cell = cellSize || 72;
        const ratio = (cfg().board && cfg().board.spriteCellRatio) || 0.34;
        return Math.max(20, Math.floor(cell * ratio));
    }

    function estimateBoardCellSize(canvasWidth, canvasHeight) {
        const board = Object.assign({}, cfg().board || { cols: 4, rows: 3 });
        fitBoardToCanvas(board, canvasWidth, canvasHeight);
        return board.cellSize || 70;
    }

    function battleOrigin(canvasWidth, canvasHeight, board) {
        const size = fieldSize(board);
        const topPad = 62;
        const bottomPad = 140;
        const availH = canvasHeight - topPad - bottomPad;
        const ox = Math.max(20, Math.floor((canvasWidth - size.width) / 2));
        const oy = topPad + Math.max(0, Math.floor((availH - size.height) / 2));
        return { x: ox, y: oy };
    }

    function hitTestAllyCell(board, origin, canvasX, canvasY) {
        const cols = board.cols || 4;
        const rows = board.rows || 3;
        const ox = origin.x;
        const oy = origin.y;
        for (let r = rows - 1; r >= 0; r--) {
            for (let c = 0; c < cols; c++) {
                const q = cellQuad(c, r, 'ally', board, ox, oy);
                if (pointInQuad(canvasX, canvasY, q)) {
                    return { col: c, row: r };
                }
            }
        }
        const cell = board.cellSize || 72;
        let best = null;
        let bestD = Infinity;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const center = cellToWorld(c, r, 'ally', board, ox, oy);
                const dx = canvasX - center.x;
                const dy = canvasY - center.y;
                const maxDist = cell * 0.52;
                const d2 = dx * dx + dy * dy;
                if (d2 <= maxDist * maxDist && d2 < bestD) {
                    bestD = d2;
                    best = { col: c, row: r };
                }
            }
        }
        return best;
    }

    /** 布阵：优先命中已上场角色精灵（便于拖拽换位） */
    function hitTestAllyUnit(board, origin, canvasX, canvasY, allies) {
        const cell = board.cellSize || 72;
        const radius = unitSpriteRadius(cell);
        const padX = radius * 1.35;
        const padTop = radius + 32;
        const padBottom = radius + 28;
        let best = null;
        let bestScore = Infinity;
        (allies || []).forEach((u) => {
            if (!u.heroId || u.col < 0 || u.row < 0) return;
            const dx = canvasX - u.x;
            const dy = canvasY - u.y;
            if (Math.abs(dx) > padX || dy < -padTop || dy > padBottom) return;
            const nx = dx / padX;
            const ny = dy < 0 ? dy / padTop : dy / padBottom;
            const score = nx * nx + ny * ny;
            if (score <= 1 && score < bestScore) {
                bestScore = score;
                best = u;
            }
        });
        return best;
    }

    /** 反转战斗：命中敌方单位 */
    function hitTestEnemyUnit(board, origin, canvasX, canvasY, enemies) {
        const cell = board.cellSize || 72;
        const radius = unitSpriteRadius(cell);
        const padX = radius * 1.35;
        const padTop = radius + 32;
        const padBottom = radius + 28;
        let best = null;
        let bestScore = Infinity;
        (enemies || []).forEach((u) => {
            if (!u.alive || u.hp <= 0) return;
            const dx = canvasX - u.x;
            const dy = canvasY - u.y;
            if (Math.abs(dx) > padX || dy < -padTop || dy > padBottom) return;
            const nx = dx / padX;
            const ny = dy < 0 ? dy / padTop : dy / padBottom;
            const score = nx * nx + ny * ny;
            if (score <= 1 && score < bestScore) {
                bestScore = score;
                best = u;
            }
        });
        return best;
    }

    /** 己方棋盘 + 精灵外扩后的布阵交互矩形（canvas 像素） */
    function deployPickBounds(board, origin, canvasWidth, canvasHeight) {
        const cols = board.cols || 4;
        const rows = board.rows || 3;
        const cell = board.cellSize || 72;
        const radius = unitSpriteRadius(cell);
        const padX = radius * 1.25;
        const padTop = radius + 28;
        const padBottom = radius + 26;
        const ox = origin.x;
        const oy = origin.y;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const grow = (x, y) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        };

        for (let c = 0; c < cols; c++) {
            for (let row = 0; row < rows; row++) {
                const q = cellQuad(c, row, 'ally', board, ox, oy);
                grow(q.tl.x, q.tl.y);
                grow(q.tr.x, q.tr.y);
                grow(q.br.x, q.br.y);
                grow(q.bl.x, q.bl.y);
                const center = quadCenter(q);
                grow(center.x - padX, center.y - padTop);
                grow(center.x + padX, center.y + padBottom);
            }
        }

        const margin = 10;
        return {
            left: Math.max(0, minX - margin),
            top: Math.max(0, minY - margin),
            right: Math.min(canvasWidth, maxX + margin),
            bottom: Math.min(canvasHeight, maxY + margin)
        };
    }

    function buildAllyUnit(heroRun, relicFx) {
        const PMS = window.PartyMetaSystem;
        const RSS = window.RunStateSystem;
        const effLevel = RSS && RSS.effectiveHeroLevel
            ? RSS.effectiveHeroLevel(heroRun)
            : (heroRun.level || 1);
        const metaLike = {
            baseClass: heroRun.baseClass,
            level: effLevel,
            classData: heroRun.classData
        };
        const stats = PMS.heroCombatStats(metaLike);
        let attack = stats.attack;
        let defense = stats.defense;
        let maxHp = stats.hp;
        let skillMult = 1;
        let gearCrit = 0;
        let gearCdMult = 1;
        let gearOnHitHeal = 0;
        let weaponRange = null;
        let basicIntervalMult = 1;
        let basicCleave = false;
        let basicPierce = false;
        let gearPassive = null;
        Object.keys(heroRun.equipment || {}).forEach((slot) => {
            const g = heroRun.equipment[slot];
            if (!g) return;
            attack += g.attack || 0;
            defense += g.defense || 0;
            maxHp += g.maxHp || 0;
            if (g.skillDamageMult) skillMult *= g.skillDamageMult;
            if (g.critChance) gearCrit += g.critChance;
            if (g.cooldownMult) gearCdMult *= g.cooldownMult;
            if (g.onHitHeal) gearOnHitHeal += g.onHitHeal;
            if (g.range != null) weaponRange = g.range;
            if (g.basicIntervalMult) basicIntervalMult *= g.basicIntervalMult;
            if (g.basicCleave) basicCleave = true;
            if (g.basicPierce) basicPierce = true;
            if (g.passive) gearPassive = { type: g.passive, pct: g.passivePct || 0 };
        });
        attack *= (relicFx.attackMult || 1);
        defense += (relicFx.flatDefense || 0);
        maxHp *= (relicFx.maxHpMult || 1);
        maxHp = Math.floor(maxHp);
        // 沿用局内残血（休息/治疗/战损）；未初始化（hp/maxHp 皆 0）时按满血开局
        // 已阵亡（maxHp>0 且 hp<=0）保持 0 血，不可再以「假活」进场
        let startHp = maxHp;
        if (heroRun.maxHp > 0 && heroRun.hp != null) {
            if (heroRun.hp <= 0) {
                startHp = 0;
            } else {
                const ratio = Math.min(1, Math.max(0, heroRun.hp) / heroRun.maxHp);
                startHp = Math.max(1, Math.min(maxHp, Math.floor(maxHp * ratio)));
            }
        } else if (heroRun.hp > 0) {
            startHp = Math.max(1, Math.min(maxHp, Math.floor(heroRun.hp)));
        }
        const mutators = (relicFx && relicFx.skillMutators) || [];
        const RS = window.RelicSystem;
        const basicBase = (cfg().combat || {}).basicAttackIntervalMs || 900;
        return {
            id: 'ally_' + heroRun.heroId,
            side: 'ally',
            heroId: heroRun.heroId,
            name: heroRun.displayName,
            baseClass: heroRun.baseClass,
            col: heroRun.boardCol,
            row: heroRun.boardRow,
            x: 0,
            y: 0,
            maxHp: maxHp,
            hp: startHp,
            attack: attack,
            defense: defense,
            speed: stats.speed,
            range: weaponRange != null ? weaponRange : stats.range,
            skillMult: skillMult,
            critChance: gearCrit,
            cooldownMult: gearCdMult,
            onHitHeal: gearOnHitHeal,
            basicCleave: basicCleave,
            basicPierce: basicPierce,
            gearPassive: gearPassive,
            basicInterval: Math.floor(basicBase * (relicFx.basicIntervalMult || 1) * basicIntervalMult),
            basicCd: 0,
            skills: (heroRun.skillSlots || []).filter(Boolean).map((entry) => {
                const RSS = window.RunStateSystem;
                const SMS = window.SkillMutationSystem;
                const norm = RSS && RSS.normalizeSkillEntry
                    ? RSS.normalizeSkillEntry(entry)
                    : { id: typeof entry === 'string' ? entry : entry.id, stars: 1, branchMods: [] };
                const baseId = norm.id;
                const sid = (SMS && SMS.resolveCombatSkillId)
                    ? SMS.resolveCombatSkillId(norm)
                    : (norm.evolvedId || baseId);
                const d = skillDef(sid) || skillDef(baseId) || { id: sid, damageMult: 1.5, cooldownMs: 5000, range: stats.range };
                const scale = RSS && RSS.getStarScaling
                    ? RSS.getStarScaling(norm.stars)
                    : { damageMult: 1, cooldownMult: 1, chainJumpBonus: 0, lifestealBonus: 0 };
                const branchMods = norm.branchMods || [];
                const sk = {
                    id: sid,
                    baseSkillId: baseId,
                    name: d.name || sid,
                    stars: norm.stars || 1,
                    branchMods: branchMods.slice(),
                    damageMult: (d.damageMult || 1.5) * scale.damageMult,
                    cooldownMs: Math.floor((d.cooldownMs || 5000) * scale.cooldownMult * gearCdMult),
                    range: d.range || stats.range,
                    aoe: !!d.aoe,
                    chainJumpBonus: scale.chainJumpBonus || 0,
                    lifestealBonus: scale.lifestealBonus || 0,
                    cd: 0
                };
                if (SMS && SMS.applyBranchModsToInstance) {
                    SMS.applyBranchModsToInstance(sk, d, branchMods);
                }
                if (RS && RS.applySkillMutatorsToInstance) {
                    RS.applySkillMutatorsToInstance(sk, d, mutators);
                }
                return sk;
            }),
            color: allyClassColor(inferAllyClassFamily({ baseClass: heroRun.baseClass })),
            alive: startHp > 0,
            targetId: null,
            hitFlash: 0,
            statuses: []
        };
    }

    function isHeroCombatReady(heroRun) {
        if (!heroRun) return false;
        if (heroRun.boardCol < 0 || heroRun.boardRow < 0) return false;
        // 已有血条且归零 = 阵亡，本场不上阵
        if (heroRun.maxHp > 0 && (heroRun.hp == null || heroRun.hp <= 0)) return false;
        return true;
    }

    function buildEnemyUnit(template, col, row, scale) {
        const s = scale || 1;
        const sc = cfg().enemyScaling || {};
        const hpM = sc.hpMult != null ? sc.hpMult : 1;
        const atkM = sc.attackMult != null ? sc.attackMult : 1;
        const defM = sc.defenseMult != null ? sc.defenseMult : 1;
        const unit = {
            id: 'enemy_' + template.id + '_' + col + '_' + row + '_' + Math.floor(Math.random() * 9999),
            side: 'enemy',
            templateId: template.id,
            name: template.name,
            col: col,
            row: row,
            x: 0,
            y: 0,
            maxHp: Math.floor(template.hp * s * hpM),
            hp: Math.floor(template.hp * s * hpM),
            attack: template.attack * s * atkM,
            defense: template.defense * s * defM,
            speed: template.speed,
            range: template.range,
            skillMult: 1,
            basicInterval: 1000,
            basicCd: Math.random() * 400,
            skills: [],
            color: template.color || '#884444',
            alive: true,
            targetId: null,
            hitFlash: 0,
            statuses: [],
            traits: [],
            traitState: {}
        };
        const ECS = window.EnemyCompositionSystem;
        if (ECS && ECS.attachTraitsFromTemplate) ECS.attachTraitsFromTemplate(unit, template);
        return unit;
    }

    function scaleForNode(nodeType, layer, run) {
        const sc = cfg().enemyScaling || {};
        const step = sc.layerPerStep != null ? sc.layerPerStep : 0.08;
        const base = sc.baseMult != null ? sc.baseMult : 1;
        const L = Math.max(0, layer | 0);
        let s = base + L * step;
        // 前期额外压力：层数越浅越高，随层衰减，留给后期成型构筑的碾压感
        const epLayers = sc.earlyPressureLayers != null ? sc.earlyPressureLayers : 0;
        const epMax = sc.earlyPressureMax != null ? sc.earlyPressureMax : 0;
        if (epLayers > 0 && epMax > 0) {
            const t = Math.max(0, 1 - L / epLayers);
            s *= 1 + epMax * t;
        }
        if (nodeType === 'elite') s *= sc.eliteMult != null ? sc.eliteMult : 1.22;
        if (nodeType === 'boss') {
            s *= sc.bossMult != null ? sc.bossMult : 1.32;
            const act = window.TowerRunMap && window.TowerRunMap.getActLayoutForLayer
                ? window.TowerRunMap.getActLayoutForLayer(L)
                : null;
            if (act && act.index === 0) {
                s *= sc.firstBossMult != null ? sc.firstBossMult : 0.85;
            }
        }
        if (nodeType === 'boss_final') s *= sc.bossFinalMult != null ? sc.bossFinalMult : 1.55;
        if (window.DemonPact && run) {
            s = window.DemonPact.modifyEnemyScaling(s, run);
        }
        return s;
    }

    function resolveEncounterTier(list, layer) {
        if (!list || !list.length) return null;
        for (let i = 0; i < list.length; i++) {
            const tier = list[i];
            const maxL = tier.layerMax != null ? tier.layerMax : 99;
            if (layer <= maxL) return tier;
        }
        return list[list.length - 1];
    }

    function pickWeightedEnemyId(pool, rng) {
        const r = rng || Math.random;
        if (!pool || !pool.length) return 'ab_grunt';
        let total = 0;
        pool.forEach((p) => { total += p.weight != null ? p.weight : 1; });
        let roll = r() * total;
        for (let i = 0; i < pool.length; i++) {
            roll -= pool[i].weight != null ? pool[i].weight : 1;
            if (roll <= 0) return pool[i].id;
        }
        return pool[pool.length - 1].id;
    }

    function spawnSquadUnits(squad, baseScale, find, compMeta) {
        const units = [];
        (squad || []).forEach((entry) => {
            const tpl = find(entry.id);
            const mult = baseScale * (entry.scaleMult != null ? entry.scaleMult : 1);
            const u = buildEnemyUnit(tpl, entry.col != null ? entry.col : 0, entry.row != null ? entry.row : 0, mult);
            if (compMeta) {
                u.encounterId = compMeta.id;
                u.encounterName = compMeta.name;
                u.encounterDesc = compMeta.desc;
                u.encounterSynergy = compMeta.synergy;
            }
            units.push(u);
        });
        return units;
    }

    function generateEnemies(nodeType, layer, rng, run) {
        const templates = cfg().enemyTemplates || [];
        const r = rng || Math.random;
        const find = (id) => templates.find((t) => t.id === id) || templates[0];
        const encLayer = (window.TowerRunMap && window.TowerRunMap.toEncounterLayer)
            ? window.TowerRunMap.toEncounterLayer(layer)
            : layer;
        const s = scaleForNode(nodeType, layer, run);
        const ECS = window.EnemyCompositionSystem;

        if (ECS && ECS.pickComposition) {
            const comp = ECS.pickComposition(nodeType, layer, r);
            if (comp && comp.squad && comp.squad.length) {
                return spawnSquadUnits(comp.squad, s, find, comp);
            }
        }

        const enc = cfg().enemyEncounters || {};

        if (nodeType === 'boss_final') {
            const fin = enc.boss_final;
            if (fin && fin.squad && fin.squad.length) {
                return spawnSquadUnits(fin.squad, s, find, null);
            }
            return [
                buildEnemyUnit(find('ab_final'), 1, 1, s),
                buildEnemyUnit(find('ab_elite'), 0, 0, s * 0.7),
                buildEnemyUnit(find('ab_elite'), 3, 0, s * 0.7)
            ];
        }

        const tierList = enc[nodeType] || enc.battle;
        const tier = Array.isArray(tierList)
            ? resolveEncounterTier(tierList, encLayer)
            : (tierList && tierList.squad ? tierList : null);

        if (tier && tier.squad && tier.squad.length) {
            return spawnSquadUnits(tier.squad, s, find, null);
        }

        if (tier && tier.pool && tier.pool.length) {
            const countMin = tier.countMin != null ? tier.countMin : 2;
            const countMax = tier.countMax != null ? tier.countMax : countMin;
            const n = countMin + Math.floor(r() * (countMax - countMin + 1));
            const units = [];
            for (let i = 0; i < n; i++) {
                const id = pickWeightedEnemyId(tier.pool, r);
                units.push(buildEnemyUnit(find(id), i % 4, Math.floor(i / 4), s));
            }
            return units;
        }

        if (nodeType === 'boss') {
            return [
                buildEnemyUnit(find('ab_boss'), 1, 1, s),
                buildEnemyUnit(find('ab_grunt'), 0, 0, s * 0.8),
                buildEnemyUnit(find('ab_archer'), 3, 2, s * 0.8)
            ];
        }
        if (nodeType === 'elite') {
            return [
                buildEnemyUnit(find('ab_elite'), 1, 1, s),
                buildEnemyUnit(find('ab_brute'), 2, 0, s * 0.85)
            ];
        }
        const n = 2 + Math.floor(r() * 2);
        const units = [];
        for (let i = 0; i < n; i++) {
            const t = r() > 0.5 ? find('ab_grunt') : find('ab_archer');
            units.push(buildEnemyUnit(t, i % 4, Math.floor(i / 4), s));
        }
        return units;
    }

    function dist(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function pickTarget(unit, enemies, battle) {
        const ECS = window.EnemyCompositionSystem;
        if (unit.side === 'enemy' && battle && window.CombatEffectsBridge) {
            const taunt = window.CombatEffectsBridge.pickEnemyTarget(unit, enemies, battle);
            if (taunt) return taunt;
        }
        if (ECS && ECS.pickTarget) {
            const picked = ECS.pickTarget(unit, enemies);
            if (picked) return picked;
        }
        let pool = enemies;
        if (battle && window.CommanderAbilities && unit.side === 'ally') {
            pool = window.CommanderAbilities.modifyPickTarget(battle, unit, enemies);
        }
        let best = null;
        let bestD = Infinity;
        // 刺客：在接敌圈内优先后排，避免无视近身前排去硬冲最远端
        const family = inferAllyClassFamily({ baseClass: unit.baseClass });
        const preferBack = family === 'assassin' || unit.baseClass === 'assassin';
        const meleeR = (cfg().combat && cfg().combat.meleeRange) || 42;
        const backBias = preferBack ? Math.max(48, meleeR * 1.4) : 0;
        const seekR = preferBack ? Math.max(200, meleeR * 5) : Infinity;
        pool.forEach((e) => {
            if (!e.alive || e.hp <= 0) return;
            let d = dist(unit, e);
            if (preferBack) {
                if (d <= seekR) d -= (e.row || 0) * backBias;
                else d += 28;
            }
            if (d < bestD) { bestD = d; best = e; }
        });
        return best;
    }

    function classCombatBias(baseClass) {
        const table = ((cfg().combat || {}).classCombatBias) || {};
        const family = inferAllyClassFamily({ baseClass: baseClass });
        return table[baseClass] || table[family] || {};
    }

    function pushFx(battle, fx) {
        if (battle && battle.headless) return;
        if (!battle.fx) battle.fx = [];
        battle.fx.push(fx);
        const cap = battle.vfxLab ? 640 : 420;
        if (battle.fx.length > cap) battle.fx.splice(0, battle.fx.length - cap);
    }

    function ensureBattleMetrics(battle) {
        if (!battle) return null;
        if (!battle.metrics) {
            battle.metrics = {
                damageDealt: {},
                damageTaken: {},
                healing: {},
                kills: {},
                skillCasts: {},
                skillDamage: {},
                basicDamage: {},
                crits: 0,
                samples: 0
            };
        }
        return battle.metrics;
    }

    function metricsKey(unit) {
        if (!unit) return 'unknown';
        if (unit.side === 'ally') {
            return unit.baseClass || unit.heroId || unit.name || 'ally';
        }
        return unit.templateId || unit.name || 'enemy';
    }

    function bumpMetric(map, key, amount) {
        if (!map || !key || !(amount > 0)) return;
        map[key] = (map[key] || 0) + amount;
    }

    function recordCombatDamage(battle, attacker, target, dmg, meta) {
        const m = ensureBattleMetrics(battle);
        if (!m || !(dmg > 0)) return;
        const aKey = metricsKey(attacker);
        const tKey = metricsKey(target);
        bumpMetric(m.damageDealt, aKey, dmg);
        bumpMetric(m.damageTaken, tKey, dmg);
        if (meta && meta.isSkill) {
            const sid = meta.skillId || meta.skill || 'skill';
            bumpMetric(m.skillDamage, sid, dmg);
            bumpMetric(m.skillDamage, aKey + '::' + sid, dmg);
        } else {
            bumpMetric(m.basicDamage, aKey, dmg);
        }
        if (meta && meta.crit) m.crits += 1;
        if (target && (target.hp <= 0 || !target.alive)) bumpMetric(m.kills, aKey, 1);
    }

    function summarizeBattleMetrics(battle) {
        const m = ensureBattleMetrics(battle) || {};
        const allies = battle.allies || [];
        const enemies = battle.enemies || [];
        const allyDealt = {};
        const allyTaken = {};
        const allyHeal = {};
        let totalAllyDealt = 0;
        let totalAllyTaken = 0;
        allies.forEach((u) => {
            const k = metricsKey(u);
            const dealt = (m.damageDealt && m.damageDealt[k]) || 0;
            const taken = (m.damageTaken && m.damageTaken[k]) || 0;
            const heal = (m.healing && m.healing[k]) || 0;
            allyDealt[k] = dealt;
            allyTaken[k] = taken;
            allyHeal[k] = heal;
            totalAllyDealt += dealt;
            totalAllyTaken += taken;
        });
        const share = {};
        Object.keys(allyDealt).forEach((k) => {
            share[k] = totalAllyDealt > 0 ? allyDealt[k] / totalAllyDealt : 0;
        });
        const takenShare = {};
        Object.keys(allyTaken).forEach((k) => {
            takenShare[k] = totalAllyTaken > 0 ? allyTaken[k] / totalAllyTaken : 0;
        });
        const allyHpLeft = allies.reduce((s, u) => s + Math.max(0, u.hp || 0), 0);
        const allyHpMax = allies.reduce((s, u) => s + Math.max(1, u.maxHp || 0), 0);
        const enemyHpLeft = enemies.reduce((s, u) => s + Math.max(0, u.hp || 0), 0);
        const enemyHpMax = enemies.reduce((s, u) => s + Math.max(1, u.maxHp || 0), 0);
        const durationMs = battle.elapsed || 0;
        const dps = durationMs > 0 ? (totalAllyDealt / (durationMs / 1000)) : 0;
        const skillTop = Object.keys(m.skillDamage || {})
            .filter((k) => k.indexOf('::') < 0)
            .map((id) => ({ id: id, damage: m.skillDamage[id] }))
            .sort((a, b) => b.damage - a.damage)
            .slice(0, 12);
        return {
            victory: !!battle.victory,
            durationMs: durationMs,
            allyDps: dps,
            allyDealt: allyDealt,
            allyTaken: allyTaken,
            allyHeal: allyHeal,
            damageShare: share,
            takenShare: takenShare,
            totalAllyDealt: totalAllyDealt,
            totalAllyTaken: totalAllyTaken,
            allyHpRatio: allyHpMax > 0 ? allyHpLeft / allyHpMax : 0,
            enemyHpRatio: enemyHpMax > 0 ? enemyHpLeft / enemyHpMax : 0,
            alliesAlive: allies.filter((u) => u.alive).length,
            alliesTotal: allies.length,
            enemiesAlive: enemies.filter((u) => u.alive).length,
            enemiesTotal: enemies.length,
            kills: m.kills || {},
            skillCasts: m.skillCasts || {},
            skillTop: skillTop,
            crits: m.crits || 0,
            enemyCount: enemies.length,
            enemyHpMax: enemyHpMax
        };
    }

    function burstParticles(battle, x, y, color, glow, count, speed, pixel) {
        const spd = speed || 90;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = spd * (0.35 + Math.random() * 0.85);
            pushFx(battle, {
                type: 'particle',
                pixel: !!pixel,
                x: x, y: y,
                vx: Math.cos(a) * v,
                vy: Math.sin(a) * v - 30,
                color: Math.random() > 0.45 ? color : (glow || color),
                size: 2 + Math.random() * 3.5,
                life: 380 + Math.floor(Math.random() * 220),
                maxLife: 600,
                skill: true
            });
        }
    }

    function burstPixelParticles(battle, x, y, color, glow, count, speed) {
        burstParticles(battle, x, y, color, glow, count, speed, true);
    }

    function makeLightningPoints(x0, y0, x1, y1, segs) {
        const pts = [x0, y0];
        for (let i = 1; i < segs; i++) {
            const t = i / segs;
            pts.push(x0 + (x1 - x0) * t + (Math.random() - 0.5) * 24);
            pts.push(y0 + (y1 - y0) * t + (Math.random() - 0.5) * 18);
        }
        pts.push(x1, y1);
        return pts;
    }

    function spawnLightningFx(battle, x0, y0, x1, y1, color, glow, life) {
        const maxLife = life || 300;
        pushFx(battle, {
            type: 'lightning',
            pts: makeLightningPoints(x0, y0, x1, y1, 5 + Math.floor(Math.random() * 3)),
            color: color || '#88ccff',
            glow: glow || '#d0f0ff',
            life: maxLife,
            maxLife: maxLife,
            skill: true
        });
        burstPixelParticles(battle, x1, y1, color, glow, 7, 85);
    }

    function spawnShieldBubbleFx(battle, x, y, color, glow, radius) {
        pushFx(battle, {
            type: 'shield_bubble',
            x: x, y: y,
            color: color, glow: glow,
            radius: radius || 34,
            life: 820, maxLife: 820, skill: true
        });
        burstPixelParticles(battle, x, y - 4, glow, color, 16, 75);
    }

    function attachShieldAura(unit, opts) {
        if (!unit) return;
        if (!unit.auras) unit.auras = [];
        unit.auras = unit.auras.filter((a) => a.type !== 'shield_aura');
        const durationMs = opts.durationMs || 6000;
        unit.auras.push({
            type: 'shield_aura',
            color: opts.color || '#6688ff',
            glow: opts.glow || '#c0d8ff',
            radius: opts.radius || 40,
            t: durationMs,
            maxT: durationMs,
            orbitPhase: Math.random() * Math.PI * 2,
            orbitSpeed: opts.orbitSpeed || 3.4,
            shards: opts.shards || 10
        });
    }

    function tickUnitAuras(unit, dtMs) {
        if (!unit || !unit.auras || !unit.auras.length) return;
        unit.auras.forEach((a) => {
            a.t -= dtMs;
            a.orbitPhase = (a.orbitPhase || 0) + (a.orbitSpeed || 3) * dtMs * 0.001;
        });
        unit.auras = unit.auras.filter((a) => a.t > 0);
    }

    function spawnHealRiseFx(battle, x, y, color, glow, count) {
        const n = count || 16;
        pushFx(battle, {
            type: 'heal_ring',
            x: x, y: y,
            color: color || '#8fd0a0',
            glow: glow || '#c8ffd8',
            radius: 36,
            life: 760, maxLife: 760, skill: true
        });
        for (let i = 0; i < n; i++) {
            pushFx(battle, {
                type: 'heal_cross',
                x: x + (Math.random() * 52 - 26),
                y: y + (Math.random() * 24 - 12),
                vy: -70 - Math.random() * 90,
                color: color || '#8fd0a0',
                glow: glow || '#c8ffd8',
                size: 4 + Math.random() * 3.5,
                life: 680 + i * 45,
                maxLife: 900,
                skill: true
            });
        }
        pushFx(battle, { type: 'star', x: x, y: y - 10, color: glow || color, life: 680, maxLife: 680, radius: 34, skill: true });
        burstPixelParticles(battle, x, y, glow || color, color, 16, 50);
    }

    function spawnBloodDripFx(battle, x, y, color, glow, count) {
        const n = count || 9;
        for (let i = 0; i < n; i++) {
            pushFx(battle, {
                type: 'blood_drip',
                x: x + (Math.random() * 28 - 14),
                y: y + (Math.random() * 10 - 5),
                vy: 40 + Math.random() * 55,
                color: color || '#cc3344',
                glow: glow || '#ff6677',
                size: 2 + Math.random() * 2,
                life: 480 + i * 30,
                maxLife: 620,
                skill: true
            });
        }
    }

    function spawnBlizzardFlakes(battle, cx, cy, radius, color, glow, count) {
        const n = count || 16;
        for (let i = 0; i < n; i++) {
            pushFx(battle, {
                type: 'snow_flake',
                x: cx + (Math.random() * 2 - 1) * radius,
                y: cy - 60 - Math.random() * 40,
                vy: 55 + Math.random() * 45,
                vx: (Math.random() - 0.5) * 20,
                color: Math.random() > 0.5 ? color : glow,
                size: 1.5 + Math.random() * 2,
                life: 680 + Math.floor(Math.random() * 320),
                maxLife: 900,
                skill: true
            });
        }
    }

    function spawnMeteorFx(battle, tx, ty, color, glow, aoeR) {
        const r = aoeR || 48;
        pushFx(battle, {
            type: 'meteor',
            x: tx, y: ty,
            y0: ty - 160 - Math.random() * 40,
            color: color, glow: glow,
            radius: r,
            impacted: false,
            life: 560, maxLife: 560, skill: true
        });
        pushFx(battle, {
            type: 'ring', x: tx, y: ty,
            color: glow || color,
            life: 520, maxLife: 520, radius: r * 0.35, skill: true
        });
        pushFx(battle, {
            type: 'mage_charge', x: tx, y: ty - r * 0.5,
            color: color, glow: glow,
            radius: 18, life: 480, maxLife: 480, skill: true
        });
        for (let i = 0; i < 14; i++) {
            pushFx(battle, {
                type: 'particle',
                pixel: true,
                x: tx + (Math.random() * 50 - 25),
                y: ty - 24 - i * 10,
                vx: (Math.random() - 0.5) * 36,
                vy: 30 + Math.random() * 50,
                color: i % 2 ? color : glow,
                size: 2 + Math.random() * 3,
                life: 420 + i * 30,
                maxLife: 580,
                skill: true
            });
        }
    }

    const MAGE_RUNE_SETS = {
        fire: ['diamond', 'tri', 'cross', 'node'],
        frost: ['tri', 'bar', 'diamond', 'node'],
        arcane: ['diamond', 'cross', 'tri', 'node'],
        shadow: ['cross', 'node', 'bar', 'diamond'],
        lightning: ['tri', 'bar', 'cross', 'node'],
        blizzard: ['tri', 'bar', 'diamond', 'node'],
        meteor: ['cross', 'tri', 'node', 'diamond'],
        shield: ['diamond', 'cross', 'bar', 'node']
    };

    function mageElementForSkill(skillId) {
        const map = {
            fireball: 'fire',
            frost_nova: 'frost',
            frost_bind: 'frost',
            shadow_bolt: 'shadow',
            arcane_burst: 'arcane',
            arcane_shield: 'shield',
            chain_lightning: 'lightning',
            static_surge: 'lightning',
            meteor: 'meteor',
            blizzard: 'blizzard',
            life_drain: 'shadow',
            flame_wave: 'fire',
            arcane_missiles: 'arcane',
            holy_nova: 'arcane'
        };
        return map[skillId] || 'arcane';
    }

    /** 分层法术仪式：地面法阵 +  orbiting 符文环 + 中心奥术印记 */
    function spawnMageRitual(battle, x, y, opts) {
        opts = opts || {};
        const element = opts.element || 'arcane';
        const runes = opts.runes || MAGE_RUNE_SETS[element] || MAGE_RUNE_SETS.arcane;
        const radius = opts.radius || 34;
        const life = opts.life || 520;
        const layer = opts.layer || 'full';

        if (layer === 'full' || layer === 'ground' || layer === 'circle') {
            pushFx(battle, {
                type: 'magic_circle',
                x: x, y: y,
                radius: radius,
                innerRadius: radius * (opts.innerRatio || 0.58),
                color: opts.color || '#6688ff',
                glow: opts.glow || '#c0d8ff',
                element: element,
                phase: opts.phase || 0,
                phaseInner: opts.phaseInner || 0,
                spin: opts.spin != null ? opts.spin : 0.72,
                spinInner: opts.spinInner != null ? opts.spinInner : -1.05,
                ground: opts.ground !== false,
                fadeIn: opts.fadeIn !== false,
                life: life, maxLife: life, skill: true
            });
        }
        if (layer === 'full' || layer === 'runes') {
            pushFx(battle, {
                type: 'rune_ring',
                x: x, y: y - 4,
                radius: radius * 0.82,
                runes: runes,
                color: opts.color || '#6688ff',
                glow: opts.glow || '#c0d8ff',
                orbitPhase: opts.orbitPhase != null ? opts.orbitPhase : Math.random() * Math.PI * 2,
                orbitSpeed: opts.orbitSpeed || 2.15,
                life: life, maxLife: life, skill: true
            });
        }
        if (opts.sigil !== false && (layer === 'full' || layer === 'sigil')) {
            pushFx(battle, {
                type: 'arcane_sigil',
                x: x, y: y - 2,
                radius: radius * (opts.sigilRatio || 0.36),
                color: opts.color || '#6688ff',
                glow: opts.glow || '#c0d8ff',
                element: element,
                phase: 0,
                spin: opts.sigilSpin || 1.35,
                life: Math.floor(life * 0.92),
                maxLife: Math.floor(life * 0.92),
                skill: true
            });
        }
    }

    /** 施法者→目标 符文连线（常见于 ARPG 锁定法术） */
    function spawnSpellTether(battle, x0, y0, x1, y1, opts) {
        opts = opts || {};
        pushFx(battle, {
            type: 'spell_tether',
            x0: x0, y0: y0, x1: x1, y1: y1,
            color: opts.color || '#6688ff',
            glow: opts.glow || '#c0d8ff',
            icy: !!opts.icy,
            phase: 0,
            life: opts.life || 460,
            maxLife: opts.life || 460,
            skill: true
        });
    }

    /** 法阵收束：符文向心坍缩后释放（爆发前奏） */
    function spawnRuneCollapse(battle, x, y, opts) {
        opts = opts || {};
        const element = opts.element || 'arcane';
        pushFx(battle, {
            type: 'rune_collapse',
            x: x, y: y,
            radius: opts.radius || 36,
            runes: opts.runes || MAGE_RUNE_SETS[element] || MAGE_RUNE_SETS.arcane,
            color: opts.color || '#6688ff',
            glow: opts.glow || '#c0d8ff',
            life: opts.life || 420,
            maxLife: opts.life || 420,
            skill: true
        });
    }

    function spawnMageCastCharge(battle, x, y, color, glow, opts) {
        opts = opts || {};
        spawnMageRitual(battle, x, y, Object.assign({
            color: color,
            glow: glow,
            element: opts.element || 'arcane',
            radius: opts.circleRadius || opts.radius || 32,
            life: opts.life || 520
        }, opts));
    }

    function spawnMagicOrb(battle, x0, y0, x1, y1, opts) {
        pushFx(battle, {
            type: 'orb',
            x0: x0, y0: y0, x1: x1, y1: y1,
            color: opts.color || '#ff6622',
            glow: opts.glow || '#ffcc44',
            radius: opts.radius || 16,
            element: opts.element || 'arcane',
            life: opts.life || 360,
            maxLife: opts.life || 360,
            skill: true
        });
    }

    function spawnArcaneBlast(battle, x, y, opts) {
        opts = opts || {};
        const r = opts.radius || 44;
        const elem = opts.element || 'arcane';
        spawnRuneCollapse(battle, x, y, {
            color: opts.color, glow: opts.glow, element: elem, radius: r * 0.85, life: 360
        });
        pushFx(battle, {
            type: 'aoe', x: x, y: y,
            color: opts.color, glow: opts.glow,
            heavy: true, radius: r,
            life: 580, maxLife: 580, skill: true
        });
        pushFx(battle, {
            type: 'star', x: x, y: y,
            color: opts.glow || opts.color,
            heavy: true, radius: r * 0.7,
            life: 540, maxLife: 540, skill: true
        });
        spawnHeavyImpact(battle, x, y, {
            color: opts.color, glow: opts.glow,
            radius: r * 0.9,
            particles: opts.particles || 18,
            speed: opts.speed || 125,
            rays: opts.rays || 8
        });
    }

    function spawnIceShards(battle, cx, cy, radius, count, opts) {
        opts = opts || {};
        const n = count || 10;
        for (let i = 0; i < n; i++) {
            const a = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.12;
            const speed = 150 + Math.random() * 90;
            pushFx(battle, {
                type: 'ice_shard',
                x: cx, y: cy,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                angle: a,
                color: opts.color || '#88ccee',
                glow: opts.glow || '#e8ffff',
                life: 520, maxLife: 520, skill: true
            });
        }
    }

    function spawnFrostNovaBurst(battle, x, y, radius, opts) {
        opts = opts || {};
        spawnRuneCollapse(battle, x, y, {
            color: opts.color, glow: opts.glow, element: 'frost', radius: radius * 0.75, life: 380
        });
        pushFx(battle, {
            type: 'wave', x: x, y: y,
            color: opts.color || '#66ccff',
            glow: opts.glow || '#d0f0ff',
            icy: true, radius: radius,
            rings: 4, life: 720, maxLife: 720, skill: true
        });
        spawnIceShards(battle, x, y, radius * 0.85, opts.shardCount || 12, opts);
        spawnHeavyImpact(battle, x, y, {
            color: opts.color, glow: opts.glow,
            radius: radius * 0.8,
            particles: 16, speed: 115, rays: 8
        });
    }

    function spawnShadowBoltStrike(battle, ax, ay, tx, ty, opts) {
        spawnMageRitual(battle, tx, ty, {
            element: 'shadow',
            radius: 28, life: 320,
            color: opts.color, glow: opts.glow,
            layer: 'ground', sigil: false, spin: -0.6
        });
        pushFx(battle, {
            type: 'bolt', x0: ax, y0: ay - 4, x1: tx, y1: ty,
            color: opts.color || '#9955dd',
            glow: opts.glow || '#d0a0ff',
            life: 260, maxLife: 260, width: 10, mage: true, skill: true
        });
        pushFx(battle, {
            type: 'bolt', x0: ax, y0: ay - 2, x1: tx, y1: ty,
            color: opts.glow || '#d0a0ff', glow: '#ffffff',
            life: 220, maxLife: 220, width: 16, mage: true, skill: true
        });
        spawnRuneCollapse(battle, tx, ty, {
            color: opts.color, glow: opts.glow, element: 'shadow', radius: 26, life: 340
        });
        spawnHeavyImpact(battle, tx, ty, {
            color: opts.color, glow: opts.glow,
            radius: 34, particles: 16, speed: 130, rays: 7
        });
    }

    function spawnChainLightningVfx(battle, caster, foes, target, skillId, chainEff, opts) {
        opts = opts || {};
        const mode = opts.mode || 'lightning';
        const element = opts.element || (mode === 'arrow' ? 'arcane' : 'lightning');
        const pool = (foes || []).filter((u) => u && u.alive)
            .slice().sort((a, b) => dist(caster, a) - dist(caster, b));
        const chainP = skillVfxProfile(skillId);
        const jumps = (chainEff && chainEff.jumps) || 3;
        let prevX = caster.x;
        let prevY = caster.y - 4;
        if (mode === 'arrow') {
            pushFx(battle, {
                type: 'cast', x: caster.x, y: caster.y,
                color: chainP.color, glow: chainP.glow,
                life: 320, maxLife: 320, skill: true
            });
        } else {
            spawnMageCastCharge(battle, caster.x, caster.y - 6, chainP.color, chainP.glow, {
                radius: mode === 'arcane' ? 22 : 24,
                particles: mode === 'arcane' ? 10 : 12,
                element: element,
                life: 560
            });
        }
        for (let i = 0; i < jumps; i++) {
            const t = pool[i] || target;
            if (!t) break;
            pushDelayEmitter(battle, i * 85, 'chain_lightning_hit', {
                x0: prevX, y0: prevY, x1: t.x, y1: t.y,
                color: chainP.color, glow: chainP.glow,
                profile: chainP, jump: i, skillId: skillId,
                mode: mode
            });
            if (mode !== 'arrow') {
                pushDelayEmitter(battle, i * 85 + 20, 'chain_mark', {
                    x: t.x, y: t.y, color: chainP.color, glow: chainP.glow,
                    element: element
                });
            }
            prevX = t.x;
            prevY = t.y;
        }
    }

    function skillCombatKind(skillId) {
        const def = skillDef(skillId);
        if (!def) return 'ranged';
        const range = def.range || 48;
        const tags = def.classTags || [];
        const effects = def.effects || [];
        const onlySupport = effects.length > 0 && effects.every((e) =>
            ['heal', 'shield', 'buff', 'heal_missing'].includes(e.type)
        );
        if (onlySupport && !def.damageMult) return 'support';
        if (tags.includes('warrior')) return 'melee';
        if (tags.includes('assassin') && range <= 62) return 'melee';
        if (range <= 65 && !tags.includes('archer') && !tags.includes('mage')) return 'melee';
        return 'ranged';
    }

    function attachStatusVisual(unit, auraType, opts) {
        if (!unit) return;
        if (!unit.auras) unit.auras = [];
        unit.auras = unit.auras.filter((a) => a.type !== auraType);
        const durationMs = opts.durationMs || 5000;
        unit.auras.push(Object.assign({
            type: auraType,
            t: durationMs,
            maxT: durationMs,
            orbitPhase: Math.random() * Math.PI * 2
        }, opts));
    }

    function vfxEaseOut(t) {
        return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
    }

    function vfxEaseInOut(t) {
        t = Math.max(0, Math.min(1, t));
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    function getUnitRenderPos(unit) {
        if (!unit || !unit.vfxMove) {
            return { x: unit.x, y: unit.y };
        }
        const m = unit.vfxMove;
        if (m.holdT > 0) {
            return { x: m.x1, y: m.y1 };
        }
        if (m.t <= 0) {
            return { x: unit.x, y: unit.y };
        }
        const prog = 1 - m.t / Math.max(1, m.maxT);
        const easeFn = m.ease === 'out' ? vfxEaseOut : vfxEaseInOut;
        const e = easeFn(prog);
        return {
            x: m.x0 + (m.x1 - m.x0) * e,
            y: m.y0 + (m.y1 - m.y0) * e
        };
    }

    function startUnitVfxMove(unit, x0, y0, x1, y1, durationMs, opts) {
        if (!unit) return;
        opts = opts || {};
        unit.vfxMove = {
            x0: x0, y0: y0, x1: x1, y1: y1,
            t: durationMs,
            maxT: durationMs,
            ease: opts.ease || 'inout',
            trail: !!opts.trail,
            trailColor: opts.color,
            trailGlow: opts.glow,
            trailEvery: opts.trailEvery || 32,
            trailAcc: 0,
            afterimage: !!opts.afterimage,
            afterAcc: 0,
            arriveAction: opts.arriveAction || null,
            arriveParams: opts.arriveParams || null,
            returnMove: opts.returnMove || null,
            snapBack: !!opts.snapBack,
            holdT: 0,
            holdMs: opts.holdMs || 320,
            arrived: false
        };
    }

    function executeArriveAction(battle, unit, action, params) {
        params = params || {};
        const p = params.profile || skillVfxProfile(params.skillId || '');
        const fx = { color: params.color || p.color, glow: params.glow || p.glow, angle: params.ang };
        switch (action) {
            case 'charge':
                spawnMeleeArc(battle, params.tx, params.ty, params.ang, Object.assign({}, fx, { heavy: true }));
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow, radius: 42, particles: 18, speed: 135
                });
                break;
            case 'shadow_step_strike':
                spawnMeleeThrust(battle, params.sx, params.sy, params.tx, params.ty, fx);
                spawnMeleeArc(battle, params.tx, params.ty, params.strikeAng || (params.ang + Math.PI), Object.assign({}, fx, { heavy: true, rip: true }));
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow, radius: 34, rip: true, ripCount: 3
                });
                break;
            case 'shadow_pierce': {
                const throughX = params.tx - Math.cos(params.ang) * 36;
                const throughY = params.ty - Math.sin(params.ang) * 36;
                spawnMeleeThrust(battle, params.sx, params.sy, throughX, throughY, fx);
                spawnMeleeArc(battle, params.tx, params.ty, params.strikeAng || (params.ang + Math.PI), Object.assign({}, fx, { heavy: true }));
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow, radius: 40, rip: true, ripCount: 4, particles: 20
                });
                break;
            }
            case 'backstab':
                spawnAssassinCloneBurst(battle, params.sx || params.tx, params.sy || params.ty, fx.color, fx.glow, {
                    count: 3, dist: 20, phase: (params.strikeAng || 0) + 0.4, center: false
                });
                spawnMeleeArc(battle, params.tx, params.ty, params.strikeAng || (params.ang + Math.PI), Object.assign({}, fx, { heavy: true, rip: true }));
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow, radius: 36, rip: true, ripCount: 5, particles: 18
                });
                break;
            case 'poison_blade_strike':
                spawnMeleeArc(battle, params.tx, params.ty, params.strikeAng || (params.ang + Math.PI), Object.assign({}, fx, { heavy: true }));
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow, radius: 32, particles: 14
                });
                break;
            case 'hemorrhage_strike':
                spawnMeleeArc(battle, params.tx, params.ty, (params.strikeAng || params.ang + Math.PI) - 0.35, Object.assign({}, fx, { heavy: true, rip: true }));
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow, radius: 38, rip: true, ripCount: 5, particles: 16
                });
                spawnBloodDripFx(battle, params.tx, params.ty, fx.color, fx.glow, 14);
                break;
            case 'execution_strike':
                spawnAssassinCloneBurst(battle, params.tx, params.ty, fx.color, fx.glow, {
                    count: 4, dist: 26, phase: params.strikeAng || 0
                });
                spawnMeleeArc(battle, params.tx, params.ty, params.strikeAng || (params.ang + Math.PI), Object.assign({}, fx, { heavy: true, rip: true }));
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: '#ff2233', glow: '#ff6677', radius: 48, rip: true, ripCount: 6, particles: 22, speed: 150, rays: 9
                });
                break;
            case 'fan_knives_throw': {
                const baseAng = params.strikeAng || (params.ang + Math.PI);
                for (let i = 0; i < 12; i++) {
                    const a = baseAng + (i - 5.5) * 0.17;
                    pushDelayEmitter(battle, i * 32, 'fan_knife', {
                        cx: params.sx, cy: params.sy, ang: a,
                        speed: 230 + (i % 3) * 30,
                        color: fx.color, glow: fx.glow, profile: params.profile
                    });
                }
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow, radius: 30, particles: 12
                });
                pushFx(battle, { type: 'ring', x: params.sx, y: params.sy, color: fx.glow, life: 480, maxLife: 480, radius: 28, skill: true });
                break;
            }
            case 'smoke_bomb_pop':
                spawnZoneField(battle, params.tx, params.ty, params.radius || 50, 4000, 'smoke', {
                    color: fx.color, glow: fx.glow
                });
                spawnMeleeArc(battle, params.tx, params.ty, params.strikeAng || params.ang, Object.assign({}, fx, { wide: true }));
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow, radius: 34, particles: 10, speed: 90
                });
                break;
            case 'shield_slam':
                spawnMeleeArc(battle, params.tx, params.ty, params.ang - 0.3, Object.assign({}, fx, { heavy: true }));
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow, radius: 44, particles: 16
                });
                break;
            default:
                break;
        }
    }

    function pushDelayEmitter(battle, delayMs, action, params) {
        pushFx(battle, {
            type: 'delay_emitter',
            delay: Math.max(0, delayMs),
            fired: false,
            action: action,
            params: params || {},
            life: Math.max(400, delayMs + 500),
            maxLife: Math.max(400, delayMs + 500),
            skill: true
        });
    }

    function executeDelayAction(battle, action, params) {
        params = params || {};
        const p = params.profile || skillVfxProfile(params.skillId || '');
        const fx = { color: params.color || p.color, glow: params.glow || p.glow, angle: params.ang };
        switch (action) {
            case 'cleave_arc':
                spawnMeleeArc(battle, params.x, params.y, params.ang + (params.offset || 0), Object.assign({}, fx, { heavy: true, wide: true }));
                break;
            case 'war_cry_wave':
                pushFx(battle, {
                    type: 'wave', x: params.x, y: params.y,
                    color: fx.color, glow: fx.glow,
                    life: 620, maxLife: 620, radius: params.radius || 50, rings: 3, skill: true
                });
                break;
            case 'hammer_smash':
                spawnMeleeArc(battle, params.tx, params.ty - 8, params.ang + Math.PI / 2, Object.assign({}, fx, { heavy: true }));
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow, radius: 54, rip: true, ripCount: 5, particles: 20, speed: 140, rays: 8
                });
                break;
            case 'fireball_explode': {
                const scale = params.impactScale != null ? params.impactScale : 1;
                const heavy = !!params.heavy;
                const baseR = params.radius || 42;
                spawnRuneCollapse(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow,
                    element: params.element || 'fire',
                    radius: baseR, life: heavy ? 520 : 400
                });
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow,
                    radius: (heavy ? 70 : 54) * Math.min(1.6, scale),
                    particles: heavy ? 36 : 24,
                    speed: heavy ? 190 : 155,
                    rays: heavy ? 14 : 10
                });
                pushFx(battle, {
                    type: 'wave', x: params.tx, y: params.ty,
                    color: fx.color, glow: fx.glow,
                    life: heavy ? 680 : 520, maxLife: heavy ? 680 : 520,
                    radius: (heavy ? 56 : 38) * Math.min(1.5, scale),
                    rings: heavy ? 3 : 2, skill: true
                });
                break;
            }
            case 'arcane_pulse':
                spawnArcaneBlast(battle, params.x, params.y, {
                    color: fx.color, glow: fx.glow,
                    element: params.element || 'arcane',
                    radius: params.radius || 44,
                    particles: 16, speed: 120, rays: 7
                });
                break;
            case 'chain_mark':
                spawnMageRitual(battle, params.x, params.y, {
                    color: params.color, glow: params.glow,
                    element: params.element || 'lightning',
                    radius: 22, life: 380, layer: 'ground', sigil: false, spin: 1.2
                });
                break;
            case 'chain_lightning_hit':
                if (params.mode === 'arrow') {
                    spawnArrowProjectile(battle, params.x0, params.y0, params.x1, params.y1, {
                        color: params.color, glow: params.glow, width: 4, life: 250
                    });
                    pushFx(battle, {
                        type: 'impact', x: params.x1, y: params.y1,
                        color: params.glow, life: 240, maxLife: 240,
                        radius: 12 - (params.jump || 0) * 1.5, skill: true
                    });
                    burstPixelParticles(battle, params.x1, params.y1, params.color, params.glow, 4, 60);
                } else if (params.mode === 'arcane') {
                    spawnMagicOrb(battle, params.x0, params.y0, params.x1, params.y1, {
                        color: params.color, glow: params.glow,
                        radius: 11 - (params.jump || 0), element: 'arcane', life: 260
                    });
                    spawnHeavyImpact(battle, params.x1, params.y1, {
                        color: params.color, glow: params.glow,
                        radius: 24 - (params.jump || 0) * 2,
                        particles: 10, speed: 115, rays: 5
                    });
                } else {
                    spawnLightningFx(battle, params.x0, params.y0, params.x1, params.y1,
                        params.color, params.glow, 340 - (params.jump || 0) * 35);
                    spawnHeavyImpact(battle, params.x1, params.y1, {
                        color: params.color, glow: params.glow,
                        radius: 30 - (params.jump || 0) * 3,
                        particles: 14, speed: 135, rays: 6
                    });
                }
                break;
            case 'fan_knife':
                pushFx(battle, {
                    type: 'knife_proj',
                    x: params.cx, y: params.cy,
                    vx: Math.cos(params.ang) * (params.speed || 220),
                    vy: Math.sin(params.ang) * (params.speed || 220),
                    angle: params.ang,
                    color: fx.color, glow: fx.glow,
                    life: 620, maxLife: 620, skill: true
                });
                break;
            case 'volley_arrow':
                spawnArrowProjectile(battle, params.ax, params.ay, params.tx, params.ty, Object.assign({}, fx, { width: 3, life: 220 }));
                break;
            case 'arrow_hit':
                pushFx(battle, {
                    type: 'impact', x: params.tx, y: params.ty,
                    color: params.glow, life: 260, maxLife: 260,
                    radius: params.radius || 14, skill: true
                });
                burstPixelParticles(battle, params.tx, params.ty, params.color, params.glow, params.particles || 6, 75);
                if (params.heavy) {
                    pushFx(battle, {
                        type: 'hit_flash', x: params.tx, y: params.ty,
                        radius: 10, life: 130, maxLife: 130, skill: true
                    });
                }
                break;
            case 'volley_impact':
                pushFx(battle, {
                    type: 'impact', x: params.tx, y: params.ty,
                    color: params.glow, life: 200, maxLife: 200, radius: 9, skill: true
                });
                burstPixelParticles(battle, params.tx, params.ty, params.color, params.glow, 3, 55);
                break;
            case 'poison_splash':
                pushFx(battle, {
                    type: 'impact', x: params.tx, y: params.ty,
                    color: params.glow, life: 300, maxLife: 300, radius: 16, skill: true
                });
                burstPixelParticles(battle, params.tx, params.ty, params.glow, params.color, 7, 50);
                break;
            case 'frost_bind_pop': {
                const pr = params.radius || 28;
                spawnRuneCollapse(battle, params.tx, params.ty, {
                    color: params.color, glow: params.glow,
                    element: 'frost', radius: pr * 0.72, life: 380
                });
                pushFx(battle, {
                    type: 'wave', x: params.tx, y: params.ty,
                    color: params.color, glow: params.glow,
                    icy: true, radius: pr, rings: 3,
                    life: 500, maxLife: 500, skill: true
                });
                pushFx(battle, {
                    type: 'ring', x: params.tx, y: params.ty,
                    color: params.glow, radius: pr * 0.9,
                    life: 440, maxLife: 440, skill: true
                });
                spawnIceShards(battle, params.tx, params.ty, pr * 0.78, 9, {
                    color: params.color, glow: params.glow
                });
                pushFx(battle, {
                    type: 'hit_flash', x: params.tx, y: params.ty,
                    radius: 12, life: 170, maxLife: 170, skill: true
                });
                burstPixelParticles(battle, params.tx, params.ty, params.glow, params.color, 8, 72);
                break;
            }
            case 'arrow_storm_wave':
                spawnArrowStormWave(battle, params.cx, params.cy, params.radius, params, params.storm);
                break;
            case 'mark_pulse':
                pushFx(battle, {
                    type: 'mark', x: params.tx, y: params.ty - 14,
                    color: params.color, radius: 16,
                    life: 400, maxLife: 400, skill: true
                });
                break;
            case 'mend_heal_rise':
                spawnHealRiseFx(battle, params.tx, params.ty, params.color, params.glow, 10);
                break;
            case 'bloodthirst_slash':
                spawnMeleeArc(battle, params.x, params.y, params.ang, Object.assign({}, fx, { heavy: true, rip: true }));
                spawnHeavyImpact(battle, params.tx, params.ty, {
                    color: fx.color, glow: fx.glow, radius: 36, rip: true, particles: 14
                });
                pushFx(battle, { type: 'orb', x0: params.tx, y0: params.ty, x1: params.ax, y1: params.ay - 6, color: fx.glow, glow: fx.color, life: 380, maxLife: 380, radius: 5, skill: true });
                break;
            default:
                break;
        }
    }

    function spawnFallingArrow(battle, x, yTop, landY, opts) {
        opts = opts || {};
        pushFx(battle, {
            type: 'falling_arrow',
            x: x,
            y: yTop,
            landY: landY,
            vy: opts.vy || (opts.light ? 200 + Math.random() * 60 : 240 + Math.random() * 90),
            vx: (Math.random() - 0.5) * (opts.light ? 10 : 16),
            wobble: Math.random() * Math.PI * 2,
            color: opts.color || '#7dce6a',
            glow: opts.glow || '#c8f0a8',
            light: !!opts.light,
            rich: !!opts.rich,
            intensity: opts.intensity != null ? opts.intensity : 1,
            life: opts.light ? 720 : 900,
            maxLife: opts.light ? 720 : 900,
            skill: true
        });
    }

    function spawnZoneBurst(battle, zone, count, opts) {
        const r = zone.radius || 50;
        const light = !!zone.light;
        const rich = !!zone.rich;
        for (let i = 0; i < count; i++) {
            const spread = rich ? 0.92 : (light ? 0.88 : 0.95);
            const ox = zone.x + (Math.random() * 2 - 1) * r * spread;
            const landY = zone.y + (Math.random() * 2 - 1) * r * (rich ? 0.48 : (light ? 0.5 : 0.35)) + 8;
            const yTop = zone.y - r * (rich ? 0.58 : (light ? 0.45 : 0.65)) - Math.random() * (rich ? 40 : (light ? 30 : 50));
            if (zone.subType === 'arrow_rain') {
                spawnFallingArrow(battle, ox, yTop, landY, Object.assign({}, opts, {
                    light: light,
                    rich: rich,
                    intensity: zone.intensity != null ? zone.intensity : 1
                }));
            } else if (zone.subType === 'blizzard') {
                pushFx(battle, {
                    type: 'snow_flake',
                    x: ox, y: yTop,
                    vy: 55 + Math.random() * 45,
                    vx: (Math.random() - 0.5) * 22,
                    color: opts.color, glow: opts.glow,
                    size: 2 + Math.random() * 2.5,
                    life: 800, maxLife: 950, skill: true
                });
            } else if (zone.subType === 'smoke') {
                pushFx(battle, {
                    type: 'smoke',
                    x: zone.x + (Math.random() * 2 - 1) * r * 0.75,
                    y: zone.y + (Math.random() * 2 - 1) * r * 0.5,
                    color: opts.color, glow: opts.glow,
                    life: 700, maxLife: 820, radius: 14 + Math.random() * 16, skill: true
                });
            }
        }
    }

    function tickUnitVfxMoves(battle, dtMs) {
        const units = (battle.allies || []).concat(battle.enemies || []);
        units.forEach((unit) => {
            const m = unit.vfxMove;
            if (!m) return;

            if (m.holdT > 0) {
                m.holdT = Math.max(0, m.holdT - dtMs);
                if (m.holdT <= 0) {
                    if (m.returnMove) {
                        const rm = m.returnMove;
                        startUnitVfxMove(unit, rm.fromX, rm.fromY, rm.toX, rm.toY, rm.duration || 260, {
                            ease: 'out', trail: true, color: m.trailColor, glow: m.trailGlow
                        });
                        return;
                    }
                    if (m.snapBack) {
                        startUnitVfxMove(unit, m.x1, m.y1, m.x0, m.y0, 280, {
                            ease: 'out', trail: true, color: m.trailColor, glow: m.trailGlow
                        });
                        return;
                    }
                    unit.vfxMove = null;
                }
                return;
            }

            if (m.t <= 0) {
                if (m.arriveAction && !m.arrived) {
                    m.arrived = true;
                    executeArriveAction(battle, unit, m.arriveAction, m.arriveParams);
                    if (m.returnMove || m.snapBack) {
                        m.holdT = m.holdMs || 320;
                    } else {
                        unit.vfxMove = null;
                    }
                } else if (!m.arriveAction) {
                    unit.vfxMove = null;
                }
                return;
            }

            m.t = Math.max(0, m.t - dtMs);
            const pos = getUnitRenderPos(unit);
            if (m.trail) {
                m.trailAcc = (m.trailAcc || 0) + dtMs;
                while (m.trailAcc >= m.trailEvery) {
                    m.trailAcc -= m.trailEvery;
                    pushFx(battle, {
                        type: 'afterimage',
                        x: pos.x, y: pos.y,
                        color: m.trailColor || '#fff',
                        glow: m.trailGlow || '#ccc',
                        life: 220, maxLife: 220, skill: true
                    });
                    pushFx(battle, {
                        type: 'dash',
                        x0: pos.x - 6, y0: pos.y,
                        x1: pos.x + 6, y1: pos.y,
                        color: m.trailGlow || m.trailColor,
                        life: 180, maxLife: 180, width: 4, skill: true
                    });
                }
            }
            if (m.afterimage) {
                m.afterAcc = (m.afterAcc || 0) + dtMs;
                if (m.afterAcc >= 48) {
                    m.afterAcc = 0;
                    pushFx(battle, {
                        type: 'afterimage',
                        x: pos.x, y: pos.y,
                        color: m.trailColor || '#7744aa',
                        glow: m.trailGlow || '#cc88ff',
                        life: 280, maxLife: 280, skill: true
                    });
                }
            }
        });
    }

    function spawnMeleeArc(battle, x, y, angle, opts) {
        pushFx(battle, {
            type: 'melee_arc',
            x: x, y: y,
            angle: angle,
            color: opts.color || '#ffe0a0',
            glow: opts.glow || '#fff8d0',
            heavy: !!opts.heavy,
            wide: !!opts.wide,
            rip: !!opts.rip,
            life: opts.life || 340,
            maxLife: opts.life || 340,
            skill: true
        });
        if (opts.rip) spawnRipLines(battle, x, y, opts);
    }

    /** 战士多层刀光：交叉斩 + 火花 */
    function spawnWarriorSlashBurst(battle, x, y, angle, opts) {
        opts = opts || {};
        const color = opts.color || '#e8a050';
        const glow = opts.glow || '#ffd080';
        const layers = opts.layers != null ? opts.layers : 3;
        const heavy = opts.heavy !== false;
        for (let i = 0; i < layers; i++) {
            const offset = (i - (layers - 1) / 2) * 0.38;
            const delay = i * 42;
            if (delay <= 0) {
                spawnMeleeArc(battle, x, y, angle + offset, {
                    color: color, glow: glow, heavy: heavy, wide: !!opts.wide || i === 0,
                    rip: i === layers - 1, life: 300 + i * 30
                });
            } else {
                pushDelayEmitter(battle, delay, 'cleave_arc', {
                    x: x, y: y, ang: angle, offset: offset,
                    color: color, glow: glow, profile: { color: color, glow: glow }
                });
            }
        }
        pushFx(battle, {
            type: 'slash', x: x, y: y, angle: angle + 0.15,
            color: glow, glow: '#fff6d0', heavy: true, aoe: !!opts.wide,
            life: 280, maxLife: 280, skill: true
        });
        burstPixelParticles(battle, x, y, glow, color, opts.particles || 12, opts.speed || 120);
        if (opts.impact) {
            spawnHeavyImpact(battle, x, y, {
                color: color, glow: glow, radius: opts.radius || 34,
                particles: 10, rip: true, ripCount: 3
            });
        }
    }

    /** 刺客残影/分身环绕 */
    function spawnAssassinCloneBurst(battle, x, y, color, glow, opts) {
        opts = opts || {};
        const count = opts.count != null ? opts.count : 3;
        const dist = opts.dist != null ? opts.dist : 24;
        const phase = opts.phase || 0;
        for (let i = 0; i < count; i++) {
            const a = phase + (Math.PI * 2 * i) / count;
            pushFx(battle, {
                type: 'afterimage',
                x: x + Math.cos(a) * dist,
                y: y + Math.sin(a) * dist * 0.72,
                color: color || '#7744aa',
                glow: glow || '#cc88ff',
                clone: true,
                life: 480 + i * 50,
                maxLife: 560,
                skill: true
            });
        }
        if (opts.center !== false) {
            pushFx(battle, {
                type: 'afterimage',
                x: x, y: y,
                color: color || '#7744aa',
                glow: glow || '#cc88ff',
                clone: true,
                life: 360, maxLife: 360, skill: true
            });
        }
    }

    function pushDamageNumber(battle, target, dmg, opts) {
        opts = opts || {};
        const isSkill = !!opts.isSkill;
        const crit = !!opts.crit;
        const ally = opts.ally !== false;
        const big = dmg >= 70 || (isSkill && dmg >= 35) || crit;
        const huge = dmg >= 140 || (crit && isSkill && dmg >= 55);
        let fontSize = isSkill ? 28 : (crit ? 24 : 17);
        if (big) fontSize += 6;
        if (huge) fontSize += 10;
        const text = (crit ? '暴击 ' : '') + String(dmg) + (isSkill ? '!' : '');
        let color = ally ? '#ffe8c8' : '#ff9a9a';
        if (crit) color = '#ffd76a';
        else if (isSkill) color = ally ? '#9adcff' : '#ffb0e0';
        if (huge) color = crit ? '#fff0a8' : (ally ? '#c8f0ff' : '#ffc0e8');
        pushFx(battle, {
            type: 'dmg',
            x: target.x + (Math.random() * 22 - 11),
            y: target.y - (isSkill ? 42 : 32) - (huge ? 6 : 0),
            text: text,
            color: color,
            crit: crit || isSkill,
            skill: isSkill,
            big: big,
            huge: huge,
            fontSize: fontSize,
            pop: huge ? 1.85 : (big ? 1.55 : 1.35),
            life: huge ? 1250 : (isSkill ? 1050 : 820),
            maxLife: huge ? 1250 : (isSkill ? 1050 : 820),
            vy: huge ? -92 : (isSkill ? -74 : -54)
        });
        if (big || isSkill) {
            battle.shake = Math.max(battle.shake || 0, huge ? 5.5 : (crit ? 3.8 : 2.6));
        }
    }

    function spawnMeleeThrust(battle, x0, y0, x1, y1, opts) {
        pushFx(battle, {
            type: 'melee_thrust',
            x0: x0, y0: y0, x1: x1, y1: y1,
            color: opts.color || '#e8c8ff',
            glow: opts.glow || '#ffffff',
            life: opts.life || 280,
            maxLife: opts.life || 280,
            skill: true
        });
        burstPixelParticles(battle, x1, y1, opts.glow || '#fff', opts.color, 8, 100);
    }

    function spawnRipLines(battle, x, y, opts) {
        for (let i = 0; i < (opts.ripCount || 3); i++) {
            const a = (opts.angle || 0) + (i - 1) * 0.35 + (Math.random() - 0.5) * 0.2;
            const len = 14 + Math.random() * 12;
            pushFx(battle, {
                type: 'rip_line',
                x: x + Math.cos(a) * 6,
                y: y + Math.sin(a) * 6,
                angle: a,
                length: len,
                color: opts.color || '#cc3344',
                glow: opts.glow || '#ff6677',
                life: 420 + i * 40,
                maxLife: 500,
                skill: true
            });
        }
    }

    /** 目标身后坐标（沿攻击者→目标方向越过目标） */
    function behindEnemyPoint(ax, ay, tx, ty, dist) {
        const ang = Math.atan2(ty - ay, tx - ax);
        const d = dist != null ? dist : 32;
        return {
            x: tx + Math.cos(ang) * d,
            y: ty + Math.sin(ang) * d,
            ang: ang,
            strikeAng: ang + Math.PI
        };
    }

    function spawnVanishPuff(battle, x, y, color, glow) {
        pushFx(battle, {
            type: 'afterimage', x: x, y: y,
            color: color || '#7744aa', glow: glow || '#cc88ff',
            clone: true,
            life: 380, maxLife: 380, skill: true
        });
        spawnAssassinCloneBurst(battle, x, y, color, glow, { count: 3, dist: 18, center: false });
        pushFx(battle, {
            type: 'burst', x: x, y: y,
            color: glow || color || '#cc88ff',
            life: 320, maxLife: 320, skill: true
        });
        burstPixelParticles(battle, x, y, glow || '#fff', color || '#888', 14, 110);
    }

    /** 重击冲击包：白闪 + 冲击波 + 震裂 + 碎屑 */
    function spawnHeavyImpact(battle, x, y, opts) {
        opts = opts || {};
        const r = opts.radius || 38;
        const color = opts.color || '#ffffff';
        const glow = opts.glow || color;
        pushFx(battle, {
            type: 'hit_flash', x: x, y: y,
            radius: r * 0.55,
            life: 160, maxLife: 160, skill: true
        });
        pushFx(battle, {
            type: 'impact', x: x, y: y,
            color: glow, heavy: true,
            life: opts.life || 540, maxLife: opts.life || 540,
            radius: r, skill: true
        });
        pushFx(battle, {
            type: 'ring', x: x, y: y,
            color: color,
            life: 500, maxLife: 500, radius: r * 0.9, skill: true
        });
        pushFx(battle, {
            type: 'shock_crack', x: x, y: y,
            color: color, glow: glow,
            radius: r, rays: opts.rays || 7,
            seed: Math.random() * 0.6,
            life: 440, maxLife: 440, skill: true
        });
        burstPixelParticles(battle, x, y, color, glow, opts.particles || 16, opts.speed || 130);
        if (opts.rip) {
            spawnRipLines(battle, x, y, Object.assign({ ripCount: opts.ripCount || 4 }, opts));
        }
    }

    /** 刺客统一：消失 → 闪至目标身后 → 偷袭 → 归位 */
    function startAssassinAmbush(battle, attacker, target, opts) {
        opts = opts || {};
        const ax = attacker.x;
        const ay = attacker.y;
        const tx = target.x;
        const ty = target.y;
        const behind = behindEnemyPoint(ax, ay, tx, ty, opts.dist || 34);
        spawnVanishPuff(battle, ax, ay, opts.color, opts.glow);
        // 闪现路径上再甩两道分身残影
        for (let i = 1; i <= 2; i++) {
            const t = i / 3;
            pushFx(battle, {
                type: 'afterimage',
                x: ax + (behind.x - ax) * t + (i === 1 ? -10 : 10),
                y: ay + (behind.y - ay) * t,
                color: opts.color || '#7744aa',
                glow: opts.glow || '#cc88ff',
                clone: true,
                life: 420 - i * 40,
                maxLife: 420,
                skill: true
            });
        }
        spawnAssassinCloneBurst(battle, behind.x, behind.y, opts.color, opts.glow, {
            count: 2, dist: 16, phase: behind.ang, center: false
        });
        startUnitVfxMove(attacker, ax, ay, behind.x, behind.y, opts.duration || 240, {
            trail: true,
            afterimage: true,
            color: opts.glow || opts.color,
            glow: opts.color,
            ease: opts.ease || 'out',
            trailEvery: opts.trailEvery || 16,
            arriveAction: opts.arriveAction,
            arriveParams: Object.assign({
                tx: tx, ty: ty,
                sx: behind.x, sy: behind.y,
                ang: behind.ang,
                strikeAng: behind.strikeAng,
                color: opts.color,
                glow: opts.glow,
                profile: opts.profile,
                skillId: opts.skillId
            }, opts.arriveParams || {}),
            snapBack: opts.snapBack !== false,
            holdMs: opts.holdMs != null ? opts.holdMs : 300
        });
        return behind;
    }

    function spawnKnifeFan(battle, cx, cy, opts) {
        const count = opts.count || 10;
        for (let i = 0; i < count; i++) {
            const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.08;
            const speed = 200 + Math.random() * 70;
            pushFx(battle, {
                type: 'knife_proj',
                x: cx, y: cy,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                angle: a,
                color: opts.color || '#c0c8d8',
                glow: opts.glow || '#ffffff',
                life: 560, maxLife: 560, skill: true
            });
        }
        pushFx(battle, {
            type: 'ring', x: cx, y: cy,
            color: opts.glow || '#fff',
            life: 480, maxLife: 480, radius: 28, skill: true
        });
        burstPixelParticles(battle, cx, cy, opts.glow, opts.color, 12, 85);
    }

    function spawnShadowStepFx(battle, attacker, ax, ay, tx, ty, opts) {
        const ang = Math.atan2(ty - ay, tx - ax);
        for (let i = 0; i <= 5; i++) {
            const t = i / 5;
            pushFx(battle, {
                type: 'afterimage',
                x: ax + (tx - ax) * t,
                y: ay + (ty - ay) * t,
                color: opts.color || '#7744aa',
                glow: opts.glow || '#cc88ff',
                life: 360 - i * 45,
                maxLife: 360,
                skill: true
            });
        }
        pushFx(battle, {
            type: 'burst', x: tx, y: ty,
            color: opts.glow || '#cc88ff',
            life: 320, maxLife: 320, skill: true
        });
        const side = ang + Math.PI / 2;
        const sx = tx + Math.cos(side) * 18;
        const sy = ty + Math.sin(side) * 18;
        spawnMeleeThrust(battle, sx, sy, tx, ty, opts);
        spawnMeleeArc(battle, tx, ty, ang + 0.5, Object.assign({}, opts, { heavy: true }));
        attachStatusVisual(attacker, 'attack_buff_aura', {
            color: opts.color, glow: opts.glow,
            durationMs: opts.buffMs || 4000
        });
    }

    function spawnArrowProjectile(battle, x0, y0, x1, y1, opts) {
        pushFx(battle, {
            type: 'arrow_proj',
            x0: x0, y0: y0, x1: x1, y1: y1,
            color: opts.color || '#7dce6a',
            glow: opts.glow || '#c8f0a8',
            width: opts.width || 4,
            life: opts.life || 260,
            maxLife: opts.life || 260,
            skill: true
        });
    }

    function spawnArcherAimMark(battle, x, y, radius, color, glow, life, opts) {
        opts = opts || {};
        pushFx(battle, {
            type: 'arrow_aim_mark',
            x: x, y: y,
            radius: radius || 36,
            color: color || '#7dce6a',
            glow: glow || '#c8f0a8',
            rich: !!opts.rich,
            intensity: opts.intensity != null ? opts.intensity : 1,
            phase: 0,
            life: life || 480,
            maxLife: life || 480,
            skill: true
        });
    }

    function spawnArrowStormOpening(battle, cx, cy, radius, p, storm) {
        storm = storm || arrowStormVfxFromIntensity(1.4);
        const rings = storm.openingWaveRings || 2;
        pushFx(battle, {
            type: 'ring', x: cx, y: cy,
            color: p.glow, radius: radius * (storm.openingRingScale || 0.58),
            life: 560, maxLife: 560, skill: true
        });
        pushFx(battle, {
            type: 'wave', x: cx, y: cy,
            color: p.color, glow: p.glow,
            radius: radius * (0.72 + (storm.intensity - 1) * 0.06),
            rings: rings,
            life: 520, maxLife: 520, skill: true
        });
        const arrowOpts = {
            color: p.color, glow: p.glow,
            light: storm.light !== false,
            rich: !!storm.rich,
            intensity: storm.intensity || 1
        };
        for (let i = 0; i < (storm.openingArrows || 8); i++) {
            const a = (Math.PI * 2 * i) / Math.max(1, storm.openingArrows || 8) + (Math.random() - 0.5) * 0.12;
            const distR = radius * (0.52 + Math.random() * 0.4);
            const ox = cx + Math.cos(a) * distR;
            const landY = cy + Math.sin(a) * radius * 0.16 + 6;
            const yTop = cy - radius * 0.72 - Math.random() * 38;
            spawnFallingArrow(battle, ox, yTop, landY, arrowOpts);
        }
    }

    function spawnArrowStormWave(battle, cx, cy, radius, p, storm) {
        storm = storm || {};
        const minN = storm.waveArrowsMin != null ? storm.waveArrowsMin : 5;
        const maxN = storm.waveArrowsMax != null ? storm.waveArrowsMax : minN + 2;
        const n = minN + Math.floor(Math.random() * Math.max(1, maxN - minN + 1));
        const arrowOpts = {
            color: p.color, glow: p.glow,
            light: storm.light !== false,
            rich: !!storm.rich,
            intensity: storm.intensity || 1
        };
        for (let i = 0; i < n; i++) {
            const ox = cx + (Math.random() * 2 - 1) * radius * 0.88;
            const landY = cy + (Math.random() * 2 - 1) * radius * 0.42 + 8;
            const yTop = cy - radius * 0.52 - Math.random() * 42;
            spawnFallingArrow(battle, ox, yTop, landY, arrowOpts);
        }
        pushFx(battle, {
            type: 'ring', x: cx, y: cy,
            color: p.glow, radius: radius * (0.34 + (storm.intensity || 1) * 0.03),
            life: 340, maxLife: 340, skill: true
        });
    }

    function spawnFrostBindStrike(battle, ax, ay, tx, ty, p) {
        const fc = p.color || '#66bbee';
        const fg = p.glow || '#c8f0ff';
        pushFx(battle, {
            type: 'cast', x: ax, y: ay,
            color: fc, glow: fg,
            life: 280, maxLife: 280, skill: true
        });
        spawnMageRitual(battle, tx, ty, {
            element: 'frost',
            color: fc, glow: fg,
            radius: 24, life: 360,
            layer: 'ground', sigil: false, spin: 0.45
        });
        spawnSpellTether(battle, ax, ay - 4, tx, ty, {
            color: fc, glow: fg, life: 300, icy: true
        });
        spawnArrowProjectile(battle, ax, ay - 2, tx, ty, {
            color: fc, glow: fg, width: 5, life: 290
        });
    }

    function spawnArcherShotImpact(battle, tx, ty, p, opts) {
        opts = opts || {};
        pushDelayEmitter(battle, opts.delay || 240, 'arrow_hit', {
            tx: tx, ty: ty,
            color: opts.color || p.color,
            glow: opts.glow || p.glow,
            radius: opts.radius || 14,
            heavy: !!opts.heavy,
            particles: opts.particles != null ? opts.particles : 6
        });
    }

    function spawnArcherSingleShot(battle, ax, ay, tx, ty, p, opts) {
        opts = opts || {};
        spawnArrowProjectile(battle, ax, ay - 2, tx, ty, {
            color: opts.color || p.color,
            glow: opts.glow || p.glow,
            width: opts.width || 4,
            life: opts.life || 260
        });
        if (!opts.skipImpact) {
            spawnArcherShotImpact(battle, tx, ty, p, opts);
        }
    }

    function spawnZoneField(battle, cx, cy, radius, durationMs, subType, opts) {
        opts = opts || {};
        const zone = {
            type: 'zone_field',
            x: cx, y: cy,
            radius: radius,
            subType: subType,
            color: opts.color,
            glow: opts.glow,
            light: !!opts.light,
            rich: !!opts.rich,
            intensity: opts.intensity != null ? opts.intensity : 1,
            spawnTimer: 0,
            spawnInterval: opts.spawnInterval != null ? opts.spawnInterval
                : (subType === 'arrow_rain' ? 55 : (subType === 'blizzard' ? 75 : 100)),
            spawnPerTick: opts.spawnPerTick != null ? opts.spawnPerTick
                : (subType === 'arrow_rain' ? 4 : (subType === 'blizzard' ? 3 : 2)),
            burstLeft: opts.burstLeft != null ? opts.burstLeft
                : (subType === 'arrow_rain' ? 18 : (subType === 'blizzard' ? 14 : 10)),
            life: durationMs,
            maxLife: durationMs,
            phase: Math.random() * Math.PI * 2,
            skill: true
        };
        pushFx(battle, zone);
        spawnZoneBurst(battle, zone, zone.burstLeft, opts);
        zone.burstLeft = 0;
    }

    function spawnZoneParticle(battle, zone, opts) {
        spawnZoneBurst(battle, zone, zone.spawnPerTick || 2, opts);
    }

    function applyStatusVisualsFromEffects(battle, attacker, target, skillId, effects) {
        const p = skillVfxProfile(skillId);
        (effects || []).forEach((eff) => {
            if (eff.type === 'mark' && target) {
                attachStatusVisual(target, 'hunter_mark', {
                    color: p.color, glow: p.glow,
                    durationMs: eff.durationMs || 8000
                });
            } else if (eff.type === 'dot' && target) {
                attachStatusVisual(target, 'poison_aura', {
                    color: p.color, glow: p.glow,
                    durationMs: eff.durationMs || 4000
                });
            } else if (eff.type === 'stack_dot' && target) {
                attachStatusVisual(target, 'bleed_aura', {
                    color: p.color, glow: p.glow,
                    durationMs: eff.durationMs || 6000,
                    stacks: eff.maxStacks || 3
                });
            } else if (eff.type === 'stun' && target) {
                attachStatusVisual(target, 'freeze_aura', {
                    color: p.color, glow: p.glow,
                    durationMs: eff.durationMs || 1000
                });
            } else if (eff.type === 'buff' && eff.stat === 'attack' && eff.target === 'self') {
                attachStatusVisual(attacker, 'attack_buff_aura', {
                    color: p.color, glow: p.glow,
                    durationMs: eff.durationMs || 4000
                });
            } else if (eff.type === 'buff' && eff.target === 'all_allies') {
                (battle.allies || []).forEach((u) => {
                    if (!u.alive) return;
                    attachStatusVisual(u, 'attack_buff_aura', {
                        color: p.color, glow: p.glow,
                        durationMs: eff.durationMs || 5000
                    });
                });
            } else if (eff.type === 'debuff' && !eff.aoe && target) {
                attachStatusVisual(target, 'smoke_debuff', {
                    color: p.color, glow: p.glow,
                    durationMs: eff.durationMs || 4000
                });
            } else if (eff.type === 'dot_aoe') {
                if (skillId !== 'blizzard') {
                    spawnZoneField(battle, target ? target.x : attacker.x, target ? target.y : attacker.y,
                        Math.max(40, (skillDef(skillId) && skillDef(skillId).range) ? skillDef(skillId).range * 0.35 : 48),
                        eff.durationMs || 5000, 'blizzard', p);
                }
            } else if (eff.type === 'debuff' && eff.aoe) {
                const foes = (attacker.side === 'ally' ? battle.enemies : battle.allies) || [];
                living(foes).forEach((u) => {
                    if (dist(attacker, u) <= ((skillDef(skillId) && skillDef(skillId).range) || 70) + 24) {
                        attachStatusVisual(u, 'smoke_debuff', {
                            color: p.color, glow: p.glow,
                            durationMs: eff.durationMs || 4000
                        });
                    }
                });
            }
        });
    }

    function resolveSkillEffects(sk, mutators) {
        const def = skillDef(sk.id) || skillDef(sk.baseSkillId);
        let effects;
        if (def && def.effects && def.effects.length) {
            effects = def.effects;
        } else {
            effects = [{
                type: 'damage',
                mult: sk.damageMult != null ? sk.damageMult : (def && def.damageMult) || 1.5,
                aoe: !!(sk.aoe || (def && def.aoe))
            }];
        }
        const SMS = window.SkillMutationSystem;
        if (SMS && SMS.applyBranchModsToEffects && sk.branchMods && sk.branchMods.length) {
            effects = SMS.applyBranchModsToEffects(effects, def, sk.branchMods);
        }
        const RS = window.RelicSystem;
        if (RS && RS.applySkillMutatorsToEffects && mutators && mutators.length) {
            return RS.applySkillMutatorsToEffects(effects, def, mutators);
        }
        return effects;
    }

    function addStatus(unit, status) {
        if (!unit.statuses) unit.statuses = [];
        if (status.type === 'stack_dot') {
            const existing = unit.statuses.find((s) => s.type === 'stack_dot' && s.sourceId === status.sourceId);
            if (existing) {
                existing.stacks = Math.min(status.maxStacks || 3, (existing.stacks || 1) + 1);
                existing.t = Math.max(existing.t, status.durationMs || status.t);
                return;
            }
            status.stacks = 1;
        }
        unit.statuses.push(status);
    }

    function isStunned(unit) {
        return !!(unit.statuses || []).some((s) => s.type === 'stun' && s.t > 0);
    }

    function attackBuffMult(unit, battle) {
        let mult = 1;
        (unit.statuses || []).forEach((s) => {
            if (s.type === 'buff' && s.stat === 'attack' && s.t > 0) mult *= (1 + (s.pct || 0));
        });
        (unit.statuses || []).forEach((s) => {
            if (s.type === 'debuff' && s.stat === 'attack' && s.t > 0) mult *= Math.max(0.2, 1 - (s.pct || 0));
        });
        const b = battle || unit._battleRef;
        if (b && window.CombatEffectsBridge) {
            mult *= window.CombatEffectsBridge.getAttackBuffMult(unit, b);
        }
        if (b && b.bondFx && unit.baseClass === 'assassin' && b.bondFx.assassinCritBonus) {
            unit.critChance = (unit.critChance || 0) + b.bondFx.assassinCritBonus;
        }
        return mult;
    }

    function countSkillAoeTargets(attacker, battle, range) {
        if (!attacker || !battle) return 1;
        const foes = living(attacker.side === 'ally' ? battle.enemies : battle.allies);
        const reach = (range || attacker.range || 160) + 24;
        return Math.max(1, foes.filter((f) => dist(attacker, f) <= reach).length);
    }

    /** 技能伤害强度：单次倍率 × AOE 命中数，用于箭雨等特效缩放 */
    function skillDamageIntensity(attacker, skill, def, battle) {
        def = def || skillDef((skill && skill.id) || '');
        const muts = (battle && battle.relicFx && battle.relicFx.skillMutators) || [];
        const effects = resolveSkillEffects(skill || { id: (def && def.id) || '' }, muts);
        const dmgEff = effects.find((e) => e.type === 'damage');
        if (!dmgEff) return 0.6;
        const mult = dmgEff.mult != null ? dmgEff.mult
            : (skill && skill.damageMult) || (def && def.damageMult) || 1;
        const splash = dmgEff.splashMult != null ? dmgEff.splashMult : 1;
        const aoe = !!(dmgEff.aoe != null ? dmgEff.aoe : (skill && skill.aoe) || (def && def.aoe));
        const range = (skill && skill.range) || (def && def.range) || (attacker && attacker.range) || 160;
        const skillMult = attacker ? (attacker.skillMult || 1) * attackBuffMult(attacker) : 1;
        const perTarget = mult * splash * skillMult;
        const hits = aoe ? countSkillAoeTargets(attacker, battle, range) : 1;
        return Math.max(0.55, Math.min(2.6, perTarget * hits));
    }

    function arrowStormVfxFromIntensity(intensity) {
        const t = Math.max(0.55, Math.min(2.6, intensity || 1));
        const n = (t - 0.55) / (2.6 - 0.55);
        const waveCount = Math.max(1, Math.round(1 + n * 4));
        const waveInterval = Math.round(500 - n * 170);
        const waveDelays = [];
        for (let i = 0; i < waveCount; i++) waveDelays.push(320 + i * waveInterval);
        return {
            intensity: t,
            rich: t >= 0.95,
            light: t < 1.75,
            openingArrows: Math.round(4 + n * 9),
            waveArrowsMin: Math.round(3 + n * 4),
            waveArrowsMax: Math.round(5 + n * 5),
            waveDelays: waveDelays,
            spawnInterval: Math.round(115 - n * 50),
            spawnPerTick: Math.max(1, Math.round(1 + n * 2.2)),
            burstLeft: Math.max(2, Math.round(2 + n * 7)),
            zoneDuration: Math.round(2600 + n * 1400),
            openingWaveRings: t >= 1.35 ? 3 : (t >= 1.0 ? 2 : 1),
            openingRingScale: 0.52 + n * 0.14
        };
    }

    function defenseValue(unit) {
        let def = unit.defense || 0;
        (unit.statuses || []).forEach((s) => {
            if (s.type === 'buff' && s.stat === 'defense' && s.t > 0) def *= (1 + (s.pct || 0));
            if (s.type === 'debuff' && s.stat === 'defense' && s.t > 0) def = Math.max(0, def - (s.flat || 0) - def * (s.pct || 0));
        });
        return def;
    }

    function absorbShield(unit, dmg) {
        let left = dmg;
        (unit.statuses || []).forEach((s) => {
            if (s.type !== 'shield' || s.t <= 0 || left <= 0) return;
            const take = Math.min(s.amount || 0, left);
            s.amount -= take;
            left -= take;
        });
        unit.statuses = (unit.statuses || []).filter((s) =>
            !(s.type === 'shield' && (s.t <= 0 || (s.amount || 0) <= 0))
        );
        return left;
    }

    function pushHealFx(battle, unit, amount) {
        if (!amount || amount <= 0) return;
        pushFx(battle, {
            type: 'dmg',
            x: unit.x,
            y: unit.y - 24,
            text: '+' + amount,
            color: '#8fd0a0',
            life: 700,
            maxLife: 700,
            vy: -36
        });
    }

    function healUnit(battle, unit, amount) {
        if (!unit || amount <= 0) return 0;
        if (battle && battle.bossHealReverse && unit.side === 'ally' && unit.alive) {
            unit.hp = Math.max(0, unit.hp - amount);
            if (unit.hp <= 0) unit.alive = false;
            return -amount;
        }
        if (!unit.alive) return 0;
        const before = unit.hp;
        unit.hp = Math.min(unit.maxHp, unit.hp + amount);
        const healed = unit.hp - before;
        if (healed > 0) {
            pushHealFx(battle, unit, healed);
            bumpMetric(ensureBattleMetrics(battle).healing, metricsKey(unit), healed);
        }
        return healed;
    }

    function pickHealTargets(battle, caster, targetKey, range) {
        const allies = (caster.side === 'ally' ? battle.allies : battle.enemies) || [];
        const livingAllies = living(allies);
        if (targetKey === 'self') return [caster];
        if (targetKey === 'all_allies') return livingAllies;
        if (targetKey === 'front_allies') {
            return livingAllies.filter((u) => (u.row || 0) <= 0);
        }
        if (targetKey === 'lowest_ally') {
            let best = null;
            livingAllies.forEach((u) => {
                const pct = u.hp / Math.max(1, u.maxHp);
                if (!best || pct < best.pct) best = { u: u, pct: pct };
            });
            return best ? [best.u] : [];
        }
        return livingAllies;
    }

    function tickStatuses(battle, unit, dtMs, relicFx) {
        if (!unit.statuses || !unit.statuses.length) return;
        unit.statuses.forEach((s) => {
            s.t -= dtMs;
            if (s.type === 'dot' || s.type === 'stack_dot') {
                s.nextTick = (s.nextTick || 0) - dtMs;
                while (s.nextTick <= 0 && s.t > 0) {
                    const stacks = s.stacks || 1;
                    let raw = (s.pctOfAttack || 0) * (s.sourceAttack || 0) * stacks;
                    if (relicFx && relicFx.dotMult) raw *= relicFx.dotMult;
                    if (battle && battle.synergyFx && battle.synergyFx.dotMult) raw *= battle.synergyFx.dotMult;
                    if (raw > 0 && unit.alive) {
                        let dmg = Math.max(1, Math.floor(raw - defenseValue(unit) * 0.35));
                        unit.hp -= dmg;
                        unit.hitFlash = 80;
                        pushFx(battle, {
                            type: 'dmg',
                            x: unit.x + (Math.random() * 10 - 5),
                            y: unit.y - 20,
                            text: String(dmg),
                            color: '#a0ff80',
                            life: 600,
                            maxLife: 600,
                            vy: -30
                        });
                        if (unit.hp <= 0) {
                            unit.hp = 0;
                            unit.alive = false;
                        }
                    }
                    s.nextTick += s.tickMs || 1000;
                }
            }
        });
        unit.statuses = unit.statuses.filter((s) => s.t > 0);
    }

    function damageTargets(battle, attacker, foes, sk, eff, target, relicFx) {
        const mult = eff.mult != null ? eff.mult : (sk.damageMult || 1.5);
        let raw = attacker.attack * mult * (attacker.skillMult || 1) * attackBuffMult(attacker);
        const aoe = eff.aoe != null ? eff.aoe : sk.aoe;
        const splash = eff.splashMult != null ? eff.splashMult : 0.75;
        const metaBase = {
            isSkill: true,
            skillId: sk.id || sk.baseSkillId || sk.name,
            skillName: sk.name,
            lifestealPct: (eff.lifestealPct || 0) + (sk.lifestealBonus || 0),
            executeThreshold: eff.executeThreshold,
            executeBonusMult: eff.executeBonusMult
        };
        let totalDealt = 0;
        const hitOne = (t, rawDmg, meta) => {
            if (!t || !t.alive) return;
            let dmg = rawDmg;
            if (eff.frontRowBonusMult && (t.row || 0) <= 0) {
                dmg *= eff.frontRowBonusMult / Math.max(0.01, mult);
            }
            if (eff.fullHpBonusMult && t.hp >= t.maxHp * 0.98) {
                dmg *= eff.fullHpBonusMult / Math.max(0.01, mult);
            }
            totalDealt += applyDamage(battle, attacker, t, dmg, relicFx, meta);
        };
        if (aoe) {
            living(foes).forEach((f) => {
                if (dist(attacker, f) <= (sk.range || attacker.range || 48) + 24) {
                    hitOne(f, raw * splash, metaBase);
                }
            });
        } else {
            hitOne(target, raw, metaBase);
        }
        return totalDealt;
    }

    function applySkillEffect(battle, unit, sk, eff, target, foes, allies, relicFx) {
        switch (eff.type) {
            case 'damage':
                return damageTargets(battle, unit, foes, sk, eff, target, relicFx);
            case 'chain': {
                const pool = living(foes).slice().sort((a, b) => dist(unit, a) - dist(unit, b));
                let mult = eff.mult != null ? eff.mult : (sk.damageMult || 1.3);
                let first = pool[0] || target;
                const chainP = skillVfxProfile(sk.id);
                const jumpBonus = sk.chainJumpBonus || 0;
                const extraJumps = (relicFx && relicFx.extraChainJumps) || 0;
                const jumpCount = (eff.jumps || 3) + jumpBonus + extraJumps;
                const lifeBonus = sk.lifestealBonus || 0;
                let prevX = unit.x;
                let prevY = unit.y - 4;
                for (let i = 0; i < jumpCount; i++) {
                    const t = pool[i] || first;
                    if (!t) break;
                    spawnLightningFx(battle, prevX, prevY, t.x, t.y, chainP.color, chainP.glow, 300 - i * 25);
                    spawnHeavyImpact(battle, t.x, t.y, {
                        color: chainP.color, glow: chainP.glow,
                        radius: 28 - i * 3, particles: 10, speed: 125, rays: 5
                    });
                    prevX = t.x;
                    prevY = t.y;
                    damageTargets(battle, unit, [t], sk, {
                        mult: mult,
                        lifestealPct: (eff.lifestealPct || 0) + lifeBonus
                    }, t, relicFx);
                    if (relicFx && relicFx.chainAppendIgnite) {
                        addStatus(t, {
                            type: 'dot',
                            t: 3000,
                            tickMs: 1000,
                            nextTick: 0,
                            pctOfAttack: 0.12,
                            sourceAttack: unit.attack * (unit.skillMult || 1) * attackBuffMult(unit)
                        });
                    }
                    const baseFall = eff.falloff != null ? eff.falloff : 0.85;
                    let fallBonus = (relicFx && relicFx.chainFalloffBonus) || 0;
                    if (relicFx && relicFx.chainDecayMult != null) {
                        fallBonus += Math.max(0, 1 - relicFx.chainDecayMult) * 0.12;
                    }
                    mult *= Math.min(1, baseFall + fallBonus);
                }
                return;
            }
            case 'dot':
                if (!target || !target.alive) return;
                addStatus(target, {
                    type: 'dot',
                    t: eff.durationMs || 4000,
                    tickMs: eff.tickMs || 1000,
                    nextTick: 0,
                    pctOfAttack: eff.pctOfAttack || 0.15,
                    sourceAttack: unit.attack * (unit.skillMult || 1) * attackBuffMult(unit),
                    element: eff.element || sk.element
                });
                if (battle && battle.synergyFx && battle.synergyFx.freezeOnPoison &&
                    (eff.element === 'poison' || sk.element === 'poison')) {
                    addStatus(target, { type: 'stun', t: 1200 });
                }
                return;
            case 'stack_dot':
                if (!target || !target.alive) return;
                addStatus(target, {
                    type: 'stack_dot',
                    sourceId: sk.id + '_' + unit.id,
                    t: eff.durationMs || 6000,
                    tickMs: eff.tickMs || 1000,
                    nextTick: 0,
                    pctOfAttack: eff.pctOfAttack || 0.1,
                    maxStacks: eff.maxStacks || 3,
                    sourceAttack: unit.attack * (unit.skillMult || 1) * attackBuffMult(unit)
                });
                return;
            case 'dot_aoe':
                living(foes).forEach((f) => {
                    if (dist(unit, f) <= (sk.range || 120) + 24) {
                        addStatus(f, {
                            type: 'dot',
                            t: eff.durationMs || 5000,
                            tickMs: eff.tickMs || 1000,
                            nextTick: eff.tickMs || 1000,
                            pctOfAttack: eff.pctOfAttack || 0.12,
                            sourceAttack: unit.attack * (unit.skillMult || 1) * attackBuffMult(unit)
                        });
                    }
                });
                return;
            case 'heal':
                pickHealTargets(battle, unit, eff.target || 'self', sk.range).forEach((u) => {
                    healUnit(battle, u, Math.floor(u.maxHp * (eff.pct || 0.1)));
                });
                return;
            case 'heal_missing': {
                const missing = unit.maxHp - unit.hp;
                healUnit(battle, unit, Math.floor(missing * (eff.pct || 0.3)));
                return;
            }
            case 'shield':
                pickHealTargets(battle, unit, eff.target || 'self', sk.range).forEach((u) => {
                    addStatus(u, {
                        type: 'shield',
                        t: eff.durationMs || 5000,
                        amount: Math.floor(u.maxHp * (eff.pct || 0.1))
                    });
                    const sp = skillVfxProfile(sk.id);
                    attachShieldAura(u, {
                        color: sp.color,
                        glow: sp.glow,
                        radius: eff.target === 'all_allies' ? 34 : 42,
                        durationMs: eff.durationMs || 6000
                    });
                });
                return;
            case 'buff':
                pickHealTargets(battle, unit, eff.target || 'self', sk.range).forEach((u) => {
                    addStatus(u, {
                        type: 'buff',
                        stat: eff.stat || 'attack',
                        pct: eff.pct || 0,
                        flat: eff.flat || 0,
                        t: eff.durationMs || 5000
                    });
                });
                return;
            case 'debuff': {
                const applyTo = eff.aoe
                    ? living(foes).filter((f) => dist(unit, f) <= (sk.range || 70) + 24)
                    : (target ? [target] : []);
                applyTo.forEach((f) => {
                    if (!f.alive) return;
                    addStatus(f, {
                        type: 'debuff',
                        stat: eff.stat || 'defense',
                        pct: eff.pct || 0,
                        flat: eff.flat || 0,
                        t: eff.durationMs || 4000
                    });
                });
                return;
            }
            case 'stun': {
                const applyTo = eff.aoe
                    ? living(foes).filter((f) => dist(unit, f) <= (sk.range || 70) + 24)
                    : (target ? [target] : []);
                applyTo.forEach((f) => {
                    addStatus(f, { type: 'stun', t: eff.durationMs || 1000 });
                });
                return;
            }
            case 'mark':
                if (!target || !target.alive) return;
                addStatus(target, {
                    type: 'mark',
                    bonusPct: eff.bonusPct || 0.2,
                    t: eff.durationMs || 8000
                });
                return;
            default:
                return;
        }
    }

    function spawnTraitEnemy(battle, templateId, col, row, scaleMult) {
        const templates = cfg().enemyTemplates || [];
        const tpl = templates.find((t) => t.id === templateId);
        if (!tpl || !battle) return null;
        const u = buildEnemyUnit(tpl, col, row, scaleMult || 0.55);
        u.traitState = u.traitState || {};
        u.traitState.didSplit = true;
        battle.enemies.push(u);
        const w = cellToWorld(col, row, 'enemy', battle.board, battle.origin.x, battle.origin.y);
        u.x = w.x;
        u.y = w.y;
        return u;
    }

    function applyTraitDamage(battle, attacker, target, raw, meta) {
        return applyDamage(battle, attacker, target, raw, battle.relicFx || {}, meta || {});
    }

    function applyDamage(battle, attacker, target, raw, relicFx, meta) {
        meta = meta || {};
        if (window.CombatEffectsBridge && window.CombatEffectsBridge.isInvulnerable(battle, target)) return 0;
        if (window.CombatEffectsBridge) {
            raw = window.CombatEffectsBridge.modifyOutgoingDamage(battle, attacker, target, raw, meta, relicFx);
        }
        let dmg = Math.max(1, raw - defenseValue(target) * 0.5);
        if (meta.ignoreArmor) dmg = Math.max(1, raw * 0.85);
        if (relicFx && relicFx.armorPenPct && attacker.side === 'ally') {
            dmg = Math.max(1, raw - defenseValue(target) * 0.5 * (1 - relicFx.armorPenPct));
        }
        let crit = false;
        const ECS = window.EnemyCompositionSystem;
        const bias = attacker.side === 'ally' ? classCombatBias(attacker.baseClass) : {};
        if (attacker.side === 'ally') {
            if (meta.isSkill) dmg *= bias.skillDamageMult != null ? bias.skillDamageMult : 1;
            else dmg *= bias.basicDamageMult != null ? bias.basicDamageMult : 1;
        }
        if (attacker.side === 'ally' && relicFx) {
            if ((attacker.row || 0) >= 2) dmg *= relicFx.backRowDamageMult || 1;
            if (meta.isSkill) dmg *= relicFx.skillDamageMult || 1;
            if (relicFx.belowHpRatio && attacker.hp / Math.max(1, attacker.maxHp) <= relicFx.belowHpRatio) {
                dmg *= relicFx.belowHpDamageMult || 1;
            }
            if (relicFx.executeBelow && target.hp / Math.max(1, target.maxHp) <= relicFx.executeBelow) {
                dmg *= relicFx.executeDamageMult || 1;
            }
            const critChance = (relicFx.critChance || 0) + (attacker.critChance || 0);
            if (Math.random() < critChance) {
                dmg *= 1.5;
                crit = true;
            }
        }
        if (target.side === 'ally' && !meta.isThorn && (target.dodgeBonus || 0) > 0 && Math.random() < target.dodgeBonus) {
            if (window.CombatEffectsBridge) window.CombatEffectsBridge.onUnitDodge(battle, target);
            return 0;
        }
        if (attacker.side === 'enemy' && ECS && ECS.modifyOutgoingDamage) {
            dmg = ECS.modifyOutgoingDamage(battle, attacker, target, dmg);
        }
        if (ECS && ECS.modifyIncomingDamage) {
            dmg = ECS.modifyIncomingDamage(battle, target, dmg, attacker);
        }
        if (target.side === 'ally' && relicFx && (target.row || 0) <= 0) {
            dmg *= relicFx.frontRowDamageTakenMult || 1;
        }
        const mark = (target.statuses || []).find((s) => s.type === 'mark' && s.t > 0);
        if (mark) dmg *= (1 + (mark.bonusPct || 0));
        if (meta.executeThreshold) {
            let execTh = meta.executeThreshold;
            let execBonus = meta.executeBonusMult || 2;
            if (bias.executeThresholdCap != null) execTh = Math.min(execTh, bias.executeThresholdCap);
            if (bias.executeBonusCap != null) execBonus = Math.min(execBonus, bias.executeBonusCap);
            if (target.hp / Math.max(1, target.maxHp) <= execTh) {
                dmg *= execBonus;
            }
        }
        if (!target.alive || target.hp <= 0) {
            target.alive = false;
            target.hp = 0;
            return 0;
        }
        dmg = Math.floor(dmg);
        if (window.CombatEffectsBridge) {
            dmg = window.CombatEffectsBridge.modifyIncomingDamage(battle, target, dmg, attacker, meta);
        }
        dmg = absorbShield(target, dmg);
        if (dmg <= 0) return 0;
        target.hp -= dmg;
        target.hitFlash = meta.isSkill ? 220 : 140;
        if (meta.crit == null) meta.crit = crit;
        if (attacker) attacker._lastHitWasCrit = crit;
        if (window.CombatEffectsBridge) {
            window.CombatEffectsBridge.onDamageDealt(battle, attacker, target, dmg, meta);
        }
        if (attacker.side === 'ally' && relicFx && relicFx.lifesteal && dmg > 0 && attacker.alive) {
            healUnit(battle, attacker, Math.floor(dmg * relicFx.lifesteal));
        }
        recordCombatDamage(battle, attacker, target, dmg, meta);
        if (window.AscensionHub) {
            window.AscensionHub.onDamage(battle, attacker, target, dmg, meta);
        }
        if (target.hp <= 0) {
            target.hp = 0;
            target.alive = false;
            if (window.AscensionHub) {
                window.AscensionHub.onKill(battle, attacker, target);
            }
            pushFx(battle, {
                type: 'death', x: target.x, y: target.y,
                color: target.color || '#fff', life: 420, maxLife: 420
            });
            if (attacker.side === 'ally' && relicFx && relicFx.onKillHeal && attacker.alive) {
                healUnit(battle, attacker, relicFx.onKillHeal);
            }
            if (ECS && ECS.onDeath && target.side === 'enemy') {
                ECS.onDeath(battle, target).forEach((eff) => {
                    if (eff.target && eff.raw) {
                        applyTraitDamage(battle, target, eff.target, eff.raw, eff.meta);
                    }
                    if (eff.spawn && !eff.spawn.maxOnce) {
                        spawnTraitEnemy(battle, eff.spawn.templateId, eff.spawn.col, eff.spawn.row, eff.spawn.scaleMult);
                    } else if (eff.spawn && target.traitState && !target.traitState.didSplit) {
                        spawnTraitEnemy(battle, eff.spawn.templateId, eff.spawn.col, eff.spawn.row, eff.spawn.scaleMult);
                        target.traitState.didSplit = true;
                    }
                });
            }
            if (target.side === 'enemy' && !living(battle.enemies).length) {
                battle.finaleHit = { x: target.x, y: target.y, color: attacker.color || '#ffd76a' };
                pushFx(battle, {
                    type: 'burst',
                    x: target.x,
                    y: target.y,
                    color: '#ffe8a0',
                    life: 680,
                    maxLife: 680,
                    skill: true
                });
                for (let i = 0; i < 14; i++) {
                    const ang = (Math.PI * 2 * i) / 14;
                    pushFx(battle, {
                        type: 'particle',
                        x: target.x,
                        y: target.y,
                        vx: Math.cos(ang) * (120 + Math.random() * 80),
                        vy: Math.sin(ang) * (120 + Math.random() * 80) - 40,
                        color: i % 2 ? '#ffd76a' : '#fff6d0',
                        size: 3 + Math.random() * 4,
                        life: 900 + Math.floor(Math.random() * 400),
                        maxLife: 1300,
                        skill: true
                    });
                }
            }
        }
        const isSkill = !!meta.isSkill;
        pushDamageNumber(battle, target, dmg, {
            isSkill: isSkill,
            crit: crit,
            ally: attacker.side === 'ally'
        });
        pushFx(battle, {
            type: 'burst',
            x: target.x,
            y: target.y,
            color: isSkill ? '#9ad0ff' : (attacker.color || '#fff'),
            life: isSkill ? 420 : 240,
            maxLife: isSkill ? 420 : 240,
            skill: isSkill
        });
        if (isSkill || crit) {
            burstPixelParticles(
                battle, target.x, target.y,
                crit ? '#ffd76a' : '#c8e8ff',
                attacker.color || '#fff',
                crit ? 10 : 7,
                crit ? 130 : 100
            );
            pushFx(battle, {
                type: 'hit_flash',
                x: target.x, y: target.y,
                radius: crit ? 22 : (isSkill ? 18 : 12),
                life: 150, maxLife: 150, skill: true
            });
        }
        if (meta.trait) {
            spawnEnemyTraitDamageFx(battle, attacker, target, meta);
        }
        if (meta.lifestealPct && attacker.alive) {
            healUnit(battle, attacker, Math.floor(dmg * meta.lifestealPct));
        }
        return dmg;
    }

    /** 每个技能独立特效配置 */
    function skillVfxProfile(skillId) {
        const table = {
            shield_slam: { style: 'slam', color: '#d4a06a', glow: '#ffe0b0', nameColor: '#ffd7a0' },
            charge: { style: 'charge', color: '#e8c070', glow: '#fff0c0', nameColor: '#ffe8b0' },
            war_cry: { style: 'warcry', color: '#ff8844', glow: '#ffcc88', nameColor: '#ffb080' },
            iron_will: { style: 'shield_self', color: '#b8a878', glow: '#ffe8a8', nameColor: '#ffd890' },
            cleave: { style: 'cleave', color: '#e8a050', glow: '#ffd080', nameColor: '#ffc860' },
            last_stand: { style: 'heal_burst', color: '#88cc88', glow: '#c8ffc8', nameColor: '#a8e8a8' },
            hammerfall: { style: 'hammer', color: '#c87840', glow: '#ffb870', nameColor: '#ffa850' },
            bloodthirst: { style: 'bloodthirst', color: '#cc4455', glow: '#ff8899', nameColor: '#ff6677' },
            shield_wall: { style: 'shield_wall', color: '#a8b8d0', glow: '#e0f0ff', nameColor: '#c8d8f0' },
            whirlwind: { style: 'whirlwind', color: '#e0a848', glow: '#ffe090', nameColor: '#ffd060' },
            shield_bash: { style: 'shield_bash', color: '#c8a868', glow: '#ffe8b8', nameColor: '#ffd890' },
            battle_shout: { style: 'battle_shout', color: '#ff7744', glow: '#ffbb88', nameColor: '#ff9966' },
            retaliation: { style: 'retaliation', color: '#8898b8', glow: '#d0e0ff', nameColor: '#b0c0e0' },
            backstep_shot: { style: 'arrow', color: '#7dce6a', glow: '#c8f0a8', nameColor: '#b0e890' },
            poison_arrow: { style: 'poison', color: '#66cc44', glow: '#a0ff70', nameColor: '#90e860' },
            hunters_mark: { style: 'mark', color: '#ff6655', glow: '#ffaa88', nameColor: '#ff8870' },
            arrow_storm: { style: 'storm', color: '#88dd66', glow: '#d0ffb0', nameColor: '#b8f090' },
            power_shot: { style: 'powershot', color: '#ffcc44', glow: '#fff0a0', nameColor: '#ffe060' },
            volley: { style: 'volley', color: '#7ec868', glow: '#d0ff98', nameColor: '#b8f078' },
            frost_bind: { style: 'frost_bind', color: '#66bbee', glow: '#c8f0ff', nameColor: '#98d8ff' },
            mend_shot: { style: 'mend_shot', color: '#68c878', glow: '#b8ffc8', nameColor: '#90e8a0' },
            explosive_arrow: { style: 'explosive', color: '#ff8844', glow: '#ffcc88', nameColor: '#ffaa66' },
            piercing_shot: { style: 'pierce_arrow', color: '#88dd88', glow: '#d8ffd8', nameColor: '#b8f0b8' },
            snipe: { style: 'snipe', color: '#ffee66', glow: '#ffffaa', nameColor: '#ffe840' },
            barbed_arrow: { style: 'barbed', color: '#cc5544', glow: '#ff9988', nameColor: '#ff7766' },
            fireball: { style: 'fireball', color: '#ff6622', glow: '#ffcc44', nameColor: '#ffaa55' },
            fireball_inferno: { style: 'fireball', color: '#ff4400', glow: '#ffdd55', nameColor: '#ff9944' },
            frost_nova: { style: 'frost', color: '#66ccff', glow: '#d0f0ff', nameColor: '#a0e0ff' },
            shadow_bolt: { style: 'shadow', color: '#9955dd', glow: '#d0a0ff', nameColor: '#c090ff' },
            arcane_burst: { style: 'arcane', color: '#6688ff', glow: '#c0d0ff', nameColor: '#a0b8ff' },
            chain_lightning: { style: 'chain', color: '#88ccff', glow: '#e8ffff', nameColor: '#b0e8ff' },
            meteor: { style: 'meteor', color: '#ff5522', glow: '#ffcc66', nameColor: '#ffaa44' },
            arcane_shield: { style: 'shield_self', color: '#6688ff', glow: '#c0d8ff', nameColor: '#a0c0ff' },
            blizzard: { style: 'blizzard', color: '#88ccee', glow: '#e8ffff', nameColor: '#b0e0ff' },
            life_drain: { style: 'drain', color: '#8844cc', glow: '#88ffaa', nameColor: '#c090ff' },
            flame_wave: { style: 'flame_wave', color: '#ff5522', glow: '#ffaa44', nameColor: '#ff8844' },
            arcane_missiles: { style: 'missiles', color: '#7788ff', glow: '#c8d8ff', nameColor: '#a0b0ff' },
            holy_nova: { style: 'holy_nova', color: '#ffe878', glow: '#fff8c8', nameColor: '#ffe060' },
            static_surge: { style: 'static', color: '#88ddff', glow: '#e8ffff', nameColor: '#b0f0ff' },
            shadow_pierce: { style: 'pierce', color: '#aa44cc', glow: '#e0a0ff', nameColor: '#d080ff' },
            fan_of_knives: { style: 'knives', color: '#c0c8d8', glow: '#ffffff', nameColor: '#d8e0f0' },
            smoke_bomb: { style: 'smoke', color: '#889099', glow: '#c0c8d0', nameColor: '#b0b8c0' },
            backstab: { style: 'backstab', color: '#cc44aa', glow: '#ff88dd', nameColor: '#ff70cc' },
            poison_blade: { style: 'poison', color: '#55bb44', glow: '#a0ff80', nameColor: '#80ee70' },
            hemorrhage: { style: 'bleed', color: '#cc3344', glow: '#ff6677', nameColor: '#ff5566' },
            execution: { style: 'execution', color: '#aa2233', glow: '#ff4455', nameColor: '#ff3344' },
            shadow_step: { style: 'shadow_step', color: '#7744aa', glow: '#cc88ff', nameColor: '#b070ff' },
            crippling_strike: { style: 'cripple', color: '#8866aa', glow: '#ccb8e8', nameColor: '#aa88cc' },
            death_mark: { style: 'death_mark', color: '#aa2244', glow: '#ff6688', nameColor: '#ff4466' },
            garrote: { style: 'garrote', color: '#664466', glow: '#aa8899', nameColor: '#886677' },
            blade_flurry: { style: 'blade_flurry', color: '#b0b8c8', glow: '#f0f4ff', nameColor: '#d0d8e8' },
            rally: { style: 'rally', color: '#ffd76a', glow: '#fff0b0', nameColor: '#ffe08a' }
        };
        return table[skillId] || { style: 'bolt', color: '#9ad0ff', glow: '#d0f0ff', nameColor: '#cce9ff' };
    }

    function inferAllyClassFamily(attacker) {
        const cls = (attacker.baseClass || 'warrior').toLowerCase();
        const archer = ['archer', 'ranger', 'marksman', 'windrunner', 'beastmaster', 'deadeye'];
        const mage = ['mage', 'wizard', 'sage', 'warlock', 'archmage', 'oracle', 'necromancer'];
        const assassin = ['assassin', 'shadowdancer', 'trickster', 'venomancer', 'phantom', 'nightblade', 'illusionist', 'plaguebringer'];
        if (archer.indexOf(cls) >= 0) return 'archer';
        if (mage.indexOf(cls) >= 0) return 'mage';
        if (assassin.indexOf(cls) >= 0) return 'assassin';
        return 'warrior';
    }

    function allyClassColor(family) {
        const table = {
            warrior: '#cc6633',
            archer: '#55aa55',
            mage: '#5588cc',
            assassin: '#aa55aa'
        };
        return table[family] || table.warrior;
    }

    function allyAttackVfxProfile(attacker) {
        const family = inferAllyClassFamily(attacker);
        const map = cfg().allyAttackVfx || {};
        const base = map[family] || map.warrior || {};
        const fallback = allyClassColor(family);
        return {
            style: base.style || 'melee_slash',
            color: base.color || attacker.color || fallback,
            glow: base.glow || base.color || fallback,
            heavy: !!base.heavy
        };
    }

    function spawnAllyBasicAttackFx(battle, attacker, target) {
        const profile = allyAttackVfxProfile(attacker);
        const ax = attacker.x;
        const ay = attacker.y;
        const tx = target.x;
        const ty = target.y;
        const ang = Math.atan2(ty - ay, tx - ax);
        const midX = (ax + tx) / 2;
        const midY = (ay + ty) / 2;
        const fx = { color: profile.color, glow: profile.glow };
        const ranged = (attacker.range || 48) > 90;
        let style = profile.style;
        if (style === 'melee_heavy' && ranged) style = 'arrow';
        if (style === 'melee_slash' && ranged) style = 'arcane_bolt';

        switch (style) {
            case 'arrow':
                pushFx(battle, {
                    type: 'cast', x: ax, y: ay, color: fx.color, glow: fx.glow,
                    life: 160, maxLife: 160, skill: true
                });
                spawnArrowProjectile(battle, ax, ay - 4, tx, ty, {
                    color: fx.color, glow: fx.glow, width: 4, life: 220
                });
                break;
            case 'arcane_bolt':
                spawnMageRitual(battle, ax, ay - 6, {
                    element: 'arcane', radius: 14, life: 180,
                    color: fx.color, glow: fx.glow, layer: 'ground', sigil: true, spin: 0.8
                });
                pushFx(battle, {
                    type: 'bolt', x0: ax, y0: ay - 4, x1: tx, y1: ty,
                    color: fx.color, glow: fx.glow,
                    life: 240, maxLife: 240, width: 8, mage: true, skill: true
                });
                burstPixelParticles(battle, tx, ty, fx.glow, fx.color, 6, 80);
                break;
            case 'dagger_thrust':
                spawnVanishPuff(battle, ax, ay, fx.color, fx.glow);
                spawnMeleeThrust(battle, ax, ay, tx, ty, Object.assign({}, fx, { life: 260 }));
                pushFx(battle, {
                    type: 'rip_line', x: tx, y: ty, angle: ang + Math.PI,
                    length: 22, color: fx.color, glow: fx.glow,
                    life: 320, maxLife: 360, skill: true
                });
                pushFx(battle, {
                    type: 'rip_line', x: tx, y: ty, angle: ang + Math.PI + 0.35,
                    length: 16, color: fx.glow, glow: fx.color,
                    life: 280, maxLife: 320, skill: true
                });
                burstPixelParticles(battle, tx, ty, fx.glow, fx.color, 8, 110);
                break;
            case 'melee_heavy':
                spawnWarriorSlashBurst(battle, midX, midY, ang, {
                    color: fx.color, glow: fx.glow, layers: 3, heavy: true, particles: 10
                });
                pushFx(battle, {
                    type: 'ring', x: midX, y: midY, color: fx.glow,
                    life: 280, maxLife: 280, radius: 18, skill: true
                });
                burstPixelParticles(battle, tx, ty, fx.glow, fx.color, 10, 115);
                break;
            case 'melee_slash':
            default:
                spawnWarriorSlashBurst(battle, midX, midY, ang, {
                    color: fx.color, glow: fx.glow, layers: 2, heavy: false, particles: 7
                });
                break;
        }
    }

    function enemyAttackVfxProfile(attacker) {
        const map = cfg().enemyAttackVfx || {};
        const id = attacker.templateId || '';
        const base = map[id];
        const c = attacker.color || '#884444';
        if (base) {
            return {
                style: base.style || 'melee_slash',
                color: base.color || c,
                glow: base.glow || base.color || c,
                width: base.width,
                heavy: !!base.heavy
            };
        }
        const ranged = (attacker.range || 48) > 90;
        return {
            style: ranged ? 'arrow' : 'melee_slash',
            color: c,
            glow: c,
            heavy: false
        };
    }

    function spawnEnemyBolt(battle, ax, ay, tx, ty, opts) {
        pushFx(battle, {
            type: 'bolt', x0: ax, y0: ay - 4, x1: tx, y1: ty,
            color: opts.color || '#9955dd',
            glow: opts.glow || '#d0a0ff',
            life: opts.life || 220, maxLife: opts.life || 220,
            width: opts.width || 7, skill: true
        });
        burstPixelParticles(battle, tx, ty, opts.glow || '#fff', opts.color, opts.particles || 6, opts.speed || 75);
    }

    function spawnEnemyBasicAttackFx(battle, attacker, target) {
        const ECS = window.EnemyCompositionSystem;
        let profile = enemyAttackVfxProfile(attacker);
        if (ECS && ECS.hasTrait && ECS.hasTrait(attacker, 'harpy_dive')) {
            profile = Object.assign({}, profile, { style: 'harpy_swoop' });
        }
        const ax = attacker.x;
        const ay = attacker.y;
        const tx = target.x;
        const ty = target.y;
        const ang = Math.atan2(ty - ay, tx - ax);
        const midX = (ax + tx) / 2;
        const midY = (ay + ty) / 2;
        const fx = { color: profile.color, glow: profile.glow };

        switch (profile.style) {
            case 'arrow':
                spawnArrowProjectile(battle, ax, ay - 4, tx, ty, {
                    color: fx.color, glow: fx.glow, width: 3, life: 200
                });
                break;
            case 'sniper_shot':
                spawnArcherAimMark(battle, tx, ty, 22, fx.glow, fx.color, 180, { rich: true, intensity: 1.2 });
                spawnArrowProjectile(battle, ax, ay - 6, tx, ty, {
                    color: fx.color, glow: fx.glow, width: 4, life: 240
                });
                pushFx(battle, {
                    type: 'impact', x: tx, y: ty, color: fx.glow,
                    life: 260, maxLife: 260, radius: 12, skill: true
                });
                break;
            case 'shadow_bolt':
            case 'hex_bolt':
            case 'abyss_beam':
                if (profile.style === 'hex_bolt') {
                    spawnMageRitual(battle, tx, ty, {
                        element: 'shadow', radius: 18, life: 220,
                        color: fx.color, glow: fx.glow, layer: 'ground', sigil: false, spin: 0.5
                    });
                }
                spawnEnemyBolt(battle, ax, ay, tx, ty, {
                    color: fx.color, glow: fx.glow,
                    width: profile.style === 'abyss_beam' ? 12 : (profile.heavy ? 10 : 7),
                    particles: profile.style === 'abyss_beam' ? 10 : 6
                });
                if (profile.style === 'abyss_beam') {
                    pushFx(battle, {
                        type: 'ring', x: tx, y: ty, color: fx.glow,
                        life: 320, maxLife: 320, radius: 20, skill: true
                    });
                }
                break;
            case 'fire_spit':
                pushFx(battle, {
                    type: 'orb', x: ax, y: ay - 4, tx: tx, ty: ty,
                    color: fx.color, glow: fx.glow,
                    life: 260, maxLife: 260, skill: true
                });
                pushFx(battle, {
                    type: 'cast', x: ax, y: ay, color: fx.color, glow: fx.glow,
                    life: 200, maxLife: 200, skill: true
                });
                break;
            case 'blood_spray':
                spawnEnemyBolt(battle, ax, ay, tx, ty, {
                    color: fx.color, glow: fx.glow, width: 6, particles: 4
                });
                spawnBloodDripFx(battle, tx, ty, fx.color, fx.glow, 4);
                break;
            case 'web_shot':
                spawnArrowProjectile(battle, ax, ay - 3, tx, ty, {
                    color: fx.color, glow: fx.glow, width: 5, life: 220
                });
                burstPixelParticles(battle, tx, ty, fx.glow, fx.color, 8, 55);
                break;
            case 'explosive_lunge':
                pushFx(battle, {
                    type: 'dash', x0: ax, y0: ay, x1: midX, y1: midY,
                    color: fx.color, glow: fx.glow, life: 160, maxLife: 160, skill: true
                });
                pushFx(battle, {
                    type: 'ring', x: midX, y: midY, color: fx.glow,
                    life: 280, maxLife: 280, radius: 18, skill: true
                });
                burstPixelParticles(battle, midX, midY, fx.glow, fx.color, 10, 95);
                break;
            case 'harpy_swoop':
                pushFx(battle, {
                    type: 'dash', x0: ax, y0: ay, x1: tx, y1: ty - 8,
                    color: fx.color, glow: fx.glow, life: 180, maxLife: 180, skill: true
                });
                spawnMeleeArc(battle, tx, ty - 6, ang + Math.PI, Object.assign({}, fx, { heavy: true, rip: true, life: 220 }));
                break;
            case 'drum_pulse':
                pushFx(battle, {
                    type: 'wave', x: ax, y: ay, color: fx.color, glow: fx.glow,
                    life: 420, maxLife: 420, radius: 36, rings: 2, skill: true
                });
                spawnMeleeArc(battle, midX, midY, ang, Object.assign({}, fx, { wide: true, life: 180 }));
                break;
            case 'melee_thrust':
                spawnMeleeThrust(battle, ax, ay, tx, ty, Object.assign({}, fx, { life: 220 }));
                break;
            case 'melee_chain':
                spawnMeleeArc(battle, midX, midY, ang, Object.assign({}, fx, { rip: true, heavy: true, life: 260 }));
                break;
            case 'melee_heavy':
            case 'siege_slam':
                spawnMeleeArc(battle, midX, midY, ang, Object.assign({}, fx, { heavy: true, rip: profile.style === 'siege_slam', life: 300 }));
                pushFx(battle, {
                    type: 'impact', x: tx, y: ty, color: fx.glow, heavy: true,
                    life: 280, maxLife: 280, radius: profile.style === 'siege_slam' ? 16 : 12, skill: true
                });
                if (profile.style === 'siege_slam') {
                    pushFx(battle, {
                        type: 'shock_crack', x: tx, y: ty, color: fx.color, glow: fx.glow,
                        radius: 24, rays: 5, seed: Math.random(), life: 360, maxLife: 360, skill: true
                    });
                }
                break;
            case 'melee_shield':
                spawnMeleeArc(battle, midX, midY, ang, Object.assign({}, fx, { wide: true, life: 240 }));
                pushFx(battle, {
                    type: 'ring', x: ax, y: ay, color: fx.glow,
                    life: 220, maxLife: 220, radius: 14, skill: true
                });
                break;
            case 'melee_claw':
                spawnMeleeArc(battle, midX, midY, ang, Object.assign({}, fx, { life: 200 }));
                burstPixelParticles(battle, tx, ty, fx.glow, fx.color, 5, 80);
                break;
            case 'melee_slash':
            default:
                spawnMeleeArc(battle, midX, midY, ang, Object.assign({}, fx, { life: 200 }));
                break;
        }
    }

    function spawnEnemyTraitHitFx(battle, attacker, target, traitId) {
        if (!battle || !attacker || !target) return;
        const c = attacker.color || '#884444';
        const g = (enemyAttackVfxProfile(attacker).glow) || c;
        switch (traitId) {
            case 'hex_mark':
                pushFx(battle, {
                    type: 'mark', x: target.x, y: target.y - 8,
                    color: '#cc66ff', glow: '#eebbff',
                    life: 520, maxLife: 520, radius: 16, skill: true
                });
                break;
            case 'chain_stun':
                spawnLightningFx(battle, attacker.x, attacker.y - 4, target.x, target.y, '#aa88ff', '#eeddff', 240);
                break;
            case 'trap_slow':
                burstPixelParticles(battle, target.x, target.y, '#88aa55', '#556633', 10, 50);
                pushFx(battle, {
                    type: 'ring', x: target.x, y: target.y, color: '#88aa55',
                    life: 360, maxLife: 360, radius: 14, skill: true
                });
                break;
            case 'life_drain':
                pushFx(battle, {
                    type: 'spell_tether', x0: target.x, y0: target.y, x1: attacker.x, y1: attacker.y - 4,
                    color: '#aa2244', glow: '#ff6688', life: 280, maxLife: 280, skill: true
                });
                spawnBloodDripFx(battle, target.x, target.y, '#aa2244', '#ff6688', 3);
                break;
            default:
                break;
        }
    }

    function spawnEnemyTraitDamageFx(battle, source, target, meta) {
        if (!meta || !meta.trait) return;
        const c = (source && source.color) || '#884444';
        const g = (source && enemyAttackVfxProfile(source).glow) || c;
        switch (meta.trait) {
            case 'death_explode':
                spawnHeavyImpact(battle, source.x, source.y, {
                    color: '#ff6622', glow: '#ffcc44', radius: 46, rip: true, particles: 14
                });
                break;
            case 'abyss_pulse':
                pushFx(battle, {
                    type: 'ring', x: source.x, y: source.y - 4, color: g,
                    life: 480, maxLife: 480, radius: 28, skill: true
                });
                if (target) {
                    spawnEnemyBolt(battle, source.x, source.y, target.x, target.y, {
                        color: c, glow: g, width: 10, particles: 8, speed: 90
                    });
                }
                break;
            default:
                break;
        }
    }

    function spawnBasicAttackFx(battle, attacker, target) {
        if (attacker.side === 'enemy') {
            spawnEnemyBasicAttackFx(battle, attacker, target);
            return;
        }
        spawnAllyBasicAttackFx(battle, attacker, target);
    }

    function spawnSkillFx(battle, attacker, target, skill) {
        const id = (skill && skill.id) || '';
        const baseId = (skill && skill.baseSkillId) || id;
        const def = skillDef(id) || skillDef(baseId);
        // 质变技能优先用本体特效色（如焚天火球沿用火球）
        const baseProfile = skillVfxProfile(baseId);
        const p = (baseId !== id && baseProfile && baseProfile.style !== 'bolt')
            ? baseProfile
            : skillVfxProfile(id);
        const ax = attacker.x;
        const ay = attacker.y;
        const tx = target.x;
        const ty = target.y;
        const ang = Math.atan2(ty - ay, tx - ax);
        const SMS = window.SkillMutationSystem;
        const branchVfx = (SMS && SMS.summarizeBranchVfx && skill && skill.branchMods)
            ? SMS.summarizeBranchVfx(skill.branchMods)
            : { impactScale: 1, orbScale: 1, hasDot: false, forceAoe: false, intensity: 0 };
        const evolvedBoost = (skill && skill.baseSkillId && skill.id !== skill.baseSkillId) ? 1.35 : 1;
        const impactScale = (branchVfx.impactScale || 1) * evolvedBoost;
        const orbScale = (branchVfx.orbScale || 1) * Math.min(1.25, evolvedBoost);
        let aoeR = Math.max(36, (skill && skill.range) ? skill.range * 0.32 : 48) * impactScale;
        if (branchVfx.forceAoe || (skill && skill.aoe)) aoeR *= 1.15;
        const kind = skillCombatKind(id) || skillCombatKind(baseId);
        const fxOpts = { color: p.color, glow: p.glow };
        const mageDamage = def && (def.classTags || []).includes('mage') && kind !== 'support';

        if (!mageDamage) {
            pushFx(battle, {
                type: 'cast', x: ax, y: ay, color: p.color, glow: p.glow,
                life: 420 + (branchVfx.intensity || 0) * 40, maxLife: 420, skill: true
            });
        }
        pushFx(battle, {
            type: 'skillname', x: ax, y: ay - 44,
            text: (skill && skill.name) || (def && def.name) || '技能',
            color: p.nameColor, life: 900, maxLife: 900, vy: -30
        });

        switch (id) {
            case 'shield_slam': {
                const stopX = ax + (tx - ax) * 0.55;
                const stopY = ay + (ty - ay) * 0.55;
                spawnWarriorSlashBurst(battle, (ax + tx) / 2, (ay + ty) / 2, ang, {
                    color: p.color, glow: p.glow, layers: 2, particles: 8
                });
                startUnitVfxMove(attacker, ax, ay, stopX, stopY, 220, {
                    trail: true, color: p.color, glow: p.glow, ease: 'out',
                    arriveAction: 'shield_slam',
                    arriveParams: { tx: tx, ty: ty, ang: ang, color: p.color, glow: p.glow, skillId: id, profile: p }
                });
                break;
            }
            case 'charge': {
                const stopX = tx - Math.cos(ang) * 20;
                const stopY = ty - Math.sin(ang) * 20;
                burstPixelParticles(battle, ax, ay, p.glow, p.color, 12, 90);
                spawnWarriorSlashBurst(battle, ax, ay, ang, {
                    color: p.color, glow: p.glow, layers: 2, particles: 8
                });
                startUnitVfxMove(attacker, ax, ay, stopX, stopY, 400, {
                    trail: true, afterimage: true, color: p.glow, glow: p.color, ease: 'inout',
                    trailEvery: 22, snapBack: true, holdMs: 380,
                    arriveAction: 'charge',
                    arriveParams: { tx: tx, ty: ty, ang: ang, color: p.color, glow: p.glow, skillId: id, profile: p }
                });
                break;
            }
            case 'war_cry':
                pushDelayEmitter(battle, 0, 'war_cry_wave', { x: ax, y: ay, radius: aoeR * 1.1, color: p.color, glow: p.glow, profile: p });
                pushDelayEmitter(battle, 180, 'war_cry_wave', { x: ax, y: ay, radius: aoeR * 0.85, color: p.color, glow: p.glow, profile: p });
                pushDelayEmitter(battle, 360, 'war_cry_wave', { x: ax, y: ay, radius: aoeR * 0.65, color: p.glow, glow: p.color, profile: p });
                spawnMeleeArc(battle, ax, ay, ang, Object.assign({}, fxOpts, { wide: true }));
                break;
            case 'iron_will_bulwark':
            case 'iron_will':
                spawnShieldBubbleFx(battle, ax, ay - 4, p.color, p.glow, 46 * impactScale);
                attachShieldAura(attacker, {
                    color: p.color, glow: p.glow,
                    radius: 44 * impactScale,
                    durationMs: 7000 + (branchVfx.intensity || 0) * 700,
                    shards: 12 + (branchVfx.intensity || 0) * 3
                });
                pushFx(battle, {
                    type: 'ring', x: ax, y: ay, color: p.glow,
                    life: 620, maxLife: 620, radius: 48 * impactScale, skill: true
                });
                if (branchVfx.intensity > 0) {
                    pushFx(battle, {
                        type: 'wave', x: ax, y: ay, color: p.color, glow: p.glow,
                        life: 560, maxLife: 560, radius: 52 * impactScale, rings: 2, skill: true
                    });
                }
                break;
            case 'arcane_shield':
                spawnMageRitual(battle, ax, ay, {
                    element: 'shield', color: p.color, glow: p.glow,
                    radius: 46, life: 760, layer: 'full', spin: 0.45, spinInner: -0.65
                });
                spawnShieldBubbleFx(battle, ax, ay - 4, p.color, p.glow, 46 * impactScale);
                attachShieldAura(attacker, {
                    color: p.color, glow: p.glow,
                    radius: 44 * impactScale,
                    durationMs: 7000 + (branchVfx.intensity || 0) * 600,
                    shards: 12 + (branchVfx.intensity || 0) * 3
                });
                if (branchVfx.intensity > 0) {
                    pushFx(battle, {
                        type: 'wave', x: ax, y: ay, color: p.color, glow: p.glow,
                        life: 560, maxLife: 560, radius: 50 * impactScale, rings: 2, skill: true
                    });
                }
                break;
            case 'cleave_rift':
            case 'cleave': {
                const midX = (ax + tx) / 2;
                const midY = (ay + ty) / 2;
                spawnWarriorSlashBurst(battle, midX, midY, ang, {
                    color: p.color, glow: p.glow,
                    layers: 3 + Math.min(2, branchVfx.intensity || 0),
                    wide: true, impact: true, radius: 38 * impactScale, particles: 16
                });
                const arcs = 2 + Math.min(3, branchVfx.intensity || 0);
                for (let i = -arcs; i <= arcs; i++) {
                    pushDelayEmitter(battle, 80 + i * 50, 'cleave_arc', {
                        x: midX + i * (10 * impactScale), y: midY,
                        ang: ang, offset: i * 0.18, color: p.color, glow: p.glow, profile: p
                    });
                }
                pushFx(battle, {
                    type: 'wave', x: midX, y: midY, color: p.color, glow: p.glow,
                    life: 640 + (branchVfx.intensity || 0) * 80, maxLife: 720,
                    radius: aoeR * 1.15, rings: 3 + Math.min(2, branchVfx.intensity || 0), skill: true
                });
                if (branchVfx.forceAoe || impactScale > 1.25) {
                    spawnHeavyImpact(battle, tx, ty, {
                        color: p.color, glow: p.glow, radius: 40 * impactScale, particles: 18, speed: 140, rays: 8
                    });
                }
                break;
            }
            case 'last_stand':
                spawnHealRiseFx(battle, ax, ay, p.color, p.glow, 16);
                break;
            case 'hammerfall_blood':
            case 'hammerfall_judge':
            case 'hammerfall':
                pushDelayEmitter(battle, 280, 'hammer_smash', {
                    tx: tx, ty: ty, ang: ang, color: p.color, glow: p.glow, profile: p, skillId: id
                });
                pushFx(battle, {
                    type: 'ring', x: tx, y: ty - 20, color: p.glow,
                    life: 320, maxLife: 320, radius: 18 * impactScale, skill: true
                });
                if (branchVfx.forceAoe || impactScale > 1.25) {
                    pushFx(battle, {
                        type: 'wave', x: tx, y: ty, color: p.color, glow: p.glow,
                        life: 560, maxLife: 560, radius: aoeR * 0.9, rings: 3, skill: true
                    });
                }
                break;
            case 'bloodthirst':
                startUnitVfxMove(attacker, ax, ay, ax + (tx - ax) * 0.45, ay + (ty - ay) * 0.45, 200, {
                    trail: true, color: p.color, glow: p.glow, ease: 'out',
                    arriveAction: null
                });
                pushDelayEmitter(battle, 200, 'bloodthirst_slash', {
                    x: (ax + tx) / 2, y: (ay + ty) / 2, ang: ang,
                    ax: ax, ay: ay, tx: tx, ty: ty, color: p.color, glow: p.glow, profile: p
                });
                spawnBloodDripFx(battle, tx, ty, p.color, p.glow, 10);
                break;
            case 'shield_wall':
                pushFx(battle, { type: 'wave', x: ax, y: ay, color: p.color, glow: p.glow, life: 760, maxLife: 760, radius: aoeR * 1.2, rings: 4, skill: true });
                (battle.allies || []).forEach((u) => {
                    if (!u.alive) return;
                    attachShieldAura(u, { color: p.color, glow: p.glow, radius: 36, durationMs: 6000, shards: 8 });
                });
                break;
            case 'whirlwind_blood':
            case 'whirlwind_rift':
            case 'whirlwind': {
                spawnWarriorSlashBurst(battle, ax, ay, ang, {
                    color: p.color, glow: p.glow, layers: 4, wide: true, particles: 14
                });
                const spins = 6 + Math.min(4, branchVfx.intensity || 0);
                for (let i = 0; i < spins; i++) {
                    pushDelayEmitter(battle, i * 40, 'cleave_arc', {
                        x: ax, y: ay, ang: ang + (i - spins / 2) * 0.36,
                        offset: 0, color: p.color, glow: p.glow, profile: p
                    });
                }
                pushFx(battle, {
                    type: 'wave', x: ax, y: ay, color: p.color, glow: p.glow,
                    life: 620 + (branchVfx.intensity || 0) * 60, maxLife: 720,
                    radius: aoeR * (1.15 + (branchVfx.intensity || 0) * 0.08),
                    rings: 3 + Math.min(2, branchVfx.intensity || 0), skill: true
                });
                burstPixelParticles(battle, ax, ay, p.glow, p.color, 16, 130);
                break;
            }
            case 'shield_bash': {
                const stopX = ax + (tx - ax) * 0.45;
                const stopY = ay + (ty - ay) * 0.45;
                startUnitVfxMove(attacker, ax, ay, stopX, stopY, 180, {
                    trail: true, color: p.color, glow: p.glow, ease: 'out',
                    arriveAction: 'shield_slam',
                    arriveParams: { tx: tx, ty: ty, ang: ang, color: p.color, glow: p.glow, skillId: id, profile: p }
                });
                break;
            }
            case 'battle_shout':
                pushDelayEmitter(battle, 0, 'war_cry_wave', { x: ax, y: ay, radius: aoeR * 1.0, color: p.color, glow: p.glow, profile: p });
                pushDelayEmitter(battle, 160, 'war_cry_wave', { x: ax, y: ay, radius: aoeR * 0.8, color: p.glow, glow: p.color, profile: p });
                (battle.allies || []).forEach((u) => {
                    if (!u.alive) return;
                    spawnHealRiseFx(battle, u.x, u.y, '#ffd76a', '#fff0b0', 6);
                });
                break;
            case 'retaliation_oath':
            case 'retaliation':
                spawnShieldBubbleFx(battle, ax, ay - 4, p.color, p.glow, 44 * impactScale);
                attachShieldAura(attacker, {
                    color: p.color, glow: p.glow,
                    radius: 42 * impactScale,
                    durationMs: 5000 + (branchVfx.intensity || 0) * 500,
                    shards: 10 + (branchVfx.intensity || 0) * 2
                });
                pushFx(battle, {
                    type: 'ring', x: ax, y: ay, color: p.glow,
                    life: 620, maxLife: 620, radius: 46 * impactScale, skill: true
                });
                break;
            case 'backstep_shot': {
                const backX = ax - Math.cos(ang) * 22;
                const backY = ay - Math.sin(ang) * 22;
                startUnitVfxMove(attacker, ax, ay, backX, backY, 130, {
                    trail: true, color: p.glow, glow: p.color, ease: 'out',
                    snapBack: true, holdMs: 180
                });
                pushDelayEmitter(battle, 90, 'volley_arrow', {
                    ax: backX, ay: backY - 2, tx: tx, ty: ty,
                    color: p.color, glow: p.glow, profile: p
                });
                spawnArcherShotImpact(battle, tx, ty, p, { delay: 300, radius: 15 });
                break;
            }
            case 'power_shot':
                pushFx(battle, {
                    type: 'cast', x: ax, y: ay, color: p.color, glow: p.glow,
                    life: 280, maxLife: 280, skill: true
                });
                spawnArrowProjectile(battle, ax, ay - 2, tx, ty, {
                    color: p.color, glow: p.glow, width: 6, life: 300
                });
                spawnArcherShotImpact(battle, tx, ty, p, {
                    delay: 270, radius: 22, heavy: true, particles: 9
                });
                break;
            case 'poison_arrow_vine':
            case 'poison_arrow':
                spawnArcherSingleShot(battle, ax, ay, tx, ty, p, {
                    width: 4 * orbScale, skipImpact: true
                });
                pushDelayEmitter(battle, 250, 'poison_splash', {
                    tx: tx, ty: ty, color: p.color, glow: p.glow
                });
                attachStatusVisual(target, 'poison_aura', {
                    color: p.color, glow: p.glow,
                    durationMs: 4000 + (branchVfx.intensity || 0) * 800
                });
                if (branchVfx.forceAoe || branchVfx.hasDot) {
                    pushFx(battle, {
                        type: 'wave', x: tx, y: ty, color: p.color, glow: p.glow,
                        life: 520, maxLife: 520, radius: aoeR * 0.7, rings: 2, skill: true
                    });
                }
                break;
            case 'hunters_mark':
                spawnArcherSingleShot(battle, ax, ay, tx, ty, p, {
                    width: 3.5, skipImpact: true
                });
                pushDelayEmitter(battle, 250, 'mark_pulse', {
                    tx: tx, ty: ty, color: p.color, glow: p.glow
                });
                attachStatusVisual(target, 'hunter_mark', { color: p.color, glow: p.glow, durationMs: 8000 });
                break;
            case 'arrow_storm': {
                const stormIntensity = skillDamageIntensity(attacker, skill, def, battle);
                const storm = arrowStormVfxFromIntensity(stormIntensity);
                const zoneR = aoeR * (0.62 + (storm.intensity - 1) * 0.05);
                spawnArrowStormOpening(battle, tx, ty, zoneR, p, storm);
                spawnArcherAimMark(battle, tx, ty, zoneR, p.color, p.glow, storm.zoneDuration, {
                    rich: storm.rich,
                    intensity: storm.intensity
                });
                spawnZoneField(battle, tx, ty, zoneR * 1.04, storm.zoneDuration, 'arrow_rain', Object.assign({}, p, {
                    light: storm.light,
                    rich: storm.rich,
                    intensity: storm.intensity,
                    spawnInterval: storm.spawnInterval,
                    spawnPerTick: storm.spawnPerTick,
                    burstLeft: storm.burstLeft
                }));
                storm.waveDelays.forEach((delay) => {
                    pushDelayEmitter(battle, delay, 'arrow_storm_wave', {
                        cx: tx, cy: ty, radius: zoneR,
                        color: p.color, glow: p.glow,
                        storm: storm
                    });
                });
                break;
            }
            case 'volley': {
                const pool = living((attacker.side === 'ally' ? battle.enemies : battle.allies) || []);
                const victims = pool.length
                    ? pool.slice().sort((a, b) => dist(attacker, a) - dist(attacker, b)).slice(0, 4)
                    : [target];
                victims.forEach((v, i) => {
                    pushDelayEmitter(battle, i * 75, 'volley_arrow', {
                        ax: ax, ay: ay - 2, tx: v.x, ty: v.y,
                        color: p.color, glow: p.glow, profile: p
                    });
                    pushDelayEmitter(battle, i * 75 + 190, 'volley_impact', {
                        tx: v.x, ty: v.y, color: p.color, glow: p.glow
                    });
                });
                pushFx(battle, {
                    type: 'arrow_salvo_mark', x: tx, y: ty,
                    radius: aoeR * 0.42, color: p.color, glow: p.glow,
                    life: 460, maxLife: 460, skill: true
                });
                break;
            }
            case 'frost_bind':
                spawnFrostBindStrike(battle, ax, ay, tx, ty, p);
                pushDelayEmitter(battle, 280, 'frost_bind_pop', {
                    tx: tx, ty: ty,
                    color: '#66bbee', glow: '#c8f0ff',
                    radius: Math.max(26, aoeR * 0.42)
                });
                attachStatusVisual(target, 'freeze_aura', { color: '#66bbee', glow: '#c8f0ff', durationMs: 1200 });
                break;
            case 'mend_shot':
                spawnArrowProjectile(battle, ax, ay, tx, ty, {
                    color: '#68c878', glow: '#b8ffc8', width: 4, life: 280
                });
                pushDelayEmitter(battle, 250, 'arrow_hit', {
                    tx: tx, ty: ty, color: '#68c878', glow: '#b8ffc8', radius: 12, particles: 4
                });
                pushDelayEmitter(battle, 270, 'mend_heal_rise', {
                    tx: tx, ty: ty, color: p.color, glow: p.glow
                });
                break;
            case 'explosive_arrow':
                spawnArrowProjectile(battle, ax, ay - 2, tx, ty, {
                    color: p.color, glow: p.glow, width: 5.5, life: 280
                });
                spawnArcherShotImpact(battle, tx, ty, p, {
                    delay: 260, radius: 22, heavy: true, particles: 10
                });
                pushFx(battle, {
                    type: 'aoe', x: tx, y: ty, color: p.color, glow: p.glow,
                    life: 420, maxLife: 420, radius: aoeR * 0.55, skill: true
                });
                break;
            case 'snipe_cloud':
            case 'snipe':
                pushFx(battle, {
                    type: 'cast', x: ax, y: ay, color: p.color, glow: p.glow,
                    life: 360 + (branchVfx.intensity || 0) * 40, maxLife: 420, skill: true
                });
                spawnArcherAimMark(battle, tx, ty, 18 * orbScale, p.color, p.glow, 360, {
                    rich: true, intensity: 1.6 + (branchVfx.intensity || 0) * 0.25
                });
                spawnArrowProjectile(battle, ax, ay - 2, tx, ty, {
                    color: p.color, glow: p.glow, width: 7 * orbScale, life: 340
                });
                spawnArcherShotImpact(battle, tx, ty, p, {
                    delay: 300,
                    radius: 26 * impactScale,
                    heavy: true,
                    particles: 12 + (branchVfx.intensity || 0) * 4
                });
                if (branchVfx.chainBonus || impactScale > 1.3) {
                    pushFx(battle, {
                        type: 'wave', x: tx, y: ty, color: p.color, glow: p.glow,
                        life: 480, maxLife: 480, radius: 36 * impactScale, rings: 2, skill: true
                    });
                }
                break;
            case 'barbed_arrow':
                spawnArcherSingleShot(battle, ax, ay, tx, ty, p, { width: 4, skipImpact: true });
                pushDelayEmitter(battle, 250, 'arrow_hit', {
                    tx: tx, ty: ty, color: p.color, glow: p.glow, radius: 14, particles: 5
                });
                attachStatusVisual(target, 'bleed_aura', {
                    color: p.color, glow: p.glow, durationMs: 5000, stacks: 3
                });
                break;
            case 'fireball_inferno':
            case 'fireball': {
                const elem = mageElementForSkill('fireball');
                const boomR = Math.max(48, aoeR * (branchVfx.forceAoe || skill.aoe ? 0.85 : 0.55));
                spawnMageCastCharge(battle, ax, ay - 2, p.color, p.glow, {
                    element: elem, radius: 30 * orbScale, life: 400 + (branchVfx.intensity || 0) * 50
                });
                spawnMageRitual(battle, tx, ty, {
                    element: elem, color: p.color, glow: p.glow,
                    radius: boomR, life: 440 + (branchVfx.intensity || 0) * 40, spin: -0.55
                });
                spawnSpellTether(battle, ax, ay - 4, tx, ty, { color: p.color, glow: p.glow, life: 380 });
                spawnMagicOrb(battle, ax, ay, tx, ty, {
                    color: p.color, glow: p.glow, radius: 18 * orbScale, element: 'fire', life: 340
                });
                pushDelayEmitter(battle, 320, 'fireball_explode', {
                    tx: tx, ty: ty, color: p.color, glow: p.glow,
                    profile: p, skillId: id, element: elem,
                    radius: boomR,
                    impactScale: impactScale,
                    heavy: !!(branchVfx.forceAoe || branchVfx.hasDot || impactScale > 1.2)
                });
                if (branchVfx.hasDot || id === 'fireball_inferno') {
                    attachStatusVisual(target, 'bleed_aura', {
                        color: '#ff6622', glow: '#ffcc44',
                        durationMs: 4500, stacks: 2 + (branchVfx.intensity || 0)
                    });
                }
                if (branchVfx.forceAoe || skill.aoe || id === 'fireball_inferno') {
                    pushFx(battle, {
                        type: 'wave', x: tx, y: ty, color: p.color, glow: p.glow,
                        life: 620, maxLife: 620, radius: boomR * 0.9, rings: 3, skill: true
                    });
                }
                break;
            }
            case 'frost_nova': {
                const elem = mageElementForSkill(id);
                spawnMageCastCharge(battle, ax, ay, p.color, p.glow, {
                    element: elem, radius: 28, life: 480
                });
                spawnFrostNovaBurst(battle, ax, ay, aoeR, { color: p.color, glow: p.glow, shardCount: 14 });
                ((attacker.side === 'ally' ? battle.enemies : battle.allies) || []).forEach((u) => {
                    if (u.alive && dist(attacker, u) <= aoeR + 20) {
                        attachStatusVisual(u, 'freeze_aura', { color: p.color, glow: p.glow, durationMs: 800 });
                    }
                });
                break;
            }
            case 'shadow_bolt':
                spawnMageCastCharge(battle, ax, ay - 4, p.color, p.glow, {
                    element: 'shadow', radius: 24, life: 360
                });
                spawnSpellTether(battle, ax, ay - 4, tx, ty, { color: p.color, glow: p.glow, life: 320 });
                spawnShadowBoltStrike(battle, ax, ay, tx, ty, p);
                break;
            case 'arcane_burst': {
                const elem = mageElementForSkill(id);
                spawnMageCastCharge(battle, ax, ay - 4, p.color, p.glow, {
                    element: elem, radius: 32, life: 520
                });
                spawnMageRitual(battle, tx, ty, {
                    element: elem, color: p.color, glow: p.glow,
                    radius: aoeR * 0.95, life: 560, spin: 0.85, spinInner: -1.15
                });
                spawnSpellTether(battle, ax, ay - 4, tx, ty, { color: p.color, glow: p.glow, life: 520 });
                pushDelayEmitter(battle, 0, 'arcane_pulse', {
                    x: tx, y: ty, radius: aoeR * 0.7, color: p.color, glow: p.glow,
                    profile: p, skillId: id, element: elem
                });
                pushDelayEmitter(battle, 140, 'arcane_pulse', {
                    x: tx, y: ty, radius: aoeR, color: p.glow, glow: p.color,
                    profile: p, skillId: id, element: elem
                });
                pushDelayEmitter(battle, 280, 'arcane_pulse', {
                    x: tx, y: ty, radius: aoeR * 1.15, color: p.color, glow: p.glow,
                    profile: p, skillId: id, element: elem
                });
                break;
            }
            case 'chain_lightning_sky':
            case 'chain_lightning':
            case 'static_surge': {
                const chainEff = (def && def.effects) ? def.effects.find((e) => e.type === 'chain') : { jumps: 3 };
                const jumps = ((chainEff && chainEff.jumps) || 3) + (skill.chainJumpBonus || 0) + (branchVfx.chainBonus || 0);
                const foes = attacker.side === 'ally' ? battle.enemies : battle.allies;
                spawnChainLightningVfx(battle, attacker, foes, target, id, { jumps: jumps }, {
                    mode: 'lightning', element: 'lightning'
                });
                if (branchVfx.intensity > 0) {
                    pushFx(battle, {
                        type: 'wave', x: tx, y: ty, color: p.color, glow: p.glow,
                        life: 500, maxLife: 500, radius: 42 * impactScale, rings: 2, skill: true
                    });
                }
                break;
            }
            case 'piercing_shot_thunder':
            case 'piercing_shot': {
                const chainEff = (def && def.effects) ? def.effects.find((e) => e.type === 'chain') : { jumps: 3 };
                const jumps = ((chainEff && chainEff.jumps) || 3) + (skill.chainJumpBonus || 0) + (branchVfx.chainBonus || 0);
                const foes = attacker.side === 'ally' ? battle.enemies : battle.allies;
                spawnChainLightningVfx(battle, attacker, foes, target, id, { jumps: jumps }, { mode: 'arrow' });
                break;
            }
            case 'arcane_missiles_orbit':
            case 'arcane_missiles': {
                const chainEff = (def && def.effects) ? def.effects.find((e) => e.type === 'chain') : { jumps: 4 };
                const jumps = ((chainEff && chainEff.jumps) || 4) + (skill.chainJumpBonus || 0) + (branchVfx.chainBonus || 0);
                const foes = attacker.side === 'ally' ? battle.enemies : battle.allies;
                spawnChainLightningVfx(battle, attacker, foes, target, id, { jumps: jumps }, {
                    mode: 'arcane', element: 'arcane'
                });
                break;
            }
            case 'flame_wave': {
                const elem = mageElementForSkill(id);
                spawnMageCastCharge(battle, ax, ay - 4, p.color, p.glow, {
                    element: elem, radius: 28, life: 460
                });
                spawnMageRitual(battle, tx, ty, {
                    element: elem, color: p.color, glow: p.glow,
                    radius: aoeR * 0.88, life: 520, spin: -0.65
                });
                pushDelayEmitter(battle, 0, 'arcane_pulse', {
                    x: tx, y: ty, radius: aoeR * 0.75, color: p.color, glow: p.glow,
                    profile: p, skillId: id, element: elem
                });
                pushDelayEmitter(battle, 120, 'arcane_pulse', {
                    x: tx, y: ty, radius: aoeR, color: p.glow, glow: p.color,
                    profile: p, skillId: id, element: elem
                });
                break;
            }
            case 'holy_nova': {
                spawnMageCastCharge(battle, ax, ay, p.color, p.glow, {
                    element: 'arcane', radius: 30, life: 480
                });
                spawnFrostNovaBurst(battle, ax, ay, aoeR * 0.95, {
                    color: p.color, glow: p.glow, shardCount: 10
                });
                (battle.allies || []).forEach((u) => {
                    if (!u.alive) return;
                    spawnHealRiseFx(battle, u.x, u.y, p.color, p.glow, 8);
                });
                break;
            }
            case 'meteor': {
                const elem = mageElementForSkill(id);
                spawnMageCastCharge(battle, ax, ay - 6, p.color, p.glow, {
                    element: elem, radius: 34, life: 580
                });
                spawnMageRitual(battle, tx, ty, {
                    element: elem, color: p.color, glow: p.glow,
                    radius: aoeR * 1.05, life: 600, spin: 0.6, spinInner: -0.9
                });
                spawnSpellTether(battle, ax, ay - 6, tx, ty, { color: p.color, glow: p.glow, life: 560 });
                spawnMeteorFx(battle, tx, ty, p.color, p.glow, aoeR * 1.15);
                break;
            }
            case 'blizzard': {
                const elem = mageElementForSkill(id);
                spawnMageCastCharge(battle, ax, ay - 4, p.color, p.glow, {
                    element: elem, radius: 30, life: 520
                });
                spawnMageRitual(battle, tx, ty, {
                    element: elem, color: p.color, glow: p.glow,
                    radius: aoeR * 1.0, life: 5200, spin: 0.35, spinInner: -0.5
                });
                spawnSpellTether(battle, ax, ay - 4, tx, ty, { color: p.color, glow: p.glow, life: 480 });
                spawnRuneCollapse(battle, tx, ty, {
                    color: p.color, glow: p.glow, element: elem, radius: aoeR * 0.6, life: 400
                });
                spawnFrostNovaBurst(battle, tx, ty, aoeR * 0.55, { color: p.color, glow: p.glow, shardCount: 8 });
                spawnZoneField(battle, tx, ty, aoeR * 1.05, 5000, 'blizzard', p);
                break;
            }
            case 'life_drain': {
                const elem = mageElementForSkill(id);
                spawnMageCastCharge(battle, ax, ay - 4, p.color, p.glow, {
                    element: elem, radius: 26, life: 460
                });
                spawnMageRitual(battle, tx, ty, {
                    element: elem, color: p.color, glow: p.glow,
                    radius: 32, life: 480, layer: 'full', spin: -0.7
                });
                spawnSpellTether(battle, tx, ty, ax, ay - 4, { color: p.glow, glow: p.color, life: 460 });
                spawnRuneCollapse(battle, tx, ty, {
                    color: p.color, glow: p.glow, element: elem, radius: 28, life: 360
                });
                spawnMagicOrb(battle, tx, ty, ax, ay, {
                    color: p.glow, glow: p.color, radius: 10, element: 'shadow', life: 400
                });
                spawnBloodDripFx(battle, tx, ty, p.color, p.glow, 10);
                spawnHealRiseFx(battle, ax, ay, p.glow, '#88ffaa', 8);
                break;
            }
            case 'shadow_pierce':
                startAssassinAmbush(battle, attacker, target, {
                    color: p.color, glow: p.glow, profile: p, skillId: id,
                    dist: 30, duration: 220, holdMs: 260,
                    arriveAction: 'shadow_pierce'
                });
                break;
            case 'fan_of_knives':
                startAssassinAmbush(battle, attacker, target, {
                    color: p.color, glow: p.glow, profile: p, skillId: id,
                    dist: 32, duration: 230, holdMs: 420,
                    arriveAction: 'fan_knives_throw'
                });
                break;
            case 'smoke_bomb':
                startAssassinAmbush(battle, attacker, target, {
                    color: p.color, glow: p.glow, profile: p, skillId: id,
                    dist: 28, duration: 260, holdMs: 360,
                    arriveAction: 'smoke_bomb_pop',
                    arriveParams: { radius: aoeR }
                });
                break;
            case 'backstab':
                startAssassinAmbush(battle, attacker, target, {
                    color: p.color, glow: p.glow, profile: p, skillId: id,
                    dist: 34, duration: 240, holdMs: 320,
                    arriveAction: 'backstab'
                });
                break;
            case 'poison_blade':
                startAssassinAmbush(battle, attacker, target, {
                    color: p.color, glow: p.glow, profile: p, skillId: id,
                    dist: 32, duration: 230, holdMs: 280,
                    arriveAction: 'poison_blade_strike'
                });
                attachStatusVisual(target, 'poison_aura', { color: p.color, glow: p.glow, durationMs: 5000 });
                break;
            case 'hemorrhage':
                startAssassinAmbush(battle, attacker, target, {
                    color: p.color, glow: p.glow, profile: p, skillId: id,
                    dist: 32, duration: 230, holdMs: 300,
                    arriveAction: 'hemorrhage_strike'
                });
                attachStatusVisual(target, 'bleed_aura', { color: p.color, glow: p.glow, durationMs: 6000, stacks: 3 });
                break;
            case 'execution_final':
            case 'execution':
                startAssassinAmbush(battle, attacker, target, {
                    color: p.color, glow: p.glow, profile: p, skillId: id,
                    dist: 30, duration: 250, holdMs: 340 + (branchVfx.intensity || 0) * 40,
                    arriveAction: 'execution_strike'
                });
                if (impactScale > 1.2 || branchVfx.intensity > 0) {
                    pushDelayEmitter(battle, 280, 'hammer_smash', {
                        tx: tx, ty: ty, ang: ang, color: p.color, glow: p.glow, profile: p, skillId: id
                    });
                    pushFx(battle, {
                        type: 'wave', x: tx, y: ty, color: p.color, glow: p.glow,
                        life: 520, maxLife: 520, radius: 40 * impactScale, rings: 2, skill: true
                    });
                }
                break;
            case 'shadow_step':
                startAssassinAmbush(battle, attacker, target, {
                    color: p.color, glow: p.glow, profile: p, skillId: id,
                    dist: 32, duration: 260, holdMs: 300,
                    arriveAction: 'shadow_step_strike'
                });
                attachStatusVisual(attacker, 'attack_buff_aura', { color: p.color, glow: p.glow, durationMs: 4000 });
                break;
            case 'crippling_strike':
                startAssassinAmbush(battle, attacker, target, {
                    color: p.color, glow: p.glow, profile: p, skillId: id,
                    dist: 30, duration: 230, holdMs: 280,
                    arriveAction: 'shadow_pierce'
                });
                attachStatusVisual(target, 'smoke_debuff', { color: p.color, glow: p.glow, durationMs: 4000 });
                break;
            case 'death_mark':
                startAssassinAmbush(battle, attacker, target, {
                    color: p.color, glow: p.glow, profile: p, skillId: id,
                    dist: 34, duration: 240, holdMs: 300,
                    arriveAction: 'backstab'
                });
                pushDelayEmitter(battle, 260, 'mark_pulse', {
                    tx: tx, ty: ty, color: p.color, glow: p.glow
                });
                break;
            case 'garrote':
                startAssassinAmbush(battle, attacker, target, {
                    color: p.color, glow: p.glow, profile: p, skillId: id,
                    dist: 28, duration: 240, holdMs: 320,
                    arriveAction: 'hemorrhage_strike'
                });
                attachStatusVisual(target, 'poison_aura', { color: p.color, glow: p.glow, durationMs: 3000 });
                break;
            case 'blade_flurry':
                startAssassinAmbush(battle, attacker, target, {
                    color: p.color, glow: p.glow, profile: p, skillId: id,
                    dist: 26, duration: 200, holdMs: 380,
                    arriveAction: 'fan_knives_throw'
                });
                break;
            case 'rally':
                pushFx(battle, { type: 'wave', x: ax, y: ay, color: p.color, glow: p.glow, life: 640, maxLife: 640, radius: aoeR, rings: 4, skill: true });
                spawnHealRiseFx(battle, ax, ay - 8, '#ffd76a', '#fff0b0', 10);
                (battle.allies || []).forEach((u) => {
                    if (!u.alive) return;
                    attachStatusVisual(u, 'attack_buff_aura', { color: p.color, glow: p.glow, durationMs: 5000 });
                });
                break;
            default:
                if (kind === 'melee') {
                    spawnMeleeArc(battle, (ax + tx) / 2, (ay + ty) / 2, ang, Object.assign({}, fxOpts, { heavy: true }));
                    spawnHeavyImpact(battle, tx, ty, {
                        color: p.color, glow: p.glow, radius: 30, particles: 12
                    });
                } else {
                    spawnArrowProjectile(battle, ax, ay, tx, ty, fxOpts);
                    if (skill && skill.aoe) {
                        pushFx(battle, { type: 'aoe', x: tx, y: ty, color: p.color, glow: p.glow, life: 460, maxLife: 460, radius: aoeR, skill: true });
                    }
                }
                break;
        }

        const muts = (attacker && attacker.side === 'ally' && battle && battle.relicFx)
            ? (battle.relicFx.skillMutators || [])
            : [];
        const effects = resolveSkillEffects(skill || { id: id }, muts);
        applyStatusVisualsFromEffects(battle, attacker, target, id, effects);
    }

    function spawnAttackFx(battle, attacker, target, isSkill, aoe, skill) {
        if (isSkill) {
            spawnSkillFx(battle, attacker, target, skill || { aoe: aoe });
            return;
        }
        spawnBasicAttackFx(battle, attacker, target);
    }

    function castSkill(battle, unit, sk, target, foes, allies, relicFx, combat) {
        spawnAttackFx(battle, unit, target, true, sk.aoe, sk);
        const mutators = (unit.side === 'ally' && relicFx) ? (relicFx.skillMutators || []) : [];
        const effects = resolveSkillEffects(sk, mutators);
        effects.forEach((eff) => {
            applySkillEffect(battle, unit, sk, eff, target, foes, allies, relicFx);
        });
        const cdMult = unit.side === 'ally'
            ? (relicFx.cooldownMult || 1) * (battle.weatherSkillCdMult || 1)
            : 1;
        const feel = (combat && combat.skillCooldownMult) != null ? combat.skillCooldownMult : 0.75;
        sk.cd = sk.cooldownMs * cdMult * feel;
        // 技能后短暂锁普攻，避免技能瞬间被普攻淹没
        const lock = (combat && combat.skillCastLockMs) != null ? combat.skillCastLockMs : 420;
        unit.basicCd = Math.max(unit.basicCd, lock);
        const SMS = window.SkillMutationSystem;
        const branchVfx = (SMS && SMS.summarizeBranchVfx && sk.branchMods)
            ? SMS.summarizeBranchVfx(sk.branchMods)
            : { intensity: 0 };
        unit.castFlash = 700 + Math.min(400, (branchVfx.intensity || 0) * 120);
        unit.lastSkillName = sk.name || sk.id;
        unit.skillCasts = (unit.skillCasts || 0) + 1;
        bumpMetric(ensureBattleMetrics(battle).skillCasts, sk.id || sk.name || 'skill', 1);
        bumpMetric(ensureBattleMetrics(battle).skillCasts, metricsKey(unit) + '::casts', 1);
        if (!battle.log) battle.log = [];
        battle.log.push({
            t: battle.elapsed || 0,
            actor: unit.name,
            skill: sk.name || sk.id,
            side: unit.side
        });
        if (battle.log.length > 24) battle.log.splice(0, battle.log.length - 24);
        if (unit.side === 'ally' && unit.baseClass === 'mage' && battle.bondFx && battle.bondFx.mageEchoChance &&
            Math.random() < battle.bondFx.mageEchoChance) {
            effects.forEach((eff) => {
                applySkillEffect(battle, unit, sk, eff, target, foes, allies, relicFx);
            });
        }
        if (unit.side === 'ally' && relicFx.randomElementOnSkill && relicFx.randomElementOnSkill.length) {
            const pool = relicFx.randomElementOnSkill;
            const el = pool[Math.floor(Math.random() * pool.length)];
            const foes2 = living(foes);
            const t2 = target || foes2[0];
            if (t2 && window.AutoBattleSimulator) {
                const dotMeta = { isSkill: true, fire: el === 'fire', ice: el === 'ice', lightning: el === 'lightning' };
                window.AutoBattleSimulator.applyTraitDamage(
                    battle, unit, t2, Math.floor(unit.attack * 0.4), dotMeta
                );
            }
        }
    }

    function placeUnits(battle) {
        const board = battle.board;
        const ox = battle.origin.x;
        const oy = battle.origin.y;
        (battle.allies || []).forEach((u) => {
            if (u.col < 0 || u.row < 0) return;
            const w = cellToWorld(u.col, u.row, 'ally', board, ox, oy);
            u.x = w.x; u.y = w.y;
        });
        (battle.enemies || []).forEach((u) => {
            const w = cellToWorld(u.col, u.row, 'enemy', board, ox, oy);
            u.x = w.x; u.y = w.y;
        });
    }

    function createBattle(run, node, canvasSize) {
        const board = Object.assign({}, cfg().board || { cols: 4, rows: 3, cellSize: 72, gap: 8 });
        const cw = (canvasSize && canvasSize.w) || 1280;
        const ch = (canvasSize && canvasSize.h) || 720;
        fitBoardToCanvas(board, cw, ch);
        const combatBase = cfg().combat || {};
        const scaleR = (board.cellSize || 70) / 70;
        const combat = Object.assign({}, combatBase, {
            meleeRange: (combatBase.meleeRange || 42) * scaleR,
            rangedRange: (combatBase.rangedRange || 160) * scaleR,
            moveSpeed: (combatBase.moveSpeed || 90) * Math.max(1, scaleR * 0.9),
            skillCooldownMult: combatBase.skillCooldownMult != null ? combatBase.skillCooldownMult : 0.75,
            skillCastLockMs: combatBase.skillCastLockMs != null ? combatBase.skillCastLockMs : 420
        });
        const relicFx = window.RelicSystem
            ? window.RelicSystem.aggregateRelicEffects(run.relics)
            : {};
        const SMS = window.SkillMutationSystem;
        if (SMS && SMS.aggregateDuoSparkEffects) {
            const sparkFx = SMS.aggregateDuoSparkEffects(run);
            Object.keys(sparkFx).forEach((k) => {
                if (sparkFx[k] == null) return;
                if (typeof sparkFx[k] === 'number' && typeof relicFx[k] === 'number') {
                    if (k.indexOf('Mult') >= 0 || k.indexOf('mult') >= 0) relicFx[k] = (relicFx[k] || 1) * sparkFx[k];
                    else relicFx[k] = (relicFx[k] || 0) + sparkFx[k];
                } else if (typeof sparkFx[k] === 'boolean') {
                    relicFx[k] = !!(relicFx[k] || sparkFx[k]);
                } else {
                    relicFx[k] = sparkFx[k];
                }
            });
            if (sparkFx.glassCooldownMult && sparkFx.glassCooldownMult !== 1) {
                relicFx.cooldownMult = (relicFx.cooldownMult || 1) * sparkFx.glassCooldownMult;
            }
        }
        const allies = run.heroes
            .filter((h) => isHeroCombatReady(h))
            .map((h) => buildAllyUnit(h, relicFx))
            .filter((u) => u.alive && u.hp > 0);
        if (run.ascension && run.ascension.tempAllies && run.ascension.tempAllies.length) {
            run.ascension.tempAllies.forEach((ta, i) => {
                if ((ta.battlesLeft || 0) <= 0) return;
                ta.battlesLeft -= 1;
                allies.push({
                    id: 'temp_ally_' + i + '_' + (ta.id || 'merc'),
                    side: 'ally',
                    name: ta.id || '佣兵',
                    col: i % 4,
                    row: 1,
                    hp: 120,
                    maxHp: 120,
                    attack: 18,
                    defense: 4,
                    speed: 65,
                    range: 48,
                    skillMult: 1,
                    basicInterval: 900,
                    basicCd: 0,
                    skills: [],
                    alive: true,
                    tempAlly: true,
                    color: '#88aa66'
                });
            });
            run.ascension.tempAllies = run.ascension.tempAllies.filter((t) => (t.battlesLeft || 0) > 0);
        }
        // 放大后同步攻击距离；技能射程至少覆盖普攻距离，避免永远放不出技
        allies.forEach((u, idx) => {
            if ((u.range || 0) > 90) u.range = combat.rangedRange;
            else u.range = Math.max(combat.meleeRange, (u.range || 48) * scaleR);
            const rangeMult = relicFx.skillRangeMult || 1;
            (u.skills || []).forEach((sk, si) => {
                const baseR = (sk.range || u.range) * scaleR * rangeMult;
                sk.range = Math.max(baseR, u.range);
                // 错开开局就绪，避免同一帧全员齐放看不清
                sk.cd = sk.startReady ? 0 : (si * 120 + idx * 80);
            });
            const moveMult = relicFx.moveSpeedMult || 1;
            u.speed = (u.speed || 70) * Math.max(1, scaleR * 0.85) * moveMult;
            u.skillCasts = 0;
            u.castFlash = 0;
            u.lastSkillName = '';
        });
        const nodeSeed = ((run.seed || 1) ^ ((node.layer + 1) * 9973) ^ ((node.id || '').length * 131)) >>> 0;
        const rng = window.RunStateSystem.mulberry32(nodeSeed);
        let enemies = generateEnemies(node.type, node.layer, rng, run);
        const pact = run.ascension && run.ascension.pact;
        if (pact && pact.enemyCountMult > 1) {
            const dup = enemies.map((e, i) => Object.assign({}, e, {
                id: (e.id || 'e') + '_dup' + i,
                col: ((e.col || 0) + 2) % (board.cols || 4)
            }));
            enemies = enemies.concat(dup);
        }
        enemies.forEach((u) => {
            if ((u.range || 0) > 90) u.range = combat.rangedRange;
            else u.range = Math.max(combat.meleeRange, (u.range || 48) * scaleR);
            u.speed = (u.speed || 70) * Math.max(1, scaleR * 0.85);
        });
        const origin = battleOrigin(cw, ch, board);
        const battle = {
            board: board,
            combat: combat,
            relicFx: relicFx,
            allies: allies,
            enemies: enemies,
            origin: origin,
            fx: [],
            elapsed: 0,
            finished: false,
            victory: false,
            log: []
        };
        placeUnits(battle);
        allies.forEach((u) => {
            if (relicFx.suppressStartSkillReady) return;
            if (relicFx.startAllSkillsReady) {
                (u.skills || []).forEach((sk) => { sk.cd = 0; });
            } else if (relicFx.startSkillReady && u.skills.length) {
                u.skills[0].cd = 0;
            }
        });
        if (enemies.length) {
            battle.encounterId = enemies[0].encounterId;
            battle.encounterName = enemies[0].encounterName;
            battle.encounterDesc = enemies[0].encounterDesc;
            battle.encounterSynergy = enemies[0].encounterSynergy;
        }
        const ECS = window.EnemyCompositionSystem;
        if (ECS && ECS.initBattle) ECS.initBattle(battle);
        return battle;
    }

    function createDeployPreview(run, node, canvasSize) {
        const board = Object.assign({}, cfg().board || { cols: 4, rows: 3, cellSize: 72, gap: 8 });
        const cw = (canvasSize && canvasSize.w) || 1280;
        const ch = (canvasSize && canvasSize.h) || 720;
        fitBoardToCanvas(board, cw, ch);
        const relicFx = window.RelicSystem
            ? window.RelicSystem.aggregateRelicEffects(run.relics)
            : {};
        const allies = run.heroes
            .filter((h) => h.boardCol >= 0 && h.boardRow >= 0)
            .map((h) => {
                const u = buildAllyUnit(h, relicFx);
                // 布阵预览仍显示阵亡者（灰态），实战 createBattle 不会带上他们
                if (!u.alive || u.hp <= 0) {
                    u.preview = true;
                    u.deadPreview = true;
                }
                return u;
            });
        const nodeSeed = ((run.seed || 1) ^ ((node.layer + 1) * 9973) ^ ((node.id || '').length * 131)) >>> 0;
        const rng = window.RunStateSystem.mulberry32(nodeSeed);
        const enemies = generateEnemies(node.type, node.layer, rng, run).map((e) => {
            e.preview = true;
            return e;
        });
        const origin = battleOrigin(cw, ch, board);
        const battle = {
            board: board,
            allies: allies,
            enemies: enemies,
            origin: origin,
            preview: true,
            relicFx: relicFx,
            fx: [],
            finished: false,
            victory: false,
            elapsed: 0
        };
        placeUnits(battle);
        if (enemies.length) {
            battle.encounterId = enemies[0].encounterId;
            battle.encounterName = enemies[0].encounterName;
            battle.encounterDesc = enemies[0].encounterDesc;
            battle.encounterSynergy = enemies[0].encounterSynergy;
        }
        return battle;
    }

    function reanchorBattle(battle, canvasWidth, canvasHeight) {
        if (!battle || !battle.board) return;
        const oldBoard = {
            cellSize: battle.board.cellSize,
            gap: battle.board.gap,
            midGap: battle.board.midGap
        };
        const oldOrigin = battle.origin ? { x: battle.origin.x, y: battle.origin.y } : { x: 80, y: 80 };
        fitBoardToCanvas(battle.board, canvasWidth, canvasHeight);
        const next = battleOrigin(canvasWidth, canvasHeight, battle.board);
        const scale = (battle.board.cellSize || 70) / (oldBoard.cellSize || 70);

        if (battle.preview) {
            battle.origin = next;
            placeUnits(battle);
            return;
        }

        // 战斗中：相对原点缩放平移，保留走位
        (battle.allies || []).concat(battle.enemies || []).forEach((u) => {
            u.x = next.x + (u.x - oldOrigin.x) * scale;
            u.y = next.y + (u.y - oldOrigin.y) * scale;
        });
        (battle.fx || []).forEach((fx) => {
            if (fx.x != null) { fx.x = next.x + (fx.x - oldOrigin.x) * scale; fx.y = next.y + (fx.y - oldOrigin.y) * scale; }
            if (fx.x0 != null) {
                fx.x0 = next.x + (fx.x0 - oldOrigin.x) * scale;
                fx.y0 = next.y + (fx.y0 - oldOrigin.y) * scale;
                fx.x1 = next.x + (fx.x1 - oldOrigin.x) * scale;
                fx.y1 = next.y + (fx.y1 - oldOrigin.y) * scale;
            }
        });
        battle.origin = next;
    }

    function living(units) {
        return units.filter((u) => u && u.alive && u.hp > 0);
    }

    function tickUnit(battle, unit, allies, enemies, dtMs, relicFx, combat) {
        if (!unit.alive || unit.hp <= 0) {
            unit.alive = false;
            unit.hp = Math.max(0, unit.hp || 0);
            return;
        }
        tickStatuses(battle, unit, dtMs, relicFx);
        tickUnitAuras(unit, dtMs);
        if (unit.hitFlash > 0) unit.hitFlash = Math.max(0, unit.hitFlash - dtMs);
        if (isStunned(unit)) return;
        if (unit.side === 'enemy' && battle.enemyTimeStopUntil != null &&
            (battle.elapsed || 0) < battle.enemyTimeStopUntil) return;
        unit.basicCd = Math.max(0, unit.basicCd - dtMs);
        (unit.skills || []).forEach((sk) => { sk.cd = Math.max(0, sk.cd - dtMs); });

        const foes = unit.side === 'ally' ? enemies : allies;
        let target = foes.find((f) => f.id === unit.targetId && f.alive) || pickTarget(unit, living(foes), battle);
        if (!target) return;
        unit.targetId = target.id;

        if (unit.castFlash > 0) unit.castFlash = Math.max(0, unit.castFlash - dtMs);

        // 优先释放就绪技能（在技能射程内即可，不必贴到普攻距离）
        const skills = unit.skills || [];
        const silenced = window.CombatEffectsBridge && window.CombatEffectsBridge.isSilenced(battle, unit);
        if (!silenced) {
        for (let i = 0; i < skills.length; i++) {
            const sk = skills[i];
            if (!sk || sk.cd > 0) continue;
            if (dist(unit, target) <= (sk.range || unit.range || 48) + 10) {
                castSkill(battle, unit, sk, target, foes, allies, relicFx, combat);
                return;
            }
        }
        }

        const range = unit.range || 48;
        const d = dist(unit, target);
        if (d <= range) {
            if (unit.basicCd <= 0 && (!window.CombatEffectsBridge || window.CombatEffectsBridge.canBasicAttack(battle, unit))) {
                spawnAttackFx(battle, unit, target, false, false, null);
                applyDamage(battle, unit, target, unit.attack * attackBuffMult(unit, battle), relicFx, { isSkill: false });
                if (window.CombatEffectsBridge) {
                    window.CombatEffectsBridge.onBasicAttackHit(battle, unit, target, relicFx);
                }
                if (unit.side === 'ally') {
                    const healAmt = (relicFx.onHitHeal || 0) + (unit.onHitHeal || 0);
                    if (healAmt) unit.hp = Math.min(unit.maxHp, unit.hp + healAmt);
                }
                const ECS = window.EnemyCompositionSystem;
                if (unit.side === 'enemy' && ECS && ECS.onBasicHit) {
                    ECS.onBasicHit(battle, unit, target);
                }
                unit.basicCd = unit.basicInterval || combat.basicAttackIntervalMs || 900;
            }
            return;
        }

        const speed = (unit.speed || 70) * (dtMs / 1000);
        const dx = target.x - unit.x;
        const dy = target.y - unit.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        unit.x += (dx / len) * speed;
        unit.y += (dy / len) * speed;
    }

    function tickFx(battle, dtMs) {
        if (!battle.fx) return;
        const dt = dtMs / 1000;
        const pendingActions = [];
        const pendingFx = [];
        battle.fx = battle.fx.filter((fx) => {
            fx.life -= dtMs;
            if (fx.type === 'delay_emitter' && !fx.fired) {
                fx.delay = (fx.delay || 0) - dtMs;
                if (fx.delay <= 0) {
                    fx.fired = true;
                    pendingActions.push({ action: fx.action, params: fx.params });
                    fx.life = 0;
                }
            } else if (fx.type === 'falling_arrow') {
                fx.y += (fx.vy || 240) * dt;
                fx.x += (fx.vx || 0) * dt + Math.sin((fx.wobble || 0) + fx.life * 0.02) * 0.8;
                fx.angle = Math.atan2(fx.vy || 240, fx.vx || 0);
                if (fx.y >= fx.landY) {
                    const iv = fx.intensity || 1;
                    const irich = fx.rich || iv >= 1.15;
                    if (fx.light) {
                        pendingFx.push({
                            type: 'impact', x: fx.x, y: fx.landY,
                            color: fx.glow || fx.color,
                            life: irich ? 200 : 160,
                            maxLife: irich ? 200 : 160,
                            radius: irich ? Math.min(14, 7 + (iv - 1) * 3.5) : 7,
                            skill: true
                        });
                        if (irich) {
                            const pc = Math.max(1, Math.round(1 + (iv - 1) * 1.2));
                            for (let pi = 0; pi < pc; pi++) {
                                pendingFx.push({
                                    type: 'particle', pixel: true,
                                    x: fx.x, y: fx.landY,
                                    vx: (Math.random() - 0.5) * 28, vy: -14 - Math.random() * 22,
                                    color: pi % 2 ? (fx.glow || fx.color) : fx.color,
                                    size: pi ? 1.5 : 2,
                                    life: 280, maxLife: 320, skill: true
                                });
                            }
                        }
                    } else {
                        pendingFx.push({
                            type: 'hit_flash', x: fx.x, y: fx.landY,
                            radius: 8, life: 140, maxLife: 140, skill: true
                        });
                        pendingFx.push({
                            type: 'impact', x: fx.x, y: fx.landY,
                            color: fx.glow || fx.color, heavy: true,
                            life: 300, maxLife: 300, radius: 14, skill: true
                        });
                        pendingFx.push({
                            type: 'particle', pixel: true,
                            x: fx.x, y: fx.landY,
                            vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30,
                            color: fx.color, size: 2, life: 320, maxLife: 380, skill: true
                        });
                    }
                    fx.life = 0;
                }
            } else if (fx.type === 'dmg' || fx.type === 'skillname') {
                fx.y += (fx.vy || -40) * dt;
                if (fx.type === 'dmg') {
                    fx.vy = (fx.vy || -40) + 55 * dt;
                    fx.x += Math.sin((fx.life || 0) * 0.04) * (fx.huge ? 10 : 4) * dt;
                }
            } else if (fx.type === 'spark') {
                fx.y += (fx.vy != null ? fx.vy : 20) * dt;
            } else if (fx.type === 'particle') {
                fx.x += (fx.vx || 0) * dt;
                fx.y += (fx.vy || 0) * dt;
                fx.vy = (fx.vy || 0) + 120 * dt;
                fx.vx = (fx.vx || 0) * (1 - 0.8 * dt);
            } else if (fx.type === 'heal_cross' || fx.type === 'blood_drip' || fx.type === 'snow_flake') {
                fx.x += (fx.vx || 0) * dt;
                fx.y += (fx.vy || 0) * dt;
                if (fx.type === 'blood_drip') fx.vy = (fx.vy || 0) + 90 * dt;
                if (fx.type === 'snow_flake') fx.vx = (fx.vx || 0) * (1 - 0.4 * dt);
            } else if (fx.type === 'smoke') {
                fx.y -= 12 * dt;
                fx.radius = (fx.radius || 16) + 10 * dt;
            } else if (fx.type === 'knife_proj') {
                fx.x += (fx.vx || 0) * dt;
                fx.y += (fx.vy || 0) * dt;
                if (Math.abs(fx.vx || 0) + Math.abs(fx.vy || 0) > 8) {
                    fx.angle = Math.atan2(fx.vy, fx.vx);
                }
                fx.vx = (fx.vx || 0) * (1 - 0.15 * dt);
                fx.vy = (fx.vy || 0) * (1 - 0.15 * dt);
            } else if (fx.type === 'ice_shard') {
                fx.x += (fx.vx || 0) * dt;
                fx.y += (fx.vy || 0) * dt;
                fx.vx = (fx.vx || 0) * (1 - 0.35 * dt);
                fx.vy = (fx.vy || 0) * (1 - 0.35 * dt);
                if (fx.life < 80 && !fx.landed) {
                    fx.landed = true;
                    pendingFx.push({
                        type: 'hit_flash', x: fx.x, y: fx.y,
                        radius: 6, life: 120, maxLife: 120, skill: true
                    });
                }
            } else if (fx.type === 'meteor') {
                if (!fx.impacted && fx.maxLife && (fx.life / fx.maxLife) < 0.14) {
                    fx.impacted = true;
                    pendingFx.push({
                        type: 'hit_flash', x: fx.x, y: fx.y,
                        radius: (fx.radius || 48) * 0.45, life: 180, maxLife: 180, skill: true
                    });
                    pendingActions.push({
                        action: '__meteor_impact',
                        params: {
                            tx: fx.x, ty: fx.y,
                            color: fx.color, glow: fx.glow,
                            radius: fx.radius || 48,
                            element: 'meteor'
                        }
                    });
                }
            } else if (fx.type === 'arrow_aim_mark') {
                fx.phase = (fx.phase || 0) + dt * 4.2;
            } else if (fx.type === 'magic_circle' || fx.type === 'arcane_sigil') {
                fx.phase = (fx.phase || 0) + dt * (fx.spin || 1);
                if (fx.spinInner != null) {
                    fx.phaseInner = (fx.phaseInner || 0) + dt * fx.spinInner;
                }
            } else if (fx.type === 'rune_ring') {
                fx.orbitPhase = (fx.orbitPhase || 0) + dt * (fx.orbitSpeed || 2.15);
            } else if (fx.type === 'spell_tether') {
                fx.phase = (fx.phase || 0) + dt * 5;
            } else if (fx.type === 'zone_field') {
                fx.phase = (fx.phase || 0) + dt * 3.5;
                fx.spawnTimer = (fx.spawnTimer || 0) - dtMs;
                while (fx.spawnTimer <= 0 && fx.life > 0) {
                    fx.spawnTimer += fx.spawnInterval || 55;
                    pendingActions.push({ action: '__zone_particle', zone: fx, opts: { color: fx.color, glow: fx.glow } });
                }
            } else if (fx.type === 'orb') {
                fx.trailAcc = (fx.trailAcc || 0) + dtMs;
                const trailEvery = fx.element === 'fire' ? 24 : 32;
                if (fx.trailAcc >= trailEvery) {
                    fx.trailAcc = 0;
                    const prog = 1 - (fx.life / Math.max(1, fx.maxLife));
                    const px = fx.x0 + (fx.x1 - fx.x0) * prog;
                    const py = fx.y0 + (fx.y1 - fx.y0) * prog;
                    pendingFx.push({
                        type: 'particle', pixel: true,
                        x: px, y: py,
                        vx: (Math.random() - 0.5) * 28, vy: (Math.random() - 0.5) * 28,
                        color: fx.glow || fx.color, size: fx.element === 'fire' ? 3 : 2,
                        life: 300, maxLife: 340, skill: true
                    });
                    if (fx.element === 'fire') {
                        pendingFx.push({
                            type: 'particle', pixel: true,
                            x: px, y: py,
                            vx: (Math.random() - 0.5) * 18, vy: -10 - Math.random() * 20,
                            color: fx.color, size: 2,
                            life: 260, maxLife: 300, skill: true
                        });
                    }
                }
            }
            return fx.life > 0;
        });
        pendingActions.forEach((p) => {
            if (p.action === '__zone_particle') {
                spawnZoneParticle(battle, p.zone, p.opts);
            } else if (p.action === '__meteor_impact') {
                spawnRuneCollapse(battle, p.params.tx, p.params.ty, {
                    color: p.params.color, glow: p.params.glow,
                    element: p.params.element || 'meteor',
                    radius: p.params.radius * 0.85, life: 440
                });
                spawnHeavyImpact(battle, p.params.tx, p.params.ty, {
                    color: p.params.color, glow: p.params.glow,
                    radius: p.params.radius,
                    particles: 24, speed: 155, rays: 10
                });
            } else {
                executeDelayAction(battle, p.action, p.params);
            }
        });
        pendingFx.forEach((pf) => pushFx(battle, pf));
    }

    function beginVictoryFinale(battle) {
        if (battle.victoryPending || battle.finished) return;
        if (battle.skipFinale || battle.headless) {
            battle.finished = true;
            battle.victory = true;
            battle.victoryPending = false;
            battle.finale = null;
            return;
        }
        battle.victoryPending = true;
        battle.finale = {
            t: 0,
            phase: 'slowmo',
            slowmoMs: 900,
            celebrateMs: 2800,
            pulse: 0
        };
    }

    function tickVictoryFinale(battle, dtMs) {
        const f = battle.finale;
        if (!f) return true;
        f.t += dtMs;
        const units = (battle.allies || []).concat(battle.enemies || []);
        if (f.phase === 'slowmo') {
            tickFx(battle, dtMs * 0.16);
            units.forEach((u) => {
                if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - dtMs * 0.16);
            });
            if (f.t >= f.slowmoMs) {
                f.phase = 'celebrate';
                f.t = 0;
                f.pulse = 0;
                const cx = battle.finaleHit ? battle.finaleHit.x : (battle.origin.x + 200);
                const cy = battle.finaleHit ? battle.finaleHit.y : battle.origin.y;
                for (let i = 0; i < 24; i++) {
                    pushFx(battle, {
                        type: 'particle',
                        x: cx + (Math.random() * 80 - 40),
                        y: cy + (Math.random() * 40 - 20),
                        vx: (Math.random() - 0.5) * 60,
                        vy: -80 - Math.random() * 120,
                        color: i % 3 === 0 ? '#ffd76a' : (i % 3 === 1 ? '#8fd0a0' : '#fff8e0'),
                        size: 2 + Math.random() * 5,
                        life: 1200 + Math.floor(Math.random() * 800),
                        maxLife: 2000,
                        skill: true
                    });
                }
            }
            return true;
        }
        if (f.phase === 'celebrate') {
            f.pulse += dtMs;
            tickFx(battle, dtMs);
            if (f.t >= f.celebrateMs) {
                battle.finished = true;
                battle.victory = true;
                battle.victoryPending = false;
                battle.finale = null;
                return false;
            }
            return true;
        }
        return true;
    }

    function tickBattle(battle, dtMs) {
        if (battle.finished) {
            tickFx(battle, dtMs);
            return battle;
        }
        if (battle.victoryPending && battle.finale) {
            tickVictoryFinale(battle, dtMs);
            return battle;
        }

        let effectiveDt = dtMs;
        if (window.AscensionHub) {
            effectiveDt = window.AscensionHub.onTickBattle(battle, dtMs);
            if (effectiveDt === 0) {
                tickFx(battle, dtMs);
                if (window.JuiceVfx) window.JuiceVfx.tick(battle, dtMs);
                return battle;
            }
        }
        if (window.ZoneEcology && window.ZoneEcology.tickZoneBattle) {
            window.ZoneEcology.tickZoneBattle(battle, effectiveDt);
        }
        if (window.JuiceVfx) window.JuiceVfx.tick(battle, effectiveDt);

        const combat = battle.combat || {};
        const maxDur = (window.CombatPacing && window.CombatPacing.getMaxCombatDurationMs)
            ? window.CombatPacing.getMaxCombatDurationMs()
            : (combat.maxDurationMs || 90000);
        battle.elapsed += effectiveDt;

        const ECS = window.EnemyCompositionSystem;
        if (ECS && ECS.tickBattle) ECS.tickBattle(battle, effectiveDt);
        if (window.CombatEffectsBridge) window.CombatEffectsBridge.tickBattle(battle, effectiveDt);

        const enemyDt = battle.mutationReverse ? 0 : effectiveDt * (battle.enemyTimeScale != null ? battle.enemyTimeScale : 1);
        const step = combat.tickMs || 50;
        let left = effectiveDt;
        while (left > 0 && !battle.finished) {
            const slice = Math.min(step, left);
            const allyDt = slice * (battle.allyTimeScale != null ? battle.allyTimeScale : 1);
            battle.allies.forEach((u) => tickUnit(battle, u, battle.allies, battle.enemies, Math.min(slice, allyDt), battle.relicFx, combat));
            if (battle.mutationReverse) {
                battle.enemies.forEach((u) => {
                    if (u.playerControlled && u.alive) {
                        tickUnit(battle, u, battle.enemies, battle.allies, slice, battle.relicFx, combat);
                    }
                });
            } else if (enemyDt > 0) {
                battle.enemies.forEach((u) => tickUnit(battle, u, battle.allies, battle.enemies, Math.min(slice, enemyDt), battle.relicFx, combat));
            }
            left -= slice;

            if (!living(battle.enemies).length) {
                if (battle.mutationReverse) {
                    battle.finished = true;
                    battle.victory = false;
                } else {
                    beginVictoryFinale(battle);
                }
            } else if (!living(battle.allies).length) {
                if (battle.mutationReverse) {
                    beginVictoryFinale(battle);
                } else {
                    battle.finished = true;
                    battle.victory = false;
                }
            }
        }

        tickUnitVfxMoves(battle, dtMs);
        tickFx(battle, dtMs);
        if (battle.shake) {
            battle.shake = Math.max(0, battle.shake - dtMs * 0.018);
            if (battle.shake < 0.2) battle.shake = 0;
        }

        if (!battle.finished && battle.elapsed >= maxDur) {
            battle.finished = true;
            const ahp = living(battle.allies).reduce((s, u) => s + u.hp, 0);
            const ehp = living(battle.enemies).reduce((s, u) => s + u.hp, 0);
            battle.victory = ahp >= ehp;
        }
        return battle;
    }

    function syncHeroHpFromBattle(run, battle) {
        battle.allies.forEach((u) => {
            const h = window.RunStateSystem.findHero(run, u.heroId);
            if (!h) return;
            h.maxHp = u.maxHp;
            if (!u.alive || u.hp <= 0) {
                h.hp = 0;
            } else {
                h.hp = Math.max(1, Math.min(u.maxHp, Math.floor(u.hp)));
            }
        });
    }

    function drawFx(ctx, battle) {
        const list = battle.fx || [];

        function fillGlow(x, y, r, color, alpha) {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, color);
            g.addColorStop(0.35, color);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = alpha;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        function strokeArcSlash(x, y, angle, radius, color, glow, lw, alpha, span) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle || 0);
            const layers = glow ? [
                { col: glow, w: lw + 6, a: alpha * 0.35 },
                { col: color, w: lw, a: alpha * 0.95 },
                { col: '#fff', w: Math.max(2, lw * 0.35), a: alpha * 0.55 }
            ] : [{ col: color, w: lw, a: alpha }];
            ctx.globalCompositeOperation = 'lighter';
            layers.forEach((layer) => {
                ctx.globalAlpha = layer.a;
                ctx.strokeStyle = layer.col;
                ctx.lineWidth = layer.w;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(0, 0, radius, -span, span);
                ctx.stroke();
            });
            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }

        function drawMagicCircle(fx, t) {
            const cx = fx.x;
            const cy = fx.y;
            const r = fx.radius || 40;
            const inner = fx.innerRadius || r * 0.58;
            const appear = fx.fadeIn ? Math.min(1, (1 - t) * 2.2 + 0.15) : 1;
            const alpha = t * appear;
            const outerAng = fx.phase || 0;
            const innerAng = fx.phaseInner || 0;
            const squash = fx.ground !== false ? 0.4 : 1;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1, squash);
            ctx.globalAlpha = alpha * 0.14;
            ctx.fillStyle = fx.glow || fx.color || '#6688ff';
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = alpha * 0.8;
            ctx.strokeStyle = fx.color || '#6688ff';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            for (let ti = 0; ti < 8; ti++) {
                const a = outerAng + (Math.PI * 2 * ti) / 8;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * (r - 5), Math.sin(a) * (r - 5));
                ctx.lineTo(Math.cos(a) * (r + 5), Math.sin(a) * (r + 5));
                ctx.stroke();
            }
            ctx.strokeStyle = fx.glow || fx.color || '#c0d8ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, inner, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = alpha * 0.38;
            for (let ri = 0; ri < 6; ri++) {
                const a = innerAng + (Math.PI * 2 * ri) / 6;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * inner * 0.25, Math.sin(a) * inner * 0.25);
                ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
                ctx.stroke();
            }
            ctx.globalAlpha = alpha * 0.75;
            ctx.fillStyle = fx.glow || '#fff';
            for (let ni = 0; ni < 4; ni++) {
                const a = outerAng + (Math.PI * 2 * ni) / 4 + Math.PI / 4;
                ctx.fillRect(Math.floor(Math.cos(a) * r * 0.78) - 2, Math.floor(Math.sin(a) * r * 0.78) - 2, 4, 4);
            }
            ctx.restore();
            ctx.globalAlpha = 1;
        }

        function drawRuneGlyph(ctx, px, py, glyph, color, glow, alpha, rot) {
            const sz = 5;
            ctx.save();
            ctx.translate(px, py);
            if (rot) ctx.rotate(rot);
            ctx.globalAlpha = alpha;
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = glow || color || '#fff';
            ctx.strokeStyle = color || '#aaf';
            ctx.lineWidth = 1.5;
            switch (glyph) {
                case 'diamond':
                    ctx.beginPath();
                    ctx.moveTo(0, -sz);
                    ctx.lineTo(sz * 0.78, 0);
                    ctx.lineTo(0, sz);
                    ctx.lineTo(-sz * 0.78, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.stroke();
                    break;
                case 'tri':
                    ctx.beginPath();
                    ctx.moveTo(0, -sz);
                    ctx.lineTo(sz * 0.9, sz * 0.62);
                    ctx.lineTo(-sz * 0.9, sz * 0.62);
                    ctx.closePath();
                    ctx.fill();
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.stroke();
                    break;
                case 'cross':
                    ctx.fillRect(-sz, -1, sz * 2, 2);
                    ctx.fillRect(-1, -sz, 2, sz * 2);
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.fillStyle = color || '#aaf';
                    ctx.fillRect(-sz + 1, -1, sz * 2 - 2, 2);
                    ctx.fillRect(-1, -sz + 1, 2, sz * 2 - 2);
                    break;
                case 'bar':
                    ctx.fillRect(-1, -sz, 2, sz * 2);
                    ctx.fillRect(-sz * 0.55, -1, sz * 1.1, 2);
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.fillStyle = color || '#aaf';
                    ctx.fillRect(-1, -sz + 1, 2, sz * 2 - 2);
                    break;
                case 'node':
                default:
                    ctx.beginPath();
                    ctx.arc(0, 0, sz * 0.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.beginPath();
                    ctx.arc(0, 0, sz * 0.85, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
            }
            ctx.restore();
        }

        function drawRuneRing(fx, t) {
            const runes = fx.runes || ['diamond', 'cross', 'tri', 'node'];
            const n = runes.length;
            const r = fx.radius || 30;
            const phase = fx.orbitPhase || 0;
            const alpha = t;
            ctx.globalAlpha = alpha * 0.38;
            ctx.strokeStyle = fx.glow || fx.color || '#c0d8ff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i <= n; i++) {
                const a = phase + (Math.PI * 2 * (i % n)) / n - Math.PI / 2;
                const px = fx.x + Math.cos(a) * r;
                const py = fx.y + Math.sin(a) * r * 0.52;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
            for (let i = 0; i < n; i++) {
                const a = phase + (Math.PI * 2 * i) / n - Math.PI / 2;
                const px = fx.x + Math.cos(a) * r;
                const py = fx.y + Math.sin(a) * r * 0.52;
                const ga = alpha * (0.62 + Math.sin(phase * 3 + i) * 0.28);
                drawRuneGlyph(ctx, px, py, runes[i], fx.color, fx.glow, ga, a + Math.PI / 2);
            }
            ctx.globalAlpha = 1;
        }

        function drawArcaneSigil(fx, t) {
            const r = (fx.radius || 20) * (0.82 + (1 - t) * 0.18);
            const spin = fx.phase || 0;
            const alpha = t;
            ctx.save();
            ctx.translate(fx.x, fx.y);
            ctx.rotate(spin);
            ctx.globalAlpha = alpha * 0.42;
            fillGlow(0, 0, r * 1.15, fx.glow || fx.color, 0.55);
            ctx.globalAlpha = alpha * 0.9;
            ctx.strokeStyle = fx.color || '#6688ff';
            ctx.lineWidth = 2;
            for (let tri = 0; tri < 2; tri++) {
                ctx.beginPath();
                for (let i = 0; i <= 3; i++) {
                    const a = (Math.PI * 2 * i) / 3 - Math.PI / 2 + tri * Math.PI / 3;
                    const px = Math.cos(a) * r;
                    const py = Math.sin(a) * r;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
            }
            ctx.strokeStyle = fx.glow || '#c0d8ff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = fx.glow || '#fff';
            ctx.globalAlpha = alpha * 0.75;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            ctx.globalAlpha = 1;
        }

        function drawSpellTether(fx, t) {
            const phase = fx.phase || 0;
            const x0 = fx.x0;
            const y0 = fx.y0;
            const x1 = fx.x1;
            const y1 = fx.y1;
            const icy = !!fx.icy;
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = icy ? (fx.glow || '#c8f0ff') : (fx.glow || fx.color || '#c0d8ff');
            ctx.globalAlpha = t * (icy ? 0.42 : 0.35);
            ctx.lineWidth = icy ? 8 : 10;
            ctx.setLineDash(icy ? [6, 7] : [10, 8]);
            ctx.lineDashOffset = -phase * (icy ? 14 : 18);
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = fx.color || (icy ? '#66bbee' : '#6688ff');
            ctx.globalAlpha = t * 0.75;
            ctx.lineWidth = icy ? 2.5 : 2;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
            for (let mi = 1; mi < (icy ? 5 : 4); mi++) {
                const p = mi / (icy ? 5 : 4);
                const mx = x0 + (x1 - x0) * p;
                const my = y0 + (y1 - y0) * p;
                ctx.globalAlpha = t * (0.45 + Math.sin(phase + mi) * 0.2);
                if (icy) {
                    ctx.strokeStyle = fx.glow || '#e8ffff';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(mx - 3, my);
                    ctx.lineTo(mx, my - 4);
                    ctx.lineTo(mx + 3, my);
                    ctx.stroke();
                } else {
                    ctx.fillStyle = fx.glow || '#fff';
                    ctx.fillRect(Math.floor(mx) - 2, Math.floor(my) - 2, 4, 4);
                }
            }
            ctx.globalAlpha = 1;
        }

        function drawRuneCollapse(fx, t) {
            const runes = fx.runes || ['diamond', 'cross', 'tri', 'node'];
            const n = runes.length;
            const r0 = fx.radius || 36;
            const collapse = 1 - t;
            const r = r0 * collapse;
            const alpha = t;
            drawMagicCircle(Object.assign({}, fx, { radius: r0 * (0.55 + collapse * 0.45), fadeIn: false }), t);
            for (let i = 0; i < n; i++) {
                const a = (Math.PI * 2 * i) / n - Math.PI / 2;
                const px = fx.x + Math.cos(a) * r;
                const py = fx.y + Math.sin(a) * r * 0.5;
                const ga = alpha * (0.55 + collapse * 0.4);
                drawRuneGlyph(ctx, px, py, runes[i], fx.color, fx.glow, ga, a + Math.PI / 2);
            }
            if (t < 0.35) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = (0.35 - t) * 2.2;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r0 * 0.25, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.globalAlpha = 1;
        }

        /** 箭矢轮廓（尖端朝 +X） */
        function drawArrowShape(ctx, opts) {
            opts = opts || {};
            const shaft = opts.shaft || 14;
            const head = opts.head || 7;
            const tail = opts.tail || 6;
            const sw = opts.shaftW || 2;
            const color = opts.color || '#7dce6a';
            const glow = opts.glow || color;
            const alpha = opts.alpha != null ? opts.alpha : 1;
            if (opts.glowPass) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * 0.42;
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.moveTo(shaft + head + 1, 0);
                ctx.lineTo(shaft - 2, -(sw + 2));
                ctx.lineTo(-tail - 2, -(sw + 1));
                ctx.lineTo(-tail - 2, sw + 1);
                ctx.lineTo(shaft - 2, sw + 2);
                ctx.closePath();
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#5a4030';
            ctx.fillRect(-tail, -1, shaft + tail + 1, 2);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(shaft + head, 0);
            ctx.lineTo(shaft - 1, -(sw + 1));
            ctx.lineTo(shaft - 1, sw + 1);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.moveTo(-tail, 0);
            ctx.lineTo(-tail - 4, -(sw + 2));
            ctx.lineTo(-1, -1);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-tail, 0);
            ctx.lineTo(-tail - 4, sw + 2);
            ctx.lineTo(-1, 1);
            ctx.closePath();
            ctx.fill();
        }

        /** 飞刀/匕首轮廓（刀尖朝 +X） */
        function drawKnifeShape(ctx, opts) {
            opts = opts || {};
            const blade = opts.blade || 13;
            const bw = opts.bladeW || 3;
            const handle = opts.handle || 5;
            const color = opts.color || '#c0c8d8';
            const glow = opts.glow || '#fff';
            const alpha = opts.alpha != null ? opts.alpha : 1;
            if (opts.glowPass) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * 0.48;
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.moveTo(blade + 2, 0);
                ctx.lineTo(blade * 0.2, -(bw + 2));
                ctx.lineTo(-handle - 1, -(bw + 1));
                ctx.lineTo(-handle - 1, bw + 1);
                ctx.lineTo(blade * 0.2, bw + 2);
                ctx.closePath();
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(blade + 2, 0);
            ctx.lineTo(blade * 0.22, -bw);
            ctx.lineTo(-1, -bw * 0.65);
            ctx.lineTo(-1, bw * 0.65);
            ctx.lineTo(blade * 0.22, bw);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = glow;
            ctx.globalAlpha = alpha * 0.85;
            ctx.fillRect(Math.floor(blade * 0.25), -1, Math.floor(blade * 0.55), 2);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#777';
            ctx.fillRect(-2, -bw - 1, 2, bw * 2 + 2);
            ctx.fillStyle = '#4a3828';
            ctx.fillRect(-handle - 2, -Math.ceil(bw * 0.55), handle + 1, Math.ceil(bw * 1.1));
            ctx.fillStyle = '#6a5040';
            ctx.fillRect(-handle, -1, handle - 1, 2);
        }

        for (let i = 0; i < list.length; i++) {
            const fx = list[i];
            const t = fx.maxLife ? (fx.life / fx.maxLife) : 1;
            const skillFx = !!fx.skill;
            if (fx.type === 'bolt') {
                const w = fx.width || 2.5;
                const mageBolt = !!fx.mage;
                if (skillFx || mageBolt) {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.strokeStyle = fx.glow || fx.color || '#ffcc66';
                    ctx.globalAlpha = t * (mageBolt ? 0.65 : 0.45);
                    ctx.lineWidth = w + (mageBolt ? 12 : 8);
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(fx.x0, fx.y0);
                    ctx.lineTo(fx.x1, fx.y1);
                    ctx.stroke();
                }
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = fx.color || '#ffcc66';
                ctx.globalAlpha = Math.min(1, t * 1.5);
                ctx.lineWidth = w;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(fx.x0, fx.y0);
                ctx.lineTo(fx.x1, fx.y1);
                ctx.stroke();
                if ((mageBolt || skillFx) && t < 0.35) {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.fillStyle = '#ffffff';
                    ctx.globalAlpha = (0.35 - t) * 2.5;
                    ctx.beginPath();
                    ctx.arc(fx.x1, fx.y1, 8 + (0.35 - t) * 20, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalCompositeOperation = 'source-over';
                }
                ctx.lineCap = 'butt';
                ctx.globalAlpha = 1;
            } else if (fx.type === 'slash') {
                const r = fx.heavy ? (fx.aoe ? 42 : 32) : (fx.skill ? (fx.aoe ? 36 : 26) : (fx.aoe ? 28 : 18));
                const span = fx.heavy ? 1.05 : 0.9;
                strokeArcSlash(fx.x, fx.y, fx.angle, r, fx.color || '#ffe0a0', fx.glow, fx.heavy ? 7 : 5, t, span);
            } else if (fx.type === 'melee_arc') {
                const r = fx.heavy ? (fx.wide ? 50 : 40) : 32;
                const span = fx.wide ? 1.35 : (fx.heavy ? 1.15 : 0.95);
                strokeArcSlash(fx.x, fx.y, fx.angle, r, fx.color || '#ffe0a0', fx.glow, fx.heavy ? 9 : 6, t, span);
                strokeArcSlash(fx.x, fx.y, (fx.angle || 0) + 0.55, r * 0.78, fx.glow || fx.color, '#fff8e0', fx.heavy ? 5 : 3.5, t * 0.75, span * 0.7);
                if (fx.glow) {
                    ctx.globalAlpha = t * 0.42;
                    ctx.strokeStyle = fx.glow;
                    ctx.lineWidth = 14;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.arc(fx.x, fx.y, r * 0.85, (fx.angle || 0) - span, (fx.angle || 0) + span);
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }
            } else if (fx.type === 'melee_thrust') {
                ctx.globalCompositeOperation = 'lighter';
                ctx.strokeStyle = fx.glow || fx.color;
                ctx.globalAlpha = t * 0.55;
                ctx.lineWidth = 14;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(fx.x0, fx.y0);
                ctx.lineTo(fx.x1, fx.y1);
                ctx.stroke();
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = fx.color || '#fff';
                ctx.globalAlpha = t;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(fx.x0, fx.y0);
                ctx.lineTo(fx.x1, fx.y1);
                ctx.stroke();
                ctx.fillStyle = '#fff';
                ctx.fillRect(Math.floor(fx.x1) - 3, Math.floor(fx.y1) - 3, 6, 6);
                if (t > 0.72) {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.fillStyle = fx.glow || '#fff';
                    ctx.globalAlpha = (t - 0.72) * 2.2;
                    ctx.beginPath();
                    ctx.arc(fx.x1, fx.y1, 10 + (1 - t) * 8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalCompositeOperation = 'source-over';
                }
                ctx.globalAlpha = 1;
            } else if (fx.type === 'rip_line') {
                const len = (fx.length || 16) * (0.6 + t * 0.5);
                const a = fx.angle || 0;
                ctx.globalAlpha = t;
                ctx.strokeStyle = fx.glow || fx.color;
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(fx.x, fx.y);
                ctx.lineTo(fx.x + Math.cos(a) * len, fx.y + Math.sin(a) * len);
                ctx.stroke();
                ctx.strokeStyle = fx.color || '#c44';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(fx.x + Math.cos(a) * 2, fx.y + Math.sin(a) * 2);
                ctx.lineTo(fx.x + Math.cos(a) * len * 0.85, fx.y + Math.sin(a) * len * 0.85);
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'knife_proj') {
                const a = fx.angle || 0;
                const speed = Math.sqrt((fx.vx || 0) * (fx.vx || 0) + (fx.vy || 0) * (fx.vy || 0));
                const scale = 0.85 + Math.min(0.35, speed / 280);
                ctx.save();
                ctx.translate(fx.x, fx.y);
                ctx.rotate(a);
                ctx.scale(scale, scale);
                drawKnifeShape(ctx, {
                    blade: 14, bw: 3, handle: 5,
                    color: fx.color, glow: fx.glow,
                    alpha: t, glowPass: true
                });
                ctx.restore();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'afterimage') {
                const clone = !!fx.clone;
                const r = clone ? 22 : 18;
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = t * (clone ? 0.38 : 0.28);
                ctx.fillStyle = fx.glow || fx.color || '#cc88ff';
                ctx.beginPath();
                ctx.ellipse(fx.x, fx.y, r * 0.9, r * 1.15, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = t * (clone ? 0.55 : 0.42);
                ctx.fillStyle = fx.color || '#7744aa';
                // 人形剪影：头 + 身
                ctx.beginPath();
                ctx.ellipse(fx.x, fx.y - r * 0.55, r * 0.28, r * 0.32, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(fx.x, fx.y + r * 0.15, r * 0.42, r * 0.7, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = t * 0.7;
                ctx.strokeStyle = fx.glow || '#cc88ff';
                ctx.lineWidth = clone ? 2.5 : 2;
                ctx.beginPath();
                ctx.ellipse(fx.x, fx.y, r * 0.55, r * 0.95, 0, 0, Math.PI * 2);
                ctx.stroke();
                if (clone && t > 0.55) {
                    ctx.globalAlpha = (t - 0.55) * 1.4;
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            } else if (fx.type === 'arrow_proj') {
                const prog = 1 - t;
                const x = fx.x0 + (fx.x1 - fx.x0) * prog;
                const y = fx.y0 + (fx.y1 - fx.y0) * prog;
                const a = Math.atan2(fx.y1 - fx.y0, fx.x1 - fx.x0);
                const w = fx.width || 4;
                const scale = 0.75 + w * 0.14;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(a);
                ctx.scale(scale, scale);
                drawArrowShape(ctx, {
                    shaft: 14, head: 7, tail: 6, shaftW: 2,
                    color: fx.color, glow: fx.glow,
                    alpha: t, glowPass: true
                });
                ctx.restore();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'arrow_aim_mark') {
                const r = fx.radius || 36;
                const alpha = Math.min(1, fx.life / Math.max(1, fx.maxLife));
                const phase = fx.phase || 0;
                const iv = fx.intensity || 1;
                const ivBoost = Math.max(0, Math.min(1, (iv - 0.55) / (2.6 - 0.55)));
                if (fx.rich) {
                    const pulse = 0.85 + Math.sin(phase * 1.4) * 0.12;
                    fillGlow(fx.x, fx.y, r * pulse, fx.glow || fx.color || '#c8f0a8', alpha * (0.14 + ivBoost * 0.12));
                    ctx.globalAlpha = alpha * (0.24 + ivBoost * 0.12);
                    ctx.strokeStyle = fx.glow || fx.color || '#c8f0a8';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([5, 8]);
                    ctx.beginPath();
                    ctx.arc(fx.x, fx.y, r * pulse * 1.08, phase * 0.35, phase * 0.35 + Math.PI * 1.35);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    const streaks = 4 + Math.round(ivBoost * 5);
                    for (let si = 0; si < streaks; si++) {
                        const sx = fx.x + ((si - (streaks - 1) / 2) / Math.max(1, streaks - 1)) * r * 0.72;
                        const sy = fx.y - r * 0.42 - ((phase * 28 + si * 17) % 28);
                        ctx.globalAlpha = alpha * (0.32 + ivBoost * 0.14);
                        ctx.strokeStyle = fx.color || '#7dce6a';
                        ctx.lineWidth = 1.2;
                        ctx.beginPath();
                        ctx.moveTo(sx, sy);
                        ctx.lineTo(sx + 1.5, sy + 10);
                        ctx.stroke();
                    }
                }
                ctx.globalAlpha = alpha * (fx.rich ? 0.38 : 0.32);
                ctx.strokeStyle = fx.color || '#7dce6a';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 6]);
                ctx.beginPath();
                ctx.ellipse(fx.x, fx.y, r, r * 0.28, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = alpha * 0.42;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(fx.x - 5, fx.y);
                ctx.lineTo(fx.x + 5, fx.y);
                ctx.moveTo(fx.x, fx.y - 3);
                ctx.lineTo(fx.x, fx.y + 3);
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'arrow_salvo_mark') {
                const r = fx.radius || 30;
                const alpha = Math.min(1, fx.life / Math.max(1, fx.maxLife));
                ctx.globalAlpha = alpha * 0.48;
                ctx.strokeStyle = fx.color || '#7ec868';
                ctx.lineWidth = 1.5;
                for (let i = -1; i <= 1; i++) {
                    ctx.beginPath();
                    ctx.moveTo(fx.x - r * 0.85, fx.y + i * 12);
                    ctx.lineTo(fx.x, fx.y + i * 4);
                    ctx.lineTo(fx.x + r * 0.55, fx.y + i * 2);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            } else if (fx.type === 'zone_field') {
                const r = (fx.radius || 50) * (1 + Math.sin(fx.phase || 0) * 0.04);
                const alpha = Math.min(1, fx.life / Math.max(1, fx.maxLife));
                if (fx.light && fx.subType === 'arrow_rain') {
                    const iv = fx.intensity || 1;
                    const ivBoost = Math.max(0, Math.min(1, (iv - 0.55) / (2.6 - 0.55)));
                    if (fx.rich) {
                        const pulse = 0.9 + Math.sin((fx.phase || 0) * 1.2) * 0.08;
                        fillGlow(fx.x, fx.y, r * pulse, fx.glow || fx.color || '#c8f0a8', alpha * (0.12 + ivBoost * 0.1));
                        ctx.globalAlpha = alpha * (0.22 + ivBoost * 0.1);
                        ctx.strokeStyle = fx.glow || fx.color || '#c8f0a8';
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([4, 6]);
                        ctx.beginPath();
                        ctx.arc(fx.x, fx.y, r * pulse * 1.06, (fx.phase || 0) * 0.28, (fx.phase || 0) * 0.28 + Math.PI);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                    ctx.globalAlpha = alpha * (fx.rich ? 0.28 : 0.22);
                    ctx.strokeStyle = fx.color || '#7dce6a';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([4, 7]);
                    ctx.beginPath();
                    ctx.ellipse(fx.x, fx.y, r, r * 0.32, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                } else {
                    ctx.globalAlpha = alpha * 0.28;
                    fillGlow(fx.x, fx.y, r, fx.glow || fx.color || '#88f', 0.45);
                    ctx.strokeStyle = fx.color || '#8f8';
                    ctx.globalAlpha = alpha * 0.65;
                    ctx.lineWidth = 2;
                    ctx.setLineDash([6, 5]);
                    ctx.beginPath();
                    ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    if (fx.subType === 'arrow_rain') {
                        ctx.globalAlpha = alpha * 0.35;
                        ctx.fillStyle = fx.color || '#7dce6a';
                        ctx.font = '9px monospace';
                        ctx.textAlign = 'center';
                        ctx.fillText('↓ 箭雨', fx.x, fx.y - r - 6);
                        ctx.textAlign = 'left';
                    } else if (fx.subType === 'blizzard') {
                        ctx.fillStyle = fx.glow || '#e8ffff';
                        ctx.fillText('❄ 暴风雪', fx.x, fx.y - r - 6);
                        ctx.globalAlpha = alpha * 0.22;
                        drawMagicCircle(Object.assign({}, fx, {
                            radius: r * 0.82, innerRadius: r * 0.48,
                            color: fx.color, glow: fx.glow,
                            phase: fx.phase || 0, phaseInner: -(fx.phase || 0) * 0.7,
                            fadeIn: false, ground: true
                        }), alpha);
                    } else if (fx.subType === 'smoke') {
                        ctx.fillStyle = fx.glow || '#c0c8d0';
                        ctx.fillText('☁ 烟雾', fx.x, fx.y - r - 6);
                    }
                }
                ctx.globalAlpha = 1;
            } else if (fx.type === 'falling_arrow') {
                const a = fx.angle != null ? fx.angle : Math.PI / 2;
                const iv = fx.intensity || 1;
                ctx.save();
                ctx.translate(fx.x, fx.y);
                ctx.rotate(a);
                drawArrowShape(ctx, {
                    shaft: fx.rich ? 10 + (iv - 1) * 1.5 : (fx.light ? 9 : 12),
                    head: fx.rich ? 5.5 + (iv - 1) * 0.4 : (fx.light ? 5 : 6),
                    tail: fx.rich ? 4.5 : (fx.light ? 4 : 5),
                    shaftW: fx.rich ? 1.8 : (fx.light ? 1.5 : 2),
                    color: fx.color, glow: fx.glow,
                    alpha: fx.rich ? Math.min(1, t * (0.78 + (iv - 1) * 0.08)) : (fx.light ? t * 0.72 : t),
                    glowPass: fx.rich || !fx.light
                });
                ctx.restore();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'burst') {
                const r = (fx.skill ? 14 : 8) + (1 - t) * (fx.skill ? 40 : 22);
                fillGlow(fx.x, fx.y, r, fx.color || '#fff', t * (fx.skill ? 0.75 : 0.55));
                ctx.strokeStyle = fx.color || '#fff';
                ctx.globalAlpha = t * 0.85;
                ctx.lineWidth = fx.skill ? 3 : 2;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r * 0.72, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'cast') {
                const r = 22 + (1 - t) * 28;
                fillGlow(fx.x, fx.y, r, fx.glow || fx.color || '#88ccff', t * 0.65);
                ctx.strokeStyle = fx.color || '#88ccff';
                ctx.globalAlpha = t * 0.9;
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, 16 + (1 - t) * 18, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, 8 + (1 - t) * 10, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'magic_circle') {
                drawMagicCircle(fx, t);
            } else if (fx.type === 'rune_ring') {
                drawRuneRing(fx, t);
            } else if (fx.type === 'arcane_sigil') {
                drawArcaneSigil(fx, t);
            } else if (fx.type === 'spell_tether') {
                drawSpellTether(fx, t);
            } else if (fx.type === 'rune_collapse') {
                drawRuneCollapse(fx, t);
            } else if (fx.type === 'mage_charge') {
                const r = (fx.radius || 24) * (0.65 + (1 - t) * 0.55);
                const spin = (1 - t) * Math.PI * 4;
                ctx.globalCompositeOperation = 'lighter';
                fillGlow(fx.x, fx.y, r * 1.35, fx.glow || fx.color || '#88ccff', t * 0.75);
                for (let mi = 0; mi < 8; mi++) {
                    const a = spin + (Math.PI * 2 * mi) / 8;
                    ctx.strokeStyle = mi % 2 ? (fx.glow || '#c0d8ff') : (fx.color || '#6688ff');
                    ctx.globalAlpha = t * 0.9;
                    ctx.lineWidth = mi % 2 ? 3.5 : 2.5;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(fx.x + Math.cos(a) * r * 0.2, fx.y + Math.sin(a) * r * 0.2);
                    ctx.lineTo(fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r);
                    ctx.stroke();
                }
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = t * 0.55;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r * 0.22, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            } else if (fx.type === 'aoe') {
                const heavy = !!fx.heavy;
                const r = (fx.radius || 40) * (0.45 + (1 - t) * (heavy ? 1.05 : 0.85));
                fillGlow(fx.x, fx.y, r, fx.glow || fx.color || 'rgba(120,200,255,0.8)', t * (heavy ? 0.55 : 0.35));
                if (heavy) {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.fillStyle = fx.glow || fx.color || '#aaf';
                    ctx.globalAlpha = t * 0.22;
                    ctx.beginPath();
                    ctx.arc(fx.x, fx.y, r * 0.72, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalCompositeOperation = 'source-over';
                }
                ctx.strokeStyle = fx.color || 'rgba(120,200,255,0.8)';
                ctx.globalAlpha = t * 0.85;
                ctx.lineWidth = skillFx ? (heavy ? 4.5 : 3.5) : 3;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'ice_shard') {
                const a = fx.angle || 0;
                const len = 10 + t * 8;
                ctx.save();
                ctx.translate(fx.x, fx.y);
                ctx.rotate(a);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = t * 0.5;
                ctx.fillStyle = fx.glow || '#e8ffff';
                ctx.fillRect(-len - 2, -4, len * 2 + 4, 8);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = t;
                ctx.fillStyle = fx.color || '#88ccee';
                ctx.fillRect(-len, -2, len * 2, 4);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(-2, -1, 4, 2);
                ctx.restore();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'impact') {
                const heavy = !!fx.heavy;
                const r = (fx.radius || 28) * (0.35 + (1 - t) * (heavy ? 1.35 : 1.15));
                fillGlow(fx.x, fx.y, r * 1.1, fx.color || '#fff', t * (skillFx ? (heavy ? 0.85 : 0.7) : 0.5));
                if (heavy && t > 0.55) {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.fillStyle = '#ffffff';
                    ctx.globalAlpha = (t - 0.55) * 1.6;
                    ctx.beginPath();
                    ctx.arc(fx.x, fx.y, r * 0.35, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalCompositeOperation = 'source-over';
                }
                ctx.globalAlpha = t;
                ctx.strokeStyle = fx.color || '#fff';
                ctx.lineWidth = skillFx ? (heavy ? 4 : 3) : 2.5;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r * 0.75, 0, Math.PI * 2);
                ctx.stroke();
                if (heavy) {
                    ctx.globalAlpha = t * 0.45;
                    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(fx.x, fx.y, r * 0.42, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            } else if (fx.type === 'hit_flash') {
                const r = (fx.radius || 22) * (0.85 + (1 - t) * 0.65);
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = t * 0.9;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,240,200,0.55)';
                ctx.globalAlpha = t * 0.45;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r * 0.55, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            } else if (fx.type === 'shock_crack') {
                const rays = fx.rays || 6;
                const r = (fx.radius || 32) * (0.45 + (1 - t) * 1.25);
                ctx.globalCompositeOperation = 'lighter';
                for (let ri = 0; ri < rays; ri++) {
                    const a = (Math.PI * 2 * ri) / rays + (fx.seed || 0) + t * 0.25;
                    const jag = 0.12 + (ri % 2) * 0.1;
                    const mx = fx.x + Math.cos(a + jag) * r * 0.55;
                    const my = fx.y + Math.sin(a + jag) * r * 0.55;
                    ctx.strokeStyle = ri % 2 ? (fx.glow || '#fff') : (fx.color || '#fff');
                    ctx.globalAlpha = t * 0.8;
                    ctx.lineWidth = ri % 3 === 0 ? 3.5 : 2.5;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(fx.x, fx.y);
                    ctx.lineTo(fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r);
                    ctx.lineTo(mx, my);
                    ctx.stroke();
                }
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            } else if (fx.type === 'ring') {
                const r = (fx.radius || 24) * (0.45 + (1 - t) * 1.25);
                ctx.strokeStyle = fx.color || '#fff';
                ctx.globalAlpha = t * 0.9;
                ctx.lineWidth = skillFx ? 3 : 2.5;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
                ctx.stroke();
                if (skillFx) {
                    ctx.globalAlpha = t * 0.35;
                    fillGlow(fx.x, fx.y, r * 0.55, fx.color || '#fff', 0.5);
                }
                ctx.globalAlpha = 1;
            } else if (fx.type === 'wave') {
                const rings = fx.rings || 2;
                const icy = !!fx.icy;
                ctx.globalCompositeOperation = 'lighter';
                for (let ri = 0; ri < rings; ri++) {
                    const prog = Math.min(1, (1 - t) + ri * 0.16);
                    const r = (fx.radius || 40) * prog;
                    ctx.strokeStyle = ri % 2 ? (fx.glow || fx.color || '#fff') : (fx.color || '#fff');
                    ctx.globalAlpha = Math.max(0, t - ri * 0.12) * (icy ? 0.9 : 0.75);
                    ctx.lineWidth = (icy ? 4.5 : 3.5) - ri * 0.45;
                    ctx.beginPath();
                    ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
                    ctx.stroke();
                }
                if (icy && t > 0.4) {
                    ctx.fillStyle = fx.glow || '#d0f0ff';
                    ctx.globalAlpha = (t - 0.4) * 0.25;
                    ctx.beginPath();
                    ctx.arc(fx.x, fx.y, (fx.radius || 40) * 0.55 * (1 - t * 0.3), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            } else if (fx.type === 'dash') {
                ctx.globalCompositeOperation = 'lighter';
                ctx.strokeStyle = fx.color || '#fff';
                ctx.globalAlpha = t * (skillFx ? 0.55 : 0.35);
                ctx.lineWidth = (fx.width || 6) + 8;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(fx.x0, fx.y0);
                ctx.lineTo(fx.x1, fx.y1);
                ctx.stroke();
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = fx.color || '#fff';
                ctx.globalAlpha = t * 0.95;
                ctx.lineWidth = fx.width || 6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(fx.x0, fx.y0);
                ctx.lineTo(fx.x1, fx.y1);
                ctx.stroke();
                ctx.lineCap = 'butt';
                ctx.globalAlpha = 1;
            } else if (fx.type === 'orb') {
                const prog = 1 - t;
                const x = fx.x0 + (fx.x1 - fx.x0) * prog;
                const y = fx.y0 + (fx.y1 - fx.y0) * prog;
                const r = fx.radius || 8;
                const fire = fx.element === 'fire';
                const shadow = fx.element === 'shadow';
                fillGlow(x, y, r + (fire ? 22 : 16), fx.glow || fx.color || '#fff', Math.min(1, t * 1.2) * (fire ? 0.85 : 0.7));
                ctx.globalAlpha = Math.min(1, t * 1.4);
                ctx.fillStyle = fx.glow || fx.color || '#fff';
                ctx.beginPath();
                ctx.arc(x, y, r + (fire ? 7 : 5), 0, Math.PI * 2);
                ctx.fill();
                if (fire) {
                    ctx.fillStyle = fx.color || '#ff6622';
                    ctx.fillRect(Math.floor(x - r), Math.floor(y - r * 0.75), Math.floor(r * 2), Math.floor(r * 1.5));
                    ctx.fillStyle = '#fff8a0';
                    ctx.fillRect(Math.floor(x - r * 0.35), Math.floor(y - r * 0.45), Math.floor(r * 0.7), Math.floor(r * 0.7));
                } else if (shadow) {
                    ctx.fillStyle = fx.color || '#8844cc';
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.fillStyle = fx.glow || '#d0a0ff';
                    ctx.globalAlpha = t * 0.45;
                    ctx.beginPath();
                    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalCompositeOperation = 'source-over';
                } else {
                    ctx.fillStyle = fx.color || '#ff8844';
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = t * 0.85;
                ctx.beginPath();
                ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.35, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'rain') {
                const prog = 1 - t;
                const y = fx.y0 + (fx.y1 - fx.y0) * prog;
                ctx.globalCompositeOperation = 'lighter';
                ctx.strokeStyle = fx.color || '#8f8';
                ctx.globalAlpha = t * 0.45;
                ctx.lineWidth = (fx.width || 2) + 4;
                ctx.beginPath();
                ctx.moveTo(fx.x, y - 18);
                ctx.lineTo(fx.x, y + 6);
                ctx.stroke();
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = t;
                ctx.lineWidth = fx.width || 2;
                ctx.beginPath();
                ctx.moveTo(fx.x, y - 18);
                ctx.lineTo(fx.x, y + 6);
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'mark') {
                const r = fx.radius || 20;
                ctx.strokeStyle = fx.color || '#f66';
                ctx.globalAlpha = t;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r * (0.65 + (1 - t) * 0.45), 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(fx.x - r, fx.y);
                ctx.lineTo(fx.x + r, fx.y);
                ctx.moveTo(fx.x, fx.y - r);
                ctx.lineTo(fx.x, fx.y + r);
                ctx.stroke();
                fillGlow(fx.x, fx.y, r * 0.5, fx.color || '#f66', t * 0.35);
                ctx.globalAlpha = 1;
            } else if (fx.type === 'star') {
                const heavy = !!fx.heavy;
                const r = (fx.radius || 22) * (0.55 + (1 - t) * (heavy ? 1.1 : 0.9));
                ctx.globalCompositeOperation = 'lighter';
                ctx.strokeStyle = fx.color || '#aaf';
                ctx.globalAlpha = t;
                ctx.lineWidth = heavy ? 4.5 : 3;
                ctx.beginPath();
                for (let si = 0; si < (heavy ? 6 : 4); si++) {
                    const a = (Math.PI * 2 * si) / (heavy ? 6 : 4) + (1 - t) * 0.8;
                    ctx.moveTo(fx.x, fx.y);
                    ctx.lineTo(fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r);
                }
                ctx.stroke();
                if (heavy) {
                    ctx.fillStyle = '#ffffff';
                    ctx.globalAlpha = t * 0.35;
                    ctx.beginPath();
                    ctx.arc(fx.x, fx.y, r * 0.25, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalCompositeOperation = 'source-over';
                fillGlow(fx.x, fx.y, r * 0.45, fx.color || '#aaf', t * (heavy ? 0.65 : 0.5));
                ctx.globalAlpha = 1;
            } else if (fx.type === 'smoke') {
                fillGlow(fx.x, fx.y, fx.radius || 20, fx.color || '#889099', t * 0.4);
                if (fx.glow) {
                    ctx.globalAlpha = t * 0.18;
                    ctx.fillStyle = fx.glow;
                    ctx.beginPath();
                    ctx.arc(fx.x, fx.y, (fx.radius || 20) * 0.65, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
            } else if (fx.type === 'lightning') {
                const pts = fx.pts || [];
                if (pts.length >= 4) {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.strokeStyle = fx.glow || '#d0f0ff';
                    ctx.globalAlpha = t * 0.65;
                    ctx.lineWidth = 14;
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(pts[0], pts[1]);
                    for (let pi = 2; pi < pts.length; pi += 2) ctx.lineTo(pts[pi], pts[pi + 1]);
                    ctx.stroke();
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = fx.color || '#88ccff';
                    ctx.globalAlpha = t;
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.moveTo(pts[0], pts[1]);
                    for (let pi = 2; pi < pts.length; pi += 2) ctx.lineTo(pts[pi], pts[pi + 1]);
                    ctx.stroke();
                    ctx.fillStyle = '#fff';
                    ctx.globalAlpha = t * 0.9;
                    ctx.fillRect(Math.floor(pts[pts.length - 2]) - 3, Math.floor(pts[pts.length - 1]) - 3, 6, 6);
                    if (t > 0.5) {
                        ctx.globalCompositeOperation = 'lighter';
                        ctx.fillStyle = fx.glow || '#e8ffff';
                        ctx.globalAlpha = (t - 0.5) * 0.8;
                        ctx.beginPath();
                        ctx.arc(pts[pts.length - 2], pts[pts.length - 1], 12, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalCompositeOperation = 'source-over';
                    }
                }
                ctx.globalAlpha = 1;
            } else if (fx.type === 'meteor') {
                const prog = 1 - t;
                const mx = fx.x;
                const my = fx.y0 + (fx.y - fx.y0) * prog;
                const r = 10 + (1 - t) * 6;
                fillGlow(mx, my, r + 22, fx.glow || fx.color, Math.min(1, t * 1.3) * 0.85);
                ctx.globalAlpha = Math.min(1, t * 1.2);
                ctx.fillStyle = fx.color || '#ff6622';
                ctx.fillRect(Math.floor(mx - r), Math.floor(my - r), Math.floor(r * 2), Math.floor(r * 2));
                ctx.fillStyle = fx.glow || '#ffcc44';
                ctx.fillRect(Math.floor(mx - r * 0.5), Math.floor(my - r * 0.5), Math.floor(r), Math.floor(r));
                ctx.globalCompositeOperation = 'lighter';
                ctx.strokeStyle = fx.glow || '#ffcc44';
                ctx.globalAlpha = t * 0.55;
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.moveTo(mx, my - r * 2);
                ctx.lineTo(mx, my + r);
                ctx.stroke();
                ctx.globalCompositeOperation = 'source-over';
                if (t < 0.15) {
                    const impactR = (fx.radius || 40) * (1 - t / 0.15);
                    fillGlow(fx.x, fx.y, impactR, fx.glow || fx.color, 0.75);
                }
                ctx.globalAlpha = 1;
            } else if (fx.type === 'shield_bubble') {
                const r = (fx.radius || 32) * (0.85 + (1 - t) * 0.2);
                ctx.globalAlpha = t * 0.35;
                fillGlow(fx.x, fx.y, r, fx.glow || fx.color, 0.55);
                ctx.strokeStyle = fx.color || '#a8c8ff';
                ctx.globalAlpha = t * 0.9;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r, Math.PI * 1.05, Math.PI * 1.95);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(fx.x - r * 0.85, fx.y + 2);
                ctx.lineTo(fx.x + r * 0.85, fx.y + 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'heal_cross') {
                const sz = Math.floor(fx.size || 4);
                const px = Math.floor(fx.x);
                const py = Math.floor(fx.y);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = t * 0.5;
                ctx.fillStyle = fx.glow || '#c8ffd8';
                ctx.fillRect(px - sz - 4, py - 3, sz * 2 + 8, 6);
                ctx.fillRect(px - 3, py - sz - 4, 6, sz * 2 + 8);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = t;
                ctx.fillStyle = fx.color || '#8fd0a0';
                ctx.fillRect(px - sz - 1, py - 2, sz * 2 + 2, 4);
                ctx.fillRect(px - 2, py - sz - 1, 4, sz * 2 + 2);
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = t * 0.85;
                ctx.fillRect(px - 1, py - sz, 2, sz * 2);
                ctx.fillRect(px - sz, py - 1, sz * 2, 2);
                ctx.globalAlpha = 1;
            } else if (fx.type === 'heal_ring') {
                const r = (fx.radius || 36) * (0.45 + (1 - t) * 1.05);
                fillGlow(fx.x, fx.y, r, fx.glow || fx.color || '#8fd0a0', t * 0.5);
                ctx.strokeStyle = fx.color || '#8fd0a0';
                ctx.globalAlpha = t * 0.9;
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = fx.glow || '#c8ffd8';
                ctx.globalAlpha = t * 0.45;
                ctx.lineWidth = 6;
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'blood_drip') {
                const sz = Math.max(2, Math.floor(fx.size || 2));
                ctx.globalAlpha = t;
                ctx.fillStyle = fx.color || '#cc3344';
                ctx.fillRect(Math.floor(fx.x), Math.floor(fx.y), sz, sz + 1);
                ctx.fillStyle = fx.glow || '#ff6677';
                ctx.globalAlpha = t * 0.5;
                ctx.fillRect(Math.floor(fx.x), Math.floor(fx.y - sz), sz, 1);
                ctx.globalAlpha = 1;
            } else if (fx.type === 'snow_flake') {
                const sz = Math.max(2, Math.floor(fx.size || 2));
                ctx.globalAlpha = t;
                ctx.fillStyle = fx.color || '#e8ffff';
                ctx.fillRect(Math.floor(fx.x), Math.floor(fx.y), sz, sz);
                ctx.fillRect(Math.floor(fx.x - 1), Math.floor(fx.y + 1), 1, 1);
                ctx.fillRect(Math.floor(fx.x + sz), Math.floor(fx.y + 1), 1, 1);
                ctx.globalAlpha = 1;
            } else if (fx.type === 'spark') {
                ctx.globalAlpha = t;
                ctx.fillStyle = fx.color || '#fff';
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, 3 + (1 - t) * 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'particle') {
                const sz = fx.size || 3;
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = t;
                ctx.fillStyle = fx.color || '#fff';
                if (fx.pixel) {
                    const ps = Math.max(2, Math.floor(sz * 2));
                    ctx.fillRect(Math.floor(fx.x) - Math.floor(ps / 2), Math.floor(fx.y) - Math.floor(ps / 2), ps, ps);
                } else {
                    ctx.shadowBlur = sz * 3;
                    ctx.shadowColor = fx.color || '#fff';
                    ctx.beginPath();
                    ctx.arc(fx.x, fx.y, sz, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            } else if (fx.type === 'skillname') {
                ctx.globalAlpha = Math.min(1, t * 1.8);
                ctx.fillStyle = fx.color || '#cce9ff';
                ctx.font = 'bold 16px "Courier New", "Microsoft YaHei", monospace';
                ctx.textAlign = 'center';
                ctx.strokeStyle = 'rgba(0,0,0,0.75)';
                ctx.lineWidth = 4;
                ctx.strokeText(fx.text, fx.x, fx.y);
                ctx.fillText(fx.text, fx.x, fx.y);
                ctx.textAlign = 'left';
                ctx.globalAlpha = 1;
            } else if (fx.type === 'death') {
                ctx.fillStyle = fx.color || '#fff';
                ctx.globalAlpha = t * 0.5;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, 6 + (1 - t) * 20, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            } else if (fx.type === 'dmg') {
                const elapsed = 1 - t;
                const pop = fx.pop || 1.2;
                let scale = 1;
                if (elapsed < 0.16) scale = pop - (pop - 1) * (elapsed / 0.16);
                else if (t < 0.22) scale = 0.88 + t * 0.55;
                const baseSize = fx.fontSize || (fx.skill ? 26 : (fx.crit ? 20 : 15));
                const fs = Math.max(12, Math.round(baseSize * scale));
                ctx.save();
                ctx.translate(fx.x, fx.y);
                ctx.globalAlpha = Math.min(1, t * 1.85);
                ctx.font = 'bold ' + fs + 'px "Courier New", "Microsoft YaHei", monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = 'rgba(0,0,0,0.78)';
                ctx.lineWidth = fx.huge ? 5 : (fx.big || fx.skill ? 4 : 3);
                ctx.strokeText(fx.text, 0, 0);
                if (fx.huge || fx.crit) {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = Math.min(1, t * 1.2) * 0.55;
                    ctx.fillStyle = fx.huge ? '#fff6c8' : '#ffe8a0';
                    ctx.fillText(fx.text, 0, 0);
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.globalAlpha = Math.min(1, t * 1.85);
                }
                ctx.fillStyle = fx.color || '#fff';
                ctx.fillText(fx.text, 0, 0);
                if (fx.huge && t > 0.7) {
                    ctx.globalAlpha = (t - 0.7) * 2.2;
                    ctx.strokeStyle = fx.color || '#fff';
                    ctx.lineWidth = 1.5;
                    ctx.strokeText(fx.text, 0, 0);
                }
                ctx.restore();
                ctx.globalAlpha = 1;
            }
        }
    }

    function drawUnitAuras(ctx, battle) {
        const units = (battle.allies || []).concat(battle.enemies || []);
        units.forEach((unit) => {
            if (!unit.alive && !unit.preview && !battle.vfxLab) return;
            const pos = getUnitRenderPos(unit);
            const ux = pos.x;
            const uy = pos.y - 4;
            (unit.auras || []).forEach((aura) => {
                const lifeT = aura.maxT ? Math.max(0, aura.t / aura.maxT) : 1;

                if (aura.type === 'shield_aura') {
                    const r = aura.radius || 40;
                    const pulse = 1 + Math.sin((aura.orbitPhase || 0) * 4) * 0.04;
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.strokeStyle = aura.glow || '#c0d8ff';
                    ctx.globalAlpha = 0.25 + lifeT * 0.35;
                    ctx.lineWidth = 5;
                    ctx.beginPath();
                    ctx.arc(ux, uy, r * pulse, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.strokeStyle = aura.color || '#6688ff';
                    ctx.globalAlpha = 0.45 + lifeT * 0.4;
                    ctx.lineWidth = 2.5;
                    ctx.setLineDash([6, 5]);
                    ctx.beginPath();
                    ctx.arc(ux, uy, r * 0.92 * pulse, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    const shards = aura.shards || 10;
                    for (let i = 0; i < shards; i++) {
                        const a = (aura.orbitPhase || 0) + (Math.PI * 2 * i) / shards;
                        const dist = r * 0.9;
                        const px = ux + Math.cos(a) * dist;
                        const py = uy + Math.sin(a) * dist * 0.72;
                        ctx.fillStyle = i % 2 ? (aura.glow || '#c0d8ff') : (aura.color || '#6688ff');
                        ctx.globalAlpha = 0.75 + lifeT * 0.2;
                        ctx.fillRect(Math.floor(px) - 2, Math.floor(py) - 2, 4, 4);
                    }
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.globalAlpha = 1;
                    return;
                }

                if (aura.type === 'hunter_mark') {
                    const r = 22 + Math.sin((aura.orbitPhase || 0) * 5) * 2;
                    ctx.strokeStyle = aura.color || '#ff6655';
                    ctx.globalAlpha = 0.55 + lifeT * 0.4;
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.arc(ux, uy - 18, r, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(ux - r, uy - 18);
                    ctx.lineTo(ux + r, uy - 18);
                    ctx.moveTo(ux, uy - 18 - r);
                    ctx.lineTo(ux, uy - 18 + r);
                    ctx.stroke();
                    ctx.fillStyle = aura.glow || '#ffaa88';
                    ctx.globalAlpha = 0.35 + lifeT * 0.25;
                    ctx.font = 'bold 10px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText('印', ux, uy - 15);
                    ctx.textAlign = 'left';
                    ctx.globalAlpha = 1;
                    return;
                }

                if (aura.type === 'poison_aura') {
                    ctx.globalAlpha = 0.35 + lifeT * 0.35;
                    ctx.fillStyle = aura.color || '#66cc44';
                    for (let i = 0; i < 5; i++) {
                        const a = (aura.orbitPhase || 0) + i * 1.2;
                        const px = ux + Math.cos(a) * 14;
                        const py = uy + 8 + Math.sin(a * 1.4) * 10;
                        ctx.fillRect(Math.floor(px), Math.floor(py), 3, 3);
                    }
                    ctx.globalAlpha = 0.5;
                    ctx.strokeStyle = aura.glow || '#a0ff70';
                    ctx.beginPath();
                    ctx.arc(ux, uy + 6, 16, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                    return;
                }

                if (aura.type === 'bleed_aura') {
                    const stacks = aura.stacks || 3;
                    ctx.globalAlpha = 0.65 + lifeT * 0.3;
                    ctx.fillStyle = aura.color || '#cc3344';
                    for (let i = 0; i < stacks; i++) {
                        ctx.fillRect(Math.floor(ux - 8 + i * 7), Math.floor(uy + 10 + i * 2), 3, 6);
                    }
                    ctx.globalAlpha = 0.45;
                    ctx.strokeStyle = aura.glow || '#ff6677';
                    ctx.beginPath();
                    ctx.moveTo(ux - 6, uy + 8);
                    ctx.lineTo(ux + 2, uy + 18);
                    ctx.moveTo(ux + 4, uy + 6);
                    ctx.lineTo(ux + 8, uy + 16);
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                    return;
                }

                if (aura.type === 'attack_buff_aura') {
                    const pulse = 1 + Math.sin((aura.orbitPhase || 0) * 6) * 0.08;
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.strokeStyle = aura.glow || '#ffcc66';
                    ctx.globalAlpha = 0.35 + lifeT * 0.4;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(ux, uy, 24 * pulse, Math.PI * 1.1, Math.PI * 1.9);
                    ctx.stroke();
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.fillStyle = aura.color || '#ffd76a';
                    ctx.globalAlpha = 0.5;
                    ctx.font = '9px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText('攻↑', ux, uy - 28);
                    ctx.textAlign = 'left';
                    ctx.globalAlpha = 1;
                    return;
                }

                if (aura.type === 'freeze_aura') {
                    ctx.globalAlpha = 0.45 + lifeT * 0.45;
                    ctx.strokeStyle = aura.glow || '#c8f0ff';
                    ctx.lineWidth = 2;
                    for (let i = 0; i < 4; i++) {
                        const a = (Math.PI / 2) * i + (aura.orbitPhase || 0);
                        ctx.beginPath();
                        ctx.moveTo(ux, uy);
                        ctx.lineTo(ux + Math.cos(a) * 16, uy + Math.sin(a) * 16);
                        ctx.stroke();
                    }
                    ctx.fillStyle = aura.color || '#66bbee';
                    ctx.fillRect(Math.floor(ux - 3), Math.floor(uy - 14), 6, 6);
                    ctx.globalAlpha = 1;
                    return;
                }

                if (aura.type === 'smoke_debuff') {
                    ctx.globalAlpha = 0.22 + lifeT * 0.2;
                    ctx.fillStyle = aura.color || '#889099';
                    ctx.beginPath();
                    ctx.arc(ux, uy, 20, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 0.35;
                    ctx.fillStyle = aura.glow || '#c0c8d0';
                    ctx.beginPath();
                    ctx.arc(ux - 4, uy - 2, 10, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
            });
        });
    }

    function createVfxPreviewBattle(canvasWidth, canvasHeight) {
        const board = Object.assign({}, cfg().board || { cols: 4, rows: 3, gap: 8, midGap: 48 });
        fitBoardToVfxLab(board, canvasWidth, canvasHeight);
        const origin = battleOriginVfxLab(canvasWidth, canvasHeight, board);
        const battle = {
            vfxLab: true,
            preview: true,
            board: board,
            origin: origin,
            allies: [],
            enemies: [],
            fx: [],
            relicFx: {},
            finished: false,
            elapsed: 0
        };
        const allyPos = cellToWorld(1, 1, 'ally', board, origin.x, origin.y);
        const ally = {
            id: 'vfx_ally',
            side: 'ally',
            heroId: 'vfx_hero',
            name: '演示者',
            baseClass: 'mage',
            col: 1,
            row: 1,
            x: allyPos.x,
            y: allyPos.y,
            maxHp: 500,
            hp: 320,
            attack: 80,
            defense: 10,
            speed: 70,
            range: 155,
            skillMult: 1,
            alive: true,
            statuses: [],
            auras: [],
            color: '#5588cc',
            skills: []
        };
        stampUnitHome(ally);
        battle.allies.push(ally);
        const enemyCols = [0, 2, 3];
        enemyCols.forEach((col, i) => {
            const pos = cellToWorld(col, i === 0 ? 0 : 1, 'enemy', board, origin.x, origin.y);
            const enemy = {
                id: 'vfx_enemy_' + i,
                side: 'enemy',
                templateId: 'ab_grunt',
                name: '木桩' + (i + 1),
                col: col,
                row: i === 0 ? 0 : 1,
                x: pos.x,
                y: pos.y,
                maxHp: 9999,
                hp: 9999,
                attack: 1,
                defense: 0,
                speed: 0,
                range: 48,
                alive: true,
                statuses: [],
                auras: [],
                color: '#884444',
                skills: []
            };
            stampUnitHome(enemy);
            battle.enemies.push(enemy);
        });
        return battle;
    }

    function previewSkillVfx(battle, skillId) {
        const def = skillDef(skillId);
        if (!def || !battle || !battle.allies.length) return false;
        resetVfxLabUnits(battle);
        const attacker = battle.allies[0];
        attacker.baseClass = previewClassForSkill(def);
        const primaryEnemy = battle.enemies[0];
        if (!primaryEnemy) return false;
        const sk = {
            id: skillId,
            name: def.name,
            aoe: !!def.aoe,
            range: def.range || attacker.range || 60,
            damageMult: def.damageMult,
            cooldownMs: def.cooldownMs || 5000
        };
        const effects = def.effects && def.effects.length
            ? def.effects
            : [{ type: 'damage', mult: def.damageMult || 1.5, aoe: !!def.aoe }];
        let target = primaryEnemy;
        if (effects.some((e) => e.type === 'heal' || e.type === 'heal_missing')) {
            target = effects.some((e) => e.target === 'lowest_ally') ? attacker : attacker;
        }
        if (effects.some((e) => e.type === 'shield' && (e.target === 'self' || e.target === 'front_allies' || e.target === 'all_allies'))) {
            target = attacker;
        }
        spawnSkillFx(battle, attacker, target, sk);
        effects.forEach((eff) => {
            if (eff.type === 'shield') {
                pickHealTargets(battle, attacker, eff.target || 'self', sk.range).forEach((u) => {
                    const sp = skillVfxProfile(skillId);
                    attachShieldAura(u, {
                        color: sp.color,
                        glow: sp.glow,
                        radius: eff.target === 'all_allies' ? 34 : 42,
                        durationMs: eff.durationMs || 6000
                    });
                });
            }
        });
        return true;
    }

    function tickVfxPreview(battle, dtMs) {
        if (!battle) return;
        tickUnitVfxMoves(battle, dtMs);
        tickFx(battle, dtMs);
        (battle.allies || []).concat(battle.enemies || []).forEach((u) => tickUnitAuras(u, dtMs));
    }

    function clearVfxPreview(battle) {
        resetVfxLabUnits(battle);
    }

    function listVfxLabSkills() {
        return (cfg().skillPool || []).slice();
    }

    window.AutoBattleSimulator = {
        cellToWorld,
        cellQuad,
        mapBoardPoint,
        fieldSize,
        fitBoardToCanvas,
        fitBoardToVfxLab,
        battleOrigin,
        battleOriginVfxLab,
        estimateBoardCellSize,
        unitSpriteRadius,
        hitTestAllyCell,
        hitTestAllyUnit,
        hitTestEnemyUnit,
        deployPickBounds,
        reanchorBattle,
        createBattle,
        createDeployPreview,
        tickBattle,
        generateEnemies,
        applyTraitDamage,
        spawnTraitEnemy,
        spawnEnemyTraitHitFx,
        spawnEnemyTraitDamageFx,
        syncHeroHpFromBattle,
        isHeroCombatReady,
        living,
        drawFx,
        drawUnitAuras,
        getUnitRenderPos,
        createVfxPreviewBattle,
        previewSkillVfx,
        tickVfxPreview,
        clearVfxPreview,
        listVfxLabSkills,
        skillDamageIntensity,
        arrowStormVfxFromIntensity,
        summarizeBattleMetrics,
        ensureBattleMetrics,
        scaleForNode
    };
})();
