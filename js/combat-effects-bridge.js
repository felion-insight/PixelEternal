/**
 * 战斗效果桥接：遗物/协同/羁绊/天气/指挥官/变异/契约 统一消费
 */
(function () {
    'use strict';

    function living(list) {
        return (list || []).filter((u) => u && u.alive !== false && (u.hp == null || u.hp > 0));
    }

    function elapsed(battle) {
        return battle && battle.elapsed != null ? battle.elapsed : 0;
    }

    function flattenRelicEntry(def) {
        if (!def || !def.effects) return {};
        const e = def.effects;
        const out = Object.assign({}, e);
        if (e.positive && typeof e.positive === 'object') Object.assign(out, e.positive);
        if (e.negative && typeof e.negative === 'object') {
            out._curseNegative = e.negative;
        }
        if (e.riskLevel) out.riskLevel = e.riskLevel;
        return out;
    }

    function mergeSynergyIntoRelicFx(battle, relicFx) {
        const syn = battle.synergyFx || {};
        if (syn.extraAttackChance) relicFx.extraAttackChance = Math.max(relicFx.extraAttackChance || 0, syn.extraAttackChance);
        if (syn.infiniteCombo) relicFx.infiniteCombo = true;
        if (syn.dotMult) relicFx.dotMult = (relicFx.dotMult || 1) * syn.dotMult;
        if (syn.extraChainJumps) relicFx.extraChainJumps = (relicFx.extraChainJumps || 0) + syn.extraChainJumps;
        if (syn.chainDecayMult) {
            relicFx.chainDecayMult = syn.chainDecayMult;
            relicFx.chainFalloffBonus = (relicFx.chainFalloffBonus || 0) + Math.max(0, 1 - syn.chainDecayMult) * 0.12;
        }
        if (syn.dodgeCritMult) relicFx.dodgeCritMult = syn.dodgeCritMult;
        if (syn.dodgeIgnoreArmor) relicFx.dodgeIgnoreArmor = true;
        if (syn.synergyDamageMult) relicFx.synergyDamageMult = syn.synergyDamageMult;
        if (syn.thornsPct) relicFx.thornsPct = Math.max(relicFx.thornsPct || 0, syn.thornsPct);
        if (syn.maxHpMult) relicFx.maxHpMult = (relicFx.maxHpMult || 1) * syn.maxHpMult;
        if (syn.skillRangeMult) relicFx.skillRangeMult = (relicFx.skillRangeMult || 1) * syn.skillRangeMult;
        if (syn.lifesteal) relicFx.lifesteal = syn.lifesteal;
        if (syn.critStunMs) relicFx.critStunMs = syn.critStunMs;
        if (syn.battleStartAttackMult) relicFx.battleStartAttackMult = syn.battleStartAttackMult;
        if (syn.midasStatueChance) relicFx.midasStatueChance = Math.max(relicFx.midasStatueChance || 0, syn.midasStatueChance);
        if (syn.midasGoldMult) relicFx.midasGoldMult = syn.midasGoldMult;
        if (syn.midasBossGoldBonus) relicFx.midasBossGoldBonus = syn.midasBossGoldBonus;
    }

    function finalizeBattle(battle, run) {
        if (!battle || !run) return;
        battle.runRef = run;
        mergeSynergyIntoRelicFx(battle, battle.relicFx || (battle.relicFx = {}));

        const pact = run.ascension && run.ascension.pact;
        if (pact) {
            battle.pactFx = Object.assign({}, pact);
            if (pact.teamHpMult && battle.allies) {
                battle.allies.forEach((u) => {
                    u.maxHp = Math.max(1, Math.floor(u.maxHp * pact.teamHpMult));
                    u.hp = Math.min(u.hp, u.maxHp);
                });
            }
            if (pact.teamAttackMult && battle.allies) {
                battle.allies.forEach((u) => { u.attack = Math.floor(u.attack * pact.teamAttackMult); });
            }
            if (pact.oneHitKill) battle.mutationOneHit = true;
            if (pact.noHud) battle.trueModeNoHud = true;
            if (pact.noDamageNumbers) battle.trueModeNoNumbers = true;
            if (pact.noIntel) battle.trueModeNoIntel = true;
        if (pact.disableCommander && battle.commanderMode) battle.commanderMode.enabled = false;
        }

        if (battle.mutationOneHit) {
            living(battle.allies).concat(living(battle.enemies)).forEach((u) => {
                u.oneHitKill = true;
            });
        }

        if (battle.mutationStripGear && battle.allies) {
            battle.allies.forEach((u) => {
                u.attack = Math.max(1, Math.floor(u.attack * 0.85));
                u.defense = Math.max(0, Math.floor(u.defense * 0.7));
            });
        }
        if (battle.mutationMirror && battle.allies && battle.enemies) {
            battle.enemies = battle.allies.map((u, i) => Object.assign({}, u, {
                id: 'mirror_enemy_' + i, side: 'enemy', col: 3 - (u.col || 0), row: u.row,
                hp: u.hp, maxHp: u.maxHp, attack: u.attack, alive: true
            }));
        }
        if (battle.mutationSurvival) battle.survivalWave = 1;
        if (pact && pact.visionHalf && typeof pact.visionHalf === 'string') {
            run.ascension.visionHalf = pact.visionHalf;
        }
        if (pact && pact.blindMap) run.ascension.blindMap = true;

        const rf = battle.relicFx;
        if (rf.battleStartHealPct && battle.allies) {
            battle.allies.forEach((u) => {
                if (u.alive && u.hp > 0) u.hp = Math.min(u.maxHp, u.hp + Math.floor(u.maxHp * rf.battleStartHealPct));
            });
        }
        if (rf.battleStartBuff && battle.allies) {
            const bb = rf.battleStartBuff;
            battle.allies.forEach((u) => {
                u.attackBuff = bb.attackMult || 1.1;
                u.buffUntil = elapsed(battle) + (bb.durationMs || 5000);
            });
        }
        if (rf.battleStartMirror && battle.allies) {
            const clones = battle.allies.slice(0, 2).map((u, i) => Object.assign({}, u, {
                id: 'mirror_' + i + '_' + Date.now(),
                hp: Math.floor(u.maxHp * (rf.battleStartMirror.hpPct || 0.5)),
                maxHp: Math.floor(u.maxHp * (rf.battleStartMirror.hpPct || 0.5)),
                attack: Math.floor(u.attack * (rf.battleStartMirror.statPct || 0.5)),
                phantom: true,
                phantomUntil: elapsed(battle) + (rf.battleStartMirror.durationMs || 10000)
            }));
            battle.allies = battle.allies.concat(clones);
        }
        if (rf.reviveOnDeath && battle.allies) {
            battle.allies.forEach((u) => { u.reviveOnDeath = rf.reviveOnDeath; });
        }

        if (window.CurseSystem && run.ascension) {
            battle.curseBattleFx = window.CurseSystem.buildBattleModifiers(run);
            Object.assign(battle.relicFx, battle.curseBattleFx.relicBoost || {});
        }

        const syn = battle.synergyFx || {};
        if (syn.statMult && battle.allies) {
            battle.allies.forEach((u) => {
                u.attack = Math.floor(u.attack * syn.statMult);
                u.maxHp = Math.floor(u.maxHp * syn.statMult);
                u.hp = Math.min(u.maxHp, Math.max(1, Math.floor(u.hp * syn.statMult)));
            });
        }
        if (syn.commanderRegenMult && battle.commanderMode) {
            battle.commanderMode.regenMult = (battle.commanderMode.regenMult || 1) * syn.commanderRegenMult;
        }
        const rfDef = battle.relicFx || {};
        if (rfDef.defenseMult) {
            (battle.allies || []).concat(battle.enemies || []).forEach((u) => {
                u.defense = Math.floor((u.defense || 0) * rfDef.defenseMult);
            });
        }

        (battle.allies || []).concat(battle.enemies || []).forEach((u) => { u._battleRef = battle; });
    }

    function getAttackBuffMult(unit, battle) {
        let mult = 1;
        if (!unit || !battle) return mult;
        const now = elapsed(battle);
        if (unit.attackBuff && unit.buffUntil != null && now < unit.buffUntil) mult *= unit.attackBuff;
        if (battle.teamDamageMult && unit.side === 'ally' && battle.teamDamageUntil != null && now < battle.teamDamageUntil) {
            mult *= battle.teamDamageMult;
        }
        const rf = battle.relicFx || {};
        if (unit.side === 'ally' && rf.lowHpAttackMult && unit.hp / Math.max(1, unit.maxHp) <= (rf.lowHpAttackMult.threshold || 0.5)) {
            mult *= rf.lowHpAttackMult.mult || 1.15;
        }
        if (unit.side === 'ally' && rf.lowHpAttackScaling) {
            const missing = 1 - unit.hp / Math.max(1, unit.maxHp);
            mult *= 1 + Math.floor(missing / 0.1) * (rf.lowHpAttackScaling.per10PctHp || 0.05);
        }
        if (unit.side === 'ally' && battle.synergyFx && battle.synergyFx.attackPer100Gold && battle.runRef) {
            mult *= 1 + Math.floor((battle.runRef.gold || 0) / 100) * battle.synergyFx.attackPer100Gold;
        }
        if (unit.side === 'ally' && battle.bondFx) {
            const bf = battle.bondFx;
            if (unit.baseClass === 'mage' && bf.mageSkillDamageMult) mult *= bf.mageSkillDamageMult;
        }
        if (unit.side === 'enemy' && battle.weatherEnemyAttackMult) mult *= battle.weatherEnemyAttackMult;
        if (unit.side === 'enemy' && battle.corruptionFx && battle.corruptionFx.enemyAttackMult) {
            mult *= battle.corruptionFx.enemyAttackMult;
        }
        if (unit.side === 'enemy' && battle.pactFx && battle.pactFx.enemyAttackMult) {
            mult *= battle.pactFx.enemyAttackMult;
        }
        if (unit.side === 'enemy' && battle.zoneEnemyAttackMult) {
            mult *= battle.zoneEnemyAttackMult;
        }
        if (battle.bossPhaseAttackMult && unit.isBoss) mult *= battle.bossPhaseAttackMult;
        return mult;
    }

    function isInvulnerable(battle, target) {
        if (!target || !battle) return false;
        const now = elapsed(battle);
        if (target.invulnUntil != null && now < target.invulnUntil) return true;
        if (target.side === 'ally' && target.damageReduction && battle.tauntTargetId === (target.id || target.heroId)) {
            /* 减伤在 modifyIncomingDamage 处理 */
        }
        return false;
    }

    function isSilenced(battle, unit) {
        if (!unit || unit.side !== 'enemy') return false;
        return unit.silencedUntil != null && elapsed(battle) < unit.silencedUntil;
    }

    function canBasicAttack(battle, unit) {
        const rf = battle.relicFx || {};
        if (rf.disableBasicAttack && unit.side === 'ally') return false;
        if (battle.curseBattleFx && battle.curseBattleFx.disableBasicAttack && unit.side === 'ally') return false;
        return true;
    }

    function modifyOutgoingDamage(battle, attacker, target, dmg, meta, relicFx) {
        meta = meta || {};
        relicFx = relicFx || battle.relicFx || {};
        if (attacker && (attacker.phantomDecoy || attacker.isPhantom)) return 0;
        if (window.CommanderAbilities && window.CommanderAbilities.modifyOutgoingDamage) {
            dmg = window.CommanderAbilities.modifyOutgoingDamage(battle, attacker, target, dmg);
        }
        if (attacker.side === 'ally' && relicFx.armorPenPct) {
            /* 在 applyDamage 前已减防，此处用 flat bonus 近似 */
        }
        if (attacker.side === 'ally' && relicFx.synergyDamageMult) dmg *= relicFx.synergyDamageMult;
        if (attacker.side === 'ally' && relicFx.elementalLord) {
            meta.fire = meta.ice = meta.lightning = true;
        }
        const wf = battle.weatherFx || {};
        if (meta.fire && wf.fireDamageMult) dmg *= wf.fireDamageMult;
        if (meta.lightning && wf.lightningDamageMult) dmg *= wf.lightningDamageMult;
        if (attacker.side === 'ally' && !meta.isSkill && battle.weatherBasicDmgMult) dmg *= battle.weatherBasicDmgMult;
        if (attacker.side === 'ally' && relicFx.elementalReactionMult && (meta.fire || meta.ice || meta.lightning)) {
            dmg *= relicFx.elementalReactionMult;
        }
        if (battle.enemyTimeStopUntil != null && elapsed(battle) < battle.enemyTimeStopUntil && attacker.side === 'ally') {
            meta.crit = true;
        }
        if (battle.mutationElement && meta.isSkill) {
            const el = battle.mutationElement;
            if (el === 'fire' && !meta.fire) dmg *= 0.1;
            if (el === 'ice' && !meta.ice) dmg *= 0.1;
            if (el === 'lightning' && !meta.lightning) dmg *= 0.1;
        }
        if (target.goldShield && target.goldShield > 0 && battle.runRef) {
            const cost = Math.min(target.goldShield, Math.floor(dmg * 0.5));
            if (battle.runRef.gold >= cost) {
                battle.runRef.gold -= cost;
                target.goldShield -= cost;
                dmg = Math.floor(dmg * 0.5);
            }
        }
        if (attacker.side === 'ally' && battle.bondFx && battle.bondFx.markDamageBonus &&
            battle.tauntTargetId && target.id === battle.tauntTargetId &&
            attacker.baseClass === 'archer') {
            dmg *= (1 + battle.bondFx.markDamageBonus);
        }
        if (attacker._dodgeNextCrit && attacker.side === 'ally') {
            meta.crit = true;
            dmg *= (relicFx.dodgeCritMult || 1.5);
            if (relicFx.dodgeIgnoreArmor) meta.ignoreArmor = true;
            attacker._dodgeNextCrit = false;
        }
        if (attacker.side === 'ally' && relicFx.dodgeNextCrit && attacker._pendingDodgeCrit) {
            meta.crit = true;
            attacker._pendingDodgeCrit = false;
        }
        if (battle.mutationOneHit || attacker.oneHitKill) {
            dmg = Math.max(dmg, target.hp || 99999);
        }
        return dmg;
    }

    function modifyIncomingDamage(battle, target, dmg, attacker, meta) {
        meta = meta || {};
        if (!target || !battle) return dmg;
        const now = elapsed(battle);
        if (target.damageReduction && battle.tauntTargetId === (target.id || target.heroId) &&
            battle.tauntUntil != null && now < battle.tauntUntil) {
            dmg *= (1 - target.damageReduction);
        }
        if (target.side === 'ally' && target.damageTakenMult && target.buffUntil != null && now < target.buffUntil) {
            dmg *= target.damageTakenMult;
        }
        if (target.iceArmor && attacker && attacker.side === 'ally') {
            if (!meta.fire && !meta.isFire) dmg = Math.floor(dmg * 0.35);
        }
        if (target.side === 'ally' && battle.curseBattleFx && battle.curseBattleFx.critTakenMult && metaCritIncoming(attacker)) {
            dmg *= battle.curseBattleFx.critTakenMult;
        }
        dmg = applySoulLinkDamage(battle, target, dmg, now);
        if (target.side === 'ally' && battle.bondFx && battle.bondFx.damageSharePct) {
            /* 分担在 onDamageDealt 处理 */
        }
        return Math.max(0, Math.floor(dmg));
    }

    function metaCritIncoming(attacker) {
        return !!(attacker && attacker._lastHitWasCrit);
    }

    function applySoulLinkDamage(battle, target, dmg, now) {
        const links = battle.soulLinks || [];
        links.forEach((link) => {
            if (link.until != null && now >= link.until) return;
            if (target.id !== link.a && target.id !== link.b) return;
            const otherId = target.id === link.a ? link.b : link.a;
            const all = (battle.allies || []).concat(battle.enemies || []);
            const partner = all.find((u) => u.id === otherId);
            if (!partner || !partner.alive) return;
            const share = Math.floor(dmg * (link.share || 0.5));
            if (share > 0) {
                partner.hp = Math.max(0, partner.hp - share);
                if (partner.hp <= 0) partner.alive = false;
            }
        });
        return dmg;
    }

    function onDamageDealt(battle, attacker, target, dmg, meta) {
        if (dmg <= 0 || !battle) return;
        const rf = battle.relicFx || {};
        if (target.side === 'ally' && rf.thornsPct && attacker && attacker.alive) {
            let thorn = Math.max(1, Math.floor(dmg * rf.thornsPct));
            if (rf.thornsCanCrit && Math.random() < ((attacker.critChance || 0) + (rf.critChance || 0) + 0.15)) {
                thorn = Math.floor(thorn * 1.5);
            }
            if (window.AutoBattleSimulator && window.AutoBattleSimulator.applyTraitDamage) {
                window.AutoBattleSimulator.applyTraitDamage(battle, target, attacker, thorn, { isThorn: true });
            }
        }
        if (target.side === 'enemy' && attacker.side === 'ally' && rf.midasStatueChance &&
            !target.isBoss && Math.random() < rf.midasStatueChance) {
            target.hp = 0;
            target.alive = false;
            if (battle.runRef) {
                battle.runRef.gold = (battle.runRef.gold || 0) + Math.floor(10 * (rf.midasGoldMult || 10));
            }
        }
        if (target.side === 'ally' && rf.cheatDeath && target.hp <= 0 && target.alive === false) {
            const used = target._cheatDeathUsed || 0;
            const max = (rf.cheatDeath.perBattle || 1);
            if (used < max) {
                target.hp = rf.cheatDeath.hp || 1;
                target.alive = true;
                target._cheatDeathUsed = used + 1;
                if (rf.fullHealOnCheatDeath) target.hp = target.maxHp;
            }
        }
        if (attacker.side === 'ally' && meta && meta.isSkill && rf.skillChainChance && Math.random() < rf.skillChainChance.chance) {
            battle._pendingChain = battle._pendingChain || [];
            battle._pendingChain.push({ from: attacker, jumps: rf.skillChainChance.jumps || 2 });
        }
        if (attacker.side === 'ally' && !meta.isSkill && rf.armorBreak) {
            target.statuses = target.statuses || [];
            const ab = rf.armorBreak;
            let st = target.statuses.find((s) => s.type === 'debuff' && s.stat === 'defense' && s.source === 'armor_break');
            if (!st) {
                st = { type: 'debuff', stat: 'defense', flat: ab.flat || 5, stacks: 1, t: 8000, source: 'armor_break' };
                target.statuses.push(st);
            } else if ((st.stacks || 1) < (ab.maxStacks || 3)) {
                st.stacks = (st.stacks || 1) + 1;
                st.flat = (ab.flat || 5) * st.stacks;
                st.t = 8000;
            }
        }
        if (target.side === 'enemy' && attacker.side === 'ally' && rf.damageToShieldPct && attacker.alive) {
            const cap = Math.floor(attacker.maxHp * (rf.shieldCapMult || 2));
            const gain = Math.floor(dmg * rf.damageToShieldPct);
            attacker.shield = Math.min(cap, (attacker.shield || 0) + gain);
        }
        shareBondDamage(battle, target, dmg);
    }

    function shareBondDamage(battle, target, dmg) {
        const pct = battle.bondFx && battle.bondFx.damageSharePct;
        if (!pct || target.side !== 'ally') return;
        const partners = living(battle.allies).filter((u) => u !== target && u.baseClass === target.baseClass);
        if (!partners.length) return;
        const share = Math.floor(dmg * pct / partners.length);
        partners.forEach((p) => {
            if (share > 0 && p.hp > 0) p.hp = Math.max(0, p.hp - share);
        });
    }

    function onBasicAttackHit(battle, attacker, target, relicFx) {
        relicFx = relicFx || battle.relicFx || {};
        if (attacker.side !== 'ally') return;
        const chance = relicFx.extraAttackChance || 0;
        if (chance > 0 && Math.random() < chance) {
            battle._extraBasic = battle._extraBasic || [];
            battle._extraBasic.push({ attacker: attacker, target: target });
        }
        if (relicFx.onHitSlow && target && target.alive) {
            const sl = relicFx.onHitSlow;
            target.statuses = target.statuses || [];
            target.statuses.push({
                type: 'slow', pct: sl.value || sl.pct || 0.3,
                t: sl.durationMs || 2000, sourceId: attacker.id
            });
        }
        if (relicFx.onHitDot) {
            const dot = relicFx.onHitDot;
            target.statuses = target.statuses || [];
            target.statuses.push({
                type: 'dot', pctOfAttack: dot.pctOfAttack || 0.03,
                tickMs: dot.tickMs || 1000, t: dot.durationMs || 3000,
                sourceAttack: attacker.attack
            });
        }
        if (relicFx.chainLightning && target && target.alive && window.AutoBattleSimulator) {
            const foes = living(battle.enemies).filter((e) => e !== target);
            const jump = relicFx.chainLightning.jumps || 2;
            for (let i = 0; i < jump && i < foes.length; i++) {
                window.AutoBattleSimulator.applyTraitDamage(
                    battle, attacker, foes[i], attacker.attack * (relicFx.chainLightning.mult || 0.5),
                    { isSkill: true, lightning: true }
                );
            }
        }
        if (relicFx.meleeOnHit && (attacker.range || 48) < 80) {
            const mh = relicFx.meleeOnHit;
            target.statuses = target.statuses || [];
            target.statuses.push({ type: mh.type || 'slow', pct: mh.value || 0.3, t: mh.durationMs || 1500 });
        }
        if (relicFx.lifesteal) {
            /* lifesteal handled in applyDamage via meta */
        }
        if (relicFx.bladeDanceChance && Math.random() < relicFx.bladeDanceChance &&
            window.AutoBattleSimulator && window.AutoBattleSimulator.applyTraitDamage) {
            living(battle.enemies).forEach((foe) => {
                if (foe !== target && foe.alive) {
                    window.AutoBattleSimulator.applyTraitDamage(
                        battle, attacker, foe, Math.floor(attacker.attack * 0.85), { isSkill: false }
                    );
                }
            });
        }
        triggerBondEchoAttack(battle, attacker);
    }

    function triggerBondEchoAttack(battle, attacker) {
        const bf = battle.bondFx;
        if (!bf || !bf.archerEchoChance || attacker.baseClass !== 'archer') return;
        if (Math.random() >= bf.archerEchoChance) return;
        const partner = living(battle.allies).find((u) => u !== attacker && u.baseClass === 'archer');
        if (partner) battle._extraBasic = (battle._extraBasic || []).concat([{ attacker: partner, target: null }]);
    }

    function pickEnemyTarget(unit, enemies, battle) {
        if (unit.side !== 'enemy' || !battle) return null;
        const now = elapsed(battle);
        if (battle.tauntTargetId && battle.tauntUntil != null && now < battle.tauntUntil) {
            const t = enemies.find((e) => (e.id === battle.tauntTargetId || e.heroId === battle.tauntTargetId));
            if (t && t.alive) return t;
        }
        return null;
    }

    function onUnitDodge(battle, unit) {
        const rf = battle.relicFx || {};
        if (unit.side === 'ally' && rf.dodgeNextCrit) unit._pendingDodgeCrit = true;
        if (unit.side === 'ally' && rf.dodgeTimestopMs) {
            battle.enemyTimeStopUntil = elapsed(battle) + rf.dodgeTimestopMs;
        }
        if (unit.side === 'assassin' && battle.bondFx && battle.bondFx.assassinDodgeShareMs) {
            living(battle.allies).filter((u) => u.baseClass === 'assassin' && u !== unit).forEach((p) => {
                p._dodgeBuffUntil = elapsed(battle) + battle.bondFx.assassinDodgeShareMs;
            });
        }
    }

    function applyWeatherToUnits(battle) {
        if (!battle) return;
        const mult = battle.weatherRangeMult || 1;
        const spd = battle.weatherMoveMult || 1;
        living(battle.allies || []).concat(living(battle.enemies || [])).forEach((u) => {
            if (u._weatherApplied) return;
            if (mult !== 1 && u.range) u.range = Math.floor(u.range * mult);
            if (spd !== 1 && u.speed) u.speed = Math.floor(u.speed * spd);
            if (battle.weatherDodgeBonus && u.side === 'ally') u.dodgeBonus = (u.dodgeBonus || 0) + battle.weatherDodgeBonus;
            u._weatherApplied = true;
        });
    }

    function onKill(battle, attacker, target) {
        if (!battle || !attacker) return;
        const wf = battle.weatherFx || {};
        if (wf.killHealPct && attacker.side === 'ally' && attacker.alive) {
            const heal = Math.floor(attacker.maxHp * wf.killHealPct);
            if (heal > 0) attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
        }
        if (target.side === 'enemy' && battle.runRef && battle.synergyFx && battle.synergyFx.killGoldBonus) {
            battle.runRef.gold = (battle.runRef.gold || 0) + Math.floor(5 * battle.synergyFx.killGoldBonus);
        }
        if (target.side === 'enemy' && target.isBoss && battle.runRef && battle.relicFx && battle.relicFx.midasBossGoldBonus) {
            battle.runRef.gold = (battle.runRef.gold || 0) + battle.relicFx.midasBossGoldBonus;
        }
        if (target.reviveOnDeath && target.side === 'ally') {
            const used = target._reviveUsed || 0;
            const max = (target.reviveOnDeath.perBattle || 1);
            if (used < max) {
                target.hp = Math.floor(target.maxHp * (target.reviveOnDeath.hpPct || 0.2));
                target.alive = true;
                target._reviveUsed = used + 1;
            }
        }
        if (target.side === 'ally' && battle.relicFx && battle.relicFx.phoenixRevive && !target._phoenixUsed) {
            target._phoenixUsed = true;
            target.hp = Math.floor(target.maxHp * (battle.relicFx.phoenixRevive.hpPct || 0.5));
            target.alive = true;
        }
    }

    function spawnSurvivalWave(battle) {
        if (!window.AutoBattleSimulator || !window.AutoBattleSimulator.spawnTraitEnemy) return;
        battle.survivalWave = (battle.survivalWave || 1) + 1;
        const scale = 0.6 + battle.survivalWave * 0.08;
        for (let i = 0; i < Math.min(4, 1 + Math.floor(battle.survivalWave / 2)); i++) {
            window.AutoBattleSimulator.spawnTraitEnemy(battle, 'ab_grunt', i % 4, i % 3, scale);
        }
    }

    function tickBossMechanics(battle, dtMs) {
        battle._bossTimers = battle._bossTimers || {};
        const t = battle._bossTimers;
        const bps = battle.bossPhaseSystem;
        const boss = bps && bps.boss;

        if (battle.bossPoisonPools) {
            t.poison = (t.poison || 0) + dtMs;
            if (t.poison >= 2500) {
                t.poison = 0;
                living(battle.allies).filter((u) => (u.row || 0) >= 1).forEach((u) => {
                    u.hp = Math.max(0, u.hp - Math.floor(u.maxHp * 0.05));
                    if (u.hp <= 0) u.alive = false;
                });
            }
        }
        if (battle.bossAbsorbPools && boss && boss.alive) {
            t.absorb = (t.absorb || 0) + dtMs;
            if (t.absorb >= 3000) {
                t.absorb = 0;
                boss.hp = Math.min(boss.maxHp, boss.hp + Math.floor(boss.maxHp * 0.04));
            }
        }
        if (battle.bossRandomLightning) {
            t.lightning = (t.lightning || 0) + dtMs;
            if (t.lightning >= 2200) {
                t.lightning = 0;
                const allies = living(battle.allies);
                if (allies.length) {
                    const victim = allies[Math.floor(Math.random() * allies.length)];
                    victim.hp = Math.max(0, victim.hp - Math.floor(victim.maxHp * 0.12));
                    if (victim.hp <= 0) victim.alive = false;
                }
            }
        }
        if (battle.bossChargeKill) {
            t.charge = (t.charge || 0) + dtMs;
            if (t.charge >= 8000 && boss && boss.alive) {
                t.charge = 0;
                const allies = living(battle.allies);
                if (allies.length) {
                    const victim = allies[Math.floor(Math.random() * allies.length)];
                    victim.hp = 0;
                    victim.alive = false;
                }
            }
        }
        if (battle.bossGoldRain && battle.runRef) {
            t.goldRain = (t.goldRain || 0) + dtMs;
            if (t.goldRain >= 2000) {
                t.goldRain = 0;
                battle.runRef.gold = (battle.runRef.gold || 0) + 3;
                living(battle.allies).forEach((u) => {
                    u.hp = Math.min(u.maxHp, u.hp + Math.floor(u.maxHp * 0.02));
                });
            }
        }
        if (battle.bossSelfDestructMs != null && boss && boss.alive) {
            if (battle.bossSelfDestructRemaining == null) battle.bossSelfDestructRemaining = battle.bossSelfDestructMs;
            battle.bossSelfDestructRemaining = Math.max(0, battle.bossSelfDestructRemaining - dtMs);
            if (battle.bossSelfDestructRemaining <= 0 && !t.selfDestructTriggered) {
                t.selfDestructTriggered = true;
                living(battle.allies).forEach((u) => {
                    u.hp = Math.max(0, u.hp - Math.floor(u.maxHp * 0.6));
                    if (u.hp <= 0) u.alive = false;
                });
            }
        }
        if (battle.bossRandomTimeStop) {
            t.timeStop = (t.timeStop || 0) + dtMs;
            if (t.timeStop >= 5000) {
                t.timeStop = 0;
                battle.timeStopRemaining = Math.max(battle.timeStopRemaining || 0, 1500);
            }
        }
        if (battle.bossRewindMs && boss && boss.alive && !t.rewindDone) {
            t.rewindDone = true;
            boss.hp = Math.min(boss.maxHp, boss.hp + Math.floor(boss.maxHp * 0.15));
        }
    }

    function cloneUnitSnapshot(u) {
        if (!u) return null;
        return {
            id: u.id,
            heroId: u.heroId,
            hp: u.hp,
            maxHp: u.maxHp,
            alive: u.alive,
            x: u.x,
            y: u.y,
            col: u.col,
            row: u.row,
            basicCd: u.basicCd,
            skills: (u.skills || []).map((sk) => ({ id: sk.id, cd: sk.cd }))
        };
    }

    function recordBattleSnapshot(battle) {
        if (!battle) return;
        const now = elapsed(battle);
        battle.rewindSnapshots = battle.rewindSnapshots || [];
        const last = battle.rewindSnapshots[battle.rewindSnapshots.length - 1];
        if (last && now - last.t < 500) return;
        battle.rewindSnapshots.push({
            t: now,
            elapsed: now,
            allies: (battle.allies || []).map(cloneUnitSnapshot),
            enemies: (battle.enemies || []).map(cloneUnitSnapshot)
        });
        const maxAge = 15000;
        while (battle.rewindSnapshots.length && now - battle.rewindSnapshots[0].t > maxAge) {
            battle.rewindSnapshots.shift();
        }
    }

    function restoreBattleSnapshot(battle, targetTime) {
        const snaps = battle && battle.rewindSnapshots;
        if (!snaps || !snaps.length) return false;
        let snap = snaps[0];
        for (let i = snaps.length - 1; i >= 0; i--) {
            if (snaps[i].t <= targetTime) {
                snap = snaps[i];
                break;
            }
        }
        const applySnap = (live, saved) => {
            saved.forEach((s) => {
                const u = live.find((x) => x.id === s.id || (s.heroId && x.heroId === s.heroId));
                if (!u) return;
                u.hp = s.hp;
                u.maxHp = s.maxHp;
                u.alive = s.alive;
                u.x = s.x;
                u.y = s.y;
                u.col = s.col;
                u.row = s.row;
                u.basicCd = s.basicCd;
                (s.skills || []).forEach((ss) => {
                    const sk = (u.skills || []).find((sk2) => sk2.id === ss.id);
                    if (sk) sk.cd = ss.cd;
                });
            });
        };
        applySnap(battle.allies || [], snap.allies || []);
        applySnap(battle.enemies || [], snap.enemies || []);
        battle.elapsed = snap.elapsed;
        return true;
    }

    function tickBattle(battle, dtMs) {
        if (!battle) return;
        const now = elapsed(battle);
        applyWeatherToUnits(battle);

        const bhX = battle.blackHoleX != null ? battle.blackHoleX : (battle.blackHoleCenter && battle.blackHoleCenter.x);
        const bhY = battle.blackHoleY != null ? battle.blackHoleY : (battle.blackHoleCenter && battle.blackHoleCenter.y);
        if (battle.blackHoleUntil != null && now < battle.blackHoleUntil && bhX != null) {
            living(battle.enemies).forEach((e) => {
                const dx = bhX - e.x;
                const dy = bhY - e.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                e.x += (dx / len) * 40 * (dtMs / 1000);
                e.y += (dy / len) * 40 * (dtMs / 1000);
            });
        }

        if (battle.bossGlobalDot) {
            living(battle.allies).forEach((u) => {
                u.hp = Math.max(0, u.hp - Math.floor(u.maxHp * 0.008 * dtMs / 1000));
                if (u.hp <= 0) u.alive = false;
            });
        }
        if (battle.bossFreezeAll && battle.commanderMode) {
            battle.commanderMode.energy = Math.max(0, battle.commanderMode.energy - dtMs * 0.015);
        }
        if (battle.bossBlizzard) {
            living(battle.allies).concat(living(battle.enemies)).forEach((u) => {
                u.speed = Math.max(20, (u.speed || 50) * 0.85);
            });
        }

        living(battle.allies).forEach((u) => {
            if (u.totemHeal && u.alive) {
                living(battle.allies).forEach((a) => {
                    if (a.alive) a.hp = Math.min(a.maxHp, a.hp + Math.floor(a.maxHp * u.totemHeal * dtMs / 1000));
                });
            }
            if (u.totemTaunt) battle.tauntTargetId = u.id;
        });

        if (battle.mutationSurvival && !living(battle.enemies).length && !battle.finished) {
            spawnSurvivalWave(battle);
        }

        tickBossMechanics(battle, dtMs);

        if (battle._extraBasic && battle._extraBasic.length && window.AutoBattleSimulator) {
            const pending = battle._extraBasic.splice(0);
            const rf = battle.relicFx || {};
            pending.forEach(({ attacker, target }) => {
                if (!attacker.alive) return;
                const foes = living(battle.enemies);
                const t = target || foes[0];
                if (!t) return;
                window.AutoBattleSimulator.applyTraitDamage(battle, attacker, t, attacker.attack, { isSkill: false });
                if (rf.infiniteCombo && (rf.extraAttackChance || 0) > 0 && Math.random() < rf.extraAttackChance) {
                    battle._extraBasic.push({ attacker: attacker, target: t });
                }
            });
        }
        if (battle._pendingChain && battle._pendingChain.length && window.AutoBattleSimulator) {
            const chains = battle._pendingChain.splice(0);
            chains.forEach(({ from, jumps }) => {
                if (!from || !from.alive) return;
                const foes = living(battle.enemies);
                for (let i = 0; i < (jumps || 2) && i < foes.length; i++) {
                    window.AutoBattleSimulator.applyTraitDamage(
                        battle, from, foes[i], from.attack * 0.55, { isSkill: true }
                    );
                }
            });
        }
        recordBattleSnapshot(battle);
    }

    window.CombatEffectsBridge = {
        flattenRelicEntry,
        finalizeBattle,
        getAttackBuffMult,
        isInvulnerable,
        isSilenced,
        canBasicAttack,
        modifyOutgoingDamage,
        modifyIncomingDamage,
        onDamageDealt,
        onBasicAttackHit,
        pickEnemyTarget,
        onUnitDodge,
        onKill,
        tickBattle,
        recordBattleSnapshot,
        restoreBattleSnapshot
    };
})();
