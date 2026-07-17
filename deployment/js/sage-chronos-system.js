/**
 * 贤者/先知 · 时光沙漏 / 预知之盾 / 时间法术
 */
(function () {
    'use strict';

    const SAGE_TREE = { sage: true, oracle: true };

    function classId(player) {
        if (!player || !player.classData) return null;
        return typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
    }

    function isSageTree(player) {
        const id = classId(player);
        return !!(id && SAGE_TREE[id]);
    }

    window.isSageTreePlayer = isSageTree;

    function floatText(g, x, y, text, color) {
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(x, y, text, color || '#cc88ff');
        }
    }

    function magicAtk(player) {
        return player.baseMagicAttack || player.baseAttack || 10;
    }

    function pickAllyTarget(player, g, range) {
        if (typeof window.pickNearestAllyTarget === 'function') {
            return window.pickNearestAllyTarget(player, g, range);
        }
        return player;
    }

    window.grantChronosSand = function grantChronosSand(player, amount) {
        if (!player || !amount) return;
        if (typeof window.grantSkillResource === 'function') {
            window.grantSkillResource(player, amount);
        }
    };

    window.onTimelyShotHit = function onTimelyShotHit(player, target, isAlly, g, ec) {
        if (!isSageTree(player)) return;
        const sand = isAlly ? (ec.timelyShotSandAlly || 3) : (ec.timelyShotSandEnemy || 5);
        window.grantChronosSand(player, sand);
        if (isAlly) {
            const heal = Math.max(1, Math.floor(magicAtk(player) * (ec.healAllyMagicMult || 0.8)));
            let applied = heal;
            if (target.hp != null) {
                const before = target.hp;
                target.hp = Math.min(target.maxHp || target.hp, target.hp + heal);
                applied = target.hp - before;
                floatText(g, target.x, target.y - 16, '+' + applied, '#44ff88');
                if (classId(player) === 'sage' && applied < heal
                    && typeof window.applyTemporalOverflowShield === 'function') {
                    window.applyTemporalOverflowShield(player, target, heal - applied, g);
                }
            }
        }
    };

    window.applyTemporalOverflowShield = function applyTemporalOverflowShield(caster, ally, overflow, g) {
        if (!overflow || overflow <= 0) return;
        ally.buffs = ally.buffs || [];
        const amt = Math.floor(overflow);
        ally.buffs.push({
            id: 'temporal_overflow_' + Date.now(),
            name: '时序护盾',
            expireTime: Date.now() + 4000,
            shieldRemaining: amt,
            shieldMax: amt,
            hudVisible: true,
            iconKey: 'divineProtection'
        });
        floatText(g, ally.x, ally.y - 24, '溢出护盾', '#aa88ff');
    };

    window.applyForesightShield = function applyForesightShield(player, skillDef, g, now, ctx) {
        const se = skillDef.skillEffect || {};
        const target = (ctx && ctx.bondTarget) || pickAllyTarget(player, g, skillDef.range || 280);
        if (!target) {
            floatText(g, player.x, player.y, '无目标', '#ff6666');
            return false;
        }
        const absorbBonus = typeof window.getSetModifier === 'function'
            ? window.getSetModifier(player, 'foresightAbsorbBonus', 0) : 0;
        const shieldAmt = Math.max(1, Math.floor(
            magicAtk(player) * (se.shieldMagicMult || 2) * (1 + absorbBonus)
        ));
        const dur = se.durationMs || 4000;
        const buffId = 'foresight_shield_' + (target.id || target.name || 'ally');
        target.buffs = (target.buffs || []).filter(b => b.id !== buffId);
        target.buffs.push({
            id: buffId,
            name: '预知之盾',
            expireTime: now + dur,
            shieldRemaining: shieldAmt,
            shieldMax: shieldAmt,
            _foresightOwner: player,
            _foresightInitial: shieldAmt,
            _foresightAbsorbed: 0,
            hudVisible: true,
            iconKey: 'divineProtection'
        });
        if (classId(player) === 'sage') {
            const selfShield = Math.floor(shieldAmt * 0.4);
            player.buffs = player.buffs || [];
            player.buffs.push({
                id: 'foresight_self_' + now,
                name: '直觉护盾',
                expireTime: now + dur,
                shieldRemaining: selfShield,
                shieldMax: selfShield,
                hudVisible: true,
                iconKey: 'divineProtection'
            });
        }
        floatText(g, target.x, target.y - 28, '预知之盾', '#aa88ff');
        return true;
    };

    window.onForesightShieldAbsorb = function onForesightShieldAbsorb(target, absorbed, buff, g) {
        if (!buff || !buff._foresightOwner) return;
        const owner = buff._foresightOwner;
        buff._foresightAbsorbed = (buff._foresightAbsorbed || 0) + absorbed;
        if (buff._foresightAbsorbed >= (buff._foresightInitial || 1) * 0.5) {
            window.grantChronosSand(owner, 25);
            if (typeof window.reduceSkillCooldownMs === 'function') {
                window.reduceSkillCooldownMs(owner, 'foresight_shield', 3000);
            }
            floatText(g, owner.x, owner.y - 32, '+25 沙漏', '#cc88ff');
            buff._foresightRewarded = true;
        }
    };

    window.onForesightShieldExpire = function onForesightShieldExpire(target, buff, g, now) {
        if (!buff || !buff._foresightOwner || buff._foresightRewarded) return;
        const owner = buff._foresightOwner;
        const absorbed = buff._foresightAbsorbed || 0;
        if (absorbed < (buff._foresightInitial || 1) * 0.5) {
            window.grantChronosSand(owner, 15);
            floatText(g, owner.x, owner.y - 32, '返还15沙漏', '#88aaff');
        }
    };

    window.applyPurifyTime = function applyPurifyTime(player, skillDef, g, now, ctx) {
        const se = skillDef.skillEffect || {};
        const target = (ctx && ctx.bondTarget) || pickAllyTarget(player, g, skillDef.range || 220);
        if (!target) return false;
        target.slowEffects = [];
        let dispelled = 0;
        if (target.buffs) {
            const before = target.buffs.length;
            target.buffs = target.buffs.filter(b => !b.debuff && b.id !== 'temporal_guard');
            dispelled = Math.max(0, before - target.buffs.length);
        }
        if (dispelled > 0) {
            const heal = Math.floor((target.maxHp || 100) * (se.healPerDispelPercent || 8) / 100 * dispelled);
            target.hp = Math.min(target.maxHp || target.hp, (target.hp || 0) + heal);
            floatText(g, target.x, target.y - 20, '净化+' + heal, '#44ff88');
        } else {
            target.buffs = target.buffs || [];
            target.buffs.push({
                id: 'temporal_guard',
                name: '时序守护',
                expireTime: now + (se.guardDurationMs || 3000),
                _nextHitDr: se.guardDrPercent || 40,
                hudVisible: true,
                iconKey: 'defense'
            });
            floatText(g, target.x, target.y - 20, '时序守护', '#aa88ff');
        }
        return true;
    };

    window.applyChronoAura = function applyChronoAura(player, skillDef, g, now) {
        const se = skillDef.skillEffect || {};
        player._chronoAura = {
            expireTime: now + (se.durationMs || 8000),
            radius: se.fieldRadius || 150,
            cdSpeed: se.allyCdSpeedPercent || 15,
            healInterval: se.healTickIntervalMs || 2000,
            healPct: se.healPercentPerTick || 2,
            lastHeal: now,
            x: player.x,
            y: player.y
        };
        floatText(g, player.x, player.y - 28, '时光光环', '#cc88ff');
        return true;
    };

    function collectRewindAllies(player, g) {
        const allies = [player];
        const st = g && g._skillEntities && g._skillEntities.summons;
        if (st) {
            st.forEach(s => {
                if (s && s.owner === player && s.hp > 0) allies.push(s);
            });
        }
        return allies;
    }

    function triggerSacredRewindOnTarget(target, g) {
        const rw = target && target._sacredRewind;
        if (!rw || Date.now() > rw.expireTime) return false;
        if (target.hp > 0 && target.maxHp) {
            target.hp = Math.min(target.maxHp, Math.max(1, Math.floor(target.maxHp * rw.hpPercent)));
            floatText(g, target.x, target.y - 24, '回溯触发', '#ffccff');
        }
        target._sacredRewind = null;
        return true;
    }

    window.onSacredRewindFatal = function onSacredRewindFatal(target, g) {
        return triggerSacredRewindOnTarget(target, g);
    };

    window.applySacredRewind = function applySacredRewind(player, skillDef, g, now, ctx) {
        const target = (ctx && ctx.bondTarget) || pickAllyTarget(player, g, skillDef.range || 300);
        if (!target || !target.maxHp) return false;
        const pct = target.hp / target.maxHp;
        target._sacredRewind = {
            expireTime: now + (skillDef.skillEffect.durationMs || 6000),
            hpPercent: pct,
            healer: player
        };
        floatText(g, target.x, target.y - 24, '神圣回溯', '#ffccff');
        return true;
    };

    window.applyTimeField = function applyTimeField(player, skillDef, g, now) {
        const se = skillDef.skillEffect || {};
        player._timeField = {
            expireTime: now + (se.durationMs || 6000),
            radius: skillDef.aoeRadius || 120,
            enemySlow: se.enemySlowPercent || 40,
            allyCdSpeed: se.allyCdSpeedPercent || 30,
            freeForesight: !!se.freeForesightShield,
            x: player.x,
            y: player.y
        };
        player._timeFieldFreeForesight = !!se.freeForesightShield;
        floatText(g, player.x, player.y - 28, '时间领域', '#cc88ff');
        return true;
    };

    window.applyFateWeave = function applyFateWeave(player, skillDef, g, now, ctx) {
        const target = (ctx && ctx.bondTarget) || pickAllyTarget(player, g, skillDef.range || 280);
        if (!target) return false;
        const se = skillDef.skillEffect || {};
        target._fateWeave = {
            expireTime: now + (se.durationMs || 8000),
            guardian: player,
            redirectPct: se.redirectPercent || 20,
            atonementPct: se.atonementPercent || 10
        };
        const fateHaste = typeof window.getSetModifier === 'function'
            ? window.getSetModifier(player, 'fateHaste', 0) : 0;
        if (fateHaste > 0) {
            const hasteVal = Math.round(fateHaste * 100);
            target.buffs = target.buffs || [];
            target.buffs.push({
                id: 'fate_web_haste_' + now,
                name: '织命急速',
                expireTime: now + (se.durationMs || 8000),
                effects: { skillHaste: hasteVal },
                hudVisible: true,
                iconKey: 'combo'
            });
            if (target !== player) {
                player.buffs = player.buffs || [];
                player.buffs.push({
                    id: 'fate_web_haste_self_' + now,
                    name: '织命急速',
                    expireTime: now + (se.durationMs || 8000),
                    effects: { skillHaste: hasteVal },
                    hudVisible: true,
                    iconKey: 'combo'
                });
            }
        }
        floatText(g, target.x, target.y - 24, '命运编织', '#ff88cc');
        return true;
    };

    window.applyFateReversal = function applyFateReversal(player, skillDef, g, now, ctx) {
        const target = ctx && ctx.lockTarget;
        const se = skillDef.skillEffect || {};
        const windowMs = se.recordWindowMs || 3000;
        if (!target) {
            floatText(g, player.x, player.y, '需要目标', '#ff6666');
            return false;
        }
        const isEnemy = target.hp != null && target.maxHp != null && !target.classData;
        if (isEnemy) {
            target._fateReversalEnemy = { start: now, windowMs, damage: 0, owner: player };
            floatText(g, target.x, target.y - 20, '命运逆转·敌', '#ff6644');
        } else {
            target._fateReversalAlly = { start: now, windowMs, damage: 0, healer: player };
            floatText(g, target.x, target.y - 20, '命运逆转·友', '#44ff88');
        }
        return true;
    };

    window.applyTimeRewind = function applyTimeRewind(player, skillDef, g, now) {
        const se = skillDef.skillEffect || {};
        let windowMs = se.rewindWindowMs || 4000;
        if (classId(player) === 'oracle') windowMs = 5000;
        let rewound = 0;
        collectRewindAllies(player, g).forEach(ally => {
            if (!ally || ally.hp <= 0) return;
            const snaps = ally._chronosSnapshots || player._chronosSnapshots || [];
            const cutoff = now - windowMs;
            const valid = snaps.filter(s => s.time >= cutoff);
            if (!valid.length) return;
            const state = valid[0];
            ally.hp = Math.min(ally.maxHp || ally.hp, Math.max(1, state.hp || ally.hp));
            if (state.x != null) ally.x = state.x;
            if (state.y != null) ally.y = state.y;
            rewound++;
        });
        if (!rewound) {
            floatText(g, player.x, player.y, '无回溯快照', '#ff6666');
            return false;
        }
        floatText(g, player.x, player.y - 32, '时光倒流!', '#ffccff');
        return true;
    };

    window.recordChronosSnapshot = function recordChronosSnapshot(player, g, now) {
        if (!isSageTree(player) && classId(player) !== 'oracle') return;
        const snap = { time: now, hp: player.hp, x: player.x, y: player.y };
        player._chronosSnapshots = player._chronosSnapshots || [];
        player._chronosSnapshots.push(snap);
        const keep = now - 6000;
        player._chronosSnapshots = player._chronosSnapshots.filter(s => s.time >= keep);
        collectRewindAllies(player, g).forEach(ally => {
            if (!ally || ally === player) return;
            ally._chronosSnapshots = ally._chronosSnapshots || [];
            ally._chronosSnapshots.push({ time: now, hp: ally.hp, x: ally.x, y: ally.y });
            ally._chronosSnapshots = ally._chronosSnapshots.filter(s => s.time >= keep);
        });
    };

    window.applyFateWeaveRedirect = function applyFateWeaveRedirect(target, damage, g) {
        const fw = target && target._fateWeave;
        if (!fw || Date.now() >= fw.expireTime || damage <= 0) return damage;
        const guardian = fw.guardian;
        const redirect = Math.floor(damage * (fw.redirectPct || 20) / 100);
        const atone = Math.floor(damage * (fw.atonementPct || 10) / 100);
        let remaining = damage - redirect;
        if (guardian && guardian.hp > 0 && redirect > 0) {
            guardian.hp = Math.max(1, guardian.hp - redirect);
            floatText(g, guardian.x, guardian.y - 20, '-' + redirect, '#ff88aa');
        }
        if (atone > 0 && g && g.player && g.player.hp > 0) {
            g.player.hp = Math.min(g.player.maxHp, g.player.hp + atone);
            floatText(g, g.player.x, g.player.y - 16, '+' + atone, '#44ff88');
        }
        return Math.max(0, remaining);
    };

    window.applyTemporalGuardDr = function applyTemporalGuardDr(target, damage) {
        if (!target || !target.buffs || damage <= 0) return damage;
        const now = Date.now();
        const idx = target.buffs.findIndex(b => b.id === 'temporal_guard' && b.expireTime > now);
        if (idx < 0) return damage;
        const tg = target.buffs[idx];
        const dr = tg._nextHitDr || 40;
        target.buffs.splice(idx, 1);
        return Math.max(1, Math.floor(damage * (1 - dr / 100)));
    };

    window.recordFateReversalDamage = function recordFateReversalDamage(target, damage, now) {
        if (!target || damage <= 0) return;
        if (target._fateReversalEnemy) {
            const fr = target._fateReversalEnemy;
            if (now - fr.start < fr.windowMs) fr.damage = (fr.damage || 0) + damage;
        }
        if (target._fateReversalAlly) {
            const fr = target._fateReversalAlly;
            if (now - fr.start < fr.windowMs) fr.damage = (fr.damage || 0) + damage;
        }
    };

    window.tickSageChronosStates = function tickSageChronosStates(player, g, monsters, now) {
        if (!player) return;
        if (isSageTree(player) || classId(player) === 'oracle') {
            window.recordChronosSnapshot(player, g, now);
        }
        if (player._chronoAura && now < player._chronoAura.expireTime) {
            const a = player._chronoAura;
            a.x = player.x;
            a.y = player.y;
            if (now - a.lastHeal >= a.healInterval) {
                a.lastHeal = now;
                const heal = Math.floor(player.maxHp * a.healPct / 100);
                player.hp = Math.min(player.maxHp, player.hp + heal);
                collectRewindAllies(player, g).forEach(ally => {
                    if (ally === player || !ally.maxHp) return;
                    const ah = Math.floor(ally.maxHp * a.healPct / 100);
                    ally.hp = Math.min(ally.maxHp, ally.hp + ah);
                });
            }
        } else if (player._chronoAura) {
            player._chronoAura = null;
        }
        if (player._timeField && now < player._timeField.expireTime) {
            const tf = player._timeField;
            tf.x = player.x;
            tf.y = player.y;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                if (Math.hypot(m.x - tf.x, m.y - tf.y) > tf.radius) return;
                m.slowEffects = m.slowEffects || [];
                m.slowEffects.push({
                    multiplier: Math.max(0.2, 1 - (tf.enemySlow || 40) / 100),
                    expireTime: now + 600
                });
            });
        } else if (player._timeField) {
            player._timeField = null;
            player._timeFieldFreeForesight = false;
        }
        collectRewindAllies(player, g).forEach(ally => {
            const rw = ally._sacredRewind;
            if (rw && rw.expireTime <= now) triggerSacredRewindOnTarget(ally, g);
        });
        collectRewindAllies(player, g).forEach(ally => {
            const fr = ally._fateReversalAlly;
            if (!fr || now - fr.start < fr.windowMs) return;
            const heal = fr.damage || 0;
            if (heal > 0 && ally.hp > 0) {
                ally.hp = Math.min(ally.maxHp, ally.hp + heal);
                floatText(g, ally.x, ally.y - 20, '+' + heal, '#44ff88');
            }
            ally._fateReversalAlly = null;
        });
        (monsters || []).forEach(m => {
            if (!m) return;
            if (m._fateReversalEnemy && now - m._fateReversalEnemy.start >= m._fateReversalEnemy.windowMs) {
                const fr = m._fateReversalEnemy;
                const dmg = fr.damage || 0;
                if (dmg > 0) m.takeDamage(dmg);
                m._fateReversalEnemy = null;
            }
        });
    };

    window.applyParadoxMinimumHp = function applyParadoxMinimumHp(player, target) {
        if (classId(player) !== 'oracle') return false;
        if (target && target.hp <= 0) {
            target.hp = 1;
            return true;
        }
        return false;
    };

    window.applySageSkillPrimary = function applySageSkillPrimary(player, skillDef, g, now, ctx) {
        const se = skillDef.skillEffect || {};
        switch (se.type) {
            case 'foresight_shield': return window.applyForesightShield(player, skillDef, g, now, ctx);
            case 'purify_time': return window.applyPurifyTime(player, skillDef, g, now, ctx);
            case 'chrono_aura': return window.applyChronoAura(player, skillDef, g, now);
            case 'sacred_rewind': return window.applySacredRewind(player, skillDef, g, now, ctx);
            case 'time_field': return window.applyTimeField(player, skillDef, g, now);
            case 'fate_weave': return window.applyFateWeave(player, skillDef, g, now, ctx);
            case 'fate_reversal': return window.applyFateReversal(player, skillDef, g, now, ctx);
            case 'time_rewind': return window.applyTimeRewind(player, skillDef, g, now);
            default: return false;
        }
    };
})();
