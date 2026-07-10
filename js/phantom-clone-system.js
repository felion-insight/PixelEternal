/**
 * 幻影 · 残影共鸣（延时镜像复读，非召唤物 AI）
 */
(function () {
    'use strict';

    const PHANTOM_TREE = { phantom: true };
    const MAX_ECHO_COUNT = 4;
    const DEFAULT_ECHO_DURATION_MS = 8000;
    const DEFAULT_ECHO_DELAY_MS = 350;
    const DEFAULT_ECHO_DAMAGE_PCT = 70;
    const STORM_ECHO_DAMAGE_PCT = 90;
    const DODGE_PER_ECHO = 8;
    const MAX_ECHO_DODGE = 32;

    const ECHOABLE_SKILL_IDS = new Set([
        'archer_basic', 'wind_blade', 'phantom_echo_blade', 'backstep_shot',
        'aimed_shot', 'perfect_shot', 'phantom_mark'
    ]);

    function isPhantom(player) {
        if (!player || !player.classData) return false;
        const id = typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
        return !!(id && PHANTOM_TREE[id]);
    }

    function ensureState(g) {
        if (!g) return null;
        g._skillEntities = g._skillEntities || { projectiles: [], summons: [], fields: [], charges: [] };
        return g._skillEntities;
    }

    function ownerAttack(owner) {
        if (!owner) return 10;
        if (typeof window.getPlayerEffectiveAttack === 'function') {
            const atk = window.getPlayerEffectiveAttack(owner);
            if (Number.isFinite(atk) && atk > 0) return atk;
        }
        const fallback = Number(owner.effectiveAttack || owner.baseAttack);
        return Number.isFinite(fallback) && fallback > 0 ? fallback : 10;
    }

    function echoDamage(owner, damagePercent) {
        const pct = Number(damagePercent);
        const ratio = Number.isFinite(pct) && pct > 0 ? pct / 100 : DEFAULT_ECHO_DAMAGE_PCT / 100;
        const raw = ownerAttack(owner) * ratio;
        return Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1;
    }

    window.calcPhantomCloneDamage = echoDamage;

    window.isPlayerInVoidStorm = function isPlayerInVoidStorm(player, now, gameInstance) {
        if (!player || !isPhantom(player)) return false;
        const t = now != null ? now : Date.now();
        if (player._voidStormActiveUntil && t < player._voidStormActiveUntil) return true;
        const st = gameInstance && gameInstance._skillEntities;
        if (st && st.fields) {
            return st.fields.some(f => f.owner === player && f.skillDef
                && f.skillDef.id === 'void_storm' && t < f.expireTime);
        }
        return false;
    };

    window.getPhantomEchoDamagePercent = function getPhantomEchoDamagePercent(owner, gameInstance, echo, action) {
        if (!owner) return DEFAULT_ECHO_DAMAGE_PCT;
        if (window.isPlayerInVoidStorm(owner, Date.now(), gameInstance)) {
            return STORM_ECHO_DAMAGE_PCT;
        }
        if (action && action.echoDamagePercent != null) return action.echoDamagePercent;
        if (echo && echo.damagePercent != null) return echo.damagePercent;
        return DEFAULT_ECHO_DAMAGE_PCT;
    };

    function isEchoableSkill(skillDef) {
        if (!skillDef || !skillDef.id) return false;
        if (skillDef.id === 'phantom_clone') return false;
        if (skillDef.entityType === 'blink' || skillDef.entityType === 'field') return false;
        if (ECHOABLE_SKILL_IDS.has(skillDef.id)) return true;
        const ec = skillDef.entityConfig || {};
        return ec.visualVariant === 'wind_blade';
    }

    function isWindBladeAction(action) {
        if (!action) return false;
        const skillDef = action.skillDef;
        const ec = action.entityConfig || (skillDef && skillDef.entityConfig) || {};
        return !!(skillDef && (skillDef.id === 'wind_blade' || skillDef.id === 'phantom_echo_blade'))
            || ec.visualVariant === 'wind_blade';
    }

    function playEchoWindBladeVfx(gameInstance, x, y, angle, ec, skillDef) {
        if (!gameInstance || typeof gameInstance.addEquipmentEffect !== 'function') return;
        const maxR = ec.maxRange || (skillDef && skillDef.range) || 400;
        const bladeR = ec.collisionRadius || ec.windBladeWidth ? (ec.windBladeWidth / 2) : 30;
        gameInstance.addEquipmentEffect('class_skill_vfx', x, y, {
            variant: 'wind_blade_arc',
            duration: 420,
            radius: maxR * 0.65,
            angle: angle,
            family: 'wind',
            ox: x,
            oy: y,
            bladeWidth: bladeR,
            color: '#9944ff'
        });
        gameInstance.addEquipmentEffect('class_skill_vfx', x, y, {
            variant: 'phantom_clone_shot',
            duration: 180,
            radius: 32,
            family: 'energy',
            angle: angle,
            ox: x,
            oy: y
        });
    }

    function spawnEchoVfx(g, x, y) {
        if (!g || typeof g.addEquipmentEffect !== 'function') return;
        g.addEquipmentEffect('class_skill_vfx', x, y, {
            variant: 'phantom_clone_spawn',
            duration: 520,
            radius: 56,
            family: 'energy',
            ox: x,
            oy: y
        });
        const pm = g.particleManager;
        if (pm && typeof pm.createSystem === 'function') {
            pm.createSystem(x, y, {
                color: '#9944ff',
                size: 3,
                count: 14,
                lifetime: 480,
                fadeoutTime: 320,
                speed: 2.4,
                speedVariation: 1.4,
                angleSpread: Math.PI * 2,
                spreadRadius: 8,
                pixelStyle: true
            });
        }
    }

    function getActiveEchoesForOwner(g, owner, now) {
        const st = ensureState(g);
        if (!st || !owner) return [];
        const t = now != null ? now : Date.now();
        return (st.summons || []).filter(s =>
            s && s.owner === owner && s.isPhantomClone && s.hp > 0 && t < s.expireTime
        );
    }

    window.spawnPhantomEcho = function spawnPhantomEcho(owner, gameInstance, x, y, opts) {
        if (!owner || !gameInstance) return null;
        opts = opts || {};
        const st = ensureState(gameInstance);
        if (!st) return null;
        const now = Date.now();
        const dur = opts.durationMs || opts.echoDurationMs || DEFAULT_ECHO_DURATION_MS;
        const unitId = opts.unitId || 'phantom_echo';

        const existing = st.summons.filter(s => s.owner === owner && s.isPhantomClone && s.hp > 0);
        const maxCount = opts.maxCount || opts.echoMaxCount || MAX_ECHO_COUNT;
        while (existing.length >= maxCount) {
            existing.sort((a, b) => a.expireTime - b.expireTime);
            existing[0].expireTime = 0;
            existing.shift();
        }

        const echo = {
            x: x,
            y: y,
            spawnX: x,
            spawnY: y,
            hp: 1,
            maxHp: 1,
            owner: owner,
            unitId: unitId,
            expireTime: now + dur,
            size: (owner.size || owner.playerGifSize || 24) * 0.95,
            color: '#9944dd',
            skillDef: opts.skillDef || null,
            isGhost: true,
            isPhantomClone: true,
            isPhantomEcho: true,
            invulnerable: true,
            damagePercent: opts.damagePercent || opts.echoDamagePercent || DEFAULT_ECHO_DAMAGE_PCT,
            echoReplayDelayMs: opts.echoReplayDelayMs || DEFAULT_ECHO_DELAY_MS,
            pendingActions: [],
            faceAngle: opts.faceAngle != null ? opts.faceAngle : (owner.angle || 0),
            spawnTime: now,
            _windupUntil: now + 280,
            _spawnFadeMs: 400,
            _isTrailEcho: !!opts.isTrailEcho
        };
        st.summons.push(echo);
        spawnEchoVfx(gameInstance, x, y);
        window.refreshPhantomCloneOwnerBuff(owner, 0, now, gameInstance);

        if (typeof gameInstance.addFloatingText === 'function') {
            gameInstance.addFloatingText(x, y - 28, '残影!', '#cc88ff', 800, 13);
        }
        return echo;
    };

    window.spawnPhantomClone = window.spawnPhantomEcho;

    window.queuePhantomEchoAction = function queuePhantomEchoAction(owner, action, gameInstance, now, opts) {
        if (!owner || !action || !gameInstance) return;
        if (!isPhantom(owner)) return;
        const t = now != null ? now : Date.now();
        const echoes = getActiveEchoesForOwner(gameInstance, owner, t);
        if (!echoes.length) return;

        const delay = (opts && opts.replayDelayMs != null)
            ? opts.replayDelayMs
            : (action.echoReplayDelayMs || DEFAULT_ECHO_DELAY_MS);

        echoes.forEach(echo => {
            const dmgPct = window.getPhantomEchoDamagePercent(owner, gameInstance, echo, action);
            echo.pendingActions = echo.pendingActions || [];
            echo.pendingActions.push({
                action: Object.assign({}, action, { echoDamagePercent: dmgPct }),
                replayAt: t + delay
            });
        });
    };

    window.recordPhantomEchoAction = function recordPhantomEchoAction(owner, action, gameInstance, now, opts) {
        if (!owner || !action || !gameInstance) return;
        if (!isPhantom(owner)) return;
        if (action.skillDef && action.skillDef.id === 'phantom_clone') return;
        if (action.skillDef && !isEchoableSkill(action.skillDef)) return;
        window.queuePhantomEchoAction(owner, action, gameInstance, now, opts);
    };

    window.replayPhantomEchoAction = function replayPhantomEchoAction(echo, action, gameInstance, monsters, now) {
        if (!echo || !action || !gameInstance) return;
        const owner = echo.owner;
        if (!owner) return;

        const skillDef = action.skillDef || { id: 'phantom_echo', name: '残影复读' };
        const ec = action.entityConfig || (skillDef.entityConfig || {});
        const dmgPct = action.echoDamagePercent != null
            ? action.echoDamagePercent
            : window.getPhantomEchoDamagePercent(owner, gameInstance, echo, action);
        const ang = (owner && owner.angle != null) ? owner.angle : (action.angle != null ? action.angle : echo.faceAngle);
        echo.faceAngle = ang;
        echo._attackWindupUntil = now + 180;

        if (isWindBladeAction(action) && typeof window.spawnWindrunnerWindBlades === 'function') {
            let bladeEc = ec;
            if (typeof window.applyWindBladeProjectileMods === 'function') {
                bladeEc = window.applyWindBladeProjectileMods(owner, Object.assign({}, ec), now);
            }
            const baseMult = bladeEc.damageMultiplier || ec.damageMultiplier || 1;
            window.spawnWindrunnerWindBlades(owner, gameInstance, monsters, {
                count: 1,
                angle: ang,
                originX: echo.x,
                originY: echo.y,
                damageMultiplier: baseMult * (dmgPct / 100),
                maxRange: action.maxRange || bladeEc.maxRange || ec.maxRange || 400,
                speed: action.speed || bladeEc.speed || ec.speed || 820,
                collisionRadius: bladeEc.collisionRadius || ec.collisionRadius || 30,
                homingToMark: false,
                fromPhantomEcho: true,
                echoDamagePercent: dmgPct
            }, skillDef, now);
            playEchoWindBladeVfx(gameInstance, echo.x, echo.y, ang, bladeEc, skillDef);
            if (typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(echo.x, echo.y - 20, '复读!', '#cc88ff', 600, 11);
            }
            return;
        }

        const st = ensureState(gameInstance);
        if (!st) return;
        const targetRef = action.targetRef && action.targetRef.hp > 0 ? action.targetRef : null;
        const trajectory = action.trajectory || 'straight';

        st.projectiles.push({
            x: echo.x,
            y: echo.y,
            angle: ang,
            initialAngle: ang,
            speed: action.speed || ec.speed || 940,
            maxRange: action.maxRange || ec.maxRange || 500,
            traveled: 0,
            radius: action.collisionRadius || ec.collisionRadius || 14,
            pierceLeft: action.pierceCount != null ? action.pierceCount : (ec.pierceCount != null ? ec.pierceCount : 0),
            damage: echoDamage(owner, dmgPct),
            _cloneDamagePercent: dmgPct,
            skillDef: skillDef,
            player: owner,
            trajectory: targetRef ? 'homing' : trajectory,
            targetRef: targetRef,
            guaranteedHit: !!targetRef,
            color: ec.color || '#9944ff',
            visualVariant: ec.visualVariant || 'phantom_bolt',
            hitIds: new Set(),
            spawnTime: now,
            active: true,
            entityConfig: ec,
            _fromPhantomClone: true,
            _fromPhantomEcho: true
        });

        if (typeof gameInstance.addEquipmentEffect === 'function') {
            gameInstance.addEquipmentEffect('class_skill_vfx', echo.x, echo.y, {
                variant: 'phantom_clone_shot',
                duration: 200,
                radius: 36,
                family: 'energy',
                angle: ang,
                ox: echo.x,
                oy: echo.y
            });
        }
        if (typeof gameInstance.addFloatingText === 'function') {
            gameInstance.addFloatingText(echo.x, echo.y - 20, '复读!', '#cc88ff', 600, 11);
        }
    };

    window.updatePhantomCloneSummon = function updatePhantomCloneSummon(s, monsters, gameInstance, now) {
        if (!s || now >= s.expireTime) return false;
        const owner = s.owner;

        if (owner && owner.angle != null) {
            s.faceAngle = owner.angle;
        }

        if (s.spawnX != null && s.spawnY != null) {
            const sway = now > (s._windupUntil || 0) ? 1 : 0.35;
            s.x = s.spawnX + Math.sin(now / 520) * 4 * sway;
            s.y = s.spawnY + Math.cos(now / 680) * 3 * sway;
        }

        window.refreshPhantomCloneOwnerBuff(owner, 0, now, gameInstance);

        if (s.pendingActions && s.pendingActions.length) {
            const ready = [];
            s.pendingActions = s.pendingActions.filter(entry => {
                if (entry.replayAt <= now) {
                    ready.push(entry);
                    return false;
                }
                return true;
            });
            ready.forEach(entry => {
                window.replayPhantomEchoAction(s, entry.action, gameInstance, monsters, now);
            });
        }

        return true;
    };

    window.refreshPhantomCloneOwnerBuff = function refreshPhantomCloneOwnerBuff(owner, _legacyBonus, now, gameInstance) {
        if (!owner) return;
        const st = gameInstance && gameInstance._skillEntities;
        const echoes = st ? (st.summons || []).filter(
            s => s && s.owner === owner && s.isPhantomClone && s.hp > 0 && now < s.expireTime
        ) : [];
        const buffId = 'phantom_clone_dodge';
        owner.buffs = (owner.buffs || []).filter(b => b.id !== buffId);
        if (echoes.length) {
            const dodgeBonus = Math.min(MAX_ECHO_DODGE, echoes.length * DODGE_PER_ECHO);
            const maxExpire = Math.max.apply(null, echoes.map(s => s.expireTime));
            owner.buffs.push({
                id: buffId,
                name: '残影掩护',
                expireTime: maxExpire,
                effects: { dodge: dodgeBonus },
                hudVisible: true
            });
            if (typeof owner.updateStats === 'function') owner.updateStats();
        }
    };

    window.drawPhantomCloneSummon = function drawPhantomCloneSummon(ctx, s, owner, now) {
        if (!ctx || !s) return;
        const age = now - (s.spawnTime || now);
        const fadeIn = Math.min(1, age / (s._spawnFadeMs || 400));
        const expireLeft = (s.expireTime || now) - now;
        const fadeOut = expireLeft < 500 ? expireLeft / 500 : 1;
        const alpha = (0.42 + 0.18 * Math.sin(now / 220)) * fadeIn * fadeOut;
        const face = s.faceAngle != null ? s.faceAngle : 0;
        const sx = s.x;
        const sy = s.y;
        const pulse = 0.94 + 0.06 * Math.sin(now / 190);
        const drawSize = (s.size || 22) * 2 * pulse;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        ctx.globalAlpha = alpha * 0.35;
        const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, drawSize * 0.75);
        rg.addColorStop(0, 'rgba(180,100,255,0.55)');
        rg.addColorStop(0.5, 'rgba(100,40,180,0.25)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(sx, sy, drawSize * 0.75, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha * 0.55;
        ctx.strokeStyle = '#cc88ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.arc(sx, sy, drawSize * 0.42, now / 600, now / 600 + Math.PI * 1.4);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = alpha;
        const flip = Math.cos(face) < -0.05;

        if (owner && owner.playerGifLoaded && owner.playerGifFrames && owner.playerGifFrames.length) {
            const frameIdx = Math.floor(now / 110) % owner.playerGifFrames.length;
            const frame = owner.playerGifFrames[frameIdx];
            if (frame) {
                ctx.save();
                ctx.filter = 'hue-rotate(250deg) saturate(1.35) brightness(1.15)';
                if (flip) {
                    ctx.translate(sx, sy);
                    ctx.scale(-1, 1);
                    ctx.translate(-sx, -sy);
                }
                if (s._attackWindupUntil && now < s._attackWindupUntil) {
                    const pull = 1 - (s._attackWindupUntil - now) / 180;
                    ctx.translate(-Math.cos(face) * pull * 6, -Math.sin(face) * pull * 6);
                }
                ctx.drawImage(
                    frame,
                    sx - drawSize / 2,
                    sy - drawSize / 2,
                    drawSize,
                    drawSize
                );
                ctx.restore();
            }
        } else {
            ctx.fillStyle = 'rgba(153,68,221,0.75)';
            ctx.beginPath();
            ctx.ellipse(sx, sy, drawSize * 0.28, drawSize * 0.34, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = alpha * 0.65;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        const ch = drawSize * 0.28;
        ctx.beginPath();
        ctx.moveTo(sx - ch, sy);
        ctx.lineTo(sx + ch, sy);
        ctx.moveTo(sx, sy - ch);
        ctx.lineTo(sx, sy + ch);
        ctx.stroke();

        if (s._attackWindupUntil && now < s._attackWindupUntil + 80) {
            const wt = 1 - Math.max(0, s._attackWindupUntil - now) / 180;
            ctx.globalAlpha = alpha * wt * 0.7;
            ctx.strokeStyle = '#eeccff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(
                sx + Math.cos(face) * drawSize * 0.55 * wt,
                sy + Math.sin(face) * drawSize * 0.55 * wt
            );
            ctx.stroke();
        }

        ctx.restore();
    };

    window.updateVoidStormEchoTrail = function updateVoidStormEchoTrail(field, gameInstance, monsters, now) {
        if (!field || !field.owner || !field.entityConfig) return;
        const ec = field.entityConfig;
        if (!ec.echoTrailIntervalMs) return;
        const owner = field.owner;
        if (field._lastEchoTrailPos == null) {
            field._lastEchoTrailPos = { x: owner.x, y: owner.y };
            field._lastEchoTrailTime = now;
            field._lastEchoTrailDist = 0;
            return;
        }
        const dx = owner.x - field._lastEchoTrailPos.x;
        const dy = owner.y - field._lastEchoTrailPos.y;
        const moved = Math.hypot(dx, dy);
        field._lastEchoTrailDist = (field._lastEchoTrailDist || 0) + moved;
        const minDist = ec.echoTrailMoveDistance || 24;
        const timeOk = now - (field._lastEchoTrailTime || 0) >= ec.echoTrailIntervalMs;
        const distOk = field._lastEchoTrailDist >= minDist;
        if (!timeOk && !distOk) return;

        field._lastEchoTrailTime = now;
        field._lastEchoTrailDist = 0;
        const trailX = field._lastEchoTrailPos.x;
        const trailY = field._lastEchoTrailPos.y;
        field._lastEchoTrailPos = { x: owner.x, y: owner.y };

        window.spawnPhantomEcho(owner, gameInstance, trailX, trailY, {
            durationMs: ec.echoTrailDurationMs || 4000,
            damagePercent: ec.echoTrailDamagePercent || 45,
            echoReplayDelayMs: DEFAULT_ECHO_DELAY_MS,
            skillDef: field.skillDef,
            faceAngle: owner.angle,
            maxCount: MAX_ECHO_COUNT,
            isTrailEcho: true
        });
    };

    function hasActivePhantomMark(player, monsters) {
        const t = Date.now();
        return (monsters || []).some(m => {
            if (!m || !m._classSkillMark) return false;
            const mark = m._classSkillMark;
            if (mark.expireTime <= t) return false;
            if ((mark.markId || '') !== 'phantom_mark') return false;
            return !mark.owner || mark.owner === player;
        });
    }

    function getVoidStormSalvoConfig() {
        if (typeof window.getSkillDefinition !== 'function') return {};
        const def = window.getSkillDefinition('void_storm');
        return def && def.entityConfig ? def.entityConfig : {};
    }

    function getArraySalvoChargeStacks(chargeMs, cfg) {
        const step = cfg.arraySalvoChargeStepMs || 300;
        const maxMs = cfg.arraySalvoChargeMaxMs || 900;
        const ms = Math.max(0, Math.min(maxMs, chargeMs || 0));
        return Math.floor(ms / step);
    }

    window.getVoidStormArraySalvoCooldownRemaining = function getVoidStormArraySalvoCooldownRemaining(player, now, gameInstance) {
        if (!player || !window.isPlayerInVoidStorm(player, now, gameInstance)) return 0;
        const cfg = getVoidStormSalvoConfig();
        const cd = cfg.arraySalvoCdMs || 1000;
        const last = player._voidStormArraySalvoLast || 0;
        const t = now != null ? now : Date.now();
        return Math.max(0, cd - (t - last));
    };

    window.canCastVoidStormArraySalvo = function canCastVoidStormArraySalvo(player, now, gameInstance) {
        if (!player || !window.isPlayerInVoidStorm(player, now, gameInstance)) return false;
        return window.getVoidStormArraySalvoCooldownRemaining(player, now, gameInstance) <= 0;
    };

    function fireArraySalvoBlade(owner, ox, oy, angle, gameInstance, monsters, skillDef, ec, chargeStacks, cfg, isEcho, now) {
        if (!owner || !gameInstance || typeof window.spawnWindrunnerWindBlades !== 'function') return;
        let bladeEc = Object.assign({}, ec);
        if (typeof window.applyWindBladeProjectileMods === 'function') {
            bladeEc = window.applyWindBladeProjectileMods(owner, bladeEc, now);
        }
        const dmgStep = cfg.arraySalvoDmgPerStep || 20;
        const widthStep = cfg.arraySalvoWidthPerStep || 50;
        const baseMult = bladeEc.damageMultiplier || ec.damageMultiplier || 1;
        const chargeMult = 1 + chargeStacks * dmgStep / 100;
        const widthMult = 1 + chargeStacks * widthStep / 100;
        const baseRadius = bladeEc.collisionRadius || ec.collisionRadius || 30;
        const echoPct = isEcho ? (cfg.stormEchoDamagePercent || STORM_ECHO_DAMAGE_PCT) : 100;
        const finalMult = baseMult * chargeMult * (isEcho ? echoPct / 100 : 1);

        window.spawnWindrunnerWindBlades(owner, gameInstance, monsters, {
            count: 1,
            angle: angle,
            originX: ox,
            originY: oy,
            damageMultiplier: finalMult,
            collisionRadius: Math.max(14, Math.floor(baseRadius * widthMult)),
            maxRange: bladeEc.maxRange || ec.maxRange || 400,
            speed: bladeEc.speed || ec.speed || 820,
            fromPhantomEcho: isEcho,
            homingToMark: false,
            echoDamagePercent: echoPct
        }, skillDef, now);

        if (typeof gameInstance.addEquipmentEffect === 'function') {
            gameInstance.addEquipmentEffect('class_skill_vfx', ox, oy, {
                variant: 'wind_blade_arc',
                duration: 420,
                radius: (bladeEc.maxRange || 400) * 0.65,
                angle: angle,
                family: 'wind',
                ox: ox,
                oy: oy,
                bladeWidth: Math.floor(baseRadius * widthMult),
                color: isEcho ? '#9944ff' : '#cc88ff'
            });
        }
    }

    window.tryExecuteVoidStormArraySalvo = function tryExecuteVoidStormArraySalvo(
        player, monsters, skillDef, gameInstance, castOptions, now
    ) {
        if (!player || !skillDef || skillDef.id !== 'phantom_echo_blade') return false;
        if (!window.isPlayerInVoidStorm(player, now, gameInstance)) return false;

        const t = now != null ? now : Date.now();
        if (!window.canCastVoidStormArraySalvo(player, t, gameInstance)) {
            if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                const left = Math.ceil(window.getVoidStormArraySalvoCooldownRemaining(player, t, gameInstance) / 100) / 10;
                gameInstance.addFloatingText(player.x, player.y - 32, '齐射 ' + left.toFixed(1) + 's', '#8866aa', 700, 12);
            }
            return true;
        }

        const cfg = getVoidStormSalvoConfig();
        const chargeMs = castOptions && castOptions.chargeMs != null ? castOptions.chargeMs : 0;
        const chargeStacks = getArraySalvoChargeStacks(chargeMs, cfg);
        let angle = player.angle || 0;
        if (castOptions && castOptions.angle != null) {
            angle = castOptions.angle;
        } else if (gameInstance && gameInstance.mouse
            && typeof gameInstance.screenToWorldForAim === 'function') {
            const w = gameInstance.screenToWorldForAim(gameInstance.mouse.x, gameInstance.mouse.y);
            if (w) angle = Math.atan2(w.y - player.y, w.x - player.x);
        }
        player.angle = angle;

        const ec = skillDef.entityConfig || {};
        fireArraySalvoBlade(player, player.x, player.y, angle, gameInstance, monsters, skillDef, ec, chargeStacks, cfg, false, t);

        const echoes = getActiveEchoesForOwner(gameInstance, player, t);
        echoes.forEach(echo => {
            fireArraySalvoBlade(player, echo.x, echo.y, angle, gameInstance, monsters, skillDef, ec, chargeStacks, cfg, true, t);
            echo._attackWindupUntil = t + 180;
        });

        player._voidStormArraySalvoLast = t;

        if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
            const label = chargeStacks > 0
                ? '阵列齐射×' + (1 + echoes.length) + ' +' + (chargeStacks * (cfg.arraySalvoDmgPerStep || 20)) + '%'
                : '阵列齐射×' + (1 + echoes.length);
            gameInstance.addFloatingText(player.x, player.y - 36, label, '#cc88ff', 900, 14);
        }
        if (typeof window.playClassSkillVfx === 'function') {
            window.playClassSkillVfx(player, skillDef, gameInstance, {
                primaryTarget: null,
                hit: true,
                voidStormArraySalvo: true,
                salvoCount: 1 + echoes.length,
                chargeStacks: chargeStacks
            });
        }
        return true;
    };

    window.applyPhantomSkillOverrides = function applyPhantomSkillOverrides(player, skillDef) {
        if (!isPhantom(player) || !skillDef) return skillDef;
        let out = skillDef;
        if (skillDef.resourceType === 'focus') {
            out = Object.assign({}, out, { resourceType: 'wind_mark' });
        }
        if (skillDef.id === 'phantom_clone'
            && window.isPlayerInVoidStorm(player, Date.now(), player.gameInstance)) {
            const cfg = getVoidStormSalvoConfig();
            out = Object.assign({}, out, { cooldownMs: cfg.phantomCloneStormCdMs || 1500 });
        }
        if (skillDef.id === 'phantom_echo_blade'
            && window.isPlayerInVoidStorm(player, Date.now(), player.gameInstance)) {
            const cfg = getVoidStormSalvoConfig();
            out = Object.assign({}, out, {
                name: '阵列齐射',
                description: '【虚空风暴·阵列齐射】本体+全部残影同步向瞄准方向发射风刃（' + ((cfg.arraySalvoCdMs || 1000) / 1000) + 's CD）。蓄力每0.3s +20%伤害/+50%宽度，最多0.9s。'
            });
        }
        if (skillDef.id === 'phantom_mark' && skillDef.entityConfig && skillDef.entityConfig.emptyFieldHalfCD) {
            const g = player.gameInstance;
            const monsters = g && typeof g.getCurrentSceneTargets === 'function'
                ? g.getCurrentSceneTargets() : null;
            if (!hasActivePhantomMark(player, monsters)) {
                out = Object.assign({}, out, { cooldownMs: Math.floor((skillDef.cooldownMs || 8000) / 2) });
            }
        }
        return out;
    };

    window.getPhantomEchoMarkDamageMultiplier = function getPhantomEchoMarkDamageMultiplier(monster, attacker, projectile) {
        if (!monster || !attacker || !monster._classSkillMark) return 1;
        if (!projectile || !projectile._fromPhantomEcho) return 1;
        const mark = monster._classSkillMark;
        if (mark.expireTime <= Date.now()) return 1;
        if ((mark.markId || '') !== 'phantom_mark') return 1;
        if (mark.owner && mark.owner !== attacker) return 1;
        const bonus = mark.phantomEchoDamageBonus || mark.markPhantomDmgBonus || 0;
        return bonus > 0 ? 1 + bonus / 100 : 1;
    };

    window.resolvePhantomConfuseChasePoint = function resolvePhantomConfuseChasePoint(monster, player, gameInstance, now) {
        if (!monster || !player || !gameInstance) return null;
        const mark = monster._classSkillMark;
        if (!mark || mark.expireTime <= (now != null ? now : Date.now())) return null;
        if ((mark.markId || '') !== 'phantom_mark') return null;
        const owner = mark.owner || player;
        if (owner !== player && gameInstance.player !== player) return null;

        const confuseChance = mark.phantomConfuseChance || 25;
        const confuseRadius = mark.phantomConfuseRadius || 120;
        if (Math.random() * 100 >= confuseChance) return null;

        const echoes = getActiveEchoesForOwner(gameInstance, owner, now);
        if (!echoes.length) return null;

        const nearby = echoes.filter(e =>
            Math.hypot(e.x - monster.x, e.y - monster.y) <= confuseRadius + (monster.size || 20)
        );
        if (!nearby.length) return null;
        const pick = nearby[Math.floor(Math.random() * nearby.length)];
        if (gameInstance && typeof gameInstance.addFloatingText === 'function' && Math.random() < 0.35) {
            gameInstance.addFloatingText(monster.x, monster.y - 16, '?', '#cc88ff', 500, 14);
        }
        return { x: pick.x, y: pick.y };
    };

    window.onPhantomMarkVictimKilled = function onPhantomMarkVictimKilled(player, monster, gameInstance, monsters, now) {
        if (!player || !monster || !monster._classSkillMark) return;
        const mark = monster._classSkillMark;
        if ((mark.markId || '') !== 'phantom_mark') return;
        if (mark.owner && mark.owner !== player) return;

        const skillDef = typeof window.getSkillDefinition === 'function'
            ? window.getSkillDefinition('phantom_mark') : null;
        const ec = skillDef && skillDef.entityConfig ? skillDef.entityConfig : {};
        const radius = ec.markExplosionRadius || 90;
        const dmgMult = ec.markExplosionDamage || 1.8;
        const knockback = ec.markExplosionKnockback || 45;
        const atkOwner = mark.owner || player;

        if (typeof window.resolveWindMarkExplosion === 'function') {
            window.resolveWindMarkExplosion(atkOwner, monster, gameInstance, monsters, {
                radius, dmgMult, knockback, skillDef, label: '虚影爆!'
            }, now);
        }

        if (ec.onMarkKillReduceCD && typeof window.reduceSkillCooldownMs === 'function') {
            const cd = ec.onMarkKillReduceCD;
            window.reduceSkillCooldownMs(atkOwner, cd.skillId || 'phantom_clone', cd.ms || 2000);
            if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(atkOwner.x, atkOwner.y - 36, '残影步 -2s', '#cc88ff', 900, 13);
            }
        }
        monster._classSkillMark = null;
    };

    window.isPhantomPlayer = isPhantom;
})();
