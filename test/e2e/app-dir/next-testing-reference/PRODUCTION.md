# Ordinary production validation

The uninstrumented canonical app passed all three production omission tests on
2026-09-16 (18.614s), using Turbopack and native
`1b147d674547cd457b1913bd479ff2d5337b61744cbfe8c3c1fcea076f581a67`.
The preceding `CI=1 pnpm build-all` passed all 18 tasks in 37.489s; the native
hash was checked again afterwards.

The generated durable suite is
`test/production/next-testing-omission/next-testing-omission.test.ts`. It reuses
the canonical real fixture directory, prepares an isolated installation, removes
only `experimental.exposeTestingApiInProductionBuild` there, and builds/starts
once per run. The canonical instrumented config is unchanged. A static
`@force-gate start` declares its local production requirement; the harness also
forces production-directory tests to start mode. An attempted dev-mode command
therefore ran another production test, not a dev skip; no dev-skip proof is
claimed.

```sh
HEADLESS=true NEXT_TEST_NATIVE_DIR="$PWD/packages/next-swc/native" \
  pnpm test-start-turbo \
  test/production/next-testing-omission/next-testing-omission.test.ts
```

The passing checks establish:

- Ordinary sum output, nested async server-only content, and distinct concurrent
  alice/bob/anonymous request cookies.
- A pending instant-testing cookie does not suppress dynamic document content
  or pause actual client navigation. Counter hydrates and increments, and the
  cookie remains unchanged.
- The resolved production config does not enable testing exposure. The two
  route NFT file-dependency traces contain no testing runtime dependencies;
  their emitted server JavaScript and all emitted client JavaScript under
  `.next/static` contain none of the inspected runner implementation markers.
  Client JavaScript contains no Cookie Store implementation for the active lock.
- No native panic or cache-restoration failure appears in the build/server log.

Omission bounds are precise: NFT traces describe file dependencies, not every
inlined module; marker checks supplement them and do not prove arbitrary code
absence. Source maps and installed framework-package files are excluded from the
application-code scan. Shared header constants still contain the testing cookie
name, and the disabled navigation-lock shim still exports API names. Inspection
of the actual minified output shows its listener resolves to `function c(){}`.
Those inert exports are not active test control or runner transport.

As a positive control without another build, the existing canonical development
client chunk identifies the active `navigation-testing-lock.js` module and
contains `cookieStore.get` and `cookieStore.addEventListener`. Saved search
results: `/tmp/next-testing-L-production-enabled-control.log`. The actual
browser instant-navigation corpus independently exercises that enabled behavior.

Initial test-authoring failures are preserved: the first assumed the older
`.next/static/chunks` layout; the next rejected the shared cookie-name constant.
The final suite scans the actual `.next/static` layout and checks active
implementation markers while retaining the behavioral and trace assertions.
Logs: `/tmp/next-testing-L-final-production-omission.log`, `-v2.log`, and the
passing `-v3.log`. The accidental repeated start-mode run is recorded in
`/tmp/next-testing-L-production-dev-gate.log`.

This is ordinary production application safety evidence. Production test-entry
compilation remains unsupported. The initial root `pnpm typescript` failed with 397 diagnostic lines. Independent
triage established that new test imports pulled Next source internals into the
consumer type context; this was not assumed to be a pre-existing failure. The
reviewed emitted-import boundary correction passes actual root type checking.
The ensuing Jest dynamic-import loading failure and its exact-path correction
are recorded in `WAVE8.md`; the previously failing 54-test CLI suite now passes.
The original type log remains `/tmp/next-testing-L-final-root-types-after-build.log`.
