/**
 * Client Intake — form → brief → proposal → build.
 *
 * Flow:
 *   1. Client fills intake form (or Wael enters data from call)
 *   2. AI generates creative brief from intake data
 *   3. AI generates branded proposal PDF content
 *   4. Wael sends proposal, client approves
 *   5. Auto-create tickets from brief → build starts
 *
 * This replaces the back-and-forth of "what do you want?"
 * with a structured intake that feeds directly into execution.
 */

import type { Database } from "bun:sqlite";
import { genId, emit } from "./db.ts";
import { createTicket } from "./tickets.ts";

export interface ClientIntake {
	id: string;
	client_name: string;
	client_email: string;
	business_type: string;
	current_website: string | null;
	goals: string;
	competitors: string[];
	brand_direction: string;
	pages_needed: string[];
	budget_tier: "starter" | "growth" | "scale";
	timeline: string;
	notes: string | null;
	status: "intake" | "brief" | "proposal" | "approved" | "building" | "delivered";
	brief: string | null;
	proposal: string | null;
	created_at: string;
}

export function ensureIntakeTable(db: Database): void {
	db.run(`
		CREATE TABLE IF NOT EXISTS client_intakes (
			id TEXT PRIMARY KEY,
			client_name TEXT NOT NULL,
			client_email TEXT,
			business_type TEXT,
			current_website TEXT,
			goals TEXT,
			competitors TEXT DEFAULT '[]',
			brand_direction TEXT,
			pages_needed TEXT DEFAULT '[]',
			budget_tier TEXT DEFAULT 'starter',
			timeline TEXT,
			notes TEXT,
			status TEXT DEFAULT 'intake',
			brief TEXT,
			proposal TEXT,
			project_id TEXT,
			created_at TEXT DEFAULT (datetime('now'))
		)
	`);
}

export function createIntake(db: Database, data: {
	clientName: string;
	clientEmail?: string;
	businessType?: string;
	currentWebsite?: string;
	goals: string;
	competitors?: string[];
	brandDirection?: string;
	pagesNeeded?: string[];
	budgetTier?: "starter" | "growth" | "scale";
	timeline?: string;
	notes?: string;
}): ClientIntake {
	ensureIntakeTable(db);
	const id = genId();
	db.run(
		`INSERT INTO client_intakes (id, client_name, client_email, business_type, current_website, goals, competitors, brand_direction, pages_needed, budget_tier, timeline, notes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[id, data.clientName, data.clientEmail ?? null, data.businessType ?? null, data.currentWebsite ?? null, data.goals,
		 JSON.stringify(data.competitors ?? []), data.brandDirection ?? null, JSON.stringify(data.pagesNeeded ?? []),
		 data.budgetTier ?? "starter", data.timeline ?? null, data.notes ?? null],
	);
	emit(db, "intake.created", "intake", id, { client: data.clientName });
	return getIntake(db, id)!;
}

export function getIntake(db: Database, id: string): ClientIntake | null {
	ensureIntakeTable(db);
	const row = db.query("SELECT * FROM client_intakes WHERE id = ?").get(id) as any;
	if (!row) return null;
	return { ...row, competitors: JSON.parse(row.competitors ?? "[]"), pages_needed: JSON.parse(row.pages_needed ?? "[]") };
}

export function listIntakes(db: Database, status?: string): ClientIntake[] {
	ensureIntakeTable(db);
	const rows = status
		? db.query("SELECT * FROM client_intakes WHERE status = ? ORDER BY created_at DESC").all(status)
		: db.query("SELECT * FROM client_intakes ORDER BY created_at DESC").all();
	return (rows as any[]).map((r) => ({ ...r, competitors: JSON.parse(r.competitors ?? "[]"), pages_needed: JSON.parse(r.pages_needed ?? "[]") }));
}

/**
 * Generate a creative brief from intake data.
 */
export function generateBrief(intake: ClientIntake): string {
	const pricing = { starter: "$500/mo — 1 page, 2 revisions, 5-day", growth: "$2,000/mo — 3 pages + brand, 3 revisions, 3-day", scale: "$5,000/mo — unlimited + design system, priority" };
	return `# Creative Brief — ${intake.client_name}

## Client
- **Business**: ${intake.business_type ?? "Not specified"}
- **Current site**: ${intake.current_website ?? "None"}
- **Budget tier**: ${pricing[intake.budget_tier]}
- **Timeline**: ${intake.timeline ?? "Standard"}

## Goals
${intake.goals}

## Brand Direction
${intake.brand_direction ?? "To be determined during kickoff"}

## Competitors
${intake.competitors.length > 0 ? intake.competitors.map((c) => `- ${c}`).join("\n") : "- None identified"}

## Pages Needed
${intake.pages_needed.length > 0 ? intake.pages_needed.map((p) => `- ${p}`).join("\n") : "- Homepage\n- About\n- Contact"}

## Notes
${intake.notes ?? "None"}

## Deliverables
Based on ${intake.budget_tier} tier:
${intake.budget_tier === "starter" ? "- 1 designed + built page\n- 2 revision rounds\n- 5 business day delivery" : ""}${intake.budget_tier === "growth" ? "- 3 designed + built pages\n- Brand kit (colors, fonts, logo usage)\n- 3 revision rounds\n- 3 business day delivery" : ""}${intake.budget_tier === "scale" ? "- Unlimited pages\n- Full design system\n- Priority delivery\n- Dedicated designer" : ""}
`;
}

/**
 * Generate proposal content from intake + brief.
 */
export function generateProposal(intake: ClientIntake): string {
	const prices = { starter: 500, growth: 2000, scale: 5000 };
	const price = prices[intake.budget_tier];
	return `# Proposal for ${intake.client_name}

## Project Overview
${intake.goals}

## What We'll Deliver
${intake.pages_needed.length > 0 ? intake.pages_needed.map((p) => `✅ ${p}`).join("\n") : "✅ Complete website redesign"}

## Investment
**${intake.budget_tier.charAt(0).toUpperCase() + intake.budget_tier.slice(1)} Plan — $${price}/month**

## Timeline
${intake.timeline ?? "Delivery within 5 business days of approval"}

## Process
1. You approve this proposal
2. We start design within 24 hours
3. First preview delivered in ${intake.budget_tier === "scale" ? "48 hours" : "3-5 days"}
4. You review and request revisions
5. We finalize and launch

## Next Steps
Reply "approved" to get started, or schedule a call to discuss.
`;
}

/**
 * Convert approved intake into project tickets.
 */
export function intakeToTickets(db: Database, intakeId: string, projectId: string): number {
	const intake = getIntake(db, intakeId);
	if (!intake) return 0;

	let count = 0;
	// Design tickets
	for (const page of intake.pages_needed) {
		createTicket(db, `Design + build: ${page} for ${intake.client_name}`, {
			projectId,
			priority: 1,
			description: `Client: ${intake.client_name}\nBrand direction: ${intake.brand_direction ?? "TBD"}\nGoals: ${intake.goals}`,
		});
		count++;
	}

	// Always add these
	createTicket(db, `Set up hosting + domain for ${intake.client_name}`, { projectId, priority: 1 });
	createTicket(db, `QA review all pages for ${intake.client_name}`, { projectId, priority: 2 });
	createTicket(db, `Launch + handoff for ${intake.client_name}`, { projectId, priority: 2 });
	count += 3;

	db.run("UPDATE client_intakes SET status = 'building', project_id = ? WHERE id = ?", [projectId, intakeId]);
	emit(db, "intake.approved", "intake", intakeId, { tickets: count, client: intake.client_name });
	return count;
}
