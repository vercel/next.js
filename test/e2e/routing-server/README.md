# Server-router regression gate

`pnpm test-routing` runs the e2e tests that check the server router's observable HTTP and browser behavior. The suite passes on today's server, so after you change the server, any failure is a regression.

## Run the suite

```bash
pnpm test-routing
```

The command runs every file that [`test/routing-tests-manifest.json`](../../routing-tests-manifest.json) selects through `run-tests.js`, first with `next build` and `next start`, then with `next dev`, using Turbopack. Each run sets the same environment variables as the matching CI job. Bootstrap and build the repository first, as for any e2e run.

Use Node.js 24.21 or later, for example with `fnm exec --using=24 pnpm test-routing`. The repository's `.node-version` selects Node.js 20, which lacks a [`realpath` fix](https://github.com/nodejs/node/pull/65113). Without it, a dev server can load React twice through a fixture's pnpm symlinks, and then every test in that file fails with `Invalid hook call` after a two-minute timeout. The command prints a warning on older versions.

| Option                                     | What it does                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `--mode=start`, `--mode=dev`               | Runs one mode instead of start, then dev.                                                 |
| `--bundler=webpack`, `--bundler=rspack`    | Uses another bundler instead of Turbopack. Rspack also applies the Rspack test manifests. |
| A path such as `test/e2e/routing-server`   | Runs only the manifest files under that path.                                             |
| `--list`                                   | Prints the files each mode would run, then exits.                                         |
| Anything else, such as `-c 2` or `--debug` | Passed to `run-tests.js`. Concurrency defaults to 4 files at a time.                      |

`run-tests.js` retries a failing file twice. Before each retry, it resets the file's directory with `git clean -fdx` and `git checkout`, which deletes untracked files and unstaged edits there. When a selected test directory has either, `pnpm test-routing` passes `--retries 0` and prints a note. Stage your test changes to keep retries on.

### How long a run takes

Measured on 2026-11-02 on an Apple Silicon Mac (15 cores, 48 GB) with Node.js 24.22.2, at the default concurrency of 4. Each time covers the whole mode, including the shared Next.js install that `run-tests.js` creates first.

| Mode  | Files | Turbopack | webpack  |
| ----- | ----- | --------- | -------- |
| start | 86    | 11.3 min  | 14.1 min |
| dev   | 80    | 10.7 min  | 15.4 min |

Times vary with other load on the machine, and a retried file adds its run time again. Before the last seven suites joined the selection, three passing runs took 9.9–11.7 min (start) and 9.2–9.8 min (dev) with Turbopack, and 12.4–15.5 min and 9.8–10.6 min with webpack.

## What the suite selects

- Every `*.test.ts` under `test/e2e/routing-server/`, by glob. These fixtures check routing and HTTP behavior directly: payloads and body limits, headers and cookies, streaming, compression, listener lifecycle, route selection, routing phase order, Proxy, internationalized routing, RSC requests, caching, Draft Mode and image endpoints.
- Existing suites that mostly test server routing, listed by path. They cover basePath, trailing slashes, custom routes, dynamic routes, Proxy matchers, redirects and rewrites, the rewritten-path headers on RSC requests, i18n, parallel and intercepted routes, multi-zone, WebSocket upgrades, forwarded host headers, Server Action dispatch and graceful shutdown.

Files under `test/e2e` run in every mode, `test/production` files only in start mode, and `test/development` files only in dev mode. That's the same split as `run-tests.js --type`.

The manifest selects whole files and never test names, so renaming a test can't drop it from the gate. An entry that matches no file fails the command, so renaming or moving a file can't drop it either. Behavior that only the client router implements, such as shallow routing or Pages router events, is out of scope.

## What a test asserts

A test asserts what the server does today. A test that asserts documented behavior the server doesn't have yet runs behind a `@gate` pragma, with a `TODO` that explains the failure and how it contradicts the docs, and links them. While the gated test fails, the suite stays green and logs `gated test failed as expected`. Once it passes, the suite fails until someone deletes the pragma, so a fix updates its test in the same PR, like any other deliberate behavior change.

