/**
 * Workspace Isolation — each ticket gets its own git worktree.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export interface Worktree {
	path: string;
	branch: string;
	ticketId: string;
}

function runGit(args: string[], cwd: string): { stdout: string; ok: boolean } {
	try {
		const stdout = execFileSync("git", args, { cwd, encoding: "utf-8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
		return { stdout, ok: true };
	} catch {
		return { stdout: "", ok: false };
	}
}

export async function createWorktree(repoPath: string, ticketId: string, baseBranch = "main"): Promise<Worktree | null> {
	const worktreeDir = join(repoPath, ".worktrees");
	mkdirSync(worktreeDir, { recursive: true });

	const branch = `ticket/${ticketId}`;
	const worktreePath = join(worktreeDir, `ticket-${ticketId}`);

	if (existsSync(worktreePath)) return { path: worktreePath, branch, ticketId };

	const { ok } = runGit(["worktree", "add", worktreePath, "-b", branch, baseBranch], repoPath);
	if (!ok) return null;

	return { path: worktreePath, branch, ticketId };
}

export async function removeWorktree(repoPath: string, ticketId: string): Promise<boolean> {
	const worktreePath = join(repoPath, ".worktrees", `ticket-${ticketId}`);
	if (!existsSync(worktreePath)) return true;
	return runGit(["worktree", "remove", worktreePath, "--force"], repoPath).ok;
}

export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
	const { stdout, ok } = runGit(["worktree", "list", "--porcelain"], repoPath);
	if (!ok) return [];

	const worktrees: Worktree[] = [];
	for (const block of stdout.split("\n\n").filter((b) => b.trim())) {
		const lines = block.split("\n");
		const pathLine = lines.find((l) => l.startsWith("worktree "));
		const branchLine = lines.find((l) => l.startsWith("branch "));
		if (pathLine && branchLine) {
			const path = pathLine.replace("worktree ", "");
			const branch = branchLine.replace("branch refs/heads/", "");
			if (branch.startsWith("ticket/")) {
				worktrees.push({ path, branch, ticketId: branch.replace("ticket/", "") });
			}
		}
	}
	return worktrees;
}
