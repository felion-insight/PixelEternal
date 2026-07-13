/**
 * 兽王 · 兽群协同（双指令轮换 / 猎物标记 / 猎网 / 咆哮）
 */
(function () {
    'use strict';

    const BEASTMASTER_TREE = { beastmaster: true };
    const WOLF_UNIT = 'beast_wolf';
    const BEAR_UNIT = 'beast_bear';
    const PREY_MAX_STACKS = 3;
    const PREY_PET_BONUS_PER_STACK = 8;
    const PACK_ROAR_MARK = 'pack_roar';
    const STORM_CD_SKILL = 'beast_pack';

    function isBeastmaster(player) {
        if (!player || !player.classData) return false;
        const id = typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
        return !!(id && BEASTMASTER_TREE[id]);
    }

    window.isBeastmasterPlayer = isBeastmaster;

    /** 兽群统领 UI 阶段：summon | wolf | bear */
    window.getBeastPackDisplayPhase = function getBeastPackDisplayPhase(player, gameInstance) {
        if (!isBeastmaster(player)) return 'summon';
        const g = gameInstance || player.gameInstance;
        if (!g || !g._skillEntities) return 'summon';
        const skillDef = typeof window.getSkillDefinition === 'function'
            ? window.getSkillDefinition('beast_pack') : null;
        const c = skillDef && skillDef.entityConfig ? skillDef.entityConfig : {};
        const counts = countBeastPets(player, g);
        const wolfNeed = c.wolfCount || 2;
        const bearNeed = c.bearCount || 1;
        if (counts.wolfCount < wolfNeed || counts.bearCount < bearNeed) return 'summon';
        return player._beastCommandNext || 'wolf';
    };

    window.getBeastPackDisplayName = function getBeastPackDisplayName(phase) {
        if (phase === 'wolf') return '狼群围攻';
        if (phase === 'bear') return '巨熊粉碎';
        return '兽群统领';
    };

    window.applyBeastmasterSkillDisplayOverrides = function applyBeastmasterSkillDisplayOverrides(player, skillDef) {
        if (!isBeastmaster(player) || !skillDef || skillDef.id !== 'beast_pack') return skillDef;
        const phase = window.getBeastPackDisplayPhase(player, player.gameInstance);
        const name = window.getBeastPackDisplayName(phase);
        return Object.assign({}, skillDef, { name, _beastPackDisplayPhase: phase });
    };

    function aliveSummons(g, player) {
        if (!g || !g._skillEntities || !player) return [];
        return (g._skillEntities.summons || []).filter(s => s && s.owner === player && s.hp > 0);
    }

    function countBeastPets(player, g) {
        const pets = aliveSummons(g, player);
        const wolves = pets.filter(s => s.unitId === WOLF_UNIT);
        const bears = pets.filter(s => s.unitId === BEAR_UNIT);
        return { wolves, bears, wolfCount: wolves.length, bearCount: bears.length };
    }

    function baseAtk(player) {
        return typeof window.getPlayerEffectiveAttack === 'function'
            ? window.getPlayerEffectiveAttack(player) : (player.baseAttack || 10);
    }

    function findCommandTarget(player, monsters, range) {
        let target = null;
        let td = Infinity;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const d = Math.hypot(m.x - player.x, m.y - player.y);
            if (d <= range && d < td) { td = d; target = m; }
        });
        if (!target && typeof window.findMarkedTargetForOwner === 'function') {
            target = window.findMarkedTargetForOwner(player, monsters);
        }
        return target;
    }

    window.getPreyMarkStacks = function getPreyMarkStacks(monster, player) {
        if (!monster || !player || !monster._preyMark) return 0;
        const pm = monster._preyMark;
        if (pm.owner && pm.owner !== player) return 0;
        return Math.min(PREY_MAX_STACKS, pm.stacks || 0);
    };

    window.addPreyMarkStacks = function addPreyMarkStacks(monster, player, stacks, g) {
        if (!monster || !player || !stacks) return 0;
        if (!monster._preyMark) {
            monster._preyMark = { stacks: 0, owner: player, maxStacks: PREY_MAX_STACKS };
        }
        const pm = monster._preyMark;
        if (pm.owner && pm.owner !== player) return pm.stacks || 0;
        pm.owner = player;
        pm.stacks = Math.min(PREY_MAX_STACKS, (pm.stacks || 0) + stacks);
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(monster.x, monster.y - 28, '猎物×' + pm.stacks, '#cc8844', 900, 13);
        }
        return pm.stacks;
    };

    window.consumePreyMarks = function consumePreyMarks(monster, player) {
        if (!monster || !monster._preyMark) return 0;
        const pm = monster._preyMark;
        if (pm.owner && pm.owner !== player) return 0;
        const stacks = pm.stacks || 0;
        monster._preyMark = null;
        return stacks;
    };

    window.getPreyMarkPetDamageMult = function getPreyMarkPetDamageMult(pet, target) {
        if (!pet || !target || !target._preyMark) return 1;
        const pm = target._preyMark;
        if (pm.owner && pm.owner !== pet.owner) return 1;
        const stacks = Math.min(PREY_MAX_STACKS, pm.stacks || 0);
        return stacks > 0 ? 1 + (stacks * PREY_PET_BONUS_PER_STACK) / 100 : 1;
    };

    window.getHunterNetPetDamageMult = function getHunterNetPetDamageMult(pet, target, now) {
        if (!pet || !target) return 1;
        const t = now != null ? now : Date.now();
        if (target._hunterNetUntil && t < target._hunterNetUntil) {
            return 1 + (target._hunterNetBonusPct || 30) / 100;
        }
        return 1;
    };

    window.hasActivePackRoarMark = function hasActivePackRoarMark(player, monsters, now) {
        if (!player) return false;
        const t = now != null ? now : Date.now();
        return (monsters || []).some(m => {
            if (!m || m.hp <= 0 || !m._classSkillMark) return false;
            const mk = m._classSkillMark;
            if (mk.expireTime <= t) return false;
            if (mk.markId !== PACK_ROAR_MARK) return false;
            return !mk.owner || mk.owner === player;
        });
    };

    window.getEffectiveBeastCommandCd = function getEffectiveBeastCommandCd(player, baseMs, monsters, now) {
        const base = baseMs || 3000;
        if (!player || !isBeastmaster(player)) return base;
        if (typeof window.isBeastRampageFreeCommand === 'function'
            && window.isBeastRampageFreeCommand(player, { id: STORM_CD_SKILL }, now)) {
            return 0;
        }
        if (window.hasActivePackRoarMark(player, monsters, now)) {
            return Math.floor(base * 0.5);
        }
        return base;
    };

    window.isBeastRampageFreeCommand = function isBeastRampageFreeCommand(player, skillDef, now, gameInstance) {
        if (!player || !skillDef || skillDef.id !== 'beast_pack') return false;
        const t = now != null ? now : Date.now();
        if (player._beastRampageUntil && t < player._beastRampageUntil) return true;
        const st = gameInstance && gameInstance._skillEntities;
        if (st && st.fields) {
            return st.fields.some(f => f.owner === player && f.skillDef
                && f.skillDef.id === 'beast_rampage' && t < f.expireTime);
        }
        return false;
    };

    window.isPackRoarFreeMark = function isPackRoarFreeMark(player) {
        return !!(player && player._packRoarFreeMark);
    };

    window.onPackRoarMarkKill = function onPackRoarMarkKill(player, monster, gameInstance) {
        if (!player || !monster || !monster._classSkillMark) return;
        const mk = monster._classSkillMark;
        if (mk.markId !== PACK_ROAR_MARK) return;
        if (mk.owner && mk.owner !== player) return;
        player._packRoarFreeMark = true;
        if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
            gameInstance.addFloatingText(player.x, player.y - 36, '下一标记免费!', '#ffcc44', 1000, 13);
        }
    };

    window.updateBearGuardPassive = function updateBearGuardPassive(player, g, now) {
        if (!player || !isBeastmaster(player)) return;
        const t = now != null ? now : Date.now();
        const hasBear = countBeastPets(player, g).bearCount > 0;
        player.buffs = player.buffs || [];
        const buffId = 'bear_guard_' + player.id;
        const idx = player.buffs.findIndex(b => b && b.id === buffId);
        if (hasBear) {
            const dr = 15;
            const buff = {
                id: buffId,
                name: '战熊守护',
                expireTime: t + 60000,
                effects: { damageReduction: dr },
                hudVisible: true
            };
            if (idx >= 0) player.buffs[idx] = buff;
            else player.buffs.push(buff);
        } else if (idx >= 0) {
            player.buffs.splice(idx, 1);
        }
        if (typeof player.updateStats === 'function') player.updateStats();
    };

    window.maintainBeastPack = function maintainBeastPack(player, skillDef, ec, g, now) {
        if (!player || !g || !g._skillEntities || !ec) {
            return { wolf: null, bear: null, anyAction: false };
        }
        const c = ec.entityConfig || {};
        const dur = c.durationMs != null ? c.durationMs : window.DEFAULT_PET_DURATION_MS;
        const wolfInh = c.wolfInheritStats || { hp: 0.5, attack: 0.45, defense: 0.3 };
        const bearInh = c.bearInheritStats || { hp: 0.8, attack: 0.3, defense: 0.5 };
        const wolfResult = window.maintainPetCap(player, g, {
            unitId: WOLF_UNIT,
            maxCount: c.wolfCount || 2,
            durationMs: dur,
            inheritStats: wolfInh,
            spawnOffset: c.spawnOffset || 55,
            aiType: c.aiType || 'melee_chase',
            attackIntervalMs: c.attackIntervalMs || 900,
            size: c.wolfSize || 22,
            color: c.wolfColor || '#888888',
            statusOnHit: c.wolfStatusOnHit || [{ type: 'bleed', durationMs: 3000 }]
        }, now, skillDef);
        const bearResult = window.maintainPetCap(player, g, {
            unitId: BEAR_UNIT,
            maxCount: c.bearCount || 1,
            durationMs: dur,
            inheritStats: bearInh,
            spawnOffset: c.spawnOffset || 55,
            aiType: c.aiType || 'melee_chase',
            attackIntervalMs: c.attackIntervalMs || 900,
            size: c.bearSize || 28,
            color: c.bearColor || '#665544',
            tauntRadius: c.bearTauntRadius || 120,
            isBear: true
        }, now, skillDef);
        const anyAction = (wolfResult.spawned + wolfResult.refreshed + bearResult.spawned + bearResult.refreshed) > 0;
        return { wolf: wolfResult, bear: bearResult, anyAction: anyAction };
    };

    window.spawnBeastPack = function spawnBeastPack(player, skillDef, ec, g, monsters, now) {
        if (!player || !g || !g._skillEntities) return false;
        const result = window.maintainBeastPack(player, skillDef, ec, g, now);
        if (!result.anyAction) return false;

        if (player._beastCommandNext == null) player._beastCommandNext = 'wolf';
        window.updateBearGuardPassive(player, g, now);
        if (typeof g.addFloatingText === 'function') {
            const refreshed = (result.wolf && result.wolf.refreshed || 0) + (result.bear && result.bear.refreshed || 0);
            const spawned = (result.wolf && result.wolf.spawned || 0) + (result.bear && result.bear.spawned || 0);
            const msg = refreshed > 0 && spawned === 0 ? '兽群刷新!' : '兽群集结!';
            g.addFloatingText(player.x, player.y - 24, msg, '#aaddff', 900, 14);
        }
        return true;
    };

    function setCommandCd(player, skillDef, c, monsters, now) {
        const cdMs = window.getEffectiveBeastCommandCd(player, c.commandCooldownMs || 3000, monsters, now);
        if (cdMs <= 0) return;
        player._beastCommandCd = player._beastCommandCd || {};
        player._beastCommandCd[skillDef.id] = now + cdMs;
    }

    function isCommandOnCd(player, skillDef, c, monsters, now) {
        if (window.isBeastRampageFreeCommand(player, skillDef, now)) return false;
        const cdMs = window.getEffectiveBeastCommandCd(player, c.commandCooldownMs || 3000, monsters, now);
        player._beastCommandCd = player._beastCommandCd || {};
        const end = player._beastCommandCd[skillDef.id] || 0;
        return now < end && cdMs > 0;
    }

    function executeWolfPackAssault(player, skillDef, c, g, monsters, now) {
        const wolves = countBeastPets(player, g).wolves;
        if (!wolves.length) return false;
        const range = skillDef.range || c.commandRange || 400;
        const target = findCommandTarget(player, monsters, range);
        if (!target) {
            if (typeof g.addFloatingText === 'function') {
                g.addFloatingText(player.x, player.y - 20, '无围攻目标', '#ff6666');
            }
            return true;
        }
        const mult = c.wolfCommandDamageMult || 1.8;
        const dmgEach = Math.max(1, Math.floor(baseAtk(player) * mult));
        wolves.forEach(w => {
            w._pounceTarget = target;
            w._pounceUntil = now + 700;
            w._pounceDmgOverride = dmgEach;
            w._pounceSpeed = c.commandPounceSpeed || 10;
        });
        window.addPreyMarkStacks(target, player, c.wolfCommandPreyStacks || 2, g);
        if (typeof g.addFloatingText === 'function') {
            g.addFloatingText(player.x, player.y - 32, '狼群围攻!', '#ffaa44', 900, 14);
        }
        if (typeof window.playClassSkillVfx === 'function') {
            window.playClassSkillVfx(player, skillDef, g, {
                primaryTarget: target, hitTargets: [target], hit: true, wolfPounce: true
            });
        }
        return true;
    }

    function executeBearCrush(player, skillDef, c, g, monsters, now) {
        const bears = countBeastPets(player, g).bears;
        if (!bears.length) return false;
        const range = skillDef.range || c.commandRange || 400;
        const target = findCommandTarget(player, monsters, range);
        if (!target) {
            if (typeof g.addFloatingText === 'function') {
                g.addFloatingText(player.x, player.y - 20, '无粉碎目标', '#ff6666');
            }
            return true;
        }
        const bear = bears[0];
        const stacks = window.getPreyMarkStacks(target, player);
        const baseMult = c.bearCommandBaseMult || 3.0;
        const perStack = c.bearCommandPerPreyStackMult || 0.5;
        const mult = baseMult + stacks * perStack;
        const splashR = c.bearCommandSplashRadius || 80;
        const centerDmg = Math.max(1, Math.floor(baseAtk(player) * mult));

        bear.x = target.x + (Math.random() - 0.5) * 20;
        bear.y = target.y + (Math.random() - 0.5) * 20;

        const hitList = [];
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const d = Math.hypot(m.x - target.x, m.y - target.y);
            if (d <= splashR + (m.size || 20) * 0.5) hitList.push(m);
        });
        if (!hitList.length) hitList.push(target);

        hitList.forEach(m => {
            const isPrimary = m === target;
            const dmg = isPrimary ? centerDmg : Math.max(1, Math.floor(centerDmg * 0.75));
            if (typeof m.takeDamage === 'function') m.takeDamage(dmg);
            if (g && typeof g.addFloatingText === 'function') {
                g.addFloatingText(m.x, m.y - 6, String(Math.floor(dmg)), '#cc7744', 900, 18, true);
            }
        });
        window.consumePreyMarks(target, player);
        if (typeof g.triggerHitImpact === 'function') {
            g.triggerHitImpact(target.x, target.y, {
                target, sourceX: bear.x, sourceY: bear.y, skipSound: false
            });
        }
        if (typeof g.addEquipmentEffect === 'function') {
            g.addEquipmentEffect('class_skill_vfx', target.x, target.y, {
                duration: 320, variant: 'pet_bite', radius: splashR * 0.5, color: '#886644'
            });
        }
        if (typeof g.addFloatingText === 'function') {
            const label = stacks > 0 ? '巨熊粉碎×' + (baseMult + stacks * perStack).toFixed(1) : '巨熊粉碎!';
            g.addFloatingText(player.x, player.y - 32, label, '#cc8844', 1000, 14);
        }
        return true;
    }

    window.tryBeastPackCommand = function tryBeastPackCommand(player, skillDef, ec, g, monsters, now) {
        if (!isBeastmaster(player)) return null;
        const c = ec.entityConfig || {};
        const t = now != null ? now : Date.now();
        const counts = countBeastPets(player, g);
        const packReady = counts.wolfCount >= (c.wolfCount || 2) && counts.bearCount >= (c.bearCount || 1);

        if (!packReady) {
            window.spawnBeastPack(player, skillDef, ec, g, monsters, t);
            return true;
        }

        if (isCommandOnCd(player, skillDef, c, monsters, t)) {
            if (typeof g.addFloatingText === 'function') {
                g.addFloatingText(player.x, player.y - 20, '指令冷却中', '#ff6666');
            }
            return true;
        }

        const next = player._beastCommandNext || 'wolf';
        let ok = false;
        if (next === 'bear') {
            ok = executeBearCrush(player, skillDef, c, g, monsters, t);
            player._beastCommandNext = 'wolf';
        } else {
            ok = executeWolfPackAssault(player, skillDef, c, g, monsters, t);
            player._beastCommandNext = 'bear';
        }
        if (ok) setCommandCd(player, skillDef, c, monsters, t);
        return true;
    };

    window.applyBeastRampageUlt = function applyBeastRampageUlt(player, cfg, g, now) {
        if (!player || !cfg) return;
        const dur = cfg.durationMs || cfg.ultDurationMs || 10000;
        player._beastRampageUntil = now + dur;
        if (typeof window.applyPetBloodlust === 'function') {
            window.applyPetBloodlust(player, cfg, g, now);
        }
    };

    window.tickHunterNetField = function tickHunterNetField(f, monsters, g, now) {
        if (!f || f.triggerType !== 'hunter_net') return;
        const ec = f.entityConfig || {};
        const rootMs = ec.rootMs || f.rootMs || 2000;
        const bonusPct = ec.petDamageBonusPercent || f.petDamageBonusPercent || 30;
        f._netRooted = f._netRooted || new Set();
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - f.x, m.y - f.y) > f.radius + (m.size || 20) * 0.5) return;
            m._hunterNetUntil = now + 400;
            m._hunterNetBonusPct = bonusPct;
            if (!f._netRooted.has(m)) {
                f._netRooted.add(m);
                if (typeof window.applyMonsterSkillDebuffs === 'function') {
                    window.applyMonsterSkillDebuffs(m, { stunMs: rootMs }, g, now, {
                        tauntTarget: f.owner
                    });
                }
            }
        });
    };

    window.clearBeastmasterCombatState = function clearBeastmasterCombatState(player) {
        if (!player) return;
        delete player._beastCommandNext;
        delete player._beastCommandCd;
        delete player._beastRampageUntil;
        delete player._packRoarFreeMark;
    };
})();
