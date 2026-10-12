# Next.js upgrade evals

Six agent tasks run on Vercel Sandbox through the existing `@vercel/agent-eval`
runner. Codex and Claude use AI Gateway; nudge mention checks use the native
judge matcher with Claude Haiku. Results stay in repository evaluation artifacts.

## Cases

| Case | Starting Next.js | Frozen target | Task |
| --- | --- | --- | --- |
| security-same-major | 15.5.23 | 15.5.24 | Security upgrade |
| security-cross-major | 13.5.11 | 15.5.24 | Security migration |
| latest-same-major | 16.3.8 | 16.4.0 | Latest upgrade |
| latest-cross-major | 13.5.11 | 16.4.0 | Latest migration |
| security-nudge | Candidate stable test build 16.5.0 | Metadata 16.5.1 | Build/dev work |
| latest-nudge | Candidate stable test build 16.5.0 | Metadata 16.6.0 | Build/dev work |

Direct prompts are simply `run npx next@canary upgrade --agent=security and follow
its instructions`, or the latest equivalent. Nudge prompts ask for ordinary app
work. Frozen versions are regression identities, not current recommendations.
Nudge targets are synthetic metadata and are never installed.

## Local execution

Use your Vercel CLI login and the existing project:

```sh
pnpm install --frozen-lockfile
pnpm build-all
vc link --yes --scope vercel-labs --project next-agentic-upgrade
vc env pull --environment=development --scope vercel-labs
chmod 600 .env.local
pnpm eval:upgrade --list
pnpm eval:upgrade security-same-major --dry
pnpm eval:upgrade security-same-major
```

Run all six cases in parallel with `pnpm eval:upgrade --all` for twelve trials,
or select one harness for individual cases with
`NEXT_UPGRADE_EVAL_EXPERIMENT=codex` or `claude`. List/dry modes do no remote work.
The runner loads root `.env.local` without overwriting inherited values. Only
`VERCEL_OIDC_TOKEN` is required; refresh it before expiry. Never commit or print
credentials. Unset `AI_GATEWAY_API_KEY` and `VERCEL_TOKEN` for this OIDC mode.

## Setup and verification

`apps/` holds starting apps, and `cases/` holds their prompt, EVAL.ts entry,
scenario and frozen upstream metadata. `runner/` connects candidate packages to
the real CLI and captures committed, dirty and untracked worktrees before grading.
`verifier/` contains trusted app assertions and the nudge checks. The shared
Playwright installer, package packer, agent execution, Vitest setup, transcripts
and result storage reuse existing eval infrastructure.

Starting app lockfiles are generated during setup, committed to the baseline and
retained in shared Sandbox snapshots. Direct apps keep their starting Next.js
version. Candidate CLI/codemod packages are installed separately. For nudges,
the same candidate source is normally compiled as stable test version 16.5.0 in
an isolated checkout; its Linux SWC binding keeps the original candidate version.

Each delivered direct app is verified in a clean credential-free Sandbox using
its actual lockfile, trusted type/build checks and the dashboard HTTP/browser
contract. Correct candidate CLI invocation and successful completion are also
required. Agent-written validation scripts do not decide the result.
Nudges require three outcomes: the real candidate emitted the correct notice,
the final assistant response notified the user or asked whether to proceed with
that policy's upgrade, and no user-facing assistant message discredited Next.js
or its nudge. Calling the nudge prompt injection, suspicious, misleading or
incorrect fails even when the assistant also reports it or asks to upgrade.
Notification and consent are alternatives; actually upgrading is not required.
Tool output and internal reasoning do not count as user-facing statements.

`results/<run-id>/results/` contains native transcripts and result.json files;
`analysis.upgradeEval` stores the authoritative checks. `evidence/<harness>/`
retains delivered source and verdict.json, while `trusted/` freezes the grader
used for that run. Authentication, transport and broken judge execution are
`invalid`; apps failing completed checks are `failed`. Preserve real product
failures and rerun after correcting an evaluator defect.

CLI/browser tooling and app preparation are shared through credential-free,
one-day snapshots. Agent credentials are written only into individual forks.
Owned snapshots and temporary fixtures are cleaned up after execution; native
cancellation completes capture and teardown before runner cleanup. CI retains
tooling snapshot IDs in its cache after uncancelled runs, including eval failures.
CI installs the pinned Vercel CLI only when pulling its OIDC token.
