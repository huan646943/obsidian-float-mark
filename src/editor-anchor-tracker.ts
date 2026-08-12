import type { ChangeDesc, Text } from "@codemirror/state";
import { createEditorTextAnchor, relocateAnchor } from "./anchors";
import type { MarkAnchorUpdate } from "./storage";
import type { SideMark } from "./types";

export function mergePendingEditorAnchorUpdates(
	pending: Map<string, MarkAnchorUpdate>,
	previousMarks: SideMark[],
	nextMarks: SideMark[]
): void {
	const previousById = new Map(previousMarks.map((mark) => [mark.id, mark]));
	for (const nextMark of nextMarks) {
		const previousMark = previousById.get(nextMark.id);
		if (!previousMark || hasSameAnchorState(previousMark, nextMark)) {
			continue;
		}
		const existing = pending.get(nextMark.id);
		pending.set(nextMark.id, {
			id: nextMark.id,
			anchor: nextMark.anchor,
			status: nextMark.status,
			expectedStatus: existing?.expectedStatus ?? previousMark.status
		});
	}
}

export function reconcileEditorMarks(marks: SideMark[], document: Text, changes: ChangeDesc): SideMark[] {
	let source: string | null = null;
	const getSource = (): string => {
		source ??= document.toString();
		return source;
	};
	return marks.map((mark) => {
		if (mark.status === "resolved") {
			return mark;
		}

		const from = changes.mapPos(mark.anchor.startOffset, 1);
		const to = Math.max(from, changes.mapPos(mark.anchor.endOffset, -1));
		if (mark.status === "active" && document.sliceString(from, to) === mark.anchor.selectedText) {
			return { ...mark, anchor: createEditorTextAnchor(document, from, to) };
		}

		const anchor = relocateAnchor(getSource(), { ...mark.anchor, startOffset: from, endOffset: to }, {
			trustStoredPosition: false,
			allowUniqueTextFallback: false
		});
		return anchor
			? { ...mark, anchor, status: "active" as const }
			: { ...mark, status: "orphaned" as const };
	});
}

function hasSameAnchorState(left: SideMark, right: SideMark): boolean {
	return left.status === right.status
		&& left.anchor.startOffset === right.anchor.startOffset
		&& left.anchor.endOffset === right.anchor.endOffset
		&& left.anchor.selectedText === right.anchor.selectedText
		&& left.anchor.prefix === right.anchor.prefix
		&& left.anchor.suffix === right.anchor.suffix
		&& left.anchor.position.lineStart === right.anchor.position.lineStart
		&& left.anchor.position.lineEnd === right.anchor.position.lineEnd
		&& left.anchor.position.columnStart === right.anchor.position.columnStart
		&& left.anchor.position.columnEnd === right.anchor.position.columnEnd;
}
