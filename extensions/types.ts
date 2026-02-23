export type Theme = Parameters<
	Parameters<import("@mariozechner/pi-coding-agent").ExtensionContext["ui"]["custom"]>[0]
>[1];

export interface Skill {
	name: string;
	namespace: string;
	description: string;
	filePath: string;
	source: "home" | "local";
}

export interface DisplayItem {
	type: "header" | "skill";
	namespace?: string;
	skill?: Skill;
}

export interface SkillUsage {
	name: string;
	namespace: string;
	timestamp: number;
	count: number;
}

export interface PaletteState {
	queuedSkill: Skill | null;
	recentSkills: SkillUsage[];
}

export interface SkillDirConfig {
	dir: string;
	recursive: boolean;
	source: "home" | "local";
}

export type PaletteAction =
	| { type: "select"; skill: Skill }
	| { type: "unqueue"; skill: Skill }
	| { type: "cancel" };
