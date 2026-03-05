/**
 * Marketing Engine — programmatic marketing pipelines.
 *
 * This is what turns "we have a product" into "we have users" autonomously.
 *
 * The engine defines PIPELINES that agents run through:
 *
 * 1. CONTENT PIPELINE:
 *    product-context → content-strategy → write articles → SEO audit → publish → measure
 *
 * 2. LAUNCH PIPELINE:
 *    launch-strategy → build landing page → email sequence → social content →
 *    cold outreach → Product Hunt prep → launch day → post-launch measure
 *
 * 3. GROWTH PIPELINE:
 *    analytics-tracking → identify top channels → A/B test pages →
 *    optimize conversion → referral program → scale winners
 *
 * 4. EVERGREEN PIPELINE (runs weekly):
 *    check analytics → repurpose top content → social posts → email newsletter →
 *    update SEO pages → measure
 *
 * Each pipeline is a sequence of TASKS that the marketer agent (and helpers) execute.
 * Tasks reference specific marketing skills from coreyhaines31/marketingskills.
 */

import type { Database } from "bun:sqlite";
import { genId, emit } from "./db.ts";

export type PipelineType = "content" | "launch" | "growth" | "evergreen";

export interface MarketingTask {
	id: string;
	title: string;
	skill: string;         // marketing skill to load
	prompt: string;        // what to tell the agent
	role: string;          // which agent role runs this
	outputType: string;    // what this produces
	dependsOn?: string;    // previous task ID
}

export interface Pipeline {
	id: string;
	type: PipelineType;
	project_id: string;
	status: string;
	current_task: number;
	tasks: MarketingTask[];
	outputs: Record<string, string>;  // taskId → output
	created_at: string;
}

/**
 * Pipeline templates — these define the exact sequence of marketing work.
 */
