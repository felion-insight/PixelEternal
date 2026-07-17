/**
 * 游侠 · 兽群领袖被动与宠物联动
 */
(function () {
    'use strict';

    const PACK_LEADER_CLASSES = { ranger: true, beastmaster: true };

    function isPackLeaderClass(player) {
        if (!player || !player.classData) return false;
        const id = typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
        return !!PACK_LEADER_CLASSES[id];
    }

    function aliveSummons(gameInstance, player) {
        if (!gameInstance || !gameInstance._skillEntities || !player) return [];
        return (gameInstance._skillEntities.summons || []).filter(
            s => s && s.owner === player && s.hp > 0
        );
    }

    window.getPackLeaderBonuses = function getPackLeaderBonuses(player, gameInstance) {
        if (!isPackLeaderClass(player)) {
            return { attackPercent: 0, name: null, petCount: 0 };
        }
        const pets = aliveSummons(gameInstance || (player.gameInstance), player);
        const perPet = 8;
        return {
            attackPercent: pets.length * perPet,
            name: '兽群领袖',
            petCount: pets.length
        };
    };

    const PET_ATTACK_WINDUP_MS = 220;
    const PET_ATTACK_RECOVERY_MS = 100;
    const PET_MELEE_RANGE = 38;
    window.PET_MELEE_RANGE = PET_MELEE_RANGE;

    window.isPetAttackBusy = function isPetAttackBusy(pet, now) {
        return !!(pet && pet._attackBusyUntil && now < pet._attackBusyUntil);
    };

    window.tryStartPetMeleeAttack = function tryStartPetMeleeAttack(pet, target, atkInterval, now) {
        if (!pet || !target || target.hp <= 0) return false;
        if (window.isPetAttackBusy(pet, now)) return false;
        if (now - (pet.lastAttack || 0) < atkInterval) return false;
        pet._attackTarget = target;
        pet._attackAngle = Math.atan2(target.y - pet.y, target.x - pet.x);
        pet._attackStrikeAt = now + PET_ATTACK_WINDUP_MS;
        pet._attackBusyUntil = now + PET_ATTACK_WINDUP_MS + PET_ATTACK_RECOVERY_MS;
        pet._attackExecuted = false;
        return true;
    };

    window.tickPetMeleeAttack = function tickPetMeleeAttack(pet, gameInstance, now) {
        if (!pet || pet._attackExecuted || !pet._attackStrikeAt || now < pet._attackStrikeAt) return;
        const t = pet._attackTarget;
        pet._attackExecuted = true;
        pet.lastAttack = now;
        if (!t || t.hp <= 0) return;
        const dx = t.x - pet.x;
        const dy = t.y - pet.y;
        const dist = Math.hypot(dx, dy) || 1;
        const lunge = Math.min(16, Math.max(0, dist - 18));
        if (lunge > 0) {
            pet.x += (dx / dist) * lunge;
            pet.y += (dy / dist) * lunge;
        }
        window.executePetMeleeStrike(pet, t, gameInstance, now);
    };

    window.executePetMeleeStrike = function executePetMeleeStrike(pet, target, gameInstance, now) {
        if (!pet || !target || target.hp <= 0) return;
        let dmg = pet.attack || 1;
        if (typeof window.getPetBloodlustDamage === 'function') {
            dmg = window.getPetBloodlustDamage(pet, dmg);
        }
        if (typeof window.getPetMarkDamageMultiplier === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getPetMarkDamageMultiplier(pet, target)));
        }
        if (typeof window.getPreyMarkPetDamageMult === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getPreyMarkPetDamageMult(pet, target)));
        }
        if (typeof window.getHunterNetPetDamageMult === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getHunterNetPetDamageMult(pet, target, now)));
        }
        if (typeof window.getCombatStatusDamageMultiplier === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getCombatStatusDamageMultiplier(target)));
        }
        const owner = pet.owner;
        if (owner && typeof window.getSetModifier === 'function') {
            const petPct = window.getSetModifier(owner, 'petDamagePercent', 0);
            const cmdBonus = window.getSetModifier(owner, 'commandSwapPetDamage', 0);
            const summonPower = window.getSetModifier(owner, 'summonPower', 0);
            let mult = 1 + petPct / 100;
            if (cmdBonus > 0 && owner._beastCommandPhase) mult += cmdBonus;
            if (summonPower > 0) mult += summonPower;
            if (mult !== 1) dmg = Math.max(1, Math.floor(dmg * mult));
        }
        // 宠物攻击不经过 applyDmg，需要手动写入技能来源，否则技能试验场
        // 只能看到木桩实际掉血，却无法将伤害归入当前职业的技能统计。
        if (target._battleStats) {
            const sourceId = pet.skillDef && pet.skillDef.id
                ? pet.skillDef.id : 'pet_attack';
            target._pendingDamageSource = 'skill:' + sourceId;
        }
        const killed = typeof target.takeDamage === 'function' ? target.takeDamage(dmg) : false;
        if (pet.statusOnHit && typeof window.applySkillStatusEffects === 'function') {
            window.applySkillStatusEffects({ statusEffects: pet.statusOnHit }, target, pet.owner, gameInstance);
        }
        window.onPetAttackHit(pet, target, gameInstance, now);
        if (gameInstance) {
            if (typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(
                    target.x, target.y, String(Math.floor(dmg)), '#ffaa66', 900, 18, true
                );
            }
            if (gameInstance.soundManager && typeof gameInstance.soundManager.playSound === 'function') {
                gameInstance.soundManager.playSound('swing');
            }
            if (typeof gameInstance.triggerHitImpact === 'function') {
                gameInstance.triggerHitImpact(target.x, target.y, {
                    target,
                    sourceX: pet.x,
                    sourceY: pet.y,
                    skipSound: true
                });
            }
            if (typeof gameInstance.addEquipmentEffect === 'function') {
                gameInstance.addEquipmentEffect('class_skill_vfx', pet.x, pet.y, {
                    duration: 180,
                    variant: 'pet_bite',
                    angle: pet._attackAngle || 0,
                    radius: (pet.size || 20) * 0.9,
                    color: pet.color || '#cc8844'
                });
            }
        }
        if (killed && pet.owner && gameInstance && gameInstance.player === pet.owner
            && typeof pet.owner.processKillRewards === 'function') {
            const isDummy = typeof TrainingDummy !== 'undefined' && target instanceof TrainingDummy;
            if (!isDummy) pet.owner.processKillRewards([target]);
        }
    };

    window.onPetAttackHit = function onPetAttackHit(pet, target, gameInstance, now) {
        if (!pet || !pet.owner || !target) return;
        const owner = pet.owner;
        if (isPackLeaderClass(owner) && owner.classResource) {
            if (typeof window.grantSkillResource === 'function') {
                const regenBonus = typeof window.getSetModifier === 'function'
                    ? window.getSetModifier(owner, 'petEnergyRegenPercent', 0) : 0;
                window.grantSkillResource(owner, Math.max(1, Math.floor(3 * (1 + regenBonus / 100))));
            }
        }
        if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
            gameInstance.addFloatingText(pet.x, pet.y - 8, '+3', '#aaddff', 600, 12);
        }
    };

    window.getPetMarkDamageMultiplier = function getPetMarkDamageMultiplier(pet, target) {
        if (!pet || !target || !target._classSkillMark) return 1;
        const mark = target._classSkillMark;
        if (mark.expireTime <= Date.now()) return 1;
        if (mark.owner && mark.owner !== pet.owner) return 1;
        const bonus = mark.petDamageBonus || 0;
        return bonus > 0 ? 1 + bonus / 100 : 1;
    };

    window.findMarkedTargetForOwner = function findMarkedTargetForOwner(owner, monsters) {
        if (!owner || !monsters) return null;
        const now = Date.now();
        let best = null;
        let bestD = Infinity;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0 || !m._classSkillMark) return;
            const mk = m._classSkillMark;
            if (mk.expireTime <= now) return;
            if (mk.owner && mk.owner !== owner) return;
            const d = Math.hypot(m.x - owner.x, m.y - owner.y);
            if (d < bestD) { bestD = d; best = m; }
        });
        return best;
    };

    window.rallyPetsToMark = function rallyPetsToMark(owner, target, gameInstance, petDamageBonus) {
        if (!owner || !target || !gameInstance || !gameInstance._skillEntities) return;
        (gameInstance._skillEntities.summons || []).forEach(s => {
            if (!s || s.owner !== owner || s.hp <= 0) return;
            s.focusTarget = target;
            s.focusUntil = Date.now() + 8000;
        });
        if (target._classSkillMark) {
            target._classSkillMark.petDamageBonus = petDamageBonus != null ? petDamageBonus : 30;
        }
        if (typeof gameInstance.addFloatingText === 'function') {
            gameInstance.addFloatingText(target.x, target.y - 20, '宠物集火!', '#ffcc44');
        }
    };

    window.getEffectiveWolfPounceCd = function getEffectiveWolfPounceCd(player, baseMs) {
        const base = baseMs || 8000;
        if (!player || !player._packAssaultUntil) return base;
        if (Date.now() < player._packAssaultUntil) return Math.floor(base * 0.5);
        return base;
    };

    window.tryWolfPounceCommand = function tryWolfPounceCommand(player, skillDef, ec, gameInstance, monsters, now) {
        const c = ec.entityConfig || {};
        const g = gameInstance;
        if (!player || !g || !g._skillEntities) return false;
        const unitId = c.summonUnitId || 'wolf_pet';
        const wolves = g._skillEntities.summons.filter(
            s => s && s.owner === player && s.unitId === unitId && s.hp > 0
        );
        if (wolves.length < (c.maxCount || 2)) return false;

        player._wolfPounceCd = player._wolfPounceCd || {};
        const cdKey = skillDef.id;
        const cdMs = window.getEffectiveWolfPounceCd(player, c.pounceCooldownMs || 8000);
        const last = player._wolfPounceCd[cdKey] || 0;
        if (now - last < cdMs) {
            if (typeof g.addFloatingText === 'function') {
                g.addFloatingText(player.x, player.y - 20, '扑咬冷却中', '#ff6666');
            }
            return true;
        }

        let target = null;
        let td = Infinity;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const d = Math.hypot(m.x - player.x, m.y - player.y);
            if (d <= (skillDef.range || c.pounceRange || 400) && d < td) {
                td = d; target = m;
            }
        });
        if (!target) {
            target = window.findMarkedTargetForOwner(player, monsters);
        }
        if (!target) {
            if (typeof g.addFloatingText === 'function') {
                g.addFloatingText(player.x, player.y - 20, '无扑击目标', '#ff6666');
            }
            return true;
        }

        player._wolfPounceCd[cdKey] = now;
        const mult = c.pounceDamageMult || 1.5;
        wolves.forEach(w => {
            w._pounceTarget = target;
            w._pounceUntil = now + 700;
            w._pounceDmgMult = mult;
            w._pounceSpeed = c.pounceSpeed || 9;
        });
        if (typeof g.addFloatingText === 'function') {
            g.addFloatingText(player.x, player.y - 28, '双狼扑击!', '#ffaa44');
        }
        if (typeof window.playClassSkillVfx === 'function') {
            window.playClassSkillVfx(player, skillDef, g, {
                primaryTarget: target,
                hitTargets: [target],
                hit: true,
                wolfPounce: true
            });
        }
        return true;
    };

    window.updatePetPounce = function updatePetPounce(pet, monsters, gameInstance, now) {
        if (!pet || !pet._pounceTarget || !pet._pounceUntil || now >= pet._pounceUntil) {
            delete pet._pounceTarget;
            delete pet._pounceUntil;
            delete pet._pounceDmgMult;
            return false;
        }
        const t = pet._pounceTarget;
        if (!t || t.hp <= 0) {
            delete pet._pounceTarget;
            return false;
        }
        const dx = t.x - pet.x;
        const dy = t.y - pet.y;
        const dist = Math.hypot(dx, dy) || 1;
        const sp = pet._pounceSpeed || 9;
        if (dist > 22) {
            pet.x += (dx / dist) * sp;
            pet.y += (dy / dist) * sp;
            return true;
        }
        let dmg = pet._pounceDmgOverride != null
            ? pet._pounceDmgOverride
            : Math.max(1, Math.floor(pet.attack * (pet._pounceDmgMult || 1.5)));
        const markMult = window.getPetMarkDamageMultiplier(pet, t);
        dmg = Math.max(1, Math.floor(dmg * markMult));
        if (typeof window.getPreyMarkPetDamageMult === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getPreyMarkPetDamageMult(pet, t)));
        }
        if (typeof window.getHunterNetPetDamageMult === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getHunterNetPetDamageMult(pet, t, now)));
        }
        if (typeof t.takeDamage === 'function') t.takeDamage(dmg);
        if (pet.statusOnHit && typeof window.applySkillStatusEffects === 'function') {
            window.applySkillStatusEffects({ statusEffects: pet.statusOnHit }, t, pet.owner, gameInstance);
        }
        window.onPetAttackHit(pet, t, gameInstance, now);
        delete pet._pounceTarget;
        delete pet._pounceUntil;
        delete pet._pounceDmgOverride;
        if (gameInstance && typeof gameInstance.triggerHitImpact === 'function') {
            gameInstance.triggerHitImpact(t.x, t.y, {
                target: t,
                sourceX: pet.x,
                sourceY: pet.y,
                skipSound: false
            });
        }
        if (gameInstance && typeof gameInstance.addEquipmentEffect === 'function') {
            gameInstance.addEquipmentEffect('class_skill_vfx', pet.x, pet.y, {
                duration: 220,
                variant: 'pet_bite',
                angle: Math.atan2(t.y - pet.y, t.x - pet.x),
                radius: (pet.size || 20) * 1.1,
                color: pet.color || '#ff8844'
            });
        }
        if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
            gameInstance.addFloatingText(t.x, t.y - 6, String(Math.floor(dmg)), '#ffaa66', 900, 20, true);
        }
        return true;
    };

    window.applyPetBloodlust = function applyPetBloodlust(player, cfg, gameInstance, now) {
        if (!player || !cfg || !gameInstance || !gameInstance._skillEntities) return;
        const dur = cfg.durationMs || 12000;
        const until = now + dur;
        player._packAssaultUntil = until;
        (gameInstance._skillEntities.summons || []).forEach(s => {
            if (!s || s.owner !== player || s.hp <= 0) return;
            s._bloodlustUntil = until;
            s._bloodlustDmgMult = 1 + (cfg.damageBonus || 50) / 100;
            s._bloodlustSpeedMult = 1 + (cfg.attackSpeedBonus || 80) / 100;
            s._ccImmune = !!cfg.ccImmune;
            if (cfg.healFull) {
                s.hp = s.maxHp || s.hp;
            }
        });
        if (typeof gameInstance.addFloatingText === 'function') {
            gameInstance.addFloatingText(player.x, player.y - 32, '嗜血狂暴!', '#ff4422');
        }
    };

    window.getPetBloodlustAttackInterval = function getPetBloodlustAttackInterval(pet, baseMs) {
        if (!pet || !pet._bloodlustUntil || Date.now() >= pet._bloodlustUntil) return baseMs;
        const mult = pet._bloodlustSpeedMult || 1.8;
        return Math.max(200, Math.floor(baseMs / mult));
    };

    window.getPetBloodlustDamage = function getPetBloodlustDamage(pet, baseDmg) {
        if (!pet || !pet._bloodlustUntil || Date.now() >= pet._bloodlustUntil) return baseDmg;
        return Math.max(1, Math.floor(baseDmg * (pet._bloodlustDmgMult || 1.5)));
    };

    window.DEFAULT_PET_DURATION_MS = 120000;

    function petBaseAtk(player) {
        return typeof window.getPlayerEffectiveAttack === 'function'
            ? window.getPlayerEffectiveAttack(player) : (player.baseAttack || 10);
    }

    window.getAliveSummonsByUnit = function getAliveSummonsByUnit(st, player, unitId) {
        return (st.summons || []).filter(
            s => s && s.owner === player && s.unitId === unitId && s.hp > 0
        );
    };

    window.refreshSummonStats = function refreshSummonStats(s, player, inh, expireAt) {
        const hp = Math.max(1, Math.floor(player.maxHp * (inh.hp || 0.4)));
        s.maxHp = hp;
        s.hp = hp;
        s.attack = Math.max(1, Math.floor(petBaseAtk(player) * (inh.attack || 0.3)));
        s.defense = Math.floor((player.baseDefense || 5) * (inh.defense || 0.2));
        s.expireTime = expireAt;
    };

    /**
     * 固定上限 + 刷新替换：未满补差额，已满则刷新 HP/持续时间，总数永不超过上限
     */
    window.maintainPetCap = function maintainPetCap(player, g, opts, now, skillDef) {
        if (!player || !g || !g._skillEntities || !opts || !opts.unitId) {
            return { atCap: false, refreshed: 0, spawned: 0 };
        }
        const st = g._skillEntities;
        const unitId = opts.unitId;
        const maxCount = opts.maxCount || 1;
        const dur = opts.durationMs != null ? opts.durationMs : window.DEFAULT_PET_DURATION_MS;
        const expireAt = now + dur;
        const inh = opts.inheritStats || {};

        st.summons = (st.summons || []).filter(s => {
            if (!s || s.owner !== player || s.unitId !== unitId) return true;
            return s.hp > 0;
        });

        const alive = window.getAliveSummonsByUnit(st, player, unitId);

        if (alive.length >= maxCount) {
            alive.forEach(s => window.refreshSummonStats(s, player, inh, expireAt));
            return { atCap: true, refreshed: alive.length, spawned: 0 };
        }

        const need = maxCount - alive.length;
        for (let i = 0; i < need; i++) {
            const ang = Math.random() * Math.PI * 2;
            const off = (opts.spawnOffset || 50) + i * 12 + Math.random() * 8;
            st.summons.push({
                x: player.x + Math.cos(ang) * off,
                y: player.y + Math.sin(ang) * off,
                hp: Math.max(1, Math.floor(player.maxHp * (inh.hp || 0.4))),
                maxHp: Math.max(1, Math.floor(player.maxHp * (inh.hp || 0.4))),
                attack: Math.max(1, Math.floor(petBaseAtk(player) * (inh.attack || 0.3))),
                defense: Math.floor((player.baseDefense || 5) * (inh.defense || 0.2)),
                owner: player,
                unitId,
                aiType: opts.aiType || 'melee_chase',
                attackIntervalMs: opts.attackIntervalMs || 900,
                lastAttack: 0,
                expireTime: expireAt,
                size: opts.size || 20,
                color: opts.color || '#888888',
                statusOnHit: opts.statusOnHit,
                skillDef: skillDef || opts.skillDef,
                vx: 0, vy: 0,
                tauntRadius: opts.tauntRadius || 0,
                isGhost: !!opts.isGhost,
                isBear: !!opts.isBear,
                bleedDmgPerSecMult: opts.bleedDmgPerSecMult
            });
        }
        return { atCap: false, refreshed: 0, spawned: need };
    };

    window.buildPetCapOpts = function buildPetCapOpts(c, overrides) {
        return Object.assign({
            maxCount: c.maxCount || 1,
            durationMs: c.durationMs != null ? c.durationMs : window.DEFAULT_PET_DURATION_MS,
            inheritStats: c.inheritStats || {},
            spawnOffset: c.spawnOffset || 55,
            aiType: c.aiType || 'melee_chase',
            attackIntervalMs: c.attackIntervalMs || 900,
            size: c.size || 20,
            color: c.color || '#888888',
            statusOnHit: c.statusOnHit,
            tauntRadius: c.tauntRadius || 0
        }, overrides || {});
    };

    window.spawnGhostWolvesForUlt = function spawnGhostWolvesForUlt(
        player, skillDef, cfg, gameInstance, monsters, now
    ) {
        if (!player || !cfg || !gameInstance || !gameInstance._skillEntities) return;
        const t = typeof now === 'number' ? now : Date.now();
        const st = gameInstance._skillEntities;
        const inh = cfg.inheritStats || { hp: 0.35, attack: 0.6, defense: 0.15 };
        const unitId = cfg.unitId || 'ghost_wolf';
        const count = cfg.count || 3;
        const dur = cfg.durationMs || 12000;
        const maxActive = cfg.maxActive != null ? cfg.maxActive : count;
        const baseAtkVal = petBaseAtk(player);

        const existing = window.getAliveSummonsByUnit(st, player, unitId);
        if (existing.length >= maxActive) {
            existing.sort((a, b) => a.expireTime - b.expireTime);
            const trim = existing.length - maxActive + count;
            for (let i = 0; i < trim && i < existing.length; i++) {
                existing[i].expireTime = t;
            }
        }

        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const off = (cfg.spawnOffset || 45) + i * 14;
            st.summons.push({
                x: player.x + Math.cos(ang) * off,
                y: player.y + Math.sin(ang) * off,
                hp: Math.max(1, Math.floor(player.maxHp * (inh.hp || 0.35))),
                maxHp: Math.max(1, Math.floor(player.maxHp * (inh.hp || 0.35))),
                attack: Math.max(1, Math.floor(baseAtkVal * (inh.attack || 0.6))),
                defense: Math.floor((player.baseDefense || 5) * (inh.defense || 0.15)),
                owner: player,
                unitId,
                aiType: 'melee_chase',
                attackIntervalMs: cfg.attackIntervalMs || 850,
                lastAttack: 0,
                expireTime: t + dur,
                spawnTime: t,
                size: cfg.size || 20,
                color: cfg.color || '#88aacc',
                statusOnHit: cfg.statusOnHit,
                skillDef,
                vx: 0, vy: 0,
                isGhost: true,
                isTemporary: true
            });
        }
    };

    window.spawnTrapFieldAt = function spawnTrapFieldAt(player, skillDef, trapCfg, x, y, gameInstance, now) {
        if (!player || !trapCfg || !gameInstance || !gameInstance._skillEntities) return;
        const st = gameInstance._skillEntities;
        const max = trapCfg.maxCount || 3;
        const mineFields = st.fields.filter(
            f => f.owner === player && f.triggerType === 'proximity_mine'
                && f.skillDef && f.skillDef.id === skillDef.id
        );
        if (mineFields.length >= max) {
            mineFields.sort((a, b) => a.expireTime - b.expireTime);
            mineFields[0].expireTime = 0;
        }
        const ot = trapCfg.onTrigger || {};
        const baseAtk = typeof window.getPlayerEffectiveAttack === 'function'
            ? window.getPlayerEffectiveAttack(player) : (player.baseAttack || 10);
        st.fields.push({
            x, y,
            radius: trapCfg.fieldRadius || 60,
            expireTime: now + (trapCfg.fieldDurationMs || 30000),
            tickIntervalMs: 1000,
            lastTick: now,
            triggerType: 'proximity_mine',
            armed: !(trapCfg.armDelayMs > 0),
            armTime: now + (trapCfg.armDelayMs || 300),
            invisible: trapCfg.invisible !== false,
            onTrigger: ot,
            damage: Math.max(1, Math.floor(baseAtk * (ot.damageMultiplier || trapCfg.damageMultiplier || 1))),
            owner: player,
            skillDef,
            entityConfig: trapCfg,
            color: trapCfg.color || '#88ddff',
            spawnTime: now,
            struck: false
        });
    };
})();
