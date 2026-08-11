// ============================================================
// 时间轴错位显示工具  TimeAxisIndent.jsx
// 版本: 1.5  (2026-08-11)
// 适用: After Effects CC 全版本 至 2026 (ExtendScript / ScriptUI)
//
// v1.5 变更:操作结果不再用 alert 弹窗,改为面板底部"状态栏"显示
//   (成功/无图层等提示即时更新;仅"未激活合成"这类无法继续的
//   错误仍用弹窗提醒)。
//
// v1.4 变更:新增"应用方式"下拉(叠加缩进 / 清空重排)。
//   叠加缩进:每次应用直接追加一层(1格→2格→3格...),支持同风格/多风格累积;
//   清空重排:先清除所有旧缩进,再按本次参数统一应用。
//   作用范围(选中/全部)只决定处理哪些图层,不再隐含叠加语义。
//
// v1.2 修复:此前从"窗口 > 扩展"打开时,会同时出现两个窗口
//   (一个空的"TimeAxisIndent" Panel + 一个"时间轴错位显示" Window)。
//   根因:未接住 AE 顶层传入的 `this`(在 ScriptUI Panel 模式下,
//   `this` 即 AE 为我们创建好的 Panel 对象),脚本又自己 new 了一个
//   Window。按 Adobe 官方 Scripting Guide(CS3 起)与
//   Paul Tuersley / Aaron Cobb 标准模式修复:
//     var pal = (thisObj instanceof Panel) ? thisObj : new Window(...)
//   现在无论作为 ScriptUI Panel 运行(可停靠)还是作为普通脚本
//   双击运行(浮动),都只显示一个窗口。
//
// v1.1 修复说明(33 项断言测试通过,test_sim.js):
//   - 按风格精确剥离(保真,不误伤用户原始字符)
//   - 多风格共存 + 按风格/批次分别还原
//   - Undo 组 try/finally 保护
//
// 功能:
//   - 给时间轴图层名称添加前导缩进(全角空格 / 半角空格 / 树形符号),
//     实现"左侧错位显示",便于区分不同图层的内容。
//   - 只修改图层名称,不修改父子关系、不动关键帧、不影响动画与渲染。
//   - 不安装本脚本时,工程照常打开、图层正常显示。
//   - 一键还原;所有修改位于同一个 Undo 组,Ctrl+Z 可整体撤销。
//
// 安装:免安装,文件已复制到用户级目录
//   %APPDATA%\Adobe\After Effects\26.0\Scripts\ScriptUI Panels\
// ============================================================

