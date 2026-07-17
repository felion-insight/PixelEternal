/**
 * 刺客职业系 · 分支技能与被动逻辑
 */
(function () {
    'use strict';

    const SHADOWDANCER_TREE = { shadowdancer: true, nightblade: true };
    const TRICKSTER_TREE = { trickster: true, illusionist: true };
    const VENOMANCER_TREE = { venomancer: true, plaguebringer: true };

    function progId(player) {
        return typeof window.getActiveClassProgressionId === 'function'
            ? window.getActiveClassProgressionId(player && player.classData) : null;
    }

    function floatText(g, x, y, text, color, size) {
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(x, y, text, color || '#aa66ff', size ? 1100 : 900, size || 14);
        }
    }

    function resolveMonsters(g, ctx) {
        if (ctx && ctx.monsters) return ctx.monsters;
        if (!g) return [];
        if (typeof g.getCurrentSceneTargets === 'function') return g.getCurrentSceneTargets() || [];
        return g.monsters || [];
    }

    function nearestEnemy(player, monsters, range) {
        let best = null;
        let nd = Infinity;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const d = Math.hypot(m.x - player.x, m.y - player.y);
            if (d <= range && d < nd) { nd = d; best = m; }
        });
        return best;
    }

    function pushBuff(player, buff) {
        player.buffs = player.buffs || [];
        player.buffs.push(buff);
        if (typeof player.updateStats === 'function') player.updateStats();
    }

    function isShadowdancerTree(player) {
        const id = progId(player);
        return !!(id && SHADOWDANCER_TREE[id]);
    }

    function isTricksterTree(player) {
        const id = progId(player);
        return !!(id && TRICKSTER_TREE[id]);
    }

    function isVenomancerTree(player) {
        const id = progId(player);
        return !!(id && VENOMANCER_TREE[id]);
    }

    function getPassive(player) {
        if (typeof window.getClassPassiveId === 'function') return window.getClassPassiveId(player);
        return null;
    }

    /* ── 被动：影之律动 ── */
    window.onAssassinBackstabCrit = function onAssassinBackstabCrit(player, g) {
        const passive = getPassive(player);
        if (passive !== 'shadow_rhythm' && passive !== 'shadow_rhythm_pre') return;
        if (typeof window.grantSkillResource === 'function') window.grantSkillResource(player, 30);
        const cdReduce = (passive === 'shadow_rhythm' && player._nightfallUntil) ? 2000 : 1000;
        if (typeof window.reduceAllSkillCooldownsMs === 'function') {
            window.reduceAllSkillCooldownsMs(player, cdReduce);
        } else if (typeof window.reduceSkillCooldownMs === 'function') {
            ['core1', 'core2', 'team', 'survival'].forEach(() => {});
        }
        const now = Date.now();
        player._shadowStepBuffUntil = now + 2000;
        floatText(g, player.x, player.y - 44, '影步!', '#aa44ff');
    };

    window.onAssassinShadowRhythmPerfectDodge = function onAssassinShadowRhythmPerfectDodge(player, g) {
        const passive = getPassive(player);
        if (passive !== 'shadow_rhythm' && passive !== 'shadow_rhythm_pre') return;
        if (player._shadowStepBuffUntil && Date.now() < player._shadowStepBuffUntil) {
            player._shadowStepBuffUntil = Date.now() + 2000;
            if (typeof window.grantSkillResource === 'function') window.grantSkillResource(player, 20);
            floatText(g, player.x, player.y - 48, '影步刷新!', '#cc66ff');
        }
    };

    /* ── 分支伤害乘区 ── */
    window.getAssassinBranchDamageMult = function getAssassinBranchDamageMult(player, skillDef, monster) {
        if (!player) return 1;
        let mult = 1;
        const passive = getPassive(player);
        const ec = skillDef && skillDef.entityConfig ? skillDef.entityConfig : {};
        if (isVenomancerTree(player) && passive === 'toxicology') {
            const sec = window.getAssassinSecondaryResource && window.getAssassinSecondaryResource(player);
            if (sec && sec.type === 'catalyst') mult *= 1 + (sec.current || 0) * 0.05;
        }
        if (isShadowdancerTree(player)) {
            if (monster && ec.backstabBonusDmg
                && typeof window.isPlayerBehindMonster === 'function'
                && window.isPlayerBehindMonster(player, monster)) {
                mult *= 1 + ec.backstabBonusDmg / 100;
            }
            const now = Date.now();
            if (player._backstabStanceUntil && now < player._backstabStanceUntil) {
                mult *= 1.1;
            }
            const sec = window.getAssassinSecondaryResource && window.getAssassinSecondaryResource(player);
            if (sec && sec.type === 'combo_point' && sec.current > 0 && !ec.consumeAllComboPoints) {
                mult *= 1 + sec.current * 0.05;
            }
        }
        if (monster && monster._classSkillMark && monster._classSkillMark.markId === 'death_mark') {
            mult *= 1 + (monster._classSkillMark.damageBonus || 25) / 100;
            if (monster._classSkillMark.deathSentence) mult *= 1.4;
        }
        return mult;
    };

    function blinkPlayerBehindMonster(player, monster) {
        if (!player || !monster) return false;
        const facing = typeof window.getCombatantFacingAngle === 'function'
            ? window.getCombatantFacingAngle(monster) : (monster.angle || 0);
        const monR = (monster.size || monster.radius || 32) / 2;
        const playerR = (player.size || player.playerGifSize || 24) / 2;
        const dist = monR + playerR + 14;
        player.x = monster.x - Math.cos(facing) * dist;
        player.y = monster.y - Math.sin(facing) * dist;
        player.angle = facing;
        return true;
    }

    window.triggerAssassinChainOnKill = function triggerAssassinChainOnKill(
        player, skillDef, ec, g, monsters, now, killedMonster, remaining
    ) {
        if (!player || !skillDef || !ec || remaining <= 0 || !g) return;
        const c = ec.entityConfig || ec;
        const range = c.chainRange || c.range || 75;
        const exclude = new Set([killedMonster]);
        let left = remaining;

        while (left > 0) {
            let best = null;
            let nd = Infinity;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0 || exclude.has(m)) return;
                const d = Math.hypot(m.x - player.x, m.y - player.y);
                if (d <= range && d < nd) { nd = d; best = m; }
            });
            if (!best) break;
            blinkPlayerBehindMonster(player, best);
            if (typeof window.playAssassinSkillVfx === 'function') {
                window.playAssassinSkillVfx(player, skillDef, g, { chainKill: true, target: best });
            }
            floatText(g, player.x, player.y - 40, '链杀!', '#ff44aa', 16);
            const result = typeof window.applyInstantSkillSingleHit === 'function'
                ? window.applyInstantSkillSingleHit(player, best, skillDef, ec, g, monsters, now, 1, { skipChainOnKill: true })
                : null;
            exclude.add(best);
            left--;
            if (!result || !result.killed) break;
        }
    };

    window.onAssassinHitSecondary = function onAssassinHitSecondary(player, monster, skillDef, g) {
        const ec = skillDef && skillDef.entityConfig ? skillDef.entityConfig : {};
        if (ec.comboPointOnHit && typeof window.grantComboPoints === 'function') {
            window.grantComboPoints(player, ec.comboPointOnHit);
        }
        if (ec.grantCatalyst && typeof window.grantCatalyst === 'function') {
            window.grantCatalyst(player, ec.grantCatalyst);
        }
    };

    /* ── 毒催化 ── */
    window.onAssassinPoisonTick = function onAssassinPoisonTick(player, monster, g) {
        if (!isVenomancerTree(player)) return;
        if (typeof window.grantCatalyst === 'function') window.grantCatalyst(player, 1);
    };

    /** 毒理学：中毒伤害忽略目标30%防御 */
    window.getToxicologyPoisonDefIgnore = function getToxicologyPoisonDefIgnore(player) {
        if (getPassive(player) !== 'toxicology') return 0;
        return 30;
    };

    window.getToxicologyDotMult = function getToxicologyDotMult(player) {
        // 毒理学重做：原+30%毒伤移除，改为防御穿透+吸血（见 getToxicologyPoisonDefIgnore / onToxicologyPoisonDeath）
        return 1;
    };

    window.getToxicologyMoveSpeedBonus = function getToxicologyMoveSpeedBonus(player, g) {
        if (getPassive(player) !== 'toxicology') return 0;
        const list = resolveMonsters(g);
        let poisoned = 0;
        list.forEach(m => {
            if (m && m.hp > 0 && m.combatStatuses && m.combatStatuses.poison) poisoned++;
        });
        return Math.min(40, poisoned * 8);
    };

    /* ── 真假莫辨 ── */
    window.getIndistinguishableRedirectChance = function getIndistinguishableRedirectChance(player, g) {
        const passive = getPassive(player);
        if (passive !== 'indistinguishable' && passive !== 'indistinguishable_pre') return 0;
        if (!g || !g._skillEntities) return 0;
        const clones = (g._skillEntities.summons || []).filter(
            s => s && s.owner === player && s.hp > 0 && (s.isClone || s.unitId === 'decoy' || s.unitId === 'shadow_clone' || s.unitId === 'mirror_clone')
        );
        return clones.length > 0 ? 0.5 : 0;
    };

    /* ── 分身复读技能 ── */
    window.replicateSkillToClones = function replicateSkillToClones(player, skillDef, g, monsters, now, castOptions) {
        if (!player || !skillDef || !g || !isTricksterTree(player)) return;
        var st = g._skillEntities;
        if (!st || !st.summons) return;
        var clones = st.summons.filter(
            function (s) {
                return s && s.owner === player && s.hp > 0
                    && (s.isClone || s.unitId === 'decoy' || s.unitId === 'shadow_clone' || s.unitId === 'mirror_clone');
            }
        );
        if (!clones.length) return;
        // 只复刻弹丸和瞬击类技能；召唤/场域/位移/冲撞不适合分身复读
        var ec = typeof window.getSkillEntityConfig === 'function'
            ? window.getSkillEntityConfig(skillDef) : null;
        var type = (ec && ec.entityType) || (typeof window.inferSkillEntityType === 'function'
            ? window.inferSkillEntityType(skillDef) : null);
        if (type !== 'projectile' && type !== 'instant') return;
        // 确定伤害倍率：幻术师阶段 0.8，骗术师阶段 0.6
        var pid = progId(player);
        var dmgFactor = (pid === 'illusionist') ? 0.8 : 0.6;
        clones.forEach(function (clone) {
            if (typeof window.castSkillEntityFromPosition === 'function') {
                window.castSkillEntityFromPosition(player, skillDef, g, clone.x, clone.y, dmgFactor, monsters, now, castOptions);
                // 分身位置播放技能 VFX
                if (typeof window.playClassSkillVfx === 'function') {
                    var saveX = player.x, saveY = player.y;
                    player.x = clone.x;
                    player.y = clone.y;
                    window.playClassSkillVfx(player, skillDef, g, {
                        primaryTarget: castOptions && castOptions.lockTarget || null,
                        hitTargets: [],
                        hit: true,
                        cloneReplicate: true
                    });
                    player.x = saveX;
                    player.y = saveY;
                }
            }
        });
    };

    /* ── 分身死亡/过期回调 ── */
    window.onTricksterCloneDeath = function onTricksterCloneDeath(player, g, isExpire) {
        if (!player || !isTricksterTree(player)) return;
        var now = Date.now();
        if (!isExpire) {
            // 分身死亡：恢复20影之力 + 自身1秒无敌
            if (typeof window.grantSkillResource === 'function') {
                window.grantSkillResource(player, 20);
            }
            player.invincibleUntil = Math.max(player.invincibleUntil || 0, now + 1000);
            if (g && typeof g.addFloatingText === 'function') {
                g.addFloatingText(player.x, player.y - 30, '分身死亡!', '#6688cc', 700, 13);
            }
        }
        // 分身消失（含死亡/超时）：下一个技能冷却减半
        player._nextSkillCdHalved = true;
    };

    /* ── 技能主效果 ── */
    window.applyAssassinSkillPrimary = function applyAssassinSkillPrimary(player, skillDef, g, now, ctx) {
        if (!player || !skillDef || typeof window.isAssassinTreePlayer !== 'function'
            || !window.isAssassinTreePlayer(player)) return false;

        const se = skillDef.skillEffect || {};
        const id = skillDef.id;
        const t = now != null ? now : Date.now();
        const monsters = resolveMonsters(g, ctx);

        if (se.type === 'midnight_raid' || id === 'midnight_raid') {
            return applyMidnightRaid(player, skillDef, se, g, t);
        }
        if (se.type === 'nightfall_field' || id === 'nightfall' || id === 'eternal_night') {
            return applyNightfall(player, skillDef, se, g, t, monsters);
        }
        if (id === 'toxin_detonation' || id === 'withering') {
            return applyPoisonDetonation(player, skillDef, g, t, monsters);
        }
        if (id === 'contagion' || id === 'pandemic') {
            return applyContagion(player, skillDef, g, t, monsters);
        }
        if (id === 'decoy') {
            return applyDecoy(player, skillDef, g, t, monsters);
        }
        if (id === 'transposition' || id === 'phantom_reality') {
            return applyTransposition(player, skillDef, g, t, monsters, ctx);
        }
        if (id === 'phantom_trick') {
            return applyPhantomTrick(player, skillDef, g, t, monsters, ctx);
        }
        if (id === 'shadow_feast') {
            return applyShadowFeast(player, skillDef, g, t, monsters);
        }
        if (id === 'reality_shift') {
            return applyRealityShift(player, skillDef, g, t, monsters);
        }
        if (id === 'phantom_array') {
            return applyPhantomArray(player, skillDef, g, t, monsters);
        }
        return false;
    };

    function applyMidnightRaid(player, skillDef, se, g, now) {
        if (player.classResource) player.classResource.current = 0;
        const ec = skillDef.entityConfig || {};
        const dur = se.stealthMs || ec.stealthMs || 4000;
        const slashRadius = ec.finalSlashRadius || skillDef.aoeRadius || 100;
        const slashMult = ec.finalSlashDamage || skillDef.damageMultiplier || 2.5;
        player._midnightRaidUntil = now + dur;
        pushBuff(player, {
            name: '影袭',
            id: 'midnight_raid',
            expireTime: now + dur,
            effects: { moveSpeed: se.moveSpeedBonus || 80 },
            stealth: true,
            stealthNotBrokenByAttack: true
        });
        floatText(g, player.x, player.y - 40, '暗夜影袭!', '#6633aa', 18);
        player._midnightRaidFinalSlash = true;
        setTimeout(() => {
            if (!player._midnightRaidFinalSlash) return;
            player._midnightRaidFinalSlash = false;
            const px = player.x;
            const py = player.y;
            const dmg = Math.max(1, Math.floor((player.baseAttack || 10) * slashMult));
            resolveMonsters(g).forEach(m => {
                if (!m || m.hp <= 0) return;
                if (Math.hypot(m.x - px, m.y - py) <= slashRadius) m.takeDamage(dmg);
            });
            if (typeof window.playAssassinMidnightFinisherVfx === 'function') {
                window.playAssassinMidnightFinisherVfx(player, g, { radius: slashRadius });
            }
            floatText(g, px, py - 28, '终结斩!', '#aa44ff');
        }, dur);
        return true;
    }

    function applyNightfall(player, skillDef, se, g, now, monsters) {
        if (player.classResource) player.classResource.current = 0;
        const ec = skillDef.entityConfig || {};
        const radius = ec.fieldRadius || se.fieldRadius || 130;
        const dur = ec.fieldDurationMs || se.durationMs || 5000;
        player._nightfallUntil = now + dur;
        player._nightfallDurationMs = dur;
        pushBuff(player, {
            name: skillDef.name,
            id: 'nightfall',
            expireTime: now + dur,
            effects: { moveSpeed: se.moveSpeedBonus || 100 },
            stealth: true,
            stealthNotBrokenByAttack: true
        });
        if (g && g._skillEntities) {
            g._skillEntities.fields = g._skillEntities.fields || [];
            g._skillEntities.fields.push({
                x: player.x, y: player.y, radius,
                owner: player, skillDef,
                expireTime: now + dur,
                invisible: true,
                followCaster: true,
                entityConfig: Object.assign({}, ec, { _nightfallField: true })
            });
        }
        floatText(g, player.x, player.y - 40, skillDef.name + '!', '#220044', 18);
        setTimeout(() => {
            if (skillDef.id === 'eternal_night') {
                const px = player.x;
                const py = player.y;
                const slashRadius = ec.finalSlashRadius || radius;
                const slashMult = ec.finalSlashDamage || se.finalSlashDamage || 5;
                const dmg = Math.max(1, Math.floor((player.baseAttack || 10) * slashMult));
                resolveMonsters(g).forEach(m => {
                    if (!m || m.hp <= 0) return;
                    const ratio = m.hp / (m.maxHp || 1);
                    const execTh = (m.isBoss || m.isElite) ? 1 : (ec.executeThreshold || 0.25);
                    if (ratio <= execTh && !m.isBoss) {
                        m.takeDamage(m.hp);
                    } else if (Math.hypot(m.x - px, m.y - py) <= slashRadius) {
                        m.takeDamage(dmg);
                    }
                });
                if (typeof window.playAssassinMidnightFinisherVfx === 'function') {
                    window.playAssassinMidnightFinisherVfx(player, g, { radius: slashRadius, eternal: true });
                }
                floatText(g, px, py - 32, '永夜裁决!', '#440066', 20);
            }
        }, dur);
        return true;
    }

    function applyPoisonDetonation(player, skillDef, g, now, monsters) {
        const ec = skillDef.entityConfig || {};
        const perStack = ec.damagePerStack || (skillDef.id === 'withering' ? 2.5 : 1.5);
        const isWithering = skillDef.id === 'withering';
        let hit = 0;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0 || !m.combatStatuses || !m.combatStatuses.poison) return;
            const stacks = m.combatStatuses.poison.stacks || 1;
            // 凋零处决：HP<20% 且有5层以上中毒 → 直接击杀（非Boss）
            if (isWithering && !m.isBoss && m.maxHp > 0 && m.hp / m.maxHp < 0.2 && stacks >= 5) {
                m.takeDamage(m.hp);
                hit++;
                floatText(g, m.x, m.y - 24, '处决!', '#ff2244', 16);
                if (typeof window.applyCombatStatus === 'function') {
                    window.applyCombatStatus(m, 'corruption', { durationMs: 5000 }, player, g);
                }
                if (typeof window.grantCatalyst === 'function') window.grantCatalyst(player, 5);
                return;
            }
            const dmg = Math.max(1, Math.floor((player.baseAttack || 10) * perStack * stacks));
            m.takeDamage(dmg);
            hit++;
            if (isWithering) {
                if (typeof window.applyCombatStatus === 'function') {
                    window.applyCombatStatus(m, 'corruption', { durationMs: 5000, defenseReduction: 30 }, player, g);
                }
            } else if (ec.antiPoisonMs) {
                m._antiPoisonUntil = now + ec.antiPoisonMs;
            }
            if (typeof window.grantCatalyst === 'function') window.grantCatalyst(player, 5);
        });
        floatText(g, player.x, player.y - 28, hit > 0 ? `引爆 ×${hit}` : '无中毒目标', '#44aa22');
        return hit > 0;
    }

    function applyContagion(player, skillDef, g, now, monsters) {
        const ec = skillDef.entityConfig || {};
        const spreadBonus = typeof window.getSetModifier === 'function'
            ? window.getSetModifier(player, 'poisonSpreadBonus', 0) : 0;
        const range = Math.floor((ec.spreadRadius || 120) * (1 + spreadBonus));
        let maxTargets = skillDef.id === 'pandemic' ? 6 : 3;
        if (spreadBonus > 0) maxTargets += Math.max(1, Math.floor(spreadBonus * 5));
        let source = nearestEnemy(player, monsters, 200);
        if (!source || !source.combatStatuses || !source.combatStatuses.poison) {
            floatText(g, player.x, player.y, '目标未中毒', '#ff6666');
            return false;
        }
        const stacks = source.combatStatuses.poison.stacks || 1;
        const candidates = (monsters || []).filter(m => m && m.hp > 0 && m !== source)
            .sort((a, b) => Math.hypot(a.x - source.x, a.y - source.y) - Math.hypot(b.x - source.x, b.y - source.y))
            .slice(0, maxTargets);
        candidates.forEach(m => {
            if (Math.hypot(m.x - source.x, m.y - source.y) > range) return;
            if (typeof window.applyCombatStatus === 'function') {
                window.applyCombatStatus(m, 'poison', { durationMs: 5000, stacks }, player, g);
            }
        });
        source.combatStatuses.poison = null;
        if (skillDef.id !== 'pandemic') source._antiPoisonUntil = now + 3000;
        floatText(g, source.x, source.y - 20, '传染!', '#55cc44');
        return true;
    }

    /* ── 替身 Decoy ── */
    function applyDecoy(player, skillDef, g, now, monsters) {
        var ec = skillDef.entityConfig || {};
        // 生成替身分身
        var decoySummon = window.spawnSkillSummon(player, skillDef, g, {
            x: player.x, y: player.y,
            unitId: 'decoy',
            durationMs: ec.durationMs || 8000,
            size: 18,
            color: ec.color || '#aaaaff',
            isClone: true
        });
        if (decoySummon) {
            decoySummon.unitId = 'decoy';
            decoySummon.aiType = 'taunt_static';
            decoySummon.tauntRadius = ec.tauntRadius || 130;
            decoySummon.hp = Math.max(1, Math.floor((player.maxHp || 100) * ((ec.inheritStats && ec.inheritStats.hp) || 0.2)));
            const durBonus = typeof window.getSetModifier === 'function'
                ? window.getSetModifier(player, 'decoyDurability', 0) : 0;
            if (durBonus > 0) {
                decoySummon.hp = Math.max(1, Math.floor(decoySummon.hp * (1 + durBonus)));
            }
            decoySummon.maxHp = decoySummon.hp;
            decoySummon._explosionOnDeath = true;
            decoySummon._explosionRadius = ec.explosionRadius || 80;
            decoySummon._explosionDamageMult = ec.explosionDamageMultiplier || 1.5;
            decoySummon.size = ec.size || 18;
            decoySummon.spawnTime = now;
        }
        // 自身隐身
        var stealthMs = ec.stealthSelfMs || 3000;
        player._stealthUntil = Math.max(player._stealthUntil || 0, now + stealthMs);
        player._stealthAttackBonus = (ec.stealthFirstAttackBonus || 40) / 100; // 破隐一击 +40%
        player.buffs = player.buffs || [];
        player.buffs.push({
            id: 'decoy_stealth',
            name: '替身隐身',
            expireTime: now + stealthMs,
            effects: {},
            stealth: true,
            hudVisible: true
        });
        if (typeof player.updateStats === 'function') player.updateStats();
        floatText(g, player.x, player.y - 30, '替身! 隐身3s', '#6688cc', 16);
        player._tricksterVfxCtx = {
            mode: 'decoy',
            decoyX: decoySummon ? decoySummon.x : player.x,
            decoyY: decoySummon ? decoySummon.y : player.y,
            tauntRadius: ec.tauntRadius || 130,
            stealthMs: stealthMs
        };
        return true;
    }

    // 点是否在三角形内（叉积同号法）
    function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
        var d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
        var d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
        var d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
        var hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        var hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        return !(hasNeg && hasPos);
    }

    // 对线段路径上所有敌人造成伤害（半宽内的敌人）
    function segmentDamage(fromX, fromY, toX, toY, monsters, dmg, halfWidth) {
        halfWidth = halfWidth || 30;
        var dx = toX - fromX;
        var dy = toY - fromY;
        var lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return;
        (monsters || []).forEach(function (m) {
            if (!m || m.hp <= 0) return;
            var t = ((m.x - fromX) * dx + (m.y - fromY) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
            var projX = fromX + t * dx;
            var projY = fromY + t * dy;
            if (Math.hypot(m.x - projX, m.y - projY) <= halfWidth) {
                m.takeDamage(dmg);
            }
        });
    }

    function applyTransposition(player, skillDef, g, now, monsters, ctx) {
        player._transpositionAnchors = player._transpositionAnchors || [];
        const ec = skillDef.entityConfig || {};
        const maxAnchors = skillDef.id === 'phantom_reality' ? 5 : 3;
        const isPhantomReality = skillDef.id === 'phantom_reality';
        // 过滤有效锚点
        var activeAnchors = player._transpositionAnchors.filter(function (a) { return a.expireTime > now; });
        // 已存满锚点且有有效锚点时 → 传送；否则 → 放置锚点
        var atCap = player._transpositionAnchors.length >= maxAnchors;
        if (atCap && activeAnchors.length > 0) {
            const anchors = activeAnchors;
            let nearest = anchors[0];
            let nd = Infinity;
            anchors.forEach(a => {
                const d = Math.hypot(a.x - player.x, a.y - player.y);
                if (d < nd) { nd = d; nearest = a; }
            });
            const ox = player.x;
            const oy = player.y;
            var burstMult = ec.teleportBurstDamage || 1.2;
            var burstRadius = ec.teleportBurstRadius || 80;
            // 虚实：所有锚点同时引爆 1.5x + 近距叠加
            if (isPhantomReality) {
                player.x = nearest.x;
                player.y = nearest.y;
                burstMult = ec.teleportBurstDamage || 1.5;
                // 计算锚点间近距叠加倍率
                var stackedBurst = [];
                for (var ai = 0; ai < anchors.length; ai++) {
                    var a = anchors[ai];
                    var nearbyCount = 1;
                    for (var aj = 0; aj < anchors.length; aj++) {
                        if (ai === aj) continue;
                        if (Math.hypot(a.x - anchors[aj].x, a.y - anchors[aj].y) < 150) {
                            nearbyCount++;
                        }
                    }
                    var stackMult = Math.min(2.5, 1 + (nearbyCount - 1) * 0.5);
                    stackedBurst.push({ x: a.x, y: a.y, mult: stackMult });
                }
                // 所有锚点位置引爆
                stackedBurst.forEach(function (sb) {
                    var dmg = Math.max(1, Math.floor((player.baseAttack || 10) * burstMult * sb.mult));
                    (monsters || []).forEach(function (m) {
                        if (!m || m.hp <= 0) return;
                        if (Math.hypot(m.x - sb.x, m.y - sb.y) <= burstRadius) {
                            m.takeDamage(dmg);
                        }
                    });
                });
            } else {
                // 引渡：按 C→B→A 三段瞬移（180ms 间隔），路径伤害 + 三角终结
                var burstDmg = Math.max(1, Math.floor((player.baseAttack || 10) * burstMult));
                var STEP_DELAY = 180; // 每段瞬移间隔，让玩家看清三角形轨迹
                // 预构建完整路径供 VFX
                var teleportPath = [
                    { x: ox, y: oy },
                    { x: anchors[2].x, y: anchors[2].y },
                    { x: anchors[1].x, y: anchors[1].y },
                    { x: anchors[0].x, y: anchors[0].y }
                ];
                var _vfxTeleportPath = teleportPath;
                var _vfxTriangle = anchors.length >= 3
                    ? [{ x: anchors[0].x, y: anchors[0].y }, { x: anchors[1].x, y: anchors[1].y }, { x: anchors[2].x, y: anchors[2].y }]
                    : [];

                // 第一段：当前位置 → C（立即）
                player.x = anchors[2].x;
                player.y = anchors[2].y;
                segmentDamage(ox, oy, player.x, player.y, monsters, burstDmg, burstRadius);
                floatText(g, player.x, player.y - 20, '→ 1', '#8899cc', 12);

                // 第二段：C → B（延迟 STEP_DELAY ms）
                setTimeout(function () {
                    var fx = player.x, fy = player.y;
                    player.x = anchors[1].x;
                    player.y = anchors[1].y;
                    segmentDamage(fx, fy, player.x, player.y, monsters, burstDmg, burstRadius);
                    floatText(g, player.x, player.y - 20, '→ 2', '#8899cc', 12);

                    // 第三段：B → A（再延迟 STEP_DELAY ms）
                    setTimeout(function () {
                        var fx2 = player.x, fy2 = player.y;
                        player.x = anchors[0].x;
                        player.y = anchors[0].y;
                        segmentDamage(fx2, fy2, player.x, player.y, monsters, burstDmg, burstRadius);

                        // 三角形区域终结伤害
                        if (anchors.length >= 3) {
                            var ax = anchors[0].x, ay = anchors[0].y;
                            var bx = anchors[1].x, by = anchors[1].y;
                            var cx = anchors[2].x, cy = anchors[2].y;
                            (monsters || []).forEach(function (m) {
                                if (!m || m.hp <= 0) return;
                                if (pointInTriangle(m.x, m.y, ax, ay, bx, by, cx, cy)) {
                                    m.takeDamage(burstDmg);
                                }
                            });
                        }

                        // 三段完成，清除所有锚点
                        player._transpositionAnchors = [];
                        floatText(g, player.x, player.y - 40, '引渡·终结!', '#6688cc', 16);
                    }, STEP_DELAY);
                }, STEP_DELAY);
            }
            // 虚实：瞬移后生成 2 个强力分身
            if (isPhantomReality && typeof window.spawnSkillSummon === 'function') {
                for (var ci = 0; ci < 2; ci++) {
                    var cx = player.x + (Math.random() - 0.5) * 50;
                    var cy = player.y + (Math.random() - 0.5) * 50;
                    var clone = window.spawnSkillSummon(player, skillDef, g, {
                        x: cx, y: cy,
                        unitId: 'shadow_clone',
                        durationMs: 8000,
                        size: 22,
                        color: '#3344aa'
                    });
                    if (clone) {
                        clone._phantomRealityClone = true;
                        clone.hp = Math.max(1, Math.floor((player.maxHp || 100) * 0.25));
                        clone.maxHp = clone.hp;
                        clone.attack = Math.max(1, Math.floor((player.baseAttack || 10) * 0.6));
                    }
                }
            }
            // 虚实：直接清空锚点；引渡在 setTimeout 链中延迟清空
            if (isPhantomReality) {
                player._transpositionAnchors = [];
            }
            floatText(g, player.x, player.y - 24, isPhantomReality ? '虚实交错!' : '引渡!', isPhantomReality ? '#3344aa' : '#6688cc');
            player._tricksterVfxCtx = {
                mode: 'teleport',
                fromX: ox, fromY: oy,
                toX: player.x, toY: player.y,
                burstRadius: burstRadius,
                isPhantomReality: isPhantomReality,
                burstPoints: isPhantomReality
                    ? stackedBurst.map(function (sb) { return { x: sb.x, y: sb.y, mult: sb.mult }; })
                    : (typeof _vfxTriangle !== 'undefined' && _vfxTriangle.length ? _vfxTriangle
                        : [{ x: ox, y: oy }, { x: player.x, y: player.y }]),
                teleportPath: isPhantomReality ? [] : (typeof _vfxTeleportPath !== 'undefined' ? _vfxTeleportPath : []),
                spawnedClones: isPhantomReality ? 2 : 0
            };
            return true;
        }
        if (player._transpositionAnchors.length >= maxAnchors) {
            player._transpositionAnchors.shift();
        }
        player._transpositionAnchors.push({ x: player.x, y: player.y, expireTime: now + (ec.anchorDurationMs || 8000) });
        // 首锚消耗由技能系统自动扣除 resourceCost:20；后续锚点返还费用
        if (player._transpositionAnchors.length > 1 && typeof window.grantSkillResource === 'function') {
            window.grantSkillResource(player, 20);
        }
        floatText(g, player.x, player.y - 20, '锚点' + player._transpositionAnchors.length + '/' + maxAnchors, '#8899cc');
        player._tricksterVfxCtx = {
            mode: 'anchor',
            x: player.x, y: player.y,
            anchorIndex: player._transpositionAnchors.length,
            maxAnchors: maxAnchors
        };
        return true;
    }

    function findAllyTargets(player, g, range, excludeSelf) {
        var result = [];
        if (!g) return result;
        // 优先从 gameInstance 获取联机队友
        if (typeof g.getAllies === 'function') {
            var allies = g.getAllies(player) || [];
            allies.forEach(function (a) {
                if (!a || a.hp <= 0) return;
                if (excludeSelf && a === player) return;
                if (Math.hypot(a.x - player.x, a.y - player.y) <= range) {
                    result.push(a);
                }
            });
        }
        // 如果没有联机队友，目标就是自身
        if (!result.length && !excludeSelf) {
            result.push(player);
        }
        return result;
    }

    /* ── 幻影戏法 Phantom Trick ── */
    function applyPhantomTrick(player, skillDef, g, now, monsters, ctx) {
        var ec = skillDef.entityConfig || {};
        var range = skillDef.range || 200;
        // 寻找目标：锁定的盟友或自身
        var target = (ctx && ctx.lockTarget && ctx.lockTarget !== player && ctx.lockTarget.hp > 0)
            ? ctx.lockTarget : player;
        // 距离检查
        if (target !== player && Math.hypot(target.x - player.x, target.y - player.y) > range) {
            target = player;
        }
        var durationMs = ec.durationMs || 10000;
        var atkRatio = (ec.inheritStats && ec.inheritStats.attack) || 0.4;
        var hpRatio = (ec.inheritStats && ec.inheritStats.hp) || 0.3;
        var damageTransfer = ec.damageTransferPercent || 50;
        var cloneX = target.x + (Math.random() - 0.5) * 40;
        var cloneY = target.y + (Math.random() - 0.5) * 40;
        var clone = window.spawnSkillSummon(player, skillDef, g, {
            x: cloneX, y: cloneY,
            unitId: 'shadow_clone',
            durationMs: durationMs,
            size: 22,
            color: '#6688cc'
        });
        if (clone) {
            clone._phantomTrickClone = true;
            clone._protectTarget = target;
            clone._damageTransferCaster = player;
            clone._damageTransferPercent = damageTransfer;
            clone._cloneAttackRatio = atkRatio;
            clone.hp = Math.max(1, Math.floor((target.maxHp || 100) * hpRatio));
            clone.maxHp = clone.hp;
            clone.isPhantomClone = true;
            clone.spawnTime = now;
            clone._spawnFadeMs = 420;
        }
        floatText(g, target.x, target.y - 20, '幻影戏法!', '#6688cc');
        player._tricksterVfxCtx = {
            mode: 'phantom_trick',
            cloneX: cloneX, cloneY: cloneY,
            targetX: target.x, targetY: target.y,
            damageTransfer: damageTransfer
        };
        return true;
    }

    /* ── 影之盛宴 Shadow Feast ── */
    function applyShadowFeast(player, skillDef, g, now, monsters) {
        var ec = skillDef.entityConfig || {};
        var durationMs = ec.cloneDurationMs || 8000;
        var baseAtkRatio = ec.cloneAttackRatio || 0.4;
        // 检查是否在镜影结界内
        var inMirrorDomain = false;
        if (g && g._skillEntities && g._skillEntities.fields) {
            var mirrorFields = g._skillEntities.fields.filter(function (f) {
                return f._mirrorDomain && f.owner === player;
            });
            for (var i = 0; i < mirrorFields.length; i++) {
                if (Math.hypot(player.x - mirrorFields[i].x, player.y - mirrorFields[i].y) <= mirrorFields[i].radius) {
                    inMirrorDomain = true;
                    break;
                }
            }
        }
        var atkRatio = inMirrorDomain ? 0.6 : baseAtkRatio;
        // 全体队友获取影分身
        var allies = findAllyTargets(player, g, skillDef.range || 300, false);
        var spawned = 0;
        allies.forEach(function (ally) {
            var cx = ally.x + (Math.random() - 0.5) * 40;
            var cy = ally.y + (Math.random() - 0.5) * 40;
            var clone = window.spawnSkillSummon(player, skillDef, g, {
                x: cx, y: cy,
                unitId: 'shadow_clone',
                durationMs: durationMs,
                size: 22,
                color: '#3344aa'
            });
            if (clone) {
                clone._shadowFeastClone = true;
                clone._protectTarget = ally;
                clone._cloneAttackRatio = atkRatio;
                clone.hp = Math.max(1, Math.floor((ally.maxHp || 100) * 0.3));
                clone.maxHp = clone.hp;
                spawned++;
            }
        });
        // 结界内敌人 +25% 受伤
        if (inMirrorDomain && monsters) {
            monsters.forEach(function (m) {
                if (!m || m.hp <= 0) return;
                if (typeof window.applyCombatStatus === 'function') {
                    window.applyCombatStatus(m, 'vulnerable', {
                        durationMs: 8000,
                        damageTakenMult: 1.25,
                        source: player
                    });
                }
            });
            floatText(g, player.x, player.y - 30, '影之盛宴·结界共鸣!', '#3344aa', 18);
        }
        floatText(g, player.x, player.y - 20, '影之盛宴×' + spawned, '#3344aa', 16);
        return true;
    }

    /* ── 虚实交错 Reality Shift ── */
    function applyRealityShift(player, skillDef, g, now, monsters) {
        var ec = skillDef.entityConfig || {};
        var blinkDist = ec.blinkDistance || 150;
        var fromX = player.x;
        var fromY = player.y;
        // 闪现到面向方向
        var dx = Math.cos(player.angle) * blinkDist;
        var dy = Math.sin(player.angle) * blinkDist;
        var newX = player.x + dx;
        var newY = player.y + dy;
        // 边界限制（若有 clampInRoom）
        if (typeof window.clampPosition === 'function') {
            var cp = window.clampPosition(newX, newY);
            newX = cp.x;
            newY = cp.y;
        }
        player.x = newX;
        player.y = newY;
        // 自身 0.5s 无敌
        player.invincibleUntil = Math.max(player.invincibleUntil || 0, now + (ec.invincibleMs || 500));
        // 在目的地生成 2 个影之分身（主动追敌）
        var cloneCount = ec.spawnClones || 2;
        var durationMs = ec.cloneDurationMs || 8000;
        for (var i = 0; i < cloneCount; i++) {
            var offX = (Math.random() - 0.5) * 60;
            var offY = (Math.random() - 0.5) * 60;
            var clone = window.spawnSkillSummon(player, skillDef, g, {
                x: newX + offX, y: newY + offY,
                unitId: 'shadow_clone',
                durationMs: durationMs,
                size: 22,
                color: '#6688cc'
            });
            if (clone) {
                clone._realityShiftClone = true;
                clone.aiType = 'melee_chase';
                clone.attack = Math.max(1, Math.floor((player.baseAttack || 10) * (ec.cloneAttackInherit || 0.5)));
                clone.attackIntervalMs = 1200;
                clone.lastAttack = 0;
                clone.hp = Math.max(1, Math.floor((player.maxHp || 100) * 0.25));
                clone.maxHp = clone.hp;
            }
        }
        floatText(g, newX, newY - 20, '虚实交错!', '#6688cc', 16);
        player._tricksterVfxCtx = {
            mode: 'blink',
            fromX: fromX, fromY: fromY,
            toX: newX, toY: newY,
            cloneCount: cloneCount
        };
        return true;
    }

    function applyPhantomArray(player, skillDef, g, now, monsters) {
        const ec = skillDef.entityConfig || {};
        const center = nearestEnemy(player, monsters, 250) || { x: player.x + 100, y: player.y };
        const count = ec.cloneCount || 6;
        const radius = ec.ringRadius || 250;
        // 冲刺伤害（只计算一次，不是每次分身都重复）
        const dashDmg = Math.max(1, Math.floor((player.baseAttack || 10) * (ec.dashDamage || 2.0)));
        for (let i = 0; i < count; i++) {
            const ang = (Math.PI * 2 * i) / count;
            const cx = center.x + Math.cos(ang) * radius;
            const cy = center.y + Math.sin(ang) * radius;
            if (typeof window.spawnSkillSummon === 'function') {
                var clone = window.spawnSkillSummon(player, skillDef, g, {
                    x: cx, y: cy,
                    unitId: 'shadow_clone',
                    durationMs: 6000,
                    size: 22,
                    color: '#3344aa'
                });
                if (clone) {
                    clone._phantomArrayClone = true;
                    clone.hp = Math.max(1, Math.floor((player.maxHp || 100) * 0.25));
                    clone.maxHp = clone.hp;
                    clone.attack = Math.max(1, Math.floor((player.baseAttack || 10) * 0.6));
                }
            }
        }
        // 中心冲刺伤害（所有分身同时向中心冲刺）
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - center.x, m.y - center.y) <= 60) m.takeDamage(dashDmg);
        });
        floatText(g, center.x, center.y - 40, '千影幻阵!', '#3344aa', 20);
        return true;
    }

    window.tickAssassinBranchStates = function tickAssassinBranchStates(player, g, monsters, now) {
        if (!player) return;
        const t = now != null ? now : Date.now();
        if (player._transpositionAnchors) {
            player._transpositionAnchors = player._transpositionAnchors.filter(a => a.expireTime > t);
        }
        if (player._shadowRaidReturn && t > player._shadowRaidReturn.expireTime) {
            delete player._shadowRaidReturn;
        }
        /** 镜影结界：进出检测 → CD 重置 */
        if (isTricksterTree(player) && g && g._skillEntities && g._skillEntities.fields) {
            var inMirrorDomain = false;
            var mirrorFields = g._skillEntities.fields.filter(function (f) {
                return f._mirrorDomain && f.owner === player;
            });
            for (var i = 0; i < mirrorFields.length; i++) {
                var f = mirrorFields[i];
                if (Math.hypot(player.x - f.x, player.y - f.y) <= f.radius) {
                    inMirrorDomain = true;
                    break;
                }
            }
            if (inMirrorDomain && !player._lastInMirrorDomain) {
                // 刚进入结界：尝试重置替身CD
                var lastReset = player._lastMirrorDomainCdReset || 0;
                if (t - lastReset >= 10000) {
                    if (typeof window.reduceSkillCooldownMs === 'function') {
                        window.reduceSkillCooldownMs(player, 'decoy', Number.MAX_SAFE_INTEGER);
                        player._lastMirrorDomainCdReset = t;
                        if (g && typeof g.addFloatingText === 'function') {
                            g.addFloatingText(player.x, player.y - 30, '结界共鸣! 替身CD重置', '#3344aa', 800, 13);
                        }
                    }
                }
            }
            player._lastInMirrorDomain = inMirrorDomain;
        }
    };

    window.clearAssassinBranchState = function clearAssassinBranchState(player) {
        if (!player) return;
        delete player._transpositionAnchors;
        delete player._shadowStepBuffUntil;
        delete player._shadowRaidReturn;
        delete player._lastInMirrorDomain;
        delete player._lastMirrorDomainCdReset;
    };

    window.onAssassinSkillHit = function onAssassinSkillHit(player, monster, skillDef, isCrit, g) {
        if (!player || !monster || !skillDef) return;
        const ec = skillDef.entityConfig || {};
        if (ec.comboPointOnHit && typeof window.grantComboPoints === 'function') {
            window.grantComboPoints(player, ec.comboPointOnHit);
        }
        if (isCrit && ec.comboPointOnCrit && typeof window.grantComboPoints === 'function') {
            window.grantComboPoints(player, ec.comboPointOnCrit);
        }
        if (isCrit && skillDef.id === 'backstab' && typeof window.onAssassinBackstabCrit === 'function') {
            window.onAssassinBackstabCrit(player, g);
        }
        if (ec.grantBackstabStance && typeof window.grantBackstabStance === 'function') {
            window.grantBackstabStance(player, ec.grantBackstabStance.angleDeg || 180, ec.grantBackstabStance.durationMs || 2000);
        }
        // 幻术师·影弹幻：命中施加幻影印记（3s，分身攻击+30%伤害）
        if (skillDef.slotType === 'basic' && isTricksterTree(player) && progId(player) === 'illusionist') {
            monster._phantomMarkUntil = (Date.now()) + 3000;
        }
        if (typeof window.onAssassinHit === 'function') window.onAssassinHit(player, monster, skillDef, g);
    };

    /* ── 刺客技能伤害倍率（含幻影印记检查）── */
    window.getAssassinSkillDamageMult = function getAssassinSkillDamageMult(player, skillDef, monster) {
        if (!monster) return 1;
        var mult = 1;
        // 幻影印记：分身攻击有标记的敌人 +30% 伤害
        if (monster._phantomMarkUntil && Date.now() < monster._phantomMarkUntil) {
            // 检查是否是分身攻击（通过 player._cloneDmgFactor 或直接从 st.summons 查找）
            if (player._cloneDmgFactor) {
                mult *= 1.3;
            }
        }
        return mult;
    };

    window.resolveAssassinMultiStrike = function resolveAssassinMultiStrike(player, skillDef, ec, g, monsters, now) {
        const c = ec.entityConfig || {};
        const strikes = c.strikeCount || 3;
        const interval = c.strikeIntervalMs || 200;
        if (!g._skillEntities) g._skillEntities = {};
        const st = g._skillEntities;
        st.assassinMultiStrikes = st.assassinMultiStrikes || [];
        for (let i = 0; i < strikes; i++) {
            st.assassinMultiStrikes.push({
                activateTime: now + i * interval,
                player, skillDef, ec, monsters,
                strikeIndex: i,
                strikeTotal: strikes
            });
        }
        if (typeof window.playAssassinMultiStrikeVfx === 'function') {
            window.playAssassinMultiStrikeVfx(player, skillDef, g, c);
        }
        return true;
    };

    window.tickAssassinMultiStrikes = function tickAssassinMultiStrikes(g, monsters, now) {
        const st = g && g._skillEntities;
        if (!st || !st.assassinMultiStrikes || !st.assassinMultiStrikes.length) return;
        const t = now != null ? now : Date.now();
        st.assassinMultiStrikes = st.assassinMultiStrikes.filter(ms => {
            if (t < ms.activateTime) return true;
            execMultiStrikeTick(ms, g, monsters, t);
            return false;
        });
    };

    function execMultiStrikeTick(ms, g, monsters, now) {
        const player = ms.player;
        const skillDef = ms.skillDef;
        const c = ms.ec.entityConfig || {};
        const angle = player.angle;
        const range = c.range || 70;
        const half = (c.halfAngleDeg || 55) * Math.PI / 180;
        const list = monsters || [];
        const hits = [];
        list.forEach(m => {
            if (!m || m.hp <= 0) return;
            const dx = m.x - player.x;
            const dy = m.y - player.y;
            const dist = Math.hypot(dx, dy);
            if (dist > range + (m.size || 16) * 0.4) return;
            let diff = Math.atan2(dy, dx) - angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) <= half) hits.push(m);
        });
        const mult = c.perStrikeDamage || 0.5;
        const dmg = Math.max(1, Math.floor((player.baseAttack || 10) * mult));
        hits.forEach(m => {
            if (c.perStrikePull) {
                const dx = player.x - m.x;
                const dy = player.y - m.y;
                const d = Math.hypot(dx, dy) || 1;
                m.x += (dx / d) * c.perStrikePull;
                m.y += (dy / d) * c.perStrikePull;
            }
            m.takeDamage(dmg);
            if (typeof window.onAssassinSkillHit === 'function') {
                window.onAssassinSkillHit(player, m, skillDef, false, g);
            }
        });
        if (ms.strikeIndex === ms.strikeTotal - 1 && hits.length >= ms.strikeTotal) {
            const buff = c.buffOnFullHit;
            if (buff && player.buffs) {
                player.buffs.push({
                    name: '影之加速', id: 'shadow_vortex_haste',
                    expireTime: now + (buff.durationMs || 3000),
                    effects: { attackSpeedPercent: buff.attackSpeed || 20, moveSpeed: buff.moveSpeed || 20 }
                });
                if (typeof player.updateStats === 'function') player.updateStats();
            }
            const burst = c.finalBurstDamage || 1;
            const burstDmg = Math.max(1, Math.floor((player.baseAttack || 10) * burst));
            const br = c.finalBurstRadius || 85;
            list.forEach(m => {
                if (!m || m.hp <= 0) return;
                if (Math.hypot(m.x - player.x, m.y - player.y) <= br) m.takeDamage(burstDmg);
            });
        }
        if (typeof window.playAssassinVortexStrikeVfx === 'function') {
            window.playAssassinVortexStrikeVfx(player, g, ms.strikeIndex, ms.strikeTotal, c);
        }
    }

    window.resolveAssassinBasicAttack = function resolveAssassinBasicAttack(player, skillDef) {
        if (!player || !skillDef) return skillDef;
        const id = progId(player);
        const out = Object.assign({}, skillDef);
        const ec = Object.assign({}, skillDef.entityConfig || {});
        if (id === 'shadowdancer' || id === 'nightblade') {
            ec.comboChain = 5;
            ec.comboStepDamage = [1.0, 1.1, 1.25, 1.4, 2.0];
            ec.comboStepRange = [50, 55, 60, 65, 70];
            ec.comboStepAngle = [35, 50, 360, 30, 30];
            ec.comboStepDash = [0, 12, 0, 35, 40];
            ec.comboStepDashBehind = [false, false, false, false, true];
            ec.comboStepConsumeAllComboPoints = [false, false, false, false, true];
            ec.comboStepPerComboPointMult = [0, 0, 0, 0, 0.30];
            ec.resourcePerHit = 8;
            out.name = id === 'nightblade' ? '影刃·绝' : '影刃·断';
            out.entityConfig = ec;
        } else if (id === 'trickster' || id === 'illusionist') {
            // 完全重写为远程弹射配置，不继承旧近战数据
            var isIllusionist = id === 'illusionist';
            out.entityType = 'projectile';
            out.entityConfig = {
                projectileCount: 3,
                spreadAngleDeg: 20,
                maxRange: 300,
                speed: 650,
                collisionRadius: 16,
                trajectory: 'homing',
                guaranteedHit: true,
                damageMultiplier: 0.7,
                resourcePerHit: 6,
                color: isIllusionist ? '#4466cc' : '#6688cc'
            };
            out.name = isIllusionist ? '影弹·幻' : '影弹';
        } else if (id === 'venomancer' || id === 'plaguebringer') {
            // 完全重写为远程毒弹配置，不继承旧近战数据
            var isPlague = id === 'plaguebringer';
            out.entityType = 'projectile';
            out.entityConfig = {
                projectileCount: isPlague ? 5 : 3,
                spreadAngleDeg: isPlague ? 28 : 20,
                maxRange: 300,
                speed: 500,
                collisionRadius: 16,
                trajectory: 'straight',
                damageMultiplier: 0.6,
                resourcePerHit: 5,
                statusOnHit: [{ type: 'poison', durationMs: 4000, stacks: isPlague ? 2 : 1 }],
                ricochetBounces: isPlague ? 3 : 2,
                ricochetDecay: 0.2,
                ricochetRange: 150,
                color: isPlague ? '#44cc22' : '#55aa44'
            };
            out.name = isPlague ? '淬毒暗器·瘟疫' : '淬毒暗器';
        } else {
            ec.comboChain = 4;
            ec.comboStepDamage = [1.0, 1.1, 1.2, 1.6];
            ec.comboStepRange = [50, 55, 60, 65];
            ec.comboStepAngle = [35, 50, 360, 30];
            ec.comboStepDash = [0, 12, 0, 35];
            ec.comboStepDashBehind = [false, false, false, true];
            ec.resourcePerHit = 8;
            out.name = '影刃';
            out.entityConfig = ec;
        }
        return out;
    };
})();
