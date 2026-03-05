/**
 * Agency Templates — pre-built company configurations.
 *
 * Instead of autopilot's generic company, these are specific business types
 * with tailored orgs, pipelines, and ticket backlogs.
 */

import type { Database } from "bun:sqlite";
import { createGoal, createProject } from "./goals.ts";
import { hireAgent, type Role, type Runtime } from "./org.ts";
import { createTicket } from "./tickets.ts";
import { createCycle } from "./devcycle.ts";
import { registerApp } from "./apps.ts";
import { createPipeline, type PipelineType } from "./marketing.ts";

export type AgencyType = "design" | "seo" | "dev" | "marketing";

interface AgentSpec {
	name: string;
	role: Role;
	runtime: Runtime;
	budget: number;
	projectId?: string; // set after projects created
	level: "ceo" | "management" | "worker";
}

interface AgencyConfig {
	goal: string;
	description: string;
	projects: { name: string; description: string }[];
	agents: AgentSpec[];
	tickets: { project: number; title: string; priority: number; description?: string }[];
	pipelines: { type: PipelineType; project: number }[];
	apps: { name: string; type: string; project: number }[];
}

const DESIGN_AGENCY: AgencyConfig = {
	goal: "Build a fully autonomous design agency — client acquisition via SEO + cold outreach, delivery via AI agents",
	description: "Clients find us via SEO/cold email. We design landing pages, brands, pitch decks, UI/UX. All AI-powered. Humans approve, agents execute.",
	projects: [
		{ name: "agency-site", description: "Our own website — portfolio, pricing, lead capture" },
		{ name: "client-work", description: "Client deliverables — designs, landing pages, brands" },
		{ name: "seo-engine", description: "Content + programmatic SEO for inbound leads" },
	],
	agents: [
		{ name: "Wael", role: "ceo", runtime: "claude-desktop", budget: 50, level: "ceo" },
		{ name: "Creative-Director", role: "cto", runtime: "claude", budget: 100, level: "management" },
		{ name: "Project-Manager", role: "lead", runtime: "pi", budget: 50, level: "management" },
		{ name: "Designer-1", role: "designer", runtime: "claude", budget: 75, level: "worker" },
		{ name: "Designer-2", role: "designer", runtime: "claude", budget: 75, level: "worker" },
		{ name: "Frontend-Dev", role: "builder", runtime: "pi", budget: 75, level: "worker" },
		{ name: "SEO-Builder", role: "builder", runtime: "codex", budget: 75, level: "worker" },
		{ name: "Content-Writer", role: "marketer", runtime: "claude-desktop", budget: 75, level: "worker" },
		{ name: "Scout", role: "scout", runtime: "gemini", budget: 25, level: "worker" },
		{ name: "QA", role: "reviewer", runtime: "claude", budget: 50, level: "worker" },
	],
	tickets: [
		// Agency site
		{ project: 0, title: "Design agency portfolio site with 3 case studies", priority: 1, description: "Clean, modern design agency site. Show best work. Include before/after. Conversion-optimized." },
		{ project: 0, title: "Build pricing page with 3 tiers", priority: 1, description: "Starter ($500/mo), Growth ($2k/mo), Scale ($5k/mo). Each tier: deliverables, turnaround, revisions." },
		{ project: 0, title: "Set up Calendly/Cal.com booking for discovery calls", priority: 1 },
		{ project: 0, title: "Build lead magnet: 'Free Landing Page Audit' tool", priority: 1, description: "Automated page audit: Lighthouse score, CTA analysis, mobile check, copy review. Email gate." },
		{ project: 0, title: "Create 10 landing page templates for portfolio", priority: 2 },
		// SEO engine
		{ project: 2, title: "Research 100 keywords: 'landing page design [industry]'", priority: 1, description: "Target: 'landing page design for SaaS', 'landing page design for restaurants', etc. Long-tail, buyer intent." },
		{ project: 2, title: "Build programmatic SEO: /landing-page-design/[industry] pages", priority: 1, description: "100 pages, each targeting '[industry] landing page design'. Unique intro, 3 examples, CTA to book call." },
		{ project: 2, title: "Write 20 blog posts: 'How to design a [type] that converts'", priority: 2, description: "Types: SaaS landing page, restaurant website, portfolio site, ecommerce page, etc. 1500 words each, internal links." },
		{ project: 2, title: "Build backlink outreach: guest posts on design blogs", priority: 2 },
		{ project: 2, title: "Create comparison pages: 'WaelCorp vs [competitor]'", priority: 2 },
		// Client work system
		{ project: 1, title: "Build client intake form + automated brief generator", priority: 1, description: "Client fills form → AI generates creative brief → PM reviews → Designer starts. Automate the handoff." },
		{ project: 1, title: "Create design system: components, colors, typography presets", priority: 1 },
		{ project: 1, title: "Build client dashboard: project status, files, feedback", priority: 2 },
		{ project: 1, title: "Set up automated revision workflow", priority: 2, description: "Client comments on Figma/preview → Designer gets ticket → Max 3 revisions per tier → Auto-close." },
		// Cold outreach
		{ project: 0, title: "Build prospect list: 500 SaaS founders without good landing pages", priority: 1, description: "Scrape ProductHunt launches, check their sites with Lighthouse. Bad scores = prospects." },
		{ project: 0, title: "Write cold email sequence: 'Your landing page is losing you customers'", priority: 1, description: "4-email sequence. Email 1: specific problem on THEIR site. Email 2: case study. Email 3: free audit offer. Email 4: breakup." },
		{ project: 0, title: "Set up cold DM campaign on Twitter/LinkedIn", priority: 2 },
	],
	pipelines: [
		{ type: "waelcorp", project: 0 },
		{ type: "content", project: 2 },
		{ type: "growth", project: 0 },
	],
	apps: [
		{ name: "GitHub", type: "github", project: 0 },
		{ name: "Vercel", type: "deploy", project: 0 },
		{ name: "Resend", type: "email", project: 0 },
		{ name: "Stripe", type: "payments", project: 0 },
		{ name: "Analytics", type: "analytics", project: 0 },
		{ name: "Cal.com", type: "calendar", project: 0 },
	],
};

