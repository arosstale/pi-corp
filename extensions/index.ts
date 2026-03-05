import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import { getDb, closeDb } from "../src/db.js";
import { hireAgent, listAgents, getOrgTree, type Role, type Runtime, type OrgNode, ROLES, RUNTIMES, buildCommand } from "../src/org.js";
import { createGoal, listGoals, createProject, listProjects } from "../src/goals.js";
import { createTicket, listTickets, importPrd } from "../src/tickets.js";
import { matchTicketsToAgents, dispatchRun, completeRun, failRun, listRuns, getStats, retryFailed, type Run } from "../src/dispatch.js";
import { getFeed, formatEvent } from "../src/feed.js";
import { DEFAULT_SKILLKITS, getSkillkit, buildSkillInjection } from "../src/skillkits.js";
import { createCycle, listCycles, advancePhase, appendProgress, getPhaseWork, type CyclePhase } from "../src/devcycle.js";
import { registerApp, listApps, type AppType } from "../src/apps.js";
import { createPipeline, listPipelines, getCurrentTask, advancePipeline, buildMarketingPrompt, PIPELINE_TEMPLATES, type PipelineType } from "../src/marketing.js";
import { buildAutopilotPrompt, generateInitialPlan, DEFAULT_HEARTBEATS } from "../src/autopilot.js";
import { buildDispatchCommand, buildRunCommand } from "../src/executor.js";
import { tick, getHeartbeatStatus, getDueAgents } from "../src/heartbeat.js";

