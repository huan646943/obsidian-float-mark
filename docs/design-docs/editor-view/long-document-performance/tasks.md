# 实施任务清单

> 由 spec.md 生成  
> 任务总数: 3  
> 核心原则: 先修复独立交互问题，再优化编辑热路径并统一完成回归与性能验证

## 依赖关系总览

```text
Task 1（回复入口一次打开）
  ↓
Task 2（长文档编辑性能优化与 2 万字验证）
  ↓
Task 3（整条回复区域直接进入输入态）
```

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `styles.css` | 无最终差异 | Task 1, 3 | 回复位置、颜色、尺寸与 hover 显示逻辑完全沿用原样 |
| `src/sidebar-reply.ts` | 新建 | Task 1, 3 | 回复入口和整行空白区域的事件绑定 |
| `src/sidebar-view.ts` | 修改 | Task 1 | 使用回复入口事件绑定 |
| `src/anchors.ts` | 修改 | Task 2 | 增加基于 CodeMirror Text 的局部锚点构造能力 |
| `src/editor-anchor-tracker.ts` | 修改 | Task 2 | 接收 Text 并惰性进入全文重定位慢路径 |
| `src/editor-extension.ts` | 修改 | Task 2 | 移除无条件全文转换，增加专用刷新 effect |
| `src/editor-refresh.ts` | 新建 | Task 2 | 定义专用刷新 effect 与刷新条件 |
| `src/editor-table-renderer.ts` | 修改 | Task 2 | 无表格 Widget 时跳过源码快照 |
| `src/main.ts` | 修改 | Task 2 | 适配 Text 锚点接口并显式派发刷新 effect |
| `src/storage.ts` | 修改 | Task 2 | 原位置仍匹配时复用有效锚点 |
| `main.js` | 修改 | Task 1, 2, 3 | 由构建生成的插件产物 |
| `test/test-anchors.mjs` | 修改 | Task 2 | CodeMirror Text 锚点构造一致性测试 |
| `test/test-editor-anchor-tracker.mjs` | 修改 | Task 2 | 锚点正确性与惰性全文路径测试 |
| `test/test-editor-refresh.mjs` | 新建 | Task 2 | Decoration 刷新条件测试 |
| `test/test-editor-table-renderer.mjs` | 修改 | Task 2 | 无表格快速返回测试 |
| `test/test-sidebar-reply.mjs` | 新建 | Task 1, 3 | 回复入口文字与整行空白点击回归测试 |
| `test/test-long-document-performance.mjs` | 新建 | Task 2 | 2 万字专项性能基准 |
| `test/fixtures/long-document-20k.md` | 新建 | Task 2 | 约 2 万中文字 Markdown 样本 |
| `package.json` | 修改 | Task 1, 2 | 注册新增自动化测试 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `reconcileEditorMarks()` | 参数由 `string` 改为 CodeMirror `Text` | `SideMarkPlugin.handleEditorDocumentChange()` | Task 2 |
| `handleEditorDocumentChange()` | 参数由 `string` 改为 CodeMirror `Text` | `createSideMarkEditorExtension().update()` | Task 2 |
| `refreshEditorDecorations()` | 内部改为派发专用 effect | 主插件所有标注刷新入口 | Task 2 |

### 构建系统变更

- `package.json`：测试脚本增加回复交互与长文档性能测试。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | 用户卡顿视图尚未明确 | Task 2 | 先优化代码证据最强的编辑热路径；阅读模式不在本期重写 |
| 2 | orphaned 标注恢复需要全文搜索 | Task 2 | 保留慢路径，但对每次事务惰性物化且最多一次 |
| 3 | 表格 Widget 会随视口动态挂载 | Task 2 | 保留 MutationObserver 与视口调度，仅在实际 Widget 存在时构建源码快照 |
| 4 | 仓库当前未安装依赖 | Task 1, 2 | 实施后安装 lockfile 已声明依赖，再执行现有测试与构建 |

## 任务列表

### 任务 1: [x] 修复回复入口首次点击

- 文件: `styles.css`（修改）, `src/sidebar-reply.ts`（新建）, `src/sidebar-view.ts`（修改）, `test/test-sidebar-reply.mjs`（新建）, `package.json`（修改）
- 依赖: 无
- spec 映射: 3.1 回复入口需求、4.1 回复交互方案
- 说明: 让回复入口不依赖 hover 才可命中，并添加自动化回归测试。
- context:
  - `styles.css:.side-mark-reply-trigger` — 直接修改目标
  - `src/sidebar-view.ts:renderCard()` — 上游卡片点击定位逻辑
  - `src/sidebar-view.ts:renderReplyComposer()` — 下游回复输入打开逻辑
