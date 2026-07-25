/**
 * 技能即构筑：派系 → 细分支 → 技能实例 branchMods / 质变
 */
(function () {
    'use strict';

    function cfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||
            window.AUTO_BATTLER_CONFIG || {};
    }

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function skillPool() {
        return cfg().skillPool || [];
    }

    function skillDef(id) {
        if (!id) return null;
        return skillPool().find((s) => s.id === id) || null;
    }

    function allLineages() {
        return cfg().lineages || [];
    }

    function allDuoSparks() {
        return cfg().duoSparks || [];
    }

    function getLineage(id) {
        return allLineages().find((l) => l.id === id) || null;
    }

    function getBranch(lineageId, branchId) {
        const lin = getLineage(lineageId);
        if (!lin) return null;
        return (lin.branches || []).find((b) => b.id === branchId) || null;
    }

    /** 全局升级表：upgradeId -> { upgrade, branch, lineage } */
    let _upgradeIndex = null;
    function rebuildUpgradeIndex() {
        const map = Object.create(null);
        allLineages().forEach((lin) => {
            (lin.branches || []).forEach((br) => {
                (br.upgrades || []).forEach((up) => {
                    map[up.id] = { upgrade: up, branch: br, lineage: lin };
                });
            });
        });
        _upgradeIndex = map;
        return map;
    }

    function upgradeIndex() {
        if (!_upgradeIndex) rebuildUpgradeIndex();
        return _upgradeIndex;
    }

    function lookupUpgrade(upgradeId) {
        return upgradeIndex()[upgradeId] || null;
    }

    function skillDisplayName(skillId) {
        const d = skillDef(skillId);
        return (d && d.name) || skillId;
    }

    function resolveCombatSkillId(entry) {
        if (!entry) return null;
        return entry.evolvedId || entry.id || null;
    }

    function entryBranchMods(entry) {
        if (!entry || !entry.branchMods) return [];
        return entry.branchMods.slice();
    }

    function scaleDamageFields(eff, mult) {
        if (!eff || mult == null || mult === 1) return;
        if (eff.mult != null) eff.mult *= mult;
        if (eff.pctOfAttack != null) eff.pctOfAttack *= mult;
    }

    function scaleHealShield(eff, op) {
        if (!eff) return;
        if (op.healMult != null && (eff.type === 'heal' || eff.type === 'heal_missing')) {
            if (eff.pct != null) eff.pct *= op.healMult;
            if (eff.mult != null) eff.mult *= op.healMult;
        }
        if (op.healMissingMult != null && eff.type === 'heal_missing' && eff.pct != null) {
            eff.pct *= op.healMissingMult;
        }
        if (op.shieldPctMult != null && eff.type === 'shield' && eff.pct != null) {
            eff.pct *= op.shieldPctMult;
        }
        if (op.shieldDurationMult != null && eff.type === 'shield' && eff.durationMs != null) {
            eff.durationMs = Math.floor(eff.durationMs * op.shieldDurationMult);
        }
        if (op.defenseBuffMult != null && eff.type === 'buff' && eff.stat === 'defense' && eff.pct != null) {
            eff.pct *= op.defenseBuffMult;
        }
        if (op.dotMult != null && (eff.type === 'dot' || eff.type === 'dot_aoe' || eff.type === 'stack_dot')) {
            scaleDamageFields(eff, op.dotMult);
            if (eff.pctOfAttack != null) eff.pctOfAttack *= op.dotMult;
        }
        if (op.dotDurationMult != null && (eff.type === 'dot' || eff.type === 'dot_aoe' || eff.type === 'stack_dot')) {
            if (eff.durationMs != null) eff.durationMs = Math.floor(eff.durationMs * op.dotDurationMult);
        }
        if (op.markAmpMult != null && eff.type === 'mark' && eff.amp != null) {
            eff.amp *= op.markAmpMult;
        }
        if (op.markDurationMult != null && (eff.type === 'mark' || eff.type === 'debuff') && eff.durationMs != null) {
            eff.durationMs = Math.floor(eff.durationMs * op.markDurationMult);
        }
        if (op.stunDurationBonusMs && eff.type === 'stun') {
            eff.durationMs = (eff.durationMs || 800) + (op.stunDurationBonusMs | 0);
        }
    }

    /** 将单条 mutate 应用到 effects 列表（与遗物 mutator 操作集对齐并扩展） */
    function applyMutateOp(list, def, op) {
        if (!op) return list;
        let out = list;
        if (op.replaceEffects && op.replaceEffects.length) {
            out = deepClone(op.replaceEffects);
        }
        if (op.forceAoe) {
            out.forEach((eff) => {
                if (!eff) return;
                if (eff.type === 'damage' || eff.type === 'stun' || eff.type === 'debuff' ||
                    eff.type === 'dot' || eff.type === 'stack_dot') {
                    eff.aoe = true;
                }
                if (op.damageMult != null) scaleDamageFields(eff, op.damageMult);
            });
            if (!out.some((e) => e && e.type === 'damage') && (def && def.damageMult > 0)) {
                out.unshift({
                    type: 'damage',
                    mult: (def.damageMult || 1) * (op.damageMult != null ? op.damageMult : 1),
                    aoe: true
                });
            }
        }
        if (op.addChainJumps) {
            let chain = out.find((e) => e && e.type === 'chain');
            if (chain) {
                chain.jumps = (chain.jumps || 2) + (op.addChainJumps | 0);
                if (op.damageMult != null) scaleDamageFields(chain, op.damageMult);
                if (op.chainFalloff != null) chain.falloff = op.chainFalloff;
            } else {
                const dmg = out.find((e) => e && e.type === 'damage');
                const baseMult = dmg && dmg.mult != null ? dmg.mult : (def && def.damageMult) || 1.3;
                const jumps = Math.max(2, 1 + (op.addChainJumps | 0));
                const chainEff = {
                    type: 'chain',
                    mult: baseMult * (op.damageMult != null ? op.damageMult : 1),
                    jumps: jumps,
                    falloff: op.chainFalloff != null ? op.chainFalloff : 0.88
                };
                if (dmg) {
                    const idx = out.indexOf(dmg);
                    out.splice(idx, 1, chainEff);
                } else {
                    out.unshift(chainEff);
                }
            }
        } else if (op.chainFalloff != null) {
            out.forEach((e) => {
                if (e && e.type === 'chain') e.falloff = op.chainFalloff;
            });
        }
        if (op.damageMult != null && !op.forceAoe && !op.addChainJumps && !op.replaceEffects) {
            out.forEach((eff) => {
                if (eff && (eff.type === 'damage' || eff.type === 'chain' ||
                    eff.type === 'dot' || eff.type === 'stack_dot')) {
                    scaleDamageFields(eff, op.damageMult);
                }
            });
        }
        if (op.splashMult != null) {
            out.forEach((eff) => {
                if (eff && (eff.type === 'damage' || eff.aoe)) {
                    eff.splashMult = (eff.splashMult != null ? eff.splashMult : 1) * op.splashMult;
                }
            });
        }
        if (op.addLifestealPct) {
            out.forEach((eff) => {
                if (eff && eff.type === 'damage') {
                    eff.lifestealPct = (eff.lifestealPct || 0) + op.addLifestealPct;
                }
            });
            if (op.onKillHealPct) {
                /* 近似：挂到 damage 上由战斗侧可读 */
                out.forEach((eff) => {
                    if (eff && eff.type === 'damage') {
                        eff.onKillHealPct = (eff.onKillHealPct || 0) + op.onKillHealPct;
                    }
                });
            }
        } else if (op.onKillHealPct) {
            out.forEach((eff) => {
                if (eff && eff.type === 'damage') {
                    eff.onKillHealPct = (eff.onKillHealPct || 0) + op.onKillHealPct;
                    eff.lifestealPct = (eff.lifestealPct || 0) + op.onKillHealPct;
                }
            });
        }
        if (op.executeBonus) {
            // 阈值取更高（更容易触发），但封顶防刺客一家独大
            const th = Math.min(
                0.34,
                op.executeBonus.threshold != null ? op.executeBonus.threshold : 0.3
            );
            const bonus = Math.min(
                2.7,
                op.executeBonus.bonusMult != null ? op.executeBonus.bonusMult : 2.5
            );
            out.forEach((eff) => {
                if (eff && eff.type === 'damage') {
                    if (eff.executeThreshold == null || th > eff.executeThreshold) {
                        eff.executeThreshold = th;
                    }
                    eff.executeBonusMult = Math.max(eff.executeBonusMult || 0, bonus);
                }
            });
        }
        out.forEach((eff) => scaleHealShield(eff, op));
        if (op.stackDotBonus) {
            out.forEach((eff) => {
                if (eff && eff.type === 'stack_dot') {
                    eff.maxStacks = (eff.maxStacks || 3) + (op.stackDotBonus | 0);
                }
            });
        }
        if (op.appendEffects && op.appendEffects.length) {
            out = out.concat(deepClone(op.appendEffects));
        }
        return out;
    }

    function applyBranchModsToEffects(effects, def, branchMods) {
        let list = deepClone(effects || []);
        (branchMods || []).forEach((modId) => {
            const hit = lookupUpgrade(modId);
            if (!hit || !hit.upgrade) return;
            list = applyMutateOp(list, def, hit.upgrade.mutate || {});
        });
        return list;
    }

    function applyBranchModsToInstance(sk, def, branchMods) {
        if (!sk) return sk;
        (branchMods || []).forEach((modId) => {
            const hit = lookupUpgrade(modId);
            if (!hit || !hit.upgrade) return;
            const op = hit.upgrade.mutate || {};
            if (op.forceAoe || (op.replaceEffects && op.replaceEffects.some((e) => e && e.aoe))) {
                sk.aoe = true;
            }
            if (op.addChainJumps) sk.chainJumpBonus = (sk.chainJumpBonus || 0) + (op.addChainJumps | 0);
            if (op.rangeBonus) sk.range = (sk.range || (def && def.range) || 120) + op.rangeBonus;
            if (op.cooldownMult != null) {
                sk.cooldownMs = Math.floor((sk.cooldownMs || 5000) * op.cooldownMult);
            }
            if (op.cooldownFlatMs) {
                sk.cooldownMs = Math.max(800, (sk.cooldownMs || 5000) + (op.cooldownFlatMs | 0));
            }
            if (op.startReady) sk.startReady = true;
        });
        return sk;
    }

    function branchesForSkill(skillId) {
        const out = [];
        if (!skillId) return out;
        allLineages().forEach((lin) => {
            (lin.branches || []).forEach((br) => {
                const ids = br.skillIds || [];
                const seeds = lin.seeds || [];
                if (ids.indexOf(skillId) >= 0 || (!ids.length && seeds.indexOf(skillId) >= 0)) {
                    out.push({ lineage: lin, branch: br });
                }
            });
        });
        return out;
    }

    function equippedSkillRefs(run) {
        const refs = [];
        (run && run.heroes || []).forEach((h) => {
            (h.skillSlots || []).forEach((entry, idx) => {
                if (!entry) return;
                const RSS = window.RunStateSystem;
                const norm = RSS && RSS.normalizeSkillEntry
                    ? RSS.normalizeSkillEntry(entry)
                    : entry;
                if (!norm || !norm.id) return;
                refs.push({
                    heroId: h.heroId,
                    hero: h,
                    slotIndex: idx,
                    entry: norm,
                    skillId: norm.id,
                    combatId: resolveCombatSkillId(norm)
                });
            });
        });
        return refs;
    }

    function countOwnedUpgradesOnEntry(entry, branchId) {
        const mods = entryBranchMods(entry);
        let n = 0;
        mods.forEach((mid) => {
            const hit = lookupUpgrade(mid);
            if (hit && hit.branch && hit.branch.id === branchId) n += 1;
        });
        return n;
    }

    function lineageUpgradeCounts(run) {
        const counts = Object.create(null);
        allLineages().forEach((l) => { counts[l.id] = 0; });
        equippedSkillRefs(run).forEach((ref) => {
            entryBranchMods(ref.entry).forEach((mid) => {
                const hit = lookupUpgrade(mid);
                if (hit && hit.lineage) {
                    counts[hit.lineage.id] = (counts[hit.lineage.id] || 0) + 1;
                }
            });
        });
        return counts;
    }

    function activeDuoSparks(run) {
        const counts = lineageUpgradeCounts(run);
        return allDuoSparks().filter((sp) => {
            const need = sp.need || {};
            return Object.keys(need).every((lid) => (counts[lid] || 0) >= need[lid]);
        });
    }

    /** 合并已激活跨派系火花到战斗被动包（挂到 relicFx） */
    function aggregateDuoSparkEffects(run) {
        const agg = {
            chainFalloffBonus: 0,
            markedDotMult: 1,
            shieldedHealMult: 1,
            healToShieldBonus: 0,
            aoeFrontShieldPct: 0,
            glassCooldownMult: 1,
            chainAppendIgnite: false,
            executeKillFrenzyMs: 0
        };
        activeDuoSparks(run).forEach((sp) => {
            const e = sp.effects || {};
            if (e.chainFalloffBonus) agg.chainFalloffBonus += e.chainFalloffBonus;
            if (e.markedDotMult) agg.markedDotMult *= e.markedDotMult;
            if (e.shieldedHealMult) agg.shieldedHealMult *= e.shieldedHealMult;
            if (e.healToShieldBonus) agg.healToShieldBonus += e.healToShieldBonus;
            if (e.aoeFrontShieldPct) agg.aoeFrontShieldPct = Math.max(agg.aoeFrontShieldPct, e.aoeFrontShieldPct);
            if (e.glassCooldownMult) agg.glassCooldownMult *= e.glassCooldownMult;
            if (e.chainAppendIgnite) agg.chainAppendIgnite = true;
            if (e.executeKillFrenzyMs) {
                agg.executeKillFrenzyMs = Math.max(agg.executeKillFrenzyMs, e.executeKillFrenzyMs);
            }
        });
        return agg;
    }

    function isShapeMutate(op) {
        if (!op) return false;
        return !!(op.forceAoe || op.addChainJumps || op.executeBonus ||
            (op.appendEffects && op.appendEffects.length) ||
            (op.replaceEffects && op.replaceEffects.length) ||
            op.splashMult != null || op.addLifestealPct ||
            op.shieldPctMult != null || op.healMult != null ||
            op.dotMult != null || op.stunDurationBonusMs ||
            op.rangeBonus || op.startReady);
    }

    function isStatOnlyMutate(op) {
        if (!op || isShapeMutate(op)) return false;
        const keys = Object.keys(op);
        return keys.length > 0 && keys.every((k) =>
            k === 'damageMult' || k === 'cooldownMult' || k === 'cooldownFlatMs');
    }

    function shapeOfferWeightMult(op) {
        const rewards = cfg().rewards || {};
        const shapeBonus = rewards.shapeOfferWeightBonus != null ? rewards.shapeOfferWeightBonus : 1.75;
        const statPenalty = rewards.statOnlyOfferWeightPenalty != null ? rewards.statOnlyOfferWeightPenalty : 0.55;
        if (isShapeMutate(op)) return shapeBonus;
        if (isStatOnlyMutate(op)) return statPenalty;
        return 1;
    }

    /** 供战斗 VFX 读取：该技能分支强化带来的表现缩放 */
    function summarizeBranchVfx(branchMods) {
        const out = {
            impactScale: 1,
            orbScale: 1,
            hasDot: false,
            forceAoe: false,
            splashBoost: 1,
            chainBonus: 0,
            intensity: 0
        };
        (branchMods || []).forEach((modId) => {
            const hit = lookupUpgrade(modId);
            if (!hit || !hit.upgrade) return;
            const op = hit.upgrade.mutate || {};
            out.intensity += 1;
            if (op.forceAoe) {
                out.forceAoe = true;
                out.impactScale = Math.max(out.impactScale, 1.55);
                out.orbScale = Math.max(out.orbScale, 1.35);
            }
            if (op.splashMult != null) {
                out.splashBoost *= op.splashMult;
                out.impactScale = Math.max(out.impactScale, 1.2 + (op.splashMult - 1) * 0.8);
            }
            if (op.damageMult != null && op.damageMult > 1) {
                out.impactScale = Math.max(out.impactScale, 1 + (op.damageMult - 1) * 0.9);
                out.orbScale = Math.max(out.orbScale, 1 + (op.damageMult - 1) * 0.5);
            }
            if (op.addChainJumps) out.chainBonus += (op.addChainJumps | 0);
            if (op.appendEffects && op.appendEffects.some((e) => e &&
                (e.type === 'dot' || e.type === 'dot_aoe' || e.type === 'stack_dot'))) {
                out.hasDot = true;
                out.impactScale = Math.max(out.impactScale, 1.35);
            }
            if (op.dotMult != null && op.dotMult > 1) out.hasDot = true;
        });
        out.impactScale = Math.min(2.2, out.impactScale);
        out.orbScale = Math.min(1.8, out.orbScale);
        return out;
    }

    function formatUpgradeOfferTitle(skillId) {
        return '【' + skillDisplayName(skillId) + '】强化';
    }

    function formatEvolveOfferTitle(skillId) {
        return '【' + skillDisplayName(skillId) + '】质变';
    }

    /** 分支名展示：去掉尾缀「支」，避免词条框过于冗长 */
    function formatBranchTagName(branchName) {
        const n = String(branchName || '');
        return n.replace(/支$/, '') || n;
    }

    function pctText(v) {
        if (v == null || isNaN(v)) return '';
        const n = Math.round(v * 1000) / 10;
        return (n % 1 === 0 ? String(n | 0) : String(n)) + '%';
    }

    function multText(v) {
        if (v == null || isNaN(v)) return '';
        const n = Math.round(v * 100) / 100;
        return '×' + String(n);
    }

    function describeAppendEffect(eff) {
        if (!eff || !eff.type) return '';
        switch (eff.type) {
            case 'damage':
                return (eff.aoe ? '追加范围伤害' : '追加伤害') +
                    (eff.mult != null ? '（' + pctText(eff.mult) + ' 攻击）' : '');
            case 'dot':
                return '追加灼烧/中毒' +
                    (eff.pctOfAttack != null ? '（每跳约 ' + pctText(eff.pctOfAttack) + ' 攻击）' : '') +
                    (eff.durationMs != null ? '，持续 ' + Math.round(eff.durationMs / 1000) + ' 秒' : '');
            case 'dot_aoe':
                return '追加范围持续伤害' +
                    (eff.pctOfAttack != null ? '（约 ' + pctText(eff.pctOfAttack) + ' 攻击）' : '');
            case 'stack_dot':
                return '追加叠层持续伤害';
            case 'stun':
                return (eff.aoe ? '追加群体眩晕' : '追加眩晕') +
                    (eff.durationMs != null ? ' ' + eff.durationMs + 'ms' : '');
            case 'shield': {
                const tgt = eff.target === 'allies' ? '全队'
                    : eff.target === 'front_allies' ? '前排'
                        : eff.target === 'lowest_ally' ? '最低血友军' : '自身';
                return '获得' + tgt + '护盾' +
                    (eff.pct != null ? '（' + pctText(eff.pct) + ' 最大生命）' : '');
            }
            case 'heal':
            case 'heal_missing': {
                const tgt = eff.target === 'lowest_ally' ? '最低血友军'
                    : eff.target === 'allies' ? '全队' : '自身';
                const kind = eff.type === 'heal_missing' ? '按已损失生命回复' : '回复';
                return kind + tgt +
                    (eff.pct != null ? '（' + pctText(eff.pct) + '）' : '');
            }
            case 'buff':
                if (eff.stat === 'defense') {
                    return '提升防御' + (eff.pct != null ? ' ' + pctText(eff.pct) : '') +
                        (eff.durationMs != null ? '，' + Math.round(eff.durationMs / 1000) + ' 秒' : '');
                }
                if (eff.stat === 'damageTaken') {
                    return '受到伤害' + (eff.pct != null ? ' ' + pctText(eff.pct) : '') +
                        (eff.durationMs != null ? '，' + Math.round(eff.durationMs / 1000) + ' 秒' : '');
                }
                if (eff.stat === 'deathSave') return '短时免死姿态';
                return '附加增益' + (eff.stat ? '（' + eff.stat + '）' : '');
            case 'debuff':
                if (eff.stat === 'defense') {
                    return (eff.aoe ? '范围减防' : '减防') +
                        (eff.pct != null ? ' ' + pctText(eff.pct) : '') +
                        (eff.durationMs != null ? '，' + Math.round(eff.durationMs / 1000) + ' 秒' : '');
                }
                return '附加减益';
            case 'mark':
                return '附加标记' + (eff.amp != null ? '（易伤 ' + pctText(eff.amp) : '') +
                    (eff.amp != null ? '）' : '');
            default:
                return '追加效果：' + eff.type;
        }
    }

    /** 把 mutate 操作集转成玩家可读的具体效果句 */
    function describeMutateOp(op) {
        if (!op) return '';
        const parts = [];
        if (op.damageMult != null && op.damageMult !== 1) {
            parts.push('技能伤害 ' + multText(op.damageMult));
        }
        if (op.cooldownMult != null && op.cooldownMult !== 1) {
            const faster = op.cooldownMult < 1;
            parts.push('冷却 ' + multText(op.cooldownMult) + (faster ? '（更快）' : '（更慢）'));
        }
        if (op.cooldownFlatMs) {
            parts.push('冷却 ' + (op.cooldownFlatMs > 0 ? '+' : '') + op.cooldownFlatMs + 'ms');
        }
        if (op.forceAoe) parts.push('变为群体伤害');
        if (op.splashMult != null && op.splashMult !== 1) {
            parts.push('溅射/范围 ' + multText(op.splashMult));
        }
        if (op.addChainJumps) parts.push('弹射跳数 +' + (op.addChainJumps | 0));
        if (op.chainFalloff != null) {
            parts.push(op.chainFalloff >= 1 ? '弹射不衰减' : '弹射衰减改为 ' + multText(op.chainFalloff));
        }
        if (op.rangeBonus) parts.push('射程 +' + op.rangeBonus);
        if (op.addLifestealPct) parts.push('吸血 +' + pctText(op.addLifestealPct));
        if (op.onKillHealPct) parts.push('击杀回复约 ' + pctText(op.onKillHealPct) + ' 生命');
        if (op.executeBonus) {
            const th = op.executeBonus.threshold != null ? op.executeBonus.threshold : 0.3;
            const bonus = op.executeBonus.bonusMult != null ? op.executeBonus.bonusMult : 2.5;
            parts.push('斩杀：生命低于 ' + pctText(th) + ' 时伤害 ' + multText(bonus));
        }
        if (op.shieldPctMult != null && op.shieldPctMult !== 1) {
            parts.push('护盾量 ' + multText(op.shieldPctMult));
        }
        if (op.shieldDurationMult != null && op.shieldDurationMult !== 1) {
            parts.push('护盾持续 ' + multText(op.shieldDurationMult));
        }
        if (op.defenseBuffMult != null && op.defenseBuffMult !== 1) {
            parts.push('防御增益 ' + multText(op.defenseBuffMult));
        }
        if (op.healMult != null && op.healMult !== 1) {
            parts.push('治疗量 ' + multText(op.healMult));
        }
        if (op.healMissingMult != null && op.healMissingMult !== 1) {
            parts.push('残血回复 ' + multText(op.healMissingMult));
        }
        if (op.dotMult != null && op.dotMult !== 1) {
            parts.push('持续伤害 ' + multText(op.dotMult));
        }
        if (op.dotDurationMult != null && op.dotDurationMult !== 1) {
            parts.push('持续时长 ' + multText(op.dotDurationMult));
        }
        if (op.markAmpMult != null && op.markAmpMult !== 1) {
            parts.push('印记易伤 ' + multText(op.markAmpMult));
        }
        if (op.markDurationMult != null && op.markDurationMult !== 1) {
            parts.push('印记时长 ' + multText(op.markDurationMult));
        }
        if (op.stunDurationBonusMs) {
            parts.push('眩晕 +' + op.stunDurationBonusMs + 'ms');
        }
        if (op.stackDotBonus) parts.push('叠毒层数 +' + (op.stackDotBonus | 0));
        if (op.startReady) parts.push('开场该技能更快就绪');
        if (op.appendEffects && op.appendEffects.length) {
            op.appendEffects.forEach((eff) => {
                const line = describeAppendEffect(eff);
                if (line) parts.push(line);
            });
        }
        if (op.replaceEffects && op.replaceEffects.length) {
            parts.push('技能效果形态改变');
        }
        return parts.join('；');
    }

    function describeUpgrade(upgrade) {
        if (!upgrade) return '';
        const effect = describeMutateOp(upgrade.mutate || {});
        if (effect) return effect;
        return upgrade.description || upgrade.name || '';
    }

    function describeEvolve(intoId, fromId) {
        const into = skillDef(intoId);
        const from = skillDef(fromId);
        const parts = [];
        parts.push('技能进化为「' + skillDisplayName(intoId) + '」');
        if (into && into.description) {
            parts.push(into.description);
        } else if (into && from) {
            if (into.damageMult && from.damageMult && into.damageMult !== from.damageMult) {
                parts.push('伤害倍率 ' + multText(into.damageMult / Math.max(0.01, from.damageMult)));
            }
            if (into.cooldownMs && from.cooldownMs && into.cooldownMs !== from.cooldownMs) {
                parts.push('冷却 ' + multText(into.cooldownMs / Math.max(1, from.cooldownMs)));
            }
        }
        return parts.join('。');
    }

    function listAvailableUpgradeOffers(run) {
        const offers = [];
        const counts = lineageUpgradeCounts(run);
        equippedSkillRefs(run).forEach((ref) => {
            const owned = new Set(entryBranchMods(ref.entry));
            const baseId = ref.skillId;
            branchesForSkill(baseId).forEach(({ lineage, branch }) => {
                const linCount = counts[lineage.id] || 0;
                (branch.upgrades || []).forEach((up) => {
                    if (owned.has(up.id)) return;
                    let weight = 1;
                    if (linCount >= 2) weight *= 1.5;
                    else if (linCount >= 1) weight *= 1.25;
                    const rarity = up.rarity || 'common';
                    if (rarity === 'uncommon') weight *= 0.85;
                    if (rarity === 'rare') weight *= 0.65;
                    weight *= shapeOfferWeightMult(up.mutate || {});
                    const effectText = describeUpgrade(up);
                    offers.push({
                        type: 'skill_upgrade',
                        skillId: baseId,
                        heroId: ref.heroId,
                        slotIndex: ref.slotIndex,
                        lineageId: lineage.id,
                        lineageName: lineage.name,
                        branchId: branch.id,
                        branchName: branch.name,
                        upgradeId: up.id,
                        upgradeName: up.name,
                        rarity: rarity,
                        description: effectText,
                        effectText: effectText,
                        title: formatUpgradeOfferTitle(baseId),
                        branchTag: formatBranchTagName(branch.name),
                        weight: weight
                    });
                });
            });
        });
        return offers;
    }

    function listAvailableEvolveOffers(run) {
        const offers = [];
        equippedSkillRefs(run).forEach((ref) => {
            if (ref.entry.evolvedId) return;
            const baseId = ref.skillId;
            branchesForSkill(baseId).forEach(({ lineage, branch }) => {
                const ev = branch.evolve;
                if (!ev || !ev.into) return;
                if (ev.from && ev.from !== baseId) return;
                const need = ev.needUpgrades != null ? ev.needUpgrades : 2;
                if (countOwnedUpgradesOnEntry(ref.entry, branch.id) < need) return;
                const effectText = describeEvolve(ev.into, baseId);
                offers.push({
                    type: 'skill_evolve',
                    skillId: baseId,
                    heroId: ref.heroId,
                    slotIndex: ref.slotIndex,
                    lineageId: lineage.id,
                    lineageName: lineage.name,
                    branchId: branch.id,
                    branchName: branch.name,
                    intoId: ev.into,
                    intoName: skillDisplayName(ev.into),
                    title: formatEvolveOfferTitle(baseId),
                    description: effectText,
                    effectText: effectText,
                    branchTag: formatBranchTagName(branch.name),
                    weight: 1.15
                });
            });
        });
        return offers;
    }

    function weightedPick(rng, items, weightFn) {
        const r = rng || Math.random;
        let total = 0;
        const weights = items.map((it) => {
            const w = Math.max(0.01, weightFn ? weightFn(it) : (it.weight || 1));
            total += w;
            return w;
        });
        if (!items.length || total <= 0) return null;
        let roll = r() * total;
        for (let i = 0; i < items.length; i++) {
            roll -= weights[i];
            if (roll <= 0) return items[i];
        }
        return items[items.length - 1];
    }

    function takeUnique(rng, pool, n, keyFn) {
        const r = rng || Math.random;
        const bag = pool.slice();
        const out = [];
        const seen = new Set();
        while (out.length < n && bag.length) {
            const pick = weightedPick(r, bag, (it) => it.weight || 1);
            if (!pick) break;
            const idx = bag.indexOf(pick);
            if (idx >= 0) bag.splice(idx, 1);
            const key = keyFn ? keyFn(pick) : (pick.upgradeId || pick.intoId || pick.type + Math.random());
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(pick);
        }
        return out;
    }

    function makeNewSkillOffer(run, rng) {
        const r = rng || Math.random;
        const RSS = window.RunStateSystem;
        if (!RSS || RSS.skillBudgetReached(run)) return null;
        const hero = run.heroes[Math.floor(r() * Math.max(1, run.heroes.length))];
        const syn = r() > 0.35 && RSS.pickSynergySkill
            ? RSS.pickSynergySkill(run, r)
            : RSS.pickSkillFromPool(r, hero);
        if (!syn) return null;
        return {
            type: 'skill',
            skill: RSS.makeSkillLoot(syn.id),
            bias: 'new',
            title: '新技能「' + (syn.name || syn.id) + '」',
            weight: 1
        };
    }

    function makeFillerOffer(run, rng, prefer) {
        const r = rng || Math.random;
        const RSS = window.RunStateSystem;
        const rewards = cfg().rewards || {};
        const kind = prefer || (r() > 0.5 ? 'gear' : (r() > 0.45 ? 'gold' : 'heal'));
        if (kind === 'gear' && RSS && !RSS.gearBudgetReached(run)) {
            const hero = run.heroes[Math.floor(r() * Math.max(1, run.heroes.length))];
            return {
                type: 'gear',
                gear: RSS.makeGearLoot(r, null, hero.baseClass),
                bias: 'gear',
                title: '装备',
                weight: 0.8
            };
        }
        if (kind === 'heal') {
            return { type: 'heal', pct: 0.2, bias: 'heal', title: '全队回复', weight: 0.7 };
        }
        const goldRange = rewards.battleDraftGold || [18, 32];
        const amt = Math.floor(goldRange[0] + r() * (goldRange[1] - goldRange[0]));
        return { type: 'gold', amount: amt, bias: 'gold', title: '+' + amt + ' G', weight: 0.7 };
    }

    /**
     * 普通战三选一：强化为主，但每场通常保留至少 1 个非强化位（新技能/装备/金币等）
     */
    function buildBattleOffers(run, rng) {
        const r = rng || Math.random;
        const rewards = cfg().rewards || {};
        const upW = rewards.skillUpgradeOfferWeight != null ? rewards.skillUpgradeOfferWeight : 1;
        const newW = rewards.newSkillOfferWeight != null ? rewards.newSkillOfferWeight : 0.62;
        const evW = rewards.skillEvolveOfferWeight != null ? rewards.skillEvolveOfferWeight : 1.15;
        const maxEv = rewards.maxEvolveOffersPerBattle != null ? rewards.maxEvolveOffersPerBattle : 1;
        // 三选一里强化最多占 2 格，避免新技能被挤没
        const maxUp = rewards.maxUpgradeOffersPerBattle != null ? rewards.maxUpgradeOffersPerBattle : 2;
        // 未达技能预算时，至少塞一张新技能的概率
        const guaranteeNewP = rewards.guaranteeNewSkillChance != null ? rewards.guaranteeNewSkillChance : 0.72;

        const RSS = window.RunStateSystem;
        const options = [];
        const upgrades = listAvailableUpgradeOffers(run).map((o) => {
            const c = Object.assign({}, o);
            c.weight = (c.weight || 1) * upW;
            return c;
        });
        const evolves = listAvailableEvolveOffers(run).map((o) => {
            const c = Object.assign({}, o);
            c.weight = (c.weight || 1) * evW;
            return c;
        });

        // 1) 质变最多 1
        const pickedEv = takeUnique(r, evolves, maxEv, (o) => o.skillId + ':' + o.intoId);
        pickedEv.forEach((o) => options.push(o));

        // 2) 高概率保底一张新技能（在强化填满之前先占位）
        let reservedNew = null;
        if (RSS && !RSS.skillBudgetReached(run) && r() < Math.max(0, Math.min(1, guaranteeNewP * (newW / 0.62)))) {
            reservedNew = makeNewSkillOffer(run, r);
            if (reservedNew) {
                reservedNew.weight = newW;
                options.push(reservedNew);
            }
        }

        // 3) 强化填剩余位，但不超过 maxUp
        const upSlots = Math.min(maxUp, 3 - options.length);
        const pickedUp = takeUnique(
            r,
            upgrades,
            Math.max(0, upSlots),
            (o) => o.upgradeId + '@' + o.heroId + ':' + o.slotIndex
        );
        pickedUp.forEach((o) => options.push(o));

        // 4) 若还没保底到新技能，且仍有空位，再尝试塞一张
        if (!reservedNew && options.length < 3 && RSS && !RSS.skillBudgetReached(run) && r() < newW) {
            const skOffer = makeNewSkillOffer(run, r);
            if (skOffer) {
                const dup = options.some((o) => o.type === 'skill' && o.skill && o.skill.id === skOffer.skill.id);
                if (!dup) options.push(skOffer);
            }
        }

        // 5) 其余用装备/金币/治疗/额外新技能补满
        let guard = 0;
        while (options.length < 3 && guard++ < 12) {
            if (RSS && !RSS.skillBudgetReached(run) && r() < newW * 0.85) {
                const skOffer = makeNewSkillOffer(run, r);
                if (skOffer) {
                    const dup = options.some((o) => o.type === 'skill' && o.skill && o.skill.id === skOffer.skill.id);
                    if (!dup) {
                        options.push(skOffer);
                        continue;
                    }
                }
            }
            options.push(makeFillerOffer(run, r));
        }
        while (options.length < 3) {
            options.push(makeFillerOffer(run, r, 'gold'));
        }

        // 若一场里完全没有强化/质变，而升级池有货，强制替换一张为强化
        if (!options.some((o) => o.type === 'skill_upgrade' || o.type === 'skill_evolve') && upgrades.length) {
            const u = weightedPick(r, upgrades, (it) => it.weight || 1);
            if (u) {
                // 优先顶掉金币/治疗，保留新技能
                let idx = options.findIndex((o) => o.type === 'gold' || o.type === 'heal');
                if (idx < 0) idx = options.findIndex((o) => o.type === 'gear');
                if (idx < 0) idx = 0;
                options[idx] = u;
            }
        }

        // 轻度洗牌，避免第一格永远是强化
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(r() * (i + 1));
            const tmp = options[i];
            options[i] = options[j];
            options[j] = tmp;
        }

        return options.slice(0, 3);
    }

    function findEquippedEntry(run, heroId, slotIndex, skillId) {
        const hero = (run.heroes || []).find((h) => h.heroId === heroId);
        if (!hero) return null;
        let entry = hero.skillSlots[slotIndex];
        const RSS = window.RunStateSystem;
        let norm = RSS ? RSS.normalizeSkillEntry(entry) : entry;
        if (norm && skillId && norm.id !== skillId) {
            // 槽位可能变了，重找
            for (let i = 0; i < (hero.skillSlots || []).length; i++) {
                const e = RSS ? RSS.normalizeSkillEntry(hero.skillSlots[i]) : hero.skillSlots[i];
                if (e && e.id === skillId) {
                    slotIndex = i;
                    norm = e;
                    break;
                }
            }
        }
        if (!norm) return null;
        return { hero, slotIndex, entry: norm };
    }

    function applySkillUpgrade(run, offer) {
        if (!run || !offer) return { ok: false, message: '无效升级' };
        const found = findEquippedEntry(run, offer.heroId, offer.slotIndex, offer.skillId);
        if (!found) return { ok: false, message: '未装备该技能' };
        const mods = entryBranchMods(found.entry);
        if (mods.indexOf(offer.upgradeId) >= 0) return { ok: false, message: '已拥有该强化' };
        mods.push(offer.upgradeId);
        found.entry.branchMods = mods;
        found.hero.skillSlots[found.slotIndex] = found.entry;
        return {
            ok: true,
            kind: 'skill_upgrade',
            skillId: offer.skillId,
            upgradeId: offer.upgradeId,
            title: offer.title,
            heroId: found.hero.heroId,
            slotIndex: found.slotIndex
        };
    }

    function applySkillEvolve(run, offer) {
        if (!run || !offer) return { ok: false, message: '无效质变' };
        const found = findEquippedEntry(run, offer.heroId, offer.slotIndex, offer.skillId);
        if (!found) return { ok: false, message: '未装备该技能' };
        if (found.entry.evolvedId) return { ok: false, message: '已质变' };
        if (!skillDef(offer.intoId)) return { ok: false, message: '质变目标不存在' };
        found.entry.evolvedId = offer.intoId;
        found.hero.skillSlots[found.slotIndex] = found.entry;
        return {
            ok: true,
            kind: 'skill_evolve',
            skillId: offer.skillId,
            intoId: offer.intoId,
            title: offer.title,
            heroId: found.hero.heroId,
            slotIndex: found.slotIndex
        };
    }

    function describeEntryBranches(entry) {
        const mods = entryBranchMods(entry);
        if (!mods.length) return [];
        const byBranch = Object.create(null);
        mods.forEach((mid) => {
            const hit = lookupUpgrade(mid);
            if (!hit) return;
            const key = hit.branch.id;
            if (!byBranch[key]) {
                byBranch[key] = {
                    lineageName: hit.lineage.name,
                    branchName: hit.branch.name,
                    upgrades: [],
                    effects: []
                };
            }
            byBranch[key].upgrades.push(hit.upgrade.name);
            const eff = describeUpgrade(hit.upgrade);
            if (eff) byBranch[key].effects.push(hit.upgrade.name + '：' + eff);
        });
        return Object.keys(byBranch).map((k) => byBranch[k]);
    }

    function lineageProgressList(run) {
        const counts = lineageUpgradeCounts(run);
        return allLineages()
            .filter((l) => (counts[l.id] || 0) > 0)
            .map((l) => ({
                id: l.id,
                name: l.name,
                count: counts[l.id] || 0
            }))
            .sort((a, b) => b.count - a.count);
    }

    function invalidateCache() {
        _upgradeIndex = null;
    }

    window.SkillMutationSystem = {
        cfg,
        skillDef,
        allLineages,
        getLineage,
        getBranch,
        lookupUpgrade,
        rebuildUpgradeIndex,
        invalidateCache,
        resolveCombatSkillId,
        entryBranchMods,
        applyBranchModsToEffects,
        applyBranchModsToInstance,
        applyMutateOp,
        branchesForSkill,
        equippedSkillRefs,
        lineageUpgradeCounts,
        activeDuoSparks,
        aggregateDuoSparkEffects,
        listAvailableUpgradeOffers,
        listAvailableEvolveOffers,
        buildBattleOffers,
        applySkillUpgrade,
        applySkillEvolve,
        formatUpgradeOfferTitle,
        formatEvolveOfferTitle,
        formatBranchTagName,
        isShapeMutate,
        summarizeBranchVfx,
        describeMutateOp,
        describeUpgrade,
        describeEvolve,
        describeEntryBranches,
        lineageProgressList,
        skillDisplayName
    };
})();
