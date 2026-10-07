# EXPERIMENT: local deferred-schedule slot (not for merge)

This branch adds an **opt-in, experimental** change to the turbo-tasks `PriorityRunner`, plus
diagnostic instrumentation. It exists so the change can be benchmarked. It is not meant to be
merged. Everything is off unless the environment variables below are set.

## Idea

`PriorityRunner` keeps all scheduled-but-not-started tasks in one `parking_lot::Mutex<Queue>`. Most
tasks are read right after being scheduled by the task that scheduled them, and that read claims the
task back out of the queue to execute it inline. That takes the global lock twice per task (push,
then claim). On machines with many cores this lock becomes heavily contended.

The local slot parks tasks scheduled during a worker poll in a **thread-local buffer** instead.

- **Claim:** a claim checks the buffer first. That doesn't take the shared queue mutex; it only
  touches the key's entry in a sharded map (see below).
- **Flush on poll end:** whatever is still parked when the worker poll ends is pushed to the shared
  queue through the normal scheduling path, including worker spawning.
- **Flush before blocking:** parked tasks are also pushed before the known blocking waits (see the
  audit below).

Claim-by-key semantics are those of the shared queue:

- Only the newest scheduled item for a key is claimable, wherever it is stored.
- Once that item has been consumed, by a claim or by a worker pop, older items with the same key
  never become claimable again.
- Older items are still executed by workers.

While the slot is enabled this is tracked with a per-runner sequence number and a sharded
`key -> newest seq` map (`PriorityRunner::latest`, a `DashMap`).

- **Schedule:** the sequence number is allocated and published while holding the key's map entry, so
  for each key a higher sequence number is always published later. No other lock is taken while
  holding the entry.
- **Claim:** reads the entry, takes the matching item from the local buffer or (under the queue
  mutex) from the shared queue, then removes the entry with a compare-and-remove.
- **Cost:** this replaces most shared-queue mutex acquisitions with short shard locks on the map.
  The shard locks aren't free, but they are spread over many shards.

## Environment variables

