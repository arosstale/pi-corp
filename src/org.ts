/**
 * Org chart — agents with roles, runtimes, reporting lines, budgets.
 * Paperclip concept: "If OpenClaw is an employee, Paperclip is the company."
 */

import type { Database } from "bun:sqlite";
import { genId, emit } from "./db.ts";

export interface Agent {
	id: string;
	name: string;
	role: string;
	runtime: string;
	model: string | null;
	reports_to: string | null;
	budget_monthly: number;
	spent_monthly: number;
	status: string;
}

export const ROLES = ["ceo", "cto", "lead", "builder", "scout", "reviewer", "designer", "marketer"] as const;
export type Role = (typeof ROLES)[number];

export const RUNTIMES = ["pi", "claude", "codex", "gemini", "aider", "goose", "amp", "claude-desktop"] as const;
export type Runtime = (typeof RUNTIMES)[number];

export function hireAgent(db: Database, name: string, role: Role, runtime: Runtime, opts?: {
	model?: string; reportsTo?: string; budget?: number;
}): Agent {
	const id = genId();
	db.run(
		`INSERT INTO agents (id, name, role, runtime, model, reports_to, budget_monthly)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[id, name, role, runtime, opts?.model ?? null, opts?.reportsTo ?? null, opts?.budget ?? 0],
	);
	emit(db, "agent.hired", "agent", id, { name, role, runtime });
	return getAgent(db, id)!;
}

export function getAgent(db: Database, id: string): Agent | null {
	return db.query("SELECT * FROM agents WHERE id = ?").get(id) as Agent | null;
}

export function listAgents(db: Database): Agent[] {
	return db.query("SELECT * FROM agents ORDER BY role, name").all() as Agent[];
}

export function fireAgent(db: Database, id: string): void {
	db.run("UPDATE agents SET status = 'fired' WHERE id = ?", [id]);
	emit(db, "agent.fired", "agent", id);
}

export function setAgentStatus(db: Database, id: string, status: string): void {
	db.run("UPDATE agents SET status = ? WHERE id = ?", [status, id]);
}

export function recordSpend(db: Database, agentId: string, cost: number): void {
	db.run("UPDATE agents SET spent_monthly = spent_monthly + ? WHERE id = ?", [cost, agentId]);
}

export function isOverBudget(db: Database, agentId: string): boolean {
	const agent = getAgent(db, agentId);
	if (!agent || agent.budget_monthly <= 0) return false;
	return agent.spent_monthly >= agent.budget_monthly;
}

export function getOrgTree(db: Database): { agent: Agent; reports: Agent[] }[] {
	const agents = listAgents(db);
	const roots = agents.filter((a) => !a.reports_to && a.status !== "fired");
	return roots.map((root) => ({
		agent: root,
		reports: agents.filter((a) => a.reports_to === root.id && a.status !== "fired"),
	}));
}

export function buildCommand(runtime: Runtime, prompt: string, model?: string | null): string[] {
	const m = model;
	switch (runtime) {
		case "pi": return m ? ["pi", "--print", "--model", m, prompt] : ["pi", "--print", prompt];
		case "claude": return m ? ["claude", "--print", "--model", m, "-p", prompt] : ["claude", "--print", "-p", prompt];
		case "claude-desktop": return m ? ["claude", "--print", "--model", m, "-p", prompt] : ["claude", "--print", "-p", prompt];
		case "codex": return m ? ["codex", "exec", "--full-auto", "--model", m, prompt] : ["codex", "exec", "--full-auto", prompt];
		case "gemini": return m ? ["gemini", "--model", m, prompt] : ["gemini", prompt];
		case "aider": return m ? ["aider", "--message", prompt, "--yes-always", "--model", m] : ["aider", "--message", prompt, "--yes-always"];
		case "goose": return m ? ["goose", "run", "--text", prompt, "--model", m] : ["goose", "run", "--text", prompt];
		case "amp": return m ? ["amp", "--prompt", prompt, "--no-input", "--yes", "--model", m] : ["amp", "--prompt", prompt, "--no-input", "--yes"];
		default: return [runtime, prompt];
	}
}
