## Events Triggering Workflows

- Use `pull_request`, not `pull_request_target`. If you genuinely need secrets on a fork PR, never check out the PR's HEAD ref in the privileged job.
- Be extremely careful with `workflow_run` for similar to `pull_request_target`.
- When operating on `pull_request`, think if the workflow should use `concurrency` to cancel superseded runs.

## Workflow Permissions

Set `permissions: {}` at the workflow level and grant the minimum needed per-job.

```yaml
permissions: {}

jobs:
  lint:
    permissions:
      contents: read
    # ...
  comment-on-pr:
    permissions:
      contents: read
      pull-requests: write
    # ...
```

## Third-party GitHub Actions

Prefer GitHub-provided (`actions/*`) and Vercel-owned actions. For third-party actions:

- Don't include the third-party action if it doesn't provide much value, e.g. if a `pnpm`-installable tool can do the same job without much more code.
- Pin to a full commit SHA, never a tag or branch. Include the tag as a trailing comment:

  ```yaml
  uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
  ```

- Before pinning, `git grep -n 'owner/repo@'` and reuse the SHA already in the repo if one exists. Otherwise look up the latest tag:

  ```sh
  gh api repos/{owner}/{repo}/tags --jq '.[0:10] | .[] | {name, sha: .commit.sha}'
  ```

- When using `actions/checkout`, pass `persist-credentials: false` unless the job actually needs to push or call the GitHub API as the checkout token.

## Installing CLIs from npm

- Use pnpm, not npm. Add the CLI to `devDependencies` (root `package.json` for CI-only tooling).
- Use `pnpm add -D` over directly modifying `package.json`. Let pnpm figure out the latest version number.
- `pnpm dlx` does not pin transitive deps; don't rely on it.
- Bootstrap pnpm via corepack so it picks up `packageManager` from the root `package.json`.

## Downloading binaries (e.g. GitHub Releases)

- Hardcode the expected sha256 and validate before `chmod +x`.
- Prefer official GitHub Releases assets over raw URLs.
- Choose stable URLs. Use the `gh` CLI or GitHub API as needed to find releases.
- Use `curl --retry 3` (or equivalent) so transient failures don't fail the workflow.

## Script injection

`${{ ... }}` is interpolated into the script before bash runs, so untrusted values (PR title, branch name, issue body) can break out and execute. Route them through an env var and quote on use:

```yaml
- name: Check PR title
  env:
    TITLE: ${{ github.event.pull_request.title }}
  run: |
    set -euo pipefail
    case "$TITLE" in
      octocat*) echo "starts with octocat" ;;
      *) exit 1 ;;
    esac
```

- Start multi-line `run:` blocks with `set -euo pipefail`.
- Quote every `"$VAR"`.
- Never `echo`/`printf` a secret. Use `::add-mask::` for dynamic secrets.
- The same risk applies to `bash -c`, `sh -c`, and `child_process` invocations that build command strings.
