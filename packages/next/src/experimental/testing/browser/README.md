# Browser resources for the Next-owned test runtime

These internal resource primitives do not start Playwright Test, Vitest, or Vite.
The test project supplies `playwright` and `@next/playwright`. Chromium is the
initial browser target.

The coordinator acquires `createBrowserHost({ projectDir, signal })`, passes its
`wsEndpoint` into the execution worker, and awaits `dispose()` after the worker
has exited, including after a hard kill. The WebSocket server binds to loopback.
Its endpoint is transport configuration, not a result attachment or log message.
The signal cancels acquisition only. Run cancellation must allow the driver to
finish teardown before the parent closes an acquired browser or server lease.
Playwright's SIGINT, SIGTERM, and SIGHUP handlers are disabled so the library
cannot close the browser or exit the parent ahead of that lifecycle. The current
CLI supports graceful first-signal cancellation for SIGINT and SIGTERM only;
host-level SIGHUP coverage does not expand that CLI contract.

Inside a test attempt, `createBrowserFixture` takes that endpoint, `projectDir`,
the application `baseURL`, an artifact `outputDir`, the actual runner attempt
(`signal` and `onCleanup`), and an `onAttachment` sink. It registers connection
cleanup before acquiring a fresh context. The returned `page` and `context` are
real Playwright objects. `instant(fn)` delegates to the installed
`@next/playwright` helper with the application's base URL, including on a fresh
page. The adapter accepts the runner's actual attempt object; it does not create
a collector or import a second runner instance.

The emitted `browser/index.ts` facade has no runtime imports. Its `browser()`
accessor returns one fixture promise per actual C attempt, including separate
retry attempts. B initializes it with that emitted entry's `getActiveAttempt`
and an infrastructure-owned `createFixture(attempt)` callback; the latter uses
the attempt's identity for attachment events. The callbacks stay inside the
worker, while only connection metadata crosses IPC. Disposing the binding revokes
fixture access but retains C's scope accessor solely to report originating late
calls during worker shutdown, even if the caller catches the error. No fixture
can be created through a revoked binding. C still owns asynchronous fixture
teardown. A must make the public
`next/experimental/testing/browser` import and `entry.browserTesting` resolve to
this same module.

Each context has independent cookies and browser storage. Every attempt writes
a screenshot and Playwright trace into a unique artifact directory, including
attempts that fail or are cancelled. Attachment descriptors match the reporting
contract: `name`, `kind`, absolute `path`, and `contentType`. The sink must attribute
them to the active attempt before its terminal result. Files remain available
after disposal and are not overwritten by retries. Capturing one artifact can
fail without preventing the other capture or context closure. Cleanup failures
are reported as `BrowserFixtureError`, retaining all original errors in `errors`.
The lifecycle owner must await cleanup even when the abort listener started it.

`createApplicationServer` starts a server in the actual configured
application directory. It uses B's process supervisor and a small protocol adapter
to the installed Next `start-server` entry, with development conditions,
Turbopack, and a dynamically assigned loopback port. Readiness comes from the
normal Next IPC message, after server initialization, rather than parsing logs.
The normal startup path acquires Next's configured output lock before starting
the hot reloader. A busy directory fails acquisition without stopping its owner.

The inputs are `projectDir`, `mode`, `outputLockEnabled`, `outputDir`, acquisition
`signal`, and optional `startupTimeoutMs`/`shutdownGraceMs`. The parent must pass
actual resolved-config evidence that `experimental.lockDistDir` is enabled; false
or missing evidence is rejected before spawning. A's compiler graph, watchers,
and cache handles must be shut down before acquisition, while its immutable
driver snapshot remains retained. H does not reload configuration, override
`distDir`, copy application files, or replace this compiler shutdown barrier.

