---
name: generate-release-log
description: >
  Generate a release changelog from git log between two tags. Use when the user
  asks to generate release notes, changelog, or release log for a Next.js version.
user-invocable: true
argument-hint: 'git tag or from-to range, e.g. "v16.2.0-canary.0" or "from 16.1.0 to 16.2.0"'
allowed-tools: [Bash, Grep, Read, Write]
---

# Generate Release Log

Generate a changelog from git history between two canary tags.

## Usage

- `/generate-release-log` — ask the user for from-tag and to-tag
- `/generate-release-log v16.2.1-canary.0` — generate log for this tag (auto-finds previous tag)
- `/generate-release-log v16.2.0-canary.0 v16.2.0-canary.103` — explicit range

## Determine range

Ensure full history and tags:

```bash
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then git fetch --unshallow; fi
git fetch --tags
git fetch origin canary
```

**No args:** Ask the user for the from-tag and to-tag before proceeding.

Normalize all tag args: prepend `v` if missing (e.g., `16.2.0-canary.10` → `v16.2.0-canary.10`).

**1 arg (to-tag):** Auto-detect from-tag, then **ask the user to confirm** before proceeding.

- **Prerelease to-tag** (contains `-`): find the previous tag (any) on canary:

  ```bash
  prev=$(git describe --tags --abbrev=0 <to-tag>^)
  while ! git merge-base --is-ancestor "$prev" origin/canary 2>/dev/null; do
    prev=$(git describe --tags --abbrev=0 "$prev^")
  done
  ```

- **Stable to-tag** (no `-`): find the previous **stable** tag on canary (skip canary/prerelease tags):
  ```bash
  prev=$(git describe --tags --abbrev=0 <to-tag>^)
  while echo "$prev" | grep -q '-' || ! git merge-base --is-ancestor "$prev" origin/canary 2>/dev/null; do
    prev=$(git describe --tags --abbrev=0 "$prev^")
  done
  ```

After detecting, ask: "Detected range: `<from-tag>` → `<to-tag>`. Proceed?" Wait for user confirmation before generating. If the user says no, ask them for the explicit from-tag and to-tag again.

**2 args:** Use as-is.

Validate both tags exist with `git tag -l <tag>`. Stop if missing.

## Collect and parse commits

```bash
git log --first-parent --reverse --format='%s|||%aE' <from>..<to>
```

Filter out version bump commits matching `^v\d+\.\d+\.\d+(-[a-z]+\.\d+)?$` (prerelease e.g. canary, rc, etc.). If zero commits remain, report empty range and stop.

Extract from each line: **title** (strip `(#NNNNN)` suffix), **PR number** from that suffix.

## Categorize (first-match-wins)

| Category          | Rules                                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Documentation** | Starts with `docs:`, `docs(`, `doc:`, `Docs:`, `Docs `, `[Docs]`, `[docs]`, `Guide:`, `CC Guide`; or subject is primarily documentation                                                                                                                               |
| **Examples**      | Starts with `fix(examples)`, `chore(examples)`, `example:`, `examples:`; or subject involves example apps                                                                                                                                                             |
| **Core**          | Clearly changes Next.js or Turbopack functionality: bug fixes, new APIs/features, config, server/build/rendering/routing/caching, security fixes, Turbopack bundler changes. `Turbopack:` and `[turbopack]` prefixes go here unless they matched Docs/Examples first. |
| **Misc**          | Everything else (default). Includes `ci:`, `test:`, `chore:`, `bench:`, `perf(` prefixes; `Upgrade React`, `[react-sync]`, `Deflake`/`Unflake`, `Update Rspack`, `Update font data`, `chore(deps):`, `AGENTS.md`; and any commit whose category is uncertain.         |

## Resolve credits

Extract GitHub usernames from author emails:

1. **Noreply:** `ID+username@users.noreply.github.com` or `username@users.noreply.github.com` → extract `username`
2. **Non-noreply:** One `gh api repos/vercel/next.js/pulls/NNNNN --jq '.user.login'` call per unique email, using any PR from that author.

Deduplicate by resolved GitHub username.

## Format and write

Sections in order, chronological within each (oldest first). Omit empty sections. Write to `release-<version>.txt` in repo root (e.g., `release-16.2.0.txt`).

```
### Core Changes

- Title: #NNNNN
...

### Documentation Changes

- Title: #NNNNN
...

### Example Changes

- Title: #NNNNN
...

### Misc Changes

- Title: #NNNNN
...

### Credits

Huge thanks to @user1, @user2, ..., and @userN for helping!
```

## Eval tests

See [`evals/README.md`](evals/README.md) for how to run eval tests for this skill.
