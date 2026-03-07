/**
 * Client Reporting — automated progress reports.
 *
 * Generate weekly/monthly reports showing:
 *   - Tickets completed
 *   - Pages built
 *   - SEO rankings (when connected)
 *   - Marketing metrics
 *   - Next steps
 */

import type { Database } from "./db.ts";
import { genId, emit } from "./db.ts";
import { listTickets } from "./tickets.ts";
import { getSeoStats } from "./seo-pages.ts";
import { getProspectStats } from "./prospects.ts";
import { getPortfolioAlpha } from "./experiments.ts";
import { getTotalCost } from "./cost-tracker.ts";

export interface Report {
	id: string;
	type: "weekly" | "monthly" | "client";
	title: string;
	content: string;
	project_id: string | null;
	created_at: string;
}

export function ensureReportsTable(db: Database): void {
	db.run(`
		CREATE TABLE IF NOT EXISTS reports (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			title TEXT NOT NULL,
			content TEXT NOT NULL,
			project_id TEXT,
			created_at TEXT DEFAULT (datetime('now'))
		)
	`);
}

/**
 * Generate a company-wide weekly report.
 */
export function generateWeeklyReport(db: Database, companyName = "WaelCorp"): Report {
	ensureReportsTable(db);
	const tickets = listTickets(db);
	const seo = getSeoStats(db);
	const prospects = getProspectStats(db);
	const portfolio = getPortfolioAlpha(db);
	const costs = getTotalCost(50);

	const done = tickets.filter((t) => t.status === "done").length;
	const inProgress = tickets.filter((t) => t.status === "in_progress").length;
	const todo = tickets.filter((t) => t.status === "todo").length;
	const failed = tickets.filter((t) => t.status === "failed").length;

	const content = `# ${companyName} — Weekly Report
_Generated ${new Date().toISOString().slice(0, 10)}_

## Summary
- **${done}** tickets completed
- **${inProgress}** in progress
- **${todo}** in backlog
- **${failed}** failed (retried)

## SEO
- **${seo.total}** pages total (${seo.published} published, ${seo.draft} drafts)

## Sales Pipeline
- **${prospects.total}** prospects found
- **${prospects.contacted}** contacted
- **${prospects.replied}** replied
- **${prospects.booked}** calls booked
- **${prospects.closed}** closed
- Conversion rate: **${(prospects.conversionRate * 100).toFixed(1)}%**

## Growth Experiments
- **${portfolio.totalExperiments}** experiments
- **${portfolio.winners}** winners / ${portfolio.losers} losers
- Compounded lift: **${(portfolio.compoundedLift * 100).toFixed(1)}%**

## AI Spend
- Total: **$${costs.totalCost.toFixed(2)}**
- Sessions: ${costs.sessions}
- Tokens: ${(costs.totalTokens / 1_000_000).toFixed(1)}M
`;

	const id = genId();
	db.run("INSERT INTO reports (id, type, title, content) VALUES (?, ?, ?, ?)",
		[id, "weekly", `${companyName} Weekly — ${new Date().toISOString().slice(0, 10)}`, content]);
	emit(db, "report.generated", "report", id, { type: "weekly" });
	return { id, type: "weekly", title: `${companyName} Weekly`, content, project_id: null, created_at: new Date().toISOString() };
}

/**
 * Generate a client-facing report for a specific project.
 */
export function generateClientReport(db: Database, clientName: string, projectId: string): Report {
	ensureReportsTable(db);
	const tickets = listTickets(db).filter((t) => t.project_id === projectId);
	const done = tickets.filter((t) => t.status === "done");
	const inProgress = tickets.filter((t) => t.status === "in_progress");
	const todo = tickets.filter((t) => t.status === "todo");

	const content = `# Project Update — ${clientName}
_${new Date().toISOString().slice(0, 10)}_

## Progress
${done.length > 0 ? "### Completed ✅\n" + done.map((t) => `- ${t.title}`).join("\n") : ""}

${inProgress.length > 0 ? "### In Progress 🔄\n" + inProgress.map((t) => `- ${t.title}`).join("\n") : ""}

${todo.length > 0 ? "### Coming Up 📋\n" + todo.map((t) => `- ${t.title}`).join("\n") : ""}

## Timeline
- Total tasks: ${tickets.length}
- Completed: ${done.length}/${tickets.length} (${tickets.length > 0 ? Math.round(done.length / tickets.length * 100) : 0}%)

## Next Steps
${todo.slice(0, 3).map((t) => `- ${t.title}`).join("\n") || "- Project complete! 🎉"}
`;

	const id = genId();
	db.run("INSERT INTO reports (id, type, title, content, project_id) VALUES (?, ?, ?, ?, ?)",
		[id, "client", `${clientName} Update`, content, projectId]);
	emit(db, "report.generated", "report", id, { type: "client", client: clientName });
	return { id, type: "client", title: `${clientName} Update`, content, project_id: projectId, created_at: new Date().toISOString() };
}

export function listReports(db: Database): Report[] {
	ensureReportsTable(db);
	return db.query("SELECT * FROM reports ORDER BY created_at DESC").all() as Report[];
}
