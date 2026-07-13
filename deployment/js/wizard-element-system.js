/**
 * 巫师/大魔导师 · 三位一体相位 / 共鸣轮转 / 元素解放
 */
(function () {
    'use strict';

    const WIZARD_TREE = { wizard: true, archmage: true };
    const MAX_RESONANCE = 4;
    const DECAY_IDLE_MS = 8000;
    const DECAY_INTERVAL_MS = 1000;
    const BRIDGE_WINDOW_MS = 3000;
    const BRIDGE_SANCTUARY_MS = 5000;

    const PHASES = {
        fire: { name: '灼热', color: '#ff6622', next: 'frost', element: 'fire' },
        frost: { name: '极寒', color: '#88ccff', next: 'overload', element: 'frost' },
        overload: { name: '过载', color: '#44aaff', next: 'fire', element: 'lightning' }
    };

    function classId(player) {
        if (!player || !player.classData) return null;
        return typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
    }

    function isWizardTree(player) {
        const id = classId(player);
        return !!(id && WIZARD_TREE[id]);
    }

    window.isWizardTreePlayer = isWizardTree;

    function floatText(g, x, y, text, color, size) {
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(x, y, text, color || '#ffaa44', size ? 1100 : 900, size || 14);
        }
    }

    function magicAtk(player) {
        return player.baseMagicAttack || player.baseAttack || 10;
    }

    function nextClockwisePhase(cur) {
        if (!cur || !PHASES[cur]) return 'fire';
        return PHASES[cur].next;
    }

    window.getWizardPhases = function getWizardPhases() {
        return PHASES;
    };

    window.getElementPhase = function getElementPhase(player) {
        if (!player) return null;
        return player._elementPhase || null;
    };

    window.getWizardResonanceStacks = function getWizardResonanceStacks(player) {
        if (!isWizardTree(player)) return 0;
        return Math.min(MAX_RESONANCE, player._resonanceStacks || 0);
    };

    window.getElementPhaseModifiers = function getElementPhaseModifiers(player) {
        if (!isWizardTree(player)) {
            return { fireDmg: 0, frostDmg: 0, shockDmg: 0, costMult: 1, regenMult: 1, moveSpeed: 0, cdSpeed: 1 };
        }
        if (player._wizardAwakeningUntil && Date.now() < player._wizardAwakeningUntil) {
            return {
                fireDmg: 25, frostDmg: 20, shockDmg: 25,
                costMult: 0.6, regenMult: 1.5, moveSpeed: 10, cdSpeed: 1.5
            };
        }
        const phase = player._elementPhase;
        let mods = { fireDmg: 0, frostDmg: 0, shockDmg: 0, costMult: 1, regenMult: 1, moveSpeed: 0, cdSpeed: 1 };
        if (phase === 'fire') {
            mods.fireDmg = 25;
            mods.costMult = 1.5;
            mods.regenMult = 0.5;
            mods.moveSpeed = -10;
        } else if (phase === 'frost') {
            mods.frostDmg = 20;
            mods.costMult = 0.6;
            mods.regenMult = 1.5;
            mods.moveSpeed = 5;
            mods.cdSpeed = 1.5;
        } else if (phase === 'overload') {
            mods.shockDmg = 25;
            mods.moveSpeed = 15;
        }
        return mods;
    };

    function applyPhaseStatus(m, phase, g, player) {
        if (!m || typeof window.applyCombatStatus !== 'function') return;
        if (phase === 'fire') {
            window.applyCombatStatus(m, 'burn', { durationMs: 2000 }, player, g);
        } else if (phase === 'frost') {
            window.applyCombatStatus(m, 'frostbite', { durationMs: 2000 }, player, g);
            if (typeof window.applyCcEffects === 'function') {
                window.applyCcEffects(m, Date.now(), { freezeMs: 2000 }, g, player);
            }
        } else if (phase === 'overload') {
            window.applyCombatStatus(m, 'shock', { durationMs: 2000 }, player, g);
        }
    }

    function emitPhasePulse(player, phase, g) {
        const monsters = g && g.monsters ? g.monsters : [];
        const radius = 80;
        const pulseEc = { damageMultiplier: 1.0 };
        const fakeDef = { id: 'phase_pulse', name: '元素脉冲', damageMultiplier: 1.0 };
        monsters.forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - player.x, m.y - player.y) > radius) return;
            if (typeof window.applySkillEntityDamage === 'function') {
                const dmg = typeof window.calcSkillEntityDamage === 'function'
                    ? window.calcSkillEntityDamage(player, fakeDef, pulseEc, 1.0)
                    : Math.max(1, Math.floor(magicAtk(player)));
                window.applySkillEntityDamage(player, m, dmg, fakeDef, g);
            } else {
                m.takeDamage(Math.max(1, Math.floor(magicAtk(player))));
            }
            applyPhaseStatus(m, phase, g, player);
        });
        if (typeof window.playMageElementClashVfx === 'function') {
            window.playMageElementClashVfx(g, player.x, player.y, 'resonance', { radius: 80, phase });
        }
        floatText(g, player.x, player.y - 32, '元素脉冲', PHASES[phase] && PHASES[phase].color, 15);
        if (typeof window.grantSkillResource === 'function') {
            window.grantSkillResource(player, 10);
        }
    }

    function addResonanceStack(player, g) {
        const prev = player._resonanceStacks || 0;
        const gain = (classId(player) === 'archmage' && player._triSanctuaryActive) ? 2 : 1;
        player._resonanceStacks = Math.min(MAX_RESONANCE, prev + gain);
        player._lastPhaseSwitchTime = Date.now();
        if (player._resonanceStacks > prev) {
            floatText(g, player.x, player.y - 44, `共鸣 ${player._resonanceStacks}`, '#ffdd44', 13);
        }
        if (typeof player.updateStats === 'function') player.updateStats();
    }

    window.enterBridgeWindow = function enterBridgeWindow(player, fromPhase, toPhase) {
        if (classId(player) !== 'archmage') return;
        let durationMs = BRIDGE_WINDOW_MS;
        if (player._triSanctuaryActive) durationMs = BRIDGE_SANCTUARY_MS;
        player._bridgeWindowUntil = Date.now() + durationMs;
        player._bridgeFromPhase = fromPhase;
        player._bridgeToPhase = toPhase;
    };

    window.isInBridgeWindow = function isInBridgeWindow(player) {
        if (classId(player) !== 'archmage') return false;
        return !!(player._bridgeWindowUntil && Date.now() < player._bridgeWindowUntil);
    };

    window.getBridgeFusionType = function getBridgeFusionType(player) {
        const from = player._bridgeFromPhase;
        const to = player._bridgeToPhase;
        if (from === 'fire' && to === 'frost') return 'magma';
        if (from === 'frost' && to === 'overload') return 'tempest';
        if (from === 'overload' && to === 'fire') return 'plasma';
        return null;
    };

    window.getBridgePhaseModifiers = function getBridgePhaseModifiers(player) {
        if (!window.isInBridgeWindow(player)) return null;
        return {
            fromPhase: player._bridgeFromPhase,
            toPhase: player._bridgeToPhase,
            fusionType: window.getBridgeFusionType(player),
            fromDmgMult: 0.6,
            toDmgMult: 0.6
        };
    };

    window.switchElementPhase = function switchElementPhase(player, nextPhase, g, opts) {
        if (!isWizardTree(player) || !nextPhase || !PHASES[nextPhase]) return;
        opts = opts || {};
        const prev = player._elementPhase;
        if (prev === nextPhase && !opts.force) return;
        player._elementPhase = nextPhase;
        delete player._enhancedFirePhase;
        if (prev && prev !== nextPhase) {
            if (!opts.skipPulse) emitPhasePulse(player, nextPhase, g);
            if (!opts.skipResonance) addResonanceStack(player, g);
        }
        player._lastPhaseSwitchTime = Date.now();
        const label = PHASES[nextPhase].name + '相位';
        floatText(g, player.x, player.y - 24, label, PHASES[nextPhase].color);
        if (classId(player) === 'archmage' && prev && prev !== nextPhase
            && typeof window.enterBridgeWindow === 'function') {
            window.enterBridgeWindow(player, prev, nextPhase);
            floatText(g, player.x, player.y - 56, '桥接!', '#cc88ff', 14);
        }
        if (typeof player.updateStats === 'function') player.updateStats();
    };

    window.toggleElementPhaseOnBlink = function toggleElementPhaseOnBlink(player, g) {
        if (!isWizardTree(player)) return;
        const cur = player._elementPhase || 'fire';
        const next = nextClockwisePhase(cur);
        window.switchElementPhase(player, next, g, { skipPulse: false });
    };

    window.onWizardSkillCastPhase = function onWizardSkillCastPhase(player, skillDef, g) {
        if (!isWizardTree(player) || !skillDef) return;
        const ec = skillDef.entityConfig || {};
        if (ec.skipPhaseSwitch) return;
        let tag = ec.elementTag;
        if (!tag && ec.wizardBasicPhase) {
            tag = ec.wizardBasicPhase === 'overload' ? 'lightning' : ec.wizardBasicPhase;
        }
        if (!tag && ec.wizardBurstPhase) {
            tag = ec.wizardBurstPhase === 'overload' ? 'lightning' : ec.wizardBurstPhase;
        }
        if (!tag && ec.wizardFieldPhase) {
            tag = ec.wizardFieldPhase === 'overload' ? 'lightning' : ec.wizardFieldPhase;
        }
        if (!tag && skillDef.id === 'fireball') tag = 'fire';
        if (!tag && skillDef.id === 'frost_nova') tag = 'frost';
        if (tag === 'fire') window.switchElementPhase(player, 'fire', g);
        else if (tag === 'frost') window.switchElementPhase(player, 'frost', g);
        else if (tag === 'lightning') window.switchElementPhase(player, 'overload', g);
    };

    function resonanceDamageBonus(player) {
        const stacks = window.getWizardResonanceStacks(player);
        return stacks * 0.06;
    }

    window.getWizardSkillDamageMult = function getWizardSkillDamageMult(player, skillDef, monster) {
        if (!isWizardTree(player)) return 1;
        let mult = 1;
        const mods = window.getElementPhaseModifiers(player);
        const tags = (skillDef && skillDef.effectTags) || [];
        const ecTag = skillDef && skillDef.entityConfig && skillDef.entityConfig.elementTag;
        if (tags.includes('burn') || ecTag === 'fire') mult *= 1 + mods.fireDmg / 100;
        if (tags.includes('frostbite') || ecTag === 'frost') mult *= 1 + mods.frostDmg / 100;
        if (tags.includes('shock') || ecTag === 'lightning') mult *= 1 + mods.shockDmg / 100;
        mult *= 1 + resonanceDamageBonus(player);
        if (typeof window.getClassPassiveId === 'function') {
            const passive = window.getClassPassiveId(player);
            if (passive === 'elemental_rhythm') mult *= 1.18;
        }
        if (player._elementLiberationUntil && Date.now() < player._elementLiberationUntil) {
            mult *= 1 + (player._elementLiberationDmg || 40) / 100;
        }
        if (player._wizardAwakeningUntil && Date.now() < player._wizardAwakeningUntil) {
            mult *= 1 + (player._wizardAwakeningDmg || 40) / 100;
        }
        return mult;
    };

    window.getWizardResourceCostMult = function getWizardResourceCostMult(player) {
        if (!isWizardTree(player)) return 1;
        return window.getElementPhaseModifiers(player).costMult;
    };

    window.getWizardRegenMult = function getWizardRegenMult(player) {
        if (!isWizardTree(player)) return 1;
        let mult = window.getElementPhaseModifiers(player).regenMult;
        const stacks = window.getWizardResonanceStacks(player);
        mult *= 1 + stacks * 0.05;
        return mult;
    };

    window.enterElementLiberation = function enterElementLiberation(player, g, durMs, dmgBonus, cdReduction) {
        if (!player) return;
        const now = Date.now();
        const dur = durMs || 4000;
        player._elementLiberationUntil = now + dur;
        player._elementLiberationDmg = dmgBonus != null ? dmgBonus : 40;
        player._elementLiberationCd = cdReduction != null ? cdReduction : 0.4;
        if (classId(player) === 'archmage') {
            player._elementLiberationDmg = dmgBonus != null ? dmgBonus : 60;
            player._elementLiberationCd = cdReduction != null ? cdReduction : 0.6;
        }
        player.buffs = player.buffs || [];
        player.buffs = player.buffs.filter(b => b.id !== 'element_liberation');
        player.buffs.push({
            id: 'element_liberation',
            name: '元素解放',
            expireTime: player._elementLiberationUntil,
            hudVisible: true,
            iconKey: 'damageMultiplier',
            effects: { attackPercent: player._elementLiberationDmg }
        });
        floatText(g, player.x, player.y - 36, '解放!', '#ffaa00', 18);
        if (typeof window.playMageElementClashVfx === 'function') {
            window.playMageElementClashVfx(g, player.x, player.y, 'surge_awakening', { radius: 120 });
        }
        if (typeof player.updateStats === 'function') player.updateStats();
    };

    window.tryTriggerWizardLiberationOnBurst = function tryTriggerWizardLiberationOnBurst(player, g) {
        if (!isWizardTree(player)) return false;
        const stacks = window.getWizardResonanceStacks(player);
        if (stacks < MAX_RESONANCE) return false;
        player._resonanceStacks = 0;
        window.enterElementLiberation(player, g, 4000, 40, 0.4);
        if (typeof player.updateStats === 'function') player.updateStats();
        return true;
    };

    window.enterWizardAwakening = function enterWizardAwakening(player, g, se, now) {
        if (!player) return;
        const dur = (se && se.durationMs) || 6000;
        const dmgBonus = (se && se.damageBonus) || 40;
        const cdRed = (se && se.cdReduction) || 0.4;
        player._wizardAwakeningUntil = (now || Date.now()) + dur;
        player._wizardAwakeningDmg = dmgBonus;
        player._wizardAwakeningCd = cdRed;
        player._elementPhase = 'awakening';
        player.buffs = player.buffs || [];
        player.buffs = player.buffs.filter(b => b.id !== 'wizard_awakening');
        player.buffs.push({
            id: 'wizard_awakening',
            name: '元素觉醒',
            expireTime: player._wizardAwakeningUntil,
            hudVisible: true,
            iconKey: 'damageMultiplier',
            effects: { attackPercent: dmgBonus, attackSpeedPercent: 25 }
        });
        floatText(g, player.x, player.y - 40, '觉醒!', '#ffdd00', 20);
        if (typeof window.playMageElementClashVfx === 'function') {
            window.playMageElementClashVfx(g, player.x, player.y, 'surge_awakening', { radius: 160 });
        }
        if (typeof player.updateStats === 'function') player.updateStats();
    };

    window.isWizardAwakening = function isWizardAwakening(player, now) {
        if (!player || !player._wizardAwakeningUntil) return false;
        return (now || Date.now()) < player._wizardAwakeningUntil;
    };

    window.enterArchmageAvatar = function enterArchmageAvatar(player, g, se, now) {
        if (!player) return;
        const t = now || Date.now();
        const dur = (se && se.durationMs) || 8000;
        player._archmageAvatarUntil = t + dur;
        player._archmageAvatarExtended = 0;
        window.enterWizardAwakening(player, g, {
            durationMs: dur,
            damageBonus: (se && se.damageBonus) || 60,
            cdReduction: (se && se.cdReduction) || 0.6
        }, t);
        player._wizardAwakeningUntil = player._archmageAvatarUntil;
        if (se && se.autoLiberationMs) {
            window.enterElementLiberation(player, g, se.autoLiberationMs,
                se.liberationDmg || 60, se.liberationCd || 0.6);
        }
        floatText(g, player.x, player.y - 48, '化身!', '#ffdd00', 22);
    };

    window.isArchmageAvatar = function isArchmageAvatar(player, now) {
        if (!player || !player._archmageAvatarUntil) return false;
        return (now || Date.now()) < player._archmageAvatarUntil;
    };

    window.applyElementalLiberationEffect = function applyElementalLiberationEffect(player, skillDef, g, now) {
        const se = skillDef.skillEffect || {};
        if (se.type === 'archmage_avatar') {
            window.enterArchmageAvatar(player, g, se, now);
            if (se.refreshCooldowns && player.skillCooldowns) {
                const selfId = skillDef && skillDef.id;
                Object.keys(player.skillCooldowns).forEach(k => {
                    if (k === selfId) return;
                    player.skillCooldowns[k] = now;
                });
            }
            return true;
        }
        if (se.type === 'wizard_awakening') {
            window.enterWizardAwakening(player, g, se, now);
            if (se.refreshCooldowns && player.skillCooldowns) {
                const selfId = skillDef && skillDef.id;
                Object.keys(player.skillCooldowns).forEach(k => {
                    if (k === selfId) return;
                    player.skillCooldowns[k] = now;
                });
            }
            return true;
        }
        if (se.type !== 'elemental_liberation' && se.type !== 'meteor_liberation') return false;
        window.enterElementLiberation(player, g, se.durationMs, se.damageBonus, se.cdReduction);
        if (se.refreshCooldowns && player.skillCooldowns) {
            const selfId = skillDef && skillDef.id;
            Object.keys(player.skillCooldowns).forEach(k => {
                if (k === selfId) return;
                player.skillCooldowns[k] = now;
            });
        }
        return true;
    };

    window.getElementalMasteryBonuses = function getElementalMasteryBonuses(player) {
        if (!player || classId(player) !== 'archmage') return null;
        if (typeof window.getClassPassiveId === 'function'
            && window.getClassPassiveId(player) !== 'elemental_mastery') return null;
        if (!player._elementLiberationUntil || Date.now() >= player._elementLiberationUntil) return null;
        return { burnTickMult: 2, frostSlowMult: 2, shockSplashMult: 2, name: '元素精通' };
    };

    window.getElementalRhythmPassiveName = function getElementalRhythmPassiveName(player) {
        const id = classId(player);
        if (id === 'wizard') return '元素律动';
        if (id === 'archmage') return '元素精通';
        return null;
    };

    window.getWizardCdSpeedMult = function getWizardCdSpeedMult(player) {
        if (!isWizardTree(player)) return 1;
        let mult = window.getElementPhaseModifiers(player).cdSpeed || 1;
        if (classId(player) === 'archmage') mult *= 1.05;
        if (player._elementLiberationUntil && Date.now() < player._elementLiberationUntil) {
            mult *= 1 + (player._elementLiberationCd || 0.4);
        }
        if (player._wizardAwakeningUntil && Date.now() < player._wizardAwakeningUntil) {
            mult *= 1 + (player._wizardAwakeningCd || 0.4);
        }
        return mult;
    };

    window.onWizardChainLightningHit = function onWizardChainLightningHit(player, hitCount) {
        if (!isWizardTree(player) || !hitCount) return;
        if (typeof window.grantSkillResource === 'function') {
            window.grantSkillResource(player, 5 * hitCount);
        }
    };

    window.initWizardElementState = function initWizardElementState(player) {
        if (!isWizardTree(player)) return;
        if (!player._elementPhase) player._elementPhase = 'fire';
        if (player._resonanceStacks == null) player._resonanceStacks = 0;
        if (!player._lastPhaseSwitchTime) player._lastPhaseSwitchTime = Date.now();
    };

    window.tickWizardElementStates = function tickWizardElementStates(player, g, now) {
        if (!isWizardTree(player)) return;
        window.initWizardElementState(player);

        if (player._elementLiberationUntil && now >= player._elementLiberationUntil) {
            player._elementLiberationUntil = 0;
            player.buffs = (player.buffs || []).filter(b => b.id !== 'element_liberation');
        }
        if (player._wizardAwakeningUntil && now >= player._wizardAwakeningUntil) {
            player._wizardAwakeningUntil = 0;
            player.buffs = (player.buffs || []).filter(b => b.id !== 'wizard_awakening');
            if (player._elementPhase === 'awakening') {
                player._elementPhase = 'fire';
            }
        }

        const lastSwitch = player._lastPhaseSwitchTime || now;
        if ((player._resonanceStacks || 0) > 0 && now - lastSwitch >= DECAY_IDLE_MS) {
            if (!player._resonanceDecayNext) player._resonanceDecayNext = now + DECAY_INTERVAL_MS;
            if (now >= player._resonanceDecayNext) {
                player._resonanceStacks = Math.max(0, (player._resonanceStacks || 0) - 1);
                player._resonanceDecayNext = now + DECAY_INTERVAL_MS;
                if (typeof player.updateStats === 'function') player.updateStats();
            }
        } else {
            player._resonanceDecayNext = null;
        }

        const mods = window.getElementPhaseModifiers(player);
        if (mods.moveSpeed) {
            player._phaseMoveSpeed = mods.moveSpeed;
        } else {
            delete player._phaseMoveSpeed;
        }

        if (player._bridgeWindowUntil && now >= player._bridgeWindowUntil) {
            player._bridgeWindowUntil = null;
            player._bridgeFromPhase = null;
            player._bridgeToPhase = null;
        }

        if (typeof window.tickArchmageTriSanctuary === 'function') {
            window.tickArchmageTriSanctuary(player, now);
        }
        if (typeof window.tickArchmageDimensionalRift === 'function') {
            window.tickArchmageDimensionalRift(player, g, g && g.monsters, now);
        }

        if (typeof window.tickWizardFlameChannel === 'function') {
            window.tickWizardFlameChannel(player, g, now);
        }
    };

    window.getWizardLiberationRemaining = function getWizardLiberationRemaining(player, now) {
        if (!player || !player._elementLiberationUntil) return 0;
        return Math.max(0, player._elementLiberationUntil - (now || Date.now()));
    };

    window.getWizardAwakeningRemaining = function getWizardAwakeningRemaining(player, now) {
        if (!player || !player._wizardAwakeningUntil) return 0;
        return Math.max(0, player._wizardAwakeningUntil - (now || Date.now()));
    };
})();
