# Rig discovery: generate this project's `instant-nav.rig.md`

The skill's principles are environment-independent. Your build, deploy, auth,
and test infrastructure are not. This phase converts the principles into THIS
project's concrete workflow: run discovery once per repo, write the answers to
a committed `instant-nav.rig.md` (repo root, or next to your e2e config), and
every later run reads that file instead of rediscovering.

The skill is deliberately opinionated about **what** the rig must provide, and
deliberately unopinionated about **how** your stack provides it.

## How to discover

Inspect before asking. Most answers are already in the repo:

- `package.json` scripts (`build`, `start`, `test:e2e`)
- the e2e config (`playwright.config.*`: `baseURL`, `webServer`, projects)
- CI config (`.github/workflows/`, `vercel.json`, GitLab/Circle files,
  Dockerfiles)
- `next.config.*` (existing `experimental` flags)
- existing e2e auth helpers (grep for `login`, `storageState`, `session`)

Ask the user only what the repo can't answer. Typically that means: which
deploy target counts as "preview", which account the suite runs as in CI, and
whether an agent is allowed to push and wait on CI unattended.

## The six questions (all must have answers), plus two derived fields

The six questions below must all have answers. The rig file template adds two
more fields the discovery feeds rather than asks directly: **LIVENESS** (the
SHA-echoing probe, derived from the LOOP answer) and **WALLS** (project-specific
build/run obstacles, accumulated as you first hit them).

1. **BUILD**: how is a production build of this app produced and served?
   A per-push preview deploy, a staging container, or bare
   `next build && next start`. Anything but `next dev`.
2. **EXPOSE**: what condition turns on
   `experimental.exposeTestingApiInProductionBuild` for every measured build,
   and never for real production? Spellings: an explicit
   `EXPOSE_TESTING_API=1` for local production builds; `process.env.DEPLOY_ENV
=== 'staging'` for a generic CI/staging env var; `process.env.VERCEL_ENV ===
'preview'` on Vercel.
3. **RUN**: how is the Playwright suite invoked, and against which
   `BASE_URL`?
4. **TEST USER**: which account does the suite run as, and how does login
   happen (helper, `storageState`, API token)? What flags / plan / role / data
   does that account have?
5. **DRIFT**: enumerate everything that can differ between the author's own
   session and the test user's environment (feature flags, plans and
   entitlements, roles, seeded vs empty data, locale, A/B buckets). Every item
   is a way a RED can become untrustworthy; this list feeds the C-gate
   (`reference/red-test-robustness.md`).
6. **LOOP**: the unattended iteration for your rig. Push → build → e2e
   against the artifact → read the failure → fix → push (CI), or build → start
   → e2e (local). Note anything an agent cannot do alone (deploy approvals,
   secrets, protected branches). Include the **liveness probe**: the endpoint
   or response header that echoes the deployed commit SHA (e.g. a `/healthz`
   route or an `x-deployed-sha` header), so a CI run can confirm the build
   under test matches `HEAD` before trusting a verdict (SKILL.md phase A). If
   the platform exposes no SHA-echoing endpoint or header, add one: surface a
   build-time commit var (`VERCEL_GIT_COMMIT_SHA`, a CI commit variable) on a
   `/healthz` route or a response header, or fall back to polling the deploy
   platform's API for the deployment whose `commitSha === HEAD`. Record the
   chosen mechanism. For a local `build && start` rig the artifact is the one
   freshly built, so no probe is needed.

## The file: copy, fill, commit as `instant-nav.rig.md`

```md
# instant-nav rig: <project>

- BUILD: <command / platform that produces the measured production build>
- EXPOSE: <the condition wired to exposeTestingApiInProductionBuild>
- RUN: <e2e command> against <how BASE_URL is obtained>
- TEST USER: <account> via <login mechanism>; flags/plan/role/data: <...>
- DRIFT: <the enumerated drift surface>
- LOOP: <push → CI → e2e, or local build → start → test>; agent limits: <...>
- LIVENESS: <endpoint/header echoing the deployed SHA; n/a for local build && start>
- WALLS: <project-specific build/run obstacles + their workarounds>
```

Real apps rarely build for production cleanly on the first attempt: missing
secrets, server-only imports that fail prerender, ports held by respawning
servers. Record each wall and its workaround the first time you hit it. `WALLS`
accumulates the project-specific build/run obstacles that the other fields
cannot capture.

## Filled examples

**No CI / local-only.** BUILD: `EXPOSE_TESTING_API=1 next build && next
start`. EXPOSE: that env var. RUN: `BASE_URL=http://localhost:3000 playwright
test`. LOOP: build → start → test on one machine; fully agent-drivable, with
nothing to push, no secrets, and no deploy wait.

**Generic CI + container.** BUILD: the pipeline builds an image and deploys it
to a staging namespace. EXPOSE: `process.env.DEPLOY_ENV === 'staging'`. RUN: a
CI job runs Playwright against the staging URL. LOOP: push → pipeline → e2e;
fully agent-drivable once the pipeline is wired.

**Vercel preview deploys.** BUILD: every push builds a preview. EXPOSE:
`process.env.VERCEL_ENV === 'preview'`. RUN: `playwright test` with
`BASE_URL=<preview URL>`. LOOP: push → preview → e2e; fully agent-drivable
once the preview deploy and `VERCEL_ENV` gating are in place.
