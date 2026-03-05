/**
 * Quant Growth Engine — treat marketing like trading.
 *
 * The Every.to thesis (Josh Payne / Coframe):
 *   Growth marketing = quantitative trading
 *   - Research → Hypothesis → Experiment → Measure → Iterate
 *   - Computers beat gut instinct at scale
 *   - "Alpha" = conversion outperformance vs baseline
 *
 * Each experiment is a "trade":
 *   - Hypothesis: "Changing headline X to Y will increase signups by 20%"
 *   - Bet: resources allocated (time, traffic, budget)
 *   - Outcome: measured conversion lift (alpha)
 *   - Confidence: statistical significance (p-value)
 *
 * The system generates hypotheses, runs experiments, measures results,
 * and compounds learnings — just like a quant fund compounds returns.
 */

import type { Database } from "bun:sqlite";
import { genId, emit } from "./db.ts";

export type ExperimentStatus = "hypothesis" | "running" | "completed" | "winner" | "loser" | "inconclusive";
export type ExperimentType = "headline" | "cta" | "pricing" | "layout" | "copy" | "image" | "email-subject" | "landing-page" | "seo-title" | "cold-email" | "social-post" | "free-tool";

export interface Experiment {
	id: string;
	project_id: string | null;
	type: ExperimentType;
	hypothesis: string;
	variant_a: string;
	variant_b: string;
	metric: string; // e.g., "signup_rate", "click_rate", "reply_rate"
	baseline: number | null; // variant A performance
	result: number | null; // variant B performance
	alpha: number | null; // lift: (result - baseline) / baseline
	confidence: number | null; // 0-1 (p-value inverted)
	traffic: number; // visitors/impressions allocated
	status: ExperimentStatus;
	learnings: string | null;
	created_at: string;
	completed_at: string | null;
}

/**
 * Ensure experiments table exists.
 */
export function ensureExperimentsTable(db: Database): void {
	db.run(`
		CREATE TABLE IF NOT EXISTS experiments (
			id TEXT PRIMARY KEY,
			project_id TEXT REFERENCES projects(id),
			type TEXT NOT NULL,
			hypothesis TEXT NOT NULL,
			variant_a TEXT NOT NULL,
			variant_b TEXT NOT NULL,
			metric TEXT NOT NULL DEFAULT 'conversion_rate',
			baseline REAL,
			result REAL,
			alpha REAL,
			confidence REAL,
			traffic INTEGER DEFAULT 0,
			status TEXT DEFAULT 'hypothesis',
			learnings TEXT,
			created_at TEXT DEFAULT (datetime('now')),
			completed_at TEXT
		)
	`);
}

/**
 * Create a new experiment hypothesis.
 */
