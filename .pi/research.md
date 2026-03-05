# pi-corp Research — Competitive Landscape (March 2026)

## The Landscape

### Orchestration Layer (what we compete with)
| Tool | Stars | Lines | Stack | Focus |
|---|---|---|---|---|
| **Paperclip** | 2,800 | 38.8k | Node+Postgres+React+Docker | Full autonomous company, org charts, governance |
| **Ruflo** | 19,139 | ? | TypeScript | Multi-agent swarms for Claude, enterprise focus |
| **Zeroshot** | 1,269 | ? | JavaScript | Issue → code → validate → PR. Multi-provider. |
| **AgenticSeek** | 25,431 | ? | Python | Fully local, no APIs. Browser + code agent. |
| **Edict** | 2,496 | ? | Python | OpenClaw multi-agent with 9 specialized agents |
| **pi-corp** | 0 | 4.8k | TypeScript+SQLite | Terminal-first, marketing-aware, zero setup |

### What's Actually Making Money (IndieHackers data)
- **$30k/mo portfolio** — quit $420k job, builds products with AI, selective agency work at $5k+
- **$58k MRR** — acquired AI micro-SaaS, grew 2 years
- **$1M+ ARR lead-gen agency** — intentionally tanked revenue to improve margins
- **$1.4M/yr holdco** — media brand → agency → holding company
- **7-figure marketing agency** — project-based + monthly retainers
- **$10k+/mo** — agency as testing ground + distribution for SaaS product

### Key Pattern from Profitable Agencies
1. **Agency funds product development** — use agency revenue to build SaaS
2. **Retainers > projects** — monthly recurring beats one-time
3. **Niche down hard** — "AI for executive search" not "AI for everyone"
4. **Done-for-you > tools** — $5k/client beats $29/mo subscription at small scale
5. **Distribution > product** — having an audience matters more than the tech

## What Paperclip Gets Right
- Company as first-class object
- Hierarchical task → goal alignment
- Adapter-agnostic (any agent runtime)
- Board governance (human approval gates)
- Multi-company support
- Cost tracking with budget enforcement
- Exportable org configs ("Clipmart" marketplace)

## What Paperclip Gets Wrong
- **Complexity tax**: Postgres + Docker + React = bugs (#71 #87 #48 #63 #89 #90)
- **No marketing**: Zero marketing automation. It's a task manager, not a business runner.
- **No experiments**: No A/B testing, no growth metrics, no conversion tracking
- **No agency templates**: Every company built from scratch
- **Server dependency**: Can't run from terminal alone
- **Windows broken**: Symlink issues (#63)

## What Zeroshot Gets Right
- Issue → code → validate → PR (complete loop)
- Multi-provider (Claude, Codex, Gemini, OpenCode)
- Blind validation (validators don't see worker context)
- Crash recovery (SQLite state)
- Isolation modes (none, worktree, Docker)
- GitHub + GitLab + Jira + Azure DevOps

## pi-corp Unique Advantages
1. **Zero setup** — `pi install`, done. No Docker, no Postgres, no onboarding wizard
2. **Marketing-native** — 5 pipeline types, 24+ tasks, skill-injected
3. **Quant growth** — experiments compound like trading returns
4. **Agency templates** — one command bootstraps design/SEO agency
5. **Wael-specific** — human handles relationships, AI handles everything else
6. **Terminal-first** — works on Windows Git Bash, no browser required
7. **8x smaller** — 4.8k lines vs 38.8k. Less to break.

## Strategic Position
pi-corp is NOT a Paperclip competitor. Different category:
- **Paperclip** = infrastructure for running AI companies (the platform)
- **pi-corp** = opinionated template for a specific business type (the product)

Think: Paperclip is WordPress. pi-corp is a WordPress theme that comes pre-built for design agencies with marketing automation.

## What to Build Next (prioritized by revenue impact)
1. **Client intake automation** — intake form → brief → proposal → build
2. **Prospect scraping** — Lighthouse audit → bad score = lead
3. **Email sequence engine** — cold outreach templates with personalization
4. **SEO page generator** — programmatic pages from keyword list
5. **Reporting dashboard** — client-facing progress reports
6. **Billing integration** — Stripe for recurring retainers
