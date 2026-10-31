# Routing-server regression suite

Run the local production and development suite with:

```sh
pnpm test-routing
```

The command runs production first, then development, using the existing Next.js parallel test scheduler. Up to four independent suites run concurrently; each suite's tests stay sequential. The scheduler shares a dependency starter installation and browser server while each application keeps its own fixture directory, listener, build output, and browser context.

The default includes the whole-file suites listed in [suites.mjs](./suites.mjs) and the focused `routingTests` selections in [contracts.json](./contracts.json). Existing fixtures stay in their original feature directories; category comments in the index explain the behaviors they cover. Broad companion suites run only their selected routing cases: metadata endpoint delivery does not also run title/description tests, for example, and Server Action dispatch does not also test action compilation. `--full` adds the original broader feature regressions. Both profiles retain all 44 documentation capability families; the full profile adds regression depth rather than being required to include a capability family.

Tests run once per applicable mode, regardless of how many contracts reference them. A failing mode makes the command fail; it still runs the other selected mode. Retries are disabled so a failure remains visible and the scheduler never resets a developer's fixture source files. Mode and total elapsed times are printed at the end.

Bootstrap the repository and build the local JavaScript packages before running tests. Test-only edits need no watch build or rebuild when the framework output is current. The isolated harness installs fixture dependencies, starts local listeners, and uses the existing browser driver.

