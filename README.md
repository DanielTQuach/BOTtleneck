# ⚡ BOTtleneck

> AI-powered GitHub Action that detects performance bottlenecks in pull requests using Claude.

Most AI code review tools catch bugs and style issues. BOTtleneck focuses specifically on **performance** — the kind of inefficiencies that slip through when using AI coding tools like Cursor or Claude Code without enough context.

## What it detects

| Pattern | Example |
|---------|---------|
| 🔁 **Polling vs Push** | Calling an API every 5s when a webhook exists |
| 🔢 **N+1 Queries** | Fetching inside a loop instead of batching |
| 💾 **Missing Cache** | Calling the same endpoint repeatedly with identical args |
| 📦 **Unbounded Fetches** | Pulling entire datasets without pagination |
| 🧮 **Redundant Recomputation** | Recalculating derived state on every render |
| ⏳ **Sequential Awaits** | `await a(); await b()` when `Promise.all` would work |
| 🕳️ **Memory Leaks** | Event listeners or intervals never cleaned up |

## Usage

Add this to your repo at `.github/workflows/bottleneck.yml`:

```yaml
name: BOTtleneck — Performance Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  perf-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: BOTtleneck
        uses: DanielTQuach/BOTtleneck@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

Then add your `ANTHROPIC_API_KEY` to your repo's **Settings → Secrets → Actions**.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `anthropic_api_key` | ✅ | — | Your Anthropic API key |
| `github_token` | ✅ | `${{ github.token }}` | GitHub token for posting comments |
| `max_files` | ❌ | `10` | Max files to review per PR |

## How it works

1. Triggers on PR open or update
2. Fetches the PR diff via GitHub API
3. Sends changed files to Claude with a performance-focused prompt
4. Posts findings as a PR review with inline comments

## Building from source

```bash
npm install
npm run build
```

The build step compiles TypeScript and bundles everything into `dist/index.js` using `ncc`.

## Philosophy

BOTtleneck is intentionally **conservative**. It only flags issues where:
- A clearly better alternative exists
- The pattern has a measurable performance cost
- The suggestion is actionable

It does **not** flag style issues, correctness bugs, or anything subjective.
