/**
 * pi-skill-palette — Namespace-aware skill palette
 *
 * Groups skills by category (derived from symlink targets or directory structure).
 * Usage: /skill — opens the palette overlay
 *
 * Filtering:
 *   - Type a namespace to see all skills in that group (e.g. "marketing")
 *   - Type "namespace:skill" to narrow further (e.g. "marketing:ad")
 *   - Or just type a skill name to fuzzy-match across all groups
 *
 * When a skill is selected, its content is injected alongside the next message.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, type Component, type Focusable } from "@mariozechner/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface Skill {
	name: string;
	namespace: string;
	description: string;
	filePath: string;
}

interface DisplayItem {
	type: "header" | "skill";
	namespace?: string;
	skill?: Skill;
}

interface PaletteState {
	queuedSkill: Skill | null;
}

const state: PaletteState = {
	queuedSkill: null,
};

// ═══════════════════════════════════════════════════════════════════════════
// Skill Loading
// ═══════════════════════════════════════════════════════════════════════════

function parseFrontmatter(content: string, fallbackName: string): { name: string; description: string } {
	if (!content.startsWith("---")) return { name: fallbackName, description: "" };

	const endIndex = content.indexOf("\n---", 3);
	if (endIndex === -1) return { name: fallbackName, description: "" };

	const fm = content.slice(4, endIndex);
	let name = fallbackName;
	let description = "";

	for (const line of fm.split("\n")) {
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) continue;
		const key = line.slice(0, colonIndex).trim();
		const value = line.slice(colonIndex + 1).trim();
		if (key === "name") name = value;
		if (key === "description") description = value;
	}

	return { name, description };
}

function getSkillContent(skill: Skill): string {
	const raw = fs.readFileSync(skill.filePath, "utf-8");
	if (!raw.startsWith("---")) return raw;
	const endIndex = raw.indexOf("\n---", 3);
	if (endIndex === -1) return raw;
	return raw.slice(endIndex + 4).trim();
}

/**
 * Derive namespace from a skill directory.
 *
 * Strategy:
 * 1. If the skill path is a symlink, resolve and use the parent of the target dir
 * 2. If the skill is nested (e.g., .../marketing/ad-creative/SKILL.md), use grandparent
 * 3. Fall back to "other"
 */
function deriveNamespace(skillDir: string, symlinkSource?: string): string {
	// If we have a symlink source, resolve the target and get its parent
	if (symlinkSource) {
		try {
			const target = fs.readlinkSync(symlinkSource);
			const resolvedTarget = path.isAbsolute(target) ? target : path.resolve(path.dirname(symlinkSource), target);
			const parentName = path.basename(path.dirname(resolvedTarget));
			// Skip if parent is a generic container like "skills"
			if (parentName && parentName !== "skills" && parentName !== "agent") {
				return parentName;
			}
		} catch {
			// Not a symlink or broken, fall through
		}
	}

	// Try the directory hierarchy: skill is at .../namespace/skill-name/SKILL.md
	const parentName = path.basename(path.dirname(skillDir));
	if (parentName && parentName !== "skills" && parentName !== "agent") {
		return parentName;
	}

	return "other";
}

interface SkillDirConfig {
	dir: string;
	recursive: boolean;
}

function scanSkillDir(
	dir: string,
	recursive: boolean,
	skillsByName: Map<string, Skill>,
	visited?: Set<string>
): void {
	if (!fs.existsSync(dir)) return;

	const seen = visited ?? new Set<string>();
	let realDir: string;
	try { realDir = fs.realpathSync(dir); } catch { realDir = dir; }
	if (seen.has(realDir)) return;
	seen.add(realDir);

	try {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

			const entryPath = path.join(dir, entry.name);
			let isDirectory = entry.isDirectory();
			let isFile = entry.isFile();
			const isSymlink = entry.isSymbolicLink();

			if (isSymlink) {
				try {
					const stats = fs.statSync(entryPath);
					isDirectory = stats.isDirectory();
					isFile = stats.isFile();
				} catch { continue; }
			}

			if (isDirectory) {
				// Check for SKILL.md inside
				const skillFile = path.join(entryPath, "SKILL.md");
				if (fs.existsSync(skillFile)) {
					loadSkillFile(skillFile, skillsByName, isSymlink ? entryPath : undefined);
				} else if (recursive) {
					scanSkillDir(entryPath, true, skillsByName, seen);
				}
			}
		}
	} catch { /* skip inaccessible dirs */ }
}

