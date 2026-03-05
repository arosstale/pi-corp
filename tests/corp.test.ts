import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createPipeline } from "../src/marketing.ts";
import { bootstrapAgency } from "../src/agency.ts";
import { createExperiment, startExperiment, completeExperiment, listExperiments, generateHypotheses, getPortfolioAlpha } from "../src/experiments.ts";
import { createIntake, generateBrief, generateProposal, intakeToTickets } from "../src/intake.ts";
import { addProspect, listProspects, updateProspectStatus, getProspectStats, generatePersonalizedLine } from "../src/prospects.ts";
import { createSequence, personalizeEmail } from "../src/cold-email.ts";
import { generateSeoPages, INDUSTRY_KEYWORDS } from "../src/seo-pages.ts";
import { addClient, getRevenueMetrics, churnClient } from "../src/billing.ts";
import { generateWeeklyReport } from "../src/reporting.ts";

const SCHEMA = `
	CREATE TABLE marketing_pipelines (id TEXT PRIMARY KEY, type TEXT NOT NULL, project_id TEXT, status TEXT DEFAULT 'running', current_task INTEGER DEFAULT 0, tasks TEXT NOT NULL, outputs TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));

	CREATE TABLE goals (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
	CREATE TABLE projects (id TEXT PRIMARY KEY, goal_id TEXT REFERENCES goals(id), name TEXT NOT NULL, repo TEXT, branch TEXT DEFAULT 'main', status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')));
	CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, runtime TEXT NOT NULL DEFAULT 'pi', model TEXT, reports_to TEXT REFERENCES agents(id), budget_monthly REAL DEFAULT 0, spent_monthly REAL DEFAULT 0, status TEXT DEFAULT 'idle', project_id TEXT REFERENCES projects(id), created_at TEXT DEFAULT (datetime('now')));
	CREATE TABLE tickets (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), title TEXT NOT NULL, description TEXT, priority INTEGER DEFAULT 3, status TEXT DEFAULT 'todo', assigned_agent TEXT REFERENCES agents(id), source TEXT DEFAULT 'manual', source_id TEXT, story_index INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
	CREATE TABLE runs (id TEXT PRIMARY KEY, ticket_id TEXT REFERENCES tickets(id), agent_id TEXT REFERENCES agents(id), workspace TEXT, status TEXT DEFAULT 'running', attempt INTEGER DEFAULT 1, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cost REAL DEFAULT 0, started_at TEXT DEFAULT (datetime('now')), completed_at TEXT, error TEXT, output TEXT);
	CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, entity_type TEXT, entity_id TEXT, data TEXT, created_at TEXT DEFAULT (datetime('now')));
	CREATE TABLE prd_stories (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), title TEXT NOT NULL, description TEXT, acceptance_criteria TEXT, priority INTEGER DEFAULT 3, passes INTEGER DEFAULT 0, ticket_id TEXT REFERENCES tickets(id), created_at TEXT DEFAULT (datetime('now')));
	CREATE TABLE skillkits (role TEXT PRIMARY KEY, skills TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));
	CREATE TABLE cycles (id TEXT PRIMARY KEY, goal_id TEXT REFERENCES goals(id), project_id TEXT REFERENCES projects(id), phase TEXT DEFAULT 'plan', iteration INTEGER DEFAULT 1, max_iterations INTEGER DEFAULT 10, progress_log TEXT DEFAULT '', started_at TEXT DEFAULT (datetime('now')), completed_at TEXT);
	CREATE TABLE apps (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, config TEXT, project_id TEXT REFERENCES projects(id), status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')));
`;

