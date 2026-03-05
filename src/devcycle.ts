/**
 * DevCycle — the compound product loop.
 *
 * Goal → Plan → Build → Test → Deploy → Measure → Iterate
 *
 * Each cycle is a full pass through the loop.
 * The corp runs cycles autonomously — you set the goal,
 * the CTO plans, builders build, reviewers review, scout measures.
 *
 * Inspired by Compound (DevCycle), Ralph's iterate-until-done,
 * and Symphony's reconciliation loop.
 */

import type { Database } from "bun:sqlite";
import { genId, emit } from "./db.ts";

export type CyclePhase = "plan" | "build" | "test" | "review" | "deploy" | "measure" | "iterate" | "done";

export interface Cycle {
	id: string;
	goal_id: string;
	project_id: string;
	phase: CyclePhase;
	iteration: number;
	max_iterations: number;
	progress_log: string;
	started_at: string;
	completed_at: string | null;
}

export function createCycle(db: Database, goalId: string, projectId: string, maxIterations = 10): Cycle {
	const id = genId();
	db.run(
		`INSERT INTO cycles (id, goal_id, project_id, phase, iteration, max_iterations, progress_log)
		 VALUES (?, ?, ?, 'plan', 1, ?, '')`,
		[id, goalId, projectId, maxIterations],
	);
	emit(db, "cycle.created", "cycle", id, { goalId, projectId });
	return db.query("SELECT * FROM cycles WHERE id = ?").get(id) as Cycle;
}

export function getCycle(db: Database, id: string): Cycle | null {
	return db.query("SELECT * FROM cycles WHERE id = ?").get(id) as Cycle | null;
}

export function listCycles(db: Database): Cycle[] {
	return db.query("SELECT * FROM cycles WHERE completed_at IS NULL ORDER BY started_at DESC").all() as Cycle[];
}

export function advancePhase(db: Database, cycleId: string): CyclePhase {
	const cycle = getCycle(db, cycleId);
	if (!cycle) throw new Error(`Cycle ${cycleId} not found`);

	const phases: CyclePhase[] = ["plan", "build", "test", "review", "deploy", "measure", "iterate"];
	const idx = phases.indexOf(cycle.phase);

	if (cycle.phase === "iterate") {
		// Loop back to build (skip plan — plan was iteration 1)
		if (cycle.iteration >= cycle.max_iterations) {
			db.run("UPDATE cycles SET phase = 'done', completed_at = datetime('now') WHERE id = ?", [cycleId]);
			emit(db, "cycle.completed", "cycle", cycleId, { iterations: cycle.iteration });
			return "done";
		}
		db.run("UPDATE cycles SET phase = 'build', iteration = iteration + 1 WHERE id = ?", [cycleId]);
		emit(db, "cycle.iterate", "cycle", cycleId, { iteration: cycle.iteration + 1 });
		return "build";
	}

	const next = phases[idx + 1] ?? "done";
	db.run("UPDATE cycles SET phase = ? WHERE id = ?", [next, cycleId]);
	emit(db, "cycle.advance", "cycle", cycleId, { from: cycle.phase, to: next });
	return next as CyclePhase;
}

export function appendProgress(db: Database, cycleId: string, entry: string): void {
	const timestamp = new Date().toISOString().slice(0, 19);
	db.run(
		"UPDATE cycles SET progress_log = progress_log || ? WHERE id = ?",
		[`[${timestamp}] ${entry}\n`, cycleId],
	);
}

/**
 * Generate the dispatch plan for a cycle phase.
 * Returns which roles should work and what they should do.
 */
export function getPhaseWork(phase: CyclePhase): { role: string; task: string }[] {
	switch (phase) {
		case "plan":
			return [
				{ role: "cto", task: "Break down the goal into concrete tickets with acceptance criteria. Create a PRD." },
				{ role: "scout", task: "Research existing solutions, libraries, and prior art for the goal." },
			];
		case "build":
			return [
				{ role: "builder", task: "Implement the highest-priority ticket. Write code, run tests locally." },
				{ role: "lead", task: "Coordinate builders. Review PRs as they come in." },
			];
		case "test":
			return [
				{ role: "builder", task: "Run the full test suite. Fix any failing tests." },
				{ role: "reviewer", task: "Review all changes for bugs, security issues, and code quality." },
			];
		case "review":
			return [
				{ role: "reviewer", task: "Final review. Check for security, performance, and correctness." },
				{ role: "cto", task: "Architecture review. Ensure changes align with the goal." },
			];
		case "deploy":
			return [
				{ role: "lead", task: "Merge PRs. Deploy to staging. Run smoke tests." },
			];
		case "measure":
			return [
				{ role: "scout", task: "Measure results. Check metrics, user feedback, error rates." },
				{ role: "marketer", task: "Check conversion metrics. Update landing page if needed." },
			];
		case "iterate":
			return [
				{ role: "cto", task: "Review progress. Decide whether to iterate or ship. Update priorities." },
			];
		default:
			return [];
	}
}
