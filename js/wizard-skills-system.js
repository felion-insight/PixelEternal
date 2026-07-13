/**
 * 巫师 · 相位技能形态变换与特殊施法逻辑
 */
(function () {
    'use strict';

    const WIZARD_SKILLS = {
        mage_basic: true,
        elemental_burst: true,
        resonance_field: true,
        phase_shift: true,
        elemental_awakening: true
    };

    const BASIC_BY_PHASE = {
        fire: {
            name: '焚焰弹',
            speed: 480,
            color: '#ff6622',
            explodeRadius: 30,
            statusOnHit: [{ type: 'burn', durationMs: 4000, stacks: 1 }],
            finisherBurnStacks: 2
        },
        frost: {
            name: '冰晶镖',
            speed: 600,
            color: '#88ccff',
            debuffSlowPercent: 25,
            debuffDurationMs: 1500,
            finisherSlowPercent: 50
        },
        overload: {
            name: '弧光弹',
            speed: 700,
            color: '#44aaff',
            bounceCount: 1,
            bounceRadius: 100,
            finisherBounceCount: 2
        },
        awakening: {
            name: '三合弹',
            speed: 620,
            color: '#ffdd88',
            explodeRadius: 24,
            bounceCount: 1,
            bounceRadius: 100,
            statusOnHit: [
                { type: 'burn', durationMs: 3000, stacks: 1 },
                { type: 'frostbite', durationMs: 3000 }
            ],
            debuffSlowPercent: 20,
            debuffDurationMs: 1500
        }
    };

    const BURST_BY_PHASE = {
        fire: {
            name: '烈焰风暴',
            resourceCost: 30,
            windupMs: 300,
            channelDurationMs: 800,
            channelTicks: 6,
            tickDamageMult: 0.5,
            coneRange: 300,
            halfAngleDeg: 30,
            statusOnHit: [{ type: 'burn', durationMs: 4000, stacks: 1 }],
            color: '#ff4400',
            elementTag: 'fire'
        },
        frost: {
            name: '极寒新星',
            resourceCost: 18,
            entityType: 'field',
            targeted: true,
            delayMs: 400,
            fieldRadius: 110,
            range: 420,
            damageMultiplier: 1.8,
            dotDamageMult: 0.4,
            dotDurationMs: 3000,
            dotTickMs: 500,
            freezeMs: 1500,
            slowFieldMs: 3000,
            enemySlowPercent: 30,
            color: '#88ddff',
            elementTag: 'frost'
        },
        overload: {
            name: '雷霆之怒',
            resourceCost: 25,
            entityType: 'instant',
            shape: 'chain',
            range: 600,
            chainCount: 4,
            chainDecay: 0.12,
            damageMultiplier: 2.0,
            manaPerChainHit: 5,
            statusOnHit: [{ type: 'shock', durationMs: 2000 }],
            color: '#44aaff',
            elementTag: 'lightning'
        }
    };

    const FIELD_BY_PHASE = {
        fire: {
            name: '烈焰场',
            elementTag: 'fire',
            allyDmgBonusPercent: 15,
            damageEnemyPerTick: 0.3,
            statusOnTick: [{ type: 'burn', durationMs: 3000, stacks: 1 }],
            color: '#ff6622'
        },
        frost: {
            name: '冰封场',
            elementTag: 'frost',
            allyDrPercent: 20,
            enemySlowPercent: 30,
            periodicFreezeMs: 500,
            freezeIntervalMs: 2000,
            color: '#88ccff'
        },
        overload: {
            name: '电弧场',
            elementTag: 'lightning',
            allyAttackSpeedPercent: 25,
            shockTickDamageMult: 0.5,
            shockTickIntervalMs: 1500,
            color: '#44aaff'
        }
    };

    function isWizardTree(player) {
        return typeof window.isWizardTreePlayer === 'function' && window.isWizardTreePlayer(player);
    }

    function isArchmage(player) {
        if (!player || !player.classData) return false;
        const id = typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
        return id === 'archmage';
    }

    function getPhase(player) {
        if (typeof window.isWizardAwakening === 'function' && window.isWizardAwakening(player)) {
            return 'awakening';
        }
        return (typeof window.getElementPhase === 'function' ? window.getElementPhase(player) : null) || 'fire';
    }

    function cloneSkill(skillDef, ecPatch, name, desc, cost) {
        const ec = Object.assign({}, skillDef.entityConfig || {}, ecPatch);
        const out = Object.assign({}, skillDef, { entityConfig: ec });
        if (name) out.name = name;
        if (desc) out.description = desc;
        if (cost != null) out.resourceCost = cost;
        return out;
    }

    window.applyWizardSkillOverrides = function applyWizardSkillOverrides(player, skillDef) {
        if (!isWizardTree(player) || !skillDef || !WIZARD_SKILLS[skillDef.id]) return skillDef;
        const phase = getPhase(player);
        const ec = skillDef.entityConfig || {};

        if (skillDef.id === 'mage_basic') {
            const cfg = BASIC_BY_PHASE[phase] || BASIC_BY_PHASE.fire;
            const isAwake = phase === 'awakening';
            return cloneSkill(skillDef, {
                speed: cfg.speed,
                color: cfg.color,
                maxRange: 500,
                trajectory: 'homing',
                comboChain: 3,
                comboStepDamage: [1.0, 1.0, 1.3],
                comboChainWindowMs: 1800,
                resourcePerHit: 8,
                explodeRadius: cfg.explodeRadius || 0,
                bounceCount: cfg.bounceCount || 0,
                bounceRadius: cfg.bounceRadius || 0,
                finisherBounceCount: cfg.finisherBounceCount || 0,
                statusOnHit: cfg.statusOnHit,
                debuffSlowPercent: cfg.debuffSlowPercent,
                debuffDurationMs: cfg.debuffDurationMs,
                finisherBurnStacks: cfg.finisherBurnStacks,
                finisherSlowPercent: cfg.finisherSlowPercent,
                wizardBasicPhase: phase,
                elementTag: phase === 'overload' ? 'lightning' : (phase === 'frost' ? 'frost' : 'fire')
            }, cfg.name, isAwake
                ? '【觉醒·三合弹】灼烧+减速+弹跳合一。'
                : `【${cfg.name}】相位普攻，3连击终结强化。`);
        }

        if (skillDef.id === 'elemental_burst') {
            const cfg = BURST_BY_PHASE[phase] || BURST_BY_PHASE.fire;
            if (phase === 'awakening') {
                return cloneSkill(skillDef, {
                    wizardAwakeningBurst: true,
                    windupMs: 200,
                    color: '#ffdd88'
                }, '三灾合一', '【觉醒·三灾合一】锥形烈焰+冰晶炸裂+全屏连锁同时释放。', 50);
            }
            const patch = Object.assign({ wizardBurstPhase: phase, targeted: phase === 'frost' }, cfg);
            const out = cloneSkill(skillDef, patch, cfg.name,
                `【${cfg.name}】${phase === 'fire' ? '0.3s蓄力后可移动引导。' : phase === 'frost' ? '鼠标放置，0.4s延迟炸裂。' : '瞬发连锁闪电。'}`,
                cfg.resourceCost);
            if (phase === 'frost') {
                out.range = cfg.range || 420;
                out.aoeRadius = cfg.fieldRadius || 110;
            }
            return out;
        }

        if (skillDef.id === 'resonance_field') {
            const cfg = FIELD_BY_PHASE[phase] || FIELD_BY_PHASE.fire;
            if (phase === 'awakening') {
                return cloneSkill(skillDef, {
                    wizardAwakeningField: true,
                    allyDmgBonusPercent: 15,
                    allyDrPercent: 20,
                    allyAttackSpeedPercent: 25,
                    damageEnemyPerTick: 0.35,
                    statusOnTick: [{ type: 'burn', durationMs: 3000 }],
                    color: '#ffdd88'
                }, '三色圣所', '【觉醒·三色圣所】烈焰+冰封+电弧场效果叠加。');
            }
            return cloneSkill(skillDef, Object.assign({ wizardFieldPhase: phase }, cfg), cfg.name,
                `【${cfg.name}】放置元素共鸣场，持续6秒。`);
        }

        if (skillDef.id === 'phase_shift' && phase === 'awakening') {
            return cloneSkill(skillDef, { wizardAwakeningShift: true }, '三相跃迁',
                '【觉醒·三相跃迁】落点同时火焰爆发+冻结+感电。');
        }

        return skillDef;
    };

    window.getWizardPhaseVfxFamily = function getWizardPhaseVfxFamily(player) {
        if (!isWizardTree(player)) return 'elemental_power';
        const phase = getPhase(player);
        if (phase === 'fire') return 'mage_phase_fire';
        if (phase === 'frost') return 'mage_phase_frost';
        if (phase === 'overload') return 'mage_phase_overload';
        if (phase === 'awakening') return 'elemental_power';
        return 'elemental_power';
    };

    function wizardDmg(player, skillDef, ec, mult) {
        return typeof window.calcSkillEntityDamage === 'function'
            ? window.calcSkillEntityDamage(player, skillDef, ec, mult)
            : Math.max(1, Math.floor((player.baseMagicAttack || player.baseAttack || 10) * (mult || 1)));
    }

    function hitMonster(player, monster, dmg, skillDef, g, status) {
        if (!monster || monster.hp <= 0) return;
        if (typeof window.applySkillEntityDamage === 'function') {
            window.applySkillEntityDamage(player, monster, dmg, skillDef, g, status);
        } else {
            monster.takeDamage(dmg);
        }
    }

    function liveMonsters(g, cached) {
        if (cached && cached.length) return cached;
        if (g) {
            if (typeof g.getCurrentSceneTargets === 'function') {
                const targets = g.getCurrentSceneTargets();
                if (targets && targets.length) return targets;
            }
            if (typeof g._getSkillMonsters === 'function') {
                const targets = g._getSkillMonsters();
                if (targets && targets.length) return targets;
            }
            if (g.currentRoom && g.currentRoom.monsters) return g.currentRoom.monsters;
            if (g.monsters) return g.monsters;
        }
        return cached || [];
    }

    window.getWizardProjectileColor = function getWizardProjectileColor(player) {
        if (!isWizardTree(player)) return null;
        const cfg = BASIC_BY_PHASE[getPhase(player)];
        return cfg ? cfg.color : null;
    };

    window.applyWizardBasicHitEffect = function applyWizardBasicHitEffect(player, monster, p, g, now) {
        if (!isWizardTree(player) || !p || !p.skillDef || p.skillDef.id !== 'mage_basic') return;
        const ec = p.entityConfig || (p.skillDef.entityConfig || {});
        const phase = ec.wizardBasicPhase || getPhase(player);
        const step = p.skillDef._comboStep != null ? p.skillDef._comboStep : 0;
        const isFinisher = step === 2;

        if (phase === 'fire' || phase === 'awakening') {
            const stacks = isFinisher && ec.finisherBurnStacks ? ec.finisherBurnStacks : 1;
            if (typeof window.applyCombatStatus === 'function') {
                window.applyCombatStatus(monster, 'burn', { durationMs: 4000, stacks }, player, g);
            }
        }
        if (phase === 'frost' || phase === 'awakening') {
            const slow = isFinisher && ec.finisherSlowPercent ? ec.finisherSlowPercent : (ec.debuffSlowPercent || 25);
            if (typeof window.applyCcEffects === 'function') {
                window.applyCcEffects(monster, now, {
                    enemySlowPercent: slow,
                    enemySlowMs: ec.debuffDurationMs || 1500
                }, g, player);
            }
        }
        if ((phase === 'overload' || phase === 'awakening') && ec.bounceCount > 0 && p.bounceLeft == null) {
            const bounces = isFinisher && ec.finisherBounceCount ? ec.finisherBounceCount : ec.bounceCount;
            p.bounceLeft = bounces;
            p.bounceRadius = ec.bounceRadius || 100;
        }
    };

    window.castWizardElementalBurst = function castWizardElementalBurst(player, skillDef, g, monsters, now, castOptions) {
        if (!isWizardTree(player) || !skillDef) return false;
        const ec = skillDef.entityConfig || {};
        const phase = ec.wizardBurstPhase || getPhase(player);

        if (typeof window.tryTriggerWizardLiberationOnBurst === 'function') {
            window.tryTriggerWizardLiberationOnBurst(player, g);
        }

        if (ec.wizardAwakeningBurst) {
            return window.castWizardAwakeningBurst(player, skillDef, g, monsters, now, castOptions);
        }

        if (phase === 'fire') {
            return startWizardFlameChannel(player, skillDef, ec, g, monsters, now);
        }
        if (phase === 'frost') {
            return castWizardFrostBurst(player, skillDef, ec, g, monsters, now, castOptions);
        }
        if (phase === 'overload') {
            return castWizardThunderBurst(player, skillDef, ec, g, monsters, now);
        }
        return false;
    };

    function startWizardFlameChannel(player, skillDef, ec, g, monsters, now) {
        const windup = ec.windupMs || 300;
        const channelMs = ec.channelDurationMs || 800;
        const ticks = ec.channelTicks || 6;
        player._wizardFlameChannel = {
            until: now + windup + channelMs,
            windupEnd: now + windup,
            channelStart: now + windup,
            nextTick: now + windup,
            tickInterval: channelMs / ticks,
            ticksLeft: ticks,
            skillDef: skillDef,
            ec: ec,
            angle: player.angle,
            gameRef: g,
            monstersRef: monsters
        };
        if (typeof window.playWizardFlameStormStartVfx === 'function') {
            window.playWizardFlameStormStartVfx(player, skillDef, g, ec);
        }
        player._skillCastBar = {
            endTime: now + windup + channelMs,
            label: ec.name || skillDef.name || '烈焰风暴',
            color: '#ff6622'
        };
        return true;
    }

    window.tickWizardFlameChannel = function tickWizardFlameChannel(player, g, now) {
        const ch = player && player._wizardFlameChannel;
        if (!ch) return;
        const ec = ch.ec;
        const skillDef = ch.skillDef;
        const refG = g || ch.gameRef;
        if (now < ch.windupEnd) return;
        if (now >= ch.until) {
            delete player._wizardFlameChannel;
            if (player._skillCastBar && player._skillCastBar.label
                && player._skillCastBar.label.indexOf('烈焰') >= 0) {
                player._skillCastBar = null;
            }
            return;
        }
        ch.angle = player.angle;
        if (now < ch.nextTick) return;
        ch.nextTick = now + ch.tickInterval;
        ch.ticksLeft--;
        const monsters = liveMonsters(refG, ch.monstersRef);
        const range = ec.coneRange || 300;
        const half = (ec.halfAngleDeg || 30) * Math.PI / 180;
        const tickMult = ec.tickDamageMult || 0.5;
        monsters.forEach(m => {
            if (!m || m.hp <= 0) return;
            const dx = m.x - player.x;
            const dy = m.y - player.y;
            const dist = Math.hypot(dx, dy);
            if (dist > range) return;
            let diff = Math.atan2(dy, dx) - ch.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > half) return;
            hitMonster(player, m, wizardDmg(player, skillDef, ec, tickMult), skillDef, refG, ec.statusOnHit);
        });
        if (typeof window.playWizardFlameConeTickVfx === 'function') {
            window.playWizardFlameConeTickVfx(player, refG, ch.angle, range);
        }
    };

    function castWizardFrostBurst(player, skillDef, ec, g, monsters, now, castOptions) {
        let fx = player.x;
        let fy = player.y;
        if (castOptions && castOptions.groundPoint) {
            fx = castOptions.groundPoint.x;
            fy = castOptions.groundPoint.y;
        } else if (typeof window.pickBestAoeGroundPoint === 'function') {
            const pick = window.pickBestAoeGroundPoint(player, monsters, skillDef.range || 420, ec.fieldRadius || 110);
            fx = pick.x;
            fy = pick.y;
        } else {
            const t = monsters && monsters.find(m => m && m.hp > 0);
            if (t) { fx = t.x; fy = t.y; }
        }
        const st = g && g._skillEntities;
        if (!st) return false;
        st.pendingInstants = st.pendingInstants || [];
        st.pendingInstants.push({
            activateTime: now + (ec.delayMs || 400),
            player, skillDef,
            ec: { entityType: 'instant', entityConfig: Object.assign({}, ec, { wizardFrostBurst: true, burstX: fx, burstY: fy }) },
            monsters,
            castOptions: { frostBurstPoint: { x: fx, y: fy } }
        });
        st.fields = st.fields || [];
        st.fields.push({
            x: fx, y: fy,
            radius: ec.fieldRadius || 110,
            expireTime: now + (ec.delayMs || 400) + (ec.slowFieldMs || 3000),
            tickIntervalMs: ec.dotTickMs || 500,
            lastTick: now,
            triggerType: 'periodic',
            damage: wizardDmg(player, skillDef, ec, ec.dotDamageMult || 0.4),
            owner: player,
            skillDef,
            entityConfig: {
                enemySlowPercent: ec.enemySlowPercent || 30,
                wizardFrostMarker: true,
                wizardFrostDot: true
            },
            statusOnTick: [{ type: 'frostbite', durationMs: 3000 }],
            color: ec.color || '#88ddff',
            _frostMarker: true,
            _wizardFrostField: true
        });
        if (typeof window.playWizardFrostNovaMarkVfx === 'function') {
            window.playWizardFrostNovaMarkVfx(player, skillDef, g, fx, fy, ec.fieldRadius || 110);
        }
        return true;
    }

    function castWizardThunderBurst(player, skillDef, ec, g, monsters, now) {
        const targets = liveMonsters(g, monsters);
        const thunderDef = Object.assign({}, skillDef, {
            entityType: 'instant',
            entityConfig: Object.assign({}, ec, {
                shape: 'chain',
                _wizardInternalCast: true,
                resourcePerHit: ec.manaPerChainHit || 5
            })
        });
        if (typeof window.execSkillInstantDirect === 'function') {
            return window.execSkillInstantDirect(player, thunderDef, g, targets, now, null) !== false;
        }
        return false;
    }

    window.resolveWizardFrostBurst = function resolveWizardFrostBurst(player, skillDef, ec, g, monsters, now) {
        const x = ec.burstX != null ? ec.burstX : player.x;
        const y = ec.burstY != null ? ec.burstY : player.y;
        const radius = ec.fieldRadius || 110;
        (monsters || liveMonsters(g, null)).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - x, m.y - y) > radius) return;
            hitMonster(player, m, wizardDmg(player, skillDef, ec, ec.damageMultiplier || 1.8), skillDef, g,
                [{ type: 'frostbite', durationMs: 4000 }]);
            if (ec.freezeMs && typeof window.applyCcEffects === 'function') {
                window.applyCcEffects(m, now, { freezeMs: ec.freezeMs }, g, player);
            }
        });
        if (typeof window.playWizardFrostNovaBurstVfx === 'function') {
            window.playWizardFrostNovaBurstVfx(player, skillDef, g, x, y, radius);
        } else if (g && typeof g.triggerHitImpact === 'function') {
            g.triggerHitImpact(x, y, { isRanged: true, sourceX: player.x, sourceY: player.y });
        }
    };

    window.castWizardAwakeningBurst = function castWizardAwakeningBurst(player, skillDef, g, monsters, now, castOptions) {
        startWizardFlameChannel(player, skillDef, {
            windupMs: 100, channelDurationMs: 600, channelTicks: 4,
            tickDamageMult: 0.4, coneRange: 280, halfAngleDeg: 35,
            statusOnHit: [{ type: 'burn', durationMs: 3000, stacks: 1 }]
        }, g, monsters, now);
        castWizardFrostBurst(player, skillDef, BURST_BY_PHASE.frost, g, monsters, now, castOptions);
        castWizardThunderBurst(player, skillDef, Object.assign({}, BURST_BY_PHASE.overload, {
            chainCount: 6, range: 700, damageMultiplier: 1.5
        }), g, monsters, now);
        return true;
    };

    window.onWizardPhaseShiftComplete = function onWizardPhaseShiftComplete(player, skillDef, g, monsters, now, originX, originY) {
        if (!isWizardTree(player) || !skillDef) return;
        const ec = skillDef.entityConfig || {};
        const prevPhase = player._phaseShiftPrevPhase || player._elementPhase || 'fire';
        const nextPhase = (typeof window.getWizardPhases === 'function'
            && window.getWizardPhases()[prevPhase])
            ? window.getWizardPhases()[prevPhase].next : 'fire';
        const landRadius = ec.landRadius || 70;
        const pathMult = ec.pathDamageMult || 0.8;

        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const dLine = distToSegment(m.x, m.y, originX, originY, player.x, player.y);
            if (dLine <= landRadius * 0.6 + (m.size || 20) * 0.5) {
                hitMonster(player, m, wizardDmg(player, skillDef, ec, pathMult), skillDef, g);
                if (prevPhase === 'fire' && typeof window.applyCombatStatus === 'function') {
                    window.applyCombatStatus(m, 'burn', { durationMs: 3000 }, player, g);
                } else if (prevPhase === 'frost' && typeof window.applyCcEffects === 'function') {
                    window.applyCcEffects(m, now, { freezeMs: 800 }, g, player);
                } else if (prevPhase === 'overload' && typeof window.applyCombatStatus === 'function') {
                    window.applyCombatStatus(m, 'shock', { durationMs: 2000 }, player, g);
                }
            }
            if (!ec.wizardAwakeningShift
                && Math.hypot(m.x - player.x, m.y - player.y) <= landRadius + (m.size || 20) * 0.5) {
                applyPhaseShiftLandEffect(player, m, skillDef, ec, g, now, nextPhase);
            }
        });

        if (!ec.wizardAwakeningShift && typeof window.switchElementPhase === 'function') {
            window.switchElementPhase(player, nextPhase, g, { skipPulse: false });
        } else if (ec.wizardAwakeningShift) {
            ['fire', 'frost', 'overload'].forEach(ph => {
                (monsters || []).forEach(m => {
                    if (!m || m.hp <= 0) return;
                    if (Math.hypot(m.x - player.x, m.y - player.y) > landRadius) return;
                    applyPhaseShiftLandEffect(player, m, skillDef, { landRadius }, g, now, ph);
                });
            });
        }
        if (!ec.wizardAwakeningShift && nextPhase === 'frost' && player.maxHp > 0) {
            const bridge = isArchmage(player) && typeof window.isInBridgeWindow === 'function'
                && window.isInBridgeWindow(player);
            const shieldPct = bridge ? 0.225 : 0.15;
            const shieldAmt = Math.max(1, Math.floor(player.maxHp * shieldPct));
            player.buffs = player.buffs || [];
            const buffId = 'wizard_ice_shield';
            player.buffs = player.buffs.filter(b => b.id !== buffId);
            player.buffs.push({
                id: buffId,
                name: '冰盾',
                expireTime: now + 3000,
                hudVisible: true,
                effects: {},
                shieldAmount: shieldAmt,
                shieldMax: shieldAmt
            });
            if (typeof player.updateStats === 'function') player.updateStats();
        }
        if (!ec.wizardAwakeningShift && nextPhase === 'overload') {
            const bridge = isArchmage(player) && typeof window.isInBridgeWindow === 'function'
                && window.isInBridgeWindow(player);
            player.buffs = player.buffs || [];
            const buffId = 'wizard_overload_speed';
            player.buffs = player.buffs.filter(b => b.id !== buffId);
            player.buffs.push({
                id: buffId,
                name: '过载加速',
                expireTime: now + 1500,
                effects: { moveSpeed: bridge ? 60 : 40 },
                hudVisible: true
            });
            if (typeof player.updateStats === 'function') player.updateStats();
        }
        if (isArchmage(player) && ec.dimensionalRift
            && typeof window.onArchmageDimensionalRiftOpen === 'function') {
            window.onArchmageDimensionalRiftOpen(player, skillDef, g, originX, originY, now);
        }
        delete player._phaseShiftPrevPhase;
    };

    function applyPhaseShiftLandEffect(player, m, skillDef, ec, g, now, forcePhase) {
        const phase = forcePhase || (typeof window.getElementPhase === 'function' ? window.getElementPhase(player) : 'fire');
        if (phase === 'fire') {
            hitMonster(player, m, wizardDmg(player, skillDef, ec, 1.2), skillDef, g,
                [{ type: 'burn', durationMs: 3000 }]);
        } else if (phase === 'frost') {
            hitMonster(player, m, wizardDmg(player, skillDef, ec, 1.0), skillDef, g);
            if (typeof window.applyCcEffects === 'function') {
                window.applyCcEffects(m, now, { freezeMs: 1000 }, g, player);
            }
        } else if (phase === 'overload') {
            hitMonster(player, m, wizardDmg(player, skillDef, ec, 0.9), skillDef, g,
                [{ type: 'shock', durationMs: 2000 }]);
        }
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const lx = x1 + t * dx;
        const ly = y1 + t * dy;
        return Math.hypot(px - lx, py - ly);
    }

    window.spawnWizardResonanceField = function spawnWizardResonanceField(player, skillDef, g, monsters, now, castOptions) {
        if (!isWizardTree(player)) return false;
        const ec = skillDef.entityConfig || {};
        let fx = player.x;
        let fy = player.y;
        if (castOptions && castOptions.groundPoint) {
            fx = castOptions.groundPoint.x;
            fy = castOptions.groundPoint.y;
        } else if (typeof window.pickBestAoeGroundPoint === 'function') {
            const pick = window.pickBestAoeGroundPoint(player, monsters, skillDef.range || 420, ec.fieldRadius || 120);
            fx = pick.x;
            fy = pick.y;
        }
        const st = g && g._skillEntities;
        if (!st) return false;
        st.fields = st.fields || [];
        st.fields.push({
            x: fx, y: fy,
            radius: ec.fieldRadius || skillDef.aoeRadius || 120,
            expireTime: now + (ec.fieldDurationMs || 6000),
            tickIntervalMs: ec.tickIntervalMs || 1000,
            lastTick: now,
            lastShockTick: now,
            lastFreezeTick: now,
            triggerType: 'periodic',
            damage: 0,
            owner: player,
            skillDef,
            entityConfig: ec,
            color: ec.color || '#ffaa44',
            _wizardResonanceField: true
        });
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(fx, fy - 20, skillDef.name, ec.color || '#ffaa44');
        }
        if (typeof window.playWizardResonanceFieldVfx === 'function') {
            window.playWizardResonanceFieldVfx(player, skillDef, g, fx, fy, ec.fieldRadius || 120);
        }
        return true;
    };

    window.tickWizardResonanceField = function tickWizardResonanceField(f, monsters, g, now) {
        if (!f || !f._wizardResonanceField || !f.owner) return;
        const ec = f.entityConfig || {};
        const player = f.owner;
        const inField = (ent) => Math.hypot(ent.x - f.x, ent.y - f.y) <= f.radius;

        if (ec.allyDmgBonusPercent || ec.allyDrPercent || ec.allyAttackSpeedPercent) {
            if (inField(player)) {
                player.buffs = player.buffs || [];
                const buffId = 'wizard_field_' + (f.skillDef && f.skillDef.id);
                player.buffs = player.buffs.filter(b => b.id !== buffId);
                const effects = {};
                if (ec.allyDmgBonusPercent) effects.attackPercent = ec.allyDmgBonusPercent;
                if (ec.allyDrPercent) effects.damageReduction = ec.allyDrPercent;
                if (ec.allyAttackSpeedPercent) effects.attackSpeedPercent = ec.allyAttackSpeedPercent;
                player.buffs.push({
                    id: buffId,
                    name: (f.skillDef && f.skillDef.name) || '共鸣场',
                    expireTime: now + (f.tickIntervalMs || 1000) + 300,
                    effects,
                    hudVisible: true
                });
                if (typeof player.updateStats === 'function') player.updateStats();
            }
        }

        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0 || !inField(m)) return;
            if (ec.damageEnemyPerTick != null) {
                hitMonster(player, m, wizardDmg(player, f.skillDef, ec, ec.damageEnemyPerTick), f.skillDef, g);
            }
            if (ec.statusOnTick && typeof window.applyStatusFromConfig === 'function') {
                window.applyStatusFromConfig(player, m, f.skillDef, g, ec.statusOnTick);
            }
            if (ec.enemySlowPercent && typeof window.applyCcEffects === 'function') {
                window.applyCcEffects(m, now, {
                    enemySlowPercent: ec.enemySlowPercent,
                    enemySlowMs: 2000
                }, g, player);
            }
            if (ec.periodicFreezeMs && now - (f.lastFreezeTick || 0) >= (ec.freezeIntervalMs || 2000)) {
                f.lastFreezeTick = now;
                window.applyCcEffects(m, now, { freezeMs: ec.periodicFreezeMs }, g, player);
            }
            if (ec.shockTickDamageMult != null && now - (f.lastShockTick || 0) >= (ec.shockTickIntervalMs || 1500)) {
                f.lastShockTick = now;
                hitMonster(player, m, wizardDmg(player, f.skillDef, ec, ec.shockTickDamageMult), f.skillDef, g,
                    [{ type: 'shock', durationMs: 1500 }]);
            }
        });
    };
})();
