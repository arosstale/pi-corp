# pi-corp

Autonomous AI company as a pi extension. One mission → full company with org chart, DevCycle, marketing pipelines, and agent dispatch.

## Install

```bash
pi install path:~/Projects/pi-corp
```

## Quick Start

```
/corp-autopilot mission="Build a SaaS for freelancer invoices"
/corp-go          # 🚀 Full auto — tick, dispatch, execute, retry
/corp             # Dashboard
```

## The Abstraction Ladder

```
L5: /corp-autopilot    "Build X"                    ← you touch this
L4: Company            goal → org → budget → apps
L3: Loops              DevCycle + Marketing (5 pipelines)
L2: Dispatch           tickets → agents → runs → skill injection
L1: Execute            pi, claude, codex, gemini, aider, goose, amp
L0: Tools              git, gh, gmcli, vercel, ffmpeg, curl
```

## Commands (26)

| Command | What it does |
|---|---|
| `/corp` | Full dashboard |
| `/corp-autopilot` | One mission → entire company |
| `/corp-go` | 🚀 Full auto: heartbeat + dispatch + execute + retry |
| `/corp-bootstrap` | Interactive company setup |
| `/corp-goal` | Create/list goals |
| `/corp-project` | Create/list projects |
| `/corp-hire` | Hire agents (with project specialist assignment) |
| `/corp-ticket` | Create tickets |
| `/corp-prd` | Import PRD into stories |
| `/corp-app` | Register app integrations |
| `/corp-cycle` | DevCycle management |
| `/corp-dispatch` | Match tickets to agents (execute=true to launch) |
| `/corp-run` | Show run command |
| `/corp-done` | Complete a run |
| `/corp-fail` | Fail a run |
| `/corp-retry` | Retry failed tickets (max 3 attempts) |
| `/corp-heartbeat` | Run one heartbeat cycle |
| `/corp-heartbeats` | Show heartbeat schedule |
| `/corp-skills` | View/update skillkits |
| `/corp-marketing` | Start marketing pipeline |
| `/corp-marketing-next` | Advance marketing pipeline |
| `/corp-sync` | Sync GitHub issues into tickets |
| `/corp-costs` | Real agent costs from Pi transcripts |
| `/corp-worktree` | Git worktree per ticket |
| `/corp-feed` | Activity event log |
| `/corp-processes` | Active agent processes |

## Marketing Pipelines (5)

| Pipeline | Tasks | What |
|---|---|---|
| **waelcorp** | 8 | Full-spectrum: SEO keywords → programmatic pages → cold outreach → social → free tool |
| **launch** | 8 | Product launch: positioning → landing page → press → Product Hunt |
| **content** | 6 | Content engine: strategy → blog → distribution → newsletter |
| **growth** | 6 | Growth: analytics → CRO → retention → referrals |
| **evergreen** | 4 | Weekly: content refresh → SEO check → social → competitors |

## Agent Roles (8) with Heartbeat

| Role | Heartbeat | Skills |
|---|---|---|
| CEO | 4h | leadership, strategy, hiring, metrics |
| CTO | 1h | architecture, code-review, devops, debugging, testing |
| Lead | 15m | project-management, code-review, testing, debugging, git |
| Builder | 5m | git, testing, debugging, code-review, refactoring, documentation |
| Scout | 4h | web-search, competitive-analysis, trend-monitoring, documentation |
| Reviewer | 15m | code-review, security-review, testing, documentation |
| Designer | 1h | frontend-design, css, accessibility, responsive-design, figma |
| Marketer | 1d | 10 marketing skills (copywriting, SEO, email, social, etc.) |

## Runtimes (8)

pi, claude, codex, gemini, aider, goose, amp, claude-desktop

## Architecture

- Pure SQLite (WAL mode) at `~/.pi-corp/corp.db`
- 12 tables, 16 source files, ~3,800 lines
- No Postgres, Redis, or React server
- Real cost tracking from Pi JSONL transcripts
- GitHub Issues sync via `gh` CLI
- Git worktree isolation per ticket
