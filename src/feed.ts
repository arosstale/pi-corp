/**
 * Activity Feed — chronological view of everything that happened.
 */

import type { Database } from "./db.ts";

export interface FeedEvent {
	id: number;
	type: string;
	entity_type: string | null;
	entity_id: string | null;
	data: Record<string, unknown> | null;
	created_at: string;
}

/**
 * Get recent events, optionally filtered by type.
 */
export function getFeed(db: Database, limit = 20, type?: string): FeedEvent[] {
	let rows: unknown[];
	if (type) {
		rows = db.query(
			"SELECT * FROM events WHERE type LIKE ? ORDER BY id DESC LIMIT ?"
		).all(`${type}%`, limit);
	} else {
		rows = db.query(
			"SELECT * FROM events ORDER BY id DESC LIMIT ?"
		).all(limit);
	}
	return (rows as { id: number; type: string; entity_type: string | null; entity_id: string | null; data: string | null; created_at: string }[])
		.map((r) => ({
			...r,
			data: r.data ? JSON.parse(r.data) : null,
		}));
}

/**
 * Format a feed event for display.
 */
export function formatEvent(e: FeedEvent): string {
	const time = e.created_at.slice(11, 19);
	const icons: Record<string, string> = {
		"agent.hired": "🤝",
		"agent.fired": "🔴",
		"ticket.created": "🎫",
		"ticket.assigned": "📌",
		"ticket.completed": "✅",
		"ticket.failed": "❌",
		"ticket.retried": "🔄",
		"run.dispatched": "⚡",
		"run.completed": "✅",
		"run.failed": "❌",
		"goal.created": "🎯",
		"project.created": "📁",
		"pipeline.created": "🚀",
		"pipeline.completed": "🏁",
		"cycle.created": "🔄",
		"cycle.advance": "➡️",
		"cycle.completed": "🏁",
		"heartbeat.tick": "💓",
		"app.registered": "📱",
		"prd.imported": "📋",
		"skillkit.updated": "🧠",
	};
	const icon = icons[e.type] ?? "📌";
	const detail = e.data ? Object.values(e.data).slice(0, 2).join(", ") : "";
	return `  ${time} ${icon} ${e.type}${detail ? ` — ${detail}` : ""}`;
}
