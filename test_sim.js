// ============================================================
// TimeAxisIndent 模拟测试 — 用 10 个使用方案验证核心逻辑
// 复刻 jsx 中的字符串处理逻辑(不含 AE API),Node 可直接运行。
// 对比: v1.0 旧逻辑(全字符集剥离) vs v1.1 新逻辑(按风格精确剥离)
// ============================================================

"use strict";

// ---------- 字符常量(与 jsx 保持一致) ----------
var CHAR_SPACE = " ";
var CHAR_FULL  = "\u3000";
var CHAR_TREE  = "\u251c- ";            // "├─ "
var TREE_CHARS  = ["\u251c","\u2500","\u2514","\u2502","\u2518","\u2510","\u2524","-"]; // ├ ─ └ │ ┘ ┐ ┤ -
var SPACE_CHARS = [" ", "\u3000", "\t"];

// ---------- v1.0 旧逻辑 ----------
var STRIP_CHARS = [" ", "\u3000", "\t"].concat(TREE_CHARS);
function origStrip(name) {
    var s = name, changed = true;
    while (changed) {
        changed = false;
        for (var i = 0; i < STRIP_CHARS.length; i++) {
            if (s.charAt(0) === STRIP_CHARS[i]) { s = s.substring(1); changed = true; break; }
        }
    }
    return s;
}

// ---------- v1.1 新逻辑 ----------
function isIn(ch, arr) { for (var i = 0; i < arr.length; i++) if (ch === arr[i]) return true; return false; }

// style: 0=全角  1=半角  2=树形  3=全部清除
function stripStyle(name, style) {
    var s = name, prevTree = false, c;
    while (true) {
        c = s.charAt(0);
        if (style === 0) {
            if (c === CHAR_FULL) { s = s.substring(1); continue; }
        } else if (style === 1) {
            if (c === " " || c === "\t") { s = s.substring(1); continue; }
        } else if (style === 2) {
            if (isIn(c, TREE_CHARS)) { s = s.substring(1); prevTree = true; continue; }
            if (c === " " && prevTree) { s = s.substring(1); prevTree = false; continue; }
        } else {
            if (isIn(c, TREE_CHARS) || isIn(c, SPACE_CHARS)) { s = s.substring(1); continue; }
        }
        break;
    }
    return s;
}

function repeatChar(ch, n) { var out = ""; for (var i = 0; i < n; i++) out += ch; return out; }

// 应用缩进(纯函数,与 jsx 的 applyIndent 逻辑一致)
// applyMode: 0=叠加(直接追加,逐次加深), 1=清空重排(先全剥再统一)
// 不传 applyMode 时向后兼容: useSelected=true → 叠加, false → 重排
function applyLayers(all, selSet, useSelected, style, step, rule, firstSkip, applyMode) {
    if (applyMode === undefined) applyMode = useSelected ? 0 : 1;
    var targets = [];
    for (var i = 0; i < all.length; i++) {
        if (!useSelected || selSet.indexOf(i) >= 0) targets.push(all[i]);
    }
    for (var j = 0; j < targets.length; j++) {
        var base = (applyMode === 1) ? stripStyle(targets[j].name, 3) : targets[j].name;
        var n = (rule === 0) ? step : (firstSkip ? step * j : step * (j + 1));
        targets[j].name = repeatChar(getChar(style), n) + base;
    }
}
function getChar(style) { return style === 0 ? CHAR_FULL : (style === 1 ? CHAR_SPACE : CHAR_TREE); }

// 还原(纯函数)
function revertLayers(all, selSet, useSelected, style) {
    var targets = [];
    for (var i = 0; i < all.length; i++) {
        if (!useSelected || selSet.indexOf(i) >= 0) targets.push(all[i]);
    }
    for (var j = 0; j < targets.length; j++) {
        targets[j].name = stripStyle(targets[j].name, style);
    }
}

// ---------- 测试框架 ----------
var pass = 0, fail = 0;
function names(arr) { return arr.map(function (o) { return o.name; }); }
function mk(arr) { return arr.map(function (n) { return { name: n }; }); }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function test(label, actual, expected) {
    if (eq(actual, expected)) { pass++; console.log("  [PASS] " + label); }
    else { fail++; console.log("  [FAIL] " + label); console.log("        实际:   " + JSON.stringify(actual)); console.log("        期望:   " + JSON.stringify(expected)); }
}

// ============================================================
// 场景 1:大工程分层整理(全选 + 递进 + 全角 1 格 + 首层不缩)
// ============================================================
console.log("\n=== 方案1:全选递进全角 ===");
{
    var L = mk(["A", "B", "C", "D"]);
    applyLayers(L, [], false, 0, 1, 1, true);
    test("应用后阶梯错位", names(L), ["A", "\u3000B", "\u3000\u3000C", "\u3000\u3000\u3000D"]);
    revertLayers(L, [], false, 0);
    test("还原后原样", names(L), ["A", "B", "C", "D"]);
}

