import { StateEffect, type Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export const refreshSideMarkDecorations = StateEffect.define<void>();

export class SideMarkEditorViewRegistry {
	private readonly views = new Map<EditorView, () => string | null>();

	register(view: EditorView, getFilePath: () => string | null): void {
		this.views.set(view, getFilePath);
	}

	unregister(view: EditorView): void {
		this.views.delete(view);
	}

	refresh(filePath: string | null): void {
		for (const [view, getFilePath] of this.views) {
			if (filePath !== null && getFilePath() !== filePath) {
				continue;
			}
			view.dispatch({ effects: refreshSideMarkDecorations.of(undefined) });
		}
	}
}

export function shouldRefreshSideMarkDecorations(
	docChanged: boolean,
	transactions: readonly Transaction[]
): boolean {
	return docChanged || transactions.some((transaction) => transaction.effects.some((effect) =>
		effect.is(refreshSideMarkDecorations)
	));
}