(function (thisObj) {

    // ---------- 常量 ----------
    var CHAR_SPACE = " ";              // 半角空格
    var CHAR_FULL  = "\u3000";         // 全角空格(中文全角空格,缩进最明显)
    var CHAR_TREE  = "\u251c- ";  // "├- " 树形符号(用户指定样式)

    // 树形线条符集合(├ ─ └ │ ┘ ┐ ┤ 以及用户指定的 "-" 半边横线)
    var TREE_CHARS = [
        "\u251c", "\u2500", "\u2514", "\u2502",
        "\u2518", "\u2510", "\u2524", "-"
    ];
    // 空白类字符集合(半角/全角/制表)
    var SPACE_CHARS = [" ", "\u3000", "\t"];

    // ---------- 工具函数 ----------

    function isIn(ch, arr) {
        for (var i = 0; i < arr.length; i++) {
            if (ch === arr[i]) return true;
        }
        return false;
    }

    // 按风格精确剥离前导缩进字符
    // style: 0=全角空格  1=半角空格  2=树形符号  3=全部清除
    function stripStyle(name, style) {
        var s = name, prevTree = false, c;
        while (true) {
            c = s.charAt(0);
            if (style === 0) {                       // 全角
                if (c === CHAR_FULL) { s = s.substring(1); continue; }
            } else if (style === 1) {                // 半角
                if (c === " " || c === "\t") { s = s.substring(1); continue; }
            } else if (style === 2) {                // 树形(线条符 + 紧随的一个空格)
                if (isIn(c, TREE_CHARS)) { s = s.substring(1); prevTree = true; continue; }
                if (c === " " && prevTree) { s = s.substring(1); prevTree = false; continue; }
            } else {                                 // 全部清除
                if (isIn(c, TREE_CHARS) || isIn(c, SPACE_CHARS)) { s = s.substring(1); continue; }
            }
            break;
        }
        return s;
    }

    function repeatChar(ch, n) {
        var out = "";
        for (var i = 0; i < n; i++) out += ch;
        return out;
    }

    // UI 索引 → 缩进字符(UI 选项: 0=全角空格, 1=树形符号)
    function getUIChar(uiIdx) {
        return uiIdx === 0 ? CHAR_FULL : CHAR_TREE;
    }
    // UI 索引 → 剥离风格(0=全角, 2=树形;1=半角仅用于兼容清理旧数据)
    function getUIStripStyle(uiIdx) {
        return uiIdx === 0 ? 0 : 2;
    }

    function getComp() {
        var item = app.project.activeItem;
        if (!item || !(item instanceof CompItem)) {
            alert("请先在时间轴中激活一个合成(Comp),再运行本工具。");
            return null;
        }
        return item;
    }

    function collectLayers(comp, useSelected) {
        var out = [];
        var n = comp.layers.length;
        for (var i = 1; i <= n; i++) {
            var L = comp.layers[i];
            if (!useSelected || L.selected) out.push(L);
        }
        return out;
    }

    // ---------- 应用 / 还原 ----------

    // applyMode: 0=叠加(直接追加,逐次加深), 1=清空重排(先全清再统一)
    function applyIndent(layers, style, ch, step, rule, firstSkip, applyMode) {
        app.beginUndoGroup("时间轴错位显示:应用");
        try {
            for (var i = 0; i < layers.length; i++) {
                var base = (applyMode === 1) ? stripStyle(layers[i].name, 3) : layers[i].name;
                var n;
                if (rule === 0) {
                    n = step;                                  // 等距:每层相同
                } else {
                    n = firstSkip ? step * i : step * (i + 1); // 递进:0,step,2step...
                }
                layers[i].name = repeatChar(ch, n) + base;
            }
        } finally {
            app.endUndoGroup();
        }
    }

    // style: 0/1/2 按当前字符风格还原, 3 全部清除
    function revertIndent(layers, style) {
        app.beginUndoGroup("时间轴错位显示:还原");
        try {
            for (var i = 0; i < layers.length; i++) {
                layers[i].name = stripStyle(layers[i].name, style);
            }
        } finally {
            app.endUndoGroup();
        }
    }

    // ---------- 启动检查 ----------
    if (app.project === null) {
        alert("请先打开一个 After Effects 工程,再运行本工具。");
        return;
    }

    // ---------- 创建容器(关键修复) ----------
    // 适配两种运行方式:
    //   - 作为 ScriptUI Panel 运行(放 ScriptUI Panels 目录,菜单触发):
    //       AE 把 Panel 作为 `this` 传给脚本 —— 复用它,可停靠。
    //   - 作为普通脚本运行(双击 / 文件 > 脚本 > 运行脚本文件):
    //       `this` 是 global object,需要自己 new 一个浮动 Window。
    // (Adobe 官方 Scripting Guide + Paul Tuersley / Aaron Cobb 标准模式)
    var pal = (thisObj instanceof Panel)
        ? thisObj
        : new Window("palette", "时间轴错位显示", undefined, { resizeable: false });

    pal.orientation = "column";
    pal.alignChildren = "left";
    pal.spacing = 8;
    pal.margins = 12;

    // 作用范围
    var g1 = pal.add("group");
    g1.add("statictext", undefined, "作用范围:");
    var ddlScope = g1.add("dropdownlist", undefined, ["选中图层", "全部图层"]);
    ddlScope.selection = 0;

    // 错位规则
    var g2 = pal.add("group");
    g2.add("statictext", undefined, "错位规则:");
    var ddlRule = g2.add("dropdownlist", undefined, ["等距缩进", "按顺序递进"]);
    ddlRule.selection = 0;

    // 缩进量
    var g3 = pal.add("group");
    g3.add("statictext", undefined, "缩进量:");
        var ddlStep = g3.add("dropdownlist", undefined, ["1 格", "2 格", "3 格"]);
        ddlStep.selection = 0; // 默认 1 格

    // 缩进字符
    var g4 = pal.add("group");
    g4.add("statictext", undefined, "缩进字符:");
        var ddlChar = g4.add("dropdownlist", undefined, ["全角空格", "树形符号 ├-"]);
        ddlChar.selection = 1; // 默认树形符号

    // 首层不缩
    var cbFirst = pal.add("checkbox", undefined, "递进时首层不缩进 (0,1,2...格)");
    cbFirst.value = true;

    // 还原方式
    var g6 = pal.add("group");
    g6.add("statictext", undefined, "还原方式:");
    var ddlRevert = g6.add("dropdownlist", undefined, ["按当前字符", "全部清除"]);
    ddlRevert.selection = 0;

    // 应用方式
    var g7 = pal.add("group");
    g7.add("statictext", undefined, "应用方式:");
    var ddlApply = g7.add("dropdownlist", undefined, ["叠加缩进", "清空重排"]);
    ddlApply.selection = 0; // 默认叠加

    // 按钮
    var g5 = pal.add("group");
    g5.alignment = "center";
    var btnApply  = g5.add("button", undefined, "应用错位");
    var btnRevert = g5.add("button", undefined, "还原错位");

    var tip1 = pal.add("statictext", undefined, "提示:叠加=逐次加深;重排=先清后统一。");
    var tip2 = pal.add("statictext", undefined, "还原只剥最外层同风格前缀;Ctrl+Z 可整体撤销。");

    // 状态栏(显示操作结果,替代弹窗)
    var statusBar = pal.add("statictext", undefined, "就绪:选择图层后即可应用错位。");
    statusBar.alignment = "left";

    // ---------- 逻辑 ----------
    btnApply.onClick = function () {
        var comp = getComp();
        if (!comp) return;
        var useSelected = (ddlScope.selection.index === 0);
        var layers = collectLayers(comp, useSelected);
        if (layers.length === 0) {
            statusBar.text = "没有可处理的图层" + (useSelected ? "(请先在时间轴中选中图层)" : "。");
            return;
        }
        var uiIdx = ddlChar.selection.index;
        var style = getUIStripStyle(uiIdx);
        var ch    = getUIChar(uiIdx);
        var step  = ddlStep.selection.index + 1;
        var rule  = ddlRule.selection.index;          // 0 等距, 1 递进
        var firstSkip = cbFirst.value;

        applyIndent(layers, style, ch, step, rule, firstSkip, ddlApply.selection.index);
        statusBar.text = "已对 " + layers.length + " 个图层应用错位显示。";
    };

    btnRevert.onClick = function () {
        var comp = getComp();
        if (!comp) return;
        var useSelected = (ddlScope.selection.index === 0);
        var layers = collectLayers(comp, useSelected);
        if (layers.length === 0) {
            statusBar.text = "没有可处理的图层" + (useSelected ? "(请先在时间轴中选中图层)" : "。");
            return;
        }
        var style = (ddlRevert.selection.index === 0) ? getUIStripStyle(ddlChar.selection.index) : 3;
        revertIndent(layers, style);
        statusBar.text = "已还原 " + layers.length + " 个图层。";
    };

    // ---------- 显示 ----------
    if (pal instanceof Window) {
        pal.center();
        pal.show();
    } else {
        // ScriptUI Panel: AE 自己托管显示,只需 layout 刷新
        pal.layout.layout(true);
    }

})(this);