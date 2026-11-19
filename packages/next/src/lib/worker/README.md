# Worker Pool

Custom worker pool implementation for Next.js, replacing `jest-worker`.

## Key Features

- **Lazy spawning**: Workers are created on-demand when jobs are dispatched, not at construction time
- **Dynamic scaling**: Worker count grows as concurrent jobs increase, up to `maxWorkers`. Workers are never scaled down — once spawned, a worker persists until the pool is shut down.
- **Per-worker concurrency**: Configurable concurrent calls per worker via `concurrencyPerWorker`
- **Boot throttling**: `maxBootingWorkers` limits how many workers start concurrently, preventing resource contention when many tasks arrive at once
- **Fault recovery**: Workers that exit unexpectedly are removed from the pool, and new workers are spawned for queued tasks. A worker that exits (or times out) before READY has no calls yet, so the calls waiting for it stay queued; after 3 such failures in a row the pool stops replacing them, and the queued calls are rejected with `WorkerExitError` once no worker is left (a healthy worker still serves them). A worker whose module fails to load, or whose process emits an `'error'` event (e.g. a failed spawn), is removed and terminated without a respawn; queued tasks keep waiting for the remaining workers and are rejected only once no worker is left. The high-level `Worker` class supports `maxRetries` to automatically re-dispatch failed calls.
- **Individual worker restart**: Hung or failed workers are restarted without affecting others

## Architecture

```
Worker (high-level wrapper, index.ts)
  ├── Handles: timeout/restart, activity tracking, NODE_OPTIONS, color propagation
  ├── Exposes: named methods from worker modules (e.g. isPageStatic, exportPages)
  └── WorkerPool (low-level pool, worker-pool.ts)
        ├── WorkerHandle — uniform abstraction over ChildProcess / NodeWorker
        ├── Handles: process lifecycle, lazy spawning, task queue, message routing
        ├── ChildProcess mode: fork(worker-process-child.js)
        └── WorkerThread mode: new Worker(worker-thread-child.js)

worker-child-common.ts   — shared protocol logic (ChildTransport + createMessageHandler)
worker-process-child.ts  — child_process entry: thin wrapper using process.send/on('message')
worker-thread-child.ts   — worker_threads entry: thin wrapper using parentPort
types.ts                 — shared message type constants and TypeScript types
```

## Message Protocol

Communication between parent and child uses arrays sent over IPC (child_process) or postMessage (worker_threads).

### Parent → Child

| Message    | Format                             |
| ---------- | ---------------------------------- |
| INITIALIZE | `[0, workerPath, setupArgs]`       |
| CALL       | `[1, requestId, methodName, args]` |
| END        | `[2]`                              |

### Child → Parent

| Message      | Format                                                  |
| ------------ | ------------------------------------------------------- |
| OK           | `[0, requestId, result]`                                |
| CLIENT_ERROR | `[1, requestId, errorName, message, stack, properties]` |
| SETUP_ERROR  | `[2, errorName, message, stack]`                        |
| CUSTOM       | `[3, payload]`                                          |
| READY        | `[4]`                                                   |
| LOAD_ERROR   | `[5, errorName, message, stack]`                        |

Each CALL gets a unique `requestId` so responses can be correlated, enabling multiple concurrent calls per worker. The READY message is sent once per worker after the module is loaded and optional `setup()` completes, signaling the worker is fully initialized. If `setup()` fails, READY is not sent; the SETUP_ERROR handler frees the booting slot instead and the worker keeps serving calls, since its module is loaded.

If loading the module itself fails (`require()` throws), the child sends LOAD_ERROR instead. That worker can't serve any call, so the pool fails its in-flight calls with `Error when loading worker module: <message>`, then removes the worker from the pool and terminates it. Queued calls fail with the same error if that was the last worker; otherwise they wait for the remaining workers. This exit is expected: it isn't reported via `onWorkerExit` and doesn't trigger a respawn. The next `dispatch()` spawns a fresh worker.

## Usage

### High-level (Worker class)

Used by build, export, type-check, and dev server:

```typescript
import { Worker } from '../lib/worker'

const worker = new Worker(require.resolve('./my-worker'), {
  exposedMethods: ['doWork'],
  maxWorkers: 4,
})

const result = await (worker as any).doWork(args)
await worker.shutdown()
```

### Low-level (WorkerPool class)

Direct pool access for custom scheduling:

```typescript
import { WorkerPool } from '../lib/worker'

const pool = new WorkerPool({
  workerPath: require.resolve('./my-worker'),
  maxWorkers: 4,
  concurrencyPerWorker: 2,
})

const result = await pool.dispatch('doWork', [args])
await pool.shutdown()
```

## Worker Module Contract

Worker modules export functions that can be called from the parent:

```typescript
// Required: methods to expose
export async function doWork(args: any): Promise<any> { ... }

// Optional: called once before first method invocation (sync or async)
export function setup(...setupArgs: unknown[]): void | Promise<void> { ... }

// Optional: called on END message (sync or async)
export function teardown(): void | Promise<void> { ... }
```

The `setupArgs` are provided via `WorkerPoolOptions.setupArgs`. READY is sent after `setup()` completes (or after module load if there is no `setup`).

On END, the child runs `teardown()` (if exported) and then exits with `process.exit(0)`, for both child processes and worker threads. It doesn't wait for leftover timers or sockets, so graceful shutdown doesn't have to wait for the force-kill timeout. `process.on('exit')` handlers still run (e.g. CPU profile saving). A child process first waits for its stdout/stderr to flush, because pipe writes are asynchronous on POSIX and would otherwise be cut off by the exit.

A worker's `'exit'` event can fire before its last stdout/stderr chunks are read. `WorkerPool.shutdown()` therefore also waits for each worker's stdout/stderr to end before it ends the merged streams, so final diagnostics aren't lost. This wait is bounded by the same delay as the force-kill (5s, or 60s with `NEXT_CPU_PROF`). If a stream is still open after that (e.g. a grandchild process inherited the pipe), it is detached, its later output is discarded, and it no longer keeps the parent process alive.

## Options

### WorkerPool Options

| Option                 | Type      | Default            | Description                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | --------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workerPath`           | string    | required           | Absolute path to worker module                                                                                                                                                                                                                                                                                                              |
| `maxWorkers`           | number    | required           | Maximum worker processes/threads                                                                                                                                                                                                                                                                                                            |
| `concurrencyPerWorker` | number    | 1                  | Max concurrent calls per worker                                                                                                                                                                                                                                                                                                             |
| `enableWorkerThreads`  | boolean   | false              | Use worker_threads instead of child_process                                                                                                                                                                                                                                                                                                 |
| `sanitizeArgs`         | boolean   | true               | worker_threads only: JSON round-trip call args (strips functions like child_process does). Set `false` to keep structured clone semantics, e.g. for `SharedArrayBuffer` or typed arrays                                                                                                                                                     |
| `forkOptions.env`      | object    | {}                 | Environment variables for child processes                                                                                                                                                                                                                                                                                                   |
| `forkOptions.execArgv` | string[]  | []                 | Node.js CLI flags for child processes and worker threads. Child processes default to `process.execArgv` minus debugger flags. For threads, see `inheritedExecArgv`                                                                                                                                                                          |
| `inheritedExecArgv`    | string[]  | []                 | Leading part of `forkOptions.execArgv` inherited from the parent. Threads inherit the parent's flags (`execArgv: undefined`) when nothing was removed or requested. If a thread rejects only inherited flags (V8/per-process flags, which apply process-wide), it is created once more without them; any other rejection fails the dispatch |
| `setupArgs`            | unknown[] | []                 | Arguments for worker `setup()` function                                                                                                                                                                                                                                                                                                     |
| `maxBootingWorkers`    | number    | ceil(maxWorkers/4) | Max workers starting up concurrently (must be >= 1). A worker is "booting" from spawn until it sends READY after module load + setup().                                                                                                                                                                                                     |
| `timeout`              | number    | undefined          | Per-worker inactivity timeout in ms. Workers with in-flight requests that don't report activity within this window are killed and replaced individually.                                                                                                                                                                                    |
| `onActivity`           | function  | undefined          | `() => void` — called when any worker reports activity (message completion, custom message, ready)                                                                                                                                                                                                                                          |
| `onWorkerExit`         | function  | undefined          | `(code, signal) => void` — called when a worker exits unexpectedly (not during graceful shutdown)                                                                                                                                                                                                                                           |
| `onCustomMessage`      | function  | undefined          | `(message) => void` — called when a worker sends a CUSTOM message                                                                                                                                                                                                                                                                           |

### WorkerPool Methods

| Method                   | Returns                             | Description                                                                                                                                                                                            |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dispatch(method, args)` | `Promise<unknown>`                  | Call a method on a worker; spawns/queues as needed                                                                                                                                                     |
| `shutdown()`             | `Promise<{ forceExited: boolean }>` | Graceful shutdown: sends END to workers, waits for exit (5s force-kill timeout, 60s with `NEXT_CPU_PROF` so workers can finish writing CPU profiles), then for their stdout/stderr to end (same bound) |
| `shutdownNow()`          | `void`                              | Immediate shutdown: force-kills all workers, rejects in-flight and queued tasks                                                                                                                        |
| `getStdout()`            | `PassThrough`                       | Merged stdout stream from all workers                                                                                                                                                                  |
| `getStderr()`            | `PassThrough`                       | Merged stderr stream from all workers                                                                                                                                                                  |
| `getWorkerCount()`       | `number`                            | Number of currently alive workers                                                                                                                                                                      |

