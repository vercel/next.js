# Production `instant()` rig

The preservation suite needs a production build that exposes the Next.js
testing API, a stable URL for that build, and a Playwright command that can
drive the audited Links. Discover this setup once, record it in
`instant-nav.rig.md`, and reuse it throughout adoption.

Read an existing `instant-nav.rig.md` before creating one. Inspect the
repository before asking the user:

- `package.json` scripts for build, start, and end-to-end tests
- `playwright.config.*` for `baseURL`, `webServer`, projects, and authentication
- `next.config.*` for existing `experimental` options
- CI, preview deployment, container, and hosting configuration
- test helpers for login, `storageState`, fixtures, flags, and seeded data

Ask only for details the repository cannot answer, such as unavailable
credentials or which remote environment may expose the testing API.

## What the rig must define

### Production build and server

Use `next build` followed by `next start`, or a remote artifact produced by the
same production build. Automatic prefetching does not run in `next dev`, so a
development server cannot verify preservation.

Record separate build and start commands. For a local rig, record the port,
stop any previous server before starting, fail on `EADDRINUSE`, and confirm the
new process owns the port before running Playwright. `next start` can fork a
`next-server` child, so the launcher process ID may not own the port. Start the
server in a process group that the rig can stop as a unit, or discover and stop
the process listening on the recorded port before the next build.

### Testing API

An `instant()` test against a production build requires
`experimental.exposeTestingApiInProductionBuild`. Gate it so real production
builds do not expose the API:

```ts filename="next.config.ts" highlight={3,8-10}
import type { NextConfig } from 'next'

const exposeTestingApi = process.env.EXPOSE_TESTING_API === '1'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    exposeTestingApiInProductionBuild: exposeTestingApi,
  },
}

export default nextConfig
```

Merge the option into an existing `experimental` object instead of replacing
the project's other experimental options.

Set the condition while running `next build`. Setting it only for `next start`
is too late because the testing API is compiled into the production artifact.
When the artifact was built without it, Next.js does not activate the
navigation lock, so the test cannot distinguish prefetched UI from streamed
dynamic content. Rebuild with the condition enabled before interpreting the
results. Use the project's existing environment naming when it already
distinguishes test, staging, preview, and production builds.

### Test command and base URL

Record the exact Playwright command and how it receives the measured build's
URL. Reuse the project's package manager, Playwright configuration, projects,
and reporters. The suite must import `instant()` from `@next/playwright`. If
the dependencies are absent, install `@next/playwright` on the same release
line as the project's `next`, alongside `@playwright/test`.

For a local rig, a typical sequence is:

```bash filename="Terminal"
EXPOSE_TESTING_API=1 pnpm build
pnpm start --port 3000
BASE_URL=http://localhost:3000 pnpm playwright test tests/prefetch-preservation.spec.ts
```

Adapt the script names and port to the project. Keep the production server
running while the test command executes. Follow the public
[client-navigation test](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests): load the source route, confirm the real
Link is visible, then enter `instant()`, click, wait for the destination URL,
and assert the prefetched UI.

### Test context

Record the state required to reach the audited Links and destination UI:

- Use `public; no authentication` when the navigation is public.
- Otherwise record the test account and login mechanism, including a fixture,
  `storageState`, API login, or seeded session.
- Record flags, plan, role, locale, seeded data, and other state that can change
  which UI the test sees.

A test user is not required. The field exists to make authenticated and
state-dependent tests reproducible when the app needs one.

### Drift

List differences between the state used to choose the preservation target and
the state used by Playwright. Feature flags, permissions, empty test data, and
locale differences can make an assertion fail because the target is
unreachable, not because Partial Prefetching removed it. Write `none known`
only after checking the test context.

### Iteration loop

Record the complete loop the agent can repeat without rediscovering commands:

- Local: build with the testing API, start the new artifact, run the focused
  suite, stop the server, edit, and repeat.
- Remote: push, wait for the measured artifact, verify it matches `HEAD`, run
  the focused suite against its URL, edit, and repeat.

Note any step the agent cannot perform without the user, including deployment
approval, protected branches, secrets, or multi-factor authentication.

### Artifact liveness

For a remote rig, record how the test proves the deployment matches `HEAD`.
Prefer an endpoint or response header that exposes the deployed commit SHA. If
the app has neither, use the deployment provider's API to select the artifact
whose commit SHA matches `HEAD`.

A freshly completed local `build` followed by `start` does not need a SHA
probe. Record `n/a; local build and start`.

### Walls

Record build and run obstacles with their working resolution, such as required
environment variables, server-only imports that fail during prerendering,
unavailable credentials, or a process that keeps reclaiming the test port.
Reuse these notes on the next iteration.

## Write `instant-nav.rig.md`

Place this file at the repository root or next to the end-to-end configuration:

```md
# instant-nav rig: <project>

- BUILD: <commands or platform that builds and serves the measured production artifact>
- EXPOSE: <condition that enables exposeTestingApiInProductionBuild during build>
- RUN: <focused Playwright command and how it receives BASE_URL>
- TEST USER: <public/no auth, or account and login>; state: <flags, role, data, locale>
- DRIFT: <differences that could change the asserted UI>
- LOOP: <local build → start → test, or push → deploy → test>; agent limits: <...>
- LIVENESS: <deployed SHA check, or n/a for a local build and start>
- WALLS: <project-specific obstacles and their resolutions>
```

Every field needs a concrete value. `n/a` is valid only with a reason, such as
`TEST USER: public; no authentication` or `LIVENESS: n/a; local build and
start`.

## Check the rig before writing the baseline

Before recording the legacy prefetched UI:

1. Build with the testing API condition enabled.
2. Start or locate that exact artifact and confirm the base URL responds.
3. Run one focused `instant()` smoke test through a real `<Link>` navigation.
4. Confirm the test can reach its source Link and eventual destination UI in
   the recorded test context.

Fix the rig before interpreting a preservation failure. A missing testing API,
stale deployment, unreachable target, or wrong test state is an environment
failure rather than evidence that the migration changed the prefetch.
