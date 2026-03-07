/**
 * Dispatch — Symphony's orchestration loop.
 * Assigns tickets to available agents, respects budgets, tracks runs.
 */

import type { Database } from "./db.ts";
import { genId, emit } from "./db.ts";
import { listAgents, isOverBudget, setAgentStatus, recordSpend, buildCommand, type Agent, type Runtime } from "./org.ts";
import { listTickets, assignTicket, completeTicket, failTicket, type Ticket } from "./tickets.ts";

export interface Run {
	id: string;
	ticket_id: string;
	agent_id: string;
	workspace: string | null;
	status: string;
	attempt: number;
	input_tokens: number;
	output_tokens: number;
	cost: number;
	started_at: string;
	completed_at: string | null;
	error: string | null;
	output: string | null;
}

export function listRuns(db: Database, status?: string): Run[] {
	if (status) {
		return db.query("SELECT * FROM runs WHERE status = ? ORDER BY started_at DESC").all(status) as Run[];
	}
	return db.query("SELECT * FROM runs ORDER BY started_at DESC LIMIT 50").all() as Run[];
}

export function getAvailableAgents(db: Database): Agent[] {
	return listAgents(db).filter((a) =>
		a.status === "idle" && a.role !== "ceo" && a.role !== "cto" && !isOverBudget(db, a.id),
	);
}

/**
 * Match tickets to agents by role affinity + project assignment.
 * Project-assigned agents only get tickets from their project.
 * Unassigned agents are generalists — they take any ticket.
 */
export function matchTicketsToAgents(db: Database): { ticket: Ticket; agent: Agent }[] {
	const tickets = listTickets(db, "todo");
	const agents = getAvailableAgents(db);
	const matches: { ticket: Ticket; agent: Agent }[] = [];
	const usedAgents = new Set<string>();

	for (const ticket of tickets) {
		// 1. Prefer project-specialist agent
		let agent = agents.find((a) => !usedAgents.has(a.id) &&
			a.project_id === ticket.project_id && a.project_id !== null &&
			(a.role === "builder" || a.role === "lead" || a.role === "scout" || a.role === "designer" || a.role === "marketer"),
		);
		// 2. Fall back to generalist (no project_id)
		if (!agent) {
			agent = agents.find((a) => !usedAgents.has(a.id) &&
				!a.project_id &&
				(a.role === "builder" || a.role === "lead" || a.role === "scout" || a.role === "designer" || a.role === "marketer"),
			);
		}
		if (agent) {
			matches.push({ ticket, agent });
			usedAgents.add(agent.id);
		}
	}
	return matches;
}

/**
 * Retry failed tickets — reset status to todo so they can be re-dispatched.
 */
export function retryFailed(db: Database): number {
	const failed = listTickets(db, "failed");
	let count = 0;
	for (const ticket of failed) {
		// Check retry count — max 3 attempts
		const attempts = (db.query(
			"SELECT COUNT(*) as c FROM runs WHERE ticket_id = ?"
		).get(ticket.id) as { c: number }).c;
		if (attempts < 3) {
			db.run("UPDATE tickets SET status = 'todo', updated_at = datetime('now') WHERE id = ?", [ticket.id]);
			emit(db, "ticket.retried", "ticket", ticket.id, { attempt: attempts + 1 });
			count++;
		}
	}
	return count;
}

/**
 * Dispatch a single ticket to an agent.
 * Creates a run record, marks agent as working, assigns ticket.
 */
export function dispatchRun(db: Database, ticketId: string, agentId: string, workspace?: string): Run {
	const id = genId();
	db.run(
		`INSERT INTO runs (id, ticket_id, agent_id, workspace, status)
		 VALUES (?, ?, ?, ?, 'running')`,
		[id, ticketId, agentId, workspace ?? null],
	);
	assignTicket(db, ticketId, agentId);
	setAgentStatus(db, agentId, "working");
	emit(db, "run.dispatched", "run", id, { ticketId, agentId });
	return db.query("SELECT * FROM runs WHERE id = ?").get(id) as Run;
}

/**
 * Complete a run — update tokens, cost, mark agent idle.
 */
export function completeRun(db: Database, runId: string, result: {
	output?: string; inputTokens?: number; outputTokens?: number; cost?: number;
}): void {
	db.run(
		`UPDATE runs SET status = 'completed', completed_at = datetime('now'),
		 output = ?, input_tokens = ?, output_tokens = ?, cost = ? WHERE id = ?`,
		[result.output ?? null, result.inputTokens ?? 0, result.outputTokens ?? 0, result.cost ?? 0, runId],
	);
	const run = db.query("SELECT * FROM runs WHERE id = ?").get(runId) as Run;
	if (run) {
		setAgentStatus(db, run.agent_id, "idle");
		if (result.cost) recordSpend(db, run.agent_id, result.cost);
		completeTicket(db, run.ticket_id);
	}
	emit(db, "run.completed", "run", runId, { cost: result.cost });
}

/**
 * Fail a run — log error, mark agent idle, fail ticket.
 */
export function failRun(db: Database, runId: string, error: string): void {
	db.run(
		`UPDATE runs SET status = 'failed', completed_at = datetime('now'), error = ? WHERE id = ?`,
		[error, runId],
	);
	const run = db.query("SELECT * FROM runs WHERE id = ?").get(runId) as Run;
	if (run) {
		setAgentStatus(db, run.agent_id, "idle");
		failTicket(db, run.ticket_id, error);
	}
	emit(db, "run.failed", "run", runId, { error });
}

/**
 * Get dashboard stats.
 */
export function getStats(db: Database): {
	goals: number; projects: number; agents: number;
	tickets: { todo: number; in_progress: number; done: number; failed: number };
	runs: { running: number; completed: number; failed: number };
	totalCost: number; totalTokens: number;
} {
	const goals = (db.query("SELECT COUNT(*) as c FROM goals WHERE status='active'").get() as { c: number }).c;
	const projects = (db.query("SELECT COUNT(*) as c FROM projects WHERE status='active'").get() as { c: number }).c;
	const agents = (db.query("SELECT COUNT(*) as c FROM agents WHERE status != 'fired'").get() as { c: number }).c;

	const ticketCounts = (status: string) =>
		(db.query("SELECT COUNT(*) as c FROM tickets WHERE status=?").get(status) as { c: number }).c;

	const runCounts = (status: string) =>
		(db.query("SELECT COUNT(*) as c FROM runs WHERE status=?").get(status) as { c: number }).c;

	const totals = db.query("SELECT COALESCE(SUM(cost),0) as cost, COALESCE(SUM(input_tokens+output_tokens),0) as tokens FROM runs").get() as { cost: number; tokens: number };

	return {
		goals, projects, agents,
		tickets: { todo: ticketCounts("todo"), in_progress: ticketCounts("in_progress"), done: ticketCounts("done"), failed: ticketCounts("failed") },
		runs: { running: runCounts("running"), completed: runCounts("completed"), failed: runCounts("failed") },
		totalCost: totals.cost, totalTokens: totals.tokens,
	};
}
