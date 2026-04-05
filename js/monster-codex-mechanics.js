/**
 * 怪物图鉴：根据配置生成玩家向的「战斗要点」（口语化、少数值，不写实现细节）
 */
(function () {
    'use strict';

    const RANGED_MONSTER_NAMES = [
        '哥布林萨满', '哥布林斥候', '骷髅弓箭手', '骷髅法师', '兽人萨满', '恶魔术士', '恶魔大法师',
        '灰烬先知', '熵能术士', '星渊法师', '雷纹蝠群', '黑曜喷流', '塔基弩炮'
    ];

    /** 与 game-entities.js 中 getMergedMonsterTrait 一致 */
    function codexMergedTrait(monsterType, field) {
        if (typeof MONSTER_TYPES === 'undefined') return undefined;
        const md = MONSTER_TYPES[monsterType];
        if (!md) return undefined;
        if (md[field] !== undefined && md[field] !== null) return md[field];
        if (md.baseMonster && MONSTER_TYPES[md.baseMonster]) {
            const b = MONSTER_TYPES[md.baseMonster][field];
            if (b !== undefined && b !== null) return b;
        }
        return undefined;
    }

    function g(monsterType, field) {
        return codexMergedTrait(monsterType, field);
    }

    function slowWord(mult) {
        if (mult <= 0.72) return '大幅';
        if (mult <= 0.82) return '明显';
        if (mult <= 0.9) return '中等';
        return '轻微';
    }

    function durationWord(ms) {
        if (ms >= 2400) return '较长一段时间';
        if (ms >= 1500) return '一小会儿';
        return '短暂';
    }

    function moveSpeedWord(mult) {
        if (mult >= 1.12) return '**脚步很快**，喜欢贴脸压迫。';
        if (mult >= 1.04) return '比同类**略快**，注意别被追上。';
        if (mult <= 0.78) return '**走得慢**但通常更硬或更狠，别贪刀。';
        if (mult <= 0.92) return '**略显笨重**，可风筝周旋。';
        return '移速与常见怪物相近。';
    }

    /** 精英技能：只写「是什么、怎么躲、大概多疼」 */
    const ELITE_SKILL_LINES = {
        goblin_elite: [
            '偶尔会**低头蓄力**后直线冲撞，地面有提示时**侧向躲开**；被撞到会吃一发狠的。'
        ],
        goblinWarrior_elite: [
            '会**跳劈**砸向你刚才站的位置，落地附近有震击；躲开落点，注意它可能接普攻。'
        ],
        goblinShaman_elite: [
            '会放**追踪火球**，保持移动或找掩体；有时也会**原地引导**，可趁机输出或拉开。'
        ],
        skeletonKnight_elite: [
            '会**冲锋斩**，沿直线突进，末端伤害很高；看到预警不要站在直线上。'
        ],
        skeletonMage_elite: [
            '会在你脚下或身前引爆**法球**，范围不小；看到读条或光圈**先拉开**。'
        ],
        orcWarrior_elite: [
            '会打**破甲重击**，贴身短爆发；别站桩硬吃，拉开或绕背。'
        ],
        orcWarlord_elite: [
            '会**战吼**强化身边的同伴，优先处理它或把怪拉开。',
            '会挥**重劈**，正面扇形；绕侧输出更安全。'
        ],
        demon_elite: [
            '会**暗影冲锋**，直线高伤；也会**周身爆发**，贴太近容易吃满。'
        ],
        demonImp_elite: [
            '会**连续快攻**多段，别贪刀，拉开等它收招。'
        ],
        demonBoss_elite: [
            '会**践踏**地面，范围大、伤害高，还会让你**跑不动一阵子**。',
            '危急时会**献祭**小怪给自己回血，注意清场或速杀本体。'
        ],
        demonAbyss_elite: [
            '技能与**深渊恶魔精英**同类：直线冲、周身爆，拉开与走位为主。'
        ],
        demonVoid_elite: [
            '技能与**小恶魔精英**同类：快攻连段，保持节奏别硬顶。'
        ],
        demonTyrant_elite: [
            '技能与**恶魔领主精英**同类：大圈践踏 + 献祭回血，优先走位与集火。'
        ],
        crystalColossus_elite: [
            '会**冲锋斩**，与骷髅骑士精英类似，直线预警后躲开。'
        ],
        sporeHorror_elite: [
            '会引爆**法球**，与骷髅法师精英类似，注意脚下范围。'
        ],
        rustChain_elite: [
            '会**破甲重击**，与兽人勇士精英类似，避免贴身站桩。'
        ]
    };

    function pushTraitLines(type, lines) {
        if (!MONSTER_TYPES[type]) return;

        const msm = g(type, 'moveSpeedMult');
        if (typeof msm === 'number' && msm > 0 && isFinite(msm) && Math.abs(msm - 1) > 0.001) {
            lines.push(moveSpeedWord(msm));
        }

        const ohs = g(type, 'onHitPlayerSlow');
        if (ohs && typeof ohs.multiplier === 'number' && typeof ohs.durationMs === 'number') {
            lines.push(
                '被打中会**拖慢你的脚步**（' + slowWord(ohs.multiplier) + '），持续约 **' + durationWord(ohs.durationMs) + '**。'
            );
        }

        const omsc = g(type, 'onMeleeSlowChance');
        if (omsc && typeof omsc.chance === 'number' && typeof omsc.multiplier === 'number' && typeof omsc.durationMs === 'number') {
            const ch = omsc.chance >= 0.25 ? '较常' : '有时';
            lines.push(
                '近战挨刀时**' + ch + '触发减速**，整体会让你**不好走位**，别被围殴。'
            );
        }

        const lsRaw = g(type, 'onHitLifeStealRatio');
        if (typeof lsRaw === 'number' && lsRaw > 0) {
            lines.push('打中你会**吸血续命**，持久战对它有利，尽量速战速决。');
        }

        const brHp = g(type, 'berserkHpRatio');
        const brCd = g(type, 'berserkCooldownMult');
        if (typeof brHp === 'number' && typeof brCd === 'number' && brHp > 0 && brHp < 1 && brCd > 0 && brCd < 1) {
            lines.push('**血量压低**后会**越打越快**，残血阶段别大意。');
        }

        const kb = g(type, 'knockbackOnHit');
        if (kb && typeof kb.force === 'number' && kb.force > 0) {
            lines.push('近战命中会**把你推开**，注意别被顶进死角或毒圈里。');
        }

        const fhb = g(type, 'firstHitBonusMult');
        if (typeof fhb === 'number' && fhb > 1) {
            lines.push('**第一次**打中你时格外疼，开场别硬接，先看清招式。');
        }

        const gbd = g(type, 'goldBonusOnDeath');
        if (typeof gbd === 'number' && gbd > 0) {
            lines.push('击杀后**额外掉落约 ' + Math.floor(gbd) + ' 金币**。');
        }

        const rrm = g(type, 'rangedRangeMult');
        if (typeof rrm === 'number' && rrm > 0 && isFinite(rrm) && Math.abs(rrm - 1) > 0.001) {
            if (rrm > 1) lines.push('**射得更远**，别指望拉开一点就安全。');
            else lines.push('**射程偏短**，可适当拉开距离周旋。');
        }

        const dh = g(type, 'deathHazard');
        if (dh && typeof dh.radius === 'number' && typeof dh.durationMs === 'number' && typeof dh.dps === 'number') {
            lines.push('死后会在地上留**一片持续伤害**，别站在尸体附近贪拾取。');
        }

        const ss = g(type, 'standingShell');
        if (ss && typeof ss.stillMs === 'number' && typeof ss.maxStacks === 'number' && typeof ss.drPerStack === 'number') {
            lines.push('**站定不动**会逐渐变硬，适合**逼它移动**或爆发破层。');
        }

        const cm = g(type, 'comboMelee');
        if (cm && cm.every >= 2 && typeof cm.weakMult === 'number' && typeof cm.strongMult === 'number') {
            lines.push('近战有**固定节奏**：几下轻招后会接一记**重的**，看清轮次再反打。');
        }

        const tr = g(type, 'trailHazard');
        if (tr && tr.radius > 0 && tr.durationMs > 0 && typeof tr.dps === 'number' && tr.emitIntervalMs > 0) {
            lines.push('移动路径上会**留下有害痕迹**，绕开轨迹，别在酸液里站桩。');
        }

        const sb = g(type, 'suicideBomb');
        if (sb && sb.hpRatio > 0 && sb.fuseMs > 0 && sb.radius > 0 && typeof sb.damageMult === 'number') {
            lines.push('**快死**时可能**自爆**，看到异常动作**立刻拉开**。');
        }

        const bk = g(type, 'blinkEscape');
        if (bk && bk.hpRatio > 0 && bk.cooldownMs > 0) {
            lines.push('**血量危险**时会**闪走拉开距离**，别追太深被反打。');
        }

        const ps = g(type, 'periodicShield');
        if (ps && ps.periodMs > 0 && ps.shieldDurationMs > 0 && typeof ps.damageTakenMult === 'number') {
            lines.push('会周期性**变硬减伤**，可等窗口再灌伤害，别在铁壁上浪费技能。');
        }

        const orb = g(type, 'aoeOrbRanged');
        if (orb && orb.radius > 0 && orb.telegraphMs > 0 && typeof orb.damageMult === 'number') {
            lines.push('远程会在你附近落**范围爆炸**，看到预警**先走开**。');
        }

        const rv = g(type, 'rangedVolley');
        if (rv && rv.extraShots > 0 && rv.delayMs >= 0 && typeof rv.damageMult === 'number') {
            lines.push('一**轮射击会带多发**，别躲过一枪就松懈，连续走位。');
        }

        const sa = g(type, 'silenceAura');
        if (sa && sa.range > 0 && typeof sa.playerAttackCdMult === 'number' && sa.playerAttackCdMult >= 1) {
            lines.push('靠近会**拖慢你的普攻节奏**，可拉开再打，或改用不依赖攻速的手段。');
        }

        const sshr = g(type, 'startingShieldHpRatio');
        if (typeof sshr === 'number' && sshr > 0) {
            lines.push('开场带**护盾**，建议先**破盾**再打本体。');
            const ob = g(type, 'onShieldBroken');
            if (ob && ob.vulnerableMs > 0 && typeof ob.damageTakenMult === 'number') {
                lines.push('盾碎后**一小段时间更脆**，可趁机集火。');
            }
        }

        const tsb = g(type, 'twinSoulBond');
        if (tsb && typeof tsb.tag === 'string' && tsb.tag.length > 0) {
            lines.push('与同场**成对的另一只**共享生命，要**一起打死**才算数。');
        }

        const sc = g(type, 'soulCircleCaster');
        if (sc && sc.periodMs > 0 && sc.radius > 0 && sc.durationMs > 0 && typeof sc.healPerTick === 'number' && sc.healIntervalMs > 0 && typeof sc.slowMult === 'number' && sc.slowDurationMs > 0) {
            lines.push('脚下会开**法阵**：阵里**走得慢**，还会**给同伴回血**；尽量**拉出阵外**再打。');
        }

        const ap = g(type, 'apostateStance');
        if (ap && ap.switchMs > 0 && typeof ap.blessingDamageTakenMult === 'number' && typeof ap.judgmentOutDamageMult === 'number') {
            lines.push('会在**「更扛打」**和**「更疼」**两种姿态间切换，注意节奏，别在错的时间硬换血。');
        }

        const ad = g(type, 'allyDamageAura');
        if (ad && ad.range > 0 && typeof ad.multiplier === 'number' && ad.multiplier >= 1) {
            lines.push('身边的**小怪会变猛**，能**先点掉它**或把小怪拉远再打。');
        }

        const pw = g(type, 'pendulumSweep');
        if (pw && pw.telegraphMs > 0 && pw.cooldownMs > 0 && pw.range > 0 && typeof pw.halfArcRad === 'number' && typeof pw.damageMult === 'number') {
            lines.push('会扫**扇形大挥击**，地面有预警时**撤到扇形外**或绕背。');
        }
    }

    function markdownBoldToHtml(s) {
        return String(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }

    window.buildMonsterCodexMechanicsHtml = function (monsterType) {
        if (typeof MONSTER_TYPES === 'undefined') return '';
        const data = MONSTER_TYPES[monsterType];
        if (!data) return '';

        const lines = [];
        const name = data.name || '';

        pushTraitLines(monsterType, lines);

        if (RANGED_MONSTER_NAMES.includes(name)) {
            lines.push('**远程**：习惯**站定了再射**，别直线猛冲，用走位和掩体接近。');
        }

        const isElite = !!(data.isElite || (typeof monsterType === 'string' && monsterType.endsWith('_elite')));
        if (isElite) {
            lines.push('**精英**：只在**精英房**出现，比同类**更敏捷、招式更花**，多观察预警再出手。');
            const eliteSkills = ELITE_SKILL_LINES[monsterType];
            if (eliteSkills && eliteSkills.length) {
                lines.push('—— 精英招式 ——');
                eliteSkills.forEach((t) => lines.push(t));
            }
        }

        if (lines.length === 0) return '';

        const inner = lines
            .map((t) => '<li style="margin-bottom:6px;line-height:1.45;">' + markdownBoldToHtml(t) + '</li>')
            .join('');
        return (
            '<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.15);">' +
            '<p style="color:#9cf;margin:0 0 8px 0;font-size:14px;"><strong>战斗要点</strong></p>' +
            '<ul style="margin:0;padding-left:20px;color:#ccc;font-size:13px;">' +
            inner +
            '</ul></div>'
        );
    };
})();
