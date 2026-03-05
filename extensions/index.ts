import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import { getDb, closeDb } from "../src/db.js";
import { hireAgent, listAgents, getOrgTree, type Role, type Runtime, ROLES, RUNTIMES } from "../src/org.js";
import { createGoal, listGoals, createProject, listProjects } from "../src/goals.js";
import { createTicket, listTickets, importPrd } from "../src/tickets.js";
import { matchTicketsToAgents, dispatchRun, completeRun, failRun, listRuns, getStats } from "../src/dispatch.js";

export default function (pi: ExtensionAPI) {

	// ── Dashboard ──

	pi.registerCommand("corp", {
		description: "Show autonomous corp dashboard — goals, org, tickets, runs, costs",
		parameters: Type.Object({}),
		execute: async () => {
			const db = getDb();
			const stats = getStats(db);
			const goals = listGoals(db);
			const org = getOrgTree(db);
			const tickets = listTickets(db);
			const runs = listRuns(db, "running");

			const lines: string[] = [];
			lines.push("╔══════════════════════════════════════════════════╗");
			lines.push("║            🏢  AUTONOMOUS CORP  v0.1            ║");
			lines.push("╚══════════════════════════════════════════════════╝");
			lines.push("");

			// Stats bar
			lines.push(`  Goals: ${stats.goals}  Projects: ${stats.projects}  Agents: ${stats.agents}  Cost: $${stats.totalCost.toFixed(2)}  Tokens: ${(stats.totalTokens / 1000).toFixed(0)}k`);
			lines.push(`  Tickets: ${stats.tickets.todo} todo │ ${stats.tickets.in_progress} working │ ${stats.tickets.done} done │ ${stats.tickets.failed} failed`);
			lines.push(`  Runs: ${stats.runs.running} running │ ${stats.runs.completed} completed │ ${stats.runs.failed} failed`);
			lines.push("");

			// Goals
			if (goals.length > 0) {
				lines.push("── GOALS ──────────────────────────────────────────");
				for (const g of goals) {
					lines.push(`  🎯 ${g.title}`);
				}
				lines.push("");
			}

			// Org chart
			if (org.length > 0) {
				lines.push("── ORG CHART ──────────────────────────────────────");
				for (const { agent, reports } of org) {
					const budget = agent.budget_monthly > 0 ? ` $${agent.spent_monthly.toFixed(2)}/$${agent.budget_monthly.toFixed(0)}` : "";
					const status = agent.status === "working" ? "🔵" : agent.status === "idle" ? "⚪" : "🔴";
					lines.push(`  ${status} ${agent.name} (${agent.role}) [${agent.runtime}]${budget}`);
					for (const r of reports) {
						const rBudget = r.budget_monthly > 0 ? ` $${r.spent_monthly.toFixed(2)}/$${r.budget_monthly.toFixed(0)}` : "";
						const rStatus = r.status === "working" ? "🔵" : r.status === "idle" ? "⚪" : "🔴";
						lines.push(`    └─ ${rStatus} ${r.name} (${r.role}) [${r.runtime}]${rBudget}`);
					}
				}
				lines.push("");
			}

			// Active tickets
			const active = tickets.filter((t) => t.status !== "done" && t.status !== "cancelled").slice(0, 10);
			if (active.length > 0) {
				lines.push("── TICKETS ────────────────────────────────────────");
				for (const t of active) {
					const icon = t.status === "in_progress" ? "🔵" : t.status === "failed" ? "🔴" : "⬜";
					lines.push(`  ${icon} [P${t.priority}] ${t.title} (${t.status})`);
				}
				lines.push("");
			}

			// Running
			if (runs.length > 0) {
				lines.push("── RUNNING ────────────────────────────────────────");
				for (const r of runs) {
					lines.push(`  ⚡ run:${r.id.slice(0, 6)} ticket:${r.ticket_id.slice(0, 6)} agent:${r.agent_id.slice(0, 6)} attempt:${r.attempt}`);
				}
				lines.push("");
			}

			if (stats.goals === 0 && stats.agents === 0) {
				lines.push("  Empty corp. Start with:");
				lines.push('  /corp-goal title="Build the best AI app"');
				lines.push('  /corp-hire name="Builder-1" role="builder" runtime="pi"');
				lines.push('  /corp-ticket title="Set up project scaffolding"');
			}

			return Text(lines.join("\n"));
		},
	});

	// ── Goal Management ──

	pi.registerCommand("corp-goal", {
		description: "Create a company goal",
		parameters: Type.Object({
			title: Type.String({ description: "Goal title" }),
			description: Type.Optional(Type.String({ description: "Goal description" })),
		}),
		execute: async ({ title, description }) => {
			const db = getDb();
			const goal = createGoal(db, title, description);
			return Text(`🎯 Goal created: ${goal.title} (${goal.id})`);
		},
	});

	pi.registerCommand("corp-project", {
		description: "Create a project under a goal",
		parameters: Type.Object({
			name: Type.String({ description: "Project name" }),
			goalId: Type.Optional(Type.String({ description: "Goal ID to attach to" })),
			repo: Type.Optional(Type.String({ description: "Git repo path" })),
		}),
		execute: async ({ name, goalId, repo }) => {
			const db = getDb();
			const project = createProject(db, name, goalId, repo);
			return Text(`📁 Project created: ${project.name} (${project.id})`);
		},
	});

	// ── Org Management ──

	pi.registerCommand("corp-hire", {
		description: "Hire an agent into the org",
		parameters: Type.Object({
			name: Type.String({ description: "Agent name" }),
			role: Type.String({ description: `Role: ${ROLES.join(", ")}` }),
			runtime: Type.String({ description: `Runtime: ${RUNTIMES.join(", ")}` }),
			model: Type.Optional(Type.String({ description: "Model override" })),
			reportsTo: Type.Optional(Type.String({ description: "ID of manager agent" })),
			budget: Type.Optional(Type.Number({ description: "Monthly budget in USD" })),
		}),
		execute: async ({ name, role, runtime, model, reportsTo, budget }) => {
			const db = getDb();
			const agent = hireAgent(db, name, role as Role, runtime as Runtime, { model, reportsTo, budget });
			return Text(`🤝 Hired: ${agent.name} as ${agent.role} using ${agent.runtime}${budget ? ` ($${budget}/mo)` : ""}`);
		},
	});

	// ── Ticket Management ──

	pi.registerCommand("corp-ticket", {
		description: "Create a ticket",
		parameters: Type.Object({
			title: Type.String({ description: "Ticket title" }),
			projectId: Type.Optional(Type.String({ description: "Project ID" })),
			description: Type.Optional(Type.String({ description: "Description" })),
			priority: Type.Optional(Type.Number({ description: "Priority 1-5 (1=highest)" })),
		}),
		execute: async ({ title, projectId, description, priority }) => {
			const db = getDb();
			const ticket = createTicket(db, title, { projectId, description, priority });
			return Text(`🎫 Ticket created: [P${ticket.priority}] ${ticket.title} (${ticket.id})`);
		},
	});

	pi.registerCommand("corp-prd", {
		description: "Import a PRD JSON file as tickets (Ralph pattern)",
		parameters: Type.Object({
			file: Type.String({ description: "Path to PRD JSON file" }),
			projectId: Type.String({ description: "Project ID to create tickets under" }),
		}),
		execute: async ({ file, projectId }) => {
			const db = getDb();
			const raw = await Bun.file(file).text();
			const prd = JSON.parse(raw);
			const stories = prd.userStories ?? prd.stories ?? prd;
			if (!Array.isArray(stories)) return Text("❌ PRD must contain an array of stories");
			const tickets = importPrd(db, projectId, stories);
			return Text(`📋 Imported ${tickets.length} stories as tickets from PRD`);
		},
	});

	// ── Dispatch ──

	pi.registerCommand("corp-dispatch", {
		description: "Match and dispatch todo tickets to available agents",
		parameters: Type.Object({
			dryRun: Type.Optional(Type.Boolean({ description: "Show matches without dispatching" })),
		}),
		execute: async ({ dryRun }) => {
			const db = getDb();
			const matches = matchTicketsToAgents(db);
			if (matches.length === 0) return Text("No tickets to dispatch (no todo tickets or no idle agents)");

			const lines: string[] = [];
			for (const { ticket, agent } of matches) {
				if (dryRun) {
					lines.push(`  [dry] ${ticket.title} → ${agent.name} (${agent.runtime})`);
				} else {
					const run = dispatchRun(db, ticket.id, agent.id);
					lines.push(`  ⚡ ${ticket.title} → ${agent.name} (run:${run.id.slice(0, 6)})`);
				}
			}
			return Text(`${dryRun ? "Would dispatch" : "Dispatched"} ${matches.length} tickets:\n${lines.join("\n")}`);
		},
	});

	// ── LLM Tools ──

	pi.addLLMTool({
		name: "corp_dashboard",
		description: "Get autonomous corp status: goals, org chart, tickets, runs, costs",
		parameters: Type.Object({}),
		execute: async () => {
			const db = getDb();
			const stats = getStats(db);
			const agents = listAgents(db);
			const tickets = listTickets(db);
			return JSON.stringify({ stats, agents: agents.slice(0, 20), tickets: tickets.slice(0, 20) });
		},
	});

	pi.addLLMTool({
		name: "corp_hire",
		description: "Hire an agent into the autonomous corp",
		parameters: Type.Object({
			name: Type.String(),
			role: Type.String({ description: "ceo, cto, lead, builder, scout, reviewer, designer, marketer" }),
			runtime: Type.String({ description: "pi, claude, codex, gemini, aider, goose, amp, claude-desktop" }),
			model: Type.Optional(Type.String()),
			reportsTo: Type.Optional(Type.String()),
			budget: Type.Optional(Type.Number()),
		}),
		execute: async ({ name, role, runtime, model, reportsTo, budget }) => {
			const db = getDb();
			const agent = hireAgent(db, name, role as Role, runtime as Runtime, { model, reportsTo, budget });
			return JSON.stringify(agent);
		},
	});

	pi.addLLMTool({
		name: "corp_dispatch",
		description: "Match todo tickets to idle agents and dispatch runs",
		parameters: Type.Object({}),
		execute: async () => {
			const db = getDb();
			const matches = matchTicketsToAgents(db);
			const results = [];
			for (const { ticket, agent } of matches) {
				const run = dispatchRun(db, ticket.id, agent.id);
				results.push({ ticketId: ticket.id, agentId: agent.id, runId: run.id });
			}
			return JSON.stringify({ dispatched: results.length, runs: results });
		},
	});

	pi.addLLMTool({
		name: "corp_create_ticket",
		description: "Create a ticket in the autonomous corp",
		parameters: Type.Object({
			title: Type.String(),
			description: Type.Optional(Type.String()),
			projectId: Type.Optional(Type.String()),
			priority: Type.Optional(Type.Number()),
		}),
		execute: async ({ title, description, projectId, priority }) => {
			const db = getDb();
			const ticket = createTicket(db, title, { projectId, description, priority });
			return JSON.stringify(ticket);
		},
	});

	pi.addLLMTool({
		name: "corp_complete_run",
		description: "Mark a run as completed with results",
		parameters: Type.Object({
			runId: Type.String(),
			output: Type.Optional(Type.String()),
			cost: Type.Optional(Type.Number()),
			inputTokens: Type.Optional(Type.Number()),
			outputTokens: Type.Optional(Type.Number()),
		}),
		execute: async ({ runId, output, cost, inputTokens, outputTokens }) => {
			const db = getDb();
			completeRun(db, runId, { output, cost, inputTokens, outputTokens });
			return JSON.stringify({ status: "completed", runId });
		},
	});

	pi.addLLMTool({
		name: "corp_fail_run",
		description: "Mark a run as failed",
		parameters: Type.Object({
			runId: Type.String(),
			error: Type.String(),
		}),
		execute: async ({ runId, error }) => {
			const db = getDb();
			failRun(db, runId, error);
			return JSON.stringify({ status: "failed", runId });
		},
	});
}