Any other test that fails on today's server is fixed, not gated. A `@force-gate` pragma that skips a test where it can't apply, such as `@force-gate !dev` on a production-only case, is fine. `it.failing` and `it.skip` don't belong in the gate.

## Known gaps on today's router

| Test                                                                                               | Pragma                 | Fails in                           | Kind                                                                                     | Docs                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `docs-http-contract` › immutable hashed assets override configured cache headers                   | `!start`               | `next start` (dev doesn't run it)  | Contradicts the docs                                                                     | [headers: Cache-Control](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers#cache-control)                     |
| `docs-handler-cache` › caches an opted-in GET at /cached in production                             | `dev`                  | `next start` and deployments       | Contradicts the docs                                                                     | [Route Handlers: Caching](https://nextjs.org/docs/app/getting-started/route-handlers#caching)                                       |
| `docs-router-contract` › applies Pages config redirects on client navigation with a matching Proxy | `FIXME`                | start and dev                      | Contradicts the docs                                                                     | [redirects.mdx](../../../docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.mdx) (no section anchor)                |
| `docs-route-selection` › serves the advertised image through images.path                           | `FIXME`                | start and dev                      | Contradicts the docs                                                                     | [Image: path](https://nextjs.org/docs/app/api-reference/components/image#path)                                                      |
| `route-definition-conflicts` › rejects a page and Route Handler at the same URL                    | `!(webpack && dev)`    | webpack dev                        | Bundler inconsistency: webpack dev prints no conflict message, and the docs promise none | [Route Handlers: Convention](https://nextjs.org/docs/app/getting-started/route-handlers#convention)                                 |
| `docs-route-selection` › keeps the reserved Pages error route inaccessible                         | `!(deploy && adapter)` | Deployments built with the adapter | Contradicts the docs                                                                     | [Custom Errors: Caveats](https://nextjs.org/docs/pages/building-your-application/routing/custom-error#caveats)                      |
| `rsc-contract` › runs Proxy without a matcher on image optimization                                | `!deploy`              | Deployments                        | Contradicts the docs                                                                     | [Proxy: Matcher](https://nextjs.org/docs/app/api-reference/file-conventions/proxy#matcher)                                          |
| `proxy-normalization-config` › shows Proxy the data URL as sent                                    | `!deploy`              | Deployments                        | Contradicts the docs                                                                     | [skipProxyUrlNormalize: Reference](https://nextjs.org/docs/app/api-reference/config/next-config-js/skipProxyUrlNormalize#reference) |

The start and dev conditions were checked locally with Turbopack and webpack. The deploy conditions come from the CI jobs that run new tests against Vercel deployments, since `pnpm test-routing` doesn't deploy. None was checked with Rspack.

## Add a test

1. Put the case in the closest fixture under `http/` (wire-level behavior) or `router/` (route selection and dispatch). For a new fixture, generate it with `pnpm new-test --args true <name> e2e` and move the directory here. New files under `test/e2e/routing-server/` join the gate automatically.
2. To add an existing suite, add its path to `rules.include` in `test/routing-tests-manifest.json`. Add a file only when most of it tests server routing. When a routing check sits inside a large suite about something else, move the check into a routing fixture instead.
3. Assert on what a client observes: the status, headers and body, or what the browser shows. Prefer that over reading `next.cliOutput`, `.next` build output or server internals, which a reimplementation can change without changing what clients see.
4. If the test asserts documented behavior that today's server doesn't have, write a `// TODO:` that explains the failure, says how it contradicts the docs and links the docs section. Then put `// @gate <condition>` on the line right above the `it(`, using the condition under which the test passes, such as `!start`, or `FIXME` when it fails everywhere. Add a row to the table above. [`.agents/skills/gate-tests/SKILL.md`](../../../.agents/skills/gate-tests/SKILL.md) covers the pragma rules.
5. Run `pnpm test-routing <path to the test>`. It has to pass in both modes on today's server.
