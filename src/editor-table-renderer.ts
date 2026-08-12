import type { Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { renderActiveTableCellMarks, type SourceRange } from "./editor-table-cell-renderer";
import { buildMarkdownTableMaps } from "./markdown-table-map";
import { buildSourceLineStarts, getReadingMarksForSection, renderReadingMarks } from "./reading-view-renderer";
import type { SideMark } from "./types";

export { findCellSourceRangeForTest } from "./editor-table-cell-renderer";

const TABLE_WIDGET_SELECTOR = ".cm-embed-block.cm-table-widget.markdown-rendered";
const TABLE_ELEMENT_SELECTOR = "table.table-editor";
const ACTIVE_CELL_EDITOR_SELECTOR = ".table-cell-wrapper .cm-editor";

type MarkClickHandler = (markId: string, rect: DOMRect) => void;

export function renderEditorTableMarks(
	view: EditorView,
	source: string,
	lineStarts: number[],
	marks: SideMark[],
	onClick: MarkClickHandler
): void {
	const widgets = Array.from(view.dom.querySelectorAll<HTMLElement>(TABLE_WIDGET_SELECTOR));
	for (const widget of widgets) {
		const table = widget.querySelector<HTMLElement>(TABLE_ELEMENT_SELECTOR);
		if (!table) {
			continue;
		}
		const range = getWidgetSourceRange(view, widget, source);
		if (!range) {
			continue;
		}
		const startLine = view.state.doc.lineAt(range.from).number - 1;
		const endLine = view.state.doc.lineAt(range.to - 1).number - 1;
		const tableMarks = getReadingMarksForSection(source, marks, startLine, endLine, lineStarts);
		renderActiveTableCellMarks(table, source, range, tableMarks);
		renderReadingMarks(table, source, tableMarks, onClick, {
			excludedContainerSelector: ACTIVE_CELL_EDITOR_SELECTOR,
			tableSourceRange: range
		});
	}
}

function getWidgetSourceRange(view: EditorView, widget: HTMLElement, source: string): SourceRange | null {
	const parent = widget.parentNode;
	if (!parent) {
		return null;
	}
	const widgetIndex = Array.from(parent.childNodes).indexOf(widget);
	if (widgetIndex < 0) {
		return null;
	}
	try {
		const from = view.posAtDOM(parent, widgetIndex);
		const to = view.posAtDOM(parent, widgetIndex + 1);
		if (to <= from) {
			return null;
		}
		const tables = buildMarkdownTableMaps(source, { from, to });
		return tables.length === 1 ? tables[0]?.range || null : null;
	} catch {
		return null;
	}
}

export function getWidgetSourceRangeForTest(
	view: EditorView,
	widget: HTMLElement,
	source: string
): SourceRange | null {
	return getWidgetSourceRange(view, widget, source);
}

export class EditorTableMarkRenderer {
	private readonly observer: MutationObserver;
	private animationFrame: number | null = null;
	private cachedDocument: Text | null = null;
	private source = "";
	private lineStarts: number[] = [];
	private destroyed = false;

	constructor(
		private readonly view: EditorView,
		private readonly getMarks: () => SideMark[],
		private readonly onClick: MarkClickHandler
	) {
		const Observer = view.dom.ownerDocument.defaultView?.MutationObserver || MutationObserver;
		this.observer = new Observer(() => this.schedule());
		this.observe();
		this.schedule();
	}

	schedule(): void {
		if (this.destroyed || this.animationFrame !== null) {
			return;
		}
		const ownerWindow = this.view.dom.ownerDocument.defaultView;
		if (!ownerWindow) {
			return;
		}
		this.animationFrame = ownerWindow.requestAnimationFrame(() => {
			this.animationFrame = null;
			this.render();
		});
	}

	destroy(): void {
		this.destroyed = true;
		this.cancelScheduledRender();
		this.observer.disconnect();
		if (!this.hasTableWidgets()) {
			return;
		}
		this.refreshSourceSnapshot();
		renderEditorTableMarks(this.view, this.source, this.lineStarts, [], this.onClick);
	}

	private render(): void {
		this.observer.disconnect();
		try {
			if (!this.hasTableWidgets()) {
				return;
			}
			this.refreshSourceSnapshot();
			const marks = this.getMarks();
			renderEditorTableMarks(this.view, this.source, this.lineStarts, marks, this.onClick);
		} finally {
			if (!this.destroyed) {
				this.observe();
			}
		}
	}

	private hasTableWidgets(): boolean {
		return Boolean(this.view.dom.querySelector(TABLE_WIDGET_SELECTOR));
	}

	private refreshSourceSnapshot(): void {
		const document = this.view.state.doc;
		if (this.cachedDocument === document) {
			return;
		}
		this.cachedDocument = document;
		this.source = document.toString();
		this.lineStarts = buildSourceLineStarts(this.source);
	}

	private observe(): void {
		this.observer.observe(this.view.dom, { childList: true, subtree: true });
	}

	private cancelScheduledRender(): void {
		if (this.animationFrame === null) {
			return;
		}
		this.view.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.animationFrame);
		this.animationFrame = null;
	}
}
