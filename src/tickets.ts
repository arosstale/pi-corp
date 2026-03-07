/**
 * Tickets — Symphony's dispatch unit.
 * Can come from GitHub Issues, PRD stories, or manual creation.
 * Each ticket gets an isolated workspace and agent run.
 */

import type { Database } from "./db.ts";
import { genId, emit } from "./db.ts";

export interface Ticket {
	id: string;
	project_id: string | null;
	title: string;
	description: string | null;
	priority: number;
	status: string;
	assigned_agent: string | null;
	source: string;
	source_id: string | null;
	story_index: number | null;
	created_at: string;
	updated_at: string;
}

export type TicketStatus = "todo" | "in_progress" | "review" | "done" | "failed" | "cancelled";

export function createTicket(db: Database, title: string, opts?: {
	projectId?: string; description?: string; priority?: number;
	source?: string; sourceId?: string; storyIndex?: number;
}): Ticket {
	const id = genId();
	db.run(
		`INSERT INTO tickets (id, project_id, title, description, priority, source, source_id, story_index)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[id, opts?.projectId ?? null, title, opts?.description ?? null,
			opts?.priority ?? 3, opts?.source ?? "manual", opts?.sourceId ?? null, opts?.storyIndex ?? null],
	);
	emit(db, "ticket.created", "ticket", id, { title });
	return db.query("SELECT * FROM tickets WHERE id = ?").get(id) as Ticket;
}

export function listTickets(db: Database, status?: TicketStatus): Ticket[] {
	if (status) {
		return db.query("SELECT * FROM tickets WHERE status = ? ORDER BY priority, created_at").all(status) as Ticket[];
	}
	return db.query("SELECT * FROM tickets WHERE status NOT IN ('done','cancelled') ORDER BY priority, created_at").all() as Ticket[];
}

export function assignTicket(db: Database, ticketId: string, agentId: string): void {
	db.run("UPDATE tickets SET assigned_agent = ?, status = 'in_progress', updated_at = datetime('now') WHERE id = ?", [agentId, ticketId]);
	emit(db, "ticket.assigned", "ticket", ticketId, { agentId });
}

export function completeTicket(db: Database, ticketId: string): void {
	db.run("UPDATE tickets SET status = 'done', updated_at = datetime('now') WHERE id = ?", [ticketId]);
	emit(db, "ticket.completed", "ticket", ticketId);
}

export function failTicket(db: Database, ticketId: string, error: string): void {
	db.run("UPDATE tickets SET status = 'failed', updated_at = datetime('now') WHERE id = ?", [ticketId]);
	emit(db, "ticket.failed", "ticket", ticketId, { error });
}

export function getTicket(db: Database, id: string): Ticket | null {
	return db.query("SELECT * FROM tickets WHERE id = ?").get(id) as Ticket | null;
}

/**
 * Import PRD stories as tickets (Ralph pattern).
 * Takes a PRD JSON with user stories and creates tickets for each.
 */
export function importPrd(db: Database, projectId: string, stories: { title: string; description?: string; priority?: number }[]): Ticket[] {
	const tickets: Ticket[] = [];
	for (let i = 0; i < stories.length; i++) {
		const story = stories[i]!;
		const ticket = createTicket(db, story.title, {
			projectId, description: story.description, priority: story.priority ?? 3,
			source: "prd", storyIndex: i,
		});
		tickets.push(ticket);
	}
	emit(db, "prd.imported", "project", projectId, { count: stories.length });
	return tickets;
}
