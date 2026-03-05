/**
 * Executor — the bridge between dispatch (DB) and actual agent execution.
 *
 * When /corp-dispatch matches tickets to agents, this module actually
 * spawns the agent processes via pi's interactive_shell dispatch mode.
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

import type { Database } from "bun:sqlite";
import { buildCommand, type Runtime } from "./org.ts";
import { getSkillkit, buildSkillInjection } from "./skillkits.ts";
import { completeRun, failRun, type Run } from "./dispatch.ts";
import { getTicket } from "./tickets.ts";
import { getAgent } from "./org.ts";

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
 * Execute a run synchronously using Bun.spawn.
 * For actual pi integration, use the interactive_shell dispatch mode instead.
 */
export async function executeRunSync(db: Database, run: Run): Promise<ExecResult> {
	const { command, args } = buildRunCommand(db, run);

	try {
		const proc = Bun.spawn([command, ...args], {
			cwd: process.cwd(),
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, FORCE_COLOR: "0" },
		});

		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();
		const exitCode = await proc.exited;

		const output = stdout + (stderr ? `\n--- STDERR ---\n${stderr}` : "");

		if (exitCode === 0) {
			completeRun(db, run.id, { output, cost: 0 });
		} else {
			failRun(db, run.id, `Exit code ${exitCode}: ${stderr.slice(0, 500)}`);
		}

		return { output, exitCode };
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		failRun(db, run.id, msg);
		return { output: "", exitCode: 1 };
	}
}

/**
 * Build the interactive_shell dispatch command for a run.
 * This is what pi's extension would call to fire-and-forget an agent.
 */
export function buildDispatchCommand(db: Database, run: Run): string {
	const { command, args } = buildRunCommand(db, run);
	// Escape for shell
	const escaped = [command, ...args].map((a) => {
		if (a.includes(" ") || a.includes('"') || a.includes("'") || a.includes("\n")) {
			return `"${a.replace(/"/g, '\\"')}"`;
		}
		return a;
	});
	return escaped.join(" ");
}
