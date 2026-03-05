/**
 * HTML Dashboard — visual corp dashboard in browser.
 *
 * Generates a self-contained HTML file with:
 *   - Org chart (Mermaid)
 *   - Ticket kanban board
 *   - Marketing pipeline progress
 *   - Experiment portfolio
 *   - Cost tracking
 *   - Activity feed
 */

import type { Database } from "bun:sqlite";
import { listGoals } from "./goals.ts";
import { listAgents, getOrgTree, type Agent } from "./org.ts";
import { listTickets } from "./tickets.ts";
import { getStats } from "./dispatch.ts";
import { listCycles } from "./devcycle.ts";
import { listPipelines, getCurrentTask } from "./marketing.ts";
import { DEFAULT_HEARTBEATS } from "./autopilot.ts";
import { getSkillkit } from "./skillkits.ts";
import { getHeartbeatStatus } from "./heartbeat.ts";
import { listExperiments, getPortfolioAlpha } from "./experiments.ts";
import { getFeed, formatEvent } from "./feed.ts";
import { getRecentCosts, getTotalCost } from "./cost-tracker.ts";
import { writeFileSync } from "node:fs";

export function generateDashboardHTML(db: Database, companyName = "WaelCorp"): string {
	const goals = listGoals(db);
	const agents = listAgents(db);
	const org = getOrgTree(db);
	const tickets = listTickets(db).filter((t) => t.source !== "heartbeat");
	const stats = getStats(db);
	const cycles = listCycles(db);
	const pipelines = listPipelines(db);
	const heartbeats = getHeartbeatStatus(db);
	const experiments = listExperiments(db);
	const portfolio = getPortfolioAlpha(db);
	const feed = getFeed(db, 15);
	const costs = getTotalCost(50);

	const goal = goals[0];
	const todoTickets = tickets.filter((t) => t.status === "todo");
	const inProgress = tickets.filter((t) => t.status === "in_progress");
	const doneTickets = tickets.filter((t) => t.status === "done");
	const failedTickets = tickets.filter((t) => t.status === "failed");

	// Mermaid org chart
	const mermaidOrg = buildMermaidOrg(org);

	// Build HTML
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${companyName} — Corp Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<style>
:root {
  --bg: #0f1419;
  --surface: #1a2029;
  --surface-2: #222c38;
  --border: rgba(255,255,255,0.08);
  --text: #e8edf2;
  --text-dim: #8899aa;
  --accent: #0891b2;
  --accent-dim: rgba(8,145,178,0.15);
  --green: #059669;
  --green-dim: rgba(5,150,105,0.15);
  --amber: #d97706;
  --amber-dim: rgba(217,119,6,0.15);
  --red: #dc2626;
  --red-dim: rgba(220,38,38,0.15);
  --rose: #be123c;
  --font: 'DM Sans', system-ui, sans-serif;
  --mono: 'Fira Code', monospace;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f8f9fb;
    --surface: #ffffff;
    --surface-2: #f0f2f5;
    --border: rgba(0,0,0,0.08);
    --text: #1a2029;
    --text-dim: #6b7a8d;
  }
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--font); background: var(--bg); color: var(--text); line-height: 1.5; }
.container { max-width: 1280px; margin: 0 auto; padding: 24px; }

/* Header */
.header { text-align: center; padding: 40px 0 32px; }
.header h1 { font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; }
.header .subtitle { color: var(--text-dim); font-size: 0.95rem; margin-top: 8px; max-width: 600px; margin-left: auto; margin-right: auto; }

/* Stats bar */
.stats-bar { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin: 24px 0 32px; }
.stat { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px 24px; text-align: center; min-width: 120px; }
.stat .value { font-size: 1.5rem; font-weight: 700; font-family: var(--mono); }
.stat .label { font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
.stat.accent .value { color: var(--accent); }
.stat.green .value { color: var(--green); }
.stat.amber .value { color: var(--amber); }
.stat.red .value { color: var(--red); }

/* Section */
.section { margin: 32px 0; }
.section h2 { font-size: 1.1rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }

/* Grid layouts */
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 768px) { .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; } }

