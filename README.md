# pi-corp

Autonomous corp dashboard as a pi extension. Combines:

- **Paperclip** concepts: goals, org charts, budgets, governance
- **Symphony** concepts: ticket-driven dispatch, workspace-per-issue, retry/reconciliation
- **Ralph** concepts: PRD → stories → iterate until done
- **Overstory** integration: multi-agent orchestration via `ov`

One SQLite DB at `~/.pi-corp/corp.db`. No Postgres, no Redis, no React server.

## Install

```bash
pi install path:~/Projects/pi-corp
```

## Commands

| Command | Description |
|---------|-------------|
| `/corp` | Dashboard — goals, org chart, tickets, runs, costs |
| `/corp-goal` | Create a company goal |
| `/corp-project` | Create a project under a goal |
| `/corp-hire` | Hire an agent (role + runtime + budget) |
| `/corp-ticket` | Create a ticket |
| `/corp-prd` | Import PRD JSON as tickets (Ralph pattern) |
| `/corp-dispatch` | Match todo tickets to idle agents and dispatch |

## LLM Tools

The agent can call `corp_dashboard`, `corp_hire`, `corp_dispatch`, `corp_create_ticket`, `corp_complete_run`, `corp_fail_run` as tool calls during conversation.

## Worker Runtimes

pi, claude, codex, gemini, aider, goose, amp, claude-desktop

## Quick Start

```
/corp-goal title="Build the #1 AI note-taking app to $1M MRR"
/corp-project name="notesapp" goalId="<goal-id>" repo="~/Projects/notesapp"
/corp-hire name="CTO" role="cto" runtime="claude" budget=100
/corp-hire name="Builder-1" role="builder" runtime="pi" budget=50 reportsTo="<cto-id>"
/corp-hire name="Builder-2" role="builder" runtime="codex" budget=50 reportsTo="<cto-id>"
/corp-hire name="Scout-1" role="scout" runtime="gemini" budget=10 reportsTo="<cto-id>"
/corp-ticket title="Set up Next.js scaffolding" projectId="<project-id>" priority=1
/corp-ticket title="Add authentication" projectId="<project-id>" priority=2
/corp-dispatch
/corp
```
