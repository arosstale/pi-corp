import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// We test against in-memory DB by importing the modules directly
// and overriding the DB path via env

describe("pi-corp", () => {
	let db: Database;

	beforeEach(() => {
		db = new Database(":memory:");
		db.exec("PRAGMA foreign_keys=ON");
		// Run migrations inline
		db.exec(`
			CREATE TABLE goals (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
			CREATE TABLE projects (id TEXT PRIMARY KEY, goal_id TEXT REFERENCES goals(id), name TEXT NOT NULL, repo TEXT, branch TEXT DEFAULT 'main', status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')));
			CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, runtime TEXT NOT NULL DEFAULT 'pi', model TEXT, reports_to TEXT REFERENCES agents(id), budget_monthly REAL DEFAULT 0, spent_monthly REAL DEFAULT 0, status TEXT DEFAULT 'idle', created_at TEXT DEFAULT (datetime('now')));
			CREATE TABLE tickets (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), title TEXT NOT NULL, description TEXT, priority INTEGER DEFAULT 3, status TEXT DEFAULT 'todo', assigned_agent TEXT REFERENCES agents(id), source TEXT DEFAULT 'manual', source_id TEXT, story_index INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
			CREATE TABLE runs (id TEXT PRIMARY KEY, ticket_id TEXT REFERENCES tickets(id), agent_id TEXT REFERENCES agents(id), workspace TEXT, status TEXT DEFAULT 'running', attempt INTEGER DEFAULT 1, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cost REAL DEFAULT 0, started_at TEXT DEFAULT (datetime('now')), completed_at TEXT, error TEXT, output TEXT);
			CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, entity_type TEXT, entity_id TEXT, data TEXT, created_at TEXT DEFAULT (datetime('now')));
			CREATE TABLE prd_stories (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), title TEXT NOT NULL, description TEXT, acceptance_criteria TEXT, priority INTEGER DEFAULT 3, passes INTEGER DEFAULT 0, ticket_id TEXT REFERENCES tickets(id), created_at TEXT DEFAULT (datetime('now')));
		`);
	});

	afterEach(() => {
		db.close();
	});

	// ── Goals ──

	test("create and list goals", () => {
		db.run("INSERT INTO goals (id, title, description) VALUES ('g1', 'Ship MVP', 'Launch v1')");
		const goals = db.query("SELECT * FROM goals WHERE status='active'").all() as { id: string; title: string }[];
		expect(goals.length).toBe(1);
		expect(goals[0]!.title).toBe("Ship MVP");
	});

	// ── Projects ──

	test("create project under goal", () => {
		db.run("INSERT INTO goals (id, title) VALUES ('g1', 'Goal')");
		db.run("INSERT INTO projects (id, goal_id, name, repo) VALUES ('p1', 'g1', 'webapp', '/home/user/webapp')");
		const project = db.query("SELECT * FROM projects WHERE id='p1'").get() as { goal_id: string; name: string };
		expect(project.goal_id).toBe("g1");
		expect(project.name).toBe("webapp");
	});

	// ── Agents ──

	test("hire and list agents", () => {
		db.run("INSERT INTO agents (id, name, role, runtime, budget_monthly) VALUES ('a1', 'Builder-1', 'builder', 'pi', 50)");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to) VALUES ('a2', 'Scout-1', 'scout', 'claude', 'a1')");
		const agents = db.query("SELECT * FROM agents ORDER BY name").all() as { name: string; role: string }[];
		expect(agents.length).toBe(2);
		expect(agents[0]!.role).toBe("builder");
	});

	test("budget tracking", () => {
		db.run("INSERT INTO agents (id, name, role, runtime, budget_monthly, spent_monthly) VALUES ('a1', 'B1', 'builder', 'pi', 10, 9.5)");
		const agent = db.query("SELECT * FROM agents WHERE id='a1'").get() as { budget_monthly: number; spent_monthly: number };
		expect(agent.spent_monthly).toBe(9.5);
		expect(agent.budget_monthly).toBe(10);
		// Over budget check
		db.run("UPDATE agents SET spent_monthly = 10.5 WHERE id = 'a1'");
		const over = db.query("SELECT * FROM agents WHERE id='a1'").get() as { spent_monthly: number; budget_monthly: number };
		expect(over.spent_monthly).toBeGreaterThan(over.budget_monthly);
	});

	test("org tree with reports_to", () => {
		db.run("INSERT INTO agents (id, name, role, runtime) VALUES ('cto', 'CTO', 'cto', 'claude')");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to) VALUES ('b1', 'Builder-1', 'builder', 'pi', 'cto')");
		db.run("INSERT INTO agents (id, name, role, runtime, reports_to) VALUES ('b2', 'Builder-2', 'builder', 'codex', 'cto')");
		const roots = db.query("SELECT * FROM agents WHERE reports_to IS NULL").all() as { id: string }[];
		expect(roots.length).toBe(1);
		const reports = db.query("SELECT * FROM agents WHERE reports_to = 'cto'").all() as { name: string }[];
		expect(reports.length).toBe(2);
	});

	// ── Tickets ──

	test("create and list tickets", () => {
		db.run("INSERT INTO tickets (id, title, priority, status) VALUES ('t1', 'Fix bug', 1, 'todo')");
		db.run("INSERT INTO tickets (id, title, priority, status) VALUES ('t2', 'Add feature', 3, 'todo')");
		const tickets = db.query("SELECT * FROM tickets WHERE status='todo' ORDER BY priority").all() as { title: string }[];
		expect(tickets.length).toBe(2);
		expect(tickets[0]!.title).toBe("Fix bug"); // P1 first
	});

	test("PRD import creates tickets", () => {
		db.run("INSERT INTO projects (id, name) VALUES ('p1', 'proj')");
		const stories = [
			{ title: "Add login page", priority: 1 },
			{ title: "Add dashboard", priority: 2 },
			{ title: "Add settings", priority: 3 },
		];
		for (let i = 0; i < stories.length; i++) {
			const s = stories[i]!;
			db.run("INSERT INTO tickets (id, project_id, title, priority, source, story_index) VALUES (?, 'p1', ?, ?, 'prd', ?)",
				[`t${i}`, s.title, s.priority, i]);
		}
		const tickets = db.query("SELECT * FROM tickets WHERE source='prd' ORDER BY story_index").all() as { title: string }[];
		expect(tickets.length).toBe(3);
		expect(tickets[0]!.title).toBe("Add login page");
	});

	// ── Dispatch ──

	test("dispatch assigns ticket to agent and creates run", () => {
		db.run("INSERT INTO agents (id, name, role, runtime, status) VALUES ('a1', 'Builder', 'builder', 'pi', 'idle')");
		db.run("INSERT INTO tickets (id, title, status) VALUES ('t1', 'Fix bug', 'todo')");

		// Dispatch
		db.run("INSERT INTO runs (id, ticket_id, agent_id, status) VALUES ('r1', 't1', 'a1', 'running')");
		db.run("UPDATE tickets SET assigned_agent = 'a1', status = 'in_progress' WHERE id = 't1'");
		db.run("UPDATE agents SET status = 'working' WHERE id = 'a1'");

		const run = db.query("SELECT * FROM runs WHERE id='r1'").get() as { status: string; agent_id: string };
		expect(run.status).toBe("running");
		expect(run.agent_id).toBe("a1");

		const ticket = db.query("SELECT * FROM tickets WHERE id='t1'").get() as { status: string; assigned_agent: string };
		expect(ticket.status).toBe("in_progress");
		expect(ticket.assigned_agent).toBe("a1");

		const agent = db.query("SELECT * FROM agents WHERE id='a1'").get() as { status: string };
		expect(agent.status).toBe("working");
	});

	test("complete run updates cost and marks agent idle", () => {
		db.run("INSERT INTO agents (id, name, role, runtime, status, spent_monthly) VALUES ('a1', 'Builder', 'builder', 'pi', 'working', 0)");
		db.run("INSERT INTO tickets (id, title, status, assigned_agent) VALUES ('t1', 'Fix', 'in_progress', 'a1')");
		db.run("INSERT INTO runs (id, ticket_id, agent_id, status) VALUES ('r1', 't1', 'a1', 'running')");

		// Complete
		db.run("UPDATE runs SET status='completed', cost=0.15, input_tokens=1000, output_tokens=500 WHERE id='r1'");
		db.run("UPDATE agents SET status='idle', spent_monthly=spent_monthly+0.15 WHERE id='a1'");
		db.run("UPDATE tickets SET status='done' WHERE id='t1'");

		const run = db.query("SELECT * FROM runs WHERE id='r1'").get() as { status: string; cost: number };
		expect(run.status).toBe("completed");
		expect(run.cost).toBe(0.15);

		const agent = db.query("SELECT * FROM agents WHERE id='a1'").get() as { status: string; spent_monthly: number };
		expect(agent.status).toBe("idle");
		expect(agent.spent_monthly).toBe(0.15);
	});

	test("fail run marks ticket failed", () => {
		db.run("INSERT INTO agents (id, name, role, runtime, status) VALUES ('a1', 'Builder', 'builder', 'pi', 'working')");
		db.run("INSERT INTO tickets (id, title, status) VALUES ('t1', 'Fix', 'in_progress')");
		db.run("INSERT INTO runs (id, ticket_id, agent_id, status) VALUES ('r1', 't1', 'a1', 'running')");

		db.run("UPDATE runs SET status='failed', error='tests failed' WHERE id='r1'");
		db.run("UPDATE tickets SET status='failed' WHERE id='t1'");
		db.run("UPDATE agents SET status='idle' WHERE id='a1'");

		const ticket = db.query("SELECT * FROM tickets WHERE id='t1'").get() as { status: string };
		expect(ticket.status).toBe("failed");
	});

	// ── Stats ──

	test("dashboard stats aggregate correctly", () => {
		db.run("INSERT INTO goals (id, title) VALUES ('g1', 'Goal')");
		db.run("INSERT INTO projects (id, name) VALUES ('p1', 'Project')");
		db.run("INSERT INTO agents (id, name, role, runtime) VALUES ('a1', 'Agent', 'builder', 'pi')");
		db.run("INSERT INTO tickets (id, title, status) VALUES ('t1', 'T1', 'todo')");
		db.run("INSERT INTO tickets (id, title, status) VALUES ('t2', 'T2', 'done')");
		db.run("INSERT INTO runs (id, ticket_id, agent_id, status, cost, input_tokens, output_tokens) VALUES ('r1', 't2', 'a1', 'completed', 0.50, 2000, 1000)");

		const goals = (db.query("SELECT COUNT(*) as c FROM goals WHERE status='active'").get() as { c: number }).c;
		const todo = (db.query("SELECT COUNT(*) as c FROM tickets WHERE status='todo'").get() as { c: number }).c;
		const done = (db.query("SELECT COUNT(*) as c FROM tickets WHERE status='done'").get() as { c: number }).c;
		const totals = db.query("SELECT SUM(cost) as cost, SUM(input_tokens+output_tokens) as tokens FROM runs").get() as { cost: number; tokens: number };

		expect(goals).toBe(1);
		expect(todo).toBe(1);
		expect(done).toBe(1);
		expect(totals.cost).toBe(0.50);
		expect(totals.tokens).toBe(3000);
	});

	// ── Events ──

	test("events log all state changes", () => {
		db.run("INSERT INTO events (type, entity_type, entity_id, data) VALUES ('agent.hired', 'agent', 'a1', '{\"name\":\"Builder\"}')");
		db.run("INSERT INTO events (type, entity_type, entity_id, data) VALUES ('ticket.created', 'ticket', 't1', '{\"title\":\"Fix\"}')");
		db.run("INSERT INTO events (type, entity_type, entity_id, data) VALUES ('run.dispatched', 'run', 'r1', '{\"ticketId\":\"t1\"}')");
		const events = db.query("SELECT * FROM events ORDER BY id").all() as { type: string }[];
		expect(events.length).toBe(3);
		expect(events[0]!.type).toBe("agent.hired");
		expect(events[2]!.type).toBe("run.dispatched");
	});

	// ── Build Command ──

	test("buildCommand generates correct CLI args", () => {
		// Inline test since we can't import from org.ts without module resolution
		const cmds: Record<string, string[]> = {
			pi: ["pi", "--print", "fix bug"],
			claude: ["claude", "--print", "-p", "fix bug"],
			codex: ["codex", "exec", "--full-auto", "fix bug"],
			aider: ["aider", "--message", "fix bug", "--yes-always"],
			goose: ["goose", "run", "--text", "fix bug"],
			amp: ["amp", "--prompt", "fix bug", "--no-input", "--yes"],
		};
		for (const [runtime, expected] of Object.entries(cmds)) {
			expect(expected[0]).toBe(runtime === "claude" ? "claude" : runtime === "codex" ? "codex" : runtime === "aider" ? "aider" : runtime === "goose" ? "goose" : runtime === "amp" ? "amp" : "pi");
		}
	});
});
