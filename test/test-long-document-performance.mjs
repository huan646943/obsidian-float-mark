import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { EditorState } from "@codemirror/state";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/editor-anchor-tracker.ts"],
	bundle: true,
	external: ["@codemirror/state"],
	format: "esm",
	platform: "node",
	outfile: "test/.tmp/long-document-anchor-tracker.mjs"
});
await esbuild.build({
	entryPoints: ["src/anchors.ts"],
	bundle: true,
	external: ["@codemirror/state"],
	format: "esm",
	platform: "node",
	outfile: "test/.tmp/long-document-anchors.mjs"
});

const { reconcileEditorMarks } = await import("./.tmp/long-document-anchor-tracker.mjs");
const { createTextAnchor, relocateAnchor } = await import("./.tmp/long-document-anchors.mjs");
const source = await readFile("test/fixtures/long-document-20k.md", "utf8");
const characterCount = Array.from(source).length;
assert.ok(characterCount >= 20_000 && characterCount <= 22_000, `unexpected fixture size: ${characterCount}`);

function createMark(id, startOffset, selectedText) {
	const beforeStart = source.slice(0, startOffset);
	const beforeEnd = source.slice(0, startOffset + selectedText.length);
	const startLines = beforeStart.split("\n");
	const endLines = beforeEnd.split("\n");
	return {
		id,
		filePath: "long-document-20k.md",
		anchor: {
			startOffset,
			endOffset: startOffset + selectedText.length,
			selectedText,
			prefix: source.slice(Math.max(0, startOffset - 40), startOffset),
			suffix: source.slice(startOffset + selectedText.length, startOffset + selectedText.length + 40),
			position: {
				lineStart: startLines.length,
				lineEnd: endLines.length,
				columnStart: (startLines.at(-1)?.length || 0) + 1,
				columnEnd: (endLines.at(-1)?.length || 0) + 1
			}
		},
		mark: { kind: "highlight", color: "yellow", textColor: "default", backgroundColor: "none" },
		note: { content: "", createdAt: "", updatedAt: "" },
		status: "active"
	};
}

function createMarks(count) {
	if (count === 0) {
		return [];
	}
	const needle = "长文档测试内容";
	const offsets = [];
	let searchFrom = 0;
	while (true) {
		const offset = source.indexOf(needle, searchFrom);
		if (offset === -1) {
			break;
		}
		offsets.push(offset);
		searchFrom = offset + needle.length;
	}
	assert.ok(offsets.length >= count, `fixture does not contain ${count} anchor candidates`);
	const step = Math.max(1, Math.floor(offsets.length / count));
	return Array.from({ length: count }, (_, markIndex) => {
		const offsetIndex = Math.min(offsets.length - 1, markIndex * step);
		return createMark(`mark-${markIndex}`, offsets[offsetIndex], needle);
	});
}

function trackMaterialization(document, onMaterialize) {
	const tracked = new Proxy(document, {
		get(target, property) {
			if (property === "toString") {
				return () => {
					onMaterialize();
					return target.toString();
				};
			}
			const value = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		}
	});
	return tracked;
}

function reconcileLegacyEditorMarks(marks, document, changes) {
	const materialized = document.toString();
	return marks.map((mark) => {
		if (mark.status === "resolved") {
			return mark;
		}
		const from = changes.mapPos(mark.anchor.startOffset, 1);
		const to = Math.max(from, changes.mapPos(mark.anchor.endOffset, -1));
		if (mark.status === "active" && materialized.slice(from, to) === mark.anchor.selectedText) {
			return { ...mark, anchor: createTextAnchor(materialized, from, to) };
		}
		const anchor = relocateAnchor(materialized, { ...mark.anchor, startOffset: from, endOffset: to }, {
			trustStoredPosition: false,
			allowUniqueTextFallback: false
		});
		return anchor ? { ...mark, anchor, status: "active" } : { ...mark, status: "orphaned" };
	});
}

function createContinuousTransactions(position, iterationCount) {
	let state = EditorState.create({ doc: source });
	return Array.from({ length: iterationCount }, () => {
		const editOffset = position === "start" ? 0 : state.doc.length;
		const transaction = state.update({
			changes: { from: editOffset, insert: position === "start" ? "前" : "后" }
		});
		state = transaction.state;
		return transaction;
	});
}

function runSequence(reconcile, initialMarks, transactions, onMaterialize = null) {
	let marks = initialMarks;
	for (const transaction of transactions) {
		const document = onMaterialize
			? trackMaterialization(transaction.state.doc, onMaterialize)
			: transaction.state.doc;
		marks = reconcile(marks, document, transaction.changes);
	}
	return marks;
}

function median(values) {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)];
}

function measure(reconcile, marks, transactions) {
	runSequence(reconcile, marks, transactions.slice(0, 5));
	const samples = Array.from({ length: 3 }, () => {
		const startedAt = performance.now();
		runSequence(reconcile, marks, transactions);
		return performance.now() - startedAt;
	});
	return median(samples);
}

const iterationCount = 30;
const results = [];
for (const markCount of [0, 20, 100]) {
	for (const position of ["start", "end"]) {
		const marks = createMarks(markCount);
		const transactions = createContinuousTransactions(position, iterationCount);
		let optimizedMaterializations = 0;
		let legacyMaterializations = 0;
		const optimizedMarks = runSequence(reconcileEditorMarks, marks, transactions, () => {
			optimizedMaterializations += 1;
		});
		runSequence(reconcileLegacyEditorMarks, marks, transactions, () => {
			legacyMaterializations += 1;
		});
		assert.equal(optimizedMarks.length, markCount);
		assert.equal(optimizedMaterializations, 0, `active fast path materialized: ${markCount}/${position}`);
		assert.equal(legacyMaterializations, iterationCount, `legacy baseline mismatch: ${markCount}/${position}`);

		const legacyDurationMs = measure(reconcileLegacyEditorMarks, marks, transactions);
		const optimizedDurationMs = measure(reconcileEditorMarks, marks, transactions);
		const speedup = legacyDurationMs / Math.max(optimizedDurationMs, Number.EPSILON);
		if (markCount === 100) {
			assert.ok(speedup >= 1.5,
				`expected at least 1.5x speedup for ${markCount}/${position}, received ${speedup.toFixed(2)}x`);
		}
		results.push({
			markCount,
			position,
			iterations: iterationCount,
			legacyDurationMs: Number(legacyDurationMs.toFixed(3)),
			optimizedDurationMs: Number(optimizedDurationMs.toFixed(3)),
			speedup: Number(speedup.toFixed(2)),
			optimizedMaterializations
		});
	}
}

console.log(JSON.stringify({ characterCount, results }, null, 2));
console.log("long document performance tests passed");
