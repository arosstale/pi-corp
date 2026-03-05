/**
 * Autopilot — the highest abstraction layer.
 *
 * You say ONE THING. Autopilot figures out the rest.
 *
 * "Build a SaaS that helps freelancers track invoices"
 *    → CEO decomposes into strategy
 *    → CTO creates technical plan
 *    → Builders write code
 *    → Designer builds landing page
 *    → Marketer writes copy, sets up SEO, creates email sequences
 *    → Scout monitors competitors and metrics
 *    → All loops compound: DevCycle + Marketing + Growth
 *
 * The abstraction ladder:
 *
 *   L5: AUTOPILOT      "Build X"             ← YOU ARE HERE
 *   L4: COMPANY         Goals + Org + Budget
 *   L3: LOOPS           DevCycle + Marketing + Growth + Evergreen
 *   L2: DISPATCH        Tickets → Agents → Runs
 *   L1: EXECUTION       pi, claude, codex, gemini, aider
 *   L0: TOOLS           git, gh, gmcli, vercel, ffmpeg
 *
 * Autopilot drives L4-L0 autonomously. You only touch L5.
 *
 * The heartbeat model (from Paperclip):
 * - Every 15 minutes, the CTO checks: are all builders working? Any blocked?
 * - Every hour, the CEO checks: are we on track? Any strategic pivots needed?
 * - Every day, the Marketer checks: what content performed? What to repurpose?
 * - Every week, full cycle review: metrics → iterate → plan next sprint
 */

import type { Database } from "bun:sqlite";
import { genId, emit } from "./db.ts";

export type HeartbeatInterval = "5m" | "15m" | "1h" | "4h" | "1d" | "1w";

export interface Heartbeat {
	agent_id: string;
	interval: HeartbeatInterval;
	last_beat: string | null;
	next_beat: string;
	task: string;     // What the agent does on each heartbeat
	enabled: boolean;
}

/**
 * Default heartbeat schedules per role.
 */
export const DEFAULT_HEARTBEATS: Record<string, { interval: HeartbeatInterval; task: string }> = {
	ceo: {
		interval: "4h",
		task: "Review company progress. Check if strategy is working. Reprioritize if metrics are off. Report to the board (you).",
	},
	cto: {
		interval: "1h",
		task: "Check all active runs. Unblock stuck agents. Review completed work. Create new tickets from backlog. Ensure code quality.",
	},
	lead: {
		interval: "15m",
		task: "Coordinate builders. Check if any runs failed and retry. Review PRs. Merge passing work. Advance the DevCycle.",
	},
	builder: {
		interval: "5m",
		task: "Pick highest priority assigned ticket. Write code. Run tests. Commit if passing. Report completion.",
	},
	scout: {
		interval: "4h",
		task: "Research competitors. Monitor industry news. Check for new tools and libraries. Report findings to CTO.",
	},
	reviewer: {
		interval: "15m",
		task: "Review any pending PRs or completed runs. Check for security issues, bugs, and code quality. Approve or request changes.",
	},
	designer: {
		interval: "1h",
		task: "Check for design tickets. Build landing pages, update UI, create assets. Review designer tickets.",
	},
	marketer: {
		interval: "1d",
		task: "Check analytics. Advance marketing pipeline. Write content. Schedule social. Send emails. Update SEO pages.",
	},
};

/**
 * The autopilot prompt — what transforms a one-liner into a full company.
 *
 * This is injected into the CEO agent on first boot.
 */
export function buildAutopilotPrompt(mission: string, companyName = "WaelCorp"): string {
	return `You are the CEO of ${companyName}, an autonomous company. Your mission:

"${mission}"

You have the following tools available:
- corp_dashboard: See the full company status
- corp_advance_cycle: Move the DevCycle forward
- corp_dispatch: Send work to idle agents
- corp_create_ticket: Create new work items
- corp_start_marketing: Launch marketing pipelines
- corp_marketing_next: Get the next marketing task
- corp_marketing_complete_task: Complete a marketing task

Your team:
- CTO: Technical strategy, architecture decisions, code review
- Lead: Coordinates builders, merges PRs, runs DevCycle
- Builders: Write code, run tests, fix bugs
- Scout: Research, competitive analysis, metrics
- Reviewer: Code review, security audit, quality gates
- Designer: Landing pages, UI, visual assets
- Marketer: Content, SEO, email, social, launch, growth

Your process:
1. Break the mission into a company goal with measurable outcomes
2. Create the first set of tickets (3-5 high-priority tasks to start)
3. Start the launch marketing pipeline
4. Dispatch builders on coding tickets
5. Monitor progress every heartbeat cycle
6. When the DevCycle reaches "measure" — check metrics and iterate
7. When marketing pipeline completes — start the growth pipeline
8. Repeat until the mission succeeds or budget is exhausted

Rules:
- Every ticket must trace back to the goal
- Never exceed budget — check agent spend before dispatching
- Always run tests before merging
- Review all code before it ships
- Measure everything — if you can't measure it, you can't improve it
- Ship fast, iterate faster

Start now. Break down the mission and create your first batch of tickets.`;
}

/**
 * Generate the initial tickets from a mission statement.
 * Returns structured work items the CEO would create.
 */
export function generateInitialPlan(mission: string): { title: string; role: string; priority: number; description: string }[] {
	// Default initial plan structure — the CEO agent will refine this
	return [
		// Dev tickets
		{ title: "Set up project repository and CI/CD", role: "builder", priority: 1, description: "Create repo, configure GitHub Actions, set up test framework" },
		{ title: "Define data model and API schema", role: "cto", priority: 1, description: "Design the core data structures and API endpoints" },
		{ title: "Build MVP core feature", role: "builder", priority: 1, description: `Implement the core functionality: ${mission.slice(0, 100)}` },
		{ title: "Write test suite for core feature", role: "builder", priority: 2, description: "Unit tests, integration tests, E2E tests for the MVP" },
		// Design tickets
		{ title: "Design and build landing page", role: "designer", priority: 2, description: "Create a conversion-optimized landing page with clear value prop" },
		// Marketing tickets
		{ title: "Create product marketing context", role: "marketer", priority: 1, description: "Define positioning, audience, competitors, and messaging" },
		{ title: "Write launch blog post", role: "marketer", priority: 3, description: "Announce the product with a compelling narrative" },
		// Research tickets
		{ title: "Research competitive landscape", role: "scout", priority: 2, description: "Identify top 5 competitors, their strengths/weaknesses, pricing" },
	];
}

/**
 * Convert heartbeat interval to milliseconds.
 */
export function intervalToMs(interval: HeartbeatInterval): number {
	switch (interval) {
		case "5m": return 5 * 60 * 1000;
		case "15m": return 15 * 60 * 1000;
		case "1h": return 60 * 60 * 1000;
		case "4h": return 4 * 60 * 60 * 1000;
		case "1d": return 24 * 60 * 60 * 1000;
		case "1w": return 7 * 24 * 60 * 60 * 1000;
	}
}
