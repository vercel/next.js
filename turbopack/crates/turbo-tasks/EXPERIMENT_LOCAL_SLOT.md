# EXPERIMENT: local deferred band push (not for merge)

This branch adds an **opt-in, experimental** change to the turbo-tasks `PriorityRunner`, plus
diagnostic instrumentation. It exists so the change can be benchmarked. It is not meant to be
merged. Everything is off unless the environment variables below are set.

This revision is ported onto canary's lock-free `PriorityRunner` (#99773). The previous revision
(`e5db8ae4044c5b8832dbe3b76e757f72883a10de`, on canary `fa8dcf34`) targeted the old global
`Mutex<Queue>` and is summarized at the end.

## Idea

On canary, a task on `schedule`'s queued path (worker pool saturated) is stored by key in the
`claimable` map, and its key is pushed into a priority band: the lock-free lowest-priority
`ConcurrentQueue`, or the `Mutex<BinaryHeap>` for higher priorities. Most such tasks are claimed
shortly afterwards by the reader that waits for them, which removes them from `claimable`. Their
band entry stays behind as a tombstone that a worker pops and discards later. So a claimed task
costs a band push, a band pop and a failed `remove_if`, on shared structures, on top of the map
insert and remove.

The local slot defers the **band push**. While a worker poll is active on this thread, the key is
pushed into a thread-local buffer instead of the band.

- **Payloads stay in canary's map.** The item is stored in `claimable` as usual, so replacement
  (pushing a key that is still queued replaces the queued item), `Executor::discard` and claiming
  are unchanged, including claims from other threads.
- **Flush.** When the outermost worker poll ends (also on unwind), and before a blocking wait,
  every deferred key whose item is still queued, with the same priority, is pushed into its band.
  This is followed by the liveness handshake of `schedule`'s saturated path: a `SeqCst` fence,
  re-reading `active_workers` and spawning a worker if there's capacity. Keys whose item is gone
  (claimed, popped, or replaced with another priority, which pushed its own band entry) are
  skipped.
- **Claimed tasks skip the band.** A task claimed before its deferred push is flushed never touches
  a band. That is the saving. A claim after the flush leaves a tombstone, as on canary.
- **While deferred.** A fresh key with no earlier band entry can't be popped by a worker until it
  is flushed; it can only be claimed. A key that already had a band entry with the same priority
  (a replaced item) can still be popped through it, which is canary's accepted reordering of
  equal-priority items.
- **Direct spawns are never deferred.** A task that `schedule` hands to a new worker directly
  never enters the queue or the buffer, exactly as on canary.

Lock ordering is canary's: the `heap` mutex, then `claimable` shards. The slot adds no new lock. A
flush checks the map (a shard read guard, dropped before the band push) and then pushes; no shard
guard is held while pushing to a band or while running `Executor::discard` or `execute`.

## Environment variables

