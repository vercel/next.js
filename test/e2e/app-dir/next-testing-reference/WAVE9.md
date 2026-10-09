# A12 independent integration acceptance

All requested gates passed on 2026-09-16. This is new evidence for the paired
loader-closure change, distinct from the prior accepted `1b147` milestone in
`WAVE8.md`. The accepted scope is serialized compiler sessions and the actual
configured output handoff exercised here.

## Exact source and native pair

Applied A12 delta (also the byte-identical integration wave-eleven patch):
`337f6f7234472eb8bb00d4dfd613e13ae8d4f9ebd32ebc2f84c1af841096f7ca`.
Forward/reverse applicability checks passed. All 15 delta-file hashes in
`/tmp/next-testing-a-loader-close-v12-source-hashes.json` and all 17 cumulative
Rust hashes in the immutable provenance were independently checked before and
after the build. This includes the authored `generated-native.d.ts` ABI change.

Native:
`db75772b6be36dee9cfdac5eb968b52141a6e1fc1a1678d37207f4b005614b6a`,
from `/tmp/next-testing-a-native-v12-db75772b6be3/next-swc.darwin-arm64.node`.
The adjacent `provenance.json` matches the source. JavaScript now returns the
actual worker termination Promise expected by this native ABI; the pair was
installed together. Prior native `1b147` is preserved at
`/tmp/next-testing-L-accepted-v10-native-1b147.node`.
Actual CLI invocations use a preload that checks the loaded native's realpath
and SHA-256 at `process.dlopen`. No dependency installation or source workaround
was introduced. The watch process was stopped before the full build.

## Results

| Check                                    | Independent result                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `CI=1 pnpm build-all`                    | 18/18 tasks passed, 35.897s, including package declaration/type generation |
| `pnpm typescript`                        | Passed with actual unchanged root config, exit 0                           |
| Normal development compiler corpus       | 11/11 passed, 34.579s                                                      |
| Actual default CLI, no project filter    | Five profiles, nine files, thirteen final cases passed, exit 0             |
| Browser positive repeated on same output | Two final cases across three attempts passed, exit 0                       |
| Actual SIGINT cancellation               | Exit 130 after complete artifact/terminal/resource cleanup                 |
| Actual SIGTERM cancellation              | Exit 130 after complete artifact/terminal/resource cleanup                 |
| Ordinary production omission suite       | 3/3 passed, 19.375s                                                        |

The compiler corpus retains condition, poison-boundary, external-link, alias,
and publication checks. Its two added cases run real configured loaders with
both `childProcesses` and `workerThreads`: two sessions in one process transform
changed first/second inputs, await shutdown, immediately check loader PIDs are
ESRCH or captured real Workers have `threadId === -1`, execute retained artifacts
with the expected changed case names, and require natural process exit. No
sleep, `unref`, forced successful exit, or alternate-output workaround is used
for these closure assertions. This independently closes the previously excluded
worker-thread idle-lifetime gate for the bounded serialized-session corpus.

The default CLI uses the unchanged canonical five-profile configuration. All
nine selected file/profile identities are present, all thirteen final cases
pass, and eighteen attempts retain five expected retry failures. Exactly one
passing run-end is emitted. Its browser portion captures six unique artifacts.
The subsequent browser repeat and both signal runs use the same configured
application/output without cache deletion or a config override.

For the default run and browser repeat, each screenshot/trace belongs to its
original attempt, precedes that attempt's terminal event, and remains readable
after CLI exit. PNG signatures, chunk CRCs and image-data decompression pass;
trace ZIPs pass integrity checks and contain trace entries. The repeat retains
six artifacts, including those of the intentionally failed retry. Both signal
runs retain two artifacts, cancel the active case, mark the following case
cancelled without executing it, and emit exactly one cancelled file/run end.

For every audited browser run, both recorded server and Chromium PIDs are gone,
the configured output flock is available, and both parent disposal records
precede file-end. Parent and retained server logs contain no native panic or
cache-restoration error. Resource/event instrumentation observes real compiler,
runner, Next server and Chromium behavior; it does not substitute those systems.
No service-cleanup fault was injected during these A12 runs.

Ordinary production reuses the unchanged accepted omission suite. The pending
testing cookie cannot suppress dynamic document content or pause client
navigation/hydration; request cookies stay isolated. The resolved build config,
two route NFT file-dependency traces, emitted server JavaScript, and all emitted
client JavaScript pass the bounded checks documented in `PRODUCTION.md`. Shared
cookie constants and inert shim exports may remain. This is not proof that every
testing-named symbol or arbitrary inlined module is absent, and it does not
establish production test-profile support.

## Commands and retained evidence

```sh
CI=1 pnpm build-all
pnpm typescript
HEADLESS=true NEXT_TEST_NATIVE_DIR="$PWD/packages/next-swc/native" \
  pnpm test-dev-turbo \
  test/development/next-testing-node-compiler/next-testing-node-compiler.test.ts
L_BROWSER_AUDIT_PATH=/tmp/next-testing-L-a12-default.events.jsonl \
NEXT_TEST_NATIVE_DIR="$PWD/packages/next-swc/native" \
  node --require /tmp/next-testing-L-browser-audit-a12.cjs \
  packages/next/dist/bin/next test test/e2e/app-dir/next-testing-reference --run
RUST_BACKTRACE=1 python3 /tmp/next-testing-L-a12-browser-driver.py positive repeat
RUST_BACKTRACE=1 python3 /tmp/next-testing-L-a12-browser-driver.py cancel int
RUST_BACKTRACE=1 python3 /tmp/next-testing-L-a12-browser-driver.py cancel-term term
HEADLESS=true NEXT_TEST_NATIVE_DIR="$PWD/packages/next-swc/native" \
  pnpm test-start-turbo \
  test/production/next-testing-omission/next-testing-omission.test.ts
```

Logs use `/tmp/next-testing-L-a12-` with suffixes `build-all.log`,
`root-types.log`, `compiler.log`, `default.log`, and `production.log`.
Browser log/event/result prefixes are `browser-positive-repeat`,
`browser-cancel-int`, and `browser-cancel-term-term`; the default run also retains
`.events.jsonl` and `.result.json`. The standalone default event/artifact validator
is `/tmp/next-testing-L-default-audit.py`. Original milestone logs are unchanged.

The unchanged 258 unit assertions were not rerun. Owner-only delayed-prewarm
cancellation checks and source review remain separately attributed; this L
acceptance does not claim to have independently repeated those Rust tests.
Concurrent raw project updates/repeated raw NAPI shutdown, arbitrary other-project
activity, production test compilation, and CLI SIGHUP are outside these results.
All validation processes have exited; no watcher or owned server remains.
