# Routing-server regression suite

Run the local production and development suite with:

```sh
pnpm test-routing
```

The command runs production first, then development, using the existing Next.js parallel test scheduler. Up to four independent suites run concurrently; each suite's tests remain sequential. The scheduler shares a dependency starter installation and browser server while each application keeps its own fixture directory, listener, build output, and browser context.

The default includes every test beneath this directory and the focused `routingTests` selections in [contracts.json](./contracts.json). Broad companion suites run only their selected routing cases: metadata endpoint delivery does not also run title/description tests, for example, and Server Action dispatch does not also test action compilation. `--full` adds the original broader feature regressions. Both profiles retain all 44 documentation capability families; the full profile adds regression depth rather than being required to include a capability family.

Tests run once per applicable mode, regardless of how many contracts reference them. A failing mode makes the command fail; it still runs the other selected mode. Retries are disabled so a failure remains visible and the scheduler never resets a developer's fixture source files. Mode and total elapsed times are printed at the end.

Bootstrap the repository and build the local JavaScript packages before running tests. Test-only edits need no watch build or rebuild when the framework output is current. The isolated harness installs fixture dependencies, starts local listeners, and uses the existing browser driver.

Use Node 24.22.1 LTS, verified with both Preview Mode and the pnpm symlink/realpath-sensitive fixtures. Node 20.20.2 intermittently loads duplicate React modules under different paths, producing invalid-hook errors or missing transitive imports in development; use a runtime containing the [realpath fix](https://github.com/nodejs/node/pull/65113). Node 26.12.1 fixes that issue but removes `buffer.SlowBuffer`, which the bundled Preview JWT dependency still requires. Preview assertions remain enabled; see [compatibility-notes.md](./compatibility-notes.md) for the runtime evidence.

## Focused runs

```sh
# Production build/start only:
pnpm test-routing-start

# Development only:
pnpm test-routing-dev

# Include the broader feature regression suites:
pnpm test-routing --full

# Limit concurrent suites (one worker gives sequential execution):
pnpm test-routing --concurrency=2

# Only Router contracts, or only HTTP contracts:
pnpm test-routing --group=router
pnpm test-routing --group=http

# Another supported bundler:
pnpm test-routing --bundler=webpack

# Only the fixtures physically located in this directory:
pnpm test-routing --core --mode=start

# Inspect selection without starting servers:
pnpm test-routing --list

# Inspect the exact scheduler/Jest commands without executing tests:
pnpm test-routing --dry

# Forward Jest options after --:
pnpm test-routing --mode=start -- --testNamePattern "documented route selection"

# Existing direct folder commands continue to work:
pnpm test-start-turbo test/e2e/routing-server/router/docs-router-contract
```

Supported modes are `all` (local start + dev), `start`, `dev` and `deploy`. Bundlers are `turbo` (default), `webpack` and `rspack`; Rspack supports local `start`/`dev` runs only. Deployment runs require the existing deployment harness configuration and credentials. The default local run does not claim deployment, every experimental flag or every bundler coverage. Existing conditional cases retain their documented gates.

The default concurrency is the smaller of four and the available CPU count. `--concurrency` accepts a positive integer. Turbopack thread pools are also bounded according to the worker count unless `TURBO_TASKS_AVAILABLE_PARALLELISM` is already set. Use fewer workers if the machine has limited memory or is busy with other builds. Jest name filters passed after `--` narrow the routing case selections; they cannot enable unrelated cases from a broad companion suite.

## Organization

- [http/](./http/) checks payloads, body limits, headers/cookies, origin admission, progressive delivery, streaming status behavior, compression and connection lifecycle.
- [router/](./router/) checks route selection, dynamic paths, custom rules, Proxy, URL handling, navigation, revalidation and request dispatch.

Each subdirectory is an independent real fixture. Whole routing-focused suites were moved here with their test files, assets, configuration and existing routing build-manifest checks. Keep those checks: they are useful build companions even though request/browser assertions supply the public runtime contract.

Broader App/Pages/Actions/image/cache suites remain in their feature directories. The manifest distinguishes focused routing assertions (`routingTests`) from the broader regression references (`tests`). A focused reference can select an entire routing-specific file, or supply a `testNamePattern` for the relevant cases in a broader file. Multiple selections of the same file are combined and executed once. This reuses assertions without including unrelated feature tests in the regular development loop. The scheduler checks selectors against Jest's registered assertions and fails if a selector matches no test names. Registered but mode-gated assertions remain visible as skips.

`--full` runs whole companion files without these case filters. `--core` deliberately excludes all companions and therefore is a narrower gate; it cannot be combined with `--full`.

Build companions for conflicting route definitions and unsupported runtime configuration also stay in their feature directories. The manifest includes these documented configuration constraints in the Router group alongside the public request assertions.

The HTTP–Router boundary is already exercised by public HTTP/browser requests. A body surviving a rewrite belongs to both H01 and R10, but needs only one fixture.

## Documentation contract

[contracts.json](./contracts.json) records the documented behavior, applicable scope, canonical documentation files and existing/new e2e files for each capability family. Each family must have focused routing references as well as full regression references. It is the case-selection index, not a generated code-coverage percentage. The runner rejects missing IDs, missing references and invalid case filters, so a renamed companion cannot silently fall out of the gate.

The documentation defines the expected public result. An existing implementation, fixture title or passing status is not a substitute for the documentation. Preserve a real failing documented assertion when it finds a framework discrepancy; do not add a skip or reverse an expectation simply to make the gate green. Record the discrepancy and fix the implementation or clarify the public contract separately.

Observed reference-server discrepancies are recorded in [compatibility-notes.md](./compatibility-notes.md). Their assertions remain active; a listed discrepancy is not a passing result.

| ID  | Capability family                                  |
| --- | -------------------------------------------------- |
| H01 | Request and response payloads                      |
| H02 | Distinct body-size limits                          |
| H03 | Statuses, headers, and cookies                     |
| H04 | Progressive response delivery                      |
| H05 | Status behavior before and after streaming         |
| H06 | Compression                                        |
| H07 | HTTP caching and validators                        |
| H08 | Server Action request admission                    |
| H09 | Dev asset and endpoint origin restrictions         |
| H10 | Listener, connection timeout, and background work  |
| R01 | Filesystem route selection                         |
| R02 | Public versus non-routable files                   |
| R03 | Dynamic and catch-all routes                       |
| R04 | URL and query information at the destination       |
| R05 | Routing phase order                                |
| R06 | Custom-route path pattern language                 |
| R07 | Conditional custom routes                          |
| R08 | Configured response headers                        |
| R09 | Configured redirects                               |
| R10 | Internal rewrite behavior                          |
| R11 | Rewrite phase and termination semantics            |
| R12 | External rewrites and incremental adoption         |
| R13 | basePath                                           |
| R14 | Trailing slashes                                   |
| R15 | Proxy matching                                     |
| R16 | Proxy outcomes and propagated request changes      |
| R17 | Proxy normalization and raw-request opt-out        |
| R18 | Built-in internationalized routing                 |
| R19 | Internationalized routing through Proxy and [lang] |
| R20 | API/Route Handler dispatch                         |
| R21 | HTML versus RSC navigation/prefetch requests       |
| R22 | Data requests for navigation                       |
| R23 | Navigation and history                             |
| R24 | Parallel routes                                    |
| R25 | Intercepted routes                                 |
| R26 | Generated and unknown dynamic paths                |
| R27 | Server Actions and PPR POST dispatch               |
| R28 | Caching, revalidation, and cached handlers         |
| R29 | Draft/Preview request routing                      |
| R30 | Unmatched routes, errors, and runtime redirects    |
| R31 | Static and generated metadata routes               |
| R32 | Framework asset and image endpoints                |
| R33 | Custom server entry and disabled filesystem routes |
| R34 | Route configuration compatibility                  |

## Adding coverage

Extend the closest real fixture and reference the corresponding contract ID in the test name or a nearby explanation. Add a match, near miss and relevant boundary where the contract calls for them. For a new suite, use `pnpm new-test --args <appDir> <name> e2e`, then move the generated fixture into the appropriate directory. New test files here are discovered automatically; also add them to the relevant contract entries. When reusing a broad companion, add focused routing cases to `routingTests` and keep the whole-file reference in `tests` for `--full`. Avoid adding an entire feature suite to `routingTests` to cover a single routing assertion.

Use HTTP for wire outcomes, a browser for navigation/state/cookie behavior and raw sockets when framing or connection lifetime requires them. Prefer controlled release barriers to elapsed-time guesses for streams. Consume streamed content progressively; a final buffered body alone cannot prove early delivery. Query/path normalization expectations beyond the documented examples need an explicit compatibility decision.

Keep mode/bundler/experimental scope honest. A skipped case, known-failure gate or dummy pass is not executed behavioral coverage. Do not add a broad deployment exclusion for a feature that can be tested on a deployment; local-only backend/control, signal and listener assertions can have narrowly explained local gates. Preserve existing manifest entries and explicit CI references when relocating tests.

These assertions currently launch the server supplied by the normal test harness. A replacement must be wired into that startup path, with evidence that its listener handled the requests, before a run can be reported as replacement-server coverage. Custom-server, multi-zone and private adapter/PPR fixtures have distinct launch topologies that must also be supported explicitly.

Line and branch coverage can be added as a separate diagnostic. The manifest's family count and the number of selected files do not measure assertion completeness or implementation coverage.
