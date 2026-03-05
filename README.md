# pi-corp

Autonomous corp dashboard as a pi extension. Set a goal, bootstrap a company, let the DevCycle run.

Combines:
- **Paperclip**: goals, org charts, budgets, governance, role-based agents
- **Symphony**: ticket-driven dispatch, workspace-per-issue, reconciliation
- **Ralph**: PRD → stories → iterate until done, progress.txt memory
- **Compound/DevCycle**: Goal → Plan → Build → Test → Review → Deploy → Measure → Iterate
- **Skillkits**: each role gets curated skills (marketing skills from coreyhaines31/marketingskills, coding skills from pi ecosystem)
- **Apps**: GitHub, Gmail, Calendar, Vercel, Analytics — agents use real tools

One SQLite DB at `~/.pi-corp/corp.db`. No Postgres, no Redis, no React server.

## Install

```bash
pi install path:~/Projects/pi-corp
```

## Quick Start

```
/corp-bootstrap goalTitle="Build the #1 AI note-taking app" projectName="notesapp" repo="~/Projects/notesapp"
/corp
/corp-cycle
/corp-cycle advance=true
/corp-dispatch
/corp
```

## Commands

| Command | Description |
|---------|-------------|
| `/corp` | Full dashboard — goals, org, cycles, tickets, apps, costs |
| `/corp-bootstrap` | One-shot: create goal + 9 agents + 5 apps + start DevCycle |
| `/corp-goal` | Create a company goal |
| `/corp-project` | Create a project |
| `/corp-hire` | Hire an agent with role + runtime + budget + skillkit |
| `/corp-ticket` | Create a ticket |
| `/corp-prd` | Import PRD JSON as tickets (Ralph pattern) |
| `/corp-app` | Register an app/integration |
| `/corp-cycle` | Show or advance the DevCycle phase |
| `/corp-dispatch` | Match tickets to idle agents and dispatch |
| `/corp-skills` | Show skillkits for all roles |

## LLM Tools (9)

`corp_dashboard`, `corp_bootstrap`, `corp_advance_cycle`, `corp_hire`, `corp_dispatch`, `corp_create_ticket`, `corp_complete_run`, `corp_fail_run`, `corp_register_app`

## Org Roles (8)

| Role | Default Runtime | Skills |
|------|----------------|--------|
| ceo | claude-desktop | brainstorm, fabric-patterns, alex-hormozi-pitch, pai-algorithm |
| cto | claude | brainstorm, context-engineering, cost-pipeline, security-review, john-carmack |
| lead | pi | brainstorm, review, commit, tdd-workflow, context-driven-dev |
| builder | pi/codex | commit, review, tdd-workflow, frontend-design, code-simplifier, bug-scanner |
| scout | gemini | librarian, research-lead, github-repo-search, web-search |
| reviewer | claude | review, security-review, code-simplifier, bug-scanner |
| designer | claude | frontend-design, canvas-design, algorithmic-art, web-design-guidelines, visual-explainer |
| marketer | claude-desktop | product-marketing-context, copywriting, seo-audit, page-cro, content-strategy, email-sequence, launch-strategy, analytics-tracking, pricing-strategy, alex-hormozi-pitch |

## Worker Runtimes (8)

pi, claude, codex, gemini, aider, goose, amp, claude-desktop

## DevCycle Phases

```
Goal → [PLAN] → BUILD → TEST → REVIEW → DEPLOY → MEASURE → ITERATE → BUILD → ...
```

Each phase dispatches specific roles:
- **Plan**: CTO breaks down goals, Scout researches
- **Build**: Builders implement, Lead coordinates
- **Test**: Builders run tests, Reviewer audits
- **Review**: Reviewer + CTO final check
- **Deploy**: Lead merges and deploys
- **Measure**: Scout checks metrics, Marketer checks conversion
- **Iterate**: CTO reviews progress, decides next iteration

Max 10 iterations per cycle (configurable).

## Apps

GitHub, Gmail, Calendar, Vercel, Analytics, Stripe, Social, Docs, Drive, Custom
