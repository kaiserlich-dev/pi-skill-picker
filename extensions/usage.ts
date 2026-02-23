import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Skill, SkillUsage, PaletteState } from "./types";

export const MAX_RECENTS = 8;
export const USAGE_FILE = path.join(os.homedir(), ".pi-skill-picker", "usage.json");

export function loadUsageFromDisk(): SkillUsage[] {
	try {
		const data = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
		return Array.isArray(data?.recents) ? data.recents : [];
	} catch {
		return [];
	}
}

export function saveUsageToDisk(state: PaletteState): void {
	try {
		const dir = path.dirname(USAGE_FILE);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(USAGE_FILE, JSON.stringify({ recents: state.recentSkills }, null, 2));
		fs.chmodSync(USAGE_FILE, 0o600);
	} catch {
		// silently fail — not critical
	}
}

export function recordUsage(state: PaletteState, skill: Skill): void {
	// Find existing entry to preserve count
	const existing = state.recentSkills.find(r => r.name === skill.name);
	const count = (existing?.count ?? 0) + 1;

	// Remove existing entry for this skill, add to front
	state.recentSkills = state.recentSkills.filter(r => r.name !== skill.name);
	state.recentSkills.unshift({ name: skill.name, namespace: skill.namespace, timestamp: Date.now(), count });
	if (state.recentSkills.length > MAX_RECENTS) state.recentSkills.length = MAX_RECENTS;

	// Persist to disk
	saveUsageToDisk(state);
}
