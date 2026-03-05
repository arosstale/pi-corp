/**
 * Workspace Isolation — each ticket gets its own git worktree.
 *
 * Symphony pattern: isolated workspace per issue.
 * No cross-contamination between agents working on different tickets.
 *
 * Layout:
 *   ~/Projects/myapp/                    ← main repo
 *   ~/Projects/myapp/.worktrees/
 *     ticket-abc123/                     ← worktree for ticket abc123
 *     ticket-def456/                     ← worktree for ticket def456
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface Worktree {
	path: string;
	branch: string;
	ticketId: string;
}

/**
 * Create a git worktree for a ticket.
 */
export async function createWorktree(repoPath: string, ticketId: string, baseBranch = "main"): Promise<Worktree | null> {
	const worktreeDir = join(repoPath, ".worktrees");
	mkdirSync(worktreeDir, { recursive: true });

	const branch = `ticket/${ticketId}`;
	const worktreePath = join(worktreeDir, `ticket-${ticketId}`);

	if (existsSync(worktreePath)) {
		return { path: worktreePath, branch, ticketId };
	}

	const proc = Bun.spawn(
		["git", "worktree", "add", worktreePath, "-b", branch, baseBranch],
		{ cwd: repoPath, stdout: "pipe", stderr: "pipe" },
	);
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		console.error(`Failed to create worktree: ${stderr}`);
		return null;
	}

	return { path: worktreePath, branch, ticketId };
}

/**
 * Remove a worktree after a ticket is done.
 */
export async function removeWorktree(repoPath: string, ticketId: string): Promise<boolean> {
	const worktreePath = join(repoPath, ".worktrees", `ticket-${ticketId}`);
	if (!existsSync(worktreePath)) return true;

	const proc = Bun.spawn(
		["git", "worktree", "remove", worktreePath, "--force"],
		{ cwd: repoPath, stdout: "pipe", stderr: "pipe" },
	);
	return (await proc.exited) === 0;
}

/**
 * List active worktrees.
 */
export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
	const proc = Bun.spawn(
		["git", "worktree", "list", "--porcelain"],
		{ cwd: repoPath, stdout: "pipe", stderr: "pipe" },
	);
	const stdout = await new Response(proc.stdout).text();
	if ((await proc.exited) !== 0) return [];

	const worktrees: Worktree[] = [];
	const blocks = stdout.split("\n\n").filter((b) => b.trim());

	for (const block of blocks) {
		const lines = block.split("\n");
		const pathLine = lines.find((l) => l.startsWith("worktree "));
		const branchLine = lines.find((l) => l.startsWith("branch "));

		if (pathLine && branchLine) {
			const path = pathLine.replace("worktree ", "");
			const branch = branchLine.replace("branch refs/heads/", "");
			if (branch.startsWith("ticket/")) {
				const ticketId = branch.replace("ticket/", "");
				worktrees.push({ path, branch, ticketId });
			}
		}
	}

	return worktrees;
}