// ============================================================
// 场景 2:等距半角 2 格
// ============================================================
console.log("\n=== 方案2:等距半角 ===");
{
    var L = mk(["A", "B"]);
    applyLayers(L, [], false, 1, 2, 0, true);
    test("等距2格半角", names(L), ["  A", "  B"]);
    revertLayers(L, [], false, 1);
    test("还原原样", names(L), ["A", "B"]);
}

// ============================================================
// 场景 3:选中部分图层 + 树形等距(重点标记)
// ============================================================
console.log("\n=== 方案3:选中树形 ===");
{
    var L = mk(["A", "B", "C"]);
    applyLayers(L, [0, 2], true, 2, 1, 0, true);
    test("仅选中层加树形", names(L), ["\u251c- A", "B", "\u251c- C"]);
    revertLayers(L, [0, 2], true, 2);
    test("仅还原选中层,B 不动", names(L), ["A", "B", "C"]);
}

// ============================================================
// 场景 4:递进树形(动画节奏可视化)
// ============================================================
console.log("\n=== 方案4:递进树形 ===");
{
    var L = mk(["A", "B", "C"]);
    applyLayers(L, [], false, 2, 1, 1, true);
    test("递进树形", names(L), ["A", "\u251c- B", "\u251c- \u251c- C"]);
    revertLayers(L, [], false, 2);
    test("还原全清", names(L), ["A", "B", "C"]);
}

// ============================================================
// 场景 5:临时区分 + 交付前还原
// ============================================================
console.log("\n=== 方案5:应用->还原->与原样一致 ===");
{
    var L = mk(["\u6807\u9898A", "\u6807\u9898B"]); // 标题A 标题B
    applyLayers(L, [], false, 0, 2, 0, true);
    test("应用后", names(L), ["\u3000\u3000\u6807\u9898A", "\u3000\u3000\u6807\u9898B"]);
    revertLayers(L, [], false, 0);
    test("还原后与初始完全一致", names(L), ["\u6807\u9898A", "\u6807\u9898B"]);
}

// ============================================================
// 场景 6:多层递进规律(百层抽样)
// ============================================================
console.log("\n=== 方案6:多层递进规律 ===");
{
    var L = mk(["L1", "L2", "L3", "L4", "L5", "L6"]);
    applyLayers(L, [], false, 1, 1, 1, true);
    test("0,1,2,3,4,5 格递进", names(L), ["L1", " L2", "  L3", "   L4", "    L5", "     L6"]);
}

// ============================================================
// 场景 7:分批不同字符共存(父子链层树形 + 普通层全角)
// ============================================================
console.log("\n=== 方案7:分批共存 ===");
{
    var L = mk(["A", "B", "C", "D"]);
    applyLayers(L, [1, 2], true, 2, 1, 0, true); // 批1:B、C 树形
    test("批1后", names(L), ["A", "\u251c- B", "\u251c- C", "D"]);
    applyLayers(L, [3], true, 0, 2, 0, true);     // 批2:D 全角2格
    test("批2后,批1树形保留", names(L), ["A", "\u251c- B", "\u251c- C", "\u3000\u3000D"]);
    revertLayers(L, [1, 2], true, 2);             // 还原批1
    test("还原批1,批2保留", names(L), ["A", "B", "C", "\u3000\u3000D"]);
    revertLayers(L, [3], true, 0);                // 还原批2
    test("还原批2,全部原样", names(L), ["A", "B", "C", "D"]);
}

// ============================================================
// 场景 8:三批不同字符 + 分别还原(版本对比)
// ============================================================
console.log("\n=== 方案8:三批分别还原 ===");
{
    var L = mk(["V1", "V2", "V3"]);
    applyLayers(L, [0], true, 0, 2, 0, true); // V1 全角2格
    applyLayers(L, [1], true, 2, 1, 0, true); // V2 树形1格
    applyLayers(L, [2], true, 1, 3, 0, true); // V3 半角3格
    test("三批共存", names(L), ["\u3000\u3000V1", "\u251c- V2", "   V3"]);
    revertLayers(L, [0], true, 0);
    test("还原V1,V2/V3不动", names(L), ["V1", "\u251c- V2", "   V3"]);
    revertLayers(L, [1], true, 2);
    revertLayers(L, [2], true, 1);
    test("全部还原", names(L), ["V1", "V2", "V3"]);
}

// ============================================================
// 场景 9:隐藏/锁定层状态管理(只处理选中层)
// ============================================================
console.log("\n=== 方案9:选中层递进,未选层不动 ===");
{
    var L = mk(["A", "B", "C", "D"]);
    applyLayers(L, [0, 1, 2], true, 0, 1, 1, true);
    test("只处理选中层,D 不动", names(L), ["A", "\u3000B", "\u3000\u3000C", "D"]);
    revertLayers(L, [0, 1, 2], true, 0);
    test("还原选中层", names(L), ["A", "B", "C", "D"]);
}

