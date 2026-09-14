# PR Auto-Labeler

Applies labels to a pull request based on its changed files and author.

## Usage

Reference this action from its canonical location on the `canary` branch so
that all release branches share one source of truth for labeling rules:

```yaml
jobs:
  label:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: vercel/next.js/.github/actions/pr-auto-label@canary
```

No checkout is required — GitHub Actions fetches the action bundle
(`dist/index.js`, pinned to the ref after `@`) from this repo directly.
Referencing `@canary` means a PR targeting a release branch is still
labeled against the latest rules, matching the original
`next-labeler-webhook` behavior.

## Security model

The action is designed to run under `pull_request_target` so it can label
PRs from forks, and is hardened accordingly:

- **No inputs.** The action reads `GITHUB_TOKEN` from the environment
  rather than an input, so callers can't pass an unrelated higher-scoped
  token from a fork-controlled context.
- **No PR-controlled code runs.** The calling workflow does not check out
  the PR, install dependencies, or execute scripts from the PR. Only the
  trusted action bundle, fetched by GitHub from `@canary`, runs.
- **No PR-controlled strings are shell-interpolated.** The only
  PR-derived values are `pull_request.user.login` and the changed file
  list — both returned by the GitHub API, not by the PR author — and
  neither is ever passed to a shell.
- **Labels are capped by config.** The action only applies labels whose
  names appear as keys in `src/config.json`. Anything else is rejected
  before the `addLabels` call so a buggy config can't silently create new
  labels in the repo.

## Config

Labeling rules live in [`src/config.json`](src/config.json). Each label
maps to a list of rules:

- A file glob (string) — matched with `minimatch` against the PR's
  changed file paths.
- An author rule (`{ "type": "user", "pattern": "<login>" }`) — matched
  case-insensitively against `pull_request.user.login`.

A label is applied if any of its rules match.

## Developing

After editing `src/*.ts` or `src/config.json`, rebuild the committed
bundle:

```bash
cd .github/actions/pr-auto-label
pnpm install
pnpm build
```

Commit the regenerated `dist/index.js` alongside your source change.
