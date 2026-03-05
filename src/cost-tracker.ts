/**
 * Cost Tracker — parse real agent transcripts for token counts and costs.
 *
 * Supported:
 *   Pi:     ~/.pi/agent/sessions/{encoded-path}/*.jsonl
 *   Claude: ~/.claude/projects/{name}/sessions/*.jsonl (Claude Code)
 *
 * Pi v3 JSONL format:
 *   { type: "message", message: { usage: { input, output, cacheRead, cacheWrite, totalTokens, cost: { total } } } }
 *   { type: "model_change", model_change: { modelId: "..." } }
 *
 * Claude Code JSONL format:
 *   { type: "assistant", costUSD: 0.05, ... }
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

export interface SessionCost {
	sessionPath: string;
	inputTokens: number;
	outputTokens: number;
	cacheRead: number;
	totalTokens: number;
	cost: number;
	model: string | null;
	messageCount: number;
}

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? ".";

/**
 * Find Pi session directories.
 */
export function findPiSessions(limit = 10): string[] {
	const sessionsDir = join(HOME, ".pi", "agent", "sessions");
	if (!existsSync(sessionsDir)) return [];

	const dirs: { path: string; mtime: number }[] = [];
	try {
		for (const encodedPath of readdirSync(sessionsDir)) {
			const fullPath = join(sessionsDir, encodedPath);
			try {
				const entries = readdirSync(fullPath);
				const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));
				for (const f of jsonlFiles) {
					const filePath = join(fullPath, f);
					const stat = Bun.file(filePath);
					dirs.push({ path: filePath, mtime: stat.lastModified });
				}
			} catch { /* skip */ }
		}
	} catch { /* skip */ }

	return dirs.sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((d) => d.path);
}

/**
 * Parse a Pi JSONL transcript file for cost data.
 */
export function parsePiTranscript(filePath: string): SessionCost {
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n").filter((l) => l.trim());

	let inputTokens = 0;
	let outputTokens = 0;
	let cacheRead = 0;
	let totalTokens = 0;
	let cost = 0;
	let model: string | null = null;
	let messageCount = 0;

	for (const line of lines) {
		try {
			const obj = JSON.parse(line);
			if (obj.type === "message" && obj.message?.usage) {
				const u = obj.message.usage;
				inputTokens += u.input ?? u.inputTokens ?? 0;
				outputTokens += u.output ?? u.outputTokens ?? 0;
				cacheRead += u.cacheRead ?? 0;
				totalTokens += u.totalTokens ?? (u.input ?? 0) + (u.output ?? 0);
				cost += u.cost?.total ?? 0;
				messageCount++;
			}
			if (obj.type === "model_change") {
				model = obj.modelId ?? obj.model_change?.modelId ?? model;
			}
		} catch { /* skip malformed lines */ }
	}

	return { sessionPath: filePath, inputTokens, outputTokens, cacheRead, totalTokens, cost, model, messageCount };
}

/**
 * Get cost summary for recent Pi sessions.
 */
export function getRecentCosts(limit = 10): SessionCost[] {
	const sessions = findPiSessions(limit);
	return sessions.map((s) => parsePiTranscript(s)).filter((s) => s.messageCount > 0);
}

/**
 * Get total cost across all recent sessions.
 */
export function getTotalCost(limit = 50): { sessions: number; totalCost: number; totalTokens: number; inputTokens: number; outputTokens: number } {
	const costs = getRecentCosts(limit);
	return {
		sessions: costs.length,
		totalCost: costs.reduce((sum, c) => sum + c.cost, 0),
		totalTokens: costs.reduce((sum, c) => sum + c.totalTokens, 0),
		inputTokens: costs.reduce((sum, c) => sum + c.inputTokens, 0),
		outputTokens: costs.reduce((sum, c) => sum + c.outputTokens, 0),
	};
}
