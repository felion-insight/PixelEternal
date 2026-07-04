#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function migrateDataClasses(filePath) {
    let s = fs.readFileSync(filePath, 'utf8');
    s = s.replace(/quality === 'common'/g, "quality === 'normal'");
    s = s.replace(/quality === 'fine'/g, "quality === 'magic'");
    s = s.replace(/data\.quality \|\| 'common'/g, "data.quality || 'normal'");
    s = s.replace(/'common':/g, "'normal':");
    s = s.replace(/'fine':/g, "'magic':");
    s = s.replace(/\['helmet', 'chest', 'legs', 'boots'\]/g, "['helmet', 'body', 'legs', 'feet']");
    s = s.replace(/\['necklace', 'ring', 'belt'\]/g, "['amulet', 'ring', 'belt']");
    s = s.replace(/显示套装信息（合铸装备可显示多个套装）/g, '显示套装信息');
    fs.writeFileSync(filePath, s);
    console.log('updated', filePath);
}

function migrateJson(filePath) {
    let s = fs.readFileSync(filePath, 'utf8');
    s = s.replace(/"quality": "common"/g, '"quality": "normal"');
    s = s.replace(/"quality": "fine"/g, '"quality": "magic"');
    fs.writeFileSync(filePath, s);
    console.log('updated', filePath);
}

migrateDataClasses(path.join(ROOT, 'js', 'data-classes.js'));
migrateJson(path.join(ROOT, 'config', 'crafting-recipe-config.json'));