/* Cards */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.card h3 { font-size: 0.9rem; font-weight: 600; margin-bottom: 8px; }

/* Kanban */
.kanban { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 900px) { .kanban { grid-template-columns: 1fr 1fr; } }
.kanban-col { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
.kanban-col h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); margin-bottom: 10px; display: flex; justify-content: space-between; }
.kanban-col h3 .count { background: var(--surface-2); border-radius: 10px; padding: 2px 8px; font-family: var(--mono); font-size: 0.75rem; }
.ticket { background: var(--surface-2); border-radius: 8px; padding: 10px; margin-bottom: 8px; font-size: 0.82rem; line-height: 1.4; }
.ticket .priority { font-family: var(--mono); font-size: 0.7rem; font-weight: 600; display: inline-block; padding: 1px 6px; border-radius: 4px; margin-bottom: 4px; }
.p1 { background: var(--red-dim); color: var(--red); }
.p2 { background: var(--amber-dim); color: var(--amber); }
.p3 { background: var(--green-dim); color: var(--green); }

/* Pipeline */
.pipeline { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; }
.pipeline .step { background: var(--surface-2); border-radius: 6px; padding: 4px 10px; font-size: 0.75rem; font-family: var(--mono); }
.pipeline .step.active { background: var(--accent); color: white; font-weight: 600; }
.pipeline .arrow { color: var(--text-dim); font-size: 0.7rem; }

/* Agent card */
.agent { display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--surface-2); border-radius: 8px; margin-bottom: 8px; }
.agent .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.agent .dot.idle { background: var(--green); }
.agent .dot.working { background: var(--amber); animation: pulse 1.5s infinite; }
.agent .info { flex: 1; }
.agent .name { font-weight: 600; font-size: 0.85rem; }
.agent .meta { font-size: 0.72rem; color: var(--text-dim); font-family: var(--mono); }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

/* Experiments */
.exp { display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--surface-2); border-radius: 8px; margin-bottom: 8px; font-size: 0.82rem; }
.exp .icon { font-size: 1.2rem; flex-shrink: 0; }
.exp .alpha { font-family: var(--mono); font-weight: 600; min-width: 60px; text-align: right; }
.exp .alpha.positive { color: var(--green); }
.exp .alpha.negative { color: var(--red); }

/* Feed */
.feed-item { padding: 6px 0; font-size: 0.8rem; font-family: var(--mono); border-bottom: 1px solid var(--border); display: flex; gap: 8px; }
.feed-item .time { color: var(--text-dim); flex-shrink: 0; }

/* Mermaid */
.mermaid-container { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; overflow-x: auto; }
</style>
</head>
<body>
<div class="container">

<div class="header">
  <h1>🏢 ${companyName}</h1>
  <div class="subtitle">${goal?.title ?? "No goal set"}</div>
</div>

<div class="stats-bar">
  <div class="stat accent"><div class="value">${agents.length}</div><div class="label">Agents</div></div>
  <div class="stat"><div class="value">${tickets.length}</div><div class="label">Tickets</div></div>
  <div class="stat green"><div class="value">${doneTickets.length}</div><div class="label">Done</div></div>
  <div class="stat amber"><div class="value">${inProgress.length}</div><div class="label">In Progress</div></div>
  <div class="stat red"><div class="value">${failedTickets.length}</div><div class="label">Failed</div></div>
  <div class="stat"><div class="value">$${(costs.totalCost).toFixed(0)}</div><div class="label">AI Spend</div></div>
  <div class="stat accent"><div class="value">${experiments.length}</div><div class="label">Experiments</div></div>
  <div class="stat green"><div class="value">${(portfolio.compoundedLift * 100).toFixed(0)}%</div><div class="label">Growth Lift</div></div>
