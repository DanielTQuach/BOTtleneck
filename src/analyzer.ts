import Anthropic from "@anthropic-ai/sdk";
import * as core from "@actions/core";
import { PRFile } from "./diff";

export interface Finding {
  filename: string;
  line: number | null;
  severity: "high" | "medium" | "low";
  issue: string;
  suggestion: string;
  category: string;
}

const SYSTEM_PROMPT = `You are a performance-focused code reviewer. Your job is to detect performance anti-patterns in code diffs.

ONLY flag genuine performance issues. Do NOT comment on:
- Code style or formatting
- Correctness or logic bugs
- Security vulnerabilities
- Missing tests or documentation

Performance patterns to look for:
1. POLLING vs PUSH: Repeated API calls in a loop/interval when webhooks, SSE, or WebSockets could be used instead
2. N+1 QUERIES: Fetching data inside a loop when a single batched/joined query would work
3. MISSING CACHING: Calling the same API/function with identical args repeatedly within the same scope or request lifecycle
4. UNBOUNDED FETCHES: Fetching entire datasets without pagination, limit, or filtering
5. REDUNDANT RECOMPUTATION: Recalculating derived values on every render/call instead of memoizing
6. BLOCKING CALLS: Awaiting sequential async calls that could run in parallel with Promise.all
7. MEMORY LEAKS: Event listeners, intervals, or subscriptions that are never cleaned up

Be conservative. If the pattern could be intentional or if no better alternative clearly exists, do NOT flag it.
Phrase suggestions as "consider" not "you must."

Respond ONLY with a JSON array. No preamble, no markdown fences, just raw JSON.

Schema:
[
  {
    "filename": "src/api/users.ts",
    "line": 42,
    "severity": "high" | "medium" | "low",
    "category": "N+1 Query" | "Polling" | "Missing Cache" | "Unbounded Fetch" | "Redundant Recomputation" | "Sequential Await" | "Memory Leak",
    "issue": "Brief description of what the problem is",
    "suggestion": "Concrete suggestion for how to fix it"
  }
]

If no issues are found, return an empty array: []`;

export async function analyzePerformance(
  anthropic: Anthropic,
  files: PRFile[]
): Promise<Finding[]> {
  // Build the user message with all file diffs
  const diffContent = files
    .map(
      (f) =>
        `=== ${f.filename} ===\n${f.patch}`
    )
    .join("\n\n");

  const userMessage = `Review this PR diff for performance issues:\n\n${diffContent}`;

  core.info("Sending diff to Claude for analysis...");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("");

    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, "").trim();
    const findings: Finding[] = JSON.parse(clean);

    return findings;
  } catch (err) {
    core.warning(`Failed to parse Claude response: ${(err as Error).message}`);
    return [];
  }
}