### Worker Options (high-level)

The `Worker` class wraps `WorkerPool` and adds retry logic, Node.js flag forwarding, and exposed method wiring.

Workers inherit the parent's flags the way Node.js passes them to a child: the parent's CLI flags (`process.execArgv`) stay CLI flags, so they keep precedence over NODE_OPTIONS and CLI-only flags such as `--prof` keep working, and NODE_OPTIONS stays NODE_OPTIONS. Debugger flags (`--inspect*`, `--debug*`, including separate values such as `--inspect-port 9229`) are removed from both, so by default workers don't wait for a debugger or compete for the parent's port (`debuggerPortOffset` re-attaches one on another port for child processes). Callers don't need to pass `NODE_OPTIONS` or flags themselves.

| Option                 | Type                | Default            | Description                                                                                                                                                                                                                                                                           |
| ---------------------- | ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exposedMethods`       | string[]            | required           | Methods to wire up from worker module (underscore-prefixed names are skipped)                                                                                                                                                                                                         |
| `workerName`           | string              | undefined          | Human-readable name for error messages (e.g. "Next.js build worker")                                                                                                                                                                                                                  |
| `debuggerPortOffset`   | number \| undefined | undefined          | Child processes only: when the parent is debugged with `--inspect`/`--inspect-brk`, attach the same flag at `parentPort + 1 + offset` (CLI address wins over NODE_OPTIONS) plus the parent's `--inspect-publish-uid`; `undefined` = not inspectable. Threads never get debugger flags |
| `isolatedMemory`       | boolean             | false              | If true, strips `--max-old-space-size` from the inherited CLI flags and NODE_OPTIONS. Only applies to child_process workers — worker_threads share the parent's V8 heap so this flag has no effect in that mode.                                                                      |
| `maxWorkers`           | number              | cpus - 1 (min 1)   | Maximum number of workers to spawn                                                                                                                                                                                                                                                    |
| `maxRetries`           | number              | 0                  | Number of times to re-dispatch a call after a `WorkerExitError` (worker crash). Non-crash errors are never retried.                                                                                                                                                                   |
| `onRestart`            | function            | undefined          | `(method, args, attempt) => void` — called before each retry attempt                                                                                                                                                                                                                  |
| `maxBootingWorkers`    | number              | ceil(maxWorkers/4) | Passed through to WorkerPool                                                                                                                                                                                                                                                          |
| `concurrencyPerWorker` | number              | 1                  | Passed through to WorkerPool                                                                                                                                                                                                                                                          |
| `enableWorkerThreads`  | boolean             | false              | Passed through to WorkerPool                                                                                                                                                                                                                                                          |
| `sanitizeArgs`         | boolean             | true               | Passed through to WorkerPool                                                                                                                                                                                                                                                          |
| `enableSourceMaps`     | boolean             | false              | Adds `--enable-source-maps` to NODE_OPTIONS and drops an inherited `--no-enable-source-maps` CLI flag                                                                                                                                                                                 |
| `timeout`              | number              | undefined          | Per-worker inactivity timeout in ms. Passed through to WorkerPool.                                                                                                                                                                                                                    |
| `forkOptions.env`      | object              | {}                 | Merged into worker environment. A `NODE_OPTIONS` here replaces the inherited one (`undefined` removes it); debugger flags are stripped either way                                                                                                                                     |
| `forkOptions.execArgv` | string[]            | []                 | Extra Node.js flags appended after the inherited ones. Worker threads reject V8 and per-process flags here                                                                                                                                                                            |
| `onActivity`           | function            | undefined          | Called when any worker reports activity (used for activity spinners)                                                                                                                                                                                                                  |
| `onActivityAbort`      | function            | undefined          | Called when a worker produces stdout/stderr output                                                                                                                                                                                                                                    |

### Worker Methods

| Method                   | Returns                             | Description                                                                                                                                              |
| ------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shutdown()`             | `Promise<{ forceExited: boolean }>` | Graceful shutdown; resolves once all worker output has been written to the parent's stdout/stderr; removes process exit handler; rejects if called twice |
| `shutdownNow()`          | `void`                              | Immediate shutdown; idempotent                                                                                                                           |
| `setOnActivity(cb)`      | `void`                              | Replace the activity callback                                                                                                                            |
| `setOnActivityAbort(cb)` | `void`                              | Replace the activity-abort callback                                                                                                                      |

The Worker class registers a `process.on('exit')` handler that calls `shutdownNow()` to clean up workers when the parent exits. This handler is removed on `shutdown()`/`shutdownNow()` to prevent listener leaks. Internally, `shutdown()` calls `pool.shutdown()` and `shutdownNow()` calls `pool.shutdownNow()`.