export const PIPELINE_TEMPLATES: Record<PipelineType, Omit<MarketingTask, "id">[]> = {
	content: [
		{
			title: "Define product marketing context",
			skill: "product-marketing-context",
			prompt: "Create a product marketing context document. Define target audience, positioning, value prop, competitive landscape, and voice/tone. Save as .agents/product-marketing-context.md",
			role: "marketer",
			outputType: "document",
		},
		{
			title: "Create content strategy",
			skill: "content-strategy",
			prompt: "Based on the product marketing context, create a content strategy. Identify 5 topic clusters, 20 article ideas prioritized by search volume and difficulty. Output as content-plan.md",
			role: "marketer",
			outputType: "plan",
		},
		{
			title: "Write first 3 SEO articles",
			skill: "copywriting",
			prompt: "Write the top 3 priority articles from the content plan. Each should be 1500-2500 words, SEO-optimized with proper headings, meta descriptions, and internal linking strategy.",
			role: "marketer",
			outputType: "content",
		},
		{
			title: "SEO audit the articles",
			skill: "seo-audit",
			prompt: "Audit all 3 articles for SEO: check keyword density, heading structure, meta tags, internal links, image alt text. Fix any issues.",
			role: "marketer",
			outputType: "audit",
		},
		{
			title: "Create social distribution",
			skill: "social-content",
			prompt: "For each article, create: 1 Twitter/X thread, 1 LinkedIn post, 3 short-form social clips. Schedule across 2 weeks.",
			role: "marketer",
			outputType: "social",
		},
		{
			title: "Set up analytics tracking",
			skill: "analytics-tracking",
			prompt: "Implement tracking for all content: page views, scroll depth, CTA clicks, conversion events. Create a dashboard.",
			role: "builder",
			outputType: "tracking",
		},
	],
	launch: [
		{
			title: "Define product marketing context",
			skill: "product-marketing-context",
			prompt: "Create product marketing context with positioning, audience, competitors, and unique value proposition.",
			role: "marketer",
			outputType: "document",
		},
		{
			title: "Create launch strategy",
			skill: "launch-strategy",
			prompt: "Plan the launch using the ORB framework (Owned/Rented/Borrowed). Define pre-launch, launch day, and post-launch phases. Include Product Hunt strategy if applicable.",
			role: "marketer",
			outputType: "plan",
		},
		{
			title: "Build landing page",
			skill: "copywriting",
			prompt: "Write copy for the launch landing page: hero, value props, social proof, pricing, FAQ, CTA. Follow page-cro best practices.",
			role: "marketer",
			outputType: "copy",
		},
		{
			title: "Implement landing page",
			skill: "frontend-design",
			prompt: "Implement the landing page using the copy from the previous step. Make it fast, responsive, with clear CTAs above the fold.",
			role: "designer",
			outputType: "code",
		},
		{
			title: "Create email sequences",
			skill: "email-sequence",
			prompt: "Create 3 email sequences: (1) Pre-launch waitlist nurture (5 emails), (2) Launch announcement (3 emails), (3) Post-signup onboarding (7 emails).",
			role: "marketer",
			outputType: "emails",
		},
		{
			title: "Create launch social content",
			skill: "social-content",
			prompt: "Create a 2-week social content calendar for launch: countdown posts, feature reveals, testimonials, behind-the-scenes, launch day blitz.",
			role: "marketer",
			outputType: "social",
		},
		{
			title: "Cold outreach for launch",
			skill: "cold-email",
			prompt: "Write cold email sequences targeting: (1) journalists/bloggers, (2) potential partners, (3) early adopters. 3 emails each with follow-ups.",
			role: "marketer",
			outputType: "outreach",
		},
		{
			title: "Set up analytics",
			skill: "analytics-tracking",
			prompt: "Set up funnel tracking: landing page → signup → onboarding → activation → conversion. Track all launch channels.",
			role: "builder",
			outputType: "tracking",
		},
	],
	growth: [
		{
			title: "Audit current analytics",
			skill: "analytics-tracking",
			prompt: "Audit current analytics setup. Identify top traffic sources, conversion rates by channel, drop-off points in the funnel.",
			role: "marketer",
			outputType: "audit",
		},
		{
			title: "CRO audit on key pages",
			skill: "page-cro",
			prompt: "Run conversion rate optimization audit on homepage, pricing page, and signup flow. Identify top 10 improvements.",
			role: "marketer",
			outputType: "audit",
		},
		{
			title: "Design A/B tests",
			skill: "ab-test-setup",
			prompt: "Design A/B tests for the top 3 CRO improvements. Define hypothesis, metrics, sample size, and test duration.",
			role: "marketer",
			outputType: "tests",
		},
		{
			title: "Implement A/B tests",
			skill: "frontend-design",
			prompt: "Implement the A/B test variants. Use feature flags or split testing framework.",
			role: "builder",
			outputType: "code",
		},
		{
			title: "Design referral program",
			skill: "referral-program",
			prompt: "Design a referral program: incentive structure, mechanics, tracking, and viral loop. Reference successful programs.",
			role: "marketer",
			outputType: "plan",
		},
		{
			title: "Pricing optimization",
			skill: "pricing-strategy",
			prompt: "Analyze current pricing. Research competitors. Recommend tier structure, price points, and packaging changes.",
			role: "marketer",
			outputType: "plan",
		},
	],
	evergreen: [
		{
			title: "Weekly analytics review",
			skill: "analytics-tracking",
			prompt: "Pull this week's metrics: traffic, signups, conversions, churn, revenue. Compare to last week. Identify trends.",
			role: "scout",
			outputType: "report",
		},
		{
			title: "Repurpose top content",
			skill: "social-content",
			prompt: "Take the top 3 performing content pieces this week. Repurpose each into: 1 tweet thread, 1 LinkedIn post, 1 email snippet.",
			role: "marketer",
			outputType: "social",
		},
		{
			title: "Draft weekly newsletter",
			skill: "email-sequence",
			prompt: "Write this week's newsletter: top insight, product update, curated link, CTA. Keep under 500 words.",
			role: "marketer",
			outputType: "email",
		},
		{
			title: "Update programmatic SEO pages",
			skill: "programmatic-seo",
			prompt: "Check if any programmatic pages need data refreshes. Update stale pages. Generate new pages for new keywords.",
			role: "marketer",
			outputType: "pages",
		},
	],
};

