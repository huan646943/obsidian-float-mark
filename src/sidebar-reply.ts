export function bindReplyTrigger(
	trigger: HTMLButtonElement,
	textarea: HTMLTextAreaElement,
	composer: HTMLElement,
	card: HTMLElement
): void {
	const openComposer = (event: Event): void => {
		event.preventDefault();
		event.stopPropagation();
		composer.addClass("is-editing");
		card.addClass("is-composing");
		trigger.hide();
		textarea.show();
		textarea.focus();
	};
	composer.addEventListener("pointerdown", (event) => {
		if (event.button !== 0 || composer.classList.contains("is-editing")) {
			return;
		}
		openComposer(event);
	});
	trigger.addEventListener("click", openComposer);
	composer.addEventListener("click", (event) => {
		event.stopPropagation();
		if (composer.classList.contains("is-editing")) {
			return;
		}
		openComposer(event);
	});
}
