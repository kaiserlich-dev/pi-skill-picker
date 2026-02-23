import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreMatch, filterSkills } from "../fuzzy";
import type { Skill } from "../types";

function makeSkill(name: string, namespace: string, description = ""): Skill {
	return { name, namespace, description, filePath: `/fake/${name}/SKILL.md`, source: "home" };
}

describe("scoreMatch", () => {
	it("exact match returns highest score", () => {
		assert.equal(scoreMatch("fizzy-cli", "fizzy-cli"), 10000);
	});

	it("starts-with returns high score", () => {
		const score = scoreMatch("fizzy", "fizzy-cli");
		assert.ok(score >= 5000, `Expected >= 5000, got ${score}`);
	});

	it("contains as substring returns medium score", () => {
		const score = scoreMatch("fizzy", "pi-fizzy-triage");
		assert.ok(score >= 1000 && score < 5000, `Expected 1000-5000, got ${score}`);
	});

	it("no match returns 0", () => {
		assert.equal(scoreMatch("xyz", "fizzy-cli"), 0);
	});

	it("word boundary gets bonus over mid-word", () => {
		const boundary = scoreMatch("cli", "fizzy-cli");       // after -
		const midWord = scoreMatch("cli", "aclient-tool");     // mid-word
		assert.ok(boundary > midWord, `boundary ${boundary} should beat midWord ${midWord}`);
	});

	it("fuzzy match with good consecutive run scores > 0", () => {
		const score = scoreMatch("fzcli", "fizzy-cli");
		assert.ok(score > 0, `Expected > 0 for fuzzy, got ${score}`);
	});

	it("fuzzy match with scattered chars returns 0 for short queries", () => {
		assert.equal(scoreMatch("fc", "fizzy-cli"), 0);
	});
});

describe("filterSkills", () => {
	const skills: Skill[] = [
		makeSkill("ad-creative", "marketing", "Generate ad creatives"),
		makeSkill("content-repurposer", "marketing", "Repurpose content for social media"),
		makeSkill("fizzy-cli", "tools", "Fizzy kanban CLI"),
		makeSkill("fizzy-triage", "tools", "Batch triage for Fizzy"),
		makeSkill("brave-search", "search", "Web search via Brave"),
		makeSkill("x-search", "search", "Search X/Twitter"),
	];

	it("empty query returns all skills", () => {
		const result = filterSkills(skills, "");
		assert.equal(result.length, skills.length);
	});

	it("namespace: prefix filters by namespace", () => {
		const result = filterSkills(skills, "marketing:");
		assert.ok(result.length === 2, `Expected 2 marketing skills, got ${result.length}`);
		assert.ok(result.every(s => s.namespace === "marketing"));
	});

	it("namespace:name narrows further", () => {
		const result = filterSkills(skills, "marketing:ad");
		assert.equal(result.length, 1);
		assert.equal(result[0].name, "ad-creative");
	});

	it("exact namespace match shows only that namespace", () => {
		const result = filterSkills(skills, "search");
		assert.ok(result.length === 2, `Expected 2 search skills, got ${result.length}`);
		assert.ok(result.every(s => s.namespace === "search"));
	});

	it("fuzzy matches across all skills", () => {
		const result = filterSkills(skills, "ad");
		assert.ok(result.length > 0, "Expected at least one match");
		assert.ok(result.some(s => s.name === "ad-creative"), "Expected ad-creative in results");
	});

	it("description match finds skills", () => {
		const result = filterSkills(skills, "kanban");
		assert.ok(result.length > 0, "Expected at least one match");
		assert.ok(result.some(s => s.name === "fizzy-cli"), "Expected fizzy-cli (has 'kanban' in desc)");
	});
});
