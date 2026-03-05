/**
 * Programmatic SEO Page Generator — keyword list → pages.
 *
 * Generate 100+ pages targeting long-tail keywords:
 *   /web-design/[industry] — "web design for dentists"
 *   /web-design/[city] — "web design NYC"
 *   /vs/[competitor] — "WaelCorp vs Wix"
 *
 * Each page: unique 800-word intro, 3 portfolio examples, pricing CTA,
 * schema markup, meta description, internal links.
 */

import type { Database } from "bun:sqlite";
import { genId, emit } from "./db.ts";

export interface SeoPage {
	id: string;
	slug: string;
	keyword: string;
	page_type: "industry" | "city" | "comparison" | "how-to" | "guide";
	title: string;
	meta_description: string;
	h1: string;
	word_count: number;
	status: "draft" | "published" | "scheduled";
	content_prompt: string;
	project_id: string | null;
	created_at: string;
}

export function ensureSeoTable(db: Database): void {
	db.run(`
		CREATE TABLE IF NOT EXISTS seo_pages (
			id TEXT PRIMARY KEY,
			slug TEXT NOT NULL UNIQUE,
			keyword TEXT NOT NULL,
			page_type TEXT NOT NULL,
			title TEXT NOT NULL,
			meta_description TEXT,
			h1 TEXT,
			word_count INTEGER DEFAULT 0,
			status TEXT DEFAULT 'draft',
			content_prompt TEXT,
			project_id TEXT,
			created_at TEXT DEFAULT (datetime('now'))
		)
	`);
}

/**
 * Generate SEO pages from a keyword list.
 */
export function generateSeoPages(db: Database, keywords: string[], pageType: SeoPage["page_type"], companyName = "WaelCorp", projectId?: string): SeoPage[] {
	ensureSeoTable(db);
	const pages: SeoPage[] = [];

	for (const keyword of keywords) {
		const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
		const existing = db.query("SELECT id FROM seo_pages WHERE slug = ?").get(slug);
		if (existing) continue;

		const id = genId();
		let title: string;
		let h1: string;
		let meta: string;
		let prompt: string;

		switch (pageType) {
			case "industry":
				title = `${keyword} | Professional Web Design — ${companyName}`;
				h1 = `${keyword}`;
				meta = `Looking for ${keyword.toLowerCase()}? ${companyName} builds high-converting websites for your industry. See our portfolio and book a free audit.`;
				prompt = `Write an 800-word SEO page targeting "${keyword}". Include: why this industry needs a great website, 3 common website mistakes in this industry, what a high-converting site looks like, and a CTA to book a free audit. Tone: professional, data-backed, not salesy.`;
				break;
			case "city":
				title = `Web Design ${keyword} | Local Web Agency — ${companyName}`;
				h1 = `Web Design in ${keyword}`;
				meta = `${companyName} provides professional web design in ${keyword}. Fast delivery, conversion-focused designs. Book a free consultation.`;
				prompt = `Write an 800-word local SEO page targeting "web design ${keyword}". Include: why local businesses in ${keyword} need a great website, local market insights, what we offer, 3 portfolio examples, and a CTA to book a call. Mention the city naturally throughout.`;
				break;
			case "comparison":
				title = `${companyName} vs ${keyword} — Honest Comparison (2026)`;
				h1 = `${companyName} vs ${keyword}`;
				meta = `Comparing ${companyName} and ${keyword}? See pricing, features, turnaround time, and real client results side by side.`;
				prompt = `Write a 1000-word comparison page: "${companyName} vs ${keyword}". Include: pricing comparison table, feature comparison, turnaround time, pros/cons of each, and a recommendation. Be fair but highlight ${companyName}'s strengths. Add a CTA for a free audit.`;
				break;
			case "how-to":
				title = `${keyword} — Complete Guide (2026) | ${companyName}`;
				h1 = keyword;
				meta = `Learn ${keyword.toLowerCase()}. Step-by-step guide with examples. From the experts at ${companyName}.`;
				prompt = `Write a 1500-word guide on "${keyword}". Include: step-by-step instructions, examples, common mistakes, and a CTA to hire ${companyName} to do it for you. Make it genuinely useful — this should rank on Google.`;
				break;
			default:
				title = `${keyword} | ${companyName}`;
				h1 = keyword;
				meta = `Everything you need to know about ${keyword.toLowerCase()}. Expert insights from ${companyName}.`;
				prompt = `Write an 800-word authoritative guide on "${keyword}". Include actionable advice and a CTA to ${companyName}'s services.`;
		}

		db.run(
			`INSERT INTO seo_pages (id, slug, keyword, page_type, title, meta_description, h1, content_prompt, project_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[id, slug, keyword, pageType, title, meta, h1, prompt, projectId ?? null],
		);
		pages.push({ id, slug, keyword, page_type: pageType, title, meta_description: meta, h1, word_count: 0, status: "draft", content_prompt: prompt, project_id: projectId ?? null, created_at: new Date().toISOString() });
	}

	if (pages.length > 0) emit(db, "seo.generated", "seo", pages[0]!.id, { count: pages.length, type: pageType });
	return pages;
}

export function listSeoPages(db: Database, status?: string): SeoPage[] {
	ensureSeoTable(db);
	if (status) return db.query("SELECT * FROM seo_pages WHERE status = ? ORDER BY created_at DESC").all(status) as SeoPage[];
	return db.query("SELECT * FROM seo_pages ORDER BY created_at DESC").all() as SeoPage[];
}

export function getSeoStats(db: Database): { total: number; draft: number; published: number; scheduled: number } {
	ensureSeoTable(db);
	const all = listSeoPages(db);
	return {
		total: all.length,
		draft: all.filter((p) => p.status === "draft").length,
		published: all.filter((p) => p.status === "published").length,
		scheduled: all.filter((p) => p.status === "scheduled").length,
	};
}

/**
 * Industry keywords to generate pages for.
 */
export const INDUSTRY_KEYWORDS = [
	"Web Design for Dentists", "Web Design for Restaurants", "Web Design for Law Firms",
	"Web Design for Real Estate", "Web Design for SaaS Companies", "Web Design for Startups",
	"Web Design for E-commerce", "Web Design for Photographers", "Web Design for Coaches",
	"Web Design for Gyms", "Web Design for Accountants", "Web Design for Architects",
	"Web Design for Plumbers", "Web Design for Salons", "Web Design for Clinics",
	"Web Design for Financial Advisors", "Web Design for Nonprofits", "Web Design for Hotels",
	"Web Design for Construction", "Web Design for Car Dealerships",
];

export const CITY_KEYWORDS = [
	"New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "San Francisco",
	"Seattle", "Denver", "Austin", "Miami", "Atlanta", "Boston", "Dallas",
	"Portland", "San Diego", "Nashville", "Minneapolis", "Detroit", "Tampa", "Charlotte",
];

export const COMPETITOR_KEYWORDS = [
	"Wix", "Squarespace", "Webflow", "WordPress", "Shopify",
	"GoDaddy Website Builder", "Fiverr Web Design", "99designs",
	"DesignCrowd", "Dribbble Freelancers",
];