export default function (pi: ExtensionAPI) {

	// ── Dashboard ──

	pi.registerCommand("corp", {
		description: "Autonomous corp dashboard — goals, org, cycles, tickets, apps, costs",
		parameters: Type.Object({}),
		execute: async () => {
			const db = getDb();
			const stats = getStats(db);
			const goals = listGoals(db);
			const org = getOrgTree(db);
			const tickets = listTickets(db);
			const runs = listRuns(db, "running");
			const cycles = listCycles(db);
			const apps = listApps(db);

			const lines: string[] = [];
			lines.push("╔══════════════════════════════════════════════════════════╗");
			lines.push("║              🏢  AUTONOMOUS CORP  v0.2                  ║");
			lines.push("║  Goal → Plan → Build → Test → Deploy → Measure → Loop  ║");
			lines.push("╚══════════════════════════════════════════════════════════╝");
			lines.push("");

			// Stats bar
			lines.push(`  Goals: ${stats.goals}  Projects: ${stats.projects}  Agents: ${stats.agents}  Apps: ${apps.length}  Cost: $${stats.totalCost.toFixed(2)}  Tokens: ${(stats.totalTokens / 1000).toFixed(0)}k`);
			lines.push(`  Tickets: ${stats.tickets.todo} todo │ ${stats.tickets.in_progress} wip │ ${stats.tickets.done} done │ ${stats.tickets.failed} fail`);
			lines.push(`  Runs: ${stats.runs.running} running │ ${stats.runs.completed} ok │ ${stats.runs.failed} fail`);
			lines.push("");

			// Active cycles
			if (cycles.length > 0) {
				lines.push("── DEVCYCLE ───────────────────────────────────────────────");
				for (const c of cycles) {
					const phases = ["plan", "build", "test", "review", "deploy", "measure", "iterate"];
					const bar = phases.map((p) => p === c.phase ? `[${p.toUpperCase()}]` : ` ${p} `).join(" → ");
					lines.push(`  🔄 Cycle ${c.id.slice(0, 6)} iter:${c.iteration}/${c.max_iterations}`);
					lines.push(`     ${bar}`);
				}
				lines.push("");
			}

			// Goals
			if (goals.length > 0) {
				lines.push("── GOALS ──────────────────────────────────────────────────");
				for (const g of goals) lines.push(`  🎯 ${g.title}`);
				lines.push("");
			}

			// Org chart (recursive)
			if (org.length > 0) {
				lines.push("── ORG CHART ──────────────────────────────────────────────");
				function renderNode(node: OrgNode, indent: number, isLast: boolean): void {
					const a = node.agent;
					const budget = a.budget_monthly > 0 ? ` $${a.spent_monthly.toFixed(2)}/$${a.budget_monthly.toFixed(0)}` : "";
					const icon = a.status === "working" ? "🔵" : a.status === "idle" ? "⚪" : "🔴";
					const skills = getSkillkit(db, a.role);
					const skillTag = skills.length > 0 ? ` (${skills.length} skills)` : "";
					const prefix = indent === 0 ? "  " : "  " + "    ".repeat(indent - 1) + (isLast ? "└─ " : "├─ ");
					lines.push(`${prefix}${icon} ${a.name} (${a.role}) [${a.runtime}]${budget}${skillTag}`);
					node.reports.forEach((child, i) => renderNode(child, indent + 1, i === node.reports.length - 1));
				}
				org.forEach((node, i) => renderNode(node, 0, i === org.length - 1));
				lines.push("");
			}

			// Apps
			if (apps.length > 0) {
				lines.push("── APPS ───────────────────────────────────────────────────");
				for (const a of apps) lines.push(`  📱 ${a.name} (${a.type})`);
				lines.push("");
			}

			// Active tickets
			const active = tickets.filter((t) => t.status !== "done" && t.status !== "cancelled").slice(0, 10);
			if (active.length > 0) {
				lines.push("── TICKETS ────────────────────────────────────────────────");
				for (const t of active) {
					const icon = t.status === "in_progress" ? "🔵" : t.status === "failed" ? "🔴" : "⬜";
					lines.push(`  ${icon} [P${t.priority}] ${t.title} (${t.status})`);
				}
				lines.push("");
			}

			// Marketing pipelines
			const mktPipelines = listPipelines(db);
			if (mktPipelines.length > 0) {
				lines.push("── MARKETING ──────────────────────────────────────────────");
				for (const p of mktPipelines) {
					const task = getCurrentTask(p);
					const pct = p.tasks.length > 0 ? Math.round((p.current_task / p.tasks.length) * 100) : 0;
					const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));
					lines.push(`  ${p.status === "completed" ? "✅" : "🔄"} ${p.type.toUpperCase()} [${bar}] ${pct}%`);
					if (task) lines.push(`     → ${task.title} (${task.skill})`);
				}
				lines.push("");
			}

			// Running
			if (runs.length > 0) {
				lines.push("── RUNNING ────────────────────────────────────────────────");
				for (const r of runs) {
					lines.push(`  ⚡ run:${r.id.slice(0, 6)} ticket:${r.ticket_id.slice(0, 6)} agent:${r.agent_id.slice(0, 6)} attempt:${r.attempt}`);
				}
				lines.push("");
			}

			// Heartbeat
			if (org.length > 0) {
				const due = getDueAgents(db);
				if (due.length > 0) {
					lines.push("── HEARTBEAT ──────────────────────────────────────────────");
					lines.push(`  🔴 ${due.length} agent(s) due: ${due.map((d) => d.agent.name).join(", ")}`);
					lines.push("  Run /corp-heartbeat to tick.");
					lines.push("");
				}
			}

			if (stats.goals === 0 && stats.agents === 0) {
				lines.push("  Empty corp. Try: /corp-autopilot mission=\"Build something\"");
			}

			return Text(lines.join("\n"));
		},
	});

	// ── Autopilot (L5) ──

	pi.registerCommand("corp-autopilot", {
		description: "ONE COMMAND. Say what you want to build. Autopilot bootstraps the company, creates tickets, starts marketing, and dispatches agents.",
		parameters: Type.Object({
			mission: Type.String({ description: 'e.g., "Build a SaaS that helps freelancers track invoices"' }),
			repo: Type.Optional(Type.String({ description: "Git repo path" })),
			budget: Type.Optional(Type.Number({ description: "Total monthly budget (default $500)" })),
		}),
		execute: async ({ mission, repo, budget }) => {
			const db = getDb();
			const totalBudget = budget ?? 500;
			const lines: string[] = [];
			lines.push("╔══════════════════════════════════════════════════════════╗");
			lines.push("║              🚀  AUTOPILOT ENGAGED                      ║");
			lines.push("╚══════════════════════════════════════════════════════════╝");
			lines.push("");
			lines.push(`  Mission: "${mission}"`);
			lines.push(`  Budget: $${totalBudget}/mo`);
			lines.push("");

			// 1. Goal & Project
			const goal = createGoal(db, mission);
			const projectName = mission.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
			const project = createProject(db, projectName, goal.id, repo);
			lines.push("  ✅ Goal & project created");

			// 2. Org — budget split: CEO 40%, CTO 20%, builders 15%, rest 25%
			const ceo = hireAgent(db, "CEO", "ceo", "claude-desktop", { budget: totalBudget * 0.10 });
			const cto = hireAgent(db, "CTO", "cto", "claude", { reportsTo: ceo.id, budget: totalBudget * 0.10 });
			const lead = hireAgent(db, "Lead", "lead", "pi", { reportsTo: cto.id, budget: totalBudget * 0.10 });
			hireAgent(db, "Builder-1", "builder", "pi", { reportsTo: lead.id, budget: totalBudget * 0.15 });
			hireAgent(db, "Builder-2", "builder", "codex", { reportsTo: lead.id, budget: totalBudget * 0.15 });
			hireAgent(db, "Scout", "scout", "gemini", { reportsTo: cto.id, budget: totalBudget * 0.05 });
			hireAgent(db, "Reviewer", "reviewer", "claude", { reportsTo: cto.id, budget: totalBudget * 0.10 });
			hireAgent(db, "Designer", "designer", "claude", { reportsTo: lead.id, budget: totalBudget * 0.10 });
			hireAgent(db, "Marketer", "marketer", "claude-desktop", { reportsTo: ceo.id, budget: totalBudget * 0.15 });
			lines.push("  ✅ 9 agents hired — org chart built");

			// 3. Apps
			registerApp(db, "GitHub", "github", { projectId: project.id });
			registerApp(db, "Gmail", "gmail", { projectId: project.id });
			registerApp(db, "Vercel", "deploy", { projectId: project.id });
			registerApp(db, "Analytics", "analytics", { projectId: project.id });
			lines.push("  ✅ 4 apps connected");

			// 4. Initial tickets from mission
			const plan = generateInitialPlan(mission);
			for (const item of plan) {
				createTicket(db, item.title, {
					projectId: project.id, priority: item.priority, description: item.description,
				});
			}
			lines.push(`  ✅ ${plan.length} initial tickets created`);

			// 5. DevCycle
			createCycle(db, goal.id, project.id);
			lines.push("  ✅ DevCycle started (phase: PLAN)");

			// 6. Marketing
			createPipeline(db, "launch", project.id);
			createPipeline(db, "content", project.id);
			lines.push("  ✅ Marketing pipelines started (LAUNCH + CONTENT)");

			// 7. Heartbeat schedule
			lines.push("  ✅ Heartbeat schedule:");
			for (const [role, hb] of Object.entries(DEFAULT_HEARTBEATS)) {
				lines.push(`     ${role}: every ${hb.interval}`);
			}

			lines.push("");
			lines.push("  🏢 Company is live. The CEO agent prompt is ready.");
			lines.push("  Run /corp to see the dashboard.");
			lines.push("  Run /corp-dispatch to start sending work to agents.");
			lines.push("");
			lines.push("  ── CEO PROMPT (feed this to your first agent) ──────────");
			lines.push("");

			const ceoPrompt = buildAutopilotPrompt(mission);
			lines.push(ceoPrompt);

			return Text(lines.join("\n"));
		},
	});

	// ── Bootstrap ──

	pi.registerCommand("corp-bootstrap", {
		description: "Bootstrap a full autonomous corp with default org, skillkits, and apps",
		parameters: Type.Object({
			goalTitle: Type.String({ description: "Company goal" }),
			projectName: Type.String({ description: "Project name" }),
			repo: Type.Optional(Type.String({ description: "Git repo path" })),
		}),
		execute: async ({ goalTitle, projectName, repo }) => {
			const db = getDb();
			const lines: string[] = ["🏗️  Bootstrapping autonomous corp...", ""];

			// Goal & Project
			const goal = createGoal(db, goalTitle);
			const project = createProject(db, projectName, goal.id, repo);
			lines.push(`  🎯 Goal: ${goal.title}`);
			lines.push(`  📁 Project: ${project.name}`);

			// Org
			const ceo = hireAgent(db, "CEO", "ceo", "claude-desktop", { budget: 200 });
			const cto = hireAgent(db, "CTO", "cto", "claude", { reportsTo: ceo.id, budget: 100 });
			const lead = hireAgent(db, "Lead", "lead", "pi", { reportsTo: cto.id, budget: 50 });
			const b1 = hireAgent(db, "Builder-1", "builder", "pi", { reportsTo: lead.id, budget: 30 });
			const b2 = hireAgent(db, "Builder-2", "builder", "codex", { reportsTo: lead.id, budget: 30 });
			const scout = hireAgent(db, "Scout", "scout", "gemini", { reportsTo: cto.id, budget: 15 });
			const reviewer = hireAgent(db, "Reviewer", "reviewer", "claude", { reportsTo: cto.id, budget: 20 });
			const designer = hireAgent(db, "Designer", "designer", "claude", { reportsTo: lead.id, budget: 20 });
			const marketer = hireAgent(db, "Marketer", "marketer", "claude-desktop", { reportsTo: ceo.id, budget: 30 });
			lines.push(`  👥 Org: 9 agents hired (CEO → CTO → Lead → 5 specialists + Marketer)`);

			// Apps
			registerApp(db, "GitHub", "github", { projectId: project.id, config: { owner: "arosstale" } });
			registerApp(db, "Gmail", "gmail", { projectId: project.id });
			registerApp(db, "Calendar", "calendar", { projectId: project.id });
			registerApp(db, "Vercel", "deploy", { projectId: project.id });
			registerApp(db, "Analytics", "analytics", { projectId: project.id });
			lines.push(`  📱 Apps: GitHub, Gmail, Calendar, Vercel, Analytics`);

			// Skillkits summary
			const totalSkills = Object.values(DEFAULT_SKILLKITS).reduce((sum, s) => sum + s.length, 0);
			lines.push(`  🧠 Skillkits: ${Object.keys(DEFAULT_SKILLKITS).length} roles × ${totalSkills} total skills`);
			for (const [role, skills] of Object.entries(DEFAULT_SKILLKITS)) {
				lines.push(`     ${role}: ${skills.map((s) => s.name).join(", ")}`);
			}

			// Start cycle
			const cycle = createCycle(db, goal.id, project.id);
			lines.push(`  🔄 DevCycle started: ${cycle.id.slice(0, 6)} (phase: plan, max: 10 iterations)`);

			lines.push("");
			lines.push("  ✅ Corp ready. Run /corp to see dashboard, /corp-cycle to advance.");
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
			goalId: Type.Optional(Type.String({ description: "Goal ID" })),
			repo: Type.Optional(Type.String({ description: "Git repo path" })),
		}),
		execute: async ({ name, goalId, repo }) => {
			const db = getDb();
			const project = createProject(db, name, goalId, repo);
			return Text(`📁 Project: ${project.name} (${project.id})`);
		},
	});

	// ── Org Management ──

	pi.registerCommand("corp-hire", {
		description: "Hire an agent into the org (optionally assign to a specific project)",
		parameters: Type.Object({
			name: Type.String({ description: "Agent name" }),
			role: Type.String({ description: `Role: ${ROLES.join(", ")}` }),
			runtime: Type.String({ description: `Runtime: ${RUNTIMES.join(", ")}` }),
			model: Type.Optional(Type.String({ description: "Model override" })),
			reportsTo: Type.Optional(Type.String({ description: "Manager agent ID" })),
			budget: Type.Optional(Type.Number({ description: "Monthly budget USD" })),
			projectId: Type.Optional(Type.String({ description: "Assign to specific project (specialist)" })),
		}),
		execute: async ({ name, role, runtime, model, reportsTo, budget, projectId }) => {
			const db = getDb();
			const agent = hireAgent(db, name, role as Role, runtime as Runtime, { model, reportsTo, budget, projectId });
			const skills = getSkillkit(db, role);
			const proj = projectId ? ` → project:${projectId.slice(0, 6)}` : " (generalist)";
			return Text(`🤝 Hired: ${agent.name} as ${agent.role} [${agent.runtime}]${budget ? ` ($${budget}/mo)` : ""}${proj}\n   Skills: ${skills.map((s) => s.name).join(", ") || "none"}`);
		},
	});

	// ── Tickets ──

	pi.registerCommand("corp-ticket", {
		description: "Create a ticket",
		parameters: Type.Object({
			title: Type.String({ description: "Ticket title" }),
			projectId: Type.Optional(Type.String({ description: "Project ID" })),
			description: Type.Optional(Type.String({ description: "Description" })),
			priority: Type.Optional(Type.Number({ description: "Priority 1-5" })),
		}),
		execute: async ({ title, projectId, description, priority }) => {
			const db = getDb();
			const ticket = createTicket(db, title, { projectId, description, priority });
			return Text(`🎫 [P${ticket.priority}] ${ticket.title} (${ticket.id})`);
		},
	});

	pi.registerCommand("corp-prd", {
		description: "Import PRD JSON as tickets (Ralph pattern)",
		parameters: Type.Object({
			file: Type.String({ description: "Path to PRD JSON" }),
			projectId: Type.String({ description: "Project ID" }),
		}),
		execute: async ({ file, projectId }) => {
			const db = getDb();
			const raw = await Bun.file(file).text();
			const prd = JSON.parse(raw);
			const stories = prd.userStories ?? prd.stories ?? prd;
			if (!Array.isArray(stories)) return Text("❌ PRD must contain an array of stories");
			const tickets = importPrd(db, projectId, stories);
			return Text(`📋 Imported ${tickets.length} stories as tickets`);
		},
	});

	// ── Apps ──

	pi.registerCommand("corp-app", {
		description: "Register an app/integration",
		parameters: Type.Object({
			name: Type.String({ description: "App name" }),
			type: Type.String({ description: "github, gmail, calendar, analytics, deploy, payments, social, docs, drive, custom" }),
			projectId: Type.Optional(Type.String({ description: "Project ID" })),
		}),
		execute: async ({ name, type, projectId }) => {
			const db = getDb();
			const app = registerApp(db, name, type as AppType, { projectId });
			return Text(`📱 App registered: ${app.name} (${app.type})`);
		},
	});

	// ── DevCycle ──

	pi.registerCommand("corp-cycle", {
		description: "Show or advance the current DevCycle phase",
		parameters: Type.Object({
			advance: Type.Optional(Type.Boolean({ description: "Advance to next phase" })),
		}),
		execute: async ({ advance }) => {
			const db = getDb();
			const cycles = listCycles(db);
			if (cycles.length === 0) return Text("No active cycles. Use /corp-bootstrap to start.");

			const cycle = cycles[0]!;
			if (advance) {
				const next = advancePhase(db, cycle.id);
				const work = getPhaseWork(next);
				const lines = [`🔄 Advanced to: ${next.toUpperCase()} (iter ${cycle.iteration})`];
				if (work.length > 0) {
					lines.push("  Work for this phase:");
					for (const w of work) lines.push(`    ${w.role}: ${w.task}`);
				}
				return Text(lines.join("\n"));
			}

			// Show current phase
			const work = getPhaseWork(cycle.phase);
			const phases = ["plan", "build", "test", "review", "deploy", "measure", "iterate"];
			const bar = phases.map((p) => p === cycle.phase ? `[${p.toUpperCase()}]` : ` ${p} `).join(" → ");
			const lines = [
				`🔄 Cycle ${cycle.id.slice(0, 6)} — iteration ${cycle.iteration}/${cycle.max_iterations}`,
				`   ${bar}`,
				"",
				"  Phase work:",
			];
			for (const w of work) lines.push(`    ${w.role}: ${w.task}`);
			return Text(lines.join("\n"));
		},
	});

	// ── Dispatch ──

	pi.registerCommand("corp-dispatch", {
		description: "Match and dispatch todo tickets to available agents (with skills). Shows the exact commands.",
		parameters: Type.Object({
			dryRun: Type.Optional(Type.Boolean({ description: "Preview without dispatching" })),
		}),
		execute: async ({ dryRun }) => {
			const db = getDb();
			const matches = matchTicketsToAgents(db);
			if (matches.length === 0) return Text("No tickets to dispatch (no todo tickets or no idle agents)");

			const lines: string[] = [];
			for (const { ticket, agent } of matches) {
				const skills = getSkillkit(db, agent.role);
				const skillNames = skills.map((s) => s.name).slice(0, 3).join(", ");
				if (dryRun) {
					lines.push(`  [dry] ${ticket.title}`);
					lines.push(`        → ${agent.name} [${agent.runtime}] (${skillNames})`);
				} else {
					const run = dispatchRun(db, ticket.id, agent.id);
					const cmd = buildDispatchCommand(db, run);
					lines.push(`  ⚡ ${ticket.title}`);
					lines.push(`     agent: ${agent.name} [${agent.runtime}] skills: ${skillNames}`);
					lines.push(`     run:   ${run.id}`);
					lines.push(`     cmd:   ${cmd.slice(0, 120)}${cmd.length > 120 ? "..." : ""}`);
					lines.push("");
				}
			}
			return Text(`${dryRun ? "Would dispatch" : "Dispatched"} ${matches.length} tickets:\n\n${lines.join("\n")}`);
		},
	});

	// ── Execute ──

	pi.registerCommand("corp-run", {
		description: "Execute a specific dispatched run (shows the command to run)",
		parameters: Type.Object({
			runId: Type.String({ description: "Run ID to execute" }),
		}),
		execute: async ({ runId }) => {
			const db = getDb();
			const run = db.query("SELECT * FROM runs WHERE id = ?").get(runId) as Run | null;
			if (!run) return Text(`❌ Run ${runId} not found`);
			if (run.status !== "running") return Text(`❌ Run ${runId} is ${run.status}, not running`);
			const cmd = buildDispatchCommand(db, run);
			const lines = [
				`── EXECUTE RUN ${runId.slice(0, 8)} ──`,
				"",
				`  ${cmd}`,
				"",
				"  Copy and run this, or the LLM can execute it via interactive_shell dispatch mode.",
				`  When done, call: /corp-done runId="${runId}" or /corp-fail runId="${runId}" error="..."`,
			];
			return Text(lines.join("\n"));
		},
	});

	pi.registerCommand("corp-done", {
		description: "Mark a run as completed",
		parameters: Type.Object({
			runId: Type.String({ description: "Run ID" }),
			output: Type.Optional(Type.String({ description: "Output text" })),
			cost: Type.Optional(Type.Number({ description: "Cost in USD" })),
		}),
		execute: async ({ runId, output, cost }) => {
			const db = getDb();
			completeRun(db, runId, { output, cost });
			return Text(`✅ Run ${runId.slice(0, 8)} completed${cost ? ` ($${cost.toFixed(2)})` : ""}`);
		},
	});

	pi.registerCommand("corp-fail", {
		description: "Mark a run as failed",
		parameters: Type.Object({
			runId: Type.String({ description: "Run ID" }),
			error: Type.String({ description: "Error message" }),
		}),
		execute: async ({ runId, error }) => {
			const db = getDb();
			failRun(db, runId, error);
			return Text(`❌ Run ${runId.slice(0, 8)} failed: ${error}`);
		},
	});

	// ── Feed ──

	pi.registerCommand("corp-feed", {
		description: "Show activity feed — chronological log of all events",
		parameters: Type.Object({
			limit: Type.Optional(Type.Number({ description: "Number of events (default 20)" })),
			type: Type.Optional(Type.String({ description: "Filter by type prefix: agent, ticket, run, cycle, pipeline, heartbeat" })),
		}),
		execute: async ({ limit, type }) => {
			const db = getDb();
			const events = getFeed(db, limit ?? 20, type);
			if (events.length === 0) return Text("No events yet.");
			const lines = ["── ACTIVITY FEED ──────────────────────────────────────────"];
			for (const e of events) lines.push(formatEvent(e));
			return Text(lines.join("\n"));
		},
	});

	// ── Retry ──

	pi.registerCommand("corp-retry", {
		description: "Retry all failed tickets (max 3 attempts per ticket)",
		parameters: Type.Object({}),
		execute: async () => {
			const db = getDb();
			const count = retryFailed(db);
			if (count === 0) return Text("No failed tickets to retry (or all at max attempts).");
			return Text(`🔄 Retried ${count} failed ticket(s) — they're back in the todo queue.`);
		},
	});

	// ── Heartbeat ──

	pi.registerCommand("corp-heartbeat", {
		description: "Run one heartbeat cycle — check due agents and dispatch work",
		parameters: Type.Object({}),
		execute: async () => {
			const db = getDb();
			const result = tick(db);
			if (result.ticked === 0) return Text("💓 No agents due for heartbeat right now.");
			const lines = [`💓 Heartbeat: ${result.ticked} agents ticked`, ""];
			for (const action of result.actions) lines.push(`  ${action}`);
			return Text(lines.join("\n"));
		},
	});

	pi.registerCommand("corp-heartbeats", {
		description: "Show heartbeat schedule for all agents",
		parameters: Type.Object({}),
		execute: async () => {
			const db = getDb();
			const statuses = getHeartbeatStatus(db);
			const agents = listAgents(db).filter((a) => a.status !== "fired");
			const now = new Date().toISOString();

			const lines: string[] = ["── HEARTBEAT SCHEDULE ─────────────────────────────────────"];
			for (const s of statuses) {
				const agent = agents.find((a) => a.id === s.agent_id);
				if (!agent) continue;
				const isDue = s.next_beat <= now && s.interval !== "none";
				const icon = isDue ? "🔴" : agent.status === "working" ? "🔵" : "⚪";
				const lastStr = s.last_beat ? s.last_beat.slice(11, 19) : "never";
				const nextStr = s.next_beat === "never" ? "never" : s.next_beat.slice(11, 19);
				lines.push(`  ${icon} ${agent.name} (${s.interval}) last: ${lastStr} next: ${nextStr}${isDue ? " ← DUE" : ""}`);
			}
			lines.push("");
			const due = getDueAgents(db);
			lines.push(`  ${due.length} agent(s) due. Run /corp-heartbeat to tick.`);
			return Text(lines.join("\n"));
		},
	});

	// ── Skillkits ──

	pi.registerCommand("corp-skills", {
		description: "Show skillkits for all roles",
		parameters: Type.Object({
			role: Type.Optional(Type.String({ description: "Filter to specific role" })),
		}),
		execute: async ({ role }) => {
			const db = getDb();
			const lines: string[] = ["── SKILLKITS ──────────────────────────────────────────────"];
			const roles = role ? [role] : Object.keys(DEFAULT_SKILLKITS);
			for (const r of roles) {
				const skills = getSkillkit(db, r);
				lines.push(`  ${r}:`);
				for (const s of skills) {
					const src = s.source === "repo" ? ` (${s.repoUrl?.split("/").pop()})` : "";
					lines.push(`    • ${s.name}${src}`);
				}
			}
			return Text(lines.join("\n"));
		},
	});

	// ── Marketing Pipelines ──

	pi.registerCommand("corp-marketing", {
		description: "Start or view a marketing pipeline (content, launch, growth, evergreen)",
		parameters: Type.Object({
			start: Type.Optional(Type.String({ description: "Pipeline type to start: content, launch, growth, evergreen" })),
			projectId: Type.Optional(Type.String({ description: "Project ID (uses first active if omitted)" })),
		}),
		execute: async ({ start, projectId }) => {
			const db = getDb();
			if (start) {
				let pid = projectId;
				if (!pid) {
					const projects = listProjects(db);
					if (projects.length === 0) return Text("❌ No projects. Create one first.");
					pid = projects[0]!.id;
				}
				const pipeline = createPipeline(db, start as PipelineType, pid!);
				const task = getCurrentTask(pipeline);
				const lines = [
					`🚀 Marketing pipeline started: ${start.toUpperCase()} (${pipeline.tasks.length} tasks)`,
					"",
					`  Current task: ${task?.title}`,
					`  Skill: ${task?.skill}`,
					`  Role: ${task?.role}`,
					"",
					"  Run /corp-marketing-next to execute the current task.",
				];
				return Text(lines.join("\n"));
			}

			// Show all pipelines
			const pipelines = listPipelines(db);
			if (pipelines.length === 0) {
				const lines = [
					"── MARKETING PIPELINES ────────────────────────────────",
					"",
					"  No active pipelines. Start one:",
					'  /corp-marketing start="content"   — Content → SEO → Social → Measure',
					'  /corp-marketing start="launch"    — Landing page → Emails → Social → Outreach',
					'  /corp-marketing start="growth"    — Analytics → CRO → A/B Tests → Referral',
					'  /corp-marketing start="evergreen" — Weekly: Analytics → Repurpose → Newsletter → SEO',
				];
				return Text(lines.join("\n"));
			}

			const lines: string[] = ["── MARKETING PIPELINES ────────────────────────────────"];
			for (const p of pipelines) {
				const task = getCurrentTask(p);
				const pct = p.tasks.length > 0 ? Math.round((p.current_task / p.tasks.length) * 100) : 0;
				const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));
				lines.push(`  ${p.status === "completed" ? "✅" : "🔄"} ${p.type.toUpperCase()} [${bar}] ${pct}%`);
				if (task) {
					lines.push(`     → ${task.title} (${task.skill}) [${task.role}]`);
				} else if (p.status === "completed") {
					lines.push(`     All ${p.tasks.length} tasks completed`);
				}
			}
			return Text(lines.join("\n"));
		},
	});

	pi.registerCommand("corp-marketing-next", {
		description: "Show the next marketing task to execute (with full prompt)",
		parameters: Type.Object({
			pipelineId: Type.Optional(Type.String({ description: "Pipeline ID (uses latest if omitted)" })),
		}),
		execute: async ({ pipelineId }) => {
			const db = getDb();
			const pipelines = listPipelines(db);
			const pipeline = pipelineId
				? pipelines.find((p) => p.id === pipelineId)
				: pipelines.find((p) => p.status === "running");
			if (!pipeline) return Text("No active marketing pipeline.");

			const task = getCurrentTask(pipeline);
			if (!task) return Text("✅ Pipeline complete! All tasks done.");

			const prompt = buildMarketingPrompt(pipeline, task);
			const lines = [
				`── MARKETING TASK ${pipeline.current_task + 1}/${pipeline.tasks.length} ──`,
				`  Pipeline: ${pipeline.type.toUpperCase()}`,
				`  Task: ${task.title}`,
				`  Skill: ${task.skill}`,
				`  Role: ${task.role}`,
				`  Output: ${task.outputType}`,
				"",
				"── PROMPT ──────────────────────────────────────────────",
				prompt,
				"",
				"  The LLM can auto-execute this via corp_run_marketing_task tool.",
			];
			return Text(lines.join("\n"));
		},
	});

	// ── LLM Tools ──

	pi.addLLMTool({
		name: "corp_dashboard",
		description: "Get full autonomous corp status: goals, org, cycles, tickets, apps, costs, skillkits",
		parameters: Type.Object({}),
		execute: async () => {
			const db = getDb();
			const stats = getStats(db);
			const agents = listAgents(db);
			const tickets = listTickets(db);
			const cycles = listCycles(db);
			const apps = listApps(db);
			const skillkits = Object.fromEntries(
				Object.keys(DEFAULT_SKILLKITS).map((role) => [role, getSkillkit(db, role).map((s) => s.name)])
			);
			return JSON.stringify({ stats, agents: agents.slice(0, 20), tickets: tickets.slice(0, 20), cycles, apps, skillkits });
		},
	});

	pi.addLLMTool({
		name: "corp_bootstrap",
		description: "Bootstrap an autonomous corp: create goal, project, 9 agents, 5 apps, start DevCycle",
		parameters: Type.Object({
			goalTitle: Type.String(),
			projectName: Type.String(),
			repo: Type.Optional(Type.String()),
		}),
		execute: async ({ goalTitle, projectName, repo }) => {
			const db = getDb();
			const goal = createGoal(db, goalTitle);
			const project = createProject(db, projectName, goal.id, repo);
			const ceo = hireAgent(db, "CEO", "ceo", "claude-desktop", { budget: 200 });
			const cto = hireAgent(db, "CTO", "cto", "claude", { reportsTo: ceo.id, budget: 100 });
			const lead = hireAgent(db, "Lead", "lead", "pi", { reportsTo: cto.id, budget: 50 });
			hireAgent(db, "Builder-1", "builder", "pi", { reportsTo: lead.id, budget: 30 });
			hireAgent(db, "Builder-2", "builder", "codex", { reportsTo: lead.id, budget: 30 });
			hireAgent(db, "Scout", "scout", "gemini", { reportsTo: cto.id, budget: 15 });
			hireAgent(db, "Reviewer", "reviewer", "claude", { reportsTo: cto.id, budget: 20 });
			hireAgent(db, "Designer", "designer", "claude", { reportsTo: lead.id, budget: 20 });
			hireAgent(db, "Marketer", "marketer", "claude-desktop", { reportsTo: ceo.id, budget: 30 });
			registerApp(db, "GitHub", "github", { projectId: project.id });
			registerApp(db, "Gmail", "gmail", { projectId: project.id });
			registerApp(db, "Calendar", "calendar", { projectId: project.id });
			registerApp(db, "Vercel", "deploy", { projectId: project.id });
			registerApp(db, "Analytics", "analytics", { projectId: project.id });
			const cycle = createCycle(db, goal.id, project.id);
			return JSON.stringify({ goalId: goal.id, projectId: project.id, cycleId: cycle.id, agents: 9, apps: 5 });
		},
	});

	pi.addLLMTool({
		name: "corp_advance_cycle",
		description: "Advance the DevCycle to the next phase (plan→build→test→review→deploy→measure→iterate→build...)",
		parameters: Type.Object({
			cycleId: Type.Optional(Type.String({ description: "Cycle ID (uses latest if omitted)" })),
		}),
		execute: async ({ cycleId }) => {
			const db = getDb();
			let id = cycleId;
			if (!id) {
				const cycles = listCycles(db);
				if (cycles.length === 0) return JSON.stringify({ error: "No active cycles" });
				id = cycles[0]!.id;
			}
			const next = advancePhase(db, id!);
			const work = getPhaseWork(next);
			return JSON.stringify({ phase: next, work });
		},
	});

	pi.addLLMTool({
		name: "corp_hire",
		description: "Hire an agent with role-based skillkit",
		parameters: Type.Object({
			name: Type.String(), role: Type.String(), runtime: Type.String(),
			model: Type.Optional(Type.String()), reportsTo: Type.Optional(Type.String()), budget: Type.Optional(Type.Number()),
		}),
		execute: async ({ name, role, runtime, model, reportsTo, budget }) => {
			const db = getDb();
			const agent = hireAgent(db, name, role as Role, runtime as Runtime, { model, reportsTo, budget });
			const skills = getSkillkit(db, role).map((s) => s.name);
			return JSON.stringify({ ...agent, skills });
		},
	});

	pi.addLLMTool({
		name: "corp_dispatch",
		description: "Match and dispatch todo tickets to idle agents with their skillkits",
		parameters: Type.Object({}),
		execute: async () => {
			const db = getDb();
			const matches = matchTicketsToAgents(db);
			const results = [];
			for (const { ticket, agent } of matches) {
				const run = dispatchRun(db, ticket.id, agent.id);
				const skills = getSkillkit(db, agent.role).map((s) => s.name);
				const cmd = buildCommand(agent.runtime as Runtime, buildSkillInjection(getSkillkit(db, agent.role)) + ticket.title, agent.model);
				results.push({ ticketId: ticket.id, agentId: agent.id, runId: run.id, skills, command: cmd });
			}
			return JSON.stringify({ dispatched: results.length, runs: results });
		},
	});

	pi.addLLMTool({
		name: "corp_create_ticket",
		description: "Create a ticket",
		parameters: Type.Object({
			title: Type.String(), description: Type.Optional(Type.String()),
			projectId: Type.Optional(Type.String()), priority: Type.Optional(Type.Number()),
		}),
		execute: async ({ title, description, projectId, priority }) => {
			const db = getDb();
			const ticket = createTicket(db, title, { projectId, description, priority });
			return JSON.stringify(ticket);
		},
	});

	pi.addLLMTool({
		name: "corp_complete_run",
		description: "Mark a run as completed",
		parameters: Type.Object({
			runId: Type.String(), output: Type.Optional(Type.String()),
			cost: Type.Optional(Type.Number()), inputTokens: Type.Optional(Type.Number()), outputTokens: Type.Optional(Type.Number()),
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
		parameters: Type.Object({ runId: Type.String(), error: Type.String() }),
		execute: async ({ runId, error }) => {
			const db = getDb();
			failRun(db, runId, error);
			return JSON.stringify({ status: "failed", runId });
		},
	});

	pi.addLLMTool({
		name: "corp_register_app",
		description: "Register an external app/integration (github, gmail, deploy, analytics, etc.)",
		parameters: Type.Object({
			name: Type.String(), type: Type.String(), projectId: Type.Optional(Type.String()),
			config: Type.Optional(Type.Object({})),
		}),
		execute: async ({ name, type, projectId, config }) => {
			const db = getDb();
			const app = registerApp(db, name, type as AppType, { projectId, config: config as Record<string, unknown> });
			return JSON.stringify(app);
		},
	});

	pi.addLLMTool({
		name: "corp_heartbeat",
		description: "Run one heartbeat cycle — checks all agents, dispatches work for those who are due, auto-advances DevCycle",
		parameters: Type.Object({}),
		execute: async () => {
			const db = getDb();
			const result = tick(db);
			return JSON.stringify(result);
		},
	});

	pi.addLLMTool({
		name: "corp_autopilot",
		description: "ONE CALL to create an entire autonomous company from a mission statement. Creates goal, 9 agents, apps, tickets, DevCycle, and marketing pipelines. Returns the CEO prompt.",
		parameters: Type.Object({
			mission: Type.String({ description: 'e.g., "Build a SaaS that helps freelancers track invoices"' }),
			repo: Type.Optional(Type.String()),
			budget: Type.Optional(Type.Number({ description: "Monthly budget, default $500" })),
		}),
		execute: async ({ mission, repo, budget }) => {
			const db = getDb();
			const totalBudget = budget ?? 500;
			const goal = createGoal(db, mission);
			const projectName = mission.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
			const project = createProject(db, projectName, goal.id, repo);
			const ceo = hireAgent(db, "CEO", "ceo", "claude-desktop", { budget: totalBudget * 0.10 });
			const cto = hireAgent(db, "CTO", "cto", "claude", { reportsTo: ceo.id, budget: totalBudget * 0.10 });
			const lead = hireAgent(db, "Lead", "lead", "pi", { reportsTo: cto.id, budget: totalBudget * 0.10 });
			hireAgent(db, "Builder-1", "builder", "pi", { reportsTo: lead.id, budget: totalBudget * 0.15 });
			hireAgent(db, "Builder-2", "builder", "codex", { reportsTo: lead.id, budget: totalBudget * 0.15 });
			hireAgent(db, "Scout", "scout", "gemini", { reportsTo: cto.id, budget: totalBudget * 0.05 });
			hireAgent(db, "Reviewer", "reviewer", "claude", { reportsTo: cto.id, budget: totalBudget * 0.10 });
			hireAgent(db, "Designer", "designer", "claude", { reportsTo: lead.id, budget: totalBudget * 0.10 });
			hireAgent(db, "Marketer", "marketer", "claude-desktop", { reportsTo: ceo.id, budget: totalBudget * 0.15 });
			registerApp(db, "GitHub", "github", { projectId: project.id });
			registerApp(db, "Gmail", "gmail", { projectId: project.id });
			registerApp(db, "Vercel", "deploy", { projectId: project.id });
			registerApp(db, "Analytics", "analytics", { projectId: project.id });
			const plan = generateInitialPlan(mission);
			for (const item of plan) {
				createTicket(db, item.title, { projectId: project.id, priority: item.priority, description: item.description });
			}
			const cycle = createCycle(db, goal.id, project.id);
			createPipeline(db, "launch", project.id);
			createPipeline(db, "content", project.id);
			const ceoPrompt = buildAutopilotPrompt(mission);
			return JSON.stringify({
				goalId: goal.id, projectId: project.id, cycleId: cycle.id,
				agents: 9, apps: 4, tickets: plan.length, pipelines: 2,
				ceoPrompt,
			});
		},
	});

	pi.addLLMTool({
		name: "corp_start_marketing",
		description: "Start a marketing pipeline: content (SEO articles + social), launch (landing page + emails + outreach), growth (CRO + A/B tests + referral), or evergreen (weekly newsletter + analytics + repurpose)",
		parameters: Type.Object({
			type: Type.String({ description: "content, launch, growth, or evergreen" }),
			projectId: Type.Optional(Type.String()),
		}),
		execute: async ({ type, projectId }) => {
			const db = getDb();
			let pid = projectId;
			if (!pid) {
				const projects = listProjects(db);
				if (projects.length === 0) return JSON.stringify({ error: "No projects" });
				pid = projects[0]!.id;
			}
			const pipeline = createPipeline(db, type as PipelineType, pid!);
			const task = getCurrentTask(pipeline);
			return JSON.stringify({
				pipelineId: pipeline.id,
				type: pipeline.type,
				totalTasks: pipeline.tasks.length,
				currentTask: task ? { title: task.title, skill: task.skill, role: task.role } : null,
			});
		},
	});

	pi.addLLMTool({
		name: "corp_marketing_next",
		description: "Get the next marketing task with full prompt (ready to execute)",
		parameters: Type.Object({
			pipelineId: Type.Optional(Type.String()),
		}),
		execute: async ({ pipelineId }) => {
			const db = getDb();
			const pipelines = listPipelines(db);
			const pipeline = pipelineId
				? pipelines.find((p) => p.id === pipelineId)
				: pipelines.find((p) => p.status === "running");
			if (!pipeline) return JSON.stringify({ error: "No active pipeline" });
			const task = getCurrentTask(pipeline);
			if (!task) return JSON.stringify({ status: "completed" });
			const prompt = buildMarketingPrompt(pipeline, task);
			return JSON.stringify({
				taskIndex: pipeline.current_task,
				totalTasks: pipeline.tasks.length,
				task: { id: task.id, title: task.title, skill: task.skill, role: task.role, outputType: task.outputType },
				prompt,
			});
		},
	});

	pi.addLLMTool({
		name: "corp_marketing_complete_task",
		description: "Mark the current marketing task as done with its output, advance to next task",
		parameters: Type.Object({
			pipelineId: Type.Optional(Type.String()),
			output: Type.String({ description: "Output/result of the completed task" }),
		}),
		execute: async ({ pipelineId, output }) => {
			const db = getDb();
			const pipelines = listPipelines(db);
			const pipeline = pipelineId
				? pipelines.find((p) => p.id === pipelineId)
				: pipelines.find((p) => p.status === "running");
			if (!pipeline) return JSON.stringify({ error: "No active pipeline" });
			const nextTask = advancePipeline(db, pipeline.id, output);
			if (!nextTask) return JSON.stringify({ status: "completed", message: "Pipeline finished!" });
			return JSON.stringify({
				status: "advanced",
				nextTask: { title: nextTask.title, skill: nextTask.skill, role: nextTask.role },
			});
		},
	});
}
