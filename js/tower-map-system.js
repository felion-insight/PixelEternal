/**
 * 恶魔塔地图系统
 *
 * 第一阶段采用“固定主路线 + 主题障碍物”的混合式生成：
 * - 每层根据楼层号稳定选择主题和布局变体；
 * - 主路线先生成，障碍物只能放在路线之外；
 * - 房间仍由现有 Room/Portal 流程推进，避免破坏塔的奖励与存档逻辑。
 */
(function () {
    'use strict';

    const THEMES = [
        {
            id: 'sanctum',
            name: '古代神殿',
            color: '#8d78a8',
            accent: '#d7b9ff',
            routeColor: '#d8bf78',
            landmark: '破碎祭坛',
            obstacles: 'columns',
            routeFamily: 'sanctum'
        },
        {
            id: 'forest',
            name: '枯萎森林',
            color: '#496b55',
            accent: '#9ee6a6',
            routeColor: '#d8b36a',
            landmark: '发光巨树',
            obstacles: 'roots',
            routeFamily: 'forest'
        },
        {
            id: 'battlefield',
            name: '古代战场',
            color: '#77524b',
            accent: '#e0a27c',
            routeColor: '#e7c18a',
            landmark: '残破战旗',
            obstacles: 'trenches',
            routeFamily: 'battlefield'
        },
        {
            id: 'void',
            name: '扭曲虚空',
            color: '#4b4c83',
            accent: '#a9b7ff',
            routeColor: '#d8ddff',
            landmark: '虚空裂隙',
            obstacles: 'islands',
            routeFamily: 'void'
        },
        {
            id: 'twinTemple',
            name: '双子神殿',
            color: '#75627c',
            accent: '#f0c7ff',
            routeColor: '#f5d8a0',
            landmark: '双生雕像',
            obstacles: 'mirrors',
            routeFamily: 'twins'
        },
        {
            id: 'starSteps',
            name: '星空阶梯',
            color: '#3e587d',
            accent: '#9cd9ff',
            routeColor: '#f1d477',
            landmark: '始源水晶',
            obstacles: 'steps',
            routeFamily: 'star_steps'
        }
    ];

    function hashSeed(value) {
        let h = 2166136261;
        const text = String(value);
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function randomFrom(seed) {
        let state = hashSeed(seed) || 1;
        return function () {
            state = Math.imul(1664525, state) + 1013904223;
            return (state >>> 0) / 4294967296;
        };
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function rect(x, y, width, height, kind, extra) {
        return Object.assign({ x, y, width, height, kind: kind || 'wall' }, extra || {});
    }

    function segmentIntersectsRect(a, b, r) {
        const minX = r.x;
        const maxX = r.x + r.width;
        const minY = r.y;
        const maxY = r.y + r.height;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        let t0 = 0;
        let t1 = 1;

        function clip(p, q) {
            if (Math.abs(p) < 0.00001) return q >= 0;
            const t = q / p;
            if (p < 0) {
                if (t > t1) return false;
                if (t > t0) t0 = t;
            } else {
                if (t < t0) return false;
                if (t < t1) t1 = t;
            }
            return true;
        }

        return clip(-dx, a.x - minX)
            && clip(dx, maxX - a.x)
            && clip(-dy, a.y - minY)
            && clip(dy, maxY - a.y);
    }

    function expanded(rectangle, amount) {
        return {
            x: rectangle.x - amount,
            y: rectangle.y - amount,
            width: rectangle.width + amount * 2,
            height: rectangle.height + amount * 2
        };
    }

    function pointToSegmentDistance(x, y, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared <= 0.0001) return Math.hypot(x - a.x, y - a.y);
        const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSquared, 0, 1);
        return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    }

    function distanceToRoute(route, x, y) {
        let distance = Infinity;
        for (let i = 0; i < route.length - 1; i++) {
            distance = Math.min(distance, pointToSegmentDistance(x, y, route[i], route[i + 1]));
        }
        return distance;
    }

    function makeRoute(width, height, variant) {
        const cx = width / 2;
        const left = width * 0.34;
        const right = width * 0.66;
        const innerLeft = width * 0.42;
        const innerRight = width * 0.58;
        // 与恶魔塔传送门的上下位置保持一致，确保实际入口和出口接入主路线。
        const portalDistance = Math.min(560, height * 0.34);
        const top = height / 2 - portalDistance;
        const bottom = height / 2 + portalDistance;
        const y1 = height * 0.31;
        const y2 = height * 0.51;
        const y3 = height * 0.67;
        // 末段靠近入口收束，与上一条横向道路保持足够物理间距。
        const y4 = bottom - 24;
        const routes = [
            [
                { x: cx, y: top },
                { x: cx, y: y1 },
                { x: left, y: y1 },
                { x: left, y: y2 },
                { x: left, y: y3 },
                { x: cx, y: y3 },
                { x: cx, y: bottom }
            ],
            [
                { x: cx, y: top },
                { x: cx, y: y1 },
                { x: right, y: y1 },
                { x: right, y: y2 },
                { x: right, y: y3 },
                { x: cx, y: y3 },
                { x: cx, y: bottom }
            ],
            [
                { x: cx, y: top },
                { x: cx, y: y1 },
                { x: innerLeft, y: y1 },
                { x: innerLeft, y: y2 },
                { x: innerRight, y: y2 },
                { x: innerRight, y: y3 },
                { x: cx, y: y3 },
                { x: cx, y: bottom }
            ],
            [
                { x: cx, y: top },
                { x: cx, y: y1 },
                { x: innerRight, y: y1 },
                { x: innerRight, y: y2 },
                { x: innerLeft, y: y2 },
                { x: innerLeft, y: y3 },
                { x: cx, y: y3 },
                { x: cx, y: bottom }
            ],
            [
                { x: cx, y: top },
                { x: cx, y: y1 },
                { x: left, y: y1 },
                { x: left, y: y2 },
                { x: innerLeft, y: y2 },
                { x: innerLeft, y: y3 },
                { x: cx, y: y3 },
                { x: cx, y: bottom }
            ],
            [
                { x: cx, y: top },
                { x: cx, y: y1 },
                { x: right, y: y1 },
                { x: right, y: y2 },
                { x: innerRight, y: y2 },
                { x: innerRight, y: y3 },
                { x: cx, y: y3 },
                { x: cx, y: bottom }
            ],
            // 湖泊环行：从左侧绕过中心湖，再从右下方回到主路。
            [
                { x: cx, y: top },
                { x: cx, y: y1 },
                { x: left, y: y1 },
                { x: left, y: y3 },
                { x: right, y: y3 },
                { x: right, y: y4 },
                { x: cx, y: y4 },
                { x: cx, y: bottom }
            ],
            // 回廊：内外两层交替收窄，形成连续的折返通道。
            [
                { x: cx, y: top },
                { x: cx, y: y1 },
                { x: innerLeft, y: y1 },
                { x: innerLeft, y: y2 },
                { x: left, y: y2 },
                { x: left, y: y3 },
                { x: innerLeft, y: y3 },
                { x: innerLeft, y: y4 },
                { x: cx, y: y4 },
                { x: cx, y: bottom }
            ]
        ];
        return routes[variant % routes.length];
    }

    function makeThemeRoute(width, height, variant, family) {
        if (!family || family === 'forest') return makeRoute(width, height, variant);
        const cx = width / 2;
        const left = width * 0.32;
        const right = width * 0.68;
        const innerLeft = width * 0.43;
        const innerRight = width * 0.57;
        const portalDistance = Math.min(560, height * 0.34);
        const top = height / 2 - portalDistance;
        const bottom = height / 2 + portalDistance;
        const y1 = height * 0.31;
        const y2 = height * 0.49;
        const y3 = height * 0.67;
        const y4 = bottom - 24;
        const mirror = variant % 2 === 1;
        const l = mirror ? right : left;
        const r = mirror ? left : right;
        const il = mirror ? innerRight : innerLeft;
        const ir = mirror ? innerLeft : innerRight;

        if (family === 'sanctum') {
            // 环形祭坛：外环进入中央，再从另一侧回到出口。
            return [
                { x: cx, y: top }, { x: cx, y: y1 },
                { x: l, y: y1 }, { x: l, y: y2 },
                { x: il, y: y2 }, { x: il, y: y3 },
                { x: ir, y: y3 }, { x: r, y: y3 },
                { x: r, y: y4 }, { x: cx, y: y4 }, { x: cx, y: bottom }
            ];
        }
        if (family === 'battlefield') {
            // 战场冲锋线：宽幅左右摆动，形成开阔区与壕沟区交替。
            return [
                { x: cx, y: top }, { x: cx, y: y1 },
                { x: r, y: y1 }, { x: r, y: y2 },
                { x: l, y: y2 }, { x: l, y: y3 },
                { x: r, y: y3 }, { x: r, y: y4 },
                { x: cx, y: y4 }, { x: cx, y: bottom }
            ];
        }
        if (family === 'void') {
            // 虚空跳岛：路线不断切换内外平台，但保持单一明确方向。
            return [
                { x: cx, y: top }, { x: il, y: y1 },
                { x: l, y: y1 }, { x: l, y: y2 },
                { x: ir, y: y2 }, { x: ir, y: y3 },
                { x: r, y: y3 }, { x: r, y: y4 },
                { x: cx, y: y4 }, { x: cx, y: bottom }
            ];
        }
        if (family === 'twins') {
            // 双子神殿：镜像两侧交替推进，不直接复制一条直线。
            return [
                { x: cx, y: top }, { x: l, y: y1 },
                { x: l, y: y2 }, { x: il, y: y2 },
                { x: il, y: y3 }, { x: ir, y: y3 },
                { x: ir, y: y4 }, { x: r, y: y4 },
                { x: cx, y: bottom }
            ];
        }
        // 星空阶梯：每一段逐步向外展开，再收束到塔顶出口。
        return [
            { x: cx, y: top }, { x: il, y: y1 },
            { x: r, y: y1 }, { x: r, y: y2 },
            { x: ir, y: y2 }, { x: l, y: y3 },
            { x: l, y: y4 }, { x: cx, y: y4 },
            { x: cx, y: bottom }
        ];
    }

    function makeEncounterRoute(width, height, variant, roomType) {
        const cx = width / 2;
        const left = width * 0.32;
        const right = width * 0.68;
        const portalDistance = Math.min(560, height * 0.34);
        const top = height / 2 - portalDistance;
        const bottom = height / 2 + portalDistance;
        const y1 = height * 0.36;
        const y2 = height * 0.5;
        const y3 = height * 0.64;
        const mirror = variant % 2 === 1;
        const firstSide = mirror ? right : left;
        const secondSide = mirror ? left : right;
        if (roomType === 'boss') {
            return [
                { x: cx, y: top },
                { x: firstSide, y: y1 },
                { x: firstSide, y: y2 },
                { x: cx, y: y2 },
                { x: secondSide, y: y3 },
                { x: secondSide, y: bottom },
                { x: cx, y: bottom }
            ];
        }
        return [
            { x: cx, y: top },
            { x: firstSide, y: y1 },
            { x: firstSide, y: y2 },
            { x: cx, y: y2 },
            { x: secondSide, y: y2 },
            { x: secondSide, y: y3 },
            { x: cx, y: y3 },
            { x: cx, y: bottom }
        ];
    }

    function makeRouteBarriers(route, width, routeWidth) {
        const barriers = [];
        for (let i = 0; i < route.length - 1; i++) {
            const from = route[i];
            const to = route[i + 1];
            const dy = to.y - from.y;
            // 过短的回廊末段不再放置横向闸墙，避免闸墙覆盖相邻转角。
            if (Math.abs(dy) < 160) continue;
            const dx = to.x - from.x;
            const midpointX = (from.x + to.x) / 2;
            const midpointY = (from.y + to.y) / 2;
            // 闸墙有厚度，开口要覆盖路线在墙体厚度内的横向偏移。
            const gapWidth = Math.max(190, Math.abs(dx / dy) * 90 + routeWidth + 48);
            const halfGap = gapWidth / 2;
            const gapLeft = clamp(midpointX - halfGap, 18, width - 18);
            const gapRight = clamp(midpointX + halfGap, 18, width - 18);
            const y = midpointY - 24;
            if (gapLeft > 18) {
                barriers.push(rect(0, y, gapLeft, 48, 'route_gate'));
            }
            if (gapRight < width - 18) {
                barriers.push(rect(gapRight, y, width - gapRight, 48, 'route_gate'));
            }
        }
        return barriers;
    }

    function candidateObstacles(theme, width, height, variant, route) {
        const cx = width / 2;
        const common = [
            rect(width * 0.06, height * 0.17, 170, 42, 'wall'),
            rect(width * 0.8, height * 0.2, 180, 42, 'wall'),
            rect(width * 0.08, height * 0.78, 170, 42, 'wall'),
            rect(width * 0.76, height * 0.8, 180, 42, 'wall')
        ];

        if (theme.obstacles === 'columns') {
            return common.concat([
                rect(cx - 250, height * 0.39, 58, 70, 'column'),
                rect(cx + 192, height * 0.55, 58, 70, 'column'),
                rect(cx - 280, height * 0.76, 58, 58, 'column'),
                rect(cx + 270, height * 0.34, 58, 82, 'column'),
                rect(cx - 330, height * 0.58, 58, 82, 'column')
            ]);
        }
        if (theme.obstacles === 'roots') {
            const forestObstacles = [];
            // 只有湖泊环行路线才生成湖泊，保证障碍形状与道路逻辑一致。
            if (variant === 6) {
                forestObstacles.push(rect(cx - 300, height * 0.39, 600, 360, 'lake'));
            }
            return forestObstacles;
        }
        if (theme.obstacles === 'trenches') {
            return [
                rect(width * 0.06, height * 0.18, 170, 48, 'trench'),
                rect(width * 0.72, height * 0.19, 165, 48, 'trench'),
                rect(width * 0.07, height * 0.68, 180, 48, 'trench'),
                rect(width * 0.7, height * 0.69, 175, 48, 'trench'),
                rect(width * 0.3, height * 0.31, 160, 42, 'trench'),
                rect(width * 0.47, height * 0.8, 190, 42, 'trench')
            ];
        }
        if (theme.obstacles === 'islands') {
            return [
                rect(width * 0.08, height * 0.2, 145, 92, 'island'),
                rect(width * 0.77, height * 0.24, 135, 86, 'island'),
                rect(width * 0.1, height * 0.65, 150, 90, 'island'),
                rect(width * 0.74, height * 0.67, 145, 86, 'island'),
                rect(width * 0.39, height * 0.28, 155, 82, 'island'),
                rect(width * 0.46, height * 0.78, 155, 82, 'island')
            ];
        }
        if (theme.obstacles === 'mirrors') {
            return [
                rect(width * 0.08, height * 0.2, 155, 28, 'mirror'),
                rect(width * 0.77, height * 0.2, 155, 28, 'mirror'),
                rect(width * 0.08, height * 0.72, 155, 28, 'mirror'),
                rect(width * 0.77, height * 0.72, 155, 28, 'mirror'),
                rect(width * 0.32, height * 0.32, 180, 28, 'mirror'),
                rect(width * 0.48, height * 0.84, 180, 28, 'mirror')
            ];
        }
        return [
            rect(width * 0.08, height * 0.2, 150, 58, 'step'),
            rect(width * 0.76, height * 0.25, 145, 58, 'step'),
            rect(width * 0.1, height * 0.67, 150, 58, 'step'),
            rect(width * 0.74, height * 0.7, 150, 58, 'step'),
            rect(width * 0.35, height * 0.3, 175, 58, 'step'),
            rect(width * 0.46, height * 0.83, 175, 58, 'step')
        ];
    }

    function routeIntersectsObstacle(route, obstacle, margin) {
        const testRect = expanded(obstacle, margin);
        for (let i = 0; i < route.length - 1; i++) {
            if (segmentIntersectsRect(route[i], route[i + 1], testRect)) return true;
        }
        return false;
    }

    function distanceToSegment(point, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared === 0) {
            return Math.hypot(point.x - a.x, point.y - a.y);
        }
        const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
        return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
    }

    function distanceToRoute(route, x, y) {
        let distance = Infinity;
        for (let i = 0; i < route.length - 1; i++) {
            distance = Math.min(distance, distanceToSegment({ x, y }, route[i], route[i + 1]));
        }
        return distance;
    }

    function pointInRect(x, y, area, padding = 0) {
        return !!area
            && x >= area.x - padding
            && x <= area.x + area.width + padding
            && y >= area.y - padding
            && y <= area.y + area.height + padding;
    }

    function makeForestRouteWalls(route, width, height, routeWidth, hiddenSpaces, extraRoutes) {
        const tile = 72;
        const clearance = routeWidth / 2 + 48;
        const openAreas = [];
        (hiddenSpaces || []).forEach(space => {
            openAreas.push(space);
            const routePoint = route.reduce((nearest, point) => {
                const currentDistance = Math.hypot(point.x - space.x, point.y - space.y);
                const nearestDistance = Math.hypot(nearest.x - space.x, nearest.y - space.y);
                return currentDistance < nearestDistance ? point : nearest;
            }, route[0]);
            const centerY = space.y + space.height / 2;
            openAreas.push({
                x: Math.min(routePoint.x, space.x) - 12,
                y: centerY - 42,
                width: Math.abs(routePoint.x - space.x) + space.width + 24,
                height: 84
            });
        });

        const walls = [];
        for (let row = 0; row < Math.ceil(height / tile); row++) {
            const y = row * tile;
            let runStart = null;
            for (let column = 0; column <= Math.ceil(width / tile); column++) {
                const x = column * tile;
                const isOpen = distanceToRoute(route, x + tile / 2, y + tile / 2) <= clearance
                    || openAreas.some(area => pointInRect(x + tile / 2, y + tile / 2, area, tile * 0.2));
                if (!isOpen && runStart === null) runStart = column;
                if ((isOpen || column === Math.ceil(width / tile)) && runStart !== null) {
                    walls.push(rect(
                        runStart * tile,
                        y,
                        Math.min(width, column * tile) - runStart * tile,
                        Math.min(tile, height - y),
                        'forest_wall'
                    ));
                    runStart = null;
                }
            }
        }
        return walls.filter(wall => wall.width > 0 && wall.height > 0);
    }

    function makeForestHiddenSpaces(route, width, height, variant) {
        if (!route || variant === 6) return [];
        const segment = route.find((point, index) => {
            const next = route[index + 1];
            return next && Math.abs(next.y - point.y) > 160;
        });
        if (!segment) return [];
        const next = route[route.indexOf(segment) + 1];
        const side = variant % 2 === 0 ? -1 : 1;
        const midY = (segment.y + next.y) / 2;
        return [{
            id: 'forest_hidden_pocket',
            x: clamp(segment.x + side * 430 - 80, 260, width - 420),
            y: clamp(midY + 110, 260, height - 390),
            width: 160,
            height: 130,
            content: variant % 3 === 0 ? 'enemy' : 'reward'
        }];
    }

    function makeForestRouteWalls(route, width, height, routeWidth, hiddenSpaces, extraRoutes) {
        const tile = 64;
        const corridorRadius = routeWidth / 2 + 58;
        const walls = [];
        const rows = Math.ceil(height / tile);
        const cols = Math.ceil(width / tile);
        for (let row = 0; row < rows; row++) {
            let runStart = -1;
            for (let col = 0; col <= cols; col++) {
                const isOutside = col < cols && (() => {
                    const x = col * tile + tile / 2;
                    const y = row * tile + tile / 2;
                    const inHiddenSpace = (hiddenSpaces || []).some(space =>
                        x >= space.x && x <= space.x + space.width
                        && y >= space.y && y <= space.y + space.height
                    );
                    const onExtraRoute = (extraRoutes || []).some(extraRoute =>
                        distanceToRoute(extraRoute, x, y) <= corridorRadius
                    );
                    return !inHiddenSpace
                        && !onExtraRoute
                        && distanceToRoute(route, x, y) > corridorRadius;
                })();
                if (isOutside && runStart < 0) {
                    runStart = col;
                }
                if ((!isOutside || col === cols) && runStart >= 0) {
                    walls.push(rect(
                        runStart * tile,
                        row * tile,
                        (col - runStart) * tile,
                        tile,
                        'forest_wall'
                    ));
                    runStart = -1;
                }
            }
        }
        return walls;
    }

    function makeRouteEnvelopeWalls(routes, width, height, routeWidth, openAreas, material) {
        const tile = 72;
        const clearance = routeWidth / 2 + 62;
        const walls = [];
        const rows = Math.ceil(height / tile);
        const columns = Math.ceil(width / tile);
        for (let row = 0; row < rows; row++) {
            const y = row * tile;
            let runStart = -1;
            for (let column = 0; column <= columns; column++) {
                const x = column * tile;
                const centerX = x + tile / 2;
                const centerY = y + tile / 2;
                const onRoute = column < columns && routes.some(path =>
                    distanceToRoute(path, centerX, centerY) <= clearance
                );
                const inOpenArea = column < columns && (openAreas || []).some(area =>
                    pointInRect(centerX, centerY, {
                        x: area.x - area.width / 2,
                        y: area.y - area.height / 2,
                        width: area.width,
                        height: area.height
                    }, tile * 0.3)
                );
                const blocked = column < columns && !onRoute && !inOpenArea;
                if (blocked && runStart < 0) runStart = column;
                if ((!blocked || column === columns) && runStart >= 0) {
                    walls.push(rect(
                        runStart * tile,
                        y,
                        Math.min(width, column * tile) - runStart * tile,
                        Math.min(tile, height - y),
                        'theme_wall',
                        { material }
                    ));
                    runStart = -1;
                }
            }
        }
        return walls.filter(wall => wall.width > 0 && wall.height > 0);
    }

    function makeRouteMechanism(route, family, floor, routeWidth) {
        if (family === 'forest' || floor % 12 !== 0 || route.length < 5) return null;
        const segmentIndex = Math.min(3, route.length - 2);
        const from = route[segmentIndex];
        const to = route[segmentIndex + 1];
        const gateWidth = routeWidth + 24;
        const gate = Math.abs(to.x - from.x) > Math.abs(to.y - from.y)
            ? rect((from.x + to.x) / 2 - 24, from.y - gateWidth / 2, 48, gateWidth, 'mechanism_gate')
            : rect(from.x - gateWidth / 2, (from.y + to.y) / 2 - 24, gateWidth, 48, 'mechanism_gate');
        const keyPoint = route[Math.max(1, segmentIndex - 1)];
        // 双开关都必须位于封锁门之前，避免生成“第二个开关在门后”的死局。
        const secondKeyPoint = route[Math.max(1, segmentIndex - 2)];
        const isDual = family === 'twins';
        return {
            type: isDual ? 'dual_switch' : 'seal_key',
            unlocked: false,
            key: { x: keyPoint.x, y: keyPoint.y },
            keys: isDual
                ? [{ x: keyPoint.x, y: keyPoint.y }, { x: secondKeyPoint.x, y: secondKeyPoint.y }]
                : null,
            activatedKeys: isDual ? [false, false] : null,
            gate
        };
    }

    function makeBranch(route, width, height, variant) {
        const anchor = route[Math.min(variant % 3 + 1, route.length - 2)];
        const direction = variant % 2 === 0 ? -1 : 1;
        const branchX = clamp(anchor.x + direction * 220, 110, width - 110);
        // 支线先离开主路线，再转向奖励点，避免和主路线共用同一条道路。
        const branchY = clamp(
            anchor.y + 70,
            180,
            height - 180
        );
        return [
            { x: anchor.x, y: anchor.y },
            { x: anchor.x + direction * 120, y: anchor.y },
            { x: anchor.x + direction * 120, y: branchY },
            { x: branchX, y: branchY }
        ];
    }

    function makeExitBranches(route, width, height, variant) {
        if (!route || route.length < 5) return [];
        // 玩家从数组末端向 0 号点推进，因此在路线中段分流，而不是在出口旁接两条短触角。
        const anchorIndex = clamp(Math.floor(route.length * 0.62), 2, route.length - 3);
        const anchor = route[anchorIndex];
        const topY = route[0].y;
        // 三条横向回廊至少相隔约 160px；小于道路、描边和碰撞边界的总宽度时，
        // 视觉上分开的上下道路会实际粘成可穿行的回环。
        const upperY = Math.max(150, Math.min(topY + height * 0.08, anchor.y - 480));
        const verticalSpan = anchor.y - upperY;
        const midY = upperY + verticalSpan * 0.38;
        const lowerY = upperY + verticalSpan * 0.72;
        const farLeft = width * 0.2;
        const farRight = width * 0.8;
        const innerLeft = width * 0.36;
        const innerRight = width * 0.64;
        const endLeft = { x: width * 0.26, y: upperY };
        const endRight = { x: width * 0.74, y: upperY };
        const pattern = variant % 4;

        if (pattern === 0) {
            // 外环与内回廊：长度接近，但战斗空间宽窄明显不同。
            return [
                [
                    anchor,
                    { x: farLeft, y: anchor.y },
                    { x: farLeft, y: midY },
                    { x: innerLeft, y: midY },
                    { x: innerLeft, y: upperY },
                    endLeft
                ],
                [
                    anchor,
                    { x: innerRight, y: anchor.y },
                    { x: innerRight, y: lowerY },
                    { x: farRight, y: lowerY },
                    { x: farRight, y: upperY },
                    endRight
                ]
            ];
        }
        if (pattern === 1) {
            // 双蛇形回廊，两条路线在不同高度折返，不重叠也不形成简单镜像短路。
            return [
                [
                    anchor,
                    { x: innerLeft, y: anchor.y },
                    { x: innerLeft, y: lowerY },
                    { x: farLeft, y: lowerY },
                    { x: farLeft, y: midY },
                    { x: innerLeft, y: midY },
                    { x: innerLeft, y: upperY },
                    endLeft
                ],
                [
                    anchor,
                    { x: farRight, y: anchor.y },
                    { x: farRight, y: midY },
                    { x: innerRight, y: midY },
                    { x: innerRight, y: upperY },
                    endRight
                ]
            ];
        }
        if (pattern === 2) {
            // 双侧迷宫：各自在地图一侧折返，避免交叉后产生无意的第三个路口。
            return [
                [
                    anchor,
                    { x: innerLeft, y: anchor.y },
                    { x: innerLeft, y: lowerY },
                    { x: farLeft, y: lowerY },
                    { x: farLeft, y: midY },
                    { x: innerLeft, y: midY },
                    { x: innerLeft, y: upperY },
                    endLeft
                ],
                [
                    anchor,
                    { x: innerRight, y: anchor.y },
                    { x: innerRight, y: lowerY },
                    { x: farRight, y: lowerY },
                    { x: farRight, y: midY },
                    { x: innerRight, y: midY },
                    { x: innerRight, y: upperY },
                    endRight
                ]
            ];
        }
        // 双外环：路径环绕地图两侧，中央保留可用于机关或奖励的空间。
        return [
            [
                anchor,
                { x: innerLeft, y: anchor.y },
                { x: innerLeft, y: lowerY },
                { x: farLeft, y: lowerY },
                { x: farLeft, y: midY },
                { x: innerLeft, y: midY },
                { x: innerLeft, y: upperY },
                { x: farLeft, y: upperY },
                endLeft
            ],
            [
                anchor,
                { x: farRight, y: anchor.y },
                { x: farRight, y: lowerY },
                { x: innerRight, y: lowerY },
                { x: innerRight, y: midY },
                { x: farRight, y: midY },
                { x: farRight, y: upperY },
                endRight
            ]
        ];
    }

    function makeTopology(route, branch) {
        // 地图坐标从上到下绘制，但实际探索方向为“底部入口 → 顶部出口”。
        const traversalRoute = route.slice().reverse();
        const mainPath = traversalRoute.map((point, index) => ({
            id: index === 0 ? 'start' : (index === traversalRoute.length - 1 ? 'exit' : `main_${index}`),
            type: index === 0 ? 'start' : (index === traversalRoute.length - 1 ? 'exit' : 'combat'),
            x: point.x,
            y: point.y
        }));
        const edges = [];
        for (let i = 0; i < mainPath.length - 1; i++) {
            edges.push({ from: mainPath[i].id, to: mainPath[i + 1].id, kind: 'main' });
        }
        if (!branch || branch.length < 2) {
            return {
                nodes: mainPath,
                edges,
                mainPath: mainPath.map(node => node.id),
                branchPath: []
            };
        }
        const branchNodes = branch.slice(1).map((point, index) => ({
            id: index === branch.length - 2 ? 'branch_reward' : `branch_${index + 1}`,
            type: index === branch.length - 2 ? 'reward' : 'branch',
            x: point.x,
            y: point.y
        }));
        const nodes = mainPath.concat(branchNodes);
        const anchorIndex = Math.max(1, route.findIndex(point =>
            point.x === branch[0].x && point.y === branch[0].y
        ));
        edges.push({ from: mainPath[anchorIndex].id, to: branchNodes[0].id, kind: 'branch' });
        for (let i = 0; i < branchNodes.length - 1; i++) {
            edges.push({ from: branchNodes[i].id, to: branchNodes[i + 1].id, kind: 'branch' });
        }
        return { nodes, edges, mainPath: mainPath.map(node => node.id), branchPath: branchNodes.map(node => node.id) };
    }

    function buildMap(floor, width, height, roomType) {
        const safeFloor = Math.max(1, Math.floor(Number(floor) || 1));
        const effectiveRoomType = roomType || 'battle';
        const theme = THEMES[Math.floor((safeFloor - 1) / 40) % THEMES.length];
        const variant = (safeFloor - 1) % 8;
        const isEncounterMap = effectiveRoomType === 'elite' || effectiveRoomType === 'boss';
        const generatedRoute = isEncounterMap
            ? makeEncounterRoute(width, height, variant, effectiveRoomType)
            : makeThemeRoute(width, height, variant, theme.routeFamily);
        const exitBranches = effectiveRoomType === 'battle'
            ? makeExitBranches(generatedRoute, width, height, variant)
            : [];
        const splitIndex = exitBranches.length
            ? generatedRoute.indexOf(exitBranches[0][0])
            : 0;
        // 出口已经从中段分流时，截掉分流点之后通往旧出口的残余道路。
        const route = splitIndex > 0 ? generatedRoute.slice(splitIndex) : generatedRoute;
        const supportsRewardBranch = effectiveRoomType === 'treasure'
            || effectiveRoomType === 'rest';
        const branch = !supportsRewardBranch
            || theme.routeFamily === 'forest'
            || safeFloor % 5 !== 0
            ? null
            : makeBranch(route, width, height, variant);
        const allBranches = branch ? [branch, ...exitBranches] : exitBranches;
        const routeWidth = 112;
        const rng = randomFrom(`tower-map:${safeFloor}`);
        const rawObstacles = candidateObstacles(theme, width, height, variant, route).map(obstacle => {
            // 同一主题内也保留楼层级变化，避免每 4 层完全重复同一张地图。
            const shiftX = (rng() - 0.5) * 44;
            const shiftY = (rng() - 0.5) * 34;
            const scale = 0.9 + rng() * 0.2;
            return rect(
                clamp(obstacle.x + shiftX, 24, width - obstacle.width * scale - 24),
                clamp(obstacle.y + shiftY, 70, height - obstacle.height * scale - 70),
                obstacle.width * scale,
                obstacle.height * scale,
                obstacle.kind,
                { variantFloor: safeFloor }
            );
        });
        const obstacles = effectiveRoomType === 'boss'
            ? []
            : rawObstacles.filter(obstacle =>
            !routeIntersectsObstacle(route, obstacle, 62)
            && allBranches.every(path => !routeIntersectsObstacle(path, obstacle, 62))
        ).slice(0, 9);
        const hiddenSpaces = theme.obstacles === 'roots'
            ? makeForestHiddenSpaces(route, width, height, variant)
            : [];
        let mechanism = makeRouteMechanism(route, theme.routeFamily, safeFloor, routeWidth);
        if (mechanism && exitBranches.some(path =>
            routeIntersectsObstacle(path, mechanism.gate, 48)
        )) {
            // 主路机关不得误封任一出口岔路；冲突楼层放弃机关而不是牺牲路线可达性。
            mechanism = null;
        }
        // 只保留不会截断任何分岔的主路线闸墙。岔路自身不生成横贯地图的闸墙，
        // 否则视觉上会出现大量无意义平行墙，并把复杂路线重新切成狭窄短通道。
        if (effectiveRoomType !== 'boss') {
            obstacles.push(...makeRouteBarriers(route, width, routeWidth).filter(barrier =>
                allBranches.every(path => !routeIntersectsObstacle(path, barrier, 40))
            ));
        }
        const topology = makeTopology(route, branch);
        const battleIndexes = isEncounterMap
            ? [Math.floor((route.length - 1) / 2)]
            : [
                Math.max(1, Math.floor((route.length - 1) * 0.22)),
                Math.max(1, Math.floor((route.length - 1) * 0.5)),
                Math.max(1, Math.floor((route.length - 1) * 0.78))
            ];
        const uniqueBattleIndexes = [...new Set(battleIndexes)];
        const battleZones = uniqueBattleIndexes.map((routeIndex, index) => {
            const point = route[routeIndex];
            return {
                id: `battle_zone_${index + 1}`,
                x: point.x,
                y: point.y,
                width: isEncounterMap ? Math.min(1160, width * 0.58) : Math.min(900, width * 0.42),
                height: isEncounterMap ? Math.min(760, height * 0.46) : Math.min(600, height * 0.32),
                radius: isEncounterMap ? 220 : 124,
                index: routeIndex,
                label: `战斗区 ${index + 1}`
            };
        });
        const centralBattleZone = battleZones[Math.floor(battleZones.length / 2)];
        const branchBattleZones = exitBranches.map((path, branchIndex) => {
            const point = path[Math.max(1, Math.floor(path.length * 0.58))];
            return {
                id: `exit_branch_${branchIndex + 1}_battle`,
                branchIndex,
                x: point.x,
                y: point.y,
                width: Math.min(680, width * 0.28),
                height: Math.min(460, height * 0.25),
                radius: 155
            };
        });
        if (effectiveRoomType !== 'boss') {
            const hiddenOpenAreas = hiddenSpaces.map(space => ({
                x: space.x + space.width / 2,
                y: space.y + space.height / 2,
                width: space.width,
                height: space.height
            }));
            obstacles.push(...makeRouteEnvelopeWalls(
                [route, ...allBranches],
                width,
                height,
                routeWidth,
                [...battleZones, ...branchBattleZones, ...hiddenOpenAreas],
                theme.id
            ));
        }
        const exitChoices = exitBranches.length
            ? exitBranches.map(path => path[path.length - 1])
            : [...new Set([
                route[0],
                route[Math.min(1, route.length - 1)],
                route[Math.min(2, route.length - 1)]
            ])];

        return {
            floor: safeFloor,
            roomType: effectiveRoomType,
            width,
            height,
            theme,
            variant,
            route,
            branches: allBranches,
            exitBranches,
            rewardBranch: branch,
            topology,
            routeWidth,
            obstacles,
            mechanism,
            // 下一层传送门在顶部，因此玩家从底部进入并向上推进。
            start: route[route.length - 1],
            exit: route[0],
            exitChoices,
            interactionPoint: route[Math.floor(route.length / 2)],
            // 每层固定生成三个战斗场地；hordeZone 保留为中心场地兼容旧逻辑。
            battleZones,
            branchBattleZones,
            hordeZone: centralBattleZone || {
                x: route[Math.floor(route.length / 2)].x,
                y: route[Math.floor(route.length / 2)].y,
                radius: 150
            },
            areas: battleZones.map(zone => ({
                ...zone,
                type: 'arena'
            })),
            hiddenSpaces,
            landmark: {
                x: width / 2 + (rng() - 0.5) * 90,
                y: height * (variant % 2 === 0 ? 0.52 : 0.47) + (rng() - 0.5) * 34,
                label: theme.landmark
            }
        };
    }

    function validateMap(map, radius) {
        const errors = [];
        const collisionRadius = Math.max(1, radius || 20);
        const paths = [map && map.route].concat((map && map.branches) || []);
        paths.forEach((path, pathIndex) => {
            if (!path || path.length < 2) {
                errors.push(`path_${pathIndex}_too_short`);
                return;
            }
            for (let i = 0; i < path.length - 1; i++) {
                for (let sample = 0; sample <= 20; sample++) {
                    const a = path[i];
                    const b = path[i + 1];
                    const x = a.x + (b.x - a.x) * sample / 20;
                    const y = a.y + (b.y - a.y) * sample / 20;
                    if (isBlocked(map, x, y, collisionRadius, true)) {
                        errors.push(`path_${pathIndex}_blocked_${i}`);
                        return;
                    }
                }
            }
        });

        const nodes = map && map.topology && map.topology.nodes;
        const edges = map && map.topology && map.topology.edges;
        if (!Array.isArray(nodes) || !nodes.some(node => node.id === 'start')) {
            errors.push('missing_start_node');
        }
        if (!Array.isArray(nodes) || !nodes.some(node => node.id === 'exit')) {
            errors.push('missing_exit_node');
        }
        if (map && map.rewardBranch
            && (!Array.isArray(nodes) || !nodes.some(node => node.id === 'branch_reward'))) {
            errors.push('missing_branch_reward_node');
        }
        if (!Array.isArray(edges)) {
            errors.push('missing_edges');
        } else {
            const nodeIds = new Set((nodes || []).map(node => node.id));
            edges.forEach(edge => {
                if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
                    errors.push(`invalid_edge_${edge.from}_${edge.to}`);
                }
            });
        }
        return { ok: errors.length === 0, errors };
    }

    function drawThemeBackdrop(ctx, map) {
        const rng = randomFrom(`tower-decor:${map.floor}`);
        const theme = map.theme;
        const width = map.width;
        const height = map.height;
        ctx.save();
        // 所有楼层使用同一套暗色石质底板，主题只负责提供局部强调色。
        ctx.fillStyle = theme.id === 'forest' ? '#163624' : '#0d111b';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = `${theme.color}12`;
        ctx.fillRect(0, 0, width, height);

        const tile = 96;
        ctx.strokeStyle = `${theme.accent}0d`;
        ctx.lineWidth = 1;
        for (let x = 0; x <= width; x += tile) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y <= height; y += tile) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // 少量、低对比度的主题纹理，避免背景抢过路线和战斗对象。
        ctx.fillStyle = `${theme.accent}18`;
        for (let i = 0; i < 12; i++) {
            const x = Math.floor(rng() * width / tile) * tile + tile * 0.5;
            const y = Math.floor(rng() * height / tile) * tile + tile * 0.5;
            ctx.fillRect(x - 2, y - 2, 4, 4);
        }
        ctx.restore();
    }

    function drawTiledPath(ctx, path, width, color, opacity) {
        if (!path || path.length < 2) return;
        const tileLength = 48;
        ctx.save();
        ctx.strokeStyle = 'rgba(8, 7, 14, 0.72)';
        ctx.lineWidth = width + 16;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'bevel';
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();

        for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex++) {
            const from = path[segmentIndex];
            const to = path[segmentIndex + 1];
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const length = Math.hypot(dx, dy);
            const tiles = Math.max(1, Math.ceil(length / tileLength));
            const angle = Math.atan2(dy, dx);
            for (let tileIndex = 0; tileIndex < tiles; tileIndex++) {
                const startRatio = tileIndex / tiles;
                const endRatio = (tileIndex + 1) / tiles;
                const centerRatio = (startRatio + endRatio) / 2;
                const slabLength = length / tiles + 4;
                ctx.save();
                ctx.translate(
                    from.x + dx * centerRatio,
                    from.y + dy * centerRatio
                );
                ctx.rotate(angle);
                ctx.fillStyle = `${color}${opacity}`;
                ctx.fillRect(-slabLength / 2, -width / 2, slabLength, width);
                ctx.restore();
            }
        }
        // 转角用完整地砖收口，消除折线描边产生的尖角和缝隙。
        ctx.fillStyle = `${color}${opacity}`;
        path.slice(1, -1).forEach(point => {
            ctx.fillRect(point.x - width / 2, point.y - width / 2, width, width);
        });
        ctx.restore();
    }

    function drawRoute(ctx, map) {
        const routeColor = map.theme.routeColor || map.theme.accent;
        (map.branches || []).forEach(branch => {
            const isExitBranch = (map.exitBranches || []).includes(branch);
            drawTiledPath(
                ctx,
                branch,
                isExitBranch ? Math.max(82, map.routeWidth * 0.78) : 54,
                routeColor,
                isExitBranch ? 'f4' : 'd8'
            );
        });
        drawTiledPath(ctx, map.route, map.routeWidth, routeColor, 'ff');

        // 只表现道路空间，不绘制战斗区轮廓或刷怪标记。
        const exitBranches = map.exitBranches || [];
        if (exitBranches.length) {
            const points = [exitBranches[0][0], ...map.exitChoices];
            points.forEach(point => {
                ctx.fillStyle = `${routeColor}ff`;
                ctx.fillRect(point.x - 64, point.y - 48, 128, 96);
            });
        }
    }

    function drawMapAreas(ctx, map) {
        const areas = map.areas || [];
        ctx.save();
        areas.forEach(area => {
            const width = area.width || 220;
            const height = area.height || 160;
            const x = area.x - width / 2;
            const y = area.y - height / 2;
            const corner = 24;
            ctx.fillStyle = 'rgba(8, 12, 22, 0.42)';
            ctx.beginPath();
            ctx.moveTo(x + corner, y);
            ctx.lineTo(x + width - corner, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + corner);
            ctx.lineTo(x + width, y + height - corner);
            ctx.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
            ctx.lineTo(x + corner, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - corner);
            ctx.lineTo(x, y + corner);
            ctx.quadraticCurveTo(x, y, x + corner, y);
            ctx.closePath();
            ctx.fill();
        });

        ctx.restore();
    }

    function drawObstacle(ctx, obstacle, theme) {
        // 障碍物只通过轮廓和形状区分，材质统一，避免每层像拼接了不同游戏的素材。
        const palette = ['rgba(20, 26, 36, 0.96)', theme.accent];
        if (obstacle.kind === 'route_gate') {
            ctx.fillStyle = palette[0];
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            ctx.strokeStyle = palette[1];
            ctx.lineWidth = 2;
            ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            ctx.strokeStyle = `${theme.accent}aa`;
            ctx.lineWidth = 3;
            for (let x = obstacle.x + 12; x < obstacle.x + obstacle.width; x += 46) {
                ctx.beginPath();
                ctx.moveTo(x, obstacle.y + 6);
                ctx.lineTo(x, obstacle.y + obstacle.height - 6);
                ctx.stroke();
            }
            return;
        }
        if (obstacle.kind === 'lake') {
            ctx.fillStyle = 'rgba(22, 72, 92, 0.92)';
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            ctx.strokeStyle = 'rgba(117, 221, 225, 0.68)';
            ctx.lineWidth = 3;
            ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            ctx.strokeStyle = 'rgba(162, 240, 234, 0.28)';
            ctx.lineWidth = 2;
            for (let y = obstacle.y + 30; y < obstacle.y + obstacle.height; y += 42) {
                ctx.beginPath();
                ctx.moveTo(obstacle.x + 24, y);
                ctx.quadraticCurveTo(
                    obstacle.x + obstacle.width / 2,
                    y - 10,
                    obstacle.x + obstacle.width - 24,
                    y
                );
                ctx.stroke();
            }
            return;
        }
        if (obstacle.kind === 'tree_cluster') {
            ctx.fillStyle = 'rgba(12, 38, 27, 0.96)';
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            ctx.strokeStyle = 'rgba(108, 180, 112, 0.55)';
            ctx.lineWidth = 2;
            ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            const treeSize = 42;
            for (let y = obstacle.y + 24; y < obstacle.y + obstacle.height - 12; y += treeSize) {
                for (let x = obstacle.x + 24; x < obstacle.x + obstacle.width - 12; x += treeSize) {
                    ctx.fillStyle = 'rgba(31, 91, 52, 0.96)';
                    ctx.beginPath();
                    ctx.arc(x, y, 22, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(8, 48, 30, 0.96)';
                    ctx.beginPath();
                    ctx.arc(x - 8, y - 7, 14, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            return;
        }
        if (obstacle.kind === 'theme_wall') {
            const materialColors = {
                forest: ['#123d25', '#2f6f3d'],
                sanctum: ['#272433', '#5a506d'],
                battlefield: ['#342620', '#745342'],
                void: ['#17182d', '#55558a'],
                twinTemple: ['#2d2733', '#74637d'],
                starSteps: ['#17263d', '#496987']
            };
            const colors = materialColors[obstacle.material] || ['#222936', theme.accent];
            ctx.fillStyle = colors[0];
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            ctx.strokeStyle = colors[1];
            ctx.lineWidth = 2;
            ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            if (obstacle.material === 'forest') {
                for (let x = obstacle.x + 28; x < obstacle.x + obstacle.width; x += 58) {
                    ctx.fillStyle = colors[1];
                    ctx.beginPath();
                    ctx.arc(x, obstacle.y + obstacle.height / 2, 24, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#174c2b';
                    ctx.beginPath();
                    ctx.arc(x - 8, obstacle.y + obstacle.height / 2 - 8, 14, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else {
                ctx.strokeStyle = `${theme.accent}40`;
                ctx.lineWidth = 1;
                for (let x = obstacle.x + 48; x < obstacle.x + obstacle.width; x += 96) {
                    ctx.beginPath();
                    ctx.moveTo(x, obstacle.y + 8);
                    ctx.lineTo(x, obstacle.y + obstacle.height - 8);
                    ctx.stroke();
                }
            }
            return;
        }
        if (obstacle.kind === 'forest_border') {
            ctx.fillStyle = 'rgba(9, 34, 24, 0.98)';
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            const treeSize = 54;
            for (let y = obstacle.y + 28; y < obstacle.y + obstacle.height; y += treeSize) {
                for (let x = obstacle.x + 28; x < obstacle.x + obstacle.width; x += treeSize) {
                    ctx.fillStyle = 'rgba(24, 78, 43, 0.98)';
                    ctx.beginPath();
                    ctx.arc(x, y, 27, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(8, 45, 28, 0.98)';
                    ctx.beginPath();
                    ctx.arc(x - 9, y - 9, 17, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            return;
        }
        if (obstacle.kind === 'forest_wall') {
            ctx.fillStyle = 'rgba(10, 47, 28, 0.98)';
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            const radius = Math.max(18, Math.min(28, Math.min(obstacle.width, obstacle.height) * 0.38));
            ctx.fillStyle = 'rgba(31, 95, 52, 0.98)';
            ctx.beginPath();
            ctx.arc(obstacle.x + obstacle.width * 0.5, obstacle.y + obstacle.height * 0.5, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(8, 48, 29, 0.98)';
            ctx.beginPath();
            ctx.arc(obstacle.x + obstacle.width * 0.35, obstacle.y + obstacle.height * 0.35, radius * 0.65, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        if (obstacle.kind === 'column') {
            ctx.fillStyle = palette[0];
            ctx.beginPath();
            ctx.arc(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2,
                Math.min(obstacle.width, obstacle.height) / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = palette[1];
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.strokeStyle = `${theme.accent}66`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(obstacle.x + obstacle.width * 0.28, obstacle.y + obstacle.height * 0.25);
            ctx.lineTo(obstacle.x + obstacle.width * 0.72, obstacle.y + obstacle.height * 0.75);
            ctx.stroke();
            return;
        }
        if (obstacle.kind === 'island') {
            const x = obstacle.x;
            const y = obstacle.y;
            const w = obstacle.width;
            const h = obstacle.height;
            ctx.fillStyle = palette[0];
            ctx.beginPath();
            ctx.moveTo(x + w * 0.15, y);
            ctx.lineTo(x + w * 0.88, y + h * 0.08);
            ctx.lineTo(x + w, y + h * 0.7);
            ctx.lineTo(x + w * 0.72, y + h);
            ctx.lineTo(x + w * 0.08, y + h * 0.82);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = palette[1];
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.strokeStyle = `${theme.accent}77`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + w * 0.25, y + h * 0.35);
            ctx.lineTo(x + w * 0.72, y + h * 0.6);
            ctx.stroke();
            return;
        }
        if (obstacle.kind === 'mirror') {
            ctx.fillStyle = palette[0];
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            ctx.strokeStyle = palette[1];
            ctx.lineWidth = 3;
            ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            ctx.strokeStyle = `${theme.accent}aa`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(obstacle.x + 8, obstacle.y + obstacle.height - 8);
            ctx.lineTo(obstacle.x + obstacle.width - 8, obstacle.y + 8);
            ctx.stroke();
            return;
        }
        if (obstacle.kind === 'step') {
            ctx.fillStyle = palette[0];
            for (let i = 0; i < 3; i++) {
                const inset = i * 9;
                ctx.fillRect(obstacle.x + inset, obstacle.y + inset, obstacle.width - inset * 2, obstacle.height - inset * 2);
            }
            ctx.strokeStyle = palette[1];
            ctx.lineWidth = 2;
            ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            return;
        }
        ctx.fillStyle = palette[0];
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        ctx.strokeStyle = palette[1];
        ctx.lineWidth = 2;
        ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        if (obstacle.kind === 'trench' || obstacle.kind === 'root') {
            ctx.strokeStyle = `${theme.accent}55`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(obstacle.x + 8, obstacle.y + obstacle.height * 0.7);
            ctx.lineTo(obstacle.x + obstacle.width - 8, obstacle.y + obstacle.height * 0.3);
            ctx.stroke();
        }
    }

    function drawMap(ctx, map) {
        if (!map) return;
        ctx.save();
        drawThemeBackdrop(ctx, map);
        drawRoute(ctx, map);
        map.obstacles.forEach(obstacle => drawObstacle(ctx, obstacle, map.theme));
        if (map.mechanism && !map.mechanism.unlocked) {
            const gate = map.mechanism.gate;
            ctx.fillStyle = 'rgba(28, 12, 38, 0.94)';
            ctx.fillRect(gate.x, gate.y, gate.width, gate.height);
            ctx.strokeStyle = `${map.theme.accent}dd`;
            ctx.lineWidth = 3;
            ctx.strokeRect(gate.x, gate.y, gate.width, gate.height);
            const keys = Array.isArray(map.mechanism.keys) ? map.mechanism.keys : [map.mechanism.key];
            keys.forEach((key, index) => {
                if (map.mechanism.activatedKeys && map.mechanism.activatedKeys[index]) return;
                ctx.fillStyle = '#ffd76a';
                ctx.beginPath();
                ctx.arc(key.x, key.y, 10, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        ctx.restore();
    }

    function isBlocked(map, x, y, radius, ignoreMechanism) {
        if (!map) return false;
        const r = Math.max(0, radius || 0);
        const blockedByObstacle = map.obstacles.some(obstacle => {
            const expandedObstacle = expanded(obstacle, r);
            return x >= expandedObstacle.x
                && x <= expandedObstacle.x + expandedObstacle.width
                && y >= expandedObstacle.y
                && y <= expandedObstacle.y + expandedObstacle.height;
        });
        if (blockedByObstacle) return true;
        if (!ignoreMechanism && map.mechanism && !map.mechanism.unlocked && map.mechanism.gate) {
            const gate = expanded(map.mechanism.gate, r);
            return x >= gate.x && x <= gate.x + gate.width
                && y >= gate.y && y <= gate.y + gate.height;
        }
        return false;
    }

    function findOpenPosition(map, x, y, width, height, radius) {
        const safeX = clamp(x, radius, width - radius);
        const safeY = clamp(y, radius, height - radius);
        if (!isBlocked(map, safeX, safeY, radius)) return { x: safeX, y: safeY };
        for (let ring = 1; ring <= 8; ring++) {
            const distance = ring * 26;
            for (let i = 0; i < 16; i++) {
                const angle = (Math.PI * 2 * i) / 16;
                const px = clamp(safeX + Math.cos(angle) * distance, radius, width - radius);
                const py = clamp(safeY + Math.sin(angle) * distance, radius, height - radius);
                if (!isBlocked(map, px, py, radius)) return { x: px, y: py };
            }
        }
        return { x: width / 2, y: height / 2 };
    }

    window.createTowerMap = function createTowerMap(floor, width, height, roomType) {
        return buildMap(floor, width || 1200, height || 800, roomType);
    };

    window.TOWER_MAP_THEMES = THEMES;
    window.towerMapIsBlocked = isBlocked;
    window.towerMapFindOpenPosition = findOpenPosition;
    window.validateTowerMap = validateMap;
    window.drawTowerMap = drawMap;
})();
