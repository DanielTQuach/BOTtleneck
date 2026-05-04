import * as github from "@actions/github";
import * as core from "@actions/core";

// File extensions worth reviewing for performance issues
const REVIEWABLE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx",
  ".py", ".go", ".java", ".rb",
  ".cs", ".php", ".rs",
];

// Skip generated files, lockfiles, etc.
const SKIP_PATTERNS = [
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  ".min.js", ".min.css", "dist/", "build/", "__generated__",
  "node_modules/",
];

export interface PRFile {
  filename: string;
  patch: string; // the actual diff
  additions: number;
  deletions: number;
}

export async function getDiff(
  octokit: ReturnType<typeof github.getOctokit>,
  context: typeof github.context,
  maxFiles: number
): Promise<PRFile[]> {
  const { owner, repo } = context.repo;
  const prNumber = context.payload.pull_request!.number;

  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const reviewable = files
    .filter((f) => {
      // Must have a patch (binary files don't)
      if (!f.patch) return false;

      // Check extension
      const hasReviewableExt = REVIEWABLE_EXTENSIONS.some((ext) =>
        f.filename.endsWith(ext)
      );
      if (!hasReviewableExt) return false;

      // Skip generated/lock files
      const shouldSkip = SKIP_PATTERNS.some((pattern) =>
        f.filename.includes(pattern)
      );
      if (shouldSkip) return false;

      return true;
    })
    .slice(0, maxFiles);

  core.info(
    `Found ${reviewable.length} reviewable file(s) out of ${files.length} total changed files.`
  );

  return reviewable.map((f) => ({
    filename: f.filename,
    patch: f.patch!,
    additions: f.additions,
    deletions: f.deletions,
  }));
}
