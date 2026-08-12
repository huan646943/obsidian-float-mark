# Feature: 编辑模式表格源码范围兼容修复

**作者**: Codex  
**日期**: 2026-08-12  
**状态**: Approved

---

## 1. 背景 (Background)

### 1.1 问题描述

- Obsidian 1.13.4 中，编辑模式表格的标注颜色不显示。
- 运行时证据表明表格 widget 与标注数据均正常，但对 widget 自身调用 `EditorView.posAtDOM()` 得到相同的起止位置，现有实现将其视为无效范围并静默跳过渲染。

### 1.2 现状分析

- `src/editor-table-renderer.ts` 负责发现表格 widget、计算其 Markdown 源码范围并调度静态及活动单元格标注渲染。
- 当前 `getWidgetSourceRange()` 使用 widget 自身的 DOM offset 计算边界，该行为依赖 CodeMirror/Obsidian 内部 DOM 映射实现。
- `src/markdown-table-map.ts` 已具备基于源码范围解析 Markdown 表格的能力，可用于校验粗略 DOM 边界。
- `test/test-editor-table-renderer.mjs` 使用人工 widget；现有模拟未覆盖 widget 自身位置退化、父节点相邻边界仍有效的真实行为。

### 1.3 主要使用场景

- 在 Obsidian 编辑模式中浏览包含 Markdown 表格的文档。
- 对表格静态单元格、当前活动单元格内的文字标注文本色或背景色。
- 文档中存在连续多张表格、表格位于文档末尾或父节点边界额外包含换行。

## 2. 目标 (Goals)

- 不依赖 `cmTile` 等私有属性，稳定解析编辑模式表格对应的 Markdown 源码范围。
- 恢复静态与活动表格单元格的已有标注颜色渲染。
- 通过自动化测试防止相同 DOM 位置映射变化再次导致回归。

### 2.1 非目标 (Non-Goals)

- 不改变标注数据格式、颜色模型或持久化内容。
- 不重构阅读模式标注渲染。
- 不引入配置开关、遥测或新的外部依赖。
- 本次不处理尚未复现的编辑器首次加载刷新竞态。

## 3. 需求细化 (Requirements)

### 3.1 功能性需求

- 从表格 widget 在父节点中的前后 DOM 边界计算粗略源码范围。
- 使用 Markdown 表格解析结果将粗略范围收敛为真实表格范围。
- 无法唯一识别表格时返回失败并跳过，禁止将标注渲染到错误表格。
- 保持现有静态单元格、活动单元格、跨单元格标注和点击交互不变。

### 3.2 非功能性需求

- 兼容 Obsidian 1.13.4 已验证的 DOM 映射行为。
- 不读取非公开 `cmTile` 属性。
- 每次表格渲染只解析当前 widget 的粗略范围，不扩大为全文件扫描。
- 修复不得破坏现有测试与构建。

## 4. 设计方案 (Design)

### 4.1 方案概览

- 保留现有 `EditorTableMarkRenderer` 渲染链，只替换表格源码范围解析策略。
- 先通过 widget 父节点相邻 offset 获取粗略边界，再复用 Markdown 表格解析器取得结构化表格范围，以源码结构作为最终正确性依据。

### 4.2 组件设计 (Component Design)

#### 4.2.1 核心类/模块设计

- `editor-table-renderer.ts`：负责 DOM 边界采集和调用表格源码解析。
- `markdown-table-map.ts`：继续负责 Markdown 表格结构识别，不新增状态或反向依赖。

#### 4.2.2 接口设计

- `getWidgetSourceRange(view, widget)` 保持内部接口及 `SourceRange | null` 返回契约不变。
- 解析成功返回唯一 Markdown 表格范围；父节点缺失、widget 索引无效、边界异常或解析结果不唯一时返回 `null`。

#### 4.2.3 数据模型

- N/A，本需求不修改数据结构或持久化 Schema。

#### 4.2.4 并发模型

- N/A，继续使用现有浏览器事件循环、MutationObserver 和 requestAnimationFrame 调度。

#### 4.2.5 错误处理

- DOM 映射异常保持非致命失败，单个 widget 跳过渲染。
- 不使用未经校验的粗略范围，避免错误着色。

### 4.3 核心逻辑实现

1. 获取 `widget.parentNode` 并定位 widget 在 `parent.childNodes` 中的索引。
2. 调用 `view.posAtDOM(parent, index)` 和 `view.posAtDOM(parent, index + 1)` 获取粗略范围。
3. 校验 `to > from`。
4. 调用 `buildMarkdownTableMaps(source, coarseRange)`。
5. 仅当解析出唯一表格时返回其 `range`，否则返回 `null`。

### 4.4 方案优劣分析

- 优点：不依赖私有属性；对多包含的换行自动归一化；改动局部；复用已有解析器。
- 局限：仍需依赖 widget 的父节点边界可被 CodeMirror 映射；异常情况下选择安全跳过而非猜测位置。

## 5. 备选方案 (Alternatives Considered)

- 使用 `widget.cmTile.length`：属于 CodeMirror 私有实现，兼容性不可控，不采用。
- 仅将 `posAtDOM()` 参数改为 widget 父节点边界：粗略范围可能包含额外字符，缺少 Markdown 结构校验，不单独采用。
- 扫描全文并按 DOM 顺序配对全部表格：容错更广但改动和误配风险更高，本次根因已有更小且可验证的修复路径。

## 6. 业界调研 (Industry Research)

- N/A。本修复针对本地已复现的 Obsidian/CodeMirror DOM 映射兼容问题，不需要外部调研。

## 7. 测试计划 (Test Plan)

### 7.1 单元测试

- 模拟 widget 自身起止位置相同、父节点相邻边界有效，验证可恢复表格范围。
- 验证父节点粗略范围包含尾随换行时返回真实 Markdown 表格范围。
- 验证缺少父节点、无效边界或无法唯一解析时安全返回失败。

### 7.2 集成测试

- 运行现有 editor table renderer 测试，覆盖静态单元格、活动单元格和跨单元格标注。
- 运行项目全量测试。

### 7.3 性能测试

- N/A。解析范围局限于单个 widget，未引入全文件额外扫描。

## 8. 可观测性 & 运维 (Observability & Operations)

- 不新增日志、指标、配置或运维接口。
- 无数据迁移；回滚只需回退代码提交。

## 9. Changelog

| 日期 | 变更内容 | 作者 |
|------|----------|------|
| 2026-08-12 | 创建修复设计 | Codex |

## 10. 参考资料 (References)

- `src/editor-table-renderer.ts`
- `src/markdown-table-map.ts`
- `test/test-editor-table-renderer.mjs`
