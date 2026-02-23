import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, deriveNamespace } from "../skill-loader";

describe("parseFrontmatter", () => {
	it("parses valid frontmatter with name and description", () => {
		const result = parseFrontmatter("---\nname: test\ndescription: A test\n---\ncontent", "fallback");
		assert.equal(result.name, "test");
		assert.equal(result.description, "A test");
	});

	it("falls back to fallbackName when no frontmatter", () => {
		const result = parseFrontmatter("no frontmatter", "fallback-name");
		assert.equal(result.name, "fallback-name");
		assert.equal(result.description, "");
	});

	it("falls back when frontmatter has no closing ---", () => {
		const result = parseFrontmatter("---\nname: test\ndescription: broken", "fallback");
		assert.equal(result.name, "fallback");
		assert.equal(result.description, "");
	});

	it("handles frontmatter with only description", () => {
		const result = parseFrontmatter("---\ndescription: Just a desc\n---\ncontent", "my-skill");
		assert.equal(result.name, "my-skill");
		assert.equal(result.description, "Just a desc");
	});

	it("handles values with colons in them", () => {
		const result = parseFrontmatter("---\nname: test\ndescription: A test: with colons: in it\n---\ncontent", "fallback");
		assert.equal(result.name, "test");
		assert.equal(result.description, "A test: with colons: in it");
	});

	it("handles empty content", () => {
		const result = parseFrontmatter("", "fallback");
		assert.equal(result.name, "fallback");
		assert.equal(result.description, "");
	});
});

describe("deriveNamespace", () => {
	it("returns parent dir name for nested skill", () => {
		// .../marketing/ad-creative (skillDir)
		const result = deriveNamespace("/home/user/.pi/agent/skills/marketing/ad-creative");
		assert.equal(result, "marketing");
	});

	it('returns "other" when parent is "skills"', () => {
		const result = deriveNamespace("/home/user/.pi/agent/skills/my-skill");
		assert.equal(result, "other");
	});

	it('returns "other" when parent is "agent"', () => {
		const result = deriveNamespace("/home/user/.pi/agent/my-skill");
		assert.equal(result, "other");
	});

	it("returns parent name from hierarchy", () => {
		const result = deriveNamespace("/projects/tools/search/brave-search");
		assert.equal(result, "search");
	});
});
