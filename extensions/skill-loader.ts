import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Skill, SkillDirConfig } from "./types";

export function parseFrontmatter(content: string, fallbackName: string): { name: string; description: string } {
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

export function getSkillContent(skill: Skill): string {
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
export function deriveNamespace(skillDir: string, symlinkSource?: string): string {
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

function scanSkillDir(
	dir: string,
	recursive: boolean,
	source: "home" | "local",
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
					loadSkillFile(skillFile, source, skillsByName, isSymlink ? entryPath : undefined);
				} else if (recursive) {
					scanSkillDir(entryPath, true, source, skillsByName, seen);
				}
			}
		}
	} catch { /* skip inaccessible dirs */ }
}

function loadSkillFile(filePath: string, source: "home" | "local", skillsByName: Map<string, Skill>, symlinkSource?: string): void {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const skillDir = path.dirname(filePath);
		const parentDirName = path.basename(skillDir);
		const { name, description } = parseFrontmatter(content, parentDirName);

		if (!description || skillsByName.has(name)) return;

		const namespace = deriveNamespace(skillDir, symlinkSource);

		skillsByName.set(name, { name, namespace, description, filePath, source });
	} catch { /* skip invalid */ }
}

export function loadSkills(): Skill[] {
	const skillsByName = new Map<string, Skill>();

	// Home dirs first (trusted) — dedup means home skills can't be shadowed by repo-local ones
	const dirs: SkillDirConfig[] = [
		{ dir: path.join(os.homedir(), ".codex", "skills"), recursive: true, source: "home" },
		{ dir: path.join(os.homedir(), ".claude", "skills"), recursive: false, source: "home" },
		{ dir: path.join(os.homedir(), ".pi", "agent", "skills"), recursive: true, source: "home" },
		{ dir: path.join(os.homedir(), ".pi", "skills"), recursive: true, source: "home" },
		// CWD dirs last — repo-local skills can't override home skills
		{ dir: path.join(process.cwd(), ".claude", "skills"), recursive: false, source: "local" },
		{ dir: path.join(process.cwd(), ".pi", "skills"), recursive: true, source: "local" },
	];

	for (const { dir, recursive, source } of dirs) {
		scanSkillDir(dir, recursive, source, skillsByName);
	}

	return Array.from(skillsByName.values());
}
