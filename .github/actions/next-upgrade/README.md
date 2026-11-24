# Scheduled Next.js upgrades

The caller workflow from `workflow.template.yml` runs weekly and manually. The installer resolves the `vercel/next.js` release tag that matches the installed `next` version, reads the template and the reusable workflow at that commit, and pins the caller to its full SHA. Every job checks out only these workflow scripts at the same SHA. Preparation installs the published `next` package of exactly the version in `packages/next/package.json` from npm, and publication runs only the script dependencies locked in `package-lock.json`. Consumer runs never install or build the monorepo.

The caller passes `targets` as JSON containing repository-relative app paths and their `security` or `latest` policies. Include any approved supporting package paths in `supporting-paths`. When apps share a pnpm catalog entry, approve every affected app and supporting package together.

Choose `agent-auth` from `codex-ai-gateway-api-key` (Codex) or `claude-ai-gateway-api-key` (Claude Code). Both use a Vercel AI Gateway API key, registered as the GitHub Actions secret `NEXT_UPGRADE_AGENT_API_KEY`. Only preparation receives the key, and the agent never does: it runs as a separate user without sudo and reaches the Gateway through a local proxy that adds the key. The hosted agent uses the model its pinned CLI marks as default with the default effort, the same choice `next upgrade --agent` offers first. Preparation runs with read-only repository permissions.

Publication requires the `publish-token` secret, passed from `NEXT_UPGRADE_PUBLISH_TOKEN`: a fine-grained personal access token with `contents`, `pull-requests`, and `workflows` write access. GitHub App installation tokens expire after an hour, so they do not work as a stored secret. A run without the token stops before preparation. The job token only reads, so the caller grants `contents: read`.

An upgrade draft also moves the caller workflow to the release it upgrades to, by replacing the pinned SHA with the commit of that release tag. When apps upgrade to different versions, only drafts for the newest version move it. The pin stays, and the run log says why, when the target is not newer than the pinned release, when the release cannot be read or has no scheduled upgrade workflow, when the caller does not use the pinned SHA exactly once on a line that ends with it, or when the release changed the workflow template. In the last case the draft explains how to reinstall: delete the caller workflow and run `next upgrade --ci` again, because setup leaves an installed workflow alone. A group that already has an open draft keeps that draft unchanged.

Preparation uses the pinned Next.js CLI to assess locked versions and to prepare the prompt for each actual upgrade. It checks the changed files and verifies the result against a frozen install. Publication validates each patch independently in a fresh job, rejects any agent change under `.github`, and opens or reuses one draft per app or catalog group. When a selected group has an unapproved member or incompatible targets, the workflow reports it as blocked. To opt out of Next.js telemetry, set `telemetry-disabled: true` in the caller's workflow inputs.

Regular verification uses the independent pnpm workspace fixture, real local Git, and a mock GitHub API. Run:

```bash
pnpm exec jest --runInBand test/unit/next-upgrade-action.test.ts
```
