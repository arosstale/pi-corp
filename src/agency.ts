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
	goal: "Autonomous web design agency — Wael handles sales calls, client relationships & backlinks. AI handles EVERYTHING else.",
	description: "Wael is the face. He does calls, closes deals, builds backlink relationships, and manages clients. AI agents handle: site builds, design, content, SEO pages, cold email drafts, proposals, client dashboards, audits, and reporting. Wael should never touch Figma, code, or write copy.",
	projects: [
		{ name: "agency-site", description: "Our website — portfolio, pricing, lead capture, SEO pages" },
		{ name: "client-delivery", description: "Client builds — websites, landing pages, brands, design systems" },
		{ name: "seo-machine", description: "Programmatic SEO, content, backlink prep (Wael sends the emails)" },
		{ name: "sales-pipeline", description: "Prospect research, proposals, cold email drafts (Wael sends & closes)" },
	],
	agents: [
		// Wael is CEO but his actual job is: calls, relationships, backlinks
		{ name: "Wael", role: "ceo", runtime: "claude-desktop", budget: 0, level: "ceo" },
		// AI does everything else
		{ name: "Creative-Director", role: "cto", runtime: "claude", budget: 100, level: "management" },
		{ name: "Project-Manager", role: "lead", runtime: "pi", budget: 50, level: "management" },
		{ name: "Site-Builder", role: "builder", runtime: "pi", budget: 75, level: "worker" },
		{ name: "SEO-Builder", role: "builder", runtime: "codex", budget: 75, level: "worker" },
		{ name: "Designer", role: "designer", runtime: "claude", budget: 75, level: "worker" },
		{ name: "Copywriter", role: "marketer", runtime: "claude-desktop", budget: 75, level: "worker" },
		{ name: "Prospect-Scout", role: "scout", runtime: "gemini", budget: 25, level: "worker" },
		{ name: "QA-Reviewer", role: "reviewer", runtime: "claude", budget: 50, level: "worker" },
	],
	tickets: [
		// ── AGENCY SITE (Wael never touches this) ──
		{ project: 0, title: "Build agency portfolio site — 5 case studies, before/after", priority: 1, description: "Modern, fast, conversion-optimized. Hero with social proof. 3 pricing tiers. Testimonials. CTA to book call with Wael." },
		{ project: 0, title: "Pricing page: Starter $500, Growth $2k, Scale $5k", priority: 1, description: "Clear deliverables per tier. FAQ section. Annual discount. Trust badges." },
		{ project: 0, title: "Build 'Free Website Audit' tool (email-gated lead magnet)", priority: 1, description: "Input: URL → Run Lighthouse + mobile check + CTA analysis + load time → PDF report. Captures email for Wael's follow-up." },
		{ project: 0, title: "Set up Cal.com booking page for Wael's discovery calls", priority: 1 },

		// ── SEO MACHINE (AI writes, Wael just builds backlinks manually) ──
		{ project: 2, title: "Keyword research: 100 long-tail 'web design [city/industry]' keywords", priority: 1, description: "Targets: 'web design for dentists', 'landing page design NYC', etc. Vol>50, KD<30, buyer intent." },
		{ project: 2, title: "Generate 100 programmatic SEO pages: /web-design/[keyword]", priority: 1, description: "Each page: unique 800-word intro, 3 portfolio examples, pricing CTA, local/industry-specific content. Schema markup." },
		{ project: 2, title: "Write 30 blog posts targeting informational keywords", priority: 2, description: "'How much does a website cost in 2026', 'Best landing page examples', 'Website redesign checklist', etc. 1500 words, internal links to service pages." },
		{ project: 2, title: "Create 10 comparison pages: 'WaelCorp vs [competitor]'", priority: 2 },
		{ project: 2, title: "Prepare backlink outreach templates for Wael", priority: 2, description: "20 outreach email templates Wael can personalize. Guest post pitches, broken link replacements, resource page additions. Wael sends them — he has the relationships." },

		// ── CLIENT DELIVERY (fully automated except Wael's kick-off call) ──
		{ project: 1, title: "Build client onboarding: intake form → auto-generate creative brief", priority: 1, description: "After Wael closes: client fills form (brand, competitors, goals, examples) → AI generates brief + sitemap + wireframe → Wael approves → build starts." },
		{ project: 1, title: "Create design system: 5 themes × color palettes × typography", priority: 1, description: "Reusable component library. Client picks a theme direction, AI customizes. Speed up delivery to 24-48h." },
		{ project: 1, title: "Build client dashboard: project progress, preview links, feedback", priority: 2, description: "Client sees: timeline, preview URL, revision count remaining, files. No back-and-forth emails." },
		{ project: 1, title: "Automated revision workflow: client comments → ticket → rebuild", priority: 2, description: "Client leaves feedback on preview → auto-creates revision ticket → designer agent rebuilds → max 3 rounds per tier." },
		{ project: 1, title: "Auto-generate proposal + SOW from discovery call notes", priority: 1, description: "Wael takes call notes → AI generates branded proposal PDF with scope, timeline, price, terms. Wael just sends it." },

		// ── SALES PIPELINE (AI preps, Wael sends & closes) ──
		{ project: 3, title: "Build prospect scraper: find sites with bad Lighthouse scores", priority: 1, description: "Scan ProductHunt launches, Y Combinator companies, local businesses. Flag sites scoring <50 on Lighthouse. Output: company, URL, score, email, LinkedIn." },
		{ project: 3, title: "Write cold email sequences Wael can send", priority: 1, description: "3 sequences: (1) 'Your site scores 34/100' — 4 emails with their actual score. (2) 'We redesigned [similar company]' — case study angle. (3) 'Free audit for [industry]' — lead magnet angle. Wael personalizes first line and sends." },
		{ project: 3, title: "Generate weekly prospect list: 50 new leads for Wael", priority: 2, description: "Every week: scout agent finds 50 new companies with bad websites. Generates personalized first lines. Wael just copy-pastes into his outreach tool." },
		{ project: 3, title: "Build proposal template that auto-fills from call notes", priority: 2 },
	],
	pipelines: [
		{ type: "waelcorp", project: 0 },
		{ type: "content", project: 2 },
		{ type: "growth", project: 0 },
		{ type: "evergreen", project: 2 },
	],
	apps: [
		{ name: "GitHub", type: "github", project: 0 },
		{ name: "Vercel", type: "deploy", project: 0 },
		{ name: "Resend", type: "email", project: 3 },
		{ name: "Stripe", type: "payments", project: 1 },
		{ name: "Analytics", type: "analytics", project: 0 },
		{ name: "Cal.com", type: "calendar", project: 3 },
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
