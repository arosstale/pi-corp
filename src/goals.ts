/**
 * Goals & Projects — Paperclip's top layer.
 * Every ticket traces back to a company goal.
 */

import type { Database } from "./db.ts";
import { genId, emit } from "./db.ts";

export interface Goal {
	id: string;
	title: string;
	description: string | null;
	status: string;
	created_at: string;
}

export interface Project {
	id: string;
	goal_id: string | null;
	name: string;
	repo: string | null;
	branch: string;
	status: string;
}

export function createGoal(db: Database, title: string, description?: string): Goal {
	const id = genId();
	db.run("INSERT INTO goals (id, title, description) VALUES (?, ?, ?)", [id, title, description ?? null]);
	emit(db, "goal.created", "goal", id, { title });
	return db.query("SELECT * FROM goals WHERE id = ?").get(id) as Goal;
}

export function listGoals(db: Database): Goal[] {
	return db.query("SELECT * FROM goals WHERE status = 'active' ORDER BY created_at").all() as Goal[];
}

export function createProject(db: Database, name: string, goalId?: string, repo?: string): Project {
	const id = genId();
	db.run("INSERT INTO projects (id, goal_id, name, repo) VALUES (?, ?, ?, ?)", [id, goalId ?? null, name, repo ?? null]);
	emit(db, "project.created", "project", id, { name, goalId });
	return db.query("SELECT * FROM projects WHERE id = ?").get(id) as Project;
}

export function listProjects(db: Database): Project[] {
	return db.query("SELECT * FROM projects WHERE status = 'active' ORDER BY created_at").all() as Project[];
}

export function getProject(db: Database, id: string): Project | null {
	return db.query("SELECT * FROM projects WHERE id = ?").get(id) as Project | null;
}
