import type { Component, Focusable } from "@mariozechner/pi-tui";
import type { Skill, SkillUsage, PaletteAction, Theme } from "./types";
import { createPaletteState, handlePaletteInput, renderPalette, type PaletteRenderState } from "./screens/palette";

export class SkillPaletteComponent implements Component, Focusable {
	private state: PaletteRenderState;
	private theme: Theme | null = null;
	private inactivityTimeout: ReturnType<typeof setTimeout> | null = null;

	// Focusable
	private _focused = false;
	get focused() { return this._focused; }
	set focused(v: boolean) { this._focused = v; }

	constructor(
		skills: Skill[],
		queuedSkill: Skill | null,
		recents: SkillUsage[],
		theme: Theme,
		private done: (skill: Skill | null, action: "select" | "unqueue" | "cancel") => void
	) {
		this.theme = theme;
		this.state = createPaletteState(skills, queuedSkill?.name ?? null, recents);
		this.resetInactivity();
	}

	private resetInactivity() {
		if (this.inactivityTimeout) clearTimeout(this.inactivityTimeout);
		this.inactivityTimeout = setTimeout(() => {
			this.done(null, "cancel");
		}, 60000);
	}

	handleInput(data: string): void {
		this.resetInactivity();

		const action: PaletteAction | undefined = handlePaletteInput(this.state, data);
		if (!action) return;

		this.cleanup();

		switch (action.type) {
			case "select":
				this.done(action.skill, "select");
				break;
			case "unqueue":
				this.done(action.skill, "unqueue");
				break;
			case "cancel":
				this.done(null, "cancel");
				break;
		}
	}

	render(width: number): string[] {
		if (!this.theme) return [];
		return renderPalette(this.state, width, this.theme);
	}

	invalidate() {}

	private cleanup() {
		if (this.inactivityTimeout) {
			clearTimeout(this.inactivityTimeout);
			this.inactivityTimeout = null;
		}
	}

	dispose() {
		this.cleanup();
	}
}
