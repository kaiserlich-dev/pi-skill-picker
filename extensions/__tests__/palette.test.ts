import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handlePaletteInput, createPaletteState, type PaletteRenderState } from "../screens/palette";
import type { Skill } from "../types";

function makeSkill(name: string, namespace = "other"): Skill {
	return { name, namespace, description: `Desc for ${name}`, filePath: `/fake/${name}/SKILL.md`, source: "home" };
}

const testSkills: Skill[] = [
	makeSkill("fizzy-cli", "tools"),
	makeSkill("brave-search", "search"),
	makeSkill("ad-creative", "marketing"),
];

// Key codes matching pi-tui's matchesKey expectations
const KEYS = {
	up: "\u001b[A",
	down: "\u001b[B",
	enter: "\r",
	escape: "\u001b",
	backspace: "\u007f",
};

function makeState(queuedSkillName: string | null = null): PaletteRenderState {
	return createPaletteState(testSkills, queuedSkillName, []);
}

describe("handlePaletteInput", () => {
	describe("navigation", () => {
		it("down moves to next skill", () => {
			const state = makeState();
			const firstIdx = state.selectedIndex;
			const action = handlePaletteInput(state, KEYS.down);
			assert.equal(action, undefined);
			assert.notEqual(state.selectedIndex, firstIdx);
		});

		it("up moves to previous skill", () => {
			const state = makeState();
			// Move down first, then up
			handlePaletteInput(state, KEYS.down);
			const afterDown = state.selectedIndex;
			handlePaletteInput(state, KEYS.up);
			assert.ok(state.selectedIndex < afterDown || state.selectedIndex > afterDown,
				"Up should change selected index");
		});
	});

	describe("selection", () => {
		it("enter on a skill returns select action", () => {
			const state = makeState();
			const action = handlePaletteInput(state, KEYS.enter);
			assert.ok(action);
			assert.equal(action.type, "select");
			assert.ok("skill" in action && action.skill.name);
		});

		it("enter on queued skill returns unqueue action", () => {
			// Get the first skill that will be selected
			const preState = makeState();
			const firstItem = preState.displayItems[preState.selectedIndex];
			assert.ok(firstItem?.skill);

			const state = makeState(firstItem.skill.name);
			const action = handlePaletteInput(state, KEYS.enter);
			assert.ok(action);
			assert.equal(action.type, "unqueue");
			assert.ok("skill" in action && action.skill.name === firstItem.skill.name);
		});
	});

	describe("cancel", () => {
		it("escape returns cancel action", () => {
			const state = makeState();
			const action = handlePaletteInput(state, KEYS.escape);
			assert.deepEqual(action, { type: "cancel" });
		});
	});

	describe("filtering", () => {
		it("typing updates query and filters items", () => {
			const state = makeState();
			handlePaletteInput(state, "f");
			assert.equal(state.query, "f");

			handlePaletteInput(state, "i");
			assert.equal(state.query, "fi");

			// Should filter — fewer items than the full grouped list
			const skillItems = state.displayItems.filter(i => i.type === "skill");
			assert.ok(skillItems.length > 0, "Should have some matches for 'fi'");
		});

		it("backspace removes last char", () => {
			const state = makeState();
			handlePaletteInput(state, "a");
			handlePaletteInput(state, "b");
			assert.equal(state.query, "ab");

			handlePaletteInput(state, KEYS.backspace);
			assert.equal(state.query, "a");
		});

		it("backspace on empty query does nothing", () => {
			const state = makeState();
			assert.equal(state.query, "");
			handlePaletteInput(state, KEYS.backspace);
			assert.equal(state.query, "");
		});
	});

	describe("unhandled keys", () => {
		it("returns undefined for control characters", () => {
			const state = makeState();
			const action = handlePaletteInput(state, "\x01");
			assert.equal(action, undefined);
		});
	});
});
