# DEVELOPMENT.md · 开发记录

## 一、项目概览

TimeAxisIndent 是 AE 2026 的时间轴图层"假缩进"工具:通过给图层名加前导缩进(全角空格 / 树形 `├- `),让时间轴图层左侧错位显示,便于区分内容。**只改图层名,不碰父子结构、关键帧、渲染**——删除脚本后工程照常打开。

演进:AE 脚本(v1.0 初版)→ 模拟测试驱动修复(v1.1)→ 双窗口修复(v1.2)→ 参数调整(v1.3)→ 应用方式开关(v1.4)→ 状态栏替代弹窗(v1.5)。

## 二、架构说明

```
TimeAxisIndent.jsx
├─ 纯函数层(可单测,test_sim.js 复刻)
│  ├─ stripStyle(name, style)   按风格剥离前导缩进
│  │    style: 0=全角 / 1=半角(仅兼容旧数据) / 2=树形 / 3=全部清除
│  │    树形剥离用 prevTree 标记:只允许剥"线条符后紧随的一个空格"
│  ├─ repeatChar(ch, n) / isIn(ch, arr)
│  ├─ getUIChar / getUIStripStyle   UI 索引(0全角/1树形) → 字符 / 剥离风格
│  ├─ collectLayers(comp, useSelected)
│  └─ getComp()                     activeItem 必须是 CompItem
├─ 操作层(包 Undo 组, try/finally 保护)
│  ├─ applyIndent(layers, style, ch, step, rule, firstSkip, applyMode)
│  │    applyMode: 0=叠加(直接追加) / 1=重排(stripStyle(name,3) 后统一)
│  └─ revertIndent(layers, style)
└─ UI 层(ScriptUI Panel, main(this) 模式)
     ├─ 6 个下拉:作用范围 / 错位规则 / 缩进量 / 缩进字符 / 还原方式 / 应用方式
     ├─ 复选框:递进时首层不缩进
     ├─ 按钮:应用错位 / 还原错位
     └─ statusBar:操作结果(替代弹窗)
```

容器创建标准模式(防双窗口回归):

```javascript
(function (thisObj) {
    var pal = (thisObj instanceof Panel) ? thisObj
        : new Window("palette", "时间轴错位显示", undefined, { resizeable: false });
    // ... 在 pal 上 add 控件 ...
    if (pal instanceof Window) { pal.center(); pal.show(); }
    else { pal.layout.layout(true); }
})(this);
```

## 三、关键问题与方案(一坑一篇)

### 问题:还原/应用误删用户原始装饰字符

**TL;DR**:v1.0 用"全字符集剥离"无条件删行首空白/线条符,用户图层名自带的 `───`、`├`、前导空格在"应用+还原"后丢失。

- 问题:图层名 `─── 分隔线`,应用全角缩进后装饰被吞
- 根因:`stripLeading` 剥除集合包含所有空白+树形线条,不区分"本工具加的"与"用户原有的"
- 解决:改为**按字符风格精确剥离**——应用只剥当前风格前缀,还原只剥"行首最外层同风格"前缀;全清需显式选「全部清除」
- 预防:新增风格字符时,先确认其剥除集合边界(如树形 `├- ` 的 `-` 必须入 TREE_CHARS)

### 问题:ScriptUI Panel 弹出两个窗口

**TL;DR**:从「窗口 > 扩展」打开时,AE 把 Panel 作为顶层 `this` 传入;脚本没接住又 `new Window`,于是"空 Panel + 新 Window"并存。

- 问题:截图发现两个窗口(空 TimeAxisIndent + 时间轴错位显示)
- 根因:未使用 `main(this)` / `thisObj instanceof Panel` 标准模式
- 解决:按 Adobe 官方 Scripting Guide(CS3 起)与 Paul Tuersley / Aaron Cobb 标准模式重写容器创建段
- 预防:任何 ScriptUI Panel 脚本必须 `var pal = (thisObj instanceof Panel) ? thisObj : new Window(...)`

### 问题:同风格缩进重复应用不叠加

**TL;DR**:v1.1 选中模式"先剥当前风格再叠加",同一种字符永远只有 1 份,用户要 1 格→2 格→3 格逐次加深。

- 问题:缩进 1 格点两次还是 1 格
- 根因:apply 时先 stripStyle 同风格前缀,再追加,数量不累积
- 解决:新增「应用方式」下拉(叠加缩进 / 清空重排),叠加 = 直接追加不剥前缀;重排 = 先全清再统一
- 预防:叠加/重排语义与作用范围(选中/全部)解耦,互不隐含

### 问题:还原粒度不清,混合前缀剥不干净

**TL;DR**:同一层叠加两种风格后(如 `├- 　　标题`),单次还原无法只撤其中一种。

- 问题:`├- 　　标题` 按全角还原无效果
- 根因:还原只剥行首连续同风格字符,全角被树形挡在里层
- 解决:明确"从外往内逐层剥"语义,README 说明;提供「全部清除」一键清光
- 预防:提示用户叠加顺序 = 还原顺序(后加的在外层,先撤)

### 问题:ExtendScript 中文乱码 / 语法检查失败

**TL;DR**:ExtendScript 引擎要求 UTF-8 带 BOM;`node --check` 不认 `.jsx` 后缀。

- 问题:中文界面乱码;node --check 报未知扩展名
- 根因:Write 工具产出 UTF-8 无 BOM;node 只检查已知扩展
- 解决:Python 前插 BOM;复制为 `.js` 再检查
- 预防:AGENTS.md 已记录,发布前按"常用命令"走一遍

### 问题:操作结果弹窗打扰

**TL;DR**:每次应用/还原都 alert,打断工作流。

- 问题:连点多次弹窗烦
- 根因:alert 同步阻塞
- 解决:面板底部加 statusBar 显示结果;仅"未激活合成"保留弹窗(用户可能没看面板)
- 预防:UI 反馈优先状态栏,弹窗只留给无法继续的错误

## 四、文档基线

- 2026-08-11(commit `__BASELINE__`):四件套重写完成
