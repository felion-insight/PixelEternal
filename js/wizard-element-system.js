/**
 * 巫师/大魔导师 · 元素相位 / 元素共鸣 / 元素解放
 */
(function () {
    'use strict';

    const WIZARD_TREE = { mage: true, wizard: true, archmage: true };
    const PHASES = {
        fire: { name: '灼热', color: '#ff6622', next: 'frost' },
        frost: { name: '霜寒', color: '#88ccff', next: 'fire' },
        overload: { name: '过载', color: '#44aaff', next: 'fire' },
        arctic: { name: '极寒', color: '#aaddff', next: 'fire' }
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

    function floatText(g, x, y, text, color) {
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(x, y, text, color || '#ffaa44');
        }
    }

    function magicAtk(player) {
        return player.baseMagicAttack || player.baseAttack || 10;
    }

    window.getElementPhase = function getElementPhase(player) {
        if (!player) return null;
        return player._elementPhase || null;
    };

    window.getElementPhaseModifiers = function getElementPhaseModifiers(player) {
        if (!isWizardTree(player)) {
            return { fireDmg: 0, frostDmg: 0, shockDmg: 0, costMult: 1, regenMult: 1, moveSpeed: 0, cdSpeed: 1 };
        }
        const phase = player._elementPhase;
        const enhanced = !!player._enhancedFirePhase;
        let mods = { fireDmg: 0, frostDmg: 0, shockDmg: 0, costMult: 1, regenMult: 1, moveSpeed: 0, cdSpeed: 1 };
        if (phase === 'fire') {
            mods.fireDmg = enhanced ? 35 : 25;
            mods.costMult = enhanced ? 1.7 : 1.5;
            mods.regenMult = 0.5;
            mods.moveSpeed = -10;
        } else if (phase === 'frost') {
            mods.frostDmg = 15;
            mods.costMult = 0.7;
            mods.regenMult = 3;
            mods.moveSpeed = 15;
        } else if (phase === 'overload') {
            mods.shockDmg = 25;
            mods.costMult = 1.2;
        } else if (phase === 'arctic') {
            mods.frostDmg = 20;
            mods.cdSpeed = 2;
        }
        return mods;
    };

    function emitPhasePulse(player, phase, g) {
        const monsters = g && g.monsters ? g.monsters : [];
        const radius = 80;
        const atk = magicAtk(player);
        const dmg = Math.max(1, Math.floor(atk * 1.0));
        monsters.forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - player.x, m.y - player.y) > radius) return;
            m.takeDamage(dmg);
            if (typeof window.applyCombatStatus === 'function') {
                if (phase === 'fire' || phase === 'overload') {
                    window.applyCombatStatus(m, 'burn', { durationMs: 3000 }, player, g);
                } else {
                    window.applyCombatStatus(m, 'frostbite', { durationMs: 3000 }, player, g);
                }
            }
        });
        floatText(g, player.x, player.y - 32, '元素脉冲', PHASES[phase] && PHASES[phase].color);
    }

    window.switchElementPhase = function switchElementPhase(player, nextPhase, g, opts) {
        if (!isWizardTree(player) || !nextPhase || !PHASES[nextPhase]) return;
        opts = opts || {};
        const prev = player._elementPhase;
        if (prev === nextPhase && !opts.force) return;
        player._elementPhase = nextPhase;
        player._enhancedFirePhase = !!opts.enhancedFire;
        if (prev && prev !== nextPhase && !opts.skipPulse) {
            emitPhasePulse(player, nextPhase, g);
            if (typeof window.grantSkillResource === 'function') {
                window.grantSkillResource(player, 20);
            }
            player._elementRhythmBonus = true;
        }
        const label = PHASES[nextPhase].name + '相位';
        floatText(g, player.x, player.y - 24, label, PHASES[nextPhase].color);
        if (typeof player.updateStats === 'function') player.updateStats();
    };

    window.toggleElementPhaseOnBlink = function toggleElementPhaseOnBlink(player, g) {
        if (!isWizardTree(player)) return;
        const cur = player._elementPhase || 'frost';
        const next = PHASES[cur] ? PHASES[cur].next : 'fire';
        window.switchElementPhase(player, next, g, { skipPulse: false });
    };

    window.onWizardSkillCastPhase = function onWizardSkillCastPhase(player, skillDef, g) {
        if (!isWizardTree(player) || !skillDef) return;
        const ec = skillDef.entityConfig || {};
        if (ec.skipPhaseSwitch) return;
        const tag = ec.elementTag;
        if (tag === 'fire') {
            window.switchElementPhase(player, 'fire', g, { enhancedFire: !!ec.enhancedFirePhase });
        } else if (tag === 'frost') {
            window.switchElementPhase(player, ec.arcticPhase ? 'arctic' : 'frost', g);
        } else if (tag === 'lightning') {
            window.switchElementPhase(player, 'overload', g);
        }
        if (ec.triggerThermalShock && typeof window.triggerWizardResonance === 'function') {
            const target = g && g.monsters ? g.monsters.find(m => m && m.hp > 0
                && Math.hypot(m.x - player.x, m.y - player.y) < 400) : null;
            if (target) window.triggerWizardResonance(player, target, 'thermal_shock', g);
        }
    };

    window.getWizardSkillDamageMult = function getWizardSkillDamageMult(player, skillDef, monster) {
        if (!isWizardTree(player)) return 1;
        let mult = 1;
        const mods = window.getElementPhaseModifiers(player);
        const tags = (skillDef && skillDef.effectTags) || [];
        const ecTag = skillDef && skillDef.entityConfig && skillDef.entityConfig.elementTag;
        if (tags.includes('burn') || ecTag === 'fire') mult *= 1 + mods.fireDmg / 100;
        if (tags.includes('frostbite') || ecTag === 'frost') mult *= 1 + mods.frostDmg / 100;
        if (tags.includes('shock') || ecTag === 'lightning') mult *= 1 + mods.shockDmg / 100;
        if (player._elementRhythmBonus) {
            mult *= 1.18;
            player._elementRhythmBonus = false;
        }
        if (player._elementLiberationUntil && Date.now() < player._elementLiberationUntil) {
            mult *= 1 + (player._elementLiberationDmg || 50) / 100;
        }
        return mult;
    };

    window.getWizardResourceCostMult = function getWizardResourceCostMult(player) {
        if (!isWizardTree(player)) return 1;
        return window.getElementPhaseModifiers(player).costMult;
    };

    window.getWizardRegenMult = function getWizardRegenMult(player) {
        if (!isWizardTree(player)) return 1;
        return window.getElementPhaseModifiers(player).regenMult;
    };

    window.triggerWizardResonance = function triggerWizardResonance(player, monster, resonanceId, g) {
        if (!player || !monster) return;
        player._resonanceCount = (player._resonanceCount || 0) + 1;
        if (typeof window.grantSkillResource === 'function') {
            window.grantSkillResource(player, 35);
        }
        floatText(g, monster.x, monster.y - 20, '元素共鸣!', '#ffdd44');
        if (resonanceId === 'thermal_shock' && monster.combatStatuses && monster.combatStatuses.burn) {
            const burn = monster.combatStatuses.burn;
            const atk = magicAtk(player);
            const dmg = Math.max(1, Math.floor(atk * 0.2 * 2 * (burn.stacks || 1) * 3));
            monster.takeDamage(dmg);
            if (typeof window.applyMonsterKnockback === 'function') {
                window.applyMonsterKnockback(monster, player.x, player.y, 40);
            }
        }
        if (player._resonanceCount >= 3) {
            window.enterElementLiberation(player, g, 6000, 50, 0.4);
            player._resonanceCount = 0;
        }
    };

    window.enterElementLiberation = function enterElementLiberation(player, g, durMs, dmgBonus, cdReduction) {
        if (!player) return;
        const now = Date.now();
        player._elementLiberationUntil = now + (durMs || 6000);
        player._elementLiberationDmg = dmgBonus != null ? dmgBonus : 50;
        player._elementLiberationCd = cdReduction != null ? cdReduction : 0.4;
        player.buffs = player.buffs || [];
        player.buffs = player.buffs.filter(b => b.id !== 'element_liberation');
        player.buffs.push({
            id: 'element_liberation',
            name: '元素解放',
            expireTime: player._elementLiberationUntil,
            hudVisible: true,
            iconKey: 'damageMultiplier',
            effects: { attackPercent: dmgBonus || 50 }
        });
        floatText(g, player.x, player.y - 36, '元素解放!', '#ffaa00');
        if (typeof player.updateStats === 'function') player.updateStats();
    };

    window.applyElementalLiberationEffect = function applyElementalLiberationEffect(player, skillDef, g, now) {
        const se = skillDef.skillEffect || {};
        if (se.type !== 'elemental_liberation' && se.type !== 'meteor_liberation') return false;
        const count = se.resonanceCount || 2;
        const monsters = g && g.monsters ? g.monsters : [];
        for (let i = 0; i < count && i < monsters.length; i++) {
            const m = monsters[i];
            if (m && m.hp > 0) window.triggerWizardResonance(player, m, 'thermal_shock', g);
        }
        window.enterElementLiberation(player, g, se.durationMs, se.damageBonus, se.cdReduction);
        if (player._elementPhase) {
            player._elementPhase = null;
            player._enhancedFirePhase = false;
        }
        if (se.refreshElementalCooldowns && player.skillCooldowns) {
            Object.keys(player.skillCooldowns).forEach(k => {
                player.skillCooldowns[k] = now;
            });
        }
        return true;
    };

    window.getElementalMasteryBonuses = function getElementalMasteryBonuses(player) {
        if (!player || classId(player) !== 'archmage') return null;
        if (!player._elementLiberationUntil || Date.now() >= player._elementLiberationUntil) return null;
        return { burnTickMult: 2, frostSlowMult: 2, shockSplashMult: 2, name: '元素精通' };
    };

    window.getElementalRhythmPassiveName = function getElementalRhythmPassiveName(player) {
        const id = classId(player);
        if (id === 'wizard') return '元素律动';
        if (id === 'archmage') return '元素精通';
        return null;
    };

    window.tickWizardElementStates = function tickWizardElementStates(player, g, now) {
        if (!isWizardTree(player)) return;
        if (player._elementLiberationUntil && now >= player._elementLiberationUntil) {
            player._elementLiberationUntil = 0;
            player.buffs = (player.buffs || []).filter(b => b.id !== 'element_liberation');
            if (typeof player.updateStats === 'function') player.updateStats();
        }
        const mods = window.getElementPhaseModifiers(player);
        if (mods.moveSpeed) {
            player._phaseMoveSpeed = mods.moveSpeed;
        } else {
            delete player._phaseMoveSpeed;
        }
    };

    window.onWizardChainLightningHit = function onWizardChainLightningHit(player, hitCount) {
        if (!isWizardTree(player) || !hitCount) return;
        const per = 5;
        if (typeof window.grantSkillResource === 'function') {
            window.grantSkillResource(player, per * hitCount);
        }
    };
})();
