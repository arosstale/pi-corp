/**
 * Heartbeat — the autonomous event loop.
 *
 * This is what makes the corp actually RUN without you touching anything.
 *
 * Every heartbeat cycle:
 *   1. Check which agents are due for their heartbeat
 *   2. For each due agent, generate their task based on role
 *   3. Create a ticket + dispatch a run
 *   4. Record the heartbeat
 *
 * Heartbeat intervals (from autopilot.ts):
 *   Builder: 5m, Lead/Reviewer: 15m, CTO/Designer: 1h,
 *   CEO/Scout: 4h, Marketer: 1d
 *
 * The loop runs via /corp-heartbeat (manual) or corp_heartbeat (LLM tool).
 * For true autonomy, schedule with cron or a pi extension timer.
 */

import type { Database } from "./db.ts";
import { genId, emit } from "./db.ts";
import { listAgents, type Agent } from "./org.ts";
import { DEFAULT_HEARTBEATS, intervalToMs, type HeartbeatInterval } from "./autopilot.ts";
import { createTicket } from "./tickets.ts";
import { dispatchRun } from "./dispatch.ts";
import { listCycles, getPhaseWork, advancePhase, appendProgress } from "./devcycle.ts";
import { listPipelines, getCurrentTask, advancePipeline, buildMarketingPrompt } from "./marketing.ts";
import { getStats } from "./dispatch.ts";

export interface HeartbeatRecord {
	agent_id: string;
	role: string;
	interval: string;
	last_beat: string | null;
	next_beat: string;
}

/**
 * Get all agents with their heartbeat status.
 */
export function getHeartbeatStatus(db: Database): HeartbeatRecord[] {
	const agents = listAgents(db).filter((a) => a.status !== "fired");
	const now = new Date();

	return agents.map((agent) => {
		const hb = DEFAULT_HEARTBEATS[agent.role];
		if (!hb) return { agent_id: agent.id, role: agent.role, interval: "none", last_beat: null, next_beat: "never" };

		// Check last heartbeat event for this agent
		const lastEvent = db.query(
			"SELECT created_at FROM events WHERE type = 'heartbeat.tick' AND entity_id = ? ORDER BY created_at DESC LIMIT 1"
		).get(agent.id) as { created_at: string } | null;

		const lastBeat = lastEvent?.created_at ?? null;
		const intervalMs = intervalToMs(hb.interval);
		const nextBeat = lastBeat
			? new Date(new Date(lastBeat).getTime() + intervalMs).toISOString()
			: now.toISOString(); // Never beat → due now

		return {
			agent_id: agent.id,
			role: agent.role,
			interval: hb.interval,
			last_beat: lastBeat,
			next_beat: nextBeat,
		};
	});
}

/**
 * Get agents that are DUE for a heartbeat (next_beat <= now).
 */
export function getDueAgents(db: Database): { agent: Agent; heartbeat: HeartbeatRecord }[] {
	const statuses = getHeartbeatStatus(db);
	const agents = listAgents(db);
	const now = new Date().toISOString();

	return statuses
		.filter((s) => s.next_beat <= now && s.interval !== "none")
		.map((s) => ({
			agent: agents.find((a) => a.id === s.agent_id)!,
			heartbeat: s,
		}))
		.filter((x) => x.agent && x.agent.status !== "fired" && x.agent.status !== "working");
}

/**
 * Generate the heartbeat task for an agent based on current corp state.
 * This is context-aware — the task changes based on what's happening.
 */
export function generateHeartbeatTask(db: Database, agent: Agent): string {
	const stats = getStats(db);
	const defaultTask = DEFAULT_HEARTBEATS[agent.role]?.task ?? "Check in and report status.";

	switch (agent.role) {
		case "ceo": {
			const cycles = listCycles(db);
			const pipelines = listPipelines(db);
			const activePipelines = pipelines.filter((p) => p.status === "running");
			return `${defaultTask}\n\nCurrent state: ${stats.tickets.todo} todo, ${stats.tickets.in_progress} in progress, ${stats.tickets.done} done, ${stats.tickets.failed} failed. Cost: $${stats.totalCost.toFixed(2)}. Active cycles: ${cycles.length}. Marketing pipelines: ${activePipelines.length} running.`;
		}
		case "cto": {
			const cycles = listCycles(db);
			const cycle = cycles[0];
			const phaseInfo = cycle ? `DevCycle phase: ${cycle.phase}, iteration ${cycle.iteration}/${cycle.max_iterations}.` : "No active DevCycle.";
			return `${defaultTask}\n\n${phaseInfo} Runs: ${stats.runs.running} running, ${stats.runs.failed} failed. Tickets: ${stats.tickets.todo} todo.`;
		}
		case "lead": {
			return `${defaultTask}\n\nTickets: ${stats.tickets.todo} todo, ${stats.tickets.in_progress} in progress. Runs: ${stats.runs.running} running, ${stats.runs.failed} failed.`;
		}
		case "marketer": {
			const pipelines = listPipelines(db);
			const active = pipelines.find((p) => p.status === "running");
			if (active) {
				const task = getCurrentTask(active);
				if (task) {
					const prompt = buildMarketingPrompt(active, task);
					return `Marketing pipeline ${active.type} is active. Current task: ${task.title}.\n\n${prompt}`;
				}
			}
			return `${defaultTask}\n\nNo active marketing pipeline. Consider starting one: content, launch, growth, or evergreen.`;
		}
		default:
			return defaultTask;
	}
}

/**
 * Execute one heartbeat cycle.
 * Returns what happened.
 */
export function tick(db: Database): { ticked: number; actions: string[] } {
	const due = getDueAgents(db);
	const actions: string[] = [];

	for (const { agent } of due) {
		const task = generateHeartbeatTask(db, agent);

		// Record the heartbeat
		emit(db, "heartbeat.tick", "agent", agent.id, { role: agent.role });

		// For management roles (ceo, cto), just log the check — they don't create runs
		if (agent.role === "ceo" || agent.role === "cto") {
			actions.push(`${agent.name} (${agent.role}): checked in — ${task.slice(0, 80)}...`);

			// CTO auto-advances DevCycle if conditions met
			if (agent.role === "cto") {
				const cycles = listCycles(db);
				const cycle = cycles[0];
				if (cycle) {
					const stats2 = getStats(db);
					// If all tickets done and we're in build/test, advance
					if (stats2.tickets.todo === 0 && stats2.tickets.in_progress === 0 &&
						["build", "test", "review"].includes(cycle.phase)) {
						const next = advancePhase(db, cycle.id);
						appendProgress(db, cycle.id, `CTO auto-advanced to ${next}`);
						actions.push(`  → DevCycle auto-advanced to ${next}`);
					}
				}
			}
			continue;
		}

		// For worker roles, create a heartbeat ticket and dispatch
		if (agent.status === "idle") {
			const ticket = createTicket(db, `[heartbeat] ${agent.name}: ${DEFAULT_HEARTBEATS[agent.role]?.task.slice(0, 60) ?? "check"}`, {
				priority: 4, // Low priority — heartbeats are background
				source: "heartbeat",
			});
			const run = dispatchRun(db, ticket.id, agent.id);
			actions.push(`${agent.name} (${agent.role}): dispatched heartbeat run ${run.id.slice(0, 6)}`);
		} else {
			actions.push(`${agent.name} (${agent.role}): skipped (status: ${agent.status})`);
		}
	}

	return { ticked: due.length, actions };
}
