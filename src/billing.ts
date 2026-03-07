/**
 * Billing — track client retainers and revenue.
 *
 * Not a payment processor — this tracks revenue and generates
 * Stripe-compatible data. Actual billing goes through Stripe.
 *
 * Tracks:
 *   - Monthly retainers per client
 *   - One-time project fees
 *   - MRR, ARR, churn
 *   - Revenue per client
 */

import type { Database } from "./db.ts";
import { genId, emit } from "./db.ts";

export interface ClientBilling {
	id: string;
	client_name: string;
	plan: "starter" | "growth" | "scale" | "custom";
	mrr: number;
	status: "active" | "churned" | "paused" | "trial";
	intake_id: string | null;
	project_id: string | null;
	started_at: string;
	churned_at: string | null;
	created_at: string;
}

export function ensureBillingTable(db: Database): void {
	db.run(`
		CREATE TABLE IF NOT EXISTS billing (
			id TEXT PRIMARY KEY,
			client_name TEXT NOT NULL,
			plan TEXT NOT NULL DEFAULT 'starter',
			mrr REAL NOT NULL DEFAULT 0,
			status TEXT DEFAULT 'active',
			intake_id TEXT,
			project_id TEXT,
			started_at TEXT DEFAULT (datetime('now')),
			churned_at TEXT,
			created_at TEXT DEFAULT (datetime('now'))
		)
	`);
}

const PLAN_PRICES: Record<string, number> = {
	starter: 500,
	growth: 2000,
	scale: 5000,
	custom: 0,
};

export function addClient(db: Database, data: {
	clientName: string;
	plan: ClientBilling["plan"];
	mrr?: number;
	intakeId?: string;
	projectId?: string;
}): ClientBilling {
	ensureBillingTable(db);
	const id = genId();
	const mrr = data.mrr ?? PLAN_PRICES[data.plan] ?? 0;
	db.run(
		"INSERT INTO billing (id, client_name, plan, mrr, intake_id, project_id) VALUES (?, ?, ?, ?, ?, ?)",
		[id, data.clientName, data.plan, mrr, data.intakeId ?? null, data.projectId ?? null],
	);
	emit(db, "billing.created", "billing", id, { client: data.clientName, plan: data.plan, mrr });
	return getBillingClient(db, id)!;
}

export function getBillingClient(db: Database, id: string): ClientBilling | null {
	ensureBillingTable(db);
	return db.query("SELECT * FROM billing WHERE id = ?").get(id) as ClientBilling | null;
}

export function listBillingClients(db: Database, status?: string): ClientBilling[] {
	ensureBillingTable(db);
	if (status) return db.query("SELECT * FROM billing WHERE status = ? ORDER BY mrr DESC").all(status) as ClientBilling[];
	return db.query("SELECT * FROM billing ORDER BY mrr DESC").all() as ClientBilling[];
}

export function churnClient(db: Database, id: string): void {
	db.run("UPDATE billing SET status = 'churned', churned_at = datetime('now') WHERE id = ?", [id]);
	emit(db, "billing.churned", "billing", id, {});
}

/**
 * Revenue metrics.
 */
export function getRevenueMetrics(db: Database): {
	mrr: number;
	arr: number;
	activeClients: number;
	churnedClients: number;
	avgMrr: number;
	churnRate: number;
	revenue: { starter: number; growth: number; scale: number; custom: number };
} {
	ensureBillingTable(db);
	const all = listBillingClients(db);
	const active = all.filter((c) => c.status === "active");
	const churned = all.filter((c) => c.status === "churned");
	const mrr = active.reduce((sum, c) => sum + c.mrr, 0);

	const revenue = { starter: 0, growth: 0, scale: 0, custom: 0 };
	for (const c of active) revenue[c.plan] += c.mrr;

	return {
		mrr,
		arr: mrr * 12,
		activeClients: active.length,
		churnedClients: churned.length,
		avgMrr: active.length > 0 ? mrr / active.length : 0,
		churnRate: all.length > 0 ? churned.length / all.length : 0,
		revenue,
	};
}
