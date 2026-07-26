/**
 * Auto-battler 回归：RunState 技能进度（等级扩池 / 升星 / 转职池）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

global.window = global;
window.CONFIG = {
    AUTO_BATTLER_CONFIG: JSON.parse(
        fs.readFileSync(path.join(__dirname, '../config/auto-battler-config.json'), 'utf8')
    )
};

require('../js/party-meta-system.js');
require('../js/run-state-system.js');

const RSS = window.RunStateSystem;

function makeMetaHero(baseClass, level, classData) {
    return {
        baseClass,
        displayName: baseClass,
        level,
        classData: classData || { baseClass, firstAdvancement: null, secondAdvancement: null }
    };
}

const run1 = RSS.createRunState({ heroes: [makeMetaHero('warrior', 1)] });
const hero = run1.heroes[0];

assert(Array.isArray(hero.skillSlots), 'skillSlots array');
assert(hero.skillSlots[0].id === 'shield_slam', 'only starter equipped');
assert(hero.skillSlots[0].stars === 1, 'default 1 star');
assert(!hero.skillSlots[1], 'slot 1 empty at start');

const poolLv1 = RSS.getSkillPoolForHero(hero).map((s) => s.id);
assert(poolLv1.includes('shield_slam') && poolLv1.includes('cleave'), 'Lv1 pool tier');
assert(!poolLv1.includes('charge'), 'charge not in Lv1 pool');
assert(poolLv1.length === 3, 'Lv1 pool size');

const merge = RSS.addSkillToInventory(run1, 'shield_slam');
assert(merge.merged === true && merge.stars === 2, 'duplicate merges to 2★');
assert(hero.skillSlots[0].stars === 2, 'slot star up');

const run5 = RSS.createRunState({ heroes: [makeMetaHero('warrior', 5)] });
const h5 = run5.heroes[0];
assert(h5.skillSlots[0].id === 'shield_slam', 'Lv5 still only starter slot');
assert(!h5.skillSlots[1], 'Lv5 slot 1 still empty');
const poolLv5 = RSS.getSkillPoolForHero(h5).map((s) => s.id);
assert(poolLv5.includes('charge') && poolLv5.includes('cleave'), 'Lv5 expanded pool');
assert(poolLv5.length === 6, 'Lv5 pool size');

const run10 = RSS.createRunState({ heroes: [makeMetaHero('warrior', 10)] });
assert(RSS.getSkillPoolForHero(run10.heroes[0]).map((s) => s.id).includes('war_cry'), 'Lv10 pool');

const runK = RSS.createRunState({
    heroes: [makeMetaHero('warrior', 10, {
        baseClass: 'warrior',
        firstAdvancement: 'knight',
        secondAdvancement: null
    })]
});
const hk = runK.heroes[0];
assert(hk.skillSlots[0].id === 'shield_slam', 'knight starter only');
assert(!hk.skillSlots[1], 'advanced one starter slot');

const poolAdv = RSS.getSkillPoolForHero(hk).map((s) => s.id);
assert(poolAdv.includes('shield_wall'), 'advancement pool');
assert(!poolAdv.includes('fireball'), 'no mage skills in knight pool');

assert(!RSS.canHeroUseSkill(makeMetaHero('warrior', 1), 'charge'), 'locked skill not usable');
assert(RSS.canHeroUseSkill(makeMetaHero('warrior', 5), 'charge'), 'unlocked skill usable');

const scaling = RSS.getStarScaling(3);
assert(scaling.stars === 3, '3 star cap');
assert(scaling.damageMult === 1, 'mutation mode: no numeric star scaling');

const picked = RSS.pickSkillFromPool(() => 0, makeMetaHero('mage', 1));
const magePool = RSS.getSkillPoolForHero(makeMetaHero('mage', 1)).map((s) => s.id);
assert(magePool.includes(picked.id), 'pick from mage pool');

const next = RSS.getNextSkillUnlock(makeMetaHero('warrior', 3));
assert(next && next.level === 5 && next.skillIds.length === 3, 'next pool tier');

console.log('test_auto_battler.js: OK');
