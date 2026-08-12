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
	trigger.addEventListener("click", openComposer);
	composer.addEventListener("click", (event) => {
		event.stopPropagation();
		if (composer.classList.contains("is-editing")) {
			return;
		}
		openComposer(event);
	});
}
