/**
 * Apps — external integrations the corp can use.
 *
 * Each app is a connection to a real service:
 * - GitHub (issues, PRs, deploys)
 * - Gmail (outreach, notifications)
 * - Google Analytics (measurement)
 * - Vercel/Netlify (deploy)
 * - Stripe (revenue)
 * - Twitter/LinkedIn (social)
 *
 * Apps provide hooks that cycle phases can trigger.
 */

import type { Database } from "./db.ts";
import { genId, emit } from "./db.ts";

export type AppType =
	| "github"      // Issues, PRs, Actions
	| "gmail"       // Email outreach, notifications
	| "calendar"    // Scheduling
	| "analytics"   // GA4, Plausible
	| "deploy"      // Vercel, Netlify
	| "payments"    // Stripe
	| "social"      // Twitter, LinkedIn, Bluesky
	| "docs"        // Google Docs, Notion
	| "drive"       // Google Drive
	| "custom";     // Anything else

export interface App {
	id: string;
	name: string;
	type: AppType;
	config: Record<string, unknown> | null;
	project_id: string | null;
	status: string;
}

export const APP_COMMANDS: Record<AppType, string[]> = {
	github: ["gh issue list", "gh pr list", "gh pr create", "gh run list"],
	gmail: ["gmcli search", "gmcli send", "gmcli draft"],
	calendar: ["gccli list", "gccli create"],
	analytics: ["curl -s"],  // GA4 API
	deploy: ["vercel deploy", "vercel ls"],
	payments: ["stripe customers list", "stripe invoices list"],
	social: ["curl -s"],  // Social APIs
	docs: ["gdcli list", "gdcli download"],
	drive: ["gdcli list", "gdcli upload", "gdcli download"],
	custom: [],
};

export function registerApp(db: Database, name: string, type: AppType, opts?: {
	config?: Record<string, unknown>; projectId?: string;
}): App {
	const id = genId();
	db.run(
		"INSERT INTO apps (id, name, type, config, project_id) VALUES (?, ?, ?, ?, ?)",
		[id, name, type, opts?.config ? JSON.stringify(opts.config) : null, opts?.projectId ?? null],
	);
	emit(db, "app.registered", "app", id, { name, type });
	return getApp(db, id)!;
}

export function getApp(db: Database, id: string): App | null {
	const row = db.query("SELECT * FROM apps WHERE id = ?").get(id) as (Omit<App, "config"> & { config: string | null }) | null;
	if (!row) return null;
	return { ...row, config: row.config ? JSON.parse(row.config) : null };
}

export function listApps(db: Database): App[] {
	const rows = db.query("SELECT * FROM apps WHERE status = 'active' ORDER BY type, name").all() as (Omit<App, "config"> & { config: string | null })[];
	return rows.map((r) => ({ ...r, config: r.config ? JSON.parse(r.config) : null }));
}

/**
 * Get available commands for an app type.
 * These can be used by agents via bash tool.
 */
export function getAppCommands(type: AppType): string[] {
	return APP_COMMANDS[type] ?? [];
}
