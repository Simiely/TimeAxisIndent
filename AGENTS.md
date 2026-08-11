# AGENTS.md · 项目规则

> 📌 **文档基线**:2026-08-11(commit `8c831e1`)完成四件套重写
> **更新文档/代码后,请更新此行**(日期 + 新 commit hash),并在 CHANGELOG 追加版本

> 写给 AI / 未来维护者的项目上下文。只记录代码里看不出的信息。

## 技术栈

- Adobe After Effects **2026(内部版本 26.0)中文版** + ExtendScript(**ES3**:无 const/let/箭头函数/模板字符串/JSON,语法检查用 `node --check`)
- ScriptUI Panel 单文件交付,免安装(放 `ScriptUI Panels/` 目录)
- 脚本文件必须 **UTF-8 带 BOM**(ExtendScript 引擎否则中文乱码)

## 关键坑(改代码前必读)

1. **ScriptUI Panel 双窗口**:从「窗口 > 扩展」打开时 AE 把 Panel 作为顶层 `this` 传入,脚本必须 `var pal = (thisObj instanceof Panel) ? thisObj : new Window(...)`,否则同时出现"空 Panel + 新 Window"两个窗口(已踩,v1.2 修复,别回归)
2. **还原只剥"行首最外层"同风格前缀**:叠加了多风格时需从外往内逐层还原(stripStyle 的 style 2 树形用 `prevTree` 标记仅允许剥"线条符后紧随的一个空格",避免误剥纯空格前缀)
3. **树形符号 `├- ` 的 `-`(半角连字符)必须在 TREE_CHARS 集合里**,否则剥不掉、还原失败(全角 `─` \u2500 也保留以兼容旧数据)
4. **UTF-8 BOM**:Write 工具产出无 BOM,必须用 Python 补 `\xef\xbb\xbf`;`node --check` 不认 `.jsx` 后缀,需复制为 `.js` 再查
5. **ScriptUI dropdownlist**:`selection` 必须显式初始化,否则 `.selection.index` 为 null 报错;新增控件后 UI 状态即时生效无需 layout,但作为 Panel 运行需 `pal.layout.layout(true)`
6. **undo 组**:`beginUndoGroup` 必须配 `try/finally { endUndoGroup }`,异常时不留半截撤销栈

## 约定

- UI 标签用中文;注释用中文;单 .jsx 文件交付(测试脚本 test_sim.js 除外)
- 缩进字符仅两种:全角空格 / 树形 `├- `;默认参数 = 树形 + 1 格 + 递进首层不缩
- 应用方式两种语义:**叠加** = 直接追加前缀(逐次加深);**重排** = 先 stripStyle(name,3) 全清再统一
- 作用范围(选中/全部)只决定处理哪些层,与叠加/重排解耦
- 操作结果提示写面板底部 statusBar,不用 alert 弹窗(仅"未激活合成"用弹窗)
- 数据保真:只动"同风格前缀"字符,用户原始装饰字符(如 `───`、前导空格)不得误删

## 常用命令

- 回归测试:`node test_sim.js`(38 项断言,改核心逻辑必须跑)
- 语法检查:`node --check`(先复制为 .js)
- 补 BOM:Python 前插 `b'\xef\xbb\xbf'`
- 发布:push 到 GitHub(仓库 public,用 PAT + 代理 7890)
