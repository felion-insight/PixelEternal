/**
 * 程序化武器精炼机制。
 * 3 星解锁核心玩法，5 星解锁进阶效果；状态只依赖当前 weaponType/refineLevel。
 */
(function () {
    'use strict';

    const MECHANICS = {
        sword: {
            core: { id: 'sword_combo_wave', name: '剑势', description: '普攻命中积累剑势，第3击额外造成35%攻击力剑气伤害。' },
            capstone: { id: 'sword_echo', name: '回响斩', description: '武器技能命中后追加一次45%攻击力回响斩。' }
        },
        axe: {
            core: { id: 'axe_bleed', name: '裂伤', description: '普攻施加裂伤，立即追加12%攻击力伤害，可叠3层。' },
            capstone: { id: 'axe_execute', name: '断首', description: '武器技能对生命低于35%的目标额外造成45%攻击力伤害。' }
        },
        hammer: {
            core: { id: 'hammer_stagger', name: '震荡', description: '第4次普攻释放30%攻击力震荡波。' },
            capstone: { id: 'hammer_aftershock', name: '余震', description: '武器技能产生60%攻击力余震并短暂定身。' }
        },
        spear: {
            core: { id: 'spear_reach', name: '枪芒', description: '攻击60距离外的目标时伤害提高20%。' },
            capstone: { id: 'spear_vulnerability', name: '破阵', description: '武器技能使命中目标易伤，下一次普攻额外提高30%。' }
        },
        bow: {
            core: { id: 'bow_split', name: '分裂箭', description: '每第3次普攻向附近另一目标追加25%攻击力射击。' },
            capstone: { id: 'bow_hunters_mark', name: '猎手标记', description: '武器技能标记目标5秒，对其伤害提高20%。' }
        },
        crossbow: {
            core: { id: 'crossbow_pierce', name: '重矢破甲', description: '每第2次普攻造成额外18%攻击力穿透伤害。' },
            capstone: { id: 'crossbow_ricochet', name: '弹射弩矢', description: '武器技能向最多2个附近目标弹射35%攻击力伤害。' }
        },
        longbow: {
            core: { id: 'longbow_focus', name: '远距蓄势', description: '距离超过150时普攻伤害提高25%。' },
            capstone: { id: 'longbow_headshot', name: '爆头', description: '武器技能对满血目标额外造成60%攻击力伤害。' }
        },
        shortbow: {
            core: { id: 'shortbow_tempo', name: '疾射节奏', description: '连续普攻积累节奏，5层时追加40%攻击力伤害。' },
            capstone: { id: 'shortbow_barrage', name: '箭雨连射', description: '武器技能消耗节奏，对周围目标各追加30%攻击力伤害。' }
        },
        staff: {
            core: { id: 'staff_attunement', name: '元素调谐', description: '释放职业技能切换元素，下一次普攻追加20%法强元素伤害。' },
            capstone: { id: 'staff_echo', name: '法术回响', description: '武器技能追加50%法强回响伤害。' }
        },
        book: {
            core: { id: 'book_pages', name: '秘典编页', description: '连续释放不同技能积累书页，3页时强化下一次武器技能40%。' },
            capstone: { id: 'book_finale', name: '终章', description: '消耗3页后立即返还25%武器技能冷却。' }
        },
        orb: {
            core: { id: 'orb_satellites', name: '环绕法球', description: '释放职业技能生成法球，最多3枚；普攻消耗1枚追加18%法强伤害。' },
            capstone: { id: 'orb_detonation', name: '星环引爆', description: '武器技能引爆全部法球，每枚造成25%法强范围伤害。' }
        },
        rune: {
            core: { id: 'rune_charge', name: '符印充能', description: '释放职业技能获得符印，3层时下一次普攻造成35%法强伤害。' },
            capstone: { id: 'rune_resonance', name: '三重共鸣', description: '武器技能消耗符印，按层数追加20%法强范围伤害。' }
        },
        dagger: {
            core: { id: 'dagger_backstab', name: '背刺印记', description: '从目标背后攻击时伤害提高25%并留下印记。' },
            capstone: { id: 'dagger_execute', name: '影杀', description: '武器技能对低于30%生命的目标额外造成55%攻击力伤害。' }
        },
        claw: {
            core: { id: 'claw_frenzy', name: '撕裂连段', description: '连续命中叠加撕裂，第4击追加35%攻击力伤害。' },
            capstone: { id: 'claw_feast', name: '鲜血狂袭', description: '触发撕裂时回复2%最大生命。' }
        },
        shortblade: {
            core: { id: 'shortblade_afterimage', name: '残影', description: '闪避后下一次普攻必定暴击。' },
            capstone: { id: 'shortblade_counter', name: '瞬身反击', description: '消耗残影时追加45%攻击力伤害。' }
        },
        chainblade: {
            core: { id: 'chainblade_bind', name: '链缚', description: '武器技能使命中目标受到伤害提高15%，持续4秒。' },
            capstone: { id: 'chainblade_burst', name: '绞杀爆裂', description: '武器技能对链缚目标周围追加50%攻击力范围伤害。' }
        }
    };

    function weapon(player) {
        return player && player.equipment && player.equipment.weapon;
    }

    function typeOf(item) {
        return item && (item.weaponType || item.baseTypeId);
    }

    function active(player, level) {
        const item = weapon(player);
        const type = typeOf(item);
        return !!item && (item.refineLevel || 0) >= level && !!MECHANICS[type];
    }

    function state(player) {
        if (!player) return null;
        const item = weapon(player);
        const signature = item ? `${item.id}|${typeOf(item)}|${item.refineLevel || 0}` : 'none';
        if (!player._weaponRefinementState || player._weaponRefinementState.signature !== signature) {
            player._weaponRefinementState = {
                signature,
                counters: Object.create(null),
                flags: Object.create(null),
                marks: new WeakMap(),
                lastSkillIds: []
            };
        }
        return player._weaponRefinementState;
    }

    function attackStat(player) {
        const item = weapon(player);
        const magic = ['staff', 'book', 'orb', 'rune'].includes(typeOf(item));
        return Math.max(1, magic
            ? (player.baseMagicAttack || player.baseAttack || 1)
            : (player.baseAttack || 1));
    }

    function targets(player) {
        const game = player && player.gameInstance;
        return game && typeof game.getCurrentSceneTargets === 'function'
            ? game.getCurrentSceneTargets().filter(target => target && target.hp > 0) : [];
    }

    function deal(player, target, multiplier, label) {
        if (!target || multiplier <= 0) return 0;
        const amount = Math.max(1, Math.floor(attackStat(player) * multiplier));
        if (typeof player.damageMonsterFromEnvironment === 'function') {
            player.damageMonsterFromEnvironment(target, amount);
        } else if (typeof target.takeDamage === 'function') {
            target.takeDamage(amount);
        }
        const game = player.gameInstance;
        if (game && typeof game.addFloatingText === 'function') {
            game.addFloatingText(target.x, target.y, `${label} ${amount}`, '#ffd27a', 1100, 14, true);
        }
        return amount;
    }

    function burst(player, target, family, radius) {
        const game = player && player.gameInstance;
        if (!game || typeof game.addEquipmentEffect !== 'function') return;
        const anchor = target || player;
        game.addEquipmentEffect('refine_mechanic', anchor.x, anchor.y, {
            family,
            radius: radius || 70,
            duration: 650,
            angle: player.angle || 0
        });
    }

    function signal(effectId, detail) {
        const metrics = window.EquipmentLabMetrics;
        if (metrics && typeof metrics.recordEffect === 'function') {
            metrics.recordEffect(effectId, detail);
        }
    }

    function nearestOthers(player, target, count, radius) {
        return targets(player)
            .filter(candidate => candidate !== target
                && Math.hypot(candidate.x - target.x, candidate.y - target.y) <= radius)
            .slice(0, count);
    }

    const api = {
        getMechanics() {
            return MECHANICS;
        },

        getMechanic(weaponType) {
            return MECHANICS[weaponType] || null;
        },

        resolveCapstone(item) {
            const resonance = window.WeaponRefinementResonance
                && window.WeaponRefinementResonance.resolve(item);
            if (resonance) {
                return Object.assign({ source: resonance.sourceType, isResonance: true }, resonance);
            }
            const mechanics = MECHANICS[typeOf(item)];
            return mechanics && mechanics.capstone
                ? Object.assign({ source: 'weaponType', isResonance: false }, mechanics.capstone)
                : null;
        },

        getResolvedMechanics(item) {
            const mechanics = MECHANICS[typeOf(item)] || null;
            return mechanics ? {
                core: mechanics.core,
                capstone: api.resolveCapstone(item)
            } : null;
        },

        reset(player) {
            if (player) delete player._weaponRefinementState;
            if (window.WeaponRefinementResonance) {
                window.WeaponRefinementResonance.reset(player);
            }
        },

        tick(player) {
            if (!active(player, 3)) return;
            state(player);
            if (window.WeaponRefinementResonance) {
                window.WeaponRefinementResonance.tick(player);
            }
        },

        modifyBasicAttack(player, target, context) {
            const result = Object.assign({}, context || {});
            if (!active(player, 3) || !target) return result;
            const item = weapon(player);
            const type = typeOf(item);
            const s = state(player);
            const distance = Math.hypot(target.x - player.x, target.y - player.y);
            if (type === 'spear' && distance > 60) {
                result.damage *= 1.2;
                signal('weapon_spear_3', { distance });
            }
            if (type === 'longbow' && distance > 150) {
                result.damage *= 1.25;
                signal('weapon_longbow_3', { distance });
            }
            if (type === 'bow' && (s.marks.get(target) || 0) > Date.now()) {
                result.damage *= 1.2;
                signal('weapon_bow_5', { mode: 'marked_target' });
            }
            if (type === 'dagger' && typeof target.angle === 'number') {
                const fromTarget = Math.atan2(player.y - target.y, player.x - target.x);
                let diff = Math.abs(fromTarget - target.angle);
                while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
                if (diff > Math.PI * 0.66) {
                    result.damage *= 1.25;
                    s.marks.set(target, Date.now() + 4000);
                    signal('weapon_dagger_3', { mode: 'backstab' });
                }
            }
            if (type === 'spear' && s.marks.get(target) > Date.now()) {
                result.damage *= 1.3;
                s.marks.delete(target);
                signal('weapon_spear_5', { mode: 'vulnerability' });
            }
            if (type === 'chainblade' && s.marks.get(target) > Date.now()) {
                result.damage *= 1.15;
                signal('weapon_chainblade_3', { mode: 'bound' });
            }
            if (type === 'shortblade' && s.flags.afterimage) {
                result.isCrit = true;
                const hasIdentity = window.WeaponRefinementResonance
                    && window.WeaponRefinementResonance.resolve(item);
                if (active(player, 5) && !hasIdentity) {
                    result.damage *= 1.45;
                    signal(`weapon_${type}_5`, { mode: 'counter' });
                }
                s.flags.afterimage = false;
                burst(player, target, 'shortblade');
            }
            return window.WeaponRefinementResonance
                ? window.WeaponRefinementResonance.modifyBasicAttack(player, target, result)
                : result;
        },

        afterBasicAttack(player, target, context) {
            if (!active(player, 3) || !target) return;
            const type = typeOf(weapon(player));
            const s = state(player);
            const increment = key => (s.counters[key] = (s.counters[key] || 0) + 1);
            if (type === 'sword' && increment('sword') >= 3) {
                s.counters.sword = 0;
                deal(player, target, 0.35, '剑气');
                burst(player, target, type);
                signal(`weapon_${type}_3`);
            } else if (type === 'axe') {
                const stacks = Math.min(3, increment('axe'));
                deal(player, target, 0.12 * stacks, `裂伤×${stacks}`);
                if (stacks >= 3) s.counters.axe = 0;
                signal(`weapon_${type}_3`, { stacks });
            } else if (type === 'hammer' && increment('hammer') >= 4) {
                s.counters.hammer = 0;
                targets(player).filter(t => Math.hypot(t.x - target.x, t.y - target.y) <= 100)
                    .forEach(t => deal(player, t, 0.3, '震荡'));
                burst(player, target, type, 100);
                signal(`weapon_${type}_3`);
            } else if (type === 'bow' && increment('bow') >= 3) {
                s.counters.bow = 0;
                nearestOthers(player, target, 1, 180).forEach(t => deal(player, t, 0.25, '分裂箭'));
                burst(player, target, type);
                signal(`weapon_${type}_3`);
            } else if (type === 'crossbow' && increment('crossbow') >= 2) {
                s.counters.crossbow = 0;
                deal(player, target, 0.18, '破甲矢');
                signal(`weapon_${type}_3`);
            } else if (type === 'shortbow' && increment('shortbow') >= 5) {
                s.counters.shortbow = 0;
                deal(player, target, 0.4, '疾射');
                burst(player, target, type);
                signal(`weapon_${type}_3`);
            } else if (type === 'staff' && s.counters.attunement > 0) {
                s.counters.attunement--;
                deal(player, target, 0.2, '元素');
                burst(player, target, type);
                signal(`weapon_${type}_3`);
            } else if (type === 'orb' && s.counters.orbs > 0) {
                s.counters.orbs--;
                deal(player, target, 0.18, '法球');
                burst(player, target, type);
                signal(`weapon_${type}_3`);
            } else if (type === 'rune' && s.counters.runes >= 3) {
                s.counters.runes = 0;
                deal(player, target, 0.35, '符印');
                burst(player, target, type);
                signal(`weapon_${type}_3`);
            } else if (type === 'claw' && increment('claw') >= 4) {
                s.counters.claw = 0;
                deal(player, target, 0.35, '撕裂');
                const hasIdentity = window.WeaponRefinementResonance
                    && window.WeaponRefinementResonance.resolve(weapon(player));
                if (active(player, 5) && !hasIdentity) {
                    const heal = Math.max(1, Math.floor(player.maxHp * 0.02));
                    if (typeof player.heal === 'function') player.heal(heal);
                    else player.hp = Math.min(player.maxHp, player.hp + heal);
                    signal(`weapon_${type}_5`, { heal });
                }
                burst(player, target, type);
                signal(`weapon_${type}_3`);
            }
            if (window.WeaponRefinementResonance) {
                window.WeaponRefinementResonance.afterBasicAttack(player, target, context);
            }
        },

        onDodge(player) {
            if (!active(player, 3)) return;
            if (typeOf(weapon(player)) === 'shortblade') {
                state(player).flags.afterimage = true;
                signal('weapon_shortblade_3', { mode: 'armed' });
            }
            if (window.WeaponRefinementResonance) {
                window.WeaponRefinementResonance.onDodge(player);
            }
        },

        onSkillCast(player, skillDef) {
            if (!active(player, 3) || !skillDef) return;
            const type = typeOf(weapon(player));
            const s = state(player);
            if (type === 'staff') {
                s.counters.attunement = Math.min(3, (s.counters.attunement || 0) + 1);
                signal('weapon_staff_3', { stacks: s.counters.attunement });
            } else if (type === 'book') {
                const id = skillDef.id || skillDef.name;
                s.lastSkillIds = s.lastSkillIds.filter(value => value !== id);
                s.lastSkillIds.push(id);
                if (s.lastSkillIds.length > 3) s.lastSkillIds.shift();
                if (s.lastSkillIds.length === 3) {
                    s.flags.finale = true;
                    signal('weapon_book_3');
                }
            } else if (type === 'orb') {
                s.counters.orbs = Math.min(3, (s.counters.orbs || 0) + 1);
                signal('weapon_orb_3', { stacks: s.counters.orbs });
            } else if (type === 'rune') {
                s.counters.runes = Math.min(3, (s.counters.runes || 0) + 1);
                signal('weapon_rune_3', { stacks: s.counters.runes });
            }
            if (window.WeaponRefinementResonance) {
                window.WeaponRefinementResonance.onSkillCast(player, skillDef);
            }
        },

        afterDamage(player, attacker, actualDamage) {
            if (window.WeaponRefinementResonance) {
                window.WeaponRefinementResonance.afterDamage(player, attacker, actualDamage);
            }
        },

        onKill(player, monster) {
            if (window.WeaponRefinementResonance) {
                window.WeaponRefinementResonance.onKill(player, monster);
            }
        },

        onWeaponSkill(player, item, hitTargets) {
            if (!active(player, 3) || !item) return;
            const type = typeOf(item);
            const s = state(player);
            const list = (hitTargets || targets(player)).filter(target => target && target.hp > 0);
            const primary = list[0] || targets(player)[0];
            if (!primary) return;
            if (type === 'chainblade') {
                s.marks.set(primary, Date.now() + 4000);
                signal('weapon_chainblade_3', { mode: 'bind' });
                if (!active(player, 5)) {
                    burst(player, primary, type, 90);
                    return;
                }
            }
            if (!active(player, 5)) return;
            if (window.WeaponRefinementResonance
                && window.WeaponRefinementResonance.resolve(item)) {
                window.WeaponRefinementResonance.onWeaponSkill(player, item, list);
                return;
            }
            if (type === 'sword') deal(player, primary, 0.45, '回响斩');
            else if (type === 'axe') {
                if (!(primary.maxHp > 0 && primary.hp / primary.maxHp < 0.35)) return;
                deal(player, primary, 0.45, '断首');
            }
            else if (type === 'hammer') {
                targets(player).filter(t => Math.hypot(t.x - primary.x, t.y - primary.y) <= 110)
                    .forEach(t => {
                        deal(player, t, 0.6, '余震');
                        t.frozenUntil = Math.max(t.frozenUntil || 0, Date.now() + 900);
                    });
            } else if (type === 'spear') s.marks.set(primary, Date.now() + 5000);
            else if (type === 'bow') s.marks.set(primary, Date.now() + 5000);
            else if (type === 'crossbow') nearestOthers(player, primary, 2, 190).forEach(t => deal(player, t, 0.35, '弹射'));
            else if (type === 'longbow') {
                if (primary.hp < primary.maxHp) return;
                deal(player, primary, 0.6, '爆头');
            }
            else if (type === 'shortbow') targets(player).slice(0, 4).forEach(t => deal(player, t, 0.3, '连射'));
            else if (type === 'staff') deal(player, primary, 0.5, '法术回响');
            else if (type === 'book') {
                if (!s.flags.finale) return;
                deal(player, primary, 0.4, '终章');
                player.weaponSkillCooldown = Math.max(Date.now(), player.weaponSkillCooldown - (item.skill.cooldown || 8000) * 0.25);
                s.flags.finale = false;
            } else if (type === 'orb') {
                const count = Math.max(1, s.counters.orbs || 0);
                targets(player).filter(t => Math.hypot(t.x - primary.x, t.y - primary.y) <= 120)
                    .forEach(t => deal(player, t, 0.25 * count, `法球×${count}`));
                s.counters.orbs = 0;
            } else if (type === 'rune') {
                const count = Math.max(1, s.counters.runes || 0);
                targets(player).filter(t => Math.hypot(t.x - primary.x, t.y - primary.y) <= 120)
                    .forEach(t => deal(player, t, 0.2 * count, `共鸣×${count}`));
                s.counters.runes = 0;
            } else if (type === 'dagger') {
                if (!(primary.maxHp > 0 && primary.hp / primary.maxHp < 0.3)) return;
                deal(player, primary, 0.55, '影杀');
            }
            else if (type === 'chainblade') {
                targets(player).filter(t => Math.hypot(t.x - primary.x, t.y - primary.y) <= 120)
                    .forEach(t => deal(player, t, 0.5, '绞杀'));
            }
            burst(player, primary, type, 105);
            signal(`weapon_${type}_5`);
        }
    };

    window.WeaponRefinementSystem = api;
})();