// ============================================================
// 场景 10:排序后递进 + 全部清除还原
// ============================================================
console.log("\n=== 方案10:排序递进 + 全清 ===");
{
    var L = mk(["T1", "T2", "T3", "T4"]);
    applyLayers(L, [], false, 0, 1, 1, true);
    test("按时间顺序阶梯", names(L), ["T1", "\u3000T2", "\u3000\u3000T3", "\u3000\u3000\u3000T4"]);
    revertLayers(L, [], false, 3); // 全部清除
    test("全清还原", names(L), ["T1", "T2", "T3", "T4"]);
}

// ============================================================
// 场景 11:叠加缩进(同风格逐次加深,用户新增需求)
// ============================================================
console.log("\n=== 方案11:应用方式=叠加(同风格逐次加深) ===");
{
    var L = mk(["A", "B"]);
    applyLayers(L, [0, 1], true, 2, 1, 0, true, 0); // 第1次:树形1格
    test("第1次:1格", names(L), ["\u251c- A", "\u251c- B"]);
    applyLayers(L, [0, 1], true, 2, 1, 0, true, 0); // 第2次:再叠加1格
    test("第2次:叠加为2格", names(L), ["\u251c- \u251c- A", "\u251c- \u251c- B"]);
    applyLayers(L, [0, 1], true, 2, 1, 0, true, 0); // 第3次:叠加为3格
    test("第3次:叠加为3格", names(L), ["\u251c- \u251c- \u251c- A", "\u251c- \u251c- \u251c- B"]);
    revertLayers(L, [0, 1], true, 2);               // 树形还原
    test("树形还原后原样", names(L), ["A", "B"]);
}

// ============================================================
// 场景 12:应用方式=清空重排(先清旧缩进再统一)
// ============================================================
console.log("\n=== 方案12:应用方式=清空重排 ===");
{
    var L = mk(["A", "B"]);
    applyLayers(L, [0, 1], true, 2, 1, 0, true, 0);  // 先叠加1格树形
    applyLayers(L, [0, 1], true, 0, 2, 0, true, 1);  // 再清空重排:全角2格
    test("旧树形被清,统一为全角2格", names(L), ["\u3000\u3000A", "\u3000\u3000B"]);
}

// ============================================================
// Bug 对照 1:用户原始装饰字符保真(v1.0 会误删)
// ============================================================
console.log("\n=== Bug对照1:名字带装饰字符(─ 开头) ===");
{
    var name0 = "\u2500\u2500\u2500 \u5206\u9694\u7ebf"; // "─── 分隔线"
    // v1.0:应用全角2格
    var s10 = repeatChar(CHAR_FULL, 2) + origStrip(name0);
    test("v1.0 应用后(装饰被吞)", s10, "\u3000\u3000\u5206\u9694\u7ebf");
    // v1.1:应用全角2格
    var s11 = repeatChar(CHAR_FULL, 2) + stripStyle(name0, 0);
    test("v1.1 应用后(装饰保留)", s11, "\u3000\u3000\u2500\u2500\u2500 \u5206\u9694\u7ebf");
    // v1.1 还原
    test("v1.1 还原后与原样一致", stripStyle(s11, 0), name0);
}

// ============================================================
// Bug 对照 2:同层多风格叠加 + 分风格还原(v1.0 后覆盖先)
// ============================================================
console.log("\n=== Bug对照2:同层叠加两种风格 ===");
{
    var name0 = "X";
    // v1.1:先树形再全角
    var a = stripStyle(name0, 2), b = repeatChar(CHAR_TREE, 1) + a;
    var c = stripStyle(b, 0), d = repeatChar(CHAR_FULL, 2) + c;
    test("v1.1 叠加后(两风格共存)", d, "\u3000\u3000\u251c- X");
    test("v1.1 还原全角(树形保留)", stripStyle(d, 0), "\u251c- X");
    test("v1.1 再还原树形(全清)", stripStyle("\u251c- X", 2), "X");

    // v1.0:第二次应用会把树形全剥(后覆盖先,且无法分风格还原)
    var s10 = repeatChar(CHAR_FULL, 2) + origStrip(repeatChar(CHAR_TREE, 1) + origStrip(name0));
    test("v1.0 叠加后(树形被吞)", s10, "\u3000\u3000X");
}

// ============================================================
// Bug 对照 3:v1.0 还原误伤其他风格前缀
// ============================================================
console.log("\n=== Bug对照3:还原误伤 ===");
{
    var mixed = "\u251c- \u3000\u3000\u6807\u9898"; // "├─ 　　标题"(全角被树形包在里层)
    test("v1.1 全角还原:里层被外层挡住→无操作", stripStyle(mixed, 0), mixed);
    test("v1.1 先剥外层树形,再剥内层全角→两步干净", stripStyle(stripStyle(mixed, 2), 0), "\u6807\u9898");
    test("v1.1 按树形还原(行首树形)", stripStyle(mixed, 2), "\u3000\u3000\u6807\u9898");
    test("v1.0 还原(全剥,无法分步)", origStrip(mixed), "\u6807\u9898");
}

// ============================================================
console.log("\n----------------------------------------");
console.log("结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
