const fs = require('fs');
const path = require('path').join(__dirname, '..', 'js', 'data-classes.js');
let s = fs.readFileSync(path, 'utf8');
const start = s.indexOf('    /**\n     * 生成装备词条');
const end = s.indexOf('    // 计算强化后的属性（基于精炼后的基础值）');
if (start < 0 || end < 0) {
    console.error('markers not found', start, end);
    process.exit(1);
}
const replacement = `    generateEquipmentTraits() {
        return null;
    }

`;
s = s.slice(0, start) + replacement + s.slice(end);
// generateEquipments
s = s.replace(
    /function generateEquipments\(\) \{[\s\S]*?\n\}/,
    `function generateEquipments() {
    return [];
}`
);
fs.writeFileSync(path, s);
console.log('OK');