</div>

<div class="section">
  <h2>📋 Ticket Board</h2>
  <div class="kanban">
    <div class="kanban-col">
      <h3>Todo <span class="count">${todoTickets.length}</span></h3>
      ${todoTickets.sort((a, b) => a.priority - b.priority).slice(0, 8).map((t) => `<div class="ticket"><span class="priority p${t.priority}">P${t.priority}</span> ${esc(t.title.slice(0, 60))}</div>`).join("\n      ")}
    </div>
    <div class="kanban-col">
      <h3>In Progress <span class="count">${inProgress.length}</span></h3>
      ${inProgress.slice(0, 8).map((t) => `<div class="ticket"><span class="priority p2">WIP</span> ${esc(t.title.slice(0, 60))}</div>`).join("\n      ")}
      ${inProgress.length === 0 ? '<div class="ticket" style="color:var(--text-dim)">No active work</div>' : ""}
    </div>
    <div class="kanban-col">
      <h3>Done <span class="count">${doneTickets.length}</span></h3>
      ${doneTickets.slice(0, 8).map((t) => `<div class="ticket">✅ ${esc(t.title.slice(0, 60))}</div>`).join("\n      ")}
      ${doneTickets.length === 0 ? '<div class="ticket" style="color:var(--text-dim)">Nothing completed yet</div>' : ""}
    </div>
    <div class="kanban-col">
      <h3>Failed <span class="count">${failedTickets.length}</span></h3>
      ${failedTickets.slice(0, 8).map((t) => `<div class="ticket">❌ ${esc(t.title.slice(0, 60))}</div>`).join("\n      ")}
      ${failedTickets.length === 0 ? '<div class="ticket" style="color:var(--text-dim)">No failures</div>' : ""}
    </div>
  </div>
</div>

<div class="grid-2">
  <div class="section">
    <h2>👥 Org</h2>
    <div class="card">
      ${agents.map((a) => {
        const hb = DEFAULT_HEARTBEATS[a.role]?.interval ?? "?";
        const sk = getSkillkit(db, a.role).length;
        const isHuman = a.budget_monthly === 0;
        return `<div class="agent">
          <div class="dot ${a.status === "working" ? "working" : "idle"}"></div>
          <div class="info">
            <div class="name">${esc(a.name)}${isHuman ? " 👤" : ""}</div>
            <div class="meta">${a.role} · ${a.runtime} · $${a.budget_monthly}/mo · ${sk} skills · ↻${hb}</div>
          </div>
        </div>`;
      }).join("\n      ")}
    </div>
  </div>

  <div class="section">
    <h2>🚀 Marketing Pipelines</h2>
    <div class="card">
      ${pipelines.map((p) => {
        const task = getCurrentTask(p);
        return `<div style="margin-bottom:16px">
          <div style="font-weight:600;font-size:0.9rem;margin-bottom:6px">${p.type.toUpperCase()} — ${p.tasks.length} tasks</div>
          <div class="pipeline">
            ${p.tasks.map((t: { title: string; status?: string }, i: number) => {
              const isActive = i === (p.current_task ?? 0) && p.status === "running";
              return `${i > 0 ? '<span class="arrow">→</span>' : ""}<span class="step${isActive ? " active" : ""}">${i + 1}</span>`;
            }).join("")}
          </div>
          <div style="font-size:0.8rem;color:var(--text-dim)">Next: ${esc((task?.title ?? "done").slice(0, 50))}</div>
        </div>`;
      }).join("\n      ")}
    </div>
  </div>
</div>

