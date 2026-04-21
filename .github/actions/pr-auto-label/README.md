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
