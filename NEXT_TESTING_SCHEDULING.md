# Parallel execution and CI scheduling

The Next-owned runner supports bounded, one-shot file execution and deterministic
CI shards. Next continues to compile every entry with its actual Turbopack
profile and evaluate each file in a fresh process. Cases inside a file retain the
existing sequential lifecycle and fixture/retry semantics.

```sh
next test --max-workers 4
next test --project unit --shard 1/3 --max-workers 2
next test --project unit --shard 2/3 --list
```

`maxWorkers` is also a top-level integer in `next.test.config.json`. It defaults
to 1, accepts 1 through 64, and is overridden by `--max-workers`. This is a bound
on active file leases, including teardown and worker closure, rather than a CPU
or memory budget for native compilation or application services. The compiler
serializes emission while up to that many Node/RSC files compile or execute.
Artifacts remain immutable and retained until every reader has closed. There is
one compiler owner at a time; browser files always execute serially, with one
fresh application server and browser host per file after compiler shutdown.

Sharding applies after project and filename filtering. Sort all selected stable
`project:path` IDs using JavaScript code-unit ordering; assign zero-based position
`n` to one-based shard `(n % COUNT) + 1`. Project configuration order, machine
paths and worker count do not change assignment. Every selected file belongs to
exactly one shard. Changing the selected file set can change assignments; this is
not duration balancing or persistent hashing. An empty shard succeeds without
starting compiler or browser resources. An entirely empty discovery selection
still fails. `--list --shard INDEX/COUNT` shows the actual shard selection.

Run concurrent CI shards in separate checkouts with separate application output
directories. A one-shot CLI lease excludes another one-shot invocation in the same
application directory across compiler/server handoffs. Compiler sessions also
acquire Next's normal configured output lock, require `experimental.lockDistDir`,
and retain it until native shutdown. A busy output fails without stopping its
existing owner. Do not share mutable external fixtures, services, or caches
between shards unless the application explicitly namespaces them.

Development and production Node/RSC projects may be selected together. Each mode
runs in a separate supervised compiler process with its own Next configuration,
module and environment-file caches. Generations remain serialized because their
configured outputs can overlap. Workers are owned by the outer supervisor, so a
compiler crash cannot orphan its detached workers. SIGINT/SIGTERM cancellation
stops scheduling, cooperatively cancels active work, then uses bounded process
cleanup. Snapshot publication waits for authoritative worker/compiler exit and
cleanup; coverage completions remain attributed to the original artifact and
entry and are aggregated across files and retries. Final reporting uses one run
identity and preserves per-file, case and retry identities despite interleaving.

Same-mode selections may include browser projects; their files remain serial
regardless of `maxWorkers`. Mixed-mode browser selections are rejected explicitly.
Coverage and snapshot updates retain their existing profile restrictions. Each
snapshot source file must belong to only one selected profile when updating;
use `--project` when profiles select overlapping files. Each
shard produces its own coverage report and retained attachments; automatic
cross-shard report merging is not implemented. Watch rejects sharding and worker
limits above 1. Concurrent cases, simultaneous profile compilers, browser file
parallelism, Windows process ownership, and precise affected-test selection are
outside this increment.

## Verification

The generated `test/development/app-dir/next-testing-scheduling` fixture invokes
the public CLI and compiled workers. It checks serial/parallel results, bounded
overlap, retries, complete disjoint shards, empty shards, mode/environment
isolation, coverage aggregation, explicit snapshots, RSC, worker/compiler crashes,
cancellation, output exclusion and actual browser/server cleanup. Fixture-only
preloads observe result events and real child processes without replacing the
compiler, execution service or authoring facade.

Focused unit checks cover config/shard validation, scheduling bounds, aggregate
report identity, cancellation, output lock acquisition, publication lifetime,
and execution cleanup. The original Vitest-compatible facade remains unchanged.

Run the focused checks with:

```sh
pnpm exec jest --runInBand test/unit/next-testing-cli/next-testing-cli.test.ts test/unit/next-testing-compiler/next-testing-compiler.test.ts test/unit/next-testing-execution-broker/next-testing-execution-broker.test.ts test/unit/next-testing-reporting/reporting.test.ts
pnpm test-dev-turbo test/development/app-dir/next-testing-scheduling/next-testing-scheduling.test.ts
```

Initial validation passed all 178 focused unit tests, all 10 public CLI acceptance
tests, the bootstrap and core builds, repository TypeScript checking, ESLint and
formatting. The public CLI fixture was
run with `NEXT_SKIP_ISOLATE=1` against the built workspace because packed harness
installation could not reach the internal package registry. Browser verification
requires permission to listen on localhost and launch Chromium. A separate run of
the existing execution-process unit suite had 53 passes and one `kill EPERM`
failure during cooperative cancellation; that broader suite is not recorded as
fully passing.

Integration with the PR's newer assertion and lifecycle work preserves browser
and production snapshot support. Deferred snapshot plans retain the compiled
source hash so inline updates remain revision-checked. The compiler unit fixture
now supplies the real source file required by that hash check. The integrated
bootstrap/core builds, 178 focused unit tests, and all 10 acceptance tests pass. Repository-wide type
checking currently reports the existing lifecycle test's `TestContext.name`
error in `test/unit/next-testing-lifecycle/next-testing-lifecycle.test.ts`.
An additional inline-snapshot probe passes `--update` without writing the inline
source, then fails read-only execution. This also reproduces through direct
execution without the scheduling supervisor; the acceptance fixture verifies
external snapshot updates and does not establish inline snapshot round trips.

Publication validation on October 13, 2026, reapplied this increment to PR head
`886b014b97`, preserving the updated Turbopack project result and GC options.
All 178 focused unit tests, changed-file ESLint, and formatting passed.
The core JavaScript compilation completed, but declaration generation could not
resolve the workspace's `hash.js` dependency. The full bootstrap stopped in the
bundle-analyzer application because its `next` executable was unavailable.
Repository TypeScript checking also reported evaluation-harness API mismatches,
an unavailable `ajv/dist/2020` dependency, and the existing lifecycle
`TestContext.name` error. Native CLI acceptance was not rerun on this PR head.