const AGENCY_CONFIGS: Record<AgencyType, AgencyConfig> = {
	design: DESIGN_AGENCY,
	seo: {
		...DESIGN_AGENCY,
		goal: "Build a fully autonomous SEO growth hacking agency — rank clients on page 1, charge for results",
		description: "Performance-based SEO. We rank you or you don't pay. All automated: audits, content, links, tracking.",
		projects: [
			{ name: "agency-site", description: "Our site — case studies, ROI calculator, lead capture" },
			{ name: "client-seo", description: "Client SEO campaigns — audits, content, links" },
			{ name: "tools", description: "Internal SEO tools — audit bot, rank tracker, content generator" },
		],
		tickets: [
			{ project: 0, title: "Build SEO agency site with ROI calculator", priority: 1 },
			{ project: 0, title: "Create 5 case studies: 'How we ranked [client] #1 for [keyword]'", priority: 1 },
			{ project: 0, title: "Build free SEO audit tool (email-gated)", priority: 1, description: "Automated: Lighthouse, Core Web Vitals, keyword density, backlink count, competitor comparison. PDF report." },
			{ project: 2, title: "Build automated site audit pipeline", priority: 1, description: "Input: URL → Output: full SEO report. Technical SEO, content gaps, backlink profile, speed scores." },
			{ project: 2, title: "Build content generation pipeline", priority: 1, description: "Input: keyword list → Output: 10 SEO articles/week. Each: 1500+ words, proper H-tags, schema, internal links." },
			{ project: 2, title: "Build rank tracker dashboard", priority: 1, description: "Track keyword positions daily. Alert on drops. Show trajectory charts. Per-client view." },
			{ project: 2, title: "Build automated link building outreach", priority: 2, description: "Find broken links → craft replacement pitch → send via Resend → track responses → report." },
			{ project: 1, title: "Client onboarding: auto-audit + keyword research + strategy doc", priority: 1 },
			{ project: 1, title: "Monthly reporting: automated SEO performance PDF", priority: 2 },
			{ project: 0, title: "Programmatic SEO: /seo-services/[city] pages × 200 cities", priority: 1 },
			{ project: 0, title: "Cold email: 'Your site ranks #47 for [their keyword]' sequence", priority: 1 },
			{ project: 0, title: "Build referral program: $500 per referred client", priority: 2 },
		],
	},
	dev: DESIGN_AGENCY, // placeholder
	marketing: DESIGN_AGENCY, // placeholder
};

/**
 * Bootstrap a full agency from a template.
 */
export function bootstrapAgency(db: Database, type: AgencyType, companyName = "WaelCorp"): {
	goalId: string;
	projectIds: string[];
	agentCount: number;
	ticketCount: number;
	pipelineCount: number;
} {
	const config = AGENCY_CONFIGS[type];
	if (!config) throw new Error(`Unknown agency type: ${type}. Options: ${Object.keys(AGENCY_CONFIGS).join(", ")}`);

	// Goal
	const goal = createGoal(db, config.goal, config.description);

	// Projects
	const projects = config.projects.map((p) => createProject(db, `${companyName.toLowerCase()}-${p.name}`, goal.id));

	// Agents — build hierarchy
	const agentMap = new Map<string, string>();
	let ceoId: string | undefined;
	let managementIds: string[] = [];

	for (const spec of config.agents) {
		const reportsTo = spec.level === "ceo" ? undefined :
			spec.level === "management" ? ceoId :
			managementIds[0]; // workers report to first manager

		const agent = hireAgent(db, spec.name, spec.role, spec.runtime, {
			budget: spec.budget,
			reportsTo,
			projectId: spec.projectId !== undefined ? projects[spec.projectId as unknown as number]?.id : undefined,
		});

		agentMap.set(spec.name, agent.id);
		if (spec.level === "ceo") ceoId = agent.id;
		if (spec.level === "management") managementIds.push(agent.id);
	}

	// Tickets
	for (const t of config.tickets) {
		createTicket(db, t.title, {
			projectId: projects[t.project]?.id,
			priority: t.priority,
			description: t.description,
		});
	}

	// DevCycles
	for (const p of projects) {
		createCycle(db, goal.id, p.id);
	}

	// Apps
	for (const app of config.apps) {
		registerApp(db, app.name, app.type, { projectId: projects[app.project]?.id });
	}

	// Marketing pipelines
	for (const p of config.pipelines) {
		createPipeline(db, p.type, projects[p.project]?.id ?? projects[0]!.id);
	}

	return {
		goalId: goal.id,
		projectIds: projects.map((p) => p.id),
		agentCount: config.agents.length,
		ticketCount: config.tickets.length,
		pipelineCount: config.pipelines.length,
	};
}
