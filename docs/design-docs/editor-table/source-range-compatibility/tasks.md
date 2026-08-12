# 实施任务清单

> 由 spec.md 生成  
> 任务总数: 1  
> 核心原则: 先以父节点边界取得粗略范围，再以 Markdown 结构校验真实表格范围

## 依赖关系总览

Task 1（修复表格范围解析并补回归测试）

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `src/editor-table-renderer.ts` | 修改 | Task 1 | 替换 widget 源码范围解析策略 |
| `test/test-editor-table-renderer.mjs` | 修改 | Task 1 | 补充 Obsidian 1.13.4 DOM 映射回归测试 |
| `main.js` | 修改 | Task 1 | 构建生成的插件发行包；同时包含工作区并行源码改动的构建结果 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `getWidgetSourceRange()` | 内部实现变更，签名不变 | `renderEditorTableMarks()` | Task 1 |

### 构建系统变更

- 无。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | 父节点边界可能包含表格尾随换行 | Task 1 | 使用 Markdown 表格解析结果收敛范围 |
| 2 | 一个粗略范围可能无法唯一对应表格 | Task 1 | 安全返回 `null`，禁止猜测或误配 |
| 3 | 本地依赖当前未安装 | Task 1 | 实施前安装锁文件依赖，再运行定向及全量测试 |

## 任务列表

### 任务 1: [x] 修复表格范围解析并补回归测试

- 文件: `src/editor-table-renderer.ts`（修改）、`test/test-editor-table-renderer.mjs`（修改）、`main.js`（构建生成）
- 依赖: 无
- spec 映射: 3.1、3.2、4.1～4.4、7.1～7.2
- 说明: 使用 widget 父节点相邻 DOM 边界获取粗略范围，通过 Markdown 表格解析器校验并返回真实范围，同时覆盖真实退化行为和失败边界。
- context:
  - `src/editor-table-renderer.ts:getWidgetSourceRange()` — 直接修改目标，当前退化位置计算点
  - `src/editor-table-renderer.ts:renderEditorTableMarks()` — 上游调用方，消费表格源码范围
  - `src/markdown-table-map.ts:buildMarkdownTableMaps()` — 下游结构解析器，收敛粗略范围
  - `src/editor-table-cell-renderer.ts:renderActiveTableCellMarks()` — 范围下游消费者，映射活动单元格
  - `test/test-editor-table-renderer.mjs` — 现有表格渲染集成测试基础设施
- 验收标准:
  - [x] `npm run build` 成功且无新 warning
  - [x] `node test/test-editor-table-renderer.mjs` 通过
  - [x] `npm test` 全量通过
  - [x] 回归测试覆盖 widget 自身位置退化、父边界含尾随换行和无效边界
  - [x] Code Review PASS
- 子任务:
  - [x] 1.1: 修改表格 widget 源码范围解析
  - [x] 1.2: 增加正常、边界和异常路径测试
  - [x] 1.3: 执行格式化、静态检查、定向测试和全量回归

- 计划偏差说明:
  - `npm run build` 按项目发布方式同步生成 `main.js`，因此补入文件清单。
  - 构建期间工作区出现并行的侧栏回复源码改动，生成的 `main.js` 同时包含这些内容；未将其计入本 Task 的源代码审查范围。

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 3.1～3.2 | Task 1 | 功能行为和兼容性约束 |
| 4.1～4.4 | Task 1 | 范围解析、结构校验及失败策略 |
| 7.1～7.2 | Task 1 | 单元与集成回归测试 |

## 质量自检

| # | 检查项 | 结果 |
|---|--------|------|
| 1 | 依赖 DAG 无环 | 通过：仅一个内聚任务 |
| 2 | 每个任务编译可通过 | 通过：内部接口签名不变 |
| 3 | 每个任务有验收标准 | 通过：均可由构建或测试命令验证 |
| 4 | spec 全覆盖 | 通过：需求、设计和测试均映射到 Task 1 |
| 5 | 粒度合理 | 通过：实现与其直接回归测试合并交付 |
| 6 | 变更序安全 | 通过：无删除或迁移步骤 |
| 7 | 构建系统同步 | 通过：无新增代码文件或依赖 |
| 8 | 无冗余任务 | 通过：单任务具有独立验收价值 |
| 9 | 跨切面无遗漏 | 通过：无新增日志、配置或持久化变更 |
| 10 | 变更影响概览完整 | 通过：实现、测试与生成的发行包均已列出 |
| 11 | context 完整 | 通过：包含直接目标、上游和下游调用点 |