The returned lease contains `baseURL`, `pid`, `lifetime: 'file'`, stdout/stderr
attachments, and idempotent `dispose()`. B bounds shutdown and reclaims ordinary
descendants, including when startup times out or the server exits unexpectedly.
Startup failures retain their log attachments in `ApplicationServerError` and
preserve distinct startup and cleanup errors. Acquired-server failures are
reported with those log attachments when disposal is awaited. Requested shutdown
accepts normal exit, Next's handled SIGTERM exit 143, or actual SIGTERM/SIGKILL
termination. Other exit codes remain failures even when cancellation was requested.
The parent must retain server and browser
leases until the driver child has closed, then dispose them even on failure.

Each file receives a fresh server process; attempts within that file intentionally
share its server modules and caches. Disk caches and external services retain
their normal application lifetime and require explicit fixtures for resetting or
namespacing data. Context isolation alone does not reset them. Production server leases require the compiler-resolved `distDir`. They run the
normal optimized Turbopack application build in an owned process and verify its
build ID and required-server-files/routes/prerender manifests before starting a
fresh production server process. The build process retains Next's normal output
lock until server disposal. The lease records manifest hashes and the actual
`exposeTestingApiInProductionBuild` value; it never enables instrumentation.
Instrumented `instant()` and ordinary uninstrumented application checks remain
separate acceptance lanes.

Development component hosts accept explicit compiler registrations through the
internal `browserFixtureHost` server option. H generates a private route prefix;
the sole live app compiler produces standalone App Pages with actual SSR/client
assets. Only registered IDs and strict JSON props cross the browser URL, under a
64 KiB serialized limit and an 8 KiB encoded URL limit. `browser().mount(id, props)` navigates the attempt's
fresh page and returns a real Playwright root locator after the wrapper's client
effect runs. This marker does not await all nested Suspense content; use normal
locator assertions for that content. The standalone fixture does not inherit
application layouts. Page errors and hydration errors remain attempt failures,
including errors observed after mount returns. Production component mounting,
browser watch, and concurrent mounts within one attempt remain unsupported.

Browser-driver snapshot updates are parent-authorized. Workers can stage external,
inline, and raw bytes, but the orchestrator does not commit them until the worker,
page/browser host, and application-server lease have all closed successfully.
Cancellation, crashes, test/cleanup failures, or failed resource disposal discard
the plan. Production browser drivers use the same ordering; production component
mounting remains unsupported.

The stage-three additions require actual compiler/server acceptance; source and
protocol tests alone do not establish the public capability.

## Validation

`test/unit/next-testing-browser-resources/browser.test.ts` launches real Chromium
against a trivial HTTP document to validate resource isolation, the actual
`instant()` cookie helper, trace capture, cancellation, artifact sink failure,
orphan connection cleanup, and adapter cleanup registration. It does not claim
Next compilation or runner integration.

The sibling `server.test.ts` uses a minimal IPC protocol fixture to verify real
parent/descendant process lifetime, cancellation, startup timeouts, crashes,
directory ownership, and unsupported-mode rejection. It exercises B's actual
supervisor, but does not stand in for the Next application oracle.

`test/e2e/app-dir/next-testing-browser/next-testing-browser.test.ts` reuses the
existing instant-navigation application as a route oracle. Run it with
`pnpm test-dev-turbo` and `pnpm test-start-turbo`. The fixture explicitly enables
the testing API for production. The framework harness owns the server in this
oracle; it is not evidence of a working `next test` browser execution lane.

`test/development/app-dir/next-testing-application-server/next-testing-application-server.test.ts`
uses the canonical reference app as read-only input to the framework's isolated
installation setup, with `skipStart: true`. H then owns the real Next server and
browser. This validates the instant shell, completed content, hydration, and
external server lock contention. Run it with `pnpm test-dev-turbo`. The suite
does not yet execute its driver through A's test compiler or B/C's runner.

The test directories were created with the repository's actual generator. The
normal `pnpm new-test` invocation failed to fetch `@turbo/gen` in this worktree;
the coordinator approved running `turbo/generators/config.ts` through installed
`node-plop` with `node --import tsx`, normal templates/actions, and the repository
as `destBasePath`. The retained suites' action results had zero failures.
