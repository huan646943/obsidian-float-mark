# Task 2 Code Review Report: 长文档编辑性能优化

> **Review Date**: 2026-08-12  
> **Task**: Task 2 — 优化长文档编辑路径并验证 2 万字样本  
> **Reviewers**: correctness-reviewer + quality-reviewer

## 1. Review Scope

- CodeMirror `Text` 局部锚点构造与惰性全文重定位。
- Decoration 专用刷新 effect 与多编辑器视图生命周期。
- 无表格 Widget 时的源码快照快速返回。
- 文件重载时有效锚点快速复用。
- 20,558 字符样本及 0/20/100 标注连续输入基准。

`editor-table-renderer.ts` 中已存在的 table source-range 修复仅做兼容性检查，不归入本任务 finding。

## 2. Round 1 Findings

### F-1 (P1) — 性能测试缺少连续输入与旧路径基线

- **位置**: `test/test-long-document-performance.mjs`
- **问题**: 每个组合只运行一次，耗时仅打印，无法防止性能回退，也未验证 spec 中的连续输入和优化前后对比。
- **处置**: keep，已修复。

### F-2 (P1) — 显式刷新可能派发到旧编辑器

- **位置**: `src/main.ts`, `src/editor-extension.ts`, `src/editor-refresh.ts`
- **问题**: `activeEditorView` 不会在单纯切换叶子时可靠更新；移除任意 transaction 刷新的兜底后，新活动视图可能保留陈旧 Decoration。
- **处置**: keep，已修复。

### F-3 (P3) — 连续空行

- **位置**: `src/editor-anchor-tracker.ts`
- **问题**: 函数间存在两个连续空行。
- **处置**: keep，已修复。

## 3. Fixes

1. 性能测试改为每个组合连续执行 30 个 transaction，在同一进程运行旧路径与优化路径，warm-up 后取 3 次中位数；确定性断言旧路径每事务全文物化一次、优化路径为 0，并要求 100 标注场景至少加速 1.5 倍。
2. 新增 `SideMarkEditorViewRegistry`；ViewPlugin 构造和销毁时成对注册、注销，显式刷新按文件路径发送给所有匹配视图，当前文档为空时刷新全部视图以清除标注。
3. 使用两个真实 EditorView 验证按文件刷新、selection transaction 不兜底、注销生命周期和空文档清除。
4. 删除多余空行。

## 4. Round 2 Re-review

- correctness-reviewer: PASS，F-1/F-2 已关闭，无新增 finding。
- quality-reviewer: PASS，连续运行性能测试 5 次均稳定，最低加速约 33 倍；刷新与生命周期测试覆盖有效。
- **最终结论: PASS**。

## 5. Phase 3 Verification

- `npm test`: PASS。
- `npm run build`: PASS。
- `git diff --check`: PASS。
- 两套格式检查脚本: PASS（本次无 Java/XML 文件）。
- 样本字符数: 20,558。
- 全量测试中的连续 30 次输入结果：
  - 20 标注文首/文末：约 152 倍 / 261 倍。
  - 100 标注文首/文末：约 115 倍 / 40 倍。
  - 优化路径全文物化次数：全部为 0。

## 6. Follow-up Items

无。
