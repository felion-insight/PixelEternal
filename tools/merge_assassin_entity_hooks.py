#!/usr/bin/env python3
"""Merge assassin entity hooks from pre-restore backup into HEAD-restored skill-entity-system.js."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'js' / 'skill-entity-system.js'
BACKUP = ROOT / '.restore-backup' / 'skill-entity-system.js'


def extract_assassin_helpers(backup_text: str) -> str:
    parts = []
    for sig in (
        '    function isClassBasicSkill(',
        '    function distPointToSegment(',
    ):
        start = backup_text.find(sig)
        end = backup_text.find('\n    function ', start + 1)
        if start >= 0 and end > start:
            parts.append(backup_text[start:end].rstrip())
    start = backup_text.find('    function applyInstantSkillSingleHit(')
    end = backup_text.find('    function applyChargeHitDamage(', start)
    if start < 0 or end < 0:
        raise SystemExit('Could not locate assassin helper block in backup')
    parts.append(backup_text[start:end].rstrip())
    return '\n\n'.join(parts) + '\n\n'


def main():
    target = TARGET.read_text(encoding='utf-8')
    backup = BACKUP.read_text(encoding='utf-8')
    block = extract_assassin_helpers(backup)

    if 'getDeadeyeMarkDamageMultiplier' not in target:
        raise SystemExit('Expected HEAD warrior/archer skill-entity-system.js; run git checkout HEAD first')

    needle = """        if (typeof window.getStrikerDamageBonus === 'function') {
            const sm = window.getStrikerDamageBonus(player, monster);
            dmg = sanitizeSkillDamage(dmg * (Number.isFinite(sm) ? sm : 1));
        }
        if (typeof window.getBuildDamageMultiplier === 'function') {"""
    insert = """        if (typeof window.getStrikerDamageBonus === 'function') {
            const sm = window.getStrikerDamageBonus(player, monster);
            dmg = sanitizeSkillDamage(dmg * (Number.isFinite(sm) ? sm : 1));
        }
        if (typeof window.getAssassinSkillDamageMult === 'function') {
            const am = window.getAssassinSkillDamageMult(player, skillDef, monster);
            dmg = sanitizeSkillDamage(dmg * (Number.isFinite(am) ? am : 1));
        }
        if (typeof window.getBuildDamageMultiplier === 'function') {"""
    if 'getAssassinSkillDamageMult' not in target and needle in target:
        target = target.replace(needle, insert, 1)

    needle = """        if (typeof window.getDeadeyeMarkCritDmgBonus === 'function') {
            extra += window.getDeadeyeMarkCritDmgBonus(monster, player);
        }
        if (typeof window.getPlayerPrecisionCritDmgBonus === 'function') {"""
    insert = """        if (typeof window.getDeadeyeMarkCritDmgBonus === 'function') {
            extra += window.getDeadeyeMarkCritDmgBonus(monster, player);
        }
        if (typeof window.getAssassinCritDmgBonus === 'function') {
            extra += window.getAssassinCritDmgBonus(player, monster);
        }
        if (typeof window.getPlayerPrecisionCritDmgBonus === 'function') {"""
    if 'getAssassinCritDmgBonus' not in target and needle in target:
        target = target.replace(needle, insert, 1)

    needle = """        if (c.fearRadiusOnKill && c.fearMsOnKill) {
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0 || m === killedMonster) return;
                if (Math.hypot(m.x - killedMonster.x, m.y - killedMonster.y) <= c.fearRadiusOnKill) {
                    applyCcEffects(m, now, { fearMs: c.fearMsOnKill }, g);
                }
            });
        }
    }

    function healPlayerPercent"""
    insert = """        if (c.fearRadiusOnKill && c.fearMsOnKill) {
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0 || m === killedMonster) return;
                if (Math.hypot(m.x - killedMonster.x, m.y - killedMonster.y) <= c.fearRadiusOnKill) {
                    applyCcEffects(m, now, { fearMs: c.fearMsOnKill }, g);
                }
            });
        }
        if (c.chainOnKill && c.chainOnKill > 0
            && typeof window.triggerAssassinChainOnKill === 'function') {
            window.triggerAssassinChainOnKill(
                player, skillDef, { entityConfig: c }, g, monsters, now, killedMonster, c.chainOnKill - 1
            );
        }
    }

    function healPlayerPercent"""
    if 'chainOnKill' not in target and needle in target:
        target = target.replace(needle, insert, 1)

    if 'applyInstantSkillSingleHit' not in target:
        target = target.replace('\n    function healPlayerPercent', '\n' + block + '\n    function healPlayerPercent', 1)

    if 'offerShadowRaidReturn' not in target:
        target = target.replace(
            '        ch.active = false;\n\n        const finish = c.endFinish',
            '        ch.active = false;\n\n        if (!ch.multiDash) {\n'
            '            offerShadowRaidReturn(ch, g, now);\n'
            '            scheduleShadowRaidAutoReturn(ch, g, monsters, now);\n'
            '        }\n\n        const finish = c.endFinish',
            1,
        )

    if "c.type === 'shadow_dance'" not in target:
        target = target.replace(
            """    function execCharge(player, skillDef, ec, g, monsters, now, angle) {
        const c = ec.entityConfig;
        const st = ensureState(g);
        const baseSpeed = c.speed || 450;""",
            """    function execCharge(player, skillDef, ec, g, monsters, now, angle) {
        const c = ec.entityConfig;
        const st = ensureState(g);
        const isMultiDash = c.type === 'shadow_dance'
            || (c.dashCount > 1 && c.dashDamage && c.dashDamage.length > 1);
        if (isMultiDash) {
            const dashCount = c.dashCount || 3;
            const dashDamage = c.dashDamage || [1.5, 1.875, 2.34];
            const dashRange = c.dashRange || 130;
            st.charges.push({
                player, skillDef, ec,
                angle,
                startX: player.x,
                startY: player.y,
                speed: c.speed || 680,
                baseSpeed: c.speed || 680,
                radius: c.collisionRadius || 30,
                superArmor: !!c.superArmor,
                multiDash: true,
                dashIndex: 0,
                dashCount,
                dashDamage,
                dashRange,
                dashIntervalMs: c.dashIntervalMs || 150,
                dashWaitUntil: 0,
                dashPhase: 'moving',
                traveled: 0,
                maxDist: dashRange,
                damage: calcDmg(player, skillDef, c, dashDamage[0]),
                hitIds: new Set(),
                stopOnFirstHit: false,
                active: true
            });
            player.isDashing = true;
            player.isCastingSkill = false;
            player._chargeSuperArmor = !!c.superArmor;
            if (c.dashInvincibilityMs) {
                player.invincibleUntil = now + c.dashInvincibilityMs;
            }
            floatText(g, player.x, player.y - 20, skillDef.name, '#ff8844');
            if (typeof window.playAssassinSkillVfx === 'function') {
                window.playAssassinSkillVfx(player, skillDef, g, { chargeStart: true, angle, dashIndex: 0, dashTotal: dashCount });
            }
            return;
        }
        const baseSpeed = c.speed || 450;""",
            1,
        )

    if "c.type === 'multi_strike'" not in target:
        target = target.replace(
            """        const originX = player.x;
        const originY = player.y;

        if (c.shape === 'pierce'""",
            """        const originX = player.x;
        const originY = player.y;

        if (c.type === 'multi_strike' && typeof window.resolveAssassinMultiStrike === 'function') {
            return window.resolveAssassinMultiStrike(player, skillDef, ec, g, monsters, now);
        }

        if (c.shape === 'pierce'""",
            1,
        )

    if 'tickAssassinMultiStrikes' not in target:
        target = target.replace(
            """        if (pLeap && typeof window.tickWarlockSoulStates === 'function') {
            window.tickWarlockSoulStates(pLeap, gameInstance, monsters, now);
        }

        // Projectiles""",
            """        if (pLeap && typeof window.tickWarlockSoulStates === 'function') {
            window.tickWarlockSoulStates(pLeap, gameInstance, monsters, now);
        }
        if (typeof window.tickAssassinMultiStrikes === 'function') {
            window.tickAssassinMultiStrikes(gameInstance, monsters, now);
        }
        if (st.pendingShadowReturns && st.pendingShadowReturns.length) {
            tickPendingShadowReturns(st, gameInstance, monsters, now);
        }

        // Projectiles""",
            1,
        )

    TARGET.write_text(target, encoding='utf-8')
    print('Merged assassin hooks cleanly into js/skill-entity-system.js')


if __name__ == '__main__':
    main()