function loadSkillFile(filePath: string, skillsByName: Map<string, Skill>, symlinkSource?: string): void {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const skillDir = path.dirname(filePath);
		const parentDirName = path.basename(skillDir);
		const { name, description } = parseFrontmatter(content, parentDirName);

		if (!description || skillsByName.has(name)) return;

		const namespace = deriveNamespace(skillDir, symlinkSource);

		skillsByName.set(name, { name, namespace, description, filePath });
	} catch { /* skip invalid */ }
}

function loadSkills(): Skill[] {
	const skillsByName = new Map<string, Skill>();

	const dirs: SkillDirConfig[] = [
		{ dir: path.join(os.homedir(), ".codex", "skills"), recursive: true },
		{ dir: path.join(os.homedir(), ".claude", "skills"), recursive: false },
		{ dir: path.join(process.cwd(), ".claude", "skills"), recursive: false },
		{ dir: path.join(os.homedir(), ".pi", "agent", "skills"), recursive: true },
		{ dir: path.join(os.homedir(), ".pi", "skills"), recursive: true },
		{ dir: path.join(process.cwd(), ".pi", "skills"), recursive: true },
	];

	for (const { dir, recursive } of dirs) {
		scanSkillDir(dir, recursive, skillsByName);
	}

	return Array.from(skillsByName.values());
}

// ═══════════════════════════════════════════════════════════════════════════
// Fuzzy Matching
// ═══════════════════════════════════════════════════════════════════════════

function fuzzyScore(query: string, text: string): number {
	const lq = query.toLowerCase();
	const lt = text.toLowerCase();

	if (lt.includes(lq)) return 100 + (lq.length / lt.length) * 50;

	let score = 0, qi = 0, consecutive = 0;
	for (let i = 0; i < lt.length && qi < lq.length; i++) {
		if (lt[i] === lq[qi]) {
			score += 10 + consecutive;
			consecutive += 5;
			qi++;
		} else {
			consecutive = 0;
		}
	}
	return qi === lq.length ? score : 0;
}

function filterSkills(skills: Skill[], query: string): Skill[] {
	if (!query.trim()) return skills;

	const lowerQuery = query.toLowerCase().trim();

	// Support namespace:query syntax
	const colonIdx = query.indexOf(":");
	if (colonIdx > 0) {
		const nsFilter = query.slice(0, colonIdx).toLowerCase();
		const nameQuery = query.slice(colonIdx + 1).trim();
		const nsSkills = skills.filter(s => s.namespace.toLowerCase().startsWith(nsFilter));
		if (!nameQuery) return nsSkills;
		// Further filter within namespace
		const scored = nsSkills
			.map(skill => ({
				skill,
				score: Math.max(
					fuzzyScore(nameQuery, skill.name),
					fuzzyScore(nameQuery, skill.description) * 0.7,
				),
			}))
			.filter(item => item.score > 0)
			.sort((a, b) => b.score - a.score);
		return scored.map(item => item.skill);
	}

	// If query exactly matches a namespace, show only that namespace
	const exactNsMatch = skills.filter(s => s.namespace.toLowerCase() === lowerQuery);
	if (exactNsMatch.length > 0) return exactNsMatch;

	// If query is a prefix of exactly one namespace, show that namespace
	const nsMatches = [...new Set(skills.map(s => s.namespace.toLowerCase()))].filter(ns => ns.startsWith(lowerQuery));
	if (nsMatches.length === 1) {
		return skills.filter(s => s.namespace.toLowerCase() === nsMatches[0]);
	}

	// General fuzzy match on skill name and description
	const scored = skills
		.map(skill => ({
			skill,
			score: Math.max(
				fuzzyScore(lowerQuery, skill.name),
				fuzzyScore(lowerQuery, skill.description) * 0.7,
				fuzzyScore(lowerQuery, `${skill.namespace}:${skill.name}`) * 0.9,
			),
		}))
		.filter(item => item.score > 0)
		.sort((a, b) => b.score - a.score);

	return scored.map(item => item.skill);
}

// ═══════════════════════════════════════════════════════════════════════════
// Build display list (skills grouped by namespace with headers)
// ═══════════════════════════════════════════════════════════════════════════

