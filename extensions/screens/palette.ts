import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { Skill, DisplayItem, SkillUsage, PaletteAction, Theme } from "../types";
import { makeBox } from "../lib/render-helpers";
import { filterSkills, buildDisplayList } from "../fuzzy";

// ═══════════════════════════════════════════════════════════════════════════
// Palette render state — everything the screen needs to render + handle input
// ═══════════════════════════════════════════════════════════════════════════

export interface PaletteRenderState {
	allSkills: Skill[];
	displayItems: DisplayItem[];
	selectedIndex: number;
	query: string;
	queuedSkillName: string | null;
	recents: SkillUsage[];
}

export function createPaletteState(
	skills: Skill[],
	queuedSkillName: string | null,
	recents: SkillUsage[]
): PaletteRenderState {
	const displayItems = buildDisplayList(skills, recents);
	const selectedIndex = displayItems.findIndex(i => i.type === "skill");
	return {
		allSkills: skills,
		displayItems,
		selectedIndex: selectedIndex >= 0 ? selectedIndex : 0,
		query: "",
		queuedSkillName,
		recents,
	};
}

// ═══════════════════════════════════════════════════════════════════════════
// Input handling — returns actions, never mutates external state
// ═══════════════════════════════════════════════════════════════════════════

function firstSkillIndex(items: DisplayItem[]): number {
	return items.findIndex(i => i.type === "skill");
}

function nextSkillIndex(items: DisplayItem[], from: number, direction: 1 | -1): number {
	let idx = from + direction;
	while (idx >= 0 && idx < items.length) {
		if (items[idx].type === "skill") return idx;
		idx += direction;
	}
	// Wrap
	if (direction === 1) {
		const first = firstSkillIndex(items);
		return first >= 0 ? first : 0;
	}
	for (let i = items.length - 1; i >= 0; i--) {
		if (items[i].type === "skill") return i;
	}
	return 0;
}

function updateFilter(state: PaletteRenderState): void {
	const filtered = filterSkills(state.allSkills, state.query);
	// When searching: flat list sorted by score (no namespace grouping)
	// When browsing: grouped by namespace with recents at top
	if (state.query.trim()) {
		state.displayItems = filtered.map(skill => ({
			type: "skill" as const,
			skill,
			namespace: skill.namespace,
		}));
	} else {
		state.displayItems = buildDisplayList(filtered, state.recents);
	}
	const first = firstSkillIndex(state.displayItems);
	state.selectedIndex = first >= 0 ? first : 0;
}

/**
 * Handle input for the palette overlay.
 * Returns an action when the user makes a selection or cancels.
 * Otherwise mutates state and returns undefined.
 */
export function handlePaletteInput(
	state: PaletteRenderState,
	data: string
): PaletteAction | undefined {
	if (matchesKey(data, "escape")) {
		return { type: "cancel" };
	}

	if (matchesKey(data, "return")) {
		const item = state.displayItems[state.selectedIndex];
		if (item?.type === "skill" && item.skill) {
			if (item.skill.name === state.queuedSkillName) {
				return { type: "unqueue", skill: item.skill };
			} else {
				return { type: "select", skill: item.skill };
			}
		}
		return;
	}

	if (matchesKey(data, "up")) {
		state.selectedIndex = nextSkillIndex(state.displayItems, state.selectedIndex, -1);
		return;
	}

	if (matchesKey(data, "down")) {
		state.selectedIndex = nextSkillIndex(state.displayItems, state.selectedIndex, 1);
		return;
	}

	if (matchesKey(data, "backspace")) {
		if (state.query.length > 0) {
			state.query = state.query.slice(0, -1);
			updateFilter(state);
		}
		return;
	}

	// Printable
	if (data.length === 1 && data.charCodeAt(0) >= 32) {
		state.query += data;
		updateFilter(state);
	}

	return;
}

// ═══════════════════════════════════════════════════════════════════════════
// Rendering — pure function, no side effects
// ═══════════════════════════════════════════════════════════════════════════

