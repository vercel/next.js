# Next.js agent upgrade action

Runs `next upgrade --agent` unattended with Claude Code or Codex. If the agent commits a verified upgrade, the action opens a draft pull request for it.

The easiest way to set this up is to run `next upgrade --ci` in your app. It asks a few questions, then has your local coding agent write the workflow.

## Usage

```yaml
name: Upgrade Next.js
on:
  schedule:
    - cron: '0 9 * * 1'
  workflow_dispatch:
permissions:
  contents: write
  pull-requests: write
concurrency:
  group: next-upgrade
  cancel-in-progress: false
jobs:
  upgrade:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: vercel/next.js/packages/next-upgrade/action@<commit SHA> # v<version>
        with:
          agent: claude
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          policy: security
```

Pin the action to the full commit SHA of a Next.js release tag.

## Setup

1. Add the API key as a repository secret. Use `ANTHROPIC_API_KEY` for Claude Code or `OPENAI_API_KEY` for Codex.
2. Enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**.

## Inputs

| Input          | Required | Default                 | Description                                                 |
| -------------- | -------- | ----------------------- | ----------------------------------------------------------- |
| `agent`        | Yes      |                         | `claude` or `codex`                                         |
| `api-key`      | Yes      |                         | The Anthropic or OpenAI API key                             |
| `policy`       | No       | `security`              | `security`, `latest`, or `experimental-future`              |
| `directory`    | No       | `.`                     | The app directory relative to the repository root           |
| `model`        | No       | Agent default           | The agent model                                             |
| `effort`       | No       | Model default           | The reasoning effort                                        |
| `next-version` | No       | `canary`                | The Next.js CLI version that runs the upgrade               |
| `node-version` | No       | `lts/*`                 | The Node.js version                                         |
| `github-token` | No       | `${{ github.token }}`   | The token used to push and open the draft pull request      |

## How it works

1. The action installs the app's dependencies with the package manager matching its lockfile, then installs the agent CLI.
2. The agent runs `next upgrade <directory> --agent=<policy>` and follows the printed instructions. It commits verified work on a local `next-upgrade/v1/<scope>/…` branch, leaves that branch checked out with no uncommitted changes, and writes a result file. The scope identifies the repository, source branch and app directory.
3. The action checks that the committed branch contains the starting commit and changes files. It checks same-repository Action pull requests for the intended app and base, and skips delivery only when the committed files match the verified result. Otherwise it pushes the branch and opens a draft pull request against the source branch checked out by the workflow.

The job fails if the upgrade can't be completed and verified. It passes when no upgrade is needed or an equivalent pull request is already open.

Use a branch checkout for `workflow_dispatch`; tag and ambiguous checkouts are rejected before the agent runs. If PR creation fails after a successful push, rerunning can reuse the owned remote branch when its committed files match and it contains the source commit. Different remote content or incompatible history is refused without overwriting it.

The agent performs app verification. The Action checks publication state, but does not independently build or test the app. Duplicate PR checks run after the agent, so a repeat run still starts an agent session.

## Security

- Only run this action on trusted triggers such as `schedule` and `workflow_dispatch`. Never run it on `pull_request_target`, `issue_comment`, or other events that carry untrusted input.
- The agent never receives the GitHub token or the workflow command files (`GITHUB_ENV`, `GITHUB_PATH`, and so on). The action removes checkout credentials from the local Git config before the agent starts, and `persist-credentials: false` is still recommended. The token is used only after the agent has exited. Every Git command in that step runs with hooks and fsmonitor disabled, and the push is refused if the agent changed the Git config.
- Neither agent runs in an OS sandbox. Claude Code uses `bypassPermissions`, and Codex uses `--dangerously-bypass-approvals-and-sandbox`, because unattended CI runs use the ephemeral runner as the isolation boundary instead of an agent sandbox. The ephemeral runner is the isolation boundary. The agent runs as the same runner user as the later steps, so these measures reduce exposure but don't isolate a hostile agent. It can read its own API key and anything else available on the runner, so use a key dedicated to this workflow.

## Telemetry

The action reports anonymous Next.js telemetry when a run starts and when it finishes. This includes the agent, the policy and the outcome, joined to the upgrade's own events by a random run ID. Reporting is best effort and never changes the job result. To opt out, set `NEXT_TELEMETRY_DISABLED: 1` in the workflow `env`.
