#!/usr/bin/env bun
/**
 * Live demo — bootstraps WaelCorp and generates dashboard.
 * Run: bun run-demo.ts
 */
import { getDb, closeDb } from "./src/db.ts";
import { bootstrapAgency } from "./src/agency.ts";
import { createIntake, generateBrief, generateProposal, intakeToTickets } from "./src/intake.ts";
import { addProspect, getProspectStats, generatePersonalizedLine } from "./src/prospects.ts";
import { createSequence, personalizeEmail, SEQUENCES } from "./src/cold-email.ts";
import { generateSeoPages, INDUSTRY_KEYWORDS, CITY_KEYWORDS, COMPETITOR_KEYWORDS } from "./src/seo-pages.ts";
import { addClient, getRevenueMetrics } from "./src/billing.ts";
import { generateWeeklyReport } from "./src/reporting.ts";
import { writeDashboard } from "./src/html-dashboard.ts";
import { createExperiment, startExperiment, completeExperiment, getPortfolioAlpha } from "./src/experiments.ts";
import { listPipelines } from "./src/marketing.ts";
import { getStats } from "./src/dispatch.ts";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const db = getDb();

console.log("🏢 Bootstrapping WaelCorp Design Agency...");
const agency = bootstrapAgency(db, "design", "WaelCorp");
console.log(`   ✅ ${agency.agentCount} agents, ${agency.ticketCount} tickets, ${agency.projectIds.length} projects, ${agency.pipelineCount} pipelines`);

// Add some billing clients
console.log("\n💰 Adding clients...");
addClient(db, { clientName: "Dr. Smith Dental", plan: "growth" });
addClient(db, { clientName: "Portland Yoga Studio", plan: "starter" });
addClient(db, { clientName: "TechFlow SaaS", plan: "scale" });
addClient(db, { clientName: "Luna Restaurant", plan: "starter" });
addClient(db, { clientName: "Peak Fitness", plan: "growth" });
const metrics = getRevenueMetrics(db);
console.log(`   ✅ MRR: $${metrics.mrr.toLocaleString()} | ${metrics.activeClients} clients`);

// Client intake
console.log("\n📋 Creating client intake...");
const intake = createIntake(db, {
	clientName: "Green Valley Farms",
	goals: "Modern website to sell organic produce online. Need online ordering, delivery scheduling, and a blog about sustainable farming.",
	budgetTier: "growth",
	pagesNeeded: ["Homepage", "Shop", "About", "Blog", "Delivery Info"],
	competitors: ["farmfresh.com", "localharvest.org"],
	businessType: "Organic Farm / E-commerce",
	currentWebsite: "http://greenvalleyfarms.com",
});
console.log(`   ✅ Intake: ${intake.id.slice(0, 8)} — ${intake.client_name}`);
const brief = generateBrief(intake);
console.log(`   📄 Brief generated (${brief.length} chars)`);
const proposal = generateProposal(intake);
console.log(`   📄 Proposal generated (${proposal.length} chars)`);

// Add prospects
console.log("\n🎯 Adding prospects...");
const prospects = [
	{ companyName: "Rusty Plumbing Co", url: "https://rustyplumbing.com", lighthouseScore: 22, industry: "Plumbing" },
	{ companyName: "Downtown Dental", url: "https://downtowndental.com", lighthouseScore: 31, industry: "Dental" },
	{ companyName: "Artisan Coffee Roasters", url: "https://artisancoffee.com", lighthouseScore: 45, industry: "Food & Beverage" },
	{ companyName: "Summit Accounting", url: "https://summitaccounting.com", lighthouseScore: 28, industry: "Financial Services" },
	{ companyName: "Bloom Hair Studio", url: "https://bloomhair.com", lighthouseScore: 19, industry: "Beauty" },
	{ companyName: "Metro Law Group", url: "https://metrolawgroup.com", lighthouseScore: 37, industry: "Legal" },
	{ companyName: "FitZone Gym", url: "https://fitzonegym.com", lighthouseScore: 41, industry: "Fitness" },
	{ companyName: "CloudSync IT", url: "https://cloudsyncit.com", lighthouseScore: 55, industry: "SaaS" },
];
for (const p of prospects) {
	const prospect = addProspect(db, { ...p, personalizedLine: generatePersonalizedLine({ company_name: p.companyName, lighthouse_score: p.lighthouseScore } as any) });
	console.log(`   🎯 ${prospect.company_name} — score: ${prospect.lighthouse_score}/100`);
}
const pStats = getProspectStats(db);
console.log(`   Pipeline: ${pStats.total} prospects`);