export function renderPalette(
	state: PaletteRenderState,
	width: number,
	theme: Theme
): string[] {
	const boxW = Math.min(width, 76);
	const innerW = boxW - 2;
	const { row, emptyRow, divider, topBorder, bottomBorder } = makeBox(innerW, theme);

	const lines: string[] = [];

	// Top border
	lines.push(topBorder("Skills"));

	lines.push(emptyRow());

	// Search input
	const cursor = theme.fg("accent", "│");
	const queryDisplay = state.query
		? `${state.query}${cursor}`
		: `${cursor}${theme.fg("dim", theme.fg("muted", "type to filter... (namespace:skill)"))}`;
	lines.push(row(`${theme.fg("dim", "◎")}  ${queryDisplay}`));

	lines.push(emptyRow());
	lines.push(divider());

	// Skill list with namespace headers
	const maxVisible = 14;
	const skillItems = state.displayItems;

	if (skillItems.length === 0) {
		lines.push(emptyRow());
		lines.push(row(theme.fg("dim", theme.fg("muted", "No matching skills"))));
		lines.push(emptyRow());
	} else {
		// Compute visible window centered on selection
		const startIdx = Math.max(0, Math.min(
			state.selectedIndex - Math.floor(maxVisible / 2),
			skillItems.length - maxVisible
		));
		const endIdx = Math.min(startIdx + maxVisible, skillItems.length);

		lines.push(emptyRow());

		for (let i = startIdx; i < endIdx; i++) {
			const item = skillItems[i];

			if (item.type === "header") {
				const isRecent = item.namespace === "recent";
				const nsLabel = isRecent
					? theme.bold(theme.fg("success", "★ recent"))
					: theme.bold(theme.fg("warning", item.namespace!));
				lines.push(row(`${nsLabel}`));
				continue;
			}

			const skill = item.skill!;
			const isSelected = i === state.selectedIndex;
			const isQueued = skill.name === state.queuedSkillName;

			const prefix = isSelected ? theme.fg("accent", "▸") : theme.fg("dim", "·");
			const queuedBadge = isQueued ? ` ${theme.fg("success", "●")}` : "";
			const localBadge = skill.source === "local" ? ` ${theme.fg("dim", "[local]")}` : "";
			const nameStr = isSelected ? theme.bold(theme.fg("accent", skill.name)) : skill.name;
			// In flat mode (searching), show namespace tag; in grouped mode, skip it
			const nsTag = state.query.trim() ? theme.fg("dim", `${item.namespace} `) : "";
			// Show usage count for recent skills
			const recentEntry = item.namespace === "recent"
				? state.recents.find(r => r.name === skill.name)
				: null;
			const countTag = recentEntry && recentEntry.count > 1
				? theme.fg("dim", ` ×${recentEntry.count}`)
				: "";
			const usedWidth = visibleWidth(nsTag) + visibleWidth(skill.name) + visibleWidth(countTag) + visibleWidth(localBadge) + 14;
			const maxDescLen = Math.max(0, innerW - usedWidth);
			const descStr = maxDescLen > 3
				? theme.fg("dim", truncateToWidth(skill.description, maxDescLen, "…"))
				: "";
			const sep = descStr ? `  ${theme.fg("dim", "—")}  ` : "";

			lines.push(row(`  ${prefix} ${nsTag}${nameStr}${countTag}${localBadge}${queuedBadge}${sep}${descStr}`));
		}

		lines.push(emptyRow());

		// Scroll indicator
		if (skillItems.length > maxVisible) {
			const skillCount = skillItems.filter(i => i.type === "skill").length;
			const currentSkillIdx = skillItems.slice(0, state.selectedIndex + 1)
				.filter(i => i.type === "skill").length;
			lines.push(row(theme.fg("dim", `${currentSkillIdx}/${skillCount} skills`)));
			lines.push(emptyRow());
		}
	}

	// Divider
	lines.push(divider());
	lines.push(emptyRow());

	// Hints
	const hints = state.queuedSkillName
		? `${theme.fg("muted", "↑↓")} ${theme.fg("dim", "nav")}  ${theme.fg("muted", "enter")} ${theme.fg("dim", "select/unqueue")}  ${theme.fg("muted", "esc")} ${theme.fg("dim", "cancel")}`
		: `${theme.fg("muted", "↑↓")} ${theme.fg("dim", "nav")}  ${theme.fg("muted", "enter")} ${theme.fg("dim", "select")}  ${theme.fg("muted", "esc")} ${theme.fg("dim", "cancel")}`;
	lines.push(row(hints));

	// Bottom border
	lines.push(bottomBorder());

	// Center the box
	const leftPad = Math.max(0, Math.floor((width - boxW) / 2));
	if (leftPad > 0) {
		return lines.map(line => " ".repeat(leftPad) + line);
	}

	return lines;
}
