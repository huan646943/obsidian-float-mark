import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { EditorState } from "@codemirror/state";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/editor-anchor-tracker.ts"],
	bundle: true,
	format: "esm",
	platform: "node",
	outfile: "test/.tmp/editor-anchor-tracker.mjs"
});

const { mergePendingEditorAnchorUpdates, reconcileEditorMarks } = await import("./.tmp/editor-anchor-tracker.mjs");

function createTextAnchor(source, startOffset, endOffset) {
	return {
		startOffset,
		endOffset,
		selectedText: source.slice(startOffset, endOffset),
		prefix: source.slice(Math.max(0, startOffset - 40), startOffset),
		suffix: source.slice(endOffset, endOffset + 40),
		position: { lineStart: 1, lineEnd: 1, columnStart: startOffset + 1, columnEnd: endOffset + 1 }
	};
}

function createMark(source, startOffset, selectedText, status = "active") {
	return {
		id: "mark-1",
		filePath: "note.md",
		anchor: createTextAnchor(source, startOffset, startOffset + selectedText.length),
		mark: { kind: "highlight", color: "yellow", textColor: "default", backgroundColor: "none" },
		note: { content: "", createdAt: "", updatedAt: "" },
		status
	};
}

const source = "before marked after";
const mark = createMark(source, source.indexOf("marked"), "marked");

function trackMaterialization(document) {
	let count = 0;
	const tracked = new Proxy(document, {
		get(target, property) {
			if (property === "toString") {
				return () => {
					count += 1;
					return target.toString();
				};
			}
			const value = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		}
	});
	return { tracked, getCount: () => count };
}

const inserted = EditorState.create({ doc: source }).update({ changes: { from: 0, insert: "new " } });
const trackedInserted = trackMaterialization(inserted.state.doc);
const moved = reconcileEditorMarks([mark], trackedInserted.tracked, inserted.changes);
assert.equal(moved[0].status, "active");
assert.equal(moved[0].anchor.startOffset, mark.anchor.startOffset + 4);
assert.equal(trackedInserted.getCount(), 0, "the active-anchor fast path must not materialize the document");

const appended = EditorState.create({ doc: source }).update({ changes: { from: source.length, insert: " more" } });
const unchanged = reconcileEditorMarks([mark], appended.state.doc, appended.changes);
assert.equal(unchanged[0].status, "active");
assert.equal(unchanged[0].anchor.startOffset, mark.anchor.startOffset);

const inside = EditorState.create({ doc: source }).update({
	changes: { from: mark.anchor.startOffset + 2, to: mark.anchor.startOffset + 4, insert: "XX" }
});
const trackedInside = trackMaterialization(inside.state.doc);
const orphaned = reconcileEditorMarks([mark], trackedInside.tracked, inside.changes);
assert.equal(orphaned[0].status, "orphaned");
assert.equal(trackedInside.getCount(), 1, "the relocation slow path may materialize the document once");

const duplicateSource = "before marked after\nbefore marked after";
const duplicateMark = createMark(source, source.indexOf("marked"), "marked", "orphaned");
const duplicateUpdate = EditorState.create({ doc: duplicateSource }).update({
	changes: { from: duplicateSource.length, insert: "!" }
});
const stillOrphaned = reconcileEditorMarks(
	[duplicateMark],
	duplicateUpdate.state.doc,
	duplicateUpdate.changes
);
assert.equal(stillOrphaned[0].status, "orphaned");

const restoredUpdate = EditorState.create({ doc: source }).update({ changes: { from: 0, insert: "new " } });
const restoredSource = restoredUpdate.state.doc.toString();
const trackedRestored = trackMaterialization(restoredUpdate.state.doc);
const restored = reconcileEditorMarks([duplicateMark, { ...duplicateMark, id: "mark-2" }], trackedRestored.tracked,
	restoredUpdate.changes);
assert.equal(restored[0].status, "active");
assert.equal(restored[0].anchor.startOffset, restoredSource.indexOf("marked"));
assert.equal(trackedRestored.getCount(), 1, "multiple slow-path anchors must share one materialized document");

const resolved = { ...mark, status: "resolved" };
assert.equal(reconcileEditorMarks([resolved], inserted.state.doc, inserted.changes)[0], resolved);

const pendingUpdates = new Map();
const firstOrphaned = {
	...mark,
	anchor: { ...mark.anchor, startOffset: mark.anchor.startOffset + 1, endOffset: mark.anchor.endOffset + 1 },
	status: "orphaned"
};
mergePendingEditorAnchorUpdates(pendingUpdates, [mark], [firstOrphaned]);
assert.equal(pendingUpdates.get(mark.id).expectedStatus, "active");
assert.equal(pendingUpdates.get(mark.id).status, "orphaned");

const finalActive = {
	...firstOrphaned,
	anchor: { ...firstOrphaned.anchor, startOffset: mark.anchor.startOffset + 2, endOffset: mark.anchor.endOffset + 2 },
	status: "active"
};
mergePendingEditorAnchorUpdates(pendingUpdates, [firstOrphaned], [finalActive]);
assert.equal(pendingUpdates.get(mark.id).expectedStatus, "active");
assert.equal(pendingUpdates.get(mark.id).status, "active");
assert.equal(pendingUpdates.get(mark.id).anchor, finalActive.anchor);

const noChangeUpdates = new Map();
mergePendingEditorAnchorUpdates(noChangeUpdates, [resolved], [resolved]);
assert.equal(noChangeUpdates.size, 0);

console.log("editor anchor tracker tests passed");