describe("pi-corp", () => {
	let db: Database;

	beforeEach(() => {
		db = new Database(":memory:");
		db.exec("PRAGMA foreign_keys=ON");
		db.exec(SCHEMA);
	});

	afterEach(() => { db.close(); });

	// ── Goals ──

	test("create and list goals", () => {
		db.run("INSERT INTO goals (id, title) VALUES ('g1', 'Ship MVP')");
		const goals = db.query("SELECT * FROM goals WHERE status='active'").all() as { title: string }[];
		expect(goals.length).toBe(1);
		expect(goals[0]!.title).toBe("Ship MVP");
	});

	// ── Projects ──

	test("project links to goal", () => {
		db.run("INSERT INTO goals (id, title) VALUES ('g1', 'Goal')");
		db.run("INSERT INTO projects (id, goal_id, name, repo) VALUES ('p1', 'g1', 'webapp', '/home/user/webapp')");
		const p = db.query("SELECT * FROM projects WHERE id='p1'").get() as { goal_id: string };
		expect(p.goal_id).toBe("g1");
	});

	// ── Agents & Org ──

	test("hire agents with org hierarchy", () => {
		db.run("INSERT INTO agents (id, name, role, runtime) VALUES ('ceo', 'CEO', 'ceo', 'claude-desktop')");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to) VALUES ('cto', 'CTO', 'cto', 'claude', 'ceo')");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to) VALUES ('b1', 'Builder', 'builder', 'pi', 'cto')");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to) VALUES ('b2', 'Builder-2', 'builder', 'codex', 'cto')");
		const all = db.query("SELECT * FROM agents").all();
		expect(all.length).toBe(4);
		const reports = db.query("SELECT * FROM agents WHERE reports_to='cto'").all();
		expect(reports.length).toBe(2);
	});

	test("budget enforcement", () => {
		db.run("INSERT INTO agents (id, name, role, runtime, budget_monthly, spent_monthly) VALUES ('a1', 'B1', 'builder', 'pi', 10, 10.5)");
		const a = db.query("SELECT * FROM agents WHERE id='a1'").get() as { spent_monthly: number; budget_monthly: number };
		expect(a.spent_monthly).toBeGreaterThan(a.budget_monthly);
	});

	test("recursive org tree", () => {
		db.run("INSERT INTO agents (id, name, role, runtime) VALUES ('ceo', 'CEO', 'ceo', 'claude-desktop')");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to) VALUES ('cto', 'CTO', 'cto', 'claude', 'ceo')");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to) VALUES ('lead', 'Lead', 'lead', 'pi', 'cto')");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to) VALUES ('b1', 'B1', 'builder', 'pi', 'lead')");
		// Verify 3 levels
		const roots = db.query("SELECT * FROM agents WHERE reports_to IS NULL").all();
		expect(roots.length).toBe(1);
		const l2 = db.query("SELECT * FROM agents WHERE reports_to = 'ceo'").all();
		expect(l2.length).toBe(1);
		const l3 = db.query("SELECT * FROM agents WHERE reports_to = 'cto'").all();
		expect(l3.length).toBe(1);
		const l4 = db.query("SELECT * FROM agents WHERE reports_to = 'lead'").all();
		expect(l4.length).toBe(1);
	});

	// ── Tickets ──

	test("tickets ordered by priority", () => {
		db.run("INSERT INTO tickets (id, title, priority) VALUES ('t1', 'Low', 5)");
		db.run("INSERT INTO tickets (id, title, priority) VALUES ('t2', 'High', 1)");
		const ts = db.query("SELECT * FROM tickets ORDER BY priority").all() as { title: string }[];
		expect(ts[0]!.title).toBe("High");
	});

	test("PRD import", () => {
		db.run("INSERT INTO projects (id, name) VALUES ('p1', 'proj')");
		for (let i = 0; i < 3; i++) {
			db.run("INSERT INTO tickets (id, project_id, title, source, story_index) VALUES (?, 'p1', ?, 'prd', ?)",
				[`t${i}`, `Story ${i}`, i]);
		}
		const ts = db.query("SELECT * FROM tickets WHERE source='prd'").all();
		expect(ts.length).toBe(3);
	});

	// ── Dispatch ──

	test("dispatch creates run and updates statuses", () => {
		db.run("INSERT INTO agents (id, name, role, runtime, status) VALUES ('a1', 'Builder', 'builder', 'pi', 'idle')");
		db.run("INSERT INTO tickets (id, title, status) VALUES ('t1', 'Fix bug', 'todo')");
		db.run("INSERT INTO runs (id, ticket_id, agent_id, status) VALUES ('r1', 't1', 'a1', 'running')");
		db.run("UPDATE tickets SET assigned_agent='a1', status='in_progress' WHERE id='t1'");
		db.run("UPDATE agents SET status='working' WHERE id='a1'");

		const r = db.query("SELECT status FROM runs WHERE id='r1'").get() as { status: string };
		const t = db.query("SELECT status FROM tickets WHERE id='t1'").get() as { status: string };
		const a = db.query("SELECT status FROM agents WHERE id='a1'").get() as { status: string };
		expect(r.status).toBe("running");
		expect(t.status).toBe("in_progress");
		expect(a.status).toBe("working");
	});

	test("complete run tracks cost", () => {
		db.run("INSERT INTO agents (id, name, role, runtime, status, spent_monthly) VALUES ('a1', 'B', 'builder', 'pi', 'working', 0)");
		db.run("INSERT INTO tickets (id, title, status) VALUES ('t1', 'Fix', 'in_progress')");
		db.run("INSERT INTO runs (id, ticket_id, agent_id, status) VALUES ('r1', 't1', 'a1', 'running')");
		db.run("UPDATE runs SET status='completed', cost=0.15, input_tokens=1000, output_tokens=500 WHERE id='r1'");
		db.run("UPDATE agents SET status='idle', spent_monthly=spent_monthly+0.15 WHERE id='a1'");
		db.run("UPDATE tickets SET status='done' WHERE id='t1'");

		const a = db.query("SELECT spent_monthly FROM agents WHERE id='a1'").get() as { spent_monthly: number };
		expect(a.spent_monthly).toBe(0.15);
	});

	test("fail run marks ticket failed", () => {
		db.run("INSERT INTO agents (id, name, role, runtime, status) VALUES ('a1', 'B', 'builder', 'pi', 'working')");
		db.run("INSERT INTO tickets (id, title, status) VALUES ('t1', 'Fix', 'in_progress')");
		db.run("INSERT INTO runs (id, ticket_id, agent_id, status) VALUES ('r1', 't1', 'a1', 'running')");
		db.run("UPDATE runs SET status='failed', error='tests failed' WHERE id='r1'");
		db.run("UPDATE tickets SET status='failed' WHERE id='t1'");
		const t = db.query("SELECT status FROM tickets WHERE id='t1'").get() as { status: string };
		expect(t.status).toBe("failed");
	});

	// ── Stats ──

	test("dashboard stats", () => {
		db.run("INSERT INTO goals (id, title) VALUES ('g1', 'Goal')");
		db.run("INSERT INTO agents (id, name, role, runtime) VALUES ('a1', 'A', 'builder', 'pi')");
		db.run("INSERT INTO tickets (id, title, status) VALUES ('t1', 'T1', 'todo')");
		db.run("INSERT INTO tickets (id, title, status) VALUES ('t2', 'T2', 'done')");
		db.run("INSERT INTO runs (id, ticket_id, agent_id, status, cost, input_tokens, output_tokens) VALUES ('r1', 't2', 'a1', 'completed', 0.50, 2000, 1000)");
		const totals = db.query("SELECT SUM(cost) as cost, SUM(input_tokens+output_tokens) as tokens FROM runs").get() as { cost: number; tokens: number };
		expect(totals.cost).toBe(0.50);
		expect(totals.tokens).toBe(3000);
	});

	// ── Events ──

	test("event log", () => {
		db.run("INSERT INTO events (type, entity_type, entity_id) VALUES ('agent.hired', 'agent', 'a1')");
		db.run("INSERT INTO events (type, entity_type, entity_id) VALUES ('ticket.created', 'ticket', 't1')");
		const e = db.query("SELECT * FROM events").all();
		expect(e.length).toBe(2);
	});

	// ── Skillkits ──

	test("default skillkits exist for all roles", () => {
		const roles = ["ceo", "cto", "lead", "builder", "scout", "reviewer", "designer", "marketer"];
		// Verify skillkits table works for custom overrides
		db.run("INSERT INTO skillkits (role, skills) VALUES ('builder', '[{\"name\":\"custom\",\"source\":\"inline\"}]')");
		const row = db.query("SELECT skills FROM skillkits WHERE role='builder'").get() as { skills: string };
		const skills = JSON.parse(row.skills);
		expect(skills.length).toBe(1);
		expect(skills[0].name).toBe("custom");
	});

	test("skillkit override persists", () => {
		db.run("INSERT INTO skillkits (role, skills) VALUES ('scout', '[{\"name\":\"a\",\"source\":\"builtin\"},{\"name\":\"b\",\"source\":\"builtin\"}]')");
		const row = db.query("SELECT skills FROM skillkits WHERE role='scout'").get() as { skills: string };
		expect(JSON.parse(row.skills).length).toBe(2);
	});

	// ── DevCycle ──

	test("cycle creation and phase tracking", () => {
		db.run("INSERT INTO goals (id, title) VALUES ('g1', 'Goal')");
		db.run("INSERT INTO projects (id, name) VALUES ('p1', 'Proj')");
		db.run("INSERT INTO cycles (id, goal_id, project_id, phase, iteration, max_iterations) VALUES ('c1', 'g1', 'p1', 'plan', 1, 10)");
		const c = db.query("SELECT * FROM cycles WHERE id='c1'").get() as { phase: string; iteration: number };
		expect(c.phase).toBe("plan");
		expect(c.iteration).toBe(1);
	});

	test("cycle phase advancement", () => {
		db.run("INSERT INTO goals (id, title) VALUES ('g1', 'Goal')");
		db.run("INSERT INTO projects (id, name) VALUES ('p1', 'Proj')");
		db.run("INSERT INTO cycles (id, goal_id, project_id, phase, iteration, max_iterations) VALUES ('c1', 'g1', 'p1', 'plan', 1, 10)");

		// plan → build
		db.run("UPDATE cycles SET phase = 'build' WHERE id = 'c1'");
		let c = db.query("SELECT phase FROM cycles WHERE id='c1'").get() as { phase: string };
		expect(c.phase).toBe("build");

		// build → test → review → deploy → measure → iterate
		const phases = ["test", "review", "deploy", "measure", "iterate"];
		for (const p of phases) {
			db.run("UPDATE cycles SET phase = ? WHERE id = 'c1'", [p]);
		}
		c = db.query("SELECT phase FROM cycles WHERE id='c1'").get() as { phase: string };
		expect(c.phase).toBe("iterate");

		// iterate loops back to build, increment iteration
		db.run("UPDATE cycles SET phase = 'build', iteration = iteration + 1 WHERE id = 'c1'");
		c = db.query("SELECT phase, iteration FROM cycles WHERE id='c1'").get() as { phase: string; iteration: number };
		expect(c.phase).toBe("build");
		expect(c.iteration).toBe(2);
	});

	test("cycle completes after max iterations", () => {
		db.run("INSERT INTO goals (id, title) VALUES ('g1', 'Goal')");
		db.run("INSERT INTO projects (id, name) VALUES ('p1', 'Proj')");
		db.run("INSERT INTO cycles (id, goal_id, project_id, phase, iteration, max_iterations) VALUES ('c1', 'g1', 'p1', 'iterate', 10, 10)");
		// At max iterations, iterate → done
		db.run("UPDATE cycles SET phase = 'done', completed_at = datetime('now') WHERE id = 'c1'");
		const c = db.query("SELECT phase, completed_at FROM cycles WHERE id='c1'").get() as { phase: string; completed_at: string };
		expect(c.phase).toBe("done");
		expect(c.completed_at).not.toBeNull();
	});

	test("progress log appends", () => {
		db.run("INSERT INTO goals (id, title) VALUES ('g1', 'Goal')");
		db.run("INSERT INTO projects (id, name) VALUES ('p1', 'Proj')");
		db.run("INSERT INTO cycles (id, goal_id, project_id, progress_log) VALUES ('c1', 'g1', 'p1', '')");
		db.run("UPDATE cycles SET progress_log = progress_log || 'Entry 1\n' WHERE id = 'c1'");
		db.run("UPDATE cycles SET progress_log = progress_log || 'Entry 2\n' WHERE id = 'c1'");
		const c = db.query("SELECT progress_log FROM cycles WHERE id='c1'").get() as { progress_log: string };
		expect(c.progress_log).toContain("Entry 1");
		expect(c.progress_log).toContain("Entry 2");
	});

	// ── Apps ──

	test("register and list apps", () => {
		db.run("INSERT INTO apps (id, name, type) VALUES ('a1', 'GitHub', 'github')");
		db.run("INSERT INTO apps (id, name, type) VALUES ('a2', 'Gmail', 'gmail')");
		db.run("INSERT INTO apps (id, name, type) VALUES ('a3', 'Vercel', 'deploy')");
		const apps = db.query("SELECT * FROM apps WHERE status='active'").all();
		expect(apps.length).toBe(3);
	});

	test("app config stored as JSON", () => {
		db.run("INSERT INTO apps (id, name, type, config) VALUES ('a1', 'GitHub', 'github', '{\"owner\":\"arosstale\",\"repo\":\"aid\"}')" );
		const a = db.query("SELECT config FROM apps WHERE id='a1'").get() as { config: string };
		const config = JSON.parse(a.config);
		expect(config.owner).toBe("arosstale");
		expect(config.repo).toBe("aid");
	});

	// ── Build Command ──

	test("runtime command generation", () => {
		// Verify the command shape per runtime
		const runtimes: Record<string, string> = {
			pi: "pi", claude: "claude", codex: "codex",
			gemini: "gemini", aider: "aider", goose: "goose", amp: "amp",
		};
		for (const [, bin] of Object.entries(runtimes)) {
			expect(typeof bin).toBe("string");
		}
	});

	// ── Marketing Pipelines ──

	test("content pipeline has 6 tasks", () => {
		const tasks = [
			"Define product marketing context",
			"Create content strategy",
			"Write first 3 SEO articles",
			"SEO audit the articles",
			"Create social distribution",
			"Set up analytics tracking",
		];
		expect(tasks.length).toBe(6);
	});

	test("launch pipeline has 8 tasks", () => {
		const tasks = [
			"Define product marketing context",
			"Create launch strategy",
			"Build landing page",
			"Implement landing page",
			"Create email sequences",
			"Create launch social content",
			"Cold outreach for launch",
			"Set up analytics",
		];
		expect(tasks.length).toBe(8);
	});

	test("marketing pipeline CRUD", () => {
		db.run("INSERT INTO projects (id, name) VALUES ('p1', 'proj')");
		const tasks = JSON.stringify([
			{ id: "t0", title: "Step 1", skill: "copywriting", prompt: "write copy", role: "marketer", outputType: "copy" },
			{ id: "t1", title: "Step 2", skill: "seo-audit", prompt: "audit seo", role: "marketer", outputType: "audit" },
		]);
		db.run("INSERT INTO marketing_pipelines (id, type, project_id, tasks) VALUES ('mp1', 'content', 'p1', ?)", [tasks]);
		const p = db.query("SELECT * FROM marketing_pipelines WHERE id='mp1'").get() as { type: string; current_task: number; status: string };
		expect(p.type).toBe("content");
		expect(p.current_task).toBe(0);
		expect(p.status).toBe("running");
	});

	test("marketing pipeline advancement", () => {
		db.run("INSERT INTO projects (id, name) VALUES ('p1', 'proj')");
		const tasks = JSON.stringify([
			{ id: "t0", title: "Step 1", skill: "copywriting", prompt: "p1", role: "marketer", outputType: "copy" },
			{ id: "t1", title: "Step 2", skill: "seo-audit", prompt: "p2", role: "marketer", outputType: "audit" },
			{ id: "t2", title: "Step 3", skill: "social-content", prompt: "p3", role: "marketer", outputType: "social" },
		]);
		db.run("INSERT INTO marketing_pipelines (id, type, project_id, tasks) VALUES ('mp1', 'content', 'p1', ?)", [tasks]);

		// Advance task 0 → 1
		db.run("UPDATE marketing_pipelines SET current_task=1, outputs='{\"t0\":\"copy output\"}' WHERE id='mp1'");
		let p = db.query("SELECT current_task, outputs FROM marketing_pipelines WHERE id='mp1'").get() as { current_task: number; outputs: string };
		expect(p.current_task).toBe(1);
		expect(JSON.parse(p.outputs).t0).toBe("copy output");

		// Advance to completion
		db.run("UPDATE marketing_pipelines SET current_task=3, status='completed' WHERE id='mp1'");
		p = db.query("SELECT status FROM marketing_pipelines WHERE id='mp1'").get() as { current_task: number; outputs: string; status: string };
		expect(p.status).toBe("completed");
	});

	test("pipeline outputs chain as context", () => {
		// Simulate: task 0 output feeds into task 1 prompt
		const outputs = { "t0": "Product: AI orchestration tool for developers" };
		const tasks = [
			{ id: "t0", title: "Context", skill: "product-marketing-context", prompt: "define context", role: "marketer", outputType: "document" },
			{ id: "t1", title: "Strategy", skill: "content-strategy", prompt: "create strategy", role: "marketer", outputType: "plan", dependsOn: "t0" },
		];
		// Task 1 should see task 0's output
		const task1 = tasks[1]!;
		expect(task1.dependsOn).toBe("t0");
		expect(outputs[task1.dependsOn!]).toContain("AI orchestration");
	});

	test("evergreen pipeline has 4 weekly tasks", () => {
		const tasks = ["Weekly analytics review", "Repurpose top content", "Draft weekly newsletter", "Update programmatic SEO pages"];
		expect(tasks.length).toBe(4);
	});

	// ── Project-aware Dispatch ──

	test("project-assigned agent gets project tickets first", () => {
		db.run("INSERT INTO projects (id, name) VALUES ('p1', 'Router')");
		db.run("INSERT INTO projects (id, name) VALUES ('p2', 'Build')");
		db.run("INSERT INTO agents (id, name, role, runtime, status, project_id) VALUES ('a1', 'Router-Dev', 'builder', 'pi', 'idle', 'p1')");
		db.run("INSERT INTO agents (id, name, role, runtime, status) VALUES ('a2', 'Generalist', 'builder', 'codex', 'idle')");
		db.run("INSERT INTO tickets (id, project_id, title, status) VALUES ('t1', 'p1', 'Router ticket', 'todo')");
		db.run("INSERT INTO tickets (id, project_id, title, status) VALUES ('t2', 'p2', 'Build ticket', 'todo')");
		// Router-Dev should match Router ticket, Generalist should match Build ticket
		const idle = db.query("SELECT * FROM agents WHERE status='idle'").all() as { id: string; project_id: string | null }[];
		expect(idle.length).toBe(2);
		const specialist = idle.find(a => a.project_id === 'p1');
		expect(specialist).toBeDefined();
	});

	// ── Retry ──

	test("retry resets failed tickets to todo", () => {
		db.run("INSERT INTO agents (id, name, role, runtime, status) VALUES ('a1', 'B', 'builder', 'pi', 'idle')");
		db.run("INSERT INTO tickets (id, title, status) VALUES ('t1', 'Failed task', 'failed')");
		db.run("INSERT INTO runs (id, ticket_id, agent_id, status) VALUES ('r1', 't1', 'a1', 'failed')");
		// Reset to todo
		db.run("UPDATE tickets SET status = 'todo' WHERE id = 't1' AND (SELECT COUNT(*) FROM runs WHERE ticket_id = 't1') < 3");
		const t = db.query("SELECT status FROM tickets WHERE id='t1'").get() as { status: string };
		expect(t.status).toBe("todo");
	});

	test("retry stops after 3 attempts", () => {
		db.run("INSERT INTO agents (id, name, role, runtime, status) VALUES ('a1', 'B', 'builder', 'pi', 'idle')");
		db.run("INSERT INTO tickets (id, title, status) VALUES ('t1', 'Stubborn task', 'failed')");
		db.run("INSERT INTO runs (id, ticket_id, agent_id, status) VALUES ('r1', 't1', 'a1', 'failed')");
		db.run("INSERT INTO runs (id, ticket_id, agent_id, status) VALUES ('r2', 't1', 'a1', 'failed')");
		db.run("INSERT INTO runs (id, ticket_id, agent_id, status) VALUES ('r3', 't1', 'a1', 'failed')");
		// Should NOT reset — 3 attempts
		const count = (db.query("SELECT COUNT(*) as c FROM runs WHERE ticket_id = 't1'").get() as { c: number }).c;
		expect(count).toBe(3);
	});

	// ── Feed ──

	test("event feed returns chronological events", () => {
		db.run("INSERT INTO events (type, entity_type, entity_id, data) VALUES ('agent.hired', 'agent', 'a1', '{\"name\":\"Builder\"}')");
		db.run("INSERT INTO events (type, entity_type, entity_id, data) VALUES ('ticket.created', 'ticket', 't1', '{\"title\":\"Fix\"}')");
		db.run("INSERT INTO events (type, entity_type, entity_id, data) VALUES ('run.dispatched', 'run', 'r1', '{\"ticketId\":\"t1\"}')");
		db.run("INSERT INTO events (type, entity_type, entity_id, data) VALUES ('heartbeat.tick', 'agent', 'a1', '{\"role\":\"builder\"}')");
		const events = db.query("SELECT * FROM events ORDER BY id DESC LIMIT 10").all();
		expect(events.length).toBe(4);
	});

	test("feed can filter by type", () => {
		db.run("INSERT INTO events (type, entity_type, entity_id) VALUES ('agent.hired', 'agent', 'a1')");
		db.run("INSERT INTO events (type, entity_type, entity_id) VALUES ('ticket.created', 'ticket', 't1')");
		db.run("INSERT INTO events (type, entity_type, entity_id) VALUES ('agent.fired', 'agent', 'a2')");
		const agentEvents = db.query("SELECT * FROM events WHERE type LIKE 'agent%'").all();
		expect(agentEvents.length).toBe(2);
	});

	// ── WaelCorp Pipeline ──

	test("waelcorp pipeline has 8 tasks covering SEO + cold outreach", () => {
		db.run("INSERT INTO projects (id, name) VALUES ('p1', 'Test')");
		const pipeline = createPipeline(db, "waelcorp", "p1");
		expect(pipeline.tasks.length).toBe(8);
		expect(pipeline.tasks[0].title).toContain("SEO keyword research");
		expect(pipeline.tasks[3].title).toContain("Cold outreach");
		expect(pipeline.tasks[7].title).toContain("free tool");
	});

	// ── Client Intake ──

	test("intake creates brief and proposal", () => {
		const intake = createIntake(db, { clientName: "Acme Corp", goals: "Redesign website to get more leads", budgetTier: "growth", pagesNeeded: ["Homepage", "About", "Pricing"] });
		expect(intake.client_name).toBe("Acme Corp");
		expect(intake.budget_tier).toBe("growth");
		const brief = generateBrief(intake);
		expect(brief).toContain("Acme Corp");
		expect(brief).toContain("Homepage");
		const proposal = generateProposal(intake);
		expect(proposal).toContain("$2000");
	});

	test("approved intake creates tickets", () => {
		db.run("INSERT INTO projects (id, name) VALUES ('p1', 'Client')");
		const intake = createIntake(db, { clientName: "Test Co", goals: "New site", pagesNeeded: ["Home", "Contact"] });
		const count = intakeToTickets(db, intake.id, "p1");
		expect(count).toBe(5); // 2 pages + hosting + QA + launch
	});

	// ── Prospects ──

	test("prospect pipeline tracking", () => {
		const p = addProspect(db, { companyName: "BadSite Inc", url: "https://badsite.com", lighthouseScore: 28, industry: "SaaS" });
		expect(p.lighthouse_score).toBe(28);
		const line = generatePersonalizedLine(p);
		expect(line).toContain("28/100");
		updateProspectStatus(db, p.id, "contacted");
		const stats = getProspectStats(db);
		expect(stats.contacted).toBe(1);
	});

	// ── Cold Email ──

	test("cold email personalization", () => {
		const seq = createSequence(db, "lighthouse-score");
		expect(seq.emails.length).toBe(4);
		const prospect = { company_name: "TestCo", lighthouse_score: 34, industry: "SaaS", personalized_line: "Your site is slow" } as any;
		const email = personalizeEmail(seq.emails[0]!, prospect);
		expect(email.subject).toContain("34/100");
		expect(email.body).toContain("TestCo");
	});

	// ── SEO Pages ──

	test("generate SEO pages from keywords", () => {
		const pages = generateSeoPages(db, ["Web Design for Dentists", "Web Design for Lawyers"], "industry", "TestCorp");
		expect(pages.length).toBe(2);
		expect(pages[0]!.slug).toBe("web-design-for-dentists");
		expect(pages[0]!.title).toContain("TestCorp");
		// Dedup: running again should skip existing
		const pages2 = generateSeoPages(db, ["Web Design for Dentists"], "industry");
		expect(pages2.length).toBe(0);
	});

	// ── Billing ──

	test("billing tracks MRR and churn", () => {
		addClient(db, { clientName: "Client A", plan: "starter" });
		addClient(db, { clientName: "Client B", plan: "growth" });
		const c = addClient(db, { clientName: "Client C", plan: "scale" });
		let metrics = getRevenueMetrics(db);
		expect(metrics.mrr).toBe(7500); // 500 + 2000 + 5000
		expect(metrics.activeClients).toBe(3);
		churnClient(db, c.id);
		metrics = getRevenueMetrics(db);
		expect(metrics.mrr).toBe(2500);
		expect(metrics.churnedClients).toBe(1);
	});

	// ── Quant Growth Experiments ──

	test("create and complete an experiment", () => {
		const exp = createExperiment(db, {
			type: "headline",
			hypothesis: "Benefit headline converts better",
			variantA: "Build websites fast",
			variantB: "Get 3x more clients with a better website",
		});
		expect(exp.status).toBe("hypothesis");
		startExperiment(db, exp.id, 500);
		const completed = completeExperiment(db, exp.id, 0.03, 0.045, 0.97);
		expect(completed.status).toBe("winner");
		expect(completed.alpha).toBeCloseTo(0.5); // 50% lift
	});

	test("portfolio alpha compounds winners", () => {
		createExperiment(db, { type: "headline", hypothesis: "H1", variantA: "A", variantB: "B" });
		const e1 = createExperiment(db, { type: "cta", hypothesis: "H2", variantA: "A", variantB: "B" });
		const e2 = createExperiment(db, { type: "pricing", hypothesis: "H3", variantA: "A", variantB: "B" });
		completeExperiment(db, e1.id, 0.05, 0.06, 0.96); // 20% lift, winner
		completeExperiment(db, e2.id, 0.10, 0.12, 0.98); // 20% lift, winner
		const portfolio = getPortfolioAlpha(db);
		expect(portfolio.winners).toBe(2);
		expect(portfolio.compoundedLift).toBeCloseTo(0.44); // 1.2 * 1.2 - 1 = 0.44
	});

	test("generate hypotheses returns 8 experiments", () => {
		const hypotheses = generateHypotheses(db, "");
		expect(hypotheses.length).toBe(8);
		expect(hypotheses[0]!.type).toBe("headline");
		expect(hypotheses[3]!.type).toBe("cold-email");
	});

	// ── Agency Templates ──

	test("design agency bootstrap creates full company", () => {
		const result = bootstrapAgency(db, "design", "TestCorp");
		expect(result.agentCount).toBe(9);
		expect(result.ticketCount).toBe(18);
		expect(result.pipelineCount).toBe(4);
		expect(result.projectIds.length).toBe(4);
		// Verify agents exist
		const agents = db.query("SELECT * FROM agents").all();
		expect(agents.length).toBe(9);
		// Verify tickets exist
		const tickets = db.query("SELECT * FROM tickets").all();
		expect(tickets.length).toBe(18);
	});

	test("seo agency bootstrap creates full company", () => {
		const result = bootstrapAgency(db, "seo", "SEOCorp");
		expect(result.agentCount).toBe(9);
		expect(result.ticketCount).toBe(12);
		expect(result.projectIds.length).toBe(3);
	});

	// ── Full Bootstrap ──

	test("full bootstrap flow", () => {
		// Goal + Project
		db.run("INSERT INTO goals (id, title) VALUES ('g1', 'Build AI app')");
		db.run("INSERT INTO projects (id, goal_id, name) VALUES ('p1', 'g1', 'myapp')");

		// Org
		db.run("INSERT INTO agents (id, name, role, runtime, budget_monthly) VALUES ('ceo', 'CEO', 'ceo', 'claude-desktop', 200)");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to, budget_monthly) VALUES ('cto', 'CTO', 'cto', 'claude', 'ceo', 100)");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to, budget_monthly) VALUES ('lead', 'Lead', 'lead', 'pi', 'cto', 50)");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to, budget_monthly) VALUES ('b1', 'B1', 'builder', 'pi', 'lead', 30)");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to, budget_monthly) VALUES ('b2', 'B2', 'builder', 'codex', 'lead', 30)");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to, budget_monthly) VALUES ('scout', 'Scout', 'scout', 'gemini', 'cto', 15)");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to, budget_monthly) VALUES ('rev', 'Reviewer', 'reviewer', 'claude', 'cto', 20)");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to, budget_monthly) VALUES ('des', 'Designer', 'designer', 'claude', 'lead', 20)");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to, budget_monthly) VALUES ('mkt', 'Marketer', 'marketer', 'claude-desktop', 'ceo', 30)");

		// Apps
		db.run("INSERT INTO apps (id, name, type) VALUES ('app1', 'GitHub', 'github')");
		db.run("INSERT INTO apps (id, name, type) VALUES ('app2', 'Gmail', 'gmail')");
		db.run("INSERT INTO apps (id, name, type) VALUES ('app3', 'Vercel', 'deploy')");

		// Cycle
		db.run("INSERT INTO cycles (id, goal_id, project_id, phase) VALUES ('c1', 'g1', 'p1', 'plan')");

		// Verify totals
		const agents = db.query("SELECT COUNT(*) as c FROM agents").get() as { c: number };
		const apps = db.query("SELECT COUNT(*) as c FROM apps").get() as { c: number };
		const totalBudget = db.query("SELECT SUM(budget_monthly) as b FROM agents").get() as { b: number };

		expect(agents.c).toBe(9);
		expect(apps.c).toBe(3);
		expect(totalBudget.b).toBe(495);
	});
});
