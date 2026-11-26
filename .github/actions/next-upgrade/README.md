# Scheduled Next.js upgrades

The reusable workflow `.github/workflows/next-upgrade.yml` upgrades one app on a schedule or when it is run by hand. Every job checks out only these workflow scripts at the workflow's own commit, and the prepare and upgrade jobs install the published `next` package of exactly the version in `packages/next/package.json` from npm. Consumer runs never install or build the monorepo.

The caller passes the repository-relative `app-path` and the `security` or `latest` `policy`. This version supports one app that uses npm, with a `package-lock.json` next to its `package.json`.

Choose `agent-auth` from `codex-openai-api-key` (Codex with an OpenAI API key) or `claude-anthropic-api-key` (Claude Code with an Anthropic API key). The credential is registered as the GitHub Actions secret `NEXT_UPGRADE_AGENT_CREDENTIAL`. Only the upgrade job receives it, and the agent runs as a separate user without sudo. The upgrade job checks the API key by listing the provider's models, which uses no tokens, then keeps it: the agent reaches the provider API through a local proxy that adds the key, so the agent only holds a placeholder. Both jobs run with read-only repository permissions. The hosted agent uses the `model` and `effort` inputs; empty values use the same defaults as `next upgrade --agent`.

The prepare job decides whether the app needs an upgrade, before the agent or its credential are set up. It installs the app's dependencies with scripts off, then runs the pinned `next upgrade --agent=<policy>` in scheduled mode, which assesses the app. When the app is up to date or the policy blocks the upgrade, the run ends there. Otherwise the upgrade job checks out the same commit, assesses the app again so the CLI writes the same guides and prompt as a local `next upgrade --agent`, and has the agent upgrade and verify the app in an isolated checkout. It packages the agent's changes as a patch from a runner-owned snapshot. It rejects an empty change, changes under `.github` or `.gitmodules`, symlinks, submodules, new executable files or other mode changes, setuid or setgid files, and patches that contain the agent credential. After the agent starts, this process runs Git and sudo from `/usr/bin` with a fixed `PATH` and no Git templates, because the agent user can write to parts of the hosted runner image. The workflow uploads the patch and its index as the `next-upgrade-candidates` artifact. A failed assessment fails the prepare job, and a failed agent run or rejected change fails the upgrade job, so each failure shows on the step where it happened.

The workflow stays on its pinned release. When a newer major version is available, the run reports it as blocked until the pin moves to a release of that major. To opt out of Next.js telemetry, set `telemetry-disabled: true` in the caller's workflow inputs.

Regular verification uses the npm single-app fixture, real local Git, and a stand-in agent. Run:

```bash
pnpm exec jest --runInBand test/unit/next-upgrade-hosted-agent.test.ts test/unit/next-upgrade-action.test.ts
```