/**
 * Create a marketing pipeline from a template.
 */
export function createPipeline(db: Database, type: PipelineType, projectId: string): Pipeline {
	const id = genId();
	const template = PIPELINE_TEMPLATES[type];
	const tasks: MarketingTask[] = template.map((t, i) => ({
		id: `${id}-t${i}`,
		...t,
		dependsOn: i > 0 ? `${id}-t${i - 1}` : undefined,
	}));

	db.run(
		"INSERT INTO marketing_pipelines (id, type, project_id, status, current_task, tasks, outputs) VALUES (?, ?, ?, 'running', 0, ?, '{}')",
		[id, type, projectId, JSON.stringify(tasks)],
	);
	emit(db, "pipeline.created", "pipeline", id, { type, taskCount: tasks.length });
	return getPipeline(db, id)!;
}

export function getPipeline(db: Database, id: string): Pipeline | null {
	const row = db.query("SELECT * FROM marketing_pipelines WHERE id = ?").get(id) as {
		id: string; type: string; project_id: string; status: string; current_task: number;
		tasks: string; outputs: string; created_at: string;
	} | null;
	if (!row) return null;
	return {
		...row,
		type: row.type as PipelineType,
		tasks: JSON.parse(row.tasks),
		outputs: JSON.parse(row.outputs),
	};
}

export function listPipelines(db: Database): Pipeline[] {
	const rows = db.query("SELECT * FROM marketing_pipelines ORDER BY created_at DESC").all() as {
		id: string; type: string; project_id: string; status: string; current_task: number;
		tasks: string; outputs: string; created_at: string;
	}[];
	return rows.map((r) => ({
		...r,
		type: r.type as PipelineType,
		tasks: JSON.parse(r.tasks),
		outputs: JSON.parse(r.outputs),
	}));
}

/**
 * Advance the pipeline — complete current task, move to next.
 */
export function advancePipeline(db: Database, pipelineId: string, output?: string): MarketingTask | null {
	const pipeline = getPipeline(db, pipelineId);
	if (!pipeline) return null;

	// Save output for current task
	if (output && pipeline.current_task < pipeline.tasks.length) {
		const currentTask = pipeline.tasks[pipeline.current_task]!;
		pipeline.outputs[currentTask.id] = output;
	}

	// Move to next task
	const nextIdx = pipeline.current_task + 1;
	if (nextIdx >= pipeline.tasks.length) {
		db.run("UPDATE marketing_pipelines SET status='completed', current_task=?, outputs=? WHERE id=?",
			[nextIdx, JSON.stringify(pipeline.outputs), pipelineId]);
		emit(db, "pipeline.completed", "pipeline", pipelineId);
		return null;
	}

	db.run("UPDATE marketing_pipelines SET current_task=?, outputs=? WHERE id=?",
		[nextIdx, JSON.stringify(pipeline.outputs), pipelineId]);
	return pipeline.tasks[nextIdx]!;
}

/**
 * Get the current task to execute.
 */
export function getCurrentTask(pipeline: Pipeline): MarketingTask | null {
	if (pipeline.current_task >= pipeline.tasks.length) return null;
	return pipeline.tasks[pipeline.current_task]!;
}

/**
 * Build the full prompt for the current marketing task,
 * including context from previous task outputs.
 */
export function buildMarketingPrompt(pipeline: Pipeline, task: MarketingTask): string {
	const parts: string[] = [];

	// Inject skill
	parts.push(`Load and apply the "${task.skill}" skill.\n`);

	// Inject previous outputs as context
	if (task.dependsOn && pipeline.outputs[task.dependsOn]) {
		parts.push(`Previous step output:\n${pipeline.outputs[task.dependsOn]}\n`);
	}

	// The actual task
	parts.push(task.prompt);

	return parts.join("\n");
}
