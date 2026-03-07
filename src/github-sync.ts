/**
 * GitHub Issues Sync — pull issues into tickets, push status back.
 *
 * Uses `gh` CLI (no API tokens needed if authenticated).
 */

import type { Database } from "./db.ts";
import { createTicket, listTickets, type Ticket } from "./tickets.ts";
import { emit } from "./db.ts";
import { execFileSync } from "node:child_process";

export interface GitHubIssue {
	number: number;
	title: string;
	body: string;
	labels: { name: string }[];
	state: string;
	url: string;
}

function runGh(args: string[]): string {
	try {
		return execFileSync("gh", args, { encoding: "utf-8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
	} catch {
		return "";
	}
}

/**
 * Fetch open issues from a GitHub repo via `gh` CLI.
 */
export async function fetchGitHubIssues(repo: string, limit = 20): Promise<GitHubIssue[]> {
	const stdout = runGh(["issue", "list", "--repo", repo, "--state", "open", "--limit", String(limit), "--json", "number,title,body,labels,state,url"]);
	if (!stdout) return [];
	try {
		return JSON.parse(stdout) as GitHubIssue[];
	} catch {
		return [];
	}
}

/**
 * Sync GitHub issues into corp tickets.
 */
export async function syncIssues(db: Database, repo: string, projectId: string): Promise<{ created: number; skipped: number }> {
	const issues = await fetchGitHubIssues(repo);
	const existing = listTickets(db).filter((t) => t.source === "github");
	const existingIds = new Set(existing.map((t) => t.source_id));

	let created = 0;
	let skipped = 0;

	for (const issue of issues) {
		const sourceId = `${repo}#${issue.number}`;
		if (existingIds.has(sourceId)) { skipped++; continue; }

		let priority = 3;
		const labelNames = issue.labels.map((l) => l.name.toLowerCase());
		if (labelNames.includes("critical") || labelNames.includes("p0")) priority = 1;
		else if (labelNames.includes("bug") || labelNames.includes("p1")) priority = 2;
		else if (labelNames.includes("enhancement")) priority = 2;

		createTicket(db, `[GH#${issue.number}] ${issue.title}`, {
			projectId,
			description: issue.body?.slice(0, 1000) ?? "",
			priority,
			source: "github",
			sourceId,
		});
		created++;
	}

	if (created > 0) emit(db, "github.synced", "project", projectId, { repo, created, skipped });
	return { created, skipped };
}

export async function commentOnIssue(repo: string, issueNumber: number, comment: string): Promise<boolean> {
	return !!runGh(["issue", "comment", String(issueNumber), "--repo", repo, "--body", comment]);
}

export async function closeIssue(repo: string, issueNumber: number): Promise<boolean> {
	return !!runGh(["issue", "close", String(issueNumber), "--repo", repo]);
}
