const fs = require('fs');
const path = require('path').join(__dirname, '..', 'js', 'data-classes.js');
let s = fs.readFileSync(path, 'utf8');
const start = s.indexOf('    /**\n     * 获取武器精炼效果配置（1-5级）');
const end = s.indexOf('    /**\n     * 生成装备词条');
if (start < 0 || end < 0) {
    console.error('markers not found', start, end);
    process.exit(1);
}
const replacement = `    getWeaponRefineEffects() {
        return null;
    }

    /**
     * 根据武器类型与品质获取技能（程序化）
     */
    getWeaponSkill() {
        if (this.slot !== 'weapon') return null;
        if (typeof window.getProceduralWeaponSkill === 'function') {
            return window.getProceduralWeaponSkill(this.weaponType, this.quality);
        }
        return null;
    }

`;
s = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(path, s);
console.log('OK removed', end - start, 'bytes');