function buildDisplayList(skills: Skill[]): DisplayItem[] {
	// Group by namespace
	const groups = new Map<string, Skill[]>();
	for (const skill of skills) {
		const list = groups.get(skill.namespace) || [];
		list.push(skill);
		groups.set(skill.namespace, list);
	}

	// Sort namespaces, put "other" last
	const sortedNs = Array.from(groups.keys()).sort((a, b) => {
		if (a === "other") return 1;
		if (b === "other") return -1;
		return a.localeCompare(b);
	});

	const items: DisplayItem[] = [];
	for (const ns of sortedNs) {
		items.push({ type: "header", namespace: ns });
		const sorted = groups.get(ns)!.sort((a, b) => a.name.localeCompare(b.name));
		for (const skill of sorted) {
			items.push({ type: "skill", skill, namespace: ns });
		}
	}

	return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// Palette Component
// ═══════════════════════════════════════════════════════════════════════════

class SkillPaletteComponent implements Component, Focusable {
	private allSkills: Skill[];
	private displayItems: DisplayItem[];
	private selectedIndex = 0;  // index into displayItems (only skill items are selectable)
	private query = "";
	private queuedSkillName: string | null;
	private inactivityTimeout: ReturnType<typeof setTimeout> | null = null;

	// Focusable
	private _focused = false;
	get focused() { return this._focused; }
	set focused(v: boolean) { this._focused = v; }

	constructor(
		skills: Skill[],
		queuedSkill: Skill | null,
		private done: (skill: Skill | null, action: "select" | "unqueue" | "cancel") => void
	) {
		this.allSkills = skills;
		this.queuedSkillName = queuedSkill?.name ?? null;
		this.displayItems = buildDisplayList(skills);
		this.selectedIndex = this.firstSkillIndex();
		this.resetInactivity();
	}

	private resetInactivity() {
		if (this.inactivityTimeout) clearTimeout(this.inactivityTimeout);
		this.inactivityTimeout = setTimeout(() => {
			this.done(null, "cancel");
		}, 60000);
	}

	private firstSkillIndex(): number {
		return this.displayItems.findIndex(i => i.type === "skill");
	}

	private nextSkillIndex(from: number, direction: 1 | -1): number {
		let idx = from + direction;
		while (idx >= 0 && idx < this.displayItems.length) {
			if (this.displayItems[idx].type === "skill") return idx;
			idx += direction;
		}
		// Wrap
		if (direction === 1) return this.firstSkillIndex();
		for (let i = this.displayItems.length - 1; i >= 0; i--) {
			if (this.displayItems[i].type === "skill") return i;
		}
		return 0;
	}

	private updateFilter() {
		const filtered = filterSkills(this.allSkills, this.query);
		this.displayItems = buildDisplayList(filtered);
		const first = this.firstSkillIndex();
		this.selectedIndex = first >= 0 ? first : 0;
	}

	handleInput(data: string): void {
		this.resetInactivity();

		if (matchesKey(data, "escape")) {
			this.cleanup();
			this.done(null, "cancel");
			return;
		}

		if (matchesKey(data, "return")) {
			const item = this.displayItems[this.selectedIndex];
			if (item?.type === "skill" && item.skill) {
				this.cleanup();
				if (item.skill.name === this.queuedSkillName) {
					this.done(item.skill, "unqueue");
				} else {
					this.done(item.skill, "select");
				}
			}
			return;
		}

		if (matchesKey(data, "up")) {
			this.selectedIndex = this.nextSkillIndex(this.selectedIndex, -1);
			return;
		}

		if (matchesKey(data, "down")) {
			this.selectedIndex = this.nextSkillIndex(this.selectedIndex, 1);
			return;
		}

		if (matchesKey(data, "backspace")) {
			if (this.query.length > 0) {
				this.query = this.query.slice(0, -1);
				this.updateFilter();
			}
			return;
		}

		// Printable
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.query += data;
			this.updateFilter();
		}
	}

	render(width: number): string[] {
		const boxW = Math.min(width, 76);
		const innerW = boxW - 2;
		const lines: string[] = [];

		const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
		const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
		const cyan = (s: string) => `\x1b[36m${s}\x1b[39m`;
		const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
		const italic = (s: string) => `\x1b[3m${s}\x1b[23m`;
		const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;

		const row = (content: string) => {
			const vis = visibleWidth(content);
			const pad = Math.max(0, innerW - vis - 1);
			return dim("│") + " " + content + " ".repeat(pad) + dim("│");
		};

		const emptyRow = () => dim("│") + " ".repeat(innerW) + dim("│");

		// Top border
		const titleText = " Skills ";
		const borderLen = innerW - titleText.length;
		const leftB = Math.floor(borderLen / 2);
		const rightB = borderLen - leftB;
		lines.push(dim("╭" + "─".repeat(leftB)) + dim(titleText) + dim("─".repeat(rightB) + "╮"));

		lines.push(emptyRow());

		// Search input
		const cursor = cyan("│");
		const queryDisplay = this.query
			? `${this.query}${cursor}`
			: `${cursor}${dim(italic("type to filter... (namespace:skill)"))}`;
		lines.push(row(`${dim("◎")}  ${queryDisplay}`));

		lines.push(emptyRow());
		lines.push(dim("├" + "─".repeat(innerW) + "┤"));

		// Skill list with namespace headers
		const maxVisible = 14;
		const skillItems = this.displayItems;

		if (skillItems.length === 0) {
			lines.push(emptyRow());
			lines.push(row(dim(italic("No matching skills"))));
			lines.push(emptyRow());
		} else {
			// Compute visible window centered on selection
			const startIdx = Math.max(0, Math.min(
				this.selectedIndex - Math.floor(maxVisible / 2),
				skillItems.length - maxVisible
			));
			const endIdx = Math.min(startIdx + maxVisible, skillItems.length);

			lines.push(emptyRow());

			for (let i = startIdx; i < endIdx; i++) {
				const item = skillItems[i];

				if (item.type === "header") {
					const nsLabel = bold(yellow(item.namespace!));
					lines.push(row(`${nsLabel}`));
					continue;
				}

				const skill = item.skill!;
				const isSelected = i === this.selectedIndex;
				const isQueued = skill.name === this.queuedSkillName;

				const prefix = isSelected ? cyan("▸") : dim("·");
				const queuedBadge = isQueued ? ` ${green("●")}` : "";
				const nameStr = isSelected ? bold(cyan(skill.name)) : skill.name;
				const maxDescLen = Math.max(0, innerW - visibleWidth(skill.name) - 14);
				const descStr = maxDescLen > 3
					? dim(truncateToWidth(skill.description, maxDescLen, "…"))
					: "";
				const sep = descStr ? `  ${dim("—")}  ` : "";

				lines.push(row(`  ${prefix} ${nameStr}${queuedBadge}${sep}${descStr}`));
			}

			lines.push(emptyRow());

			// Scroll indicator
			if (skillItems.length > maxVisible) {
				const skillCount = skillItems.filter(i => i.type === "skill").length;
				const currentSkillIdx = skillItems.slice(0, this.selectedIndex + 1)
					.filter(i => i.type === "skill").length;
				lines.push(row(dim(`${currentSkillIdx}/${skillCount} skills`)));
				lines.push(emptyRow());
			}
		}

		// Divider
		lines.push(dim("├" + "─".repeat(innerW) + "┤"));
		lines.push(emptyRow());

		// Hints
		const hints = this.queuedSkillName
			? `${dim(italic("↑↓"))} ${dim("nav")}  ${dim(italic("enter"))} ${dim("select/unqueue")}  ${dim(italic("esc"))} ${dim("cancel")}`
			: `${dim(italic("↑↓"))} ${dim("nav")}  ${dim(italic("enter"))} ${dim("select")}  ${dim(italic("esc"))} ${dim("cancel")}`;
		lines.push(row(hints));

		// Bottom border
		lines.push(dim("╰" + "─".repeat(innerW) + "╯"));

		// Center the box
		const leftPad = Math.max(0, Math.floor((width - boxW) / 2));
		if (leftPad > 0) {
			return lines.map(line => " ".repeat(leftPad) + line);
		}

		return lines;
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

// ═══════════════════════════════════════════════════════════════════════════
// Extension Entry
// ═══════════════════════════════════════════════════════════════════════════

export default function skillPalette(pi: ExtensionAPI): void {
	// Custom renderer for skill-context messages
	pi.registerMessageRenderer("skill-context", (message, options, theme) => {
		const rawContent = typeof message.content === "string"
			? message.content
			: Array.isArray(message.content)
				? (message.content as any[]).map((c: any) => c.type === "text" ? c.text || "" : "").join("")
				: "";

		const nameMatch = rawContent.match(/<skill name="([^"]+)">/);
		const skillName = nameMatch?.[1] || "Unknown Skill";

		const { Text } = require("@mariozechner/pi-tui");
		const header = theme.fg("accent", "◆ ") +
			theme.fg("customMessageLabel", theme.bold("Skill: ")) +
			theme.fg("accent", skillName);

		return new Text(header, 0, 0);
	});

	// Argument completions for /skill — suggest namespaces and namespace:skill combos
	function getArgumentCompletions(prefix: string) {
		const skills = loadSkills();
		const namespaces = [...new Set(skills.map(s => s.namespace))].sort();

		const items: { value: string; label: string }[] = [];

		if (!prefix || !prefix.includes(":")) {
			// Suggest namespaces
			for (const ns of namespaces) {
				if (!prefix || ns.startsWith(prefix.toLowerCase())) {
					const count = skills.filter(s => s.namespace === ns).length;
					items.push({ value: `${ns}:`, label: `${ns}: (${count} skills)` });
				}
			}
		}

		// Also suggest individual skills matching
		const colonIdx = prefix.indexOf(":");
		const nsPrefix = colonIdx > 0 ? prefix.slice(0, colonIdx) : null;
		const namePrefix = colonIdx > 0 ? prefix.slice(colonIdx + 1) : prefix;

		for (const skill of skills) {
			if (nsPrefix && !skill.namespace.startsWith(nsPrefix.toLowerCase())) continue;
			if (namePrefix && !skill.name.startsWith(namePrefix.toLowerCase())) continue;
			items.push({
				value: `${skill.namespace}:${skill.name}`,
				label: `${skill.namespace}:${skill.name}`,
			});
		}

		return items.length > 0 ? items.slice(0, 20) : null;
	}

	// /skill command
	pi.registerCommand("skill", {
		description: "Open namespace-aware skill palette",
		getArgumentCompletions,
		handler: async (args: string, ctx: ExtensionContext) => {
			const skills = loadSkills();

			if (skills.length === 0) {
				ctx.ui.notify("No skills found", "warning");
				return;
			}

			// If called with a direct argument like /skill marketing:ad-creative, skip palette
			if (args.trim()) {
				const match = skills.find(s => `${s.namespace}:${s.name}` === args.trim() || s.name === args.trim());
				if (match) {
					state.queuedSkill = match;
					ctx.ui.setStatus("skill", `◆ ${match.namespace}:${match.name}`);
					ctx.ui.setWidget("skill", [
						`\x1b[2m◆ Skill: \x1b[0m\x1b[36m${match.namespace}:${match.name}\x1b[0m\x1b[2m — next message\x1b[0m`
					]);
					ctx.ui.notify(`Skill queued: ${match.namespace}:${match.name}`, "info");
					return;
				}
			}

			// Show palette overlay
			const result = await ctx.ui.custom<{ skill: Skill | null; action: "select" | "unqueue" | "cancel" }>(
				(_tui, _theme, _kb, done) => new SkillPaletteComponent(
					skills,
					state.queuedSkill,
					(skill, action) => done({ skill, action })
				),
				{ overlay: true, overlayOptions: { anchor: "center" as any, width: 78 } }
			);

			if (result.action === "select" && result.skill) {
				state.queuedSkill = result.skill;
				ctx.ui.setStatus("skill", `◆ ${result.skill.namespace}:${result.skill.name}`);
				ctx.ui.setWidget("skill", [
					`\x1b[2m◆ Skill: \x1b[0m\x1b[36m${result.skill.namespace}:${result.skill.name}\x1b[0m\x1b[2m — next message\x1b[0m`
				]);
				ctx.ui.notify(`Skill queued: ${result.skill.namespace}:${result.skill.name}`, "info");
			} else if (result.action === "unqueue") {
				state.queuedSkill = null;
				ctx.ui.setStatus("skill", undefined);
				ctx.ui.setWidget("skill", undefined);
				ctx.ui.notify("Skill unqueued", "info");
			}
		},
	});

	// Inject queued skill into next message
	pi.on("before_agent_start", async (_event, _ctx) => {
		if (!state.queuedSkill) return {};

		const skill = state.queuedSkill;
		state.queuedSkill = null;

		_ctx.ui?.setStatus("skill", undefined);
		_ctx.ui?.setWidget("skill", undefined);

		try {
			const content = getSkillContent(skill);
			return {
				message: {
					customType: "skill-context",
					content: `<skill name="${skill.namespace}:${skill.name}">\n${content}\n</skill>`,
					display: true,
				},
			};
		} catch {
			_ctx.ui?.notify(`Failed to load skill: ${skill.name}`, "warning");
			return {};
		}
	});
}