export function createExperiment(db: Database, opts: {
	projectId?: string;
	type: ExperimentType;
	hypothesis: string;
	variantA: string;
	variantB: string;
	metric?: string;
}): Experiment {
	ensureExperimentsTable(db);
	const id = genId();
	db.run(
		`INSERT INTO experiments (id, project_id, type, hypothesis, variant_a, variant_b, metric)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[id, opts.projectId ?? null, opts.type, opts.hypothesis, opts.variantA, opts.variantB, opts.metric ?? "conversion_rate"],
	);
	emit(db, "experiment.created", "experiment", id, { type: opts.type, hypothesis: opts.hypothesis.slice(0, 80) });
	return getExperiment(db, id)!;
}

/**
 * Start running an experiment (allocate traffic).
 */
export function startExperiment(db: Database, id: string, traffic: number): void {
	db.run(
		"UPDATE experiments SET status = 'running', traffic = ? WHERE id = ?",
		[traffic, id],
	);
	emit(db, "experiment.started", "experiment", id, { traffic });
}

/**
 * Record experiment results.
 */
export function completeExperiment(db: Database, id: string, baseline: number, result: number, confidence: number, learnings?: string): Experiment {
	const alpha = baseline > 0 ? (result - baseline) / baseline : 0;
	const status: ExperimentStatus = confidence >= 0.95
		? (alpha > 0 ? "winner" : "loser")
		: "inconclusive";

	db.run(
		`UPDATE experiments SET baseline = ?, result = ?, alpha = ?, confidence = ?, status = ?,
		 learnings = ?, completed_at = datetime('now') WHERE id = ?`,
		[baseline, result, alpha, confidence, status, learnings ?? null, id],
	);
	emit(db, "experiment.completed", "experiment", id, { alpha: alpha.toFixed(3), status, confidence });
	return getExperiment(db, id)!;
}

export function getExperiment(db: Database, id: string): Experiment | null {
	ensureExperimentsTable(db);
	return db.query("SELECT * FROM experiments WHERE id = ?").get(id) as Experiment | null;
}

export function listExperiments(db: Database, status?: ExperimentStatus): Experiment[] {
	ensureExperimentsTable(db);
	if (status) {
		return db.query("SELECT * FROM experiments WHERE status = ? ORDER BY created_at DESC").all(status) as Experiment[];
	}
	return db.query("SELECT * FROM experiments ORDER BY created_at DESC").all() as Experiment[];
}

/**
 * Generate experiment hypotheses for a project.
 * Returns prompts that an AI agent can execute.
 */
export function generateHypotheses(db: Database, projectId: string): { type: ExperimentType; hypothesis: string; variantA: string; variantB: string; metric: string }[] {
	// These are the most impactful experiment types, ranked by typical lift
	return [
		{
			type: "headline",
			hypothesis: "A benefit-driven headline will convert better than a feature-driven headline",
			variantA: "Current headline (feature-focused)",
			variantB: "Benefit-focused headline emphasizing outcome",
			metric: "signup_rate",
		},
		{
			type: "cta",
			hypothesis: "A specific CTA ('Get your free audit') will outperform a generic CTA ('Get started')",
			variantA: "Generic CTA: 'Get Started'",
			variantB: "Specific CTA: 'Get Your Free Audit'",
			metric: "click_rate",
		},
		{
			type: "pricing",
			hypothesis: "Anchoring with the highest tier first will increase average deal size",
			variantA: "Pricing low→high: $500, $2k, $5k",
			variantB: "Pricing high→low: $5k, $2k, $500",
			metric: "avg_deal_value",
		},
		{
			type: "cold-email",
			hypothesis: "Personalized subject lines with their Lighthouse score will get 2x open rate",
			variantA: "Generic: 'Quick question about your website'",
			variantB: "Personalized: 'Your site scores 34/100 — here\\'s why'",
			metric: "open_rate",
		},
		{
			type: "landing-page",
			hypothesis: "Social proof above the fold will increase trust and conversions",
			variantA: "No social proof above fold",
			variantB: "3 client logos + '50+ sites launched' above fold",
			metric: "signup_rate",
		},
		{
			type: "seo-title",
			hypothesis: "Including the year in SEO titles will increase CTR from search",
			variantA: "'Best Landing Page Design Services'",
			variantB: "'Best Landing Page Design Services (2026)'",
			metric: "organic_ctr",
		},
		{
			type: "email-subject",
			hypothesis: "Question-based subject lines get more opens than statement-based",
			variantA: "Statement: 'Your website redesign strategy'",
			variantB: "Question: 'Is your website costing you customers?'",
			metric: "open_rate",
		},
		{
			type: "free-tool",
			hypothesis: "Showing a preview of results before email gate increases submissions",
			variantA: "Email gate before any results shown",
			variantB: "Show 3 metrics free, gate full report behind email",
			metric: "email_capture_rate",
		},
	];
}

/**
 * Get the portfolio's overall alpha — cumulative learning from all experiments.
 */
export function getPortfolioAlpha(db: Database): {
	totalExperiments: number;
	winners: number;
	losers: number;
	inconclusive: number;
	avgAlpha: number;
	bestExperiment: Experiment | null;
	compoundedLift: number;
} {
	ensureExperimentsTable(db);
	const all = listExperiments(db);
	const completed = all.filter((e) => ["winner", "loser", "inconclusive"].includes(e.status));
	const winners = completed.filter((e) => e.status === "winner");
	const losers = completed.filter((e) => e.status === "loser");
	const inconclusive = completed.filter((e) => e.status === "inconclusive");

	const avgAlpha = winners.length > 0
		? winners.reduce((sum, e) => sum + (e.alpha ?? 0), 0) / winners.length
		: 0;

	// Compounded lift: if you had 3 winners each +10%, total = 1.1^3 - 1 = 33.1%
	const compoundedLift = winners.reduce((lift, e) => lift * (1 + (e.alpha ?? 0)), 1) - 1;

	const bestExperiment = winners.sort((a, b) => (b.alpha ?? 0) - (a.alpha ?? 0))[0] ?? null;

	return {
		totalExperiments: all.length,
		winners: winners.length,
		losers: losers.length,
		inconclusive: inconclusive.length,
		avgAlpha,
		bestExperiment,
		compoundedLift,
	};
}
