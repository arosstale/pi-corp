/**
 * Executor — the bridge between dispatch (DB) and actual agent execution.
 *
 * When /corp-dispatch matches tickets to agents, this module actually
 * spawns the agent processes.
 *
 * Flow:
 *   1. dispatchRun() creates a DB run record (dispatch.ts)
 *   2. executeRun() spawns the actual agent process (this file)
 *   3. On completion, completeRun() or failRun() updates the DB
 *
 * Each runtime maps to a CLI command:
 *   pi      → pi --print "task"
 *   claude  → claude --print -p "task"
 *   codex   → codex exec --full-auto "task"
 *   gemini  → gemini "task"
 *   aider   → aider --message "task" --yes-always
 *   goose   → goose run --text "task"
 *   amp     → amp --prompt "task" --no-input --yes
 *   claude-desktop → claude --print -p "task" (same as claude)
 */

import type { Database } from "./db.ts";
import { buildCommand, type Runtime } from "./org.ts";
import { getSkillkit, buildSkillInjection } from "./skillkits.ts";
import { completeRun, failRun, type Run } from "./dispatch.ts";
import { getTicket } from "./tickets.ts";
import { getAgent } from "./org.ts";
import { spawn } from "node:child_process";

export interface ExecResult {
	output: string;
	exitCode: number;
	cost?: number;
	inputTokens?: number;
	outputTokens?: number;
}

/**
 * Build the full command string for a run.
 * Includes skill injection + ticket description as the prompt.
 */
export function buildRunCommand(db: Database, run: Run): { command: string; args: string[] } {
	const agent = getAgent(db, run.agent_id);
	const ticket = getTicket(db, run.ticket_id);
	if (!agent || !ticket) throw new Error("Agent or ticket not found");

	const skills = getSkillkit(db, agent.role);
	const skillPrefix = buildSkillInjection(skills);
	const prompt = skillPrefix + ticket.title + (ticket.description ? `\n\n${ticket.description}` : "");
	const args = buildCommand(agent.runtime as Runtime, prompt, agent.model);

	return { command: args[0]!, args: args.slice(1) };
}

/**
 * Execute a run synchronously using child_process.spawn.
 */
export async function executeRunSync(db: Database, run: Run): Promise<ExecResult> {
	const { command, args } = buildRunCommand(db, run);

	return new Promise((resolve) => {
		try {
			const proc = spawn(command, args, {
				cwd: process.cwd(),
				env: { ...process.env, FORCE_COLOR: "0" },
				stdio: ["ignore", "pipe", "pipe"],
				shell: true,
			});

			let stdout = "";
			let stderr = "";
			proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
			proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

			proc.on("close", (exitCode) => {
				const code = exitCode ?? 1;
				const output = stdout + (stderr ? `\n--- STDERR ---\n${stderr}` : "");

				if (code === 0) {
					completeRun(db, run.id, { output, cost: 0 });
				} else {
					failRun(db, run.id, `Exit code ${code}: ${stderr.slice(0, 500)}`);
				}

				resolve({ output, exitCode: code });
			});

			proc.on("error", (err) => {
				failRun(db, run.id, err.message);
				resolve({ output: "", exitCode: 1 });
			});
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			failRun(db, run.id, msg);
			resolve({ output: "", exitCode: 1 });
		}
	});
}

/**
 * Build the interactive_shell dispatch command for a run.
 */
export function buildDispatchCommand(db: Database, run: Run): string {
	const { command, args } = buildRunCommand(db, run);
	const escaped = [command, ...args].map((a) => {
		if (a.includes(" ") || a.includes('"') || a.includes("'") || a.includes("\n")) {
			return `"${a.replace(/"/g, '\\"')}"`;
		}
		return a;
	});
	return escaped.join(" ");
}

/**
 * Execute a run in background (fire-and-forget).
 * Captures output, updates DB on completion.
 * Returns immediately — the process runs async.
 */
export function executeRunBackground(db: Database, run: Run): { pid: number | undefined; command: string } {
	const { command, args } = buildRunCommand(db, run);
	const fullCmd = [command, ...args].join(" ").slice(0, 120);

	const proc = spawn(command, args, {
		cwd: process.cwd(),
		env: { ...process.env, FORCE_COLOR: "0" },
		stdio: ["ignore", "pipe", "pipe"],
		shell: true,
		detached: false,
	});

	let stdout = "";
	let stderr = "";
	proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString().slice(0, 10000); });
	proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString().slice(0, 2000); });

	proc.on("close", (exitCode) => {
		const code = exitCode ?? 1;
		const output = stdout + (stderr ? `\n--- STDERR ---\n${stderr}` : "");

		if (code === 0) {
			completeRun(db, run.id, { output, cost: 0 });
		} else {
			failRun(db, run.id, `Exit code ${code}: ${stderr.slice(0, 500)}`);
		}
	});

	proc.on("error", (err) => {
		failRun(db, run.id, err.message);
	});

	return { pid: proc.pid, command: fullCmd };
}

/**
 * Track active background processes.
 */
const activeProcesses = new Map<string, { pid: number | undefined; command: string; startedAt: Date }>();

export function getActiveProcesses(): Map<string, { pid: number | undefined; command: string; startedAt: Date }> {
	return activeProcesses;
}

/**
 * Execute a run and track it.
 */
export function executeAndTrack(db: Database, run: Run): { pid: number | undefined; command: string } {
	const result = executeRunBackground(db, run);
	activeProcesses.set(run.id, { ...result, startedAt: new Date() });
	return result;
}