| Variable                                | Values                                                                 | Effect                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TURBO_TASKS_EXPERIMENT_LOCAL_SLOT`     | unset or `0` (default): off. `1` or `always`: always defer. `adaptive` | **off:** never defers; canary behavior. **always:** defers whenever a worker poll is active and the buffer has room. **adaptive:** also requires that a band already has entries (`heap_non_empty` is set or the lowest band is non-empty). That hint is read without locks, counts tombstones too, and may be stale; it lets idle workers find new work immediately while the bands are empty |
| `TURBO_TASKS_EXPERIMENT_LOCAL_SLOT_CAP` | integer ≥ 1, default `16`                                              | Max deferred band pushes per thread; when full, the push happens immediately                                                                                                                                                                                                                                                                                                                   |
| `TURBO_TASKS_EXPERIMENT_LOCK_STATS`     | output file path                                                       | Writes one JSON line every 250ms with heap-mutex statistics, queue and slot counters, gauges and named phase marks (independent of the slot)                                                                                                                                                                                                                                                   |

With the slot off and diagnostics disabled, the additions on canary's paths are: a cached env
check per queued schedule, a thread-local scope around each worker poll, and an empty-buffer check
at its end. No shared atomics are added. With diagnostics enabled, every arm pays for the atomic
counters.

## Blocking-wait audit

Search on the new base: `block_in_place`, `block_on`, `futures::executor::block_on`, `Condvar`,
`thread::park`, `.wait()` and synchronous `recv()` in `turbopack/crates` and `crates/`, excluding
tests, benches, fuzz targets, CLIs and examples. Compared with the previous base, only two files
are new matches (last two rows).

| Site                                                                                                                                                                             | Class        | Notes                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------- |
| `turbo-tasks/src/spawn.rs` `block_in_place` (also used by `block_for_future`, and by `turbo-persistence` through `turbo-tasks-backend/src/database/turbo/parallel_scheduler.rs`) | flushed      |                                                               |
| `turbo-tasks/src/event.rs` `block_on_listener` (sync `Event` waits)                                                                                                              | flushed      |                                                               |
| `turbo-tasks/src/scope_bounded.rs` `wait`                                                                                                                                        | flushed      |                                                               |
| `turbo-tasks/src/scope_unbounded.rs` `scope_unbounded_with`                                                                                                                      | flushed      | The caller drains and then waits on a `Condvar`               |
| `turbo-tasks-backend/src/backend/snapshot_coordinator.rs`, both `tokio::task::block_in_place` sites                                                                              | flushed      |                                                               |
| `turbo-tasks-backend/src/backend/operation/mod.rs` `listener.wait()` (waiting for another thread to restore a task)                                                              | flushed      | Flushed so deferred band pushes aren't hidden during the wait |
| `crates/next-napi-bindings/src/next_api/project.rs` `Handle::block_on`                                                                                                           | not affected | Runs on the JS thread, not in a worker poll                   |
| `turbo-tasks-fs/src/watcher/*` `block_on` and `recv`                                                                                                                             | not affected | Watcher threads                                               |
| `turbopack-trace-utils` `trace_writer.rs` and `exit.rs`                                                                                                                          | not affected | Own threads                                                   |
| `turbopack-node` `recv` / `wait`                                                                                                                                                 | not affected | Async (`.await`)                                              |
| `scope_bounded.rs` and `scope_unbounded.rs` helper `work_queue.recv()`                                                                                                           | not affected | Helper threads, not worker polls                              |
| Test-only code (`event.rs` / `local_task_tracker.rs` / `message_queue.rs` tests, `turbopack-ecmascript` analyzer tests)                                                          | not affected |                                                               |
| `turbopack-trace-utils/src/tokio_workers.rs` `Barrier::wait`                                                                                                                     | not affected | New on this base; test-only                                   |
| `turbopack-trace-server/src/reader/threaded.rs` `recv`                                                                                                                           | not affected | New on this base; the trace server's own reader threads       |

Short critical sections behind `Mutex` / `RwLock` locks are not counted as blocking waits. The unit
tests cover the flush helper and the scope lifecycle, not every call site above; the
classification is by code reading. A missed blocking wait could delay a deferred, unclaimed task
until the poll ends, or hide it from workers while this thread waits on it.

## Benchmark recipe

The commands assume this branch, with the native binary built from it.

```sh
pnpm install
pnpm build-all                      # or: pnpm build + the native build below
(cd packages/next-swc && pnpm build-native-release)

cd bench/nested-deps-app-router-many-pages
# (generate the app once: pnpm prepare-bench)

# compile mode; MODE is 0, always or adaptive; CPUS is a CPU list, e.g. 0-7, 0-15 or 0-31
# (drop `taskset -c $CPUS` to use all CPUs)
rm -rf .next
TURBO_TASKS_EXPERIMENT_LOCAL_SLOT=$MODE \
TURBO_TASKS_EXPERIMENT_LOCK_STATS=/tmp/lock-stats-$MODE.jsonl \
  taskset -c $CPUS node ../../packages/next/dist/bin/next build --experimental-build-mode=compile

# cold dev: time to "Ready", then the first request
rm -rf .next
TURBO_TASKS_EXPERIMENT_LOCAL_SLOT=$MODE node ../../packages/next/dist/bin/next dev --port 3333 &
# wait for "Ready" in the output, then:
curl -s -o /dev/null -w '%{http_code} %{time_total}\n' --max-time 300 \
  http://localhost:3333/page77/server-components-only
```

**Reading the stats file:** it has one JSON object per line, written every 250ms.

- `marks`: the `whole_app_module_graph_start` and `whole_app_module_graph_end` events (recorded in
  `next build`) bound the module-graph phase.
- `sites.{heap_push,heap_pop}`: per-interval deltas of the heap mutex statistics. `acq` is
  acquisitions, `cont` is contended acquisitions, `wait_us` is time inside contended `lock()`
  calls. `guarded_us` is the guarded body only; it excludes the unlock, so it isn't mutex
  occupancy.
- Per-interval counters: `spawn_direct`, `schedule_queued`, `map_insert`, `map_replaced`,
  `discard`, `lowest_push`, `heap_push`, `lowest_pop`, `heap_pop`, `pop_tombstone`, `pop_hit`,
  `pop_empty`, `claim_hit`, `claim_miss`, and the slot counters `slot_defer`, `slot_full`,
  `slot_adaptive_skip`, `slot_flush_poll_end`, `slot_flush_blocking`, `slot_flush_skip_gone`.
- `claimable` map operations are derived from these counters, without extra hot-path atomics:
  inserts = `map_insert`; removes = `claim_hit + claim_miss`; conditional removes (`remove_if`, one
  per popped band entry) = `lowest_pop + heap_pop`. A deferred flush adds one shard read
  (`slot_flush_poll_end + slot_flush_blocking`). Shard waits aren't timed.
- Gauges: `active_workers` (last value observed at a direct spawn or a worker retirement, not an
  exact live count), `target_workers`, `traversal_in_flight`, `traversal_in_flight_max`, and
  `traversal_completed` (counter).

## Results

**Setup.** Base commit `2af3c42a` (canary, including #99773) plus this branch. A 32-logical-CPU
sandbox (16 cores × 2 threads, Intel Xeon 2.9 GHz), with `taskset -c 0-31`, `0-15` or `0-7`. App
`bench/nested-deps-app-router-many-pages` (3,000 routes). Lock stats were enabled in every run, so
these are instrumented builds. Slot capacity was 16. Modes were interleaved within each round, with
2 rounds. "Phase" is the `whole app module graph` window, taken from the marks. Counters cover the
whole build.

### Compile mode (`next build --experimental-build-mode=compile`)

| CPUs | Mode     | Phase (run 1 / run 2) | Compiled in (run 1 / run 2) | OS CPUs busy in phase | Band push+pop entries (build) |
| ---- | -------- | --------------------- | --------------------------- | --------------------- | ----------------------------- |
| 32   | off      | **5.24 / 5.35s**      | **37.1 / 35.0s**            | 19.5 / 20.3           | 11.1M / 11.1M                 |
| 32   | always   | 5.49 / 5.69s          | 37.1 / 36.9s                | 19.7 / 20.0           | 9.0M / 9.1M                   |
| 32   | adaptive | 5.76 / 5.09s          | 37.6 / 37.3s                | 19.7 / 19.5           | 9.2M / 9.2M                   |
| 16   | off      | 6.92 / 6.70s          | 45 / 41s                    | 11.9 / 11.4           | 11.6M / 11.6M                 |
| 16   | always   | 6.56 / 6.57s          | 42 / 41s                    | 11.4 / 11.0           | 9.8M / 9.9M                   |
| 16   | adaptive | **6.28 / 5.94s**      | **42 / 39.3s**              | 11.5 / 11.1           | 9.9M / 9.8M                   |
| 8    | off      | 8.72 / 8.46s          | 55 / 57s                    | 6.4 / 6.5             | 11.9M / 11.9M                 |
| 8    | always   | 9.16 / 9.74s          | **50 / 53s**                | 6.8 / 6.6             | 10.4M / 10.2M                 |
| 8    | adaptive | **8.74 / 7.73s**      | 53 / 51s                    | 6.6 / 6.6             | 10.5M / 10.5M                 |

Mean phase / "Compiled in":

| CPUs | off          | always       | adaptive     |
| ---- | ------------ | ------------ | ------------ |
| 32   | 5.3s / 36.1s | 5.6s / 37.0s | 5.4s / 37.5s |
| 16   | 6.8s / 43.0s | 6.6s / 41.5s | 6.1s / 40.7s |
| 8    | 8.6s / 56.0s | 9.5s / 51.5s | 8.2s / 52.0s |

Queue counters at 32 CPUs (off, run 1): 5.55M queued schedules and 0.79M direct spawns. 4.87M
queued tasks were claimed (88%), so 4.87M of the 5.55M band entries were popped as tombstones. The
heap mutex was never taken during the phase: all tasks there have the lowest priority. Replacements
were 0.

Slot counters at 32 CPUs (always, run 1): 1.37M band pushes deferred, 1.05M refused because the
16-entry buffer was full, and 1.03M deferred keys (75%) skipped at flush because their task had
already been claimed. That removed about 1.0M band pushes and 1.0M tombstone pops (−18% band
entries). Blocking-wait flushes happened 78–128 times per build.

Notes:

- **Canary itself:** with the slot off, the phase at 32 CPUs dropped from ~17.9s on the previous
  base (`fa8dcf34`) to ~5.3s, and "Compiled in" from ~60s to ~36s. About 20 CPUs are busy during the
  phase instead of ~8. The bases differ by 79 commits, including #99773 (which removed the global
  queue mutex) and a rustc upgrade, so the gain isn't attributed to one change. On the new base the
  heap mutex isn't taken at all during the phase.
- **32 CPUs:** no improvement from the slot. `always` had a slower phase than off in both runs
  (5.49 / 5.69s vs 5.24 / 5.35s); `adaptive`'s runs straddled off's (5.76 / 5.09s). "Compiled in"
  was 1–1.5s slower on average, with overlapping ranges for `always`. n=2, so no significance is
  claimed.
- **16 CPUs:** both modes were slightly faster (adaptive phase 6.1s vs 6.8s, "Compiled in" 40.7s vs
  43.0s). n=2.
- **8 CPUs:** `always` again had the longest phase (9.5s vs 8.6s) but the shortest "Compiled in"
  (51.5s vs 56.0s). `adaptive` was close to off in the phase. n=2; the two metrics move in opposite
  directions, and these runs don't explain why.
- **Consistency:** every build recorded the same 429,915 graph-traversal node expansions.
- **Capacity:** the buffer was full for almost as many schedules as it accepted. A larger capacity
  wasn't measured.

### Cold dev (32 CPUs)

`rm -rf .next`, then `next dev`. "Ready" is the time from spawning until the `Ready in` log line.
"First request" is the time from Ready until `GET /page77/server-components-only` completed (HTTP
200).

| Mode     | Ready (run 1 / run 2) | First request (run 1 / run 2) |
| -------- | --------------------- | ----------------------------- |
| off      | 0.41 / 0.42s          | 16.85 / 17.48s                |
| always   | 0.52 / 0.52s          | 16.95 / 17.60s                |
| adaptive | 0.52 / 0.52s          | 16.68 / 18.09s                |

The cold-dev differences are within run-to-run variation at n=2.

### Caveats

- One machine, one app, n=2 per configuration.
- All runs were instrumented builds; the counters add atomic traffic to every arm.
- Not measured: uninstrumented builds, incremental/warm dev, memory, other apps, other buffer
  capacities.

## Previous revision (older base)

`e5db8ae4044c5b8832dbe3b76e757f72883a10de` on canary `fa8dcf34`, before #99773. That revision
parked whole tasks locally on top of the old global `Mutex<Queue>`. Mean phase / "Compiled in"
(n=2, instrumented):

| CPUs | off           | always      | adaptive      |
| ---- | ------------- | ----------- | ------------- |
| 32   | 17.9s / 60.5s | 10.3s / 45s | 11.0s / 49.5s |
| 16   | 13.5s / 51s   | 11.8s / 48s | 10.7s / 45s   |
| 8    | 9.2s / 55s    | 10.9s / 59s | 10.3s / 54s   |

These numbers are from a different base and are not directly comparable with the tables above.
