/**
 * GitHub Issues Sync — pull issues into tickets, push status back.
 *
 * Uses `gh` CLI (no API tokens needed if authenticated).
 *
 * Sync flow:
 *   1. `gh issue list` → parse JSON
 *   2. For each issue not already tracked → createTicket(source: "github")
 *   3. When ticket completes → `gh issue comment` with result
 *   4. Optionally close issue on completion
 */

import type { Database } from "bun:sqlite";
import { createTicket, listTickets, type Ticket } from "./tickets.ts";
import { emit } from "./db.ts";

export interface GitHubIssue {
	number: number;
	title: string;
	body: string;
	labels: { name: string }[];
	state: string;
	url: string;
}

/**
 * Fetch open issues from a GitHub repo via `gh` CLI.
 */
export async function fetchGitHubIssues(repo: string, limit = 20): Promise<GitHubIssue[]> {
	const proc = Bun.spawn(
		["gh", "issue", "list", "--repo", repo, "--state", "open", "--limit", String(limit), "--json", "number,title,body,labels,state,url"],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const stdout = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;
	if (exitCode !== 0) return [];
	try {
		return JSON.parse(stdout) as GitHubIssue[];
	} catch {
		return [];
	}
}

/**
 * Sync GitHub issues into corp tickets.
 * Skips issues already tracked (by source_id).
 */
export async function syncIssues(db: Database, repo: string, projectId: string): Promise<{ created: number; skipped: number }> {
	const issues = await fetchGitHubIssues(repo);
	const existing = listTickets(db).filter((t) => t.source === "github");
	const existingIds = new Set(existing.map((t) => t.source_id));

	let created = 0;
	let skipped = 0;

	for (const issue of issues) {
		const sourceId = `${repo}#${issue.number}`;
		if (existingIds.has(sourceId)) {
			skipped++;
			continue;
		}

		// Map labels to priority
		let priority = 3;
		const labelNames = issue.labels.map((l) => l.name.toLowerCase());
		if (labelNames.includes("critical") || labelNames.includes("p0") || labelNames.includes("urgent")) priority = 1;
		else if (labelNames.includes("bug") || labelNames.includes("p1")) priority = 2;
		else if (labelNames.includes("enhancement") || labelNames.includes("p2")) priority = 2;
		else if (labelNames.includes("good first issue") || labelNames.includes("p3")) priority = 3;

		createTicket(db, `[GH#${issue.number}] ${issue.title}`, {
			projectId,
			description: issue.body?.slice(0, 1000) ?? "",
			priority,
			source: "github",
			sourceId,
		});
		created++;
	}

	if (created > 0) {
		emit(db, "github.synced", "project", projectId, { repo, created, skipped });
	}

	return { created, skipped };
}

/**
 * Comment on a GitHub issue when a ticket completes.
 */
export async function commentOnIssue(repo: string, issueNumber: number, comment: string): Promise<boolean> {
	const proc = Bun.spawn(
		["gh", "issue", "comment", String(issueNumber), "--repo", repo, "--body", comment],
		{ stdout: "pipe", stderr: "pipe" },
	);
	return (await proc.exited) === 0;
}

/**
 * Close a GitHub issue.
 */
export async function closeIssue(repo: string, issueNumber: number): Promise<boolean> {
	const proc = Bun.spawn(
		["gh", "issue", "close", String(issueNumber), "--repo", repo],
		{ stdout: "pipe", stderr: "pipe" },
	);
	return (await proc.exited) === 0;
}
