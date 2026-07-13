/**
 * Pixel Eternal - 职业技能系统（Phase 2）
 * 资源管理、槽位解锁、技能释放、强化
 */
(function () {
    'use strict';

    const DEFAULT_HOTBAR = ['core1', 'core2', 'team', 'survival'];
    const LEGACY_HOTBAR_SLOT_TYPES = new Set([
        'basic', 'core1', 'core2', 'team', 'survival', 'adv_feature', 'ultimate', 'legendary'
    ]);

    function cfg() {
        return window.SKILL_CONFIG || null;
    }

    function isHotbarEligibleSkill(skillDef) {
        if (!skillDef || skillDef.type !== 'active') return false;
        if (skillDef.slotType === 'basic' || skillDef.slotType === 'legendary') return false;
        return true;
    }

    window.isSkillHotbarEligible = isHotbarEligibleSkill;

    window.getEquipableActiveSkillsForPlayer = function getEquipableActiveSkillsForPlayer(player) {
        if (!player || !window.hasPlayerClass(player.classData)) return [];
        const prog = window.getPlayerSkillProgression(player.classData);
        const level = Math.max(1, player.level | 0);
        const seen = new Set();
        const result = [];
        prog.forEach(skillId => {
            const def = window.getSkillDefinition(skillId);
            if (!def) return;
            const resolved = window.resolveEvolvedSkill(def, player.classData, level);
            if (level < (resolved.unlockLevel || 1)) return;
            if (!isHotbarEligibleSkill(resolved)) return;
            if (seen.has(resolved.id)) return;
            seen.add(resolved.id);
            result.push(resolved);
        });
        return result.sort((a, b) => (a.unlockLevel || 0) - (b.unlockLevel || 0));
    };

    function buildDefaultHotbarSkillIds(player) {
        const equip = window.getEquipableActiveSkillsForPlayer(player);
        const bySlot = {};
        equip.forEach(s => { bySlot[s.slotType] = s; });
        const ids = [];
        for (const slotType of DEFAULT_HOTBAR) {
            const s = bySlot[slotType];
            if (s) ids.push(s.id);
        }
        for (const s of equip) {
            if (ids.length >= 4) break;
            if (!ids.includes(s.id)) ids.push(s.id);
        }
        while (ids.length < 4) ids.push(null);
        return ids.slice(0, 4);
    }

    window.initPlayerSkillHotbar = function initPlayerSkillHotbar(player) {
        if (!player || !window.hasPlayerClass(player.classData)) return;
        window.migratePlayerSkillHotbar(player);
    };

    window.migratePlayerSkillHotbar = function migratePlayerSkillHotbar(player) {
        if (!player || !window.hasPlayerClass(player.classData)) return;
        const equip = window.getEquipableActiveSkillsForPlayer(player);
        const byId = {};
        const bySlot = {};
        equip.forEach(s => {
            byId[s.id] = s;
            bySlot[s.slotType] = s;
        });

        if (!player.skillHotbar || player.skillHotbar.length !== 4) {
            player.skillHotbar = buildDefaultHotbarSkillIds(player);
            return;
        }

        if (player.skillHotbar.some(entry => LEGACY_HOTBAR_SLOT_TYPES.has(entry))) {
            const ids = [];
            for (const entry of player.skillHotbar) {
                const sk = bySlot[entry];
                if (sk && !ids.includes(sk.id)) ids.push(sk.id);
            }
            for (const s of equip) {
                if (ids.length >= 4) break;
                if (!ids.includes(s.id)) ids.push(s.id);
            }
            while (ids.length < 4) ids.push(null);
            player.skillHotbar = ids.slice(0, 4);
            return;
        }

        const ids = player.skillHotbar.map(id => (id && byId[id] ? id : null));
        for (const s of equip) {
            if (!ids.includes(s.id) && ids.some(slot => slot == null)) {
                const emptyIdx = ids.findIndex(slot => slot == null);
                if (emptyIdx >= 0) ids[emptyIdx] = s.id;
            }
        }
        player.skillHotbar = ids;
    };

    window.assignSkillToHotbar = function assignSkillToHotbar(player, hotbarIndex, skillId) {
        if (!player || hotbarIndex < 0 || hotbarIndex > 3) return { ok: false, msg: '无效槽位' };
        window.migratePlayerSkillHotbar(player);
        if (skillId == null || skillId === '') {
            player.skillHotbar[hotbarIndex] = null;
            return { ok: true };
        }
        const equip = window.getEquipableActiveSkillsForPlayer(player);
        const sk = equip.find(s => s.id === skillId);
        if (!sk) return { ok: false, msg: '技能未解锁或不可装备' };
        const existingIdx = player.skillHotbar.indexOf(skillId);
        if (existingIdx >= 0 && existingIdx !== hotbarIndex) {
            player.skillHotbar[existingIdx] = player.skillHotbar[hotbarIndex];
        }
        player.skillHotbar[hotbarIndex] = skillId;
        return { ok: true };
    };

    /** 技能实验场：任意已配置主动技能均可装入快捷栏 */
    window.assignSkillLabHotbar = function assignSkillLabHotbar(player, hotbarIndex, skillId) {
        if (!player || hotbarIndex < 0 || hotbarIndex > 3) return { ok: false, msg: '无效槽位' };
        if (!player.skillHotbar || player.skillHotbar.length !== 4) {
            player.skillHotbar = [null, null, null, null];
        }
        if (skillId == null || skillId === '') {
            player.skillHotbar[hotbarIndex] = null;
            return { ok: true };
        }
        const def = window.getSkillDefinition(skillId);
        if (!def) return { ok: false, msg: '未知技能' };
        if (def.type === 'passive') return { ok: false, msg: '被动技能无法装备' };
        if (def.type === 'basic') return { ok: false, msg: '普攻请用鼠标左键' };
        const existingIdx = player.skillHotbar.indexOf(skillId);
        if (existingIdx >= 0 && existingIdx !== hotbarIndex) {
            player.skillHotbar[existingIdx] = player.skillHotbar[hotbarIndex];
        }
        player.skillHotbar[hotbarIndex] = skillId;
        return { ok: true };
    };

    /** 读取指定快捷键槽位上的技能（保留空槽位索引） */
    window.getHotbarSkillAtSlot = function getHotbarSkillAtSlot(player, slotIndex, options) {
        if (!player || slotIndex < 0 || slotIndex > 3) return null;
        window.migratePlayerSkillHotbar(player);
        const id = player.skillHotbar[slotIndex];
        if (!id) return null;
        const def = window.getSkillDefinition(id);
        if (!def) return null;
        const labMode = options && options.labMode;
        if (!labMode) {
            const equip = window.getEquipableActiveSkillsForPlayer(player);
            if (!equip.some(s => s.id === id)) return null;
        }
        return window.getResolvedSkillForPlayer(player, def) || def;
    };

    window.getResourceFamilyForClass = function getResourceFamilyForClass(classData) {
        if (!window.hasPlayerClass(classData)) return null;
        const baseId = window.getPlayerBaseClassId(classData);
        const cc = window.CLASS_CONFIG;
        if (!cc || !cc.baseClasses || !cc.baseClasses[baseId]) return null;
        const resType = cc.baseClasses[baseId].resource && cc.baseClasses[baseId].resource.type;
        const map = cfg() && cfg().resourceToFamily;
        return (map && map[resType]) || resType || 'rage';
    };

    window.getResourceFamilyMeta = function getResourceFamilyMeta(family) {
        const c = cfg();
        if (!c || !c.resourceFamilies || !family) return { name: '资源', max: 100, regenPerSec: 0 };
        return c.resourceFamilies[family] || { name: family, max: 100, regenPerSec: 0 };
    };

    window.getPlayerResourceState = function getPlayerResourceState(player) {
        if (!player) return { family: null, current: 0, max: 0, name: '' };
        const family = window.getResourceFamilyForClass(player.classData);
        if (!family) return { family: null, current: 0, max: 0, name: '' };
        const meta = window.getResourceFamilyMeta(family);
        const st = player.classResource || {};
        const max = st.max != null ? st.max : meta.max;
        const current = Math.max(0, Math.min(max, st.current != null ? st.current : max));
        return { family, current, max, name: meta.name };
    };

    window.initPlayerClassResource = function initPlayerClassResource(player) {
        if (!player) return;
        const family = window.getResourceFamilyForClass(player.classData);
        if (!family) {
            player.classResource = null;
            return;
        }
        const meta = window.getResourceFamilyMeta(family);
        player.classResource = {
            family,
            current: meta.max,
            max: meta.max
        };
    };

    window.getActiveClassProgressionId = function getActiveClassProgressionId(classData) {
        const cd = window.normalizeClassData(classData);
        if (!cd.baseClass) return null;
        return cd.secondAdvancement || cd.firstAdvancement || cd.baseClass;
    };

    window.getSkillDefinition = function getSkillDefinition(skillId) {
        const c = cfg();
        return (c && c.skills && c.skills[skillId]) || null;
    };

    /** 根据转职与等级解析技能进化形态 */
    window.resolveEvolvedSkill = function resolveEvolvedSkill(baseSkillDef, classData, level) {
        if (!baseSkillDef || !baseSkillDef.evolutionPath) return baseSkillDef;
        const cd = window.normalizeClassData(classData);
        const lv = level != null ? level : 60;
        const path = baseSkillDef.evolutionPath;
        if (lv >= 40 && cd.secondAdvancement && path.secondAdvancement) {
            const evo = path.secondAdvancement[cd.secondAdvancement];
            if (evo && evo.newSkillId) {
                const resolved = window.getSkillDefinition(evo.newSkillId);
                if (resolved) return resolved;
            }
        }
        if (lv >= 20 && cd.firstAdvancement && path.firstAdvancement) {
            const evo = path.firstAdvancement[cd.firstAdvancement];
            if (evo && evo.newSkillId) {
                const resolved = window.getSkillDefinition(evo.newSkillId);
                if (resolved) return resolved;
            }
        }
        return baseSkillDef;
    };

    window.getResolvedSkillForPlayer = function getResolvedSkillForPlayer(player, skillDefOrId) {
        if (!player) return null;
        const def = typeof skillDefOrId === 'string'
            ? window.getSkillDefinition(skillDefOrId)
            : skillDefOrId;
        if (!def) return null;
        return window.resolveEvolvedSkill(def, player.classData, player.level);
    };

    function isSkillTargetMonster(m) {
        return !!(m && m.hp > 0);
    }

    function getMonsterRadius(m) {
        return ((m && (m.size || m.radius)) || 32) / 2;
    }

    /** 战斗单位瞄准点（默认几何中心） */
    window.getCombatTargetAimPoint = function getCombatTargetAimPoint(monster) {
        if (!monster) return null;
        if (typeof monster.getCombatAimPoint === 'function') {
            return monster.getCombatAimPoint();
        }
        return { x: monster.x, y: monster.y };
    };

    window.snapPlayerAngleToCombatTarget = function snapPlayerAngleToCombatTarget(player, target) {
        if (!player || !target) return;
        const ap = window.getCombatTargetAimPoint(target);
        if (!ap) return;
        player.angle = Math.atan2(ap.y - player.y, ap.x - player.x);
    };

    /** 弓箭手自动索敌：优先面向扇形/准星，否则最近 */
    window.pickArcherAutoLockTarget = function pickArcherAutoLockTarget(player, monsters, range, opts) {
        if (!player) return null;
        opts = opts || {};
        const valid = [];
        (monsters || []).forEach(m => {
            if (!isSkillTargetMonster(m)) return;
            const ap = window.getCombatTargetAimPoint(m);
            const d = Math.hypot(ap.x - player.x, ap.y - player.y);
            if (d <= range + getMonsterRadius(m)) valid.push(m);
        });
        if (!valid.length) return null;

        if (opts.preferFacingCone && typeof player.angle === 'number') {
            const halfCone = Math.PI / 4;
            let best = null;
            let bestD = Infinity;
            valid.forEach(m => {
                const ap = window.getCombatTargetAimPoint(m);
                const dx = ap.x - player.x;
                const dy = ap.y - player.y;
                let diff = Math.atan2(dy, dx) - player.angle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) <= halfCone) {
                    const d2 = dx * dx + dy * dy;
                    if (d2 < bestD) { bestD = d2; best = m; }
                }
            });
            if (best) return best;
        }

        if (typeof pickWeaponSkillLockTargetNearestToMouse === 'function' && opts.gameInstance) {
            const mousePick = pickWeaponSkillLockTargetNearestToMouse(
                monsters, player, range, opts.gameInstance
            );
            if (mousePick && valid.indexOf(mousePick) >= 0) return mousePick;
        }
        if (typeof pickWeaponSkillLockTarget === 'function' && opts.gameInstance) {
            const conePick = pickWeaponSkillLockTarget(monsters, player, range, opts.gameInstance);
            if (conePick && valid.indexOf(conePick) >= 0) return conePick;
        }

        let nearest = valid[0];
        let nd = Infinity;
        valid.forEach(m => {
            const ap = window.getCombatTargetAimPoint(m);
            const d = Math.hypot(ap.x - player.x, ap.y - player.y);
            if (d < nd) { nd = d; nearest = m; }
        });
        return nearest;
    };

    /** 近战普攻锁敌：范围计入怪物体积，锥形段优先最近可打目标 */
    window.pickMeleeBasicLockTarget = function pickMeleeBasicLockTarget(player, monsters, range, opts) {
        if (!player) return null;
        opts = opts || {};
        const margin = opts.extraMargin != null ? opts.extraMargin : 10;
        const valid = [];
        (monsters || []).forEach(m => {
            if (!isSkillTargetMonster(m)) return;
            const ap = window.getCombatTargetAimPoint(m);
            const monR = getMonsterRadius(m);
            const d = Math.hypot(ap.x - player.x, ap.y - player.y);
            if (d <= range + monR + margin) valid.push(m);
        });
        if (!valid.length) return null;

        if (opts.preferFacingCone && typeof player.angle === 'number') {
            const halfCone = Math.max(
                (opts.halfAngleDeg != null ? opts.halfAngleDeg : 45) * Math.PI / 180 * 1.6,
                Math.PI / 5
            );
            let best = null;
            let bestD = Infinity;
            valid.forEach(m => {
                const ap = window.getCombatTargetAimPoint(m);
                const dx = ap.x - player.x;
                const dy = ap.y - player.y;
                let diff = Math.atan2(dy, dx) - player.angle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) <= halfCone) {
                    const d2 = dx * dx + dy * dy;
                    if (d2 < bestD) { bestD = d2; best = m; }
                }
            });
            if (best) return best;
        }

        if (typeof pickWeaponSkillLockTargetNearestToMouse === 'function' && opts.gameInstance) {
            const mousePick = pickWeaponSkillLockTargetNearestToMouse(
                monsters, player, range, opts.gameInstance
            );
            if (mousePick && valid.indexOf(mousePick) >= 0) return mousePick;
        }

        let nearest = valid[0];
        let nd = Infinity;
        valid.forEach(m => {
            const ap = window.getCombatTargetAimPoint(m);
            const d = Math.hypot(ap.x - player.x, ap.y - player.y);
            if (d < nd) { nd = d; nearest = m; }
        });
        return nearest;
    };

    /** 当前职业普攻（basic 槽位）技能，已解析进化形态 */
    window.getPlayerBasicClassSkill = function getPlayerBasicClassSkill(player) {
        if (!player || !window.hasPlayerClass(player.classData)) return null;
        const prog = window.getPlayerSkillProgression(player.classData);
        if (!prog || !prog.length) return null;
        const basicId = prog.find(id => {
            const d = window.getSkillDefinition(id);
            return d && (d.slotType === 'basic' || d.type === 'basic');
        }) || prog[0];
        const def = window.getSkillDefinition(basicId);
        if (!def) return null;
        let basic = window.resolveEvolvedSkill(def, player.classData, player.level);
        if (basic && basic.classId === 'assassin' && typeof window.resolveAssassinBasicAttack === 'function') {
            basic = window.resolveAssassinBasicAttack(player, basic);
        }
        return basic;
    };

    /**
     * 普攻时释放职业 basic 实体技能（飞弹/扇形斩等）
     * @returns {boolean} 是否已由实体系统处理
     */
    window.tryPerformClassBasicAttack = function tryPerformClassBasicAttack(player, monsters, gameInstance) {
        if (!player || !gameInstance) return false;
        let basic = window.getPlayerBasicClassSkill(player);
        if (!basic || !basic.entityType || !basic.entityConfig) return false;
        if (basic.classId === 'assassin' && typeof window.resolveAssassinBasicAttack === 'function') {
            basic = window.resolveAssassinBasicAttack(player, basic);
        }
        if (typeof window.castSkillEntity !== 'function') return false;
        const ec = basic.entityConfig || {};
        const chain = ec.comboChain || 1;
        const windowMs = ec.comboChainWindowMs || 1800;
        const now = Date.now();
        if (player._basicComboStep == null || player._basicComboLastTime == null
            || now - player._basicComboLastTime > windowMs) {
            player._basicComboStep = 0;
        }
        const step = player._basicComboStep % chain;
        player._basicComboLastTime = now;
        player._basicComboStep = (step + 1) % chain;
        const ov = {};
        if (ec.comboStepDamage && ec.comboStepDamage[step] != null) ov.damageMultiplier = ec.comboStepDamage[step];
        if (ec.comboStepRange && ec.comboStepRange[step] != null) ov.range = ec.comboStepRange[step];
        if (ec.comboStepAngle && ec.comboStepAngle[step] != null) {
            const fullAngle = ec.comboStepAngle[step];
            ov.halfAngleDeg = fullAngle / 2;
            if (fullAngle >= 350) ov.shape = 'radial';
        }
        if (ec.comboStepDash && ec.comboStepDash[step] != null && ec.comboStepDash[step] > 0) {
            ov._comboDash = ec.comboStepDash[step];
        }
        if (ec.comboStepDashBehind && ec.comboStepDashBehind[step]) {
            ov._comboDashBehind = true;
            ov.shape = 'pierce';
            ov.pierceWidth = ec.pierceWidth || 28;
        }
        if (ec.comboStepConsumeAllComboPoints && ec.comboStepConsumeAllComboPoints[step]) {
            ov.consumeAllComboPoints = true;
            ov.perComboPointMult = (ec.comboStepPerComboPointMult && ec.comboStepPerComboPointMult[step] != null)
                ? ec.comboStepPerComboPointMult[step] : 0.30;
        }
        const modified = Object.assign({}, basic, {
            entityConfig: Object.assign({}, ec, ov),
            _comboStep: step,
            _comboChain: chain,
            _comboDashBehind: !!ov._comboDashBehind
        });
        player._lastBasicCombo = { step, chain, isFinisher: step === chain - 1 };

        const stepEc = modified.entityConfig || {};
        const aimRange = (stepEc.range || basic.range || 55) + 28;
        const isMeleeBasic = modified.entityType === 'instant'
            && (modified.classId === 'assassin' || modified.classId === 'warrior'
                || stepEc.shape === 'cone' || stepEc.shape === 'radial' || stepEc.shape === 'pierce'
                || stepEc.lockTargetCenter);
        let primaryTarget = null;
        let castOptions = null;
        if (isMeleeBasic && typeof window.pickMeleeBasicLockTarget === 'function') {
            primaryTarget = window.pickMeleeBasicLockTarget(player, monsters, aimRange, {
                gameInstance,
                preferFacingCone: stepEc.shape === 'cone',
                halfAngleDeg: (stepEc.halfAngleDeg || 35)
            });
        } else if (typeof window.pickArcherAutoLockTarget === 'function'
            && (modified.classId === 'archer' || stepEc.lockTargetCenter)) {
            primaryTarget = window.pickArcherAutoLockTarget(player, monsters, aimRange, {
                gameInstance,
                preferFacingCone: true
            });
        }
        if (primaryTarget) {
            if (typeof window.snapPlayerAngleToCombatTarget === 'function') {
                window.snapPlayerAngleToCombatTarget(player, primaryTarget);
            }
            castOptions = { lockTarget: primaryTarget };
        }

        const result = window.castSkillEntity(player, modified, gameInstance, monsters, now, castOptions);
        if (result !== false) {
            if (typeof window.playClassSkillVfx === 'function') {
                window.playClassSkillVfx(player, modified, gameInstance, {
                    comboStep: step,
                    comboChain: chain,
                    primaryTarget,
                    hitTargets: primaryTarget ? [primaryTarget] : [],
                    hit: true
                });
            }
            if (chain > 1 && gameInstance && typeof gameInstance.addFloatingText === 'function') {
                const color = step === chain - 1 ? '#ffdd44' : '#ccddff';
                gameInstance.addFloatingText(player.x, player.y - 32, (step + 1) + '/' + chain, color, 900, 16);
            }
            return true;
        }
        return false;
    };

    window.recordSkillComboCast = function recordSkillComboCast(player, skillDef) {
        if (!player || !skillDef) return null;
        const comboCfg = window.SKILL_COMBO_CONFIG;
        if (!comboCfg || !comboCfg.combos) return null;
        player._skillComboHistory = player._skillComboHistory || [];
        const now = Date.now();
        player._skillComboHistory.push({ skillId: skillDef.id, baseSkillId: skillDef.id, time: now });
        player._skillComboHistory = player._skillComboHistory.filter(h => now - h.time < 6000);
        const baseId = window.getPlayerBaseClassId(player.classData);
        for (const combo of comboCfg.combos) {
            if (combo.baseClass && combo.baseClass !== baseId) continue;
            const seq = combo.sequence || [];
            if (seq.length < 2) continue;
            const recent = player._skillComboHistory.slice(-seq.length);
            if (recent.length < seq.length) continue;
            const match = seq.every((sid, i) => {
                const h = recent[i];
                if (!h) return false;
                return h.skillId === sid || (skillDef.evolutionPath && skillDef.evolutionPath.baseSkillId === sid);
            });
            if (match && now - recent[0].time <= (combo.windowMs || 3000)) {
                return combo;
            }
        }
        return null;
    };

    window.getSkillResourceLabel = function getSkillResourceLabel(skillDef) {
        if (!skillDef || !skillDef.resourceType) return '资源';
        const c = cfg();
        const rt = skillDef.resourceType;
        const family = (c && c.resourceToFamily && c.resourceToFamily[rt]) || rt;
        if (c && c.resourceFamilies && c.resourceFamilies[family]) {
            return c.resourceFamilies[family].name;
        }
        return rt;
    };

    /**
     * 根据技能数据生成可读描述（配置中无有效描述时使用）
     */
    window.buildSkillDescription = function buildSkillDescription(skillDef, player) {
        if (!skillDef) return '';
        const mult = player && typeof window.getSkillEffectiveMultiplier === 'function'
            ? window.getSkillEffectiveMultiplier(player, skillDef)
            : (skillDef.damageMultiplier || 1);
        const pct = Math.round(mult * 100);
        const resLabel = window.getSkillResourceLabel(skillDef);
        const tags = skillDef.effectTags || [];

        if (skillDef.type === 'passive') {
            if (skillDef.slotType === 'legendary') {
                const buildDesc = skillDef.description && skillDef.description.includes('流派')
                    ? skillDef.description
                    : `【流派被动】${skillDef.name}：定义你的 Build 方向，永久改变战斗逻辑。`;
                return buildDesc;
            }
            return `【被动】${skillDef.name}：永久生效，无需手动释放。`;
        }

        const se = skillDef.skillEffect;
        if (se && se.mode === 'primary') {
            const costs = [];
            if (skillDef.resourceCost > 0) costs.push(`消耗 ${skillDef.resourceCost} 点${resLabel}`);
            if (skillDef.cooldownMs > 0) costs.push(`冷却 ${(skillDef.cooldownMs / 1000).toFixed(1)} 秒`);
            const tail = costs.length ? ' ' + costs.join('，') + '。' : '。';
            if (se.type === 'ice_armor') {
                const dur = ((se.durationMs || 8000) / 1000).toFixed(0);
                const dr = se.damageReduction || 15;
                const slowPct = Math.round((1 - (se.attackerSlowMultiplier || 0.7)) * 100);
                return `【防御】${skillDef.name}：${dur} 秒内减伤 ${dr}%，近战攻击你的敌人减速 ${slowPct}%。${tail}`;
            }
            if (se.type === 'damage_reduction') {
                return `【防御】${skillDef.name}：${((se.durationMs || 5000) / 1000).toFixed(0)} 秒内减伤 ${se.damageReduction || 20}%。${tail}`;
            }
            if (se.type === 'shield') {
                return `【护盾】${skillDef.name}：获得最大生命 ${se.absorbPercent || 20}% 的护盾，持续 ${((se.durationMs || 8000) / 1000).toFixed(0)} 秒。${tail}`;
            }
            if (se.type === 'heal') {
                return `【治疗】${skillDef.name}：恢复最大生命 ${se.healPercent || 25}%。${tail}`;
            }
            if (se.type === 'blink') {
                return `【位移】${skillDef.name}：向面朝方向瞬移 ${se.distance || 100} 码。${tail}`;
            }
            if (se.type === 'mark') {
                return `【标记】${skillDef.name}：对 ${se.range || skillDef.range || 120} 码内敌人施加印记，伤害提升 ${se.damageBonus || 15}%。${tail}`;
            }
            if (tags.includes('defense') || tags.includes('heal') || tags.includes('utility')) {
                return `【${tags[0] || '技能'}】${skillDef.name}。${tail}`;
            }
        }
        if (se && se.mode === 'hybrid') {
            const costs = [];
            if (skillDef.resourceCost > 0) costs.push(`消耗 ${skillDef.resourceCost} 点${resLabel}`);
            if (skillDef.cooldownMs > 0) costs.push(`冷却 ${(skillDef.cooldownMs / 1000).toFixed(1)} 秒`);
            const tail = costs.length ? ' ' + costs.join('，') + '。' : '。';
            const hm = se.damageMult != null ? se.damageMult : (se.instantMult != null ? se.instantMult : skillDef.damageMultiplier);
            const pct = Math.round((hm || 1) * 100);
            return `【技能】${skillDef.name}：造成约 ${pct}% 攻击力伤害并附带特殊效果。${tail}`;
        }
        if (tags.includes('defense') || tags.includes('ice_armor')) {
            return `【防御】${skillDef.name}。`;
        }

        let prefix = '';
        if (skillDef.slotType === 'ultimate') prefix = '【终极】';
        else if (skillDef.slotType === 'team') prefix = '【团队】';
        else if (skillDef.type === 'basic') prefix = '【普攻】';
        else if (skillDef.slotType && String(skillDef.slotType).includes('awaken')) prefix = '【觉醒】';

        let effect;
        if (skillDef.type === 'basic') {
            effect = `对前方目标造成 ${pct}% 攻击力伤害`;
        } else if ((skillDef.aoeRadius || 0) > 0) {
            effect = `对周围 ${skillDef.aoeRadius} 范围内敌人造成 ${pct}% 攻击力伤害`;
        } else {
            effect = `对 ${skillDef.range || 80} 码内最近敌人造成 ${pct}% 攻击力伤害`;
        }

        const extras = [];
        if (tags.includes('buff')) extras.push('并提升自身攻击力');
        if (tags.includes('burst')) extras.push('附带爆发伤害');

        let text = `${prefix}${effect}`;
        if (extras.length) text += '，' + extras.join('，');
        text += '。';

        const costs = [];
        if (skillDef.resourceCost > 0) costs.push(`消耗 ${skillDef.resourceCost} 点${resLabel}`);
        if (skillDef.cooldownMs > 0) costs.push(`冷却 ${(skillDef.cooldownMs / 1000).toFixed(1)} 秒`);
        if (costs.length) text += ' ' + costs.join('，') + '。';
        return text;
    };

    /** 优先使用配置描述，否则动态生成 */
    window.getSkillDisplayDescription = function getSkillDisplayDescription(skillDef, player) {
        if (!skillDef) return '';
        const manual = (skillDef.description || '').trim();
        if (manual && manual !== skillDef.name && manual.length > skillDef.name.length + 2) {
            return manual;
        }
        return window.buildSkillDescription(skillDef, player);
    };

    window.getSkillDetailMeta = function getSkillDetailMeta(skillDef, player) {
        if (!skillDef) return '';
        const enh = player ? window.getSkillEnhanceLevel(player, skillDef.id) : 0;
        const parts = [];
        if (skillDef.cooldownMs > 0) parts.push(`CD ${(skillDef.cooldownMs / 1000).toFixed(1)}s`);
        if (skillDef.damageMultiplier) {
            const eff = skillDef.damageMultiplier * (1 + enh * 0.1);
            parts.push(`倍率 ${eff.toFixed(2)}x`);
        }
        if (skillDef.resourceCost > 0) {
            parts.push(`${skillDef.resourceCost} ${window.getSkillResourceLabel(skillDef)}`);
        }
        if (skillDef.range) parts.push(`射程 ${skillDef.range}`);
        if (skillDef.aoeRadius) parts.push(`范围 ${skillDef.aoeRadius}`);
        if ((skillDef.effectTags || []).includes('defense')) parts.push('防御');
        if (enh > 0) parts.push(`强化 +${enh}`);
        return parts.join(' · ');
    };

    window.getPlayerSkillProgression = function getPlayerSkillProgression(classData) {
        const c = cfg();
        if (!c || !c.progressions) return [];
        const pid = window.getActiveClassProgressionId(classData);
        if (!pid) return [];
        return c.progressions[pid] || [];
    };

    window.getUnlockedSkillsForPlayer = function getUnlockedSkillsForPlayer(player) {
        if (!player || !window.hasPlayerClass(player.classData)) return [];
        const prog = window.getPlayerSkillProgression(player.classData);
        const level = Math.max(1, player.level | 0);
        const bySlot = {};
        prog.forEach(skillId => {
            const def = window.getSkillDefinition(skillId);
            if (!def) return;
            const resolved = window.resolveEvolvedSkill(def, player.classData, level);
            const unlockLv = resolved.unlockLevel || 1;
            if (level < unlockLv) return;
            const slot = resolved.slotType;
            const prev = bySlot[slot];
            if (!prev || (resolved.unlockLevel || 0) >= (prev.unlockLevel || 0)) {
                bySlot[slot] = resolved;
            }
        });
        return Object.values(bySlot).sort((a, b) => (a.unlockLevel || 0) - (b.unlockLevel || 0));
    };

    window.getPlayerHotbarSkills = function getPlayerHotbarSkills(player) {
        if (!player || !window.hasPlayerClass(player.classData)) return [];
        window.migratePlayerSkillHotbar(player);
        const equip = window.getEquipableActiveSkillsForPlayer(player);
        const byId = {};
        equip.forEach(s => { byId[s.id] = s; });
        const result = [];
        for (const id of player.skillHotbar) {
            if (id && byId[id]) result.push(byId[id]);
        }
        for (const s of equip) {
            if (result.length >= 4) break;
            if (!result.some(x => x.id === s.id)) result.push(s);
        }
        return result.slice(0, 4);
    };

    window.getSkillEnhanceLevel = function getSkillEnhanceLevel(player, skillId) {
        if (!player || !player.skillEnhanceLevels) return 0;
        return Math.max(0, Math.min(5, player.skillEnhanceLevels[skillId] || 0));
    };

    window.getSkillEffectiveMultiplier = function getSkillEffectiveMultiplier(player, skillDef) {
        if (!skillDef) return 1;
        const lv = window.getSkillEnhanceLevel(player, skillDef.id);
        const ec = cfg() && cfg().enhanceConfig;
        const per = (ec && ec.damagePerLevel) || 0.1;
        return skillDef.damageMultiplier * (1 + lv * per);
    };

    window.canAffordSkillCost = function canAffordSkillCost(player, skillDef) {
        if (!skillDef || !skillDef.resourceCost) return true;
        const st = window.getPlayerResourceState(player);
        return st.current >= skillDef.resourceCost;
    };

    window.spendSkillResource = function spendSkillResource(player, skillDef) {
        if (!player || !player.classResource || !skillDef || !skillDef.resourceCost) return;
        player.classResource.current = Math.max(0, player.classResource.current - skillDef.resourceCost);
    };

    window.grantSkillResource = function grantSkillResource(player, amount) {
        if (!player || !player.classResource || !amount) return;
        player.classResource.current = Math.min(player.classResource.max, player.classResource.current + amount);
    };

    window.tickPlayerClassResource = function tickPlayerClassResource(player, dtSec, inCombat) {
        if (!player || !player.classResource) return;
        const meta = window.getResourceFamilyMeta(player.classResource.family);
        if (meta.regenPerSec) {
            player.classResource.current = Math.min(
                player.classResource.max,
                player.classResource.current + meta.regenPerSec * dtSec
            );
        }
        if (!inCombat && meta.outOfCombatDecay) {
            player.classResource.current = Math.max(0, player.classResource.current - meta.outOfCombatDecay * dtSec);
        }
    };

    window.onPlayerBasicAttackResource = function onPlayerBasicAttackResource(player) {
        if (!player || !player.classResource) return;
        const meta = window.getResourceFamilyMeta(player.classResource.family);
        if (meta.onBasicAttack) window.grantSkillResource(player, meta.onBasicAttack);
    };

    window.onPlayerHitTakenResource = function onPlayerHitTakenResource(player) {
        if (!player || !player.classResource) return;
        const meta = window.getResourceFamilyMeta(player.classResource.family);
        if (meta.onHitTaken) window.grantSkillResource(player, meta.onHitTaken);
    };

    window.onPlayerCritResource = function onPlayerCritResource(player) {
        if (!player || !player.classResource) return;
        const meta = window.getResourceFamilyMeta(player.classResource.family);
        if (meta.onCrit) window.grantSkillResource(player, meta.onCrit);
    };

    window.getSkillCooldownRemaining = function getSkillCooldownRemaining(player, skillId) {
        if (!player || !player.skillCooldowns) return 0;
        const end = player.skillCooldowns[skillId] || 0;
        return Math.max(0, end - Date.now());
    };

    window.setSkillCooldown = function setSkillCooldown(player, skillDef) {
        if (!player || !skillDef) return;
        player.skillCooldowns = player.skillCooldowns || {};
        player.skillCooldowns[skillDef.id] = Date.now() + (skillDef.cooldownMs || 0);
    };

    window.tryEnhanceSkill = function tryEnhanceSkill(player, skillId) {
        const def = window.getSkillDefinition(skillId);
        if (!player || !def) return { ok: false, msg: '无效技能' };
        const lv = window.getSkillEnhanceLevel(player, skillId);
        const ec = cfg() && cfg().enhanceConfig;
        const maxLv = (ec && ec.maxLevel) || 5;
        if (lv >= maxLv) return { ok: false, msg: '已达最高强化等级' };
        const cost = (ec && ec.goldByLevel && ec.goldByLevel[lv]) || 500;
        if ((player.gold || 0) < cost) return { ok: false, msg: `需要 ${cost} 金币` };
        player.gold -= cost;
        player.skillEnhanceLevels = player.skillEnhanceLevels || {};
        player.skillEnhanceLevels[skillId] = lv + 1;
        return { ok: true, level: lv + 1, cost };
    };

    /**
     * 释放职业技能（战斗内）
     * @returns {boolean}
     */
    /**
     * 解析职业技能瞄准/范围预览配置（长按技能键时显示）
     * @returns {{ mode: string, ... }|null}
     */
    window.resolveClassSkillAimProfile = function resolveClassSkillAimProfile(player, skillDef) {
        if (!player || !skillDef || skillDef.type === 'passive' || skillDef.type === 'basic') return null;
        let def = window.getResolvedSkillForPlayer(player, skillDef) || skillDef;
        if (typeof window.applyBuildEquipmentSkillModifiers === 'function') {
            def = window.applyBuildEquipmentSkillModifiers(player, def);
        }
        const se = def.skillEffect || {};
        const isHybrid = typeof window.isHybridUtilitySkill === 'function' && window.isHybridUtilitySkill(def);
        const isPrimary = typeof window.isPrimaryUtilitySkill === 'function' && window.isPrimaryUtilitySkill(def);
        const entityType = def.entityType || (window.inferSkillEntityType && window.inferSkillEntityType(def));
        const ecWrap = window.getSkillEntityConfig && window.getSkillEntityConfig(def);
        const c = (ecWrap && ecWrap.entityConfig) || def.entityConfig || {};

        if (entityType === 'field' && c.targeted) {
            const castRange = def.range || 220;
            const aoeRadius = c.fieldRadius || (c.onTrigger && c.onTrigger.explodeRadius) || def.aoeRadius || 80;
            return { mode: 'ground_aoe', castRange, aoeRadius };
        }
        if (entityType === 'charge') {
            return {
                mode: 'direction_line',
                distance: c.maxDistance || 150,
                width: (c.collisionRadius || 35) * 2
            };
        }
        if (entityType === 'blink') {
            if (c.behindTarget && (c.range || def.range)) {
                return { mode: 'target_lock', lockRange: c.range || def.range || 100 };
            }
            return {
                mode: 'direction_line',
                distance: c.distance || se.distance || 100,
                width: 28
            };
        }
        if (entityType === 'instant' && c.shape) {
            if (c.shape === 'cone') {
                return {
                    mode: 'cone',
                    range: c.range || def.range || 80,
                    halfAngleDeg: c.halfAngleDeg || 45
                };
            }
            if (c.shape === 'radial') {
                return { mode: 'self_aoe', aoeRadius: c.range || def.aoeRadius || 80 };
            }
            if (c.shape === 'single' || c.shape === 'chain') {
                return { mode: 'target_lock', lockRange: c.range || def.range || 80 };
            }
        }
        if (entityType === 'projectile') {
            const maxRange = c.maxRange || def.range || 400;
            const explode = c.explodeRadius || 0;
            if (explode > 0) {
                return { mode: 'ground_aoe', castRange: maxRange, aoeRadius: explode };
            }
            return {
                mode: 'direction_line',
                distance: maxRange,
                width: Math.max(16, (c.collisionRadius || 20) * 2)
            };
        }
        if (isPrimary) {
            if (se.type === 'blink') {
                return { mode: 'direction_line', distance: se.distance || 100, width: 24 };
            }
            if (se.type === 'mark' || se.range) {
                return { mode: 'target_lock', lockRange: se.range || def.range || 120 };
            }
        }
        if (isHybrid && se.aoeRadius) {
            return { mode: 'self_aoe', aoeRadius: se.aoeRadius };
        }
        const aoe = def.aoeRadius || 0;
        if (aoe > 0) return { mode: 'self_aoe', aoeRadius: aoe };
        const range = def.range || 0;
        if (range > 0) return { mode: 'target_lock', lockRange: range };
        return null;
    };

    window.executeClassSkill = function executeClassSkill(player, monsters, skillDef, gameInstance, castOptions) {
        if (!player || !skillDef || skillDef.type === 'passive') return false;
        skillDef = window.getResolvedSkillForPlayer(player, skillDef) || skillDef;
        if (typeof window.applyBuildEquipmentSkillModifiers === 'function') {
            skillDef = window.applyBuildEquipmentSkillModifiers(player, skillDef);
        }
        const now = Date.now();
        if (typeof window.tryShadowRaidReturn === 'function') {
            const raidRet = window.tryShadowRaidReturn(player, skillDef, gameInstance, monsters, now);
            if (raidRet === true) return true;
        }
        const isShadowRaidReturn = typeof window.canShadowRaidReturnCast === 'function'
            && window.canShadowRaidReturnCast(player, skillDef, now);

        if (!isShadowRaidReturn) {
            if (player.isDashing || player.isCastingSkill) return false;
            if (player._skillCastBar && now < player._skillCastBar.endTime) return false;
            if (player.dashEndTime && now - player.dashEndTime < 500) return false;
            const cooldownKey = skillDef.evolutionPath && skillDef.evolutionPath.baseSkillId
                ? skillDef.evolutionPath.baseSkillId : skillDef.id;
            if (window.getSkillCooldownRemaining(player, cooldownKey) > 0) return false;
            if (!window.canAffordSkillCost(player, skillDef)) {
                if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                    gameInstance.addFloatingText(player.x, player.y, '资源不足', '#ff6666');
                }
                return false;
            }
        }

        player.isCastingSkill = true;
        try {
            if (!isShadowRaidReturn) {
                window.spendSkillResource(player, skillDef);
                const cdDef = Object.assign({}, skillDef, {
                    id: skillDef.evolutionPath && skillDef.evolutionPath.baseSkillId
                        ? skillDef.evolutionPath.baseSkillId : skillDef.id
                });
                window.setSkillCooldown(player, cdDef);
            }
            const activeCombo = window.recordSkillComboCast(player, skillDef);

            if (typeof window.applyAssassinSkillPrimary === 'function'
                && window.applyAssassinSkillPrimary(player, skillDef, gameInstance, now, { monsters })) {
                if (typeof window.playClassSkillVfx === 'function') {
                    window.playClassSkillVfx(player, skillDef, gameInstance, {
                        primaryTarget: null,
                        hitTargets: [],
                        hit: true
                    });
                }
                if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                    gameInstance.addFloatingText(player.x, player.y - 20, skillDef.name, '#aaddff');
                }
                return true;
            }

            const hasEntity = skillDef.entityType && skillDef.entityConfig;
            const isPrimary = typeof window.isPrimaryUtilitySkill === 'function'
                && window.isPrimaryUtilitySkill(skillDef);
            const isHybrid = typeof window.isHybridUtilitySkill === 'function'
                && window.isHybridUtilitySkill(skillDef);
            const se = skillDef.skillEffect || {};

            /** 实体化技能优先（弹丸/召唤/场域/瞬击/位移/冲撞） */
            if (hasEntity && typeof window.castSkillEntity === 'function') {
                const entityOk = window.castSkillEntity(player, skillDef, gameInstance, monsters, now, castOptions);
                const skipEntityVfx = skillDef.entityType === 'instant' || skillDef.entityType === 'charge';
                if (!skipEntityVfx && typeof window.playClassSkillVfx === 'function') {
                    window.playClassSkillVfx(player, skillDef, gameInstance, {
                        primaryTarget: null,
                        hitTargets: [],
                        hit: entityOk !== false
                    });
                }
                if (activeCombo && gameInstance && typeof gameInstance.addFloatingText === 'function') {
                    gameInstance.addFloatingText(player.x, player.y - 36, activeCombo.name || '连携!', '#ffdd44');
                }
                if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                    gameInstance.addFloatingText(player.x, player.y - 20, skillDef.name, '#aaddff');
                }
                return entityOk !== false;
            }

            if (isPrimary) {
                const applied = typeof window.applyClassSkillPrimaryEffect === 'function'
                    && window.applyClassSkillPrimaryEffect(player, skillDef, gameInstance, now, { monsters });
                const defensive = typeof window.isDefensiveClassSkill === 'function'
                    && window.isDefensiveClassSkill(skillDef);
                if (typeof window.playClassSkillVfx === 'function') {
                    window.playClassSkillVfx(player, skillDef, gameInstance, {
                        primaryTarget: null,
                        hitTargets: [],
                        hit: false,
                        defensive
                    });
                }
                if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                    gameInstance.addFloatingText(player.x, player.y - 20, skillDef.name, defensive ? '#88ccff' : '#aaddff');
                }
                if (defensive && gameInstance && gameInstance.soundManager) {
                    gameInstance.soundManager.playSound('freeze');
                }
                return applied !== false;
            }

            /** 无 entity 配置的 hybrid / 标准伤害 fallback */
            const enhLv = window.getSkillEnhanceLevel(player, skillDef.id);
            const enhMult = 1 + enhLv * 0.1;
            let mult = window.getSkillEffectiveMultiplier(player, skillDef);
            if (isHybrid) {
                if (se.damageMult != null) mult = se.damageMult * enhMult;
                else if (se.instantMult != null) mult = se.instantMult * enhMult;
            }
            if (activeCombo && activeCombo.bonus && activeCombo.bonus.totalDamageMult) {
                mult *= activeCombo.bonus.totalDamageMult;
            }
            const baseDmg = typeof window.getPlayerEffectiveAttack === 'function'
                ? window.getPlayerEffectiveAttack(player)
                : (player.baseAttack || 10);
            const dealSkillDamage = (m, rawDmg) => {
                let dmg = rawDmg;
                if (typeof window.getClassSkillMarkBonus === 'function') {
                    const mark = window.getClassSkillMarkBonus(m);
                    dmg = Math.max(1, Math.floor(dmg * mark.mult));
                }
                if (typeof window.getCombatStatusDamageMultiplier === 'function') {
                    dmg = Math.max(1, Math.floor(dmg * window.getCombatStatusDamageMultiplier(m)));
                }
                if (typeof window.getStrikerDamageBonus === 'function') {
                    dmg = Math.max(1, Math.floor(dmg * window.getStrikerDamageBonus(player, m)));
                }
                if (activeCombo && activeCombo.bonus && activeCombo.bonus.damageMult) {
                    dmg = Math.max(1, Math.floor(dmg * activeCombo.bonus.damageMult));
                }
                const defRed = typeof window.getCombatStatusDefenseReduction === 'function'
                    ? window.getCombatStatusDefenseReduction(m) : 0;
                if (defRed > 0) dmg = Math.max(1, Math.floor(dmg * (1 + defRed / 100)));
                if (skillDef && (typeof TrainingDummy !== 'undefined' && (m instanceof TrainingDummy || m instanceof MonsterTrainingDummy))) {
                    m._pendingDamageSource = 'skill:' + (skillDef.id || 'unknown');
                }
                m.takeDamage(dmg);
                if (typeof window.applyBreakDamage === 'function') {
                    window.applyBreakDamage(m, dmg, player, skillDef);
                }
                if (typeof window.applySkillStatusEffects === 'function') {
                    window.applySkillStatusEffects(skillDef, m, player, gameInstance);
                }
            };
            const damage = Math.max(1, Math.floor(baseDmg * mult));
            const range = skillDef.range || 80;
            let aoe = skillDef.aoeRadius || 0;
            if (isHybrid && se.aoeRadius) aoe = se.aoeRadius;
            let hit = false;
            const hitTargets = [];
            const skipDirectDamage = isHybrid && ['backstep', 'charge', 'freeze', 'blink_behind'].includes(se.type)
                || (isHybrid && se.type === 'dodge_buff' && se.damageMult === 0);

            const targets = (monsters || []).filter(m => m && m.hp > 0 && !(typeof TrainingDummy !== 'undefined' && m instanceof TrainingDummy));
            if (!skipDirectDamage) {
                if (aoe > 0) {
                    targets.forEach(m => {
                        const d = Math.hypot(m.x - player.x, m.y - player.y);
                        if (d <= aoe) {
                            dealSkillDamage(m, damage);
                            hitTargets.push(m);
                            hit = true;
                        }
                    });
                } else if (se.type !== 'blink_behind') {
                    let best = null;
                    let bestD = Infinity;
                    targets.forEach(m => {
                        const d = Math.hypot(m.x - player.x, m.y - player.y);
                        if (d <= range && d < bestD) { bestD = d; best = m; }
                    });
                    if (best) {
                        player.angle = Math.atan2(best.y - player.y, best.x - player.x);
                        dealSkillDamage(best, damage);
                        hitTargets.push(best);
                        hit = true;
                    }
                }
            }

            if (isHybrid && typeof window.applyClassSkillHybridEffect === 'function') {
                window.applyClassSkillHybridEffect(player, skillDef, gameInstance, now, {
                    monsters,
                    hitTargets,
                    baseDamage: damage
                });
                if (['backstep', 'charge', 'blink_behind', 'freeze', 'dodge_buff'].includes(se.type)) {
                    hit = true;
                }
            }

            if (!skillDef.skillEffect && skillDef.effectTags && skillDef.effectTags.includes('buff')) {
                player.buffs = player.buffs || [];
                player.buffs.push({
                    name: skillDef.name,
                    expireTime: now + 8000,
                    effects: { attack: Math.floor(baseDmg * 0.15) }
                });
            }

            if (typeof window.playClassSkillVfx === 'function') {
                window.playClassSkillVfx(player, skillDef, gameInstance, {
                    primaryTarget: hitTargets[0] || null,
                    hitTargets,
                    hit
                });
            }

            if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(player.x, player.y - 20, skillDef.name, '#88ccff');
            }
            if (hit && gameInstance && gameInstance.particleManager && typeof gameInstance.particleManager.createSystem === 'function') {
                const family = window.getResourceFamilyForClass(player.classData);
                const pColor = (family === 'mana') ? '#7755ff' : (family === 'focus') ? '#55dd44' : (family === 'energy') ? '#cc33ee' : '#ff4422';
                hitTargets.forEach(m => {
                    gameInstance.particleManager.createSystem(m.x, m.y, {
                        color: pColor,
                        size: 2,
                        count: 6,
                        lifetime: 300,
                        fadeoutTime: 200,
                        speed: 2,
                        angleSpread: Math.PI * 2,
                        pixelStyle: true
                    });
                });
            }
            if (hit && gameInstance && typeof gameInstance.triggerHitImpact === 'function') {
                hitTargets.forEach(m => {
                    gameInstance.triggerHitImpact(m.x, m.y, {
                        isRanged: window.getResourceFamilyForClass(player.classData) === 'focus',
                        isCrit: false,
                        target: m,
                        sourceX: player.x,
                        sourceY: player.y,
                        skipSound: true
                    });
                });
            }
            return hit || aoe > 0 || isHybrid
                || (skillDef.effectTags && skillDef.effectTags.includes('buff'));
        } finally {
            player.isCastingSkill = false;
        }
    };

    const STARTER_WEAPON_TYPE = {
        warrior: 'sword',
        archer: 'bow',
        mage: 'staff',
        assassin: 'dagger'
    };

    function grantStarterWeapon(player, baseClassId) {
        const weaponType = STARTER_WEAPON_TYPE[baseClassId];
        if (!weaponType || typeof window.generateProceduralEquipment !== 'function') return;
        const eq = window.generateProceduralEquipment({
            slot: 'weapon',
            level: player.level || 1,
            quality: 'normal',
            playerClass: baseClassId,
            weaponType
        });
        if (!eq) return;
        eq.type = 'equipment';
        if (!player.equipment) player.equipment = {};
        if (!player.equipment.weapon) {
            player.equipment.weapon = eq;
        } else {
            if (!Array.isArray(player.inventory)) player.inventory = [];
            const empty = player.inventory.findIndex(i => !i);
            if (empty >= 0) player.inventory[empty] = eq;
            else player.inventory.push(eq);
        }
    }

    window.selectPlayerBaseClass = function selectPlayerBaseClass(player, baseClassId) {
        if (!player) return false;
        const valid = ['warrior', 'archer', 'mage', 'assassin'];
        if (!valid.includes(baseClassId)) return false;
        player.classData = {
            baseClass: baseClassId,
            firstAdvancement: null,
            secondAdvancement: null
        };
        window.initPlayerClassResource(player);
        player.skillCooldowns = {};
        player.skillEnhanceLevels = player.skillEnhanceLevels || {};
        player.skillHotbar = null;
        window.initPlayerSkillHotbar(player);
        grantStarterWeapon(player, baseClassId);
        if (typeof player.updateStats === 'function') player.updateStats();
        return true;
    };

})();