// Cold email
console.log("\n📧 Creating email sequences...");
createSequence(db, "lighthouse-score");
createSequence(db, "case-study", "case-study");
console.log("   ✅ 2 sequences (7 emails total)");

// SEO pages
console.log("\n📄 Generating SEO pages...");
const industryPages = generateSeoPages(db, INDUSTRY_KEYWORDS.slice(0, 10), "industry", "WaelCorp");
const cityPages = generateSeoPages(db, CITY_KEYWORDS.slice(0, 10), "city", "WaelCorp");
const compPages = generateSeoPages(db, COMPETITOR_KEYWORDS.slice(0, 5), "comparison", "WaelCorp");
console.log(`   ✅ ${industryPages.length} industry + ${cityPages.length} city + ${compPages.length} comparison = ${industryPages.length + cityPages.length + compPages.length} pages`);

// Experiments
console.log("\n🧪 Running growth experiments...");
const exp1 = createExperiment(db, { type: "headline" as any, hypothesis: "Urgency-based headline converts 20% better", variantA: "We build websites", variantB: "Your next customer is 3 seconds away", metric: "ctr", projectId: agency.projectIds[0] });
startExperiment(db, exp1.id, 50);
completeExperiment(db, exp1.id, 2.1, 2.6, 0.95, "Urgency headline won by 24%");

const exp2 = createExperiment(db, { type: "cta" as any, hypothesis: "Specific CTA converts 15% better", variantA: "Get Started", variantB: "Book Free Audit", metric: "conversion_rate" });
startExperiment(db, exp2.id, 50);
completeExperiment(db, exp2.id, 3.2, 3.8, 0.92, "Specific CTA won");

const exp3 = createExperiment(db, { type: "email-subject" as any, hypothesis: "Personalized subject gets 30% more opens", variantA: "Website audit for {{company}}", variantB: "Your site scores {{score}}/100", metric: "open_rate" });
startExperiment(db, exp3.id, 50);
completeExperiment(db, exp3.id, 28, 26.6, 0.6, "No significant difference");

const portfolio = getPortfolioAlpha(db);
console.log(`   ✅ ${portfolio.totalExperiments} experiments: ${portfolio.winners} winners, ${portfolio.losers} losers`);
console.log(`   📈 Compounded lift: ${(portfolio.compoundedLift * 100).toFixed(1)}%`);

// Generate dashboard
console.log("\n📊 Generating dashboard...");
const dashDir = join(homedir(), ".agent", "diagrams");
mkdirSync(dashDir, { recursive: true });
const dashPath = writeDashboard(db, "WaelCorp", join(dashDir, "corp-dashboard.html"));
console.log(`   ✅ Dashboard: ${dashPath}`);

// Weekly report
console.log("\n📝 Generating weekly report...");
const report = generateWeeklyReport(db, "WaelCorp");
console.log(report.content);

// Stats
const stats = getStats(db);
console.log("\n═══════════════════════════════════════");
console.log("  WaelCorp — LIVE");
console.log("═══════════════════════════════════════");
console.log(`  Agents: ${stats.agents}`);
console.log(`  Tickets: ${stats.todo + stats.inProgress + stats.done + stats.failed} (${stats.done} done)`);
console.log(`  MRR: $${metrics.mrr.toLocaleString()}`);
console.log(`  Prospects: ${pStats.total}`);
console.log(`  SEO Pages: ${industryPages.length + cityPages.length + compPages.length}`);
console.log(`  Experiments: ${portfolio.totalExperiments} (${portfolio.winners} wins)`);
console.log(`  Growth Lift: ${(portfolio.compoundedLift * 100).toFixed(1)}%`);
console.log("═══════════════════════════════════════");

closeDb();
console.log("\n✅ Done. Open dashboard: file://" + dashPath.replace(/\\/g, "/"));
