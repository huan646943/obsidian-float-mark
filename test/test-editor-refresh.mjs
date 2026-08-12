import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/editor-refresh.ts"],
	bundle: true,
	external: ["@codemirror/state"],
	format: "esm",
	platform: "node",
	outfile: "test/.tmp/editor-refresh.mjs"
});

const {
	refreshSideMarkDecorations,
	SideMarkEditorViewRegistry,
	shouldRefreshSideMarkDecorations
} = await import("./.tmp/editor-refresh.mjs");

const state = EditorState.create({ doc: "abc" });
const selectionTransaction = state.update({ selection: { anchor: 1 } });
assert.equal(shouldRefreshSideMarkDecorations(false, [selectionTransaction]), false);

const explicitRefresh = state.update({ effects: refreshSideMarkDecorations.of(undefined) });
assert.equal(shouldRefreshSideMarkDecorations(false, [explicitRefresh]), true);

const documentChange = state.update({ changes: { from: 3, insert: "d" } });
assert.equal(shouldRefreshSideMarkDecorations(documentChange.docChanged, [documentChange]), true);
assert.equal(shouldRefreshSideMarkDecorations(false, []), false);

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);

let decorationBuilds = 0;
const countingExtension = ViewPlugin.fromClass(class {
	update(update) {
		if (shouldRefreshSideMarkDecorations(update.docChanged, update.transactions)) {
			decorationBuilds += 1;
		}
	}
});
const view = new EditorView({
	state: EditorState.create({ doc: "abc", extensions: [countingExtension] }),
	parent: document.body
});
view.dispatch({ selection: { anchor: 1 } });
assert.equal(decorationBuilds, 0, "selection-only transactions must not rebuild decorations");
view.dispatch({ effects: refreshSideMarkDecorations.of(undefined) });
assert.equal(decorationBuilds, 1, "an explicit refresh must rebuild decorations exactly once");
view.dispatch({ changes: { from: 3, insert: "d" } });
assert.equal(decorationBuilds, 2, "a document change must rebuild decorations exactly once");
view.destroy();

const refreshCounts = new Map();
const registryCounter = ViewPlugin.fromClass(class {
	constructor(view) {
		refreshCounts.set(view, 0);
	}

	update(update) {
		if (shouldRefreshSideMarkDecorations(update.docChanged, update.transactions)) {
			refreshCounts.set(update.view, (refreshCounts.get(update.view) || 0) + 1);
		}
	}
});
const firstView = new EditorView({
	state: EditorState.create({ doc: "first", extensions: [registryCounter] }),
	parent: document.body
});
const secondView = new EditorView({
	state: EditorState.create({ doc: "second", extensions: [registryCounter] }),
	parent: document.body
});
const registry = new SideMarkEditorViewRegistry();
registry.register(firstView, () => "first.md");
registry.register(secondView, () => "second.md");
registry.refresh("second.md");
assert.equal(refreshCounts.get(firstView), 0, "refreshing another file must leave the first view unchanged");
assert.equal(refreshCounts.get(secondView), 1, "the matching view must receive an explicit refresh");
firstView.dispatch({ selection: { anchor: 1 } });
secondView.dispatch({ selection: { anchor: 1 } });
assert.equal(refreshCounts.get(firstView), 0, "selection changes must not act as a refresh fallback");
assert.equal(refreshCounts.get(secondView), 1, "selection changes must not rebuild the matching view");
registry.unregister(secondView);
registry.refresh("second.md");
assert.equal(refreshCounts.get(secondView), 1, "destroyed views must be removed from the registry");
registry.refresh(null);
assert.equal(refreshCounts.get(firstView), 1, "a null document refresh must clear every registered view");
firstView.destroy();
secondView.destroy();

console.log("editor refresh tests passed");
