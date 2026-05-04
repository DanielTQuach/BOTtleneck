import * as github from "@actions/github";
import * as core from "@actions/core";
import { Finding } from "./analyzer";

const SEVERITY_EMOJI = {
  high: "🔴",
  medium: "🟡",
  low: "🔵",
};

const BOT_HEADER = `## ⚡ BOTtleneck — Performance Review\n\n`;

export async function postReview(
  octokit: ReturnType<typeof github.getOctokit>,
  context: typeof github.context,
  pr: { number: number; head: { sha: string } },
  findings: Finding[],
  mode: "clean" | "issues"
) {
  const { owner, repo } = context.repo;

  if (mode === "clean") {
    // Just leave a simple comment — no issues found
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pr.number,
      body:
        BOT_HEADER +
        "✅ No performance issues detected in this PR. Looks good!\n\n" +
        "_Checked for: polling, N+1 queries, missing caching, unbounded fetches, redundant recomputation, sequential awaits, memory leaks._",
    });
    return;
  }

  // Group by severity for the summary
  const high = findings.filter((f) => f.severity === "high");
  const medium = findings.filter((f) => f.severity === "medium");
  const low = findings.filter((f) => f.severity === "low");

  // Build summary body
  let summary = BOT_HEADER;
  summary += `Found **${findings.length} performance issue(s)**`;
  if (high.length) summary += ` — ${high.length} high, `;
  if (medium.length) summary += `${medium.length} medium, `;
  if (low.length) summary += `${low.length} low`;
  summary += `\n\n`;

  summary += `| Severity | File | Category | Issue |\n`;
  summary += `|----------|------|----------|-------|\n`;
  for (const f of findings) {
    const emoji = SEVERITY_EMOJI[f.severity];
    const fileShort = f.filename.split("/").pop();
    summary += `| ${emoji} ${f.severity} | \`${fileShort}\` | ${f.category} | ${f.issue} |\n`;
  }

  summary += `\n_See inline comments below for details and suggestions._\n\n`;
  summary +=
    "_BOTtleneck checks for: polling, N+1 queries, missing caching, unbounded fetches, redundant recomputation, sequential awaits, memory leaks._";

  // Post findings as a PR review with inline comments where possible
  const comments: {
    path: string;
    position?: number;
    body: string;
  }[] = [];

  for (const f of findings) {
    if (f.line != null) {
      const emoji = SEVERITY_EMOJI[f.severity];
      const body =
        `${emoji} **BOTtleneck [${f.severity.toUpperCase()}] — ${f.category}**\n\n` +
        `**Issue:** ${f.issue}\n\n` +
        `**Suggestion:** ${f.suggestion}`;

      comments.push({
        path: f.filename,
        position: f.line,
        body,
      });
    }
  }

  try {
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pr.number,
      commit_id: pr.head.sha,
      body: summary,
      event: "COMMENT",
      comments: comments.length > 0 ? comments : undefined,
    });
    core.info("Posted PR review successfully.");
  } catch (err) {
    // Inline comments can fail if line numbers don't match the diff
    // Fall back to a plain issue comment
    core.warning(
      `Inline review failed, falling back to comment: ${(err as Error).message}`
    );
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pr.number,
      body: summary,
    });
  }
}
