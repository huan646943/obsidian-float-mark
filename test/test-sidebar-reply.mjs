import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

const stylesSource = await readFile("styles.css", "utf8");
const replyComposerStyles = stylesSource.match(/\.side-mark-reply-composer \{[\s\S]*?\n\}/)?.[0] || "";
const replyTriggerStyles = stylesSource.match(/\.side-mark-reply-trigger \{[\s\S]*?\n\}/)?.[0] || "";
const replyTextareaStyles = stylesSource.match(/\.side-mark-reply-composer textarea \{[\s\S]*?\n\}/)?.[0] || "";
assert.ok(replyComposerStyles, "reply composer styles must exist");
assert.ok(replyTriggerStyles, "reply trigger styles must exist");
assert.ok(replyTextareaStyles, "reply textarea styles must exist");
assert.doesNotMatch(replyComposerStyles, /position:/,
	"the reply composer must preserve the original layout");
assert.match(replyTriggerStyles, /display:\s*inline-flex/,
	"the reply trigger must preserve its original inline position");
assert.match(replyTriggerStyles, /padding:\s*0/, "the reply trigger must preserve its original spacing");
assert.match(replyTriggerStyles, /color:\s*var\(--text-muted\)/,
	"the reply trigger must preserve its original color");
assert.match(replyTriggerStyles, /opacity:\s*0/,
	"the reply trigger must preserve its original hover-only visibility");
assert.match(replyTriggerStyles, /pointer-events:\s*none/,
	"the hidden reply text must let the composer row receive the first click");
assert.match(stylesSource,
	/\.side-mark-card:hover \.side-mark-reply-trigger,[\s\S]*?opacity:\s*1;[\s\S]*?pointer-events:\s*auto/,
	"hover must preserve the original reply trigger visibility and hit testing");
assert.match(replyTextareaStyles, /height:\s*34px/,
	"the reply textarea must preserve its original compact height");

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/sidebar-reply.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/sidebar-reply.mjs"
});

const { bindReplyTrigger } = await import("./.tmp/sidebar-reply.mjs");
const dom = new JSDOM("<article><div><button>Reply...</button><textarea></textarea></div></article>", {
	pretendToBeVisual: true
});
const { HTMLElement } = dom.window;
HTMLElement.prototype.addClass = function addClass(className) {
	this.classList.add(className);
};
HTMLElement.prototype.hide = function hide() {
	this.style.display = "none";
};
HTMLElement.prototype.show = function show() {
	this.style.removeProperty("display");
};

const card = dom.window.document.querySelector("article");
const composer = dom.window.document.querySelector("div");
const trigger = dom.window.document.querySelector("button");
const textarea = dom.window.document.querySelector("textarea");
textarea.hide();

let cardClickCount = 0;
card.addEventListener("click", () => cardClickCount += 1);
bindReplyTrigger(trigger, textarea, composer, card);

trigger.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
assert.equal(cardClickCount, 0, "the first reply click must not reach the card navigation handler");
assert.equal(textarea.style.display, "", "the first reply click must reveal the textarea");
assert.equal(dom.window.document.activeElement, textarea, "the first reply click must focus the textarea");
assert.equal(trigger.style.display, "none", "the trigger must hide while composing");
assert.equal(composer.classList.contains("is-editing"), true);
assert.equal(card.classList.contains("is-composing"), true);

const blankCard = dom.window.document.createElement("article");
blankCard.innerHTML = "<div><button>Reply...</button><textarea></textarea></div>";
dom.window.document.body.appendChild(blankCard);
const blankComposer = blankCard.querySelector("div");
const blankTrigger = blankCard.querySelector("button");
const blankTextarea = blankCard.querySelector("textarea");
blankTextarea.hide();
let blankCardClickCount = 0;
blankCard.addEventListener("click", () => blankCardClickCount += 1);
bindReplyTrigger(blankTrigger, blankTextarea, blankComposer, blankCard);

blankComposer.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
assert.equal(blankCardClickCount, 0, "clicking blank composer space must not reach the card navigation handler");
assert.equal(blankTextarea.style.display, "", "clicking blank composer space must reveal the textarea");
assert.equal(dom.window.document.activeElement, blankTextarea,
	"clicking blank composer space must focus the textarea");
assert.equal(blankTrigger.style.display, "none", "the trigger must hide after a blank-space click");
assert.equal(blankComposer.classList.contains("is-editing"), true);
assert.equal(blankCard.classList.contains("is-composing"), true);
blankComposer.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
assert.equal(blankCardClickCount, 0, "blank composer clicks must remain isolated while editing");

console.log("sidebar reply tests passed");
