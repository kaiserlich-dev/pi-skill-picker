import type { Skill, DisplayItem, SkillUsage } from "./types";

/**
 * Score how well a query matches text.
 *
 * Tiers (highest wins):
 *   1. Exact match (text === query)           → 10000
 *   2. Starts with query                      → 5000 + length bonus
 *   3. Contains query as substring            → 1000 + length bonus
 *   4. All query chars found in order,
 *      with enough consecutive runs           → 1-500
 *   5. No match                               → 0
 */
export function scoreMatch(query: string, text: string): number {
	const lq = query.toLowerCase();
	const lt = text.toLowerCase();

	// Exact
	if (lt === lq) return 10000;

	// Starts with
	if (lt.startsWith(lq)) return 5000 + (lq.length / lt.length) * 100;

	// Contains substring
	const subIdx = lt.indexOf(lq);
	if (subIdx >= 0) {
		// Bonus for matching at word boundary (after - or space)
		const atBoundary = subIdx === 0 || lt[subIdx - 1] === "-" || lt[subIdx - 1] === " ";
		return 1000 + (lq.length / lt.length) * 100 + (atBoundary ? 200 : 0);
	}

	// Fuzzy: all chars in order, but require decent consecutive runs
	let qi = 0, maxRun = 0, currentRun = 0, totalMatched = 0;
	for (let i = 0; i < lt.length && qi < lq.length; i++) {
		if (lt[i] === lq[qi]) {
			currentRun++;
			totalMatched++;
			maxRun = Math.max(maxRun, currentRun);
			qi++;
		} else {
			currentRun = 0;
		}
	}

	if (qi < lq.length) return 0; // Not all chars matched

	// Require at least 60% of query in one consecutive run, or query length >= 3
	// This kills random 2-char scattered matches
	if (lq.length <= 2 && maxRun < lq.length) return 0;
	if (maxRun < Math.ceil(lq.length * 0.4)) return 0;

	return 100 + maxRun * 30 + (totalMatched / lt.length) * 50;
}

export function filterSkills(skills: Skill[], query: string): Skill[] {
	if (!query.trim()) return skills;

	const lowerQuery = query.toLowerCase().trim();

	// Support namespace:query syntax
	const colonIdx = query.indexOf(":");
	if (colonIdx > 0) {
		const nsFilter = query.slice(0, colonIdx).toLowerCase();
		const nameQuery = query.slice(colonIdx + 1).trim();
		const nsSkills = skills.filter(s => s.namespace.toLowerCase().startsWith(nsFilter));
		if (!nameQuery) return nsSkills;
		const scored = nsSkills
			.map(skill => ({
				skill,
				score: Math.max(
					scoreMatch(nameQuery, skill.name),
					scoreMatch(nameQuery, skill.description) * 0.3,
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

	// Score each skill: name match heavily preferred over description
	const scored = skills
		.map(skill => {
			const nameScore = scoreMatch(lowerQuery, skill.name);
			const nsNameScore = scoreMatch(lowerQuery, `${skill.namespace}:${skill.name}`) * 0.9;
			// Description: substring only, no fuzzy — avoids garbage matches
			const descLower = skill.description.toLowerCase();
			const descScore = descLower.includes(lowerQuery)
				? 500 + (lowerQuery.length / descLower.length) * 100
				: 0;

			return {
				skill,
				score: Math.max(nameScore, nsNameScore, descScore),
			};
		})
		.filter(item => item.score > 0)
		.sort((a, b) => b.score - a.score);

	return scored.map(item => item.skill);
}

/**
 * Build display list (skills grouped by namespace with headers).
 */
export function buildDisplayList(skills: Skill[], recents: SkillUsage[]): DisplayItem[] {
	const items: DisplayItem[] = [];

	// Add recent section if we have any
	if (recents.length > 0) {
		const recentSkills = recents
			.map(r => skills.find(s => s.name === r.name))
			.filter((s): s is Skill => s != null);

		if (recentSkills.length > 0) {
			items.push({ type: "header", namespace: "recent" });
			for (const skill of recentSkills) {
				items.push({ type: "skill", skill, namespace: "recent" });
			}
		}
	}

	// Group remaining by namespace, excluding skills already shown in recents
	const recentNames = new Set(recents.map(r => r.name));
	const groups = new Map<string, Skill[]>();
	for (const skill of skills) {
		if (recentNames.has(skill.name)) continue;
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

	for (const ns of sortedNs) {
		items.push({ type: "header", namespace: ns });
		const sorted = groups.get(ns)!.sort((a, b) => a.name.localeCompare(b.name));
		for (const skill of sorted) {
			items.push({ type: "skill", skill, namespace: ns });
		}
	}

	return items;
}
