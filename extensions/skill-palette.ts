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
import { Text } from "@mariozechner/pi-tui";
import type { Skill, PaletteState } from "./types";
import { loadSkills, getSkillContent } from "./skill-loader";
import { filterSkills } from "./fuzzy";
import { loadUsageFromDisk, recordUsage } from "./usage";
import { SkillPaletteComponent } from "./component";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function escapeXml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitize(s: string): string {
	return s.replace(/[\x00-\x1f]/g, "");
}

// ═══════════════════════════════════════════════════════════════════════════
// Module state
// ═══════════════════════════════════════════════════════════════════════════

const state: PaletteState = {
	queuedSkill: null,
	recentSkills: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// Extension Entry
// ═══════════════════════════════════════════════════════════════════════════

export default function skillPalette(pi: ExtensionAPI): void {
	// Load usage stats from disk on startup
	state.recentSkills = loadUsageFromDisk();

	// Custom renderer for skill-context messages
	pi.registerMessageRenderer("skill-context", (message, _options, theme) => {
		const rawContent = typeof message.content === "string"
			? message.content
			: Array.isArray(message.content)
				? (message.content as any[]).map((c: any) => c.type === "text" ? c.text || "" : "").join("")
				: "";

		const nameMatch = rawContent.match(/<skill name="([^"]+)">/);
		const skillName = nameMatch?.[1] || "Unknown Skill";

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

	// Shared: queue a skill (usage recorded on actual injection)
	function queueSkill(skill: Skill, ctx: ExtensionContext) {
		state.queuedSkill = skill;
		const safeName = sanitize(`${skill.namespace}:${skill.name}`);
		ctx.ui.setStatus("skill", `◆ ${safeName}`);
		ctx.ui.setWidget("skill", [
			`\x1b[2m◆ Skill: \x1b[0m\x1b[36m${safeName}\x1b[0m\x1b[2m — next message\x1b[0m`
		]);
		ctx.ui.notify(`Skill queued: ${safeName}`, "info");
	}

	// Shared palette logic
	async function openPalette(ctx: ExtensionContext) {
		const skills = loadSkills();

		if (skills.length === 0) {
			ctx.ui.notify("No skills found", "warning");
			return;
		}

		const result = await ctx.ui.custom<{ skill: Skill | null; action: "select" | "unqueue" | "cancel" }>(
			(_tui, theme, _kb, done) => new SkillPaletteComponent(
				skills,
				state.queuedSkill,
				state.recentSkills,
				theme,
				(skill, action) => done({ skill, action })
			),
			{ overlay: true, overlayOptions: { anchor: "center" as any, width: 78 } }
		);

		if (result.action === "select" && result.skill) {
			queueSkill(result.skill, ctx);
		} else if (result.action === "unqueue") {
			state.queuedSkill = null;
			ctx.ui.setStatus("skill", undefined);
			ctx.ui.setWidget("skill", undefined);
			ctx.ui.notify("Skill unqueued", "info");
		}
	}

	// Alt+K shortcut — instant palette
	pi.registerShortcut("alt+k", {
		description: "Open skill palette",
		handler: (ctx) => openPalette(ctx as ExtensionContext),
	});

	// /skill command
	pi.registerCommand("skill", {
		description: "Open namespace-aware skill palette (or Alt+K)",
		getArgumentCompletions,
		handler: async (args: string, ctx: ExtensionContext) => {
			// If called with a direct argument like /skill marketing:ad-creative, skip palette
			if (args.trim()) {
				const skills = loadSkills();
				const match = skills.find(s => `${s.namespace}:${s.name}` === args.trim() || s.name === args.trim());
				if (match) {
					queueSkill(match, ctx);
					return;
				}
			}

			await openPalette(ctx);
		},
	});

	// Inject queued skill into next message
	pi.on("before_agent_start", async (_event, _ctx) => {
		if (!state.queuedSkill) return {};

		const skill = state.queuedSkill;
		state.queuedSkill = null;

		_ctx.ui?.setStatus("skill", undefined);
		_ctx.ui?.setWidget("skill", undefined);

		// Record usage only when skill is actually injected
		recordUsage(state, skill);

		try {
			const content = getSkillContent(skill);
			return {
				message: {
					customType: "skill-context",
					content: `<skill name="${escapeXml(skill.namespace)}:${escapeXml(skill.name)}">\n${content}\n</skill>`,
					display: true,
				},
			};
		} catch {
			_ctx.ui?.notify(`Failed to load skill: ${skill.name}`, "warning");
			return {};
		}
	});
}
