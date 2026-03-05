/**
 * Prospect Scraping — find businesses with bad websites.
 *
 * Flow:
 *   1. Scout agent finds URLs (ProductHunt, YC, local business directories)
 *   2. Run Lighthouse audit on each (via CLI or Pagespeed API)
 *   3. Score < 50 = prospect
 *   4. Extract contact info (email, LinkedIn)
 *   5. Generate personalized first line for cold email
 *   6. Feed into cold email sequences
 */

import type { Database } from "bun:sqlite";
import { genId, emit } from "./db.ts";

export interface Prospect {
	id: string;
	company_name: string;
	url: string;
	email: string | null;
	linkedin: string | null;
	lighthouse_score: number | null;
	industry: string | null;
	source: string;
	personalized_line: string | null;
	status: "new" | "contacted" | "replied" | "call_booked" | "closed" | "dead";
	project_id: string | null;
	contacted_at: string | null;
	created_at: string;
}

export function ensureProspectsTable(db: Database): void {
	db.run(`
		CREATE TABLE IF NOT EXISTS prospects (
			id TEXT PRIMARY KEY,
			company_name TEXT NOT NULL,
			url TEXT NOT NULL,
			email TEXT,
			linkedin TEXT,
			lighthouse_score INTEGER,
			industry TEXT,
			source TEXT DEFAULT 'manual',
			personalized_line TEXT,
			status TEXT DEFAULT 'new',
			project_id TEXT,
			contacted_at TEXT,
			created_at TEXT DEFAULT (datetime('now'))
		)
	`);
}

export function addProspect(db: Database, data: {
	companyName: string;
	url: string;
	email?: string;
	linkedin?: string;
	lighthouseScore?: number;
	industry?: string;
	source?: string;
	personalizedLine?: string;
	projectId?: string;
}): Prospect {
	ensureProspectsTable(db);
	const id = genId();
	db.run(
		`INSERT INTO prospects (id, company_name, url, email, linkedin, lighthouse_score, industry, source, personalized_line, project_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[id, data.companyName, data.url, data.email ?? null, data.linkedin ?? null,
		 data.lighthouseScore ?? null, data.industry ?? null, data.source ?? "manual",
		 data.personalizedLine ?? null, data.projectId ?? null],
	);
	emit(db, "prospect.added", "prospect", id, { company: data.companyName, score: data.lighthouseScore });
	return getProspect(db, id)!;
}

export function getProspect(db: Database, id: string): Prospect | null {
	ensureProspectsTable(db);
	return db.query("SELECT * FROM prospects WHERE id = ?").get(id) as Prospect | null;
}

export function listProspects(db: Database, status?: string): Prospect[] {
	ensureProspectsTable(db);
	if (status) return db.query("SELECT * FROM prospects WHERE status = ? ORDER BY lighthouse_score ASC").all(status) as Prospect[];
	return db.query("SELECT * FROM prospects ORDER BY created_at DESC").all() as Prospect[];
}

export function updateProspectStatus(db: Database, id: string, status: Prospect["status"]): void {
	db.run("UPDATE prospects SET status = ?, contacted_at = CASE WHEN ? = 'contacted' THEN datetime('now') ELSE contacted_at END WHERE id = ?",
		[status, status, id]);
	emit(db, "prospect.updated", "prospect", id, { status });
}

export function getProspectStats(db: Database): { total: number; new_count: number; contacted: number; replied: number; booked: number; closed: number; conversionRate: number } {
	ensureProspectsTable(db);
	const all = listProspects(db);
	const byStatus = (s: string) => all.filter((p) => p.status === s).length;
	const total = all.length;
	const closed = byStatus("closed");
	return {
		total,
		new_count: byStatus("new"),
		contacted: byStatus("contacted"),
		replied: byStatus("replied"),
		booked: byStatus("call_booked"),
		closed,
		conversionRate: total > 0 ? closed / total : 0,
	};
}

/**
 * Generate Lighthouse audit command for a URL.
 */
export function buildAuditCommand(url: string): string {
	return `npx lighthouse ${url} --output=json --quiet --chrome-flags="--headless --no-sandbox" 2>/dev/null | jq '{performance: .categories.performance.score, accessibility: .categories.accessibility.score, seo: .categories.seo.score}'`;
}

/**
 * Generate personalized first line based on Lighthouse score.
 */
export function generatePersonalizedLine(prospect: Prospect): string {
	const score = prospect.lighthouse_score ?? 50;
	if (score < 30) return `I noticed ${prospect.company_name}'s site scores ${score}/100 on Google's speed test — that's costing you customers every day.`;
	if (score < 50) return `${prospect.company_name}'s website loads slower than 80% of sites in your industry (score: ${score}/100). Quick fixes could double your conversions.`;
	return `${prospect.company_name}'s site is decent (${score}/100) but there's an easy 20-30% improvement in load time that directly impacts your conversion rate.`;
}
