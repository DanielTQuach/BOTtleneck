import * as core from "@actions/core";
import * as github from "@actions/github";
import Anthropic from "@anthropic-ai/sdk";
import { getDiff } from "./diff";
import { analyzePerformance } from "./analyzer";
import { postReview } from "./reviewer";

async function run() {
  try {
    const anthropicApiKey = core.getInput("anthropic_api_key", {
      required: true,
    });
    const githubToken = core.getInput("github_token", { required: true });
    const maxFilesToReview = parseInt(
      core.getInput("max_files") || "10",
      10
    );

    const context = github.context;
    if (context.eventName !== "pull_request") {
      core.info("Not a pull request event, skipping.");
      return;
    }

    const pr = context.payload.pull_request as {
      number: number;
      title: string;
      head: { sha: string };
    };
    const octokit = github.getOctokit(githubToken);
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    core.info(`Reviewing PR #${pr.number}: ${pr.title}`);

    // Get the diff for this PR
    const files = await getDiff(octokit, context, maxFilesToReview);
    if (files.length === 0) {
      core.info("No reviewable files found in this PR.");
      return;
    }

    core.info(`Analyzing ${files.length} file(s) for performance issues...`);

    // Analyze with Claude
    const findings = await analyzePerformance(anthropic, files);

    if (findings.length === 0) {
      core.info("No performance issues detected.");
      await postReview(octokit, context, pr, [], "clean");
      return;
    }

    core.info(`Found ${findings.length} potential issue(s). Posting review...`);
    await postReview(octokit, context, pr, findings, "issues");
  } catch (error) {
    core.setFailed(`Action failed: ${(error as Error).message}`);
  }
}

run();