- 验收标准:
  - [x] `npm run build` 退出码为 0
  - [x] `node test/test-sidebar-reply.mjs` 退出码为 0
  - [x] 测试断言原有 `opacity`、`pointer-events` 与 hover 显示规则保持不变
  - [x] Code Review PASS
  - [x] 不引入新的格式检查问题
- 子任务:
  - [x] 1.1: 调整回复入口默认交互样式
  - [x] 1.2: 新增首次点击回归测试并注册测试脚本

### 任务 2: [x] 优化长文档编辑路径并验证 2 万字样本

- 文件: `src/anchors.ts`（修改）, `src/editor-anchor-tracker.ts`（修改）, `src/editor-extension.ts`（修改）, `src/editor-refresh.ts`（新建）, `src/editor-table-renderer.ts`（修改）, `src/main.ts`（修改）, `src/storage.ts`（修改）, `main.js`（构建更新）, `test/test-anchors.mjs`（修改）, `test/test-editor-anchor-tracker.mjs`（修改）, `test/test-editor-refresh.mjs`（新建）, `test/test-editor-table-renderer.mjs`（修改）, `test/test-long-document-performance.mjs`（新建）, `test/fixtures/long-document-20k.md`（新建）, `package.json`（修改）
- 依赖: Task 1
- spec 映射: 3.1 长文档需求、4.1 编辑热路径方案、4.2 兼容性约束、7 测试计划
- 说明: 将普通编辑锚点更新改为 CodeMirror Text 局部读取；控制 Decoration 和表格刷新范围；添加约 2 万字样本与性能基准。
- context:
  - `src/editor-extension.ts:update()` — 编辑事务入口
  - `src/main.ts:handleEditorDocumentChange()` — 上游插件状态更新
  - `src/editor-anchor-tracker.ts:reconcileEditorMarks()` — 直接优化目标
  - `src/anchors.ts:createTextAnchor()` — 锚点构造下游
  - `src/editor-table-renderer.ts:render()` — 表格源码快照路径
  - `src/storage.ts:relocateMarks()` — 文件重载定位路径
  - `src/editor-decorations.ts:buildEditorDecorationLayers()` — Decoration 消费方
- 验收标准:
  - [x] `npm test` 退出码为 0
  - [x] `npm run build` 退出码为 0
  - [x] 2 万字样本字符数介于 20,000 与 22,000
  - [x] 性能测试覆盖 0、20、100 个标注及文首/文末编辑
  - [x] 普通活跃锚点测试断言全文物化次数为 0
  - [x] orphaned 恢复测试断言单事务全文物化次数不超过 1
  - [x] Code Review PASS
  - [x] 不引入新的格式检查问题
- 子任务:
  - [x] 2.1: 增加 Text 局部锚点构造与惰性全文回退
  - [x] 2.2: 增加专用 Decoration 刷新 effect
  - [x] 2.3: 增加表格无 Widget 快速返回
  - [x] 2.4: 增加存储重定位有效锚点快速返回
  - [x] 2.5: 创建约 2 万字样本与专项性能测试
  - [x] 2.6: 执行全量测试、构建与格式检查

### 任务 3: [x] 整条回复区域直接进入输入态

- 文件: `styles.css`（修改）, `src/sidebar-reply.ts`（修改）, `test/test-sidebar-reply.mjs`（修改）, `main.js`（构建更新）
- 依赖: Task 1
- spec 映射: 3.1 回复入口需求、7.2 集成测试
- 说明: 完全保留回复文字的位置、颜色和 hover 显示逻辑；点击所在整行的文字或空白位置，都直接显示并聚焦回复输入框，不触发评论卡片定位。
- 验收标准:
  - [x] `node test/test-sidebar-reply.mjs` 退出码为 0
  - [x] `npm run build` 退出码为 0
  - [x] 空白区域真实 click 显示并聚焦 textarea
  - [x] 空白区域真实 click 不冒泡到评论卡片
  - [x] 回复文字位置、颜色、尺寸与 hover 显示逻辑和修改前一致
  - [x] Code Review PASS
  - [x] 不引入新的格式检查问题
- 子任务:
  - [x] 3.1: 复用统一打开逻辑处理入口文字和 composer 空白点击
  - [x] 3.2: 增加空白区域真实点击回归测试

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 3.1 回复入口 | Task 1 | 一次点击进入回复输入态 |
| 3.1 长文档编辑 | Task 2 | 减少全文复制、扫描和无关刷新 |
| 3.2 非功能需求 | Task 2 | 兼容性、构建和性能验证 |
| 4.1 方案概览 | Task 1, Task 2 | 交互和编辑热路径实现 |
| 4.2 兼容性约束 | Task 2 | 锚点、表格与显式刷新回归 |
| 7 测试计划 | Task 1, Task 2 | 功能、集成和性能测试 |
| 用户补充：整行空白点击 | Task 3 | 空白区域直接进入回复输入态 |