Use Node 24.22.1 LTS, verified with both Preview Mode and the pnpm symlink/realpath-sensitive fixtures. Node 20.20.2 intermittently loads duplicate React modules under different paths, producing invalid-hook errors or missing transitive imports in development; use a runtime containing the [realpath fix](https://github.com/nodejs/node/pull/65113). Node 26.12.1 fixes that issue but removes `buffer.SlowBuffer`, which the bundled Preview JWT dependency still requires. Preview assertions stay enabled; see [compatibility-notes.md](./compatibility-notes.md) for the runtime evidence.

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

# Only the whole-file routing suites in suites.mjs:
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

## Server consolidation regression companions

The architecture projects A–H have a separate selection in
[regression-companions.mjs](./regression-companions.mjs). They do not change
or increase the 44 public documentation capability families.

```sh
# All applicable architecture companions, production then dev:
pnpm test-routing --regressions=all

# Fast project-specific investigation:
pnpm test-routing --regressions=A,C,G --mode=dev --bundler=turbo
pnpm test-routing --regressions=A,C,G --mode=dev --bundler=webpack
pnpm test-routing --regressions=B,C,D,E,H --mode=start --bundler=turbo

# Inspect selected files and registered-case filters before running:
pnpm test-routing --regressions=all --list
pnpm test-routing --regressions=E --mode=start --bundler=webpack --dry
```

Use `--regressions` independently of `--core`, `--full`, and `--group`.
Each companion records its modes, bundlers, hosting path, and optional case
filter. Explicit dimensions allow development assertions in a fixture under
`test/production/`. Native compiler subscription tests run only with
Turbopack; content-hash tests retain their existing production Turbo scope.
The F fixture independently launches supported backends inside isolated
subprocesses, so its outer runner bundler is not evidence of selection.

A selected but gated assertion is a skip. The scheduler disallows filters that
match no registered assertion. `--mode=all` omits an inapplicable mode;
an explicitly requested mode with no matches fails. A selection with no
applicable tests across either mode also fails, including `--list` and `--dry`.
The companion profile
currently covers local hosting; it supplies no deployment coverage.

See [the coverage and execution review](./consolidation-review.md) for actual
assertions/results and [the acceptance follow-up plan](./consolidation-acceptance-plan.md)
for remaining tests and implementation dependencies. Neither selection counts
nor passing public contracts prove the proposed internal refactors are covered.

## Organization

- [http/](./http/) checks payloads, body limits, headers/cookies, origin admission, progressive delivery, streaming status behavior, compression and connection lifecycle.
- [router/](./router/) checks route selection, dynamic paths, custom rules, Proxy, URL handling, navigation, revalidation and request dispatch.

Each subdirectory is an independent real fixture. New fixtures live here; existing routing-focused fixtures stay in their original directories, such as `test/e2e/basepath` and `test/e2e/app-dir/parallel-routes-and-interception`. The commented [suite index](./suites.mjs) groups both by HTTP and Router behavior without moving files or changing their existing CI references. Keep the existing routing build-manifest checks: they are useful build companions even though request/browser assertions supply the public runtime contract.

Broader App/Pages/Actions/image/cache suites stay in their feature directories. The manifest distinguishes focused routing assertions (`routingTests`) from the broader regression references (`tests`). A focused reference can select an entire routing-specific file, or supply a `testNamePattern` for the relevant cases in a broader file. Multiple selections of the same file are combined and executed once. This reuses assertions without including unrelated feature tests in the regular development loop. The scheduler checks selectors against Jest's registered assertions and fails if a selector matches no test names. Registered but mode-gated assertions stay visible as skips.

`--full` runs whole companion files without these case filters. `--core` deliberately excludes all companions and therefore is a narrower gate; it cannot be combined with `--full`.

Build companions for conflicting route definitions and unsupported runtime configuration also stay in their feature directories. The manifest includes these documented configuration constraints in the Router group alongside the public request assertions.

The HTTP–Router boundary is already exercised by public HTTP/browser requests. A body surviving a rewrite belongs to both H01 and R10, but needs only one fixture.

## Documentation contract

[contracts.json](./contracts.json) records the documented behavior, applicable scope, canonical documentation files and existing/new e2e files for each capability family. Each family must have focused routing references as well as full regression references. It is the case-selection index, not a generated code-coverage percentage. The runner disallows missing IDs, missing references and invalid case filters, so a renamed companion cannot silently fall out of the gate.

The documentation defines the expected public result. An existing implementation, fixture title or passing status is not a substitute for the documentation. Preserve a real failing documented assertion when it finds a framework discrepancy; do not add a skip or reverse an expectation simply to make the gate green. Record the discrepancy and fix the implementation or clarify the public contract separately.

Observed reference-server discrepancies are recorded in [compatibility-notes.md](./compatibility-notes.md). Their assertions stay active; a listed discrepancy is not a passing result.

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

Extend the closest real fixture and reference the corresponding contract ID in the test name or a nearby explanation. Add a match, near miss and relevant boundary where the contract calls for them. For a new suite, use `pnpm new-test --args <appDir> <name> e2e`, then move the generated fixture into the appropriate directory. Add routing-focused whole files to the relevant commented category in [suites.mjs](./suites.mjs) and to the relevant contract entries. Selection is explicit rather than based on folder discovery. When reusing a broad companion, add focused routing cases to `routingTests` and keep the whole-file reference in `tests` for `--full`. Avoid adding an entire feature suite to `routingTests` to cover a single routing assertion.

Use HTTP for wire outcomes, a browser for navigation/state/cookie behavior and raw sockets when framing or connection lifetime requires them. Prefer controlled release barriers to elapsed-time guesses for streams. Consume streamed content progressively; a final buffered body alone cannot prove early delivery. Query/path normalization expectations beyond the documented examples need an explicit compatibility decision.

Keep mode/bundler/experimental scope honest. A skipped case, known-failure gate or placeholder pass is not executed behavioral coverage. Do not add a broad deployment exclusion for a feature that can be tested on a deployment; local-only backend/control, signal and listener assertions can have narrowly explained local gates. Existing fixtures keep their manifest entries and explicit CI references at their original paths.

Fixtures that explicitly disable `cacheComponents` must also disable `experimental.cachedNavigations`. The Cache Components CI jobs enable both through environment variables, and cached navigations requires Cache Components. Pinning both options keeps these fixtures on their intended routing model without failing configuration validation before any assertions run.

These assertions currently launch the server supplied by the normal test harness. A replacement must be wired into that startup path, with evidence that its listener handled the requests, before a run can be reported as replacement-server coverage. Custom-server, multi-zone and private adapter/PPR fixtures have distinct launch topologies that must also be supported explicitly.

Line and branch coverage can be added as a separate diagnostic. The manifest's family count and the number of selected files do not measure assertion completeness or implementation coverage.
