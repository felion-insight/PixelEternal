/**
 * Pixel Eternal - 流派被动 + 流派装备 skillModifiers（v2.0）
 */
(function () {
    'use strict';

    function passiveCfg(buildId) {
        const root = window.CLASS_BUILD_PASSIVES;
        return root && root.passives && root.passives[buildId] ? root.passives[buildId] : null;
    }

    function ensureBuildState(player) {
        if (!player._buildState) player._buildState = {};
        return player._buildState;
    }

    window.getPlayerActiveBuild = function getPlayerActiveBuild(player) {
        if (!player || !window.hasPlayerClass || !window.hasPlayerClass(player.classData)) return null;
        const level = Math.max(1, player.level | 0);
        if (level < 60) return null;
        const skills = typeof window.getUnlockedSkillsForPlayer === 'function'
            ? window.getUnlockedSkillsForPlayer(player) : [];
        const leg = skills.find(s => s.slotType === 'legendary' && s.buildId);
        return leg ? leg.buildId : null;
    };

    window.applyBuildPassiveStats = function applyBuildPassiveStats(player) {
        const buildId = window.getPlayerActiveBuild(player);
        const cfg = buildId ? passiveCfg(buildId) : null;
        const st = ensureBuildState(player);
        st.activeBuildId = buildId;

        if (!cfg) return;

        if (buildId === 'blood_demon') {
            const bonus = cfg.maxHpBonusPercent || 0;
            const stacks = st.bloodHpStacks || 0;
            player.maxHp = Math.floor(player.maxHp * (1 + bonus / 100 + stacks / 100));
            player.lifeStealPercent = Math.min(40, (player.lifeStealPercent || 0) + (cfg.lifeStealPercent || 0));
        }
        if (buildId === 'thorns') {
            player.thornPercent = Math.min(40, (player.thornPercent || 0) + (cfg.thornPercent || 0));
        }
        if (buildId === 'arcane' && cfg.skillCostReductionPercent) {
            st.skillCostReduction = cfg.skillCostReductionPercent;
        }
    };

    window.modifyBuildHealing = function modifyBuildHealing(player, amount) {
        const buildId = window.getPlayerActiveBuild(player);
        if (buildId !== 'blood_demon') return amount;
        const cfg = passiveCfg('blood_demon');
        return Math.floor(amount * (cfg.healingReceivedMult != null ? cfg.healingReceivedMult : 1));
    };

    window.getBuildDamageMultiplier = function getBuildDamageMultiplier(player, monster, skillDef) {
        const buildId = window.getPlayerActiveBuild(player);
        if (!buildId || !monster) return 1;
        const cfg = passiveCfg(buildId);
        const st = ensureBuildState(player);
        let mult = 1;

        if (buildId === 'retribution' && st.holyEnergy > 0 && cfg) {
            mult *= 1 + st.holyEnergy * (cfg.damageBonusPerEnergy || 0);
        }
        if (buildId === 'executioner' && cfg && monster.maxHp > 0) {
            const ratio = monster.hp / monster.maxHp;
            if (ratio <= (cfg.executeThresholdPercent || 30) / 100) {
                mult *= cfg.executeDamageMult || 1.8;
            }
        }
        if (buildId === 'night_lord' && cfg) {
            const now = Date.now();
            if (player._stealthUntil && player._stealthUntil > now) {
                mult *= cfg.stealthDamageMult || 1.4;
            }
            if (st.postVanishUntil && st.postVanishUntil > now) {
                mult *= cfg.postVanishDamageMult || 2;
                st.postVanishUntil = 0;
            }
        }
        if (buildId === 'arcane' && st.arcaneStacks > 0 && cfg) {
            mult *= 1 + st.arcaneStacks * (cfg.masteryDamagePerStack || 0.08);
        }
        return mult;
    };

    window.onBuildSkillHit = function onBuildSkillHit(player, monster, skillDef, damage, gameInstance) {
        if (!player || !monster) return;
        const buildId = window.getPlayerActiveBuild(player);
        if (!buildId) return;
        const cfg = passiveCfg(buildId);
        const st = ensureBuildState(player);

        if (buildId === 'retribution' && cfg) {
            st.holyEnergy = Math.min(cfg.holyEnergyMax || 100,
                (st.holyEnergy || 0) + (cfg.holyEnergyOnSkillHit || 8));
        }
        if (buildId === 'arcane' && cfg && skillDef) {
            const el = (skillDef.statusEffects && skillDef.statusEffects[0] && skillDef.statusEffects[0].type)
                || (skillDef.entityConfig && skillDef.entityConfig.statusOnHit && skillDef.entityConfig.statusOnHit[0]
                    && skillDef.entityConfig.statusOnHit[0].type) || skillDef.id;
            if (st.lastElement !== el) {
                st.arcaneStacks = Math.min(cfg.masteryMaxStacks || 5, (st.arcaneStacks || 0) + 1);
                st.lastElement = el;
                st.arcaneResetAt = Date.now() + (cfg.masteryResetMs || 8000);
            }
        }
        if (buildId === 'chrono' && cfg) {
            st.chronoSkillCount = (st.chronoSkillCount || 0) + 1;
            if (st.chronoSkillCount >= (cfg.skillCountForCooldownReset || 3)) {
                st.chronoSkillCount = 0;
                const pct = cfg.cooldownReductionPercent || 15;
                if (player.skillCooldowns) {
                    Object.keys(player.skillCooldowns).forEach(k => {
                        const rem = player.skillCooldowns[k] - Date.now();
                        if (rem > 0) player.skillCooldowns[k] = Date.now() + Math.floor(rem * (1 - pct / 100));
                    });
                }
                if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                    gameInstance.addFloatingText(player.x, player.y - 40, '时空回溯!', '#88ddff');
                }
            }
            if (cfg.slowOnHitPercent) {
                if (!monster.slowEffects) monster.slowEffects = [];
                monster.slowEffects.push({
                    multiplier: 1 - (cfg.slowOnHitPercent / 100),
                    expireTime: Date.now() + (cfg.slowOnHitMs || 2000)
                });
            }
        }
        if (buildId === 'infection' && cfg && typeof window.applySkillStatusEffects === 'function') {
            const dur = Math.floor(4000 * (1 + (cfg.poisonDurationBonusPercent || 0) / 100));
            window.applySkillStatusEffects(
                { statusEffects: [{ type: 'poison', durationMs: dur }] },
                monster, player, gameInstance
            );
        }
    };

    window.onBuildMonsterKilled = function onBuildMonsterKilled(player, monster, gameInstance) {
        if (!player || !monster) return;
        const buildId = window.getPlayerActiveBuild(player);
        if (!buildId) return;
        const cfg = passiveCfg(buildId);
        const st = ensureBuildState(player);

        if (buildId === 'blood_demon' && cfg) {
            const cap = cfg.maxHpStackCapPercent || 50;
            const add = cfg.maxHpOnKillPercent || 2;
            st.bloodHpStacks = Math.min(cap, (st.bloodHpStacks || 0) + add);
            player.updateStats();
            if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(player.x, player.y - 36, `血魔 +${add}%上限`, '#cc2244');
            }
        }
        if (buildId === 'corpse_explosion' && cfg && gameInstance) {
            const radius = cfg.explosionRadius || 90;
            const mult = cfg.explosionDamageMult || 0.8;
            const dmg = Math.max(1, Math.floor(
                (typeof window.getPlayerEffectiveAttack === 'function'
                    ? window.getPlayerEffectiveAttack(player) : player.baseAttack) * mult
            ));
            const targets = gameInstance.getCurrentSceneTargets
                ? gameInstance.getCurrentSceneTargets() : [];
            targets.forEach(m => {
                if (!m || m === monster || m.hp <= 0) return;
                if (Math.hypot(m.x - monster.x, m.y - monster.y) <= radius) {
                    m.takeDamage(dmg);
                    if (cfg.statusOnExplosion && typeof window.applySkillStatusEffects === 'function') {
                        window.applySkillStatusEffects(
                            { statusEffects: [{ type: cfg.statusOnExplosion, durationMs: 4000 }] },
                            m, player, gameInstance
                        );
                    }
                }
            });
            if (typeof gameInstance.addEquipmentEffect === 'function') {
                gameInstance.addEquipmentEffect('fire_explosion', monster.x, monster.y, { radius, duration: 500 });
            }
        }
    };

    window.onBuildBreak = function onBuildBreak(player) {
        const buildId = window.getPlayerActiveBuild(player);
        if (buildId !== 'retribution') return;
        const cfg = passiveCfg('retribution');
        const st = ensureBuildState(player);
        st.holyEnergy = Math.min(cfg.holyEnergyMax || 100,
            (st.holyEnergy || 0) + (cfg.holyEnergyOnBreak || 25));
    };

    window.onBuildPlayerHit = function onBuildPlayerHit(player, attacker) {
        const buildId = window.getPlayerActiveBuild(player);
        if (buildId !== 'thorns' || !attacker) return;
        const cfg = passiveCfg('thorns');
        if (cfg.reflectPoisonOnHit && typeof window.applySkillStatusEffects === 'function') {
            window.applySkillStatusEffects(
                { statusEffects: [{ type: 'poison', durationMs: 4000 }] },
                attacker, player, player.gameInstance
            );
        }
    };

    window.onBuildVanish = function onBuildVanish(player) {
        const buildId = window.getPlayerActiveBuild(player);
        if (buildId !== 'night_lord') return;
        const cfg = passiveCfg('night_lord');
        const st = ensureBuildState(player);
        st.postVanishUntil = Date.now() + (cfg.postVanishWindowMs || 3000);
    };

    window.tickBuildPassive = function tickBuildPassive(player, dtSec, gameInstance) {
        if (!player) return;
        const buildId = window.getPlayerActiveBuild(player);
        if (!buildId) return;
        const cfg = passiveCfg(buildId);
        const st = ensureBuildState(player);

        if (buildId === 'retribution' && cfg && cfg.holyEnergyRegenPerSec) {
            st.holyEnergy = Math.min(cfg.holyEnergyMax || 100,
                (st.holyEnergy || 0) + cfg.holyEnergyRegenPerSec * dtSec);
        }
        if (buildId === 'arcane' && st.arcaneResetAt && Date.now() >= st.arcaneResetAt) {
            st.arcaneStacks = 0;
            st.lastElement = null;
            st.arcaneResetAt = 0;
        }
        window.applyBuildEquipmentConditionals(player, dtSec);
    };

    window.getSummonTauntTarget = function getSummonTauntTarget(monster, player, gameInstance) {
        if (!gameInstance || !gameInstance._skillEntities) return null;
        const summons = gameInstance._skillEntities.summons || [];
        let best = null, bestD = Infinity;
        summons.forEach(s => {
            if (!s || s.hp <= 0 || !s.tauntRadius) return;
            const d = Math.hypot(monster.x - s.x, monster.y - s.y);
            if (d <= s.tauntRadius && d < bestD) { bestD = d; best = s; }
        });
        return best;
    };

    function findBuildEquipmentDef(item) {
        const list = window.CLASS_BUILD_EQUIPMENT && window.CLASS_BUILD_EQUIPMENT.items;
        if (!list || !item) return null;
        return list.find(e =>
            (item.buildEquipmentId && e.equipmentId === item.buildEquipmentId)
            || (item.name && e.name === item.name)
            || (item.id && String(item.id).includes(e.equipmentId))
        ) || null;
    }

    function getEquippedBuildItems(player) {
        if (!player || !player.equipment) return [];
        return Object.values(player.equipment).filter(Boolean);
    }

    function mergeSkillDef(base, patch) {
        const out = Object.assign({}, base, patch);
        if (patch.entityConfig && base.entityConfig) {
            out.entityConfig = Object.assign({}, base.entityConfig, patch.entityConfig);
        } else if (patch.entityConfig) {
            out.entityConfig = Object.assign({}, patch.entityConfig);
        }
        if (patch.statusEffects) out.statusEffects = patch.statusEffects.slice();
        return out;
    }

    function applyModifications(skillDef, mods) {
        let out = Object.assign({}, skillDef);
        const ec = Object.assign({}, out.entityConfig || {});
        if (mods.projectileCount != null) ec.projectileCount = mods.projectileCount;
        if (mods.damageMultiplier != null) {
            ec.damageMultiplier = mods.damageMultiplier;
            out.damageMultiplier = mods.damageMultiplier;
        }
        if (mods.aoeRadiusAdd != null) ec.explodeRadius = (ec.explodeRadius || out.aoeRadius || 0) + mods.aoeRadiusAdd;
        if (mods.aoeRadius != null) {
            ec.explodeRadius = mods.aoeRadius;
            out.aoeRadius = mods.aoeRadius;
        }
        if (mods.burnEfficiencyMult != null) out._burnEfficiencyMult = mods.burnEfficiencyMult;
        if (mods.onHitHealMaxHpPercent != null) ec.healOnHitPercent = mods.onHitHealMaxHpPercent * 100;
        if (mods.noDisplacement != null) ec.noDisplacement = mods.noDisplacement;
        if (mods.afterimageDurationMs != null) ec.afterimageDurationMs = mods.afterimageDurationMs;
        if (mods.afterimageDamageRatio != null) ec.afterimageDamageRatio = mods.afterimageDamageRatio;
        if (mods.breakDamageMultiplier != null) out.breakDamageMultiplier = mods.breakDamageMultiplier;
        if (mods.attackSpeedPerTenPercentHpLost != null) out._berserkAspdPerTenHp = mods.attackSpeedPerTenPercentHpLost;
        if (mods.endHpLossPercent != null) out._berserkEndHpLoss = mods.endHpLossPercent;
        if (Object.keys(ec).length) out.entityConfig = ec;
        return out;
    }

    window.applyBuildEquipmentSkillModifiers = function applyBuildEquipmentSkillModifiers(player, skillDef) {
        if (!skillDef || !window.CLASS_BUILD_EQUIPMENT) return skillDef;
        const baseId = (skillDef.evolutionPath && skillDef.evolutionPath.baseSkillId) || skillDef.id;
        let merged = skillDef;
        const classId = window.getActiveClassId && window.getActiveClassId(player.classData);

        getEquippedBuildItems(player).forEach(item => {
            const def = findBuildEquipmentDef(item);
            if (!def) return;
            if (def.classRestriction && classId && !def.classRestriction.includes(classId)) return;
            (def.skillModifiers || []).forEach(mod => {
                if (mod.skillId !== baseId && mod.skillId !== skillDef.id) return;
                if (mod.skillReplace) merged = mergeSkillDef(merged, mod.skillReplace);
                if (mod.modifications) merged = applyModifications(merged, mod.modifications);
            });
        });
        return merged;
    };

    window.applyBuildEquipmentConditionals = function applyBuildEquipmentConditionals(player) {
        if (!player || !player.equipment) return;
        const classId = window.getActiveClassId && window.getActiveClassId(player.classData);
        const now = Date.now();
        getEquippedBuildItems(player).forEach(item => {
            const def = findBuildEquipmentDef(item);
            if (!def || !def.conditionalModifiers) return;
            if (def.classRestriction && classId && !def.classRestriction.includes(classId)) return;
            def.conditionalModifiers.forEach(cm => {
                if (!cm.condition || !cm.condition.startsWith('buff_active:')) return;
                const buffId = cm.condition.split(':')[1];
                const hasBuff = (player.buffs || []).some(b =>
                    b.expireTime > now && (b.id === buffId || (b.name && b.name.includes('狂暴'))));
                if (hasBuff && cm.moveSpeedPercent) {
                    player._buildMoveSpeedPenalty = cm.moveSpeedPercent;
                }
            });
        });
    };

    window.getBuildSkillResourceCost = function getBuildSkillResourceCost(player, skillDef) {
        let cost = skillDef.resourceCost || 0;
        const st = player._buildState;
        if (st && st.skillCostReduction && cost > 0) {
            cost = Math.max(1, Math.floor(cost * (1 - st.skillCostReduction / 100)));
        }
        return cost;
    };

    window.drawBuildCombatHud = function drawBuildCombatHud(ctx, gameInstance) {
        if (!ctx || !gameInstance || !gameInstance.player) return;
        const p = gameInstance.player;
        const buildId = window.getPlayerActiveBuild(p);
        const st = p._buildState || {};

        if (buildId === 'retribution' && st.holyEnergy != null) {
            const cfg = passiveCfg('retribution');
            const max = cfg.holyEnergyMax || 100;
            const ratio = Math.max(0, Math.min(1, st.holyEnergy / max));
            const bw = 48, bh = 4;
            const sx = p.x - bw / 2, sy = p.y - 42;
            ctx.fillStyle = '#332200';
            ctx.fillRect(sx, sy, bw, bh);
            ctx.fillStyle = '#ffdd44';
            ctx.fillRect(sx, sy, bw * ratio, bh);
        }

        if (p._skillCastBar && Date.now() < p._skillCastBar.endTime) {
            const bar = p._skillCastBar;
            const ratio = Math.max(0, Math.min(1,
                (Date.now() - bar.startTime) / (bar.endTime - bar.startTime)));
            const bw = 56, bh = 6;
            const sx = p.x - bw / 2, sy = p.y - 52;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(sx - 1, sy - 1, bw + 2, bh + 2);
            ctx.fillStyle = '#333355';
            ctx.fillRect(sx, sy, bw, bh);
            ctx.fillStyle = bar.color || '#88ccff';
            ctx.fillRect(sx, sy, bw * ratio, bh);
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(bar.label || '施法中', p.x, sy - 4);
        }
    };

})();
