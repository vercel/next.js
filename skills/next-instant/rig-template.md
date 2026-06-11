# Rig discovery — generate this project's `next-instant.rig.md`

The skill's principles are environment-independent. Your build, deploy, auth,
and test infrastructure are not. This phase converts the principles into THIS
project's concrete workflow: run discovery once per repo, write the answers to
a committed `next-instant.rig.md` (repo root, or next to your e2e config), and
every later next-instant run reads that file instead of rediscovering.

The skill is deliberately opinionated about **what** the rig must provide, and
deliberately unopinionated about **how** your stack provides it.

## How to discover

Inspect before asking. Most answers are already in the repo:

- `package.json` scripts (`build`, `start`, `test:e2e`)
- the e2e config (`playwright.config.*` — `baseURL`, `webServer`, projects)
- CI config (`.github/workflows/`, `vercel.json`, GitLab/Circle files,
  Dockerfiles)
- `next.config.*` (existing `experimental` flags)
- existing e2e auth helpers (grep for `login`, `storageState`, `session`)

Ask the user only what the repo can't answer — typically: which deploy target
counts as "preview", which account the suite runs as in CI, and whether an
agent is allowed to push and wait on CI unattended.

## The six questions (all must have answers)

1. **BUILD** — how is a production build of this app produced and served?
   A per-push preview deploy, a staging container, or bare
   `next build && next start`. Anything but `next dev`.
2. **EXPOSE** — what condition turns on
   `experimental.exposeTestingApiInProductionBuild` for every measured build,
   and never for real production? Spellings: `process.env.VERCEL_ENV ===
'preview'` on Vercel; your CI's preview/staging env var elsewhere; an
   explicit `EXPOSE_TESTING_API=1` for local production builds.
3. **RUN** — how is the Playwright suite invoked, and against which
   `BASE_URL`?
4. **TEST USER** — which account does the suite run as, and how does login
   happen (helper, `storageState`, API token)? What flags / plan / role / data
   does that account have?
5. **DRIFT** — enumerate everything that can differ between the author's own
   session and the test user's environment: feature flags, plans and
   entitlements, roles, seeded vs empty data, locale, A/B buckets. Every item
   is a way a RED can lie; this list feeds gate C
   (`reference/red-test-robustness.md`).
6. **LOOP** — what is the unattended iteration? With CI: push → build → run
   the e2e against the artifact → read the failure → fix → push. Without CI:
   local build → start → test. Note anything an agent cannot do alone
   (deploy approvals, secrets, protected branches).

## The file — copy, fill, commit as `next-instant.rig.md`

```md
# next-instant rig — <project>

- BUILD: <command / platform that produces the measured production build>
- EXPOSE: <the condition wired to exposeTestingApiInProductionBuild>
- RUN: <e2e command> against <how BASE_URL is obtained>
- USER: <account> via <login mechanism>; flags/plan/role/data: <...>
- DRIFT: <the enumerated drift surface>
- LOOP: <push → CI → e2e, or local build → start → test>; agent limits: <...>
- WALLS: <project-specific build/run obstacles + their workarounds>
```

`WALLS` matters more than it looks. Real apps rarely build for production cleanly
outside CI — missing secrets, server-only imports that fail prerender, ports
held by respawning servers. Record each wall and its workaround the first time
you hit it; that accumulated knowledge is most of the file's value. (The app
this skill was extracted from needed a dummy JWT secret, lazy imports for two
Node-only modules, and a kill command for a respawning dev server. Yours will
differ. That's the point of the file.)

## Filled examples

**Vercel preview deploys.** BUILD: every push builds a preview. EXPOSE:
`process.env.VERCEL_ENV === 'preview'`. RUN: `playwright test` with
`BASE_URL=<preview URL>`. LOOP: push → preview → e2e — fully agent-drivable.

**Generic CI + container.** BUILD: the pipeline builds an image and deploys it
to a staging namespace. EXPOSE: `process.env.DEPLOY_ENV === 'staging'`. RUN: a
CI job runs Playwright against the staging URL. LOOP: push → pipeline → e2e.

**No CI / local-only.** BUILD: `EXPOSE_TESTING_API=1 next build && next
start`. EXPOSE: that env var. RUN: `BASE_URL=http://localhost:3000 playwright
test`. LOOP: entirely local; nothing is pushed. Slower to iterate, equally
trustworthy — the verdict comes from the production build, not the platform.