<div class="grid-2">
  <div class="section">
    <h2>🧪 Experiments</h2>
    <div class="card">
      <div style="margin-bottom:12px;font-size:0.85rem">
        Portfolio: <strong>${portfolio.winners}W</strong> / ${portfolio.losers}L / ${portfolio.inconclusive}?
        · Compounded lift: <strong style="color:var(--green)">${(portfolio.compoundedLift * 100).toFixed(1)}%</strong>
      </div>
      ${experiments.length === 0 ? '<div style="color:var(--text-dim);font-size:0.85rem">No experiments. Run /corp-hypotheses autoCreate=true</div>' : ""}
      ${experiments.slice(0, 6).map((e) => {
        const icon = e.status === "winner" ? "🏆" : e.status === "loser" ? "📉" : e.status === "running" ? "🧪" : e.status === "inconclusive" ? "🤷" : "💡";
        const alphaStr = e.alpha !== null ? `${(e.alpha * 100).toFixed(1)}%` : "—";
        const cls = (e.alpha ?? 0) > 0 ? "positive" : (e.alpha ?? 0) < 0 ? "negative" : "";
        return `<div class="exp">
          <div class="icon">${icon}</div>
          <div style="flex:1">[${e.type}] ${esc(e.hypothesis.slice(0, 50))}</div>
          <div class="alpha ${cls}">${alphaStr}</div>
        </div>`;
      }).join("\n      ")}
    </div>
  </div>

  <div class="section">
    <h2>📰 Activity Feed</h2>
    <div class="card" style="max-height:320px;overflow-y:auto">
      ${feed.map((e) => {
        const time = e.created_at.slice(11, 19);
        const detail = e.data ? Object.values(e.data).slice(0, 2).join(", ") : "";
        return `<div class="feed-item"><span class="time">${time}</span><span>${esc(e.type)}${detail ? " — " + esc(String(detail).slice(0, 60)) : ""}</span></div>`;
      }).join("\n      ")}
      ${feed.length === 0 ? '<div style="color:var(--text-dim);font-size:0.85rem">No events yet</div>' : ""}
    </div>
  </div>
</div>

${cycles.length > 0 ? `
<div class="section">
  <h2>🔄 DevCycles</h2>
  <div class="card">
    ${cycles.map((c) => {
      const phases = ["plan", "build", "test", "review", "deploy", "measure", "iterate"];
      return `<div class="pipeline" style="margin-bottom:8px">
        ${phases.map((p) => `<span class="step${p === c.phase ? " active" : ""}">${p}</span>${p !== "iterate" ? '<span class="arrow">→</span>' : ""}`).join("")}
        <span style="font-size:0.75rem;color:var(--text-dim);margin-left:8px">iter ${c.iteration}/${c.max_iterations}</span>
      </div>`;
    }).join("\n    ")}
  </div>
</div>
` : ""}

</div>
<script>
mermaid.initialize({ startOnLoad: true, theme: 'dark', themeVariables: { primaryColor: '#0891b2', primaryTextColor: '#e8edf2', lineColor: '#4a5568' } });
</script>
</body>
</html>`;
}

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildMermaidOrg(org: { agent: Agent; reports: { agent: Agent; reports: any[] }[] }[]): string {
	const lines = ["graph TD"];
	function walk(node: { agent: Agent; reports: any[] }) {
		const id = node.agent.id.replace(/[^a-zA-Z0-9]/g, "");
		for (const child of node.reports) {
			const cid = child.agent.id.replace(/[^a-zA-Z0-9]/g, "");
			lines.push(`  ${id}["${node.agent.name}"] --> ${cid}["${child.agent.name}"]`);
			walk(child);
		}
	}
	for (const n of org) walk(n);
	return lines.join("\n");
}

/**
 * Write dashboard to file and return path.
 */
export function writeDashboard(db: Database, companyName = "WaelCorp"): string {
	const html = generateDashboardHTML(db, companyName);
	const dir = process.env.HOME ?? process.env.USERPROFILE ?? ".";
	const path = `${dir}/.agent/diagrams/corp-dashboard.html`;
	writeFileSync(path, html, "utf-8");
	return path;
}
