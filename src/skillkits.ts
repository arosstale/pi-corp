/**
 * Skillkits — role-based skill bundles for agents.
 *
 * Each role gets a curated set of skills. When an agent is dispatched,
 * the skillkit is injected as context for that agent's runtime.
 *
 * Skillkits can reference:
 * - Built-in pi skills (by name)
 * - External skill repos (cloned to ~/.pi-corp/skills/)
 * - Inline skill text
 */

import type { Database } from "bun:sqlite";
import { genId, emit } from "./db.ts";

export interface Skillkit {
	id: string;
	role: string;
	skills: SkillRef[];
}

export interface SkillRef {
	name: string;
	source: "builtin" | "repo" | "inline";
	path?: string;          // filesystem path for builtin/repo
	repoUrl?: string;       // git URL for repo skills
	content?: string;       // inline skill text
}

/**
 * Default skillkits per role.
 * These define what each agent type "knows" about.
 */
export const DEFAULT_SKILLKITS: Record<string, SkillRef[]> = {
	ceo: [
		{ name: "brainstorm", source: "builtin" },
		{ name: "fabric-patterns", source: "builtin" },
		{ name: "alex-hormozi-pitch", source: "builtin" },
		{ name: "pai-algorithm", source: "builtin" },
	],
	cto: [
		{ name: "brainstorm", source: "builtin" },
		{ name: "context-engineering", source: "builtin" },
		{ name: "cost-pipeline", source: "builtin" },
		{ name: "security-review", source: "builtin" },
		{ name: "john-carmack", source: "builtin" },
	],
	lead: [
		{ name: "brainstorm", source: "builtin" },
		{ name: "review", source: "builtin" },
		{ name: "commit", source: "builtin" },
		{ name: "tdd-workflow", source: "builtin" },
		{ name: "context-driven-dev", source: "builtin" },
	],
	builder: [
		{ name: "commit", source: "builtin" },
		{ name: "review", source: "builtin" },
		{ name: "tdd-workflow", source: "builtin" },
		{ name: "frontend-design", source: "builtin" },
		{ name: "code-simplifier", source: "builtin" },
		{ name: "bug-scanner", source: "builtin" },
	],
	scout: [
		{ name: "librarian", source: "builtin" },
		{ name: "research-lead", source: "builtin" },
		{ name: "github-repo-search", source: "builtin" },
		{ name: "web-search", source: "builtin" },
	],
	reviewer: [
		{ name: "review", source: "builtin" },
		{ name: "security-review", source: "builtin" },
		{ name: "code-simplifier", source: "builtin" },
		{ name: "bug-scanner", source: "builtin" },
	],
	designer: [
		{ name: "frontend-design", source: "builtin" },
		{ name: "canvas-design", source: "builtin" },
		{ name: "algorithmic-art", source: "builtin" },
		{ name: "web-design-guidelines", source: "builtin" },
		{ name: "visual-explainer", source: "builtin" },
	],
	marketer: [
		{ name: "product-marketing-context", source: "repo", repoUrl: "https://github.com/coreyhaines31/marketingskills" },
		{ name: "copywriting", source: "repo", repoUrl: "https://github.com/coreyhaines31/marketingskills" },
		{ name: "seo-audit", source: "repo", repoUrl: "https://github.com/coreyhaines31/marketingskills" },
		{ name: "page-cro", source: "repo", repoUrl: "https://github.com/coreyhaines31/marketingskills" },
		{ name: "content-strategy", source: "repo", repoUrl: "https://github.com/coreyhaines31/marketingskills" },
		{ name: "email-sequence", source: "repo", repoUrl: "https://github.com/coreyhaines31/marketingskills" },
		{ name: "launch-strategy", source: "repo", repoUrl: "https://github.com/coreyhaines31/marketingskills" },
		{ name: "analytics-tracking", source: "repo", repoUrl: "https://github.com/coreyhaines31/marketingskills" },
		{ name: "pricing-strategy", source: "repo", repoUrl: "https://github.com/coreyhaines31/marketingskills" },
		{ name: "alex-hormozi-pitch", source: "builtin" },
	],
};

/**
 * Get skillkit for a role, with DB overrides.
 */
export function getSkillkit(db: Database, role: string): SkillRef[] {
	// Check for custom overrides in DB
	const row = db.query("SELECT skills FROM skillkits WHERE role = ?").get(role) as { skills: string } | null;
	if (row) return JSON.parse(row.skills) as SkillRef[];
	return DEFAULT_SKILLKITS[role] ?? [];
}

/**
 * Save custom skillkit for a role.
 */
export function setSkillkit(db: Database, role: string, skills: SkillRef[]): void {
	db.run(
		"INSERT OR REPLACE INTO skillkits (role, skills, updated_at) VALUES (?, ?, datetime('now'))",
		[role, JSON.stringify(skills)],
	);
	emit(db, "skillkit.updated", "skillkit", role, { count: skills.length });
}

/**
 * Build a skill injection string for a runtime prompt.
 * This is what gets prepended to the agent's task.
 */
export function buildSkillInjection(skills: SkillRef[]): string {
	const names = skills.map((s) => s.name);
	if (names.length === 0) return "";
	return `Load and apply these skills: ${names.join(", ")}.\n\n`;
}
