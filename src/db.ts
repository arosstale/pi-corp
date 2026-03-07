/**
 * pi-corp SQLite store.
 * Single file DB: ~/.pi-corp/corp.db
 *
 * Runtime detection:
 *   - Bun: uses bun:sqlite (native, fast)
 *   - Node.js: uses better-sqlite3 (npm package)
 *
 * Both expose the same API via the Database wrapper class.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

const IS_BUN = typeof globalThis.Bun !== "undefined";

const CORP_DIR = join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".pi-corp");
const DB_PATH = join(CORP_DIR, "corp.db");

/**
 * Unified Database class — wraps either bun:sqlite or better-sqlite3.
 * API: exec(), run(), query().get(), query().all(), close()
 */
export class Database {
	private _db: any;

	constructor(path: string) {
		if (IS_BUN) {
			// bun:sqlite — import dynamically at runtime
			const BunDatabase = require("bun:sqlite").Database;
			this._db = new BunDatabase(path);
			this._db._isBun = true;
		} else {
			// better-sqlite3 — Node.js
			const BetterSqlite3 = require("better-sqlite3");
			this._db = new BetterSqlite3(path);
			this._db._isBun = false;
		}
	}

	exec(sql: string): void {
		this._db.exec(sql);
	}

	run(sql: string, params?: unknown[]): void {
		if (this._db._isBun) {
			// bun:sqlite: db.run(sql, params)
			if (params && params.length > 0) {
				this._db.run(sql, params);
			} else {
				this._db.run(sql);
			}
		} else {
			// better-sqlite3: db.prepare(sql).run(...params)
			if (params && params.length > 0) {
				this._db.prepare(sql).run(...params);
			} else {
				this._db.prepare(sql).run();
			}
		}
	}

	query(sql: string) {
		if (this._db._isBun) {
			// bun:sqlite: db.query(sql) returns a prepared statement
			const stmt = this._db.query(sql);
			return {
				get: (...params: unknown[]) => params.length > 0 ? stmt.get(...params) : stmt.get(),
				all: (...params: unknown[]) => params.length > 0 ? stmt.all(...params) : stmt.all(),
			};
		} else {
			// better-sqlite3: db.prepare(sql)
			const stmt = this._db.prepare(sql);
			return {
				get: (...params: unknown[]) => params.length > 0 ? stmt.get(...params) : stmt.get(),
				all: (...params: unknown[]) => params.length > 0 ? stmt.all(...params) : stmt.all(),
			};
		}
	}

	close(): void {
		this._db.close();
	}
}

let _db: Database | null = null;

export function getDb(): Database {
	if (_db) return _db;
	mkdirSync(CORP_DIR, { recursive: true });
	_db = new Database(DB_PATH);
	_db.exec("PRAGMA journal_mode=WAL");
	_db.exec("PRAGMA foreign_keys=ON");
	migrate(_db);
	return _db;
}

export function closeDb(): void {
	_db?.close();
	_db = null;
}

function migrate(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS goals (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			description TEXT,
			status TEXT DEFAULT 'active',
			created_at TEXT DEFAULT (datetime('now')),
			updated_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			goal_id TEXT REFERENCES goals(id),
			name TEXT NOT NULL,
			repo TEXT,
			branch TEXT DEFAULT 'main',
			status TEXT DEFAULT 'active',
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS agents (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			role TEXT NOT NULL,
			runtime TEXT NOT NULL DEFAULT 'pi',
			model TEXT,
			reports_to TEXT REFERENCES agents(id),
			budget_monthly REAL DEFAULT 0,
			spent_monthly REAL DEFAULT 0,
			status TEXT DEFAULT 'idle',
			project_id TEXT REFERENCES projects(id),
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS tickets (
			id TEXT PRIMARY KEY,
			project_id TEXT REFERENCES projects(id),
			title TEXT NOT NULL,
			description TEXT,
			priority INTEGER DEFAULT 3,
			status TEXT DEFAULT 'todo',
			assigned_agent TEXT REFERENCES agents(id),
			source TEXT DEFAULT 'manual',
			source_id TEXT,
			story_index INTEGER,
			created_at TEXT DEFAULT (datetime('now')),
			updated_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS runs (
			id TEXT PRIMARY KEY,
			ticket_id TEXT REFERENCES tickets(id),
			agent_id TEXT REFERENCES agents(id),
			workspace TEXT,
			status TEXT DEFAULT 'running',
			attempt INTEGER DEFAULT 1,
			input_tokens INTEGER DEFAULT 0,
			output_tokens INTEGER DEFAULT 0,
			cost REAL DEFAULT 0,
			started_at TEXT DEFAULT (datetime('now')),
			completed_at TEXT,
			error TEXT,
			output TEXT
		);

		CREATE TABLE IF NOT EXISTS events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL,
			entity_type TEXT,
			entity_id TEXT,
			data TEXT,
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS prd_stories (
			id TEXT PRIMARY KEY,
			project_id TEXT REFERENCES projects(id),
			title TEXT NOT NULL,
			description TEXT,
			acceptance_criteria TEXT,
			priority INTEGER DEFAULT 3,
			passes INTEGER DEFAULT 0,
			ticket_id TEXT REFERENCES tickets(id),
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS skillkits (
			role TEXT PRIMARY KEY,
			skills TEXT NOT NULL,
			updated_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS cycles (
			id TEXT PRIMARY KEY,
			goal_id TEXT REFERENCES goals(id),
			project_id TEXT REFERENCES projects(id),
			phase TEXT DEFAULT 'plan',
			iteration INTEGER DEFAULT 1,
			max_iterations INTEGER DEFAULT 10,
			progress_log TEXT DEFAULT '',
			started_at TEXT DEFAULT (datetime('now')),
			completed_at TEXT
		);

		CREATE TABLE IF NOT EXISTS apps (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			type TEXT NOT NULL,
			config TEXT,
			project_id TEXT REFERENCES projects(id),
			status TEXT DEFAULT 'active',
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS marketing_pipelines (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			project_id TEXT REFERENCES projects(id),
			status TEXT DEFAULT 'running',
			current_task INTEGER DEFAULT 0,
			tasks TEXT NOT NULL,
			outputs TEXT DEFAULT '{}',
			created_at TEXT DEFAULT (datetime('now'))
		);
	`);
}

// ── Helpers ──

export function genId(): string {
	return Math.random().toString(36).slice(2, 10);
}

export function emit(db: Database, type: string, entityType: string, entityId: string, data?: unknown): void {
	db.run(
		"INSERT INTO events (type, entity_type, entity_id, data) VALUES (?, ?, ?, ?)",
		[type, entityType, entityId, data ? JSON.stringify(data) : null],
	);
}
