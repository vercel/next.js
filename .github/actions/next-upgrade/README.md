# Scheduled Next.js upgrades

`next upgrade --ci` opens a setup draft containing the weekly and manual caller workflow. Setup resolves the `vercel/next.js` release tag that matches the installed `next` version, reads the template and the reusable workflow at that commit, and pins the caller to its full SHA. Every job checks out only these workflow scripts at the same SHA. Preparation installs the published `next` package of exactly the version in `packages/next/package.json` from npm, and publication runs only the script dependencies locked in `package-lock.json`. Consumer runs never install or build the monorepo.

The caller passes `targets` as JSON containing repository-relative app paths and their `security` or `latest` policies. Include any approved supporting package paths in `supporting-paths`. When apps share a pnpm catalog entry, approve every affected app and supporting package together.

Choose `agent-auth` from `codex-ai-gateway-api-key` (Codex) or `claude-ai-gateway-api-key` (Claude Code). Both use a Vercel AI Gateway API key, registered as the GitHub Actions secret `NEXT_UPGRADE_AGENT_API_KEY`. Only preparation receives the key, and the agent never does: it runs as a separate user without sudo and reaches the Gateway through a local proxy that adds the key. The hosted agent uses the model its pinned CLI marks as default with the default effort, the same choice `next upgrade --agent` offers first. Preparation runs with read-only repository permissions.

Publication uses the optional `publish-token` secret, passed from `NEXT_UPGRADE_PUBLISH_TOKEN`: a fine-grained personal access token with `contents` and `pull-requests` write access. GitHub App installation tokens expire after an hour, so they do not work as a stored secret. Without it, publication uses `GITHUB_TOKEN`, and GitHub does not start the repository's pull request workflows on the draft until someone closes and reopens it or pushes a commit to it. The caller must allow the reusable workflow to request `contents: write` and `pull-requests: write`, and the repository must allow GitHub Actions to create pull requests.

Preparation uses the pinned Next.js CLI to assess locked versions and to prepare the prompt for each actual upgrade. It checks the changed files and verifies the result against a frozen install. Publication validates each patch independently in a fresh job and opens or reuses one draft per app or catalog group. When a selected group has an unapproved member or incompatible targets, the workflow reports it as blocked. To opt out of Next.js telemetry, set `telemetry-disabled: true` in the caller's workflow inputs. Setup sets it when the environment or the `.env` files where setup runs already opt out.

Regular verification uses the independent pnpm workspace fixture, real local Git, and a mock GitHub API. Run:

```bash
pnpm exec jest --runInBand test/unit/next-upgrade-action.test.ts
pnpm test-dev-turbo test/e2e/agent-upgrade-ci/agent-upgrade-ci.test.ts
```