| Variable                                | Values                                                                          | Effect                                                                                                                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TURBO_TASKS_EXPERIMENT_LOCAL_SLOT`     | unset or `0` (default): off. `1` or `always`: always park. `adaptive`: adaptive | **off:** never parks; scheduling policy as before. **always:** parks whenever a worker poll is active and the buffer has room. **adaptive:** also requires an advisory hint that the shared queue has live items, so that idle workers can start a task right away while the queue is empty |
| `TURBO_TASKS_EXPERIMENT_LOCAL_SLOT_CAP` | integer ≥ 1, default `16`                                                       | Max parked tasks per thread                                                                                                                                                                                                                                                                 |
| `TURBO_TASKS_EXPERIMENT_LOCK_STATS`     | output file path                                                                | Writes one JSON line every 250ms with queue-lock statistics, queue gauges, slot counters, traversal gauges and named phase marks (independent of the slot)                                                                                                                                  |

With the slot off, the scheduling policy is unchanged and neither the sequence counter nor the map
is touched. A few always-on costs remain: a thread-local scope around each worker poll, an
empty-buffer check, env lookups (cached) and a live-item counter in the queue.

## Blocking-wait audit

Search: `block_in_place`, `block_on`, `futures::executor::block_on`, `Condvar`, `thread::park`,
`.wait()` and synchronous `recv()` in `turbopack/crates` and `crates/`, excluding tests, benches,
fuzz targets, CLIs and examples.

| Site                                                                                                                                                                             | Class           | Notes                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| `turbo-tasks/src/spawn.rs` `block_in_place` (also used by `block_for_future`, and by `turbo-persistence` through `turbo-tasks-backend/src/database/turbo/parallel_scheduler.rs`) | flushed         |                                                                                       |
| `turbo-tasks/src/event.rs` `block_on_listener` (sync `Event` waits)                                                                                                              | flushed         |                                                                                       |
| `turbo-tasks/src/scope_bounded.rs` `wait`                                                                                                                                        | flushed         |                                                                                       |
| `turbo-tasks/src/scope_unbounded.rs` `scope_unbounded_with`                                                                                                                      | flushed (added) | The caller drains and then waits on a `Condvar`                                       |
| `turbo-tasks-backend/src/backend/snapshot_coordinator.rs`, both `tokio::task::block_in_place` sites                                                                              | flushed         |                                                                                       |
| `turbo-tasks-backend/src/backend/operation/mod.rs` `listener.wait()` (waiting for another thread to restore a task)                                                              | flushed (added) | Doesn't wait on task execution. Flushed so parked tasks aren't hidden during the wait |
| `crates/next-napi-bindings/src/next_api/project.rs` `Handle::block_on`                                                                                                           | not affected    | Runs on the JS thread, not in a worker poll                                           |
| `turbo-tasks-fs/src/watcher/*` `block_on` and `recv`                                                                                                                             | not affected    | Watcher threads                                                                       |
| `turbopack-trace-utils` `trace_writer.rs` and `exit.rs`                                                                                                                          | not affected    | Own threads                                                                           |
| `turbopack-node` `recv` / `wait`                                                                                                                                                 | not affected    | Async (`.await`)                                                                      |
| `scope_bounded.rs` and `scope_unbounded.rs` helper `work_queue.recv()`                                                                                                           | not affected    | Helper threads, not worker polls                                                      |
| Test-only code (`priority_runner.rs` tests, `event.rs` / `local_task_tracker.rs` / `message_queue.rs` tests, `turbopack-ecmascript` analyzer tests)                              | not affected    |                                                                                       |

Short critical sections behind `Mutex` / `RwLock` locks are not counted as blocking waits. The unit
tests cover the flush helper itself, not every call site above; the classification is by code
reading.

## Benchmark recipe

The commands assume this branch, with the native binary built from it.

```sh
pnpm install
pnpm build-all                      # or: pnpm --filter=next build + native build below
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
- `sites.{schedule,claim,pop_from_worker,spawn_if_available}`: per-interval deltas of the queue
  mutex statistics. `acq` is acquisitions, `cont` is contended acquisitions, `wait_us` is time
  inside contended `lock()` calls. `guarded_us` is the guarded body only; it excludes the unlock,
  so it isn't mutex occupancy.
- `slot_put`, `slot_hit`, `slot_miss`, `slot_flush_poll_end`, `slot_flush_blocking`,
  `slot_adaptive_skip`: per-interval slot counters.
- `queue_len` (heap entries, including tombstones), `queue_live` (live items), `active_workers`,
  `traversal_in_flight` and similar: gauges.

## Results

**Setup.** Base commit `fa8dcf34` (canary) plus this branch (final revision). A 32-logical-CPU
sandbox (16 cores × 2 threads, Intel Xeon 2.9 GHz), with `taskset -c 0-31`, `0-15` or `0-7`. App
`bench/nested-deps-app-router-many-pages` (3,000 routes). Lock stats
were enabled in every run, so these are instrumented builds. Slot capacity was 16. Modes were
interleaved within each round, with 2 rounds. "Phase" is the `whole app module graph` window, taken
from the marks. Lock figures cover that window only; slot counters cover the whole build.

### Compile mode (`next build --experimental-build-mode=compile`)

| CPUs | Mode     | Phase (run 1 / run 2) | Compile      | Queue-lock acquisitions | Contended | Lock-wait thread-eq¹ | OS CPUs busy | Slot put / hit               | Adaptive skips |
| ---- | -------- | --------------------- | ------------ | ----------------------- | --------- | -------------------- | ------------ | ---------------------------- | -------------- |
| 32   | off      | 17.31 / 18.49s        | 62 / 59s     | 6.68M / 7.68M           | 61%       | 20.4 / 22.1          | 7.9 / 7.6    | –                            | –              |
| 32   | always   | **10.05 / 10.63s**    | **44 / 46s** | 3.06M / 2.91M           | 57%       | 12.9 / 13.1          | 9.5 / 9.1    | 3.72M / 3.19M; 3.87M / 3.33M | –              |
| 32   | adaptive | 11.29 / 10.79s        | 49 / 50s     | 3.84M / 3.80M           | 60%       | 16.7 / 16.1          | 10.1 / 10.3  | 2.97M / 2.59M; 2.94M / 2.57M | 1.33M / 1.31M  |
| 16   | off      | 14.23 / 12.81s        | 55 / 47s     | 6.17M / 6.89M           | 60–61%    | 7.2 / 7.2            | 7.8 / 8.2    | –                            | –              |
| 16   | always   | 11.56 / 12.08s        | 50 / 46s     | 3.97M / 4.09M           | 57–58%    | 5.1 / 5.4            | 7.6 / 7.7    | 2.93M / 2.48M; 2.89M / 2.44M | –              |
| 16   | adaptive | **10.59 / 10.74s**    | **46 / 44s** | 4.43M / 4.47M           | 59%       | 6.3 / 6.2            | 8.6 / 8.4    | 2.40M / 2.03M; 2.37M / 2.02M | 0.75M / 0.77M  |
| 8    | off      | **9.69 / 8.69s**      | 58 / 52s     | 5.79M / 5.83M           | 40–42%    | 1.1 / 0.8            | 6.3 / 6.3    | –                            | –              |
| 8    | always   | 11.60 / 10.23s        | 62 / 56s     | 4.34M / 4.39M           | 36–44%    | 0.9 / 0.4            | 5.6 / 5.7    | 2.42M / 2.01M; 2.37M / 1.97M | –              |
| 8    | adaptive | 9.36 / 11.20s         | 53 / 55s     | 4.68M / 4.67M           | 40–44%    | 0.8 / 1.1            | 6.3 / 6.2    | 1.97M / 1.66M; 2.00M / 1.68M | 0.65M / 0.63M  |

¹ Summed time inside contended `lock()` calls divided by the window length. This may include spinning
or preemption.

Notes:

- **32 CPUs:** compared with off (mean phase 17.9s, compile 60.5s), `always` shortened the phase by
  about 42% (10.3s) and the compile by about 26% (45s). `adaptive` shortened them by about 38%
  (11.0s) and 18% (49.5s).
- **16 CPUs:** both modes were faster than off. `adaptive` was the fastest here (phase 10.7s vs
  13.5s off).
- **8 CPUs:** `always` was slower than off (phase 10.9s vs 9.2s, fewer busy CPUs). `adaptive` was in
  between with a large spread (9.36 / 11.20s). That fits parked tasks being hidden from idle workers
  when contention is low, but two runs don't establish the cause, and `adaptive` doesn't reliably
  remove the slowdown.
- **Consistency:** every build recorded the same 429,915 graph-traversal node expansions.
  `slot_flush_blocking` fired 0–1 times per build.
- **Earlier revision:** a run of an earlier revision of this branch, before the sequence-registration
  fix, gave similar 32-CPU numbers. At 8 CPUs it gave `adaptive` 8.8s vs off 8.9s. The difference
  from the rerun is within the observed run-to-run spread.

### Cold dev (32 CPUs)

`rm -rf .next`, then `next dev`. "Ready" is the time from spawning until the `Ready in` log line.
"First request" is the time from Ready until `GET /page77/server-components-only` completed (HTTP
200).

| Mode     | Ready (run 1 / run 2) | First request (run 1 / run 2) |
| -------- | --------------------- | ----------------------------- |
| off      | 0.41 / 0.41s          | 18.66 / 17.25s                |
| always   | 0.41 / 0.41s          | 17.55 / 17.53s                |
| adaptive | 0.41 / 0.41s          | 17.33 / 16.62s                |

The cold-dev differences are small and within run-to-run variation at n=2.

### Caveats

- One machine, one app, n=2 per configuration.
- All runs were instrumented builds.
- Not measured: incremental/warm dev, memory, other apps.
