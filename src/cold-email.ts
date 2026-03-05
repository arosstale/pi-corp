/**
 * Cold Email Sequences — AI writes, Wael personalizes and sends.
 *
 * Each sequence is 3-4 emails with timing:
 *   Day 0: Problem-specific email (with their Lighthouse score)
 *   Day 3: Case study email
 *   Day 7: Free audit offer
 *   Day 14: Breakup email
 *
 * Personalization:
 *   - {{company}} — their company name
 *   - {{score}} — their Lighthouse score
 *   - {{industry}} — their industry
 *   - {{personalized_line}} — AI-generated opener about THEIR site
 */

import type { Database } from "bun:sqlite";
import { genId, emit } from "./db.ts";
import type { Prospect } from "./prospects.ts";

export interface EmailSequence {
	id: string;
	name: string;
	emails: EmailTemplate[];
	created_at: string;
}

export interface EmailTemplate {
	id: string;
	day: number;
	subject: string;
	body: string;
}

export function ensureEmailTable(db: Database): void {
	db.run(`
		CREATE TABLE IF NOT EXISTS email_sequences (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			emails TEXT NOT NULL DEFAULT '[]',
			created_at TEXT DEFAULT (datetime('now'))
		)
	`);
	db.run(`
		CREATE TABLE IF NOT EXISTS email_sends (
			id TEXT PRIMARY KEY,
			sequence_id TEXT NOT NULL,
			prospect_id TEXT NOT NULL,
			email_index INTEGER NOT NULL,
			status TEXT DEFAULT 'pending',
			sent_at TEXT,
			opened_at TEXT,
			replied_at TEXT,
			created_at TEXT DEFAULT (datetime('now'))
		)
	`);
}

/**
 * Built-in cold email sequences.
 */
export const SEQUENCES: Record<string, EmailTemplate[]> = {
	"lighthouse-score": [
		{
			id: "ls-1", day: 0,
			subject: "Your site scores {{score}}/100 — here's why",
			body: `Hi,

{{personalized_line}}

I ran a quick audit on {{company}}'s website and found some issues that are likely costing you leads:

- Slow load time (affects 53% of mobile visitors who leave after 3 seconds)
- Missing meta tags (invisible to Google for key searches)
- No clear call-to-action above the fold

I help {{industry}} businesses fix exactly these problems. Happy to share the full audit — no strings attached.

Best,
Wael`,
		},
		{
			id: "ls-2", day: 3,
			subject: "How we helped a {{industry}} company get 3x more leads",
			body: `Hi,

Following up — wanted to share a quick case study.

We redesigned a site for a company similar to {{company}}. Results:
- Page speed: 34 → 92 (Google score)
- Bounce rate: 68% → 31%
- Leads per month: 12 → 38

The whole project took 5 days. Their only regret was not doing it sooner.

Want to see what we'd do for {{company}}?

Best,
Wael`,
		},
		{
			id: "ls-3", day: 7,
			subject: "Free audit for {{company}}",
			body: `Hi,

I put together a free website audit for {{company}} — takes 2 minutes to review:

- Performance score and what's slowing you down
- SEO gaps (keywords you should rank for but don't)
- Conversion blockers (what's stopping visitors from becoming customers)

Want me to send it over? Just reply "yes" and I'll have it in your inbox within 24 hours.

Best,
Wael`,
		},
		{
			id: "ls-4", day: 14,
			subject: "Last one from me",
			body: `Hi,

I've reached out a few times about {{company}}'s website performance. I know you're busy — no hard feelings.

If the timing isn't right, no worries at all. But if you ever want a fresh set of eyes on your site, my inbox is always open.

Wishing {{company}} the best.

Wael`,
		},
	],
	"case-study": [
		{
			id: "cs-1", day: 0,
			subject: "We redesigned [similar company]'s site — results inside",
			body: `Hi,

I noticed {{company}} is in {{industry}} — we recently finished a project for a company in the same space.

The results:
- 2.5x increase in conversion rate
- 40% faster page load
- Page 1 Google ranking for 3 target keywords within 60 days

Would a similar transformation interest you? Happy to walk you through what we did.

Best,
Wael`,
		},
		{
			id: "cs-2", day: 4,
			subject: "Quick question about {{company}}",
			body: `Hi,

Just curious — is improving your website's performance and lead generation a priority for {{company}} right now?

If yes, I'd love 15 minutes to show you what's possible. If not, I'll stop bothering you.

Either way, appreciate your time.

Best,
Wael`,
		},
		{
			id: "cs-3", day: 10,
			subject: "One last thing",
			body: `Hi,

I'll keep this short — I built a free tool that audits any website in 30 seconds. No signup needed.

Try it: [audit tool link]

If you like what you see in {{company}}'s report, let's talk about fixing it.

Best,
Wael`,
		},
	],
};

export function createSequence(db: Database, name: string, templateKey?: string): EmailSequence {
	ensureEmailTable(db);
	const id = genId();
	const emails = SEQUENCES[templateKey ?? name] ?? SEQUENCES["lighthouse-score"]!;
	db.run("INSERT INTO email_sequences (id, name, emails) VALUES (?, ?, ?)",
		[id, name, JSON.stringify(emails)]);
	emit(db, "sequence.created", "sequence", id, { name, emails: emails.length });
	return { id, name, emails, created_at: new Date().toISOString() };
}

/**
 * Personalize an email template for a specific prospect.
 */
export function personalizeEmail(template: EmailTemplate, prospect: Prospect): { subject: string; body: string } {
	const replacements: Record<string, string> = {
		"{{company}}": prospect.company_name,
		"{{score}}": String(prospect.lighthouse_score ?? "?"),
		"{{industry}}": prospect.industry ?? "your industry",
		"{{personalized_line}}": prospect.personalized_line ?? `I took a look at ${prospect.company_name}'s website and noticed some opportunities.`,
	};

	let subject = template.subject;
	let body = template.body;
	for (const [key, value] of Object.entries(replacements)) {
		subject = subject.replaceAll(key, value);
		body = body.replaceAll(key, value);
	}
	return { subject, body };
}

export function listSequences(db: Database): EmailSequence[] {
	ensureEmailTable(db);
	return (db.query("SELECT * FROM email_sequences ORDER BY created_at DESC").all() as any[])
		.map((r) => ({ ...r, emails: JSON.parse(r.emails) }));
}
