# Worker Pool

Custom worker pool implementation for Next.js, replacing `jest-worker`.

## Key Features

- **Lazy spawning**: Workers are created on-demand when jobs are dispatched, not at construction time
- **Dynamic scaling**: Worker count grows as concurrent jobs increase, up to `maxWorkers`
- **Per-worker concurrency**: Configurable concurrent calls per worker via `concurrencyPerWorker`
- **Boot throttling**: `maxBootingWorkers` limits how many workers start concurrently, preventing resource contention when many tasks arrive at once
- **Fault recovery**: Workers that exit unexpectedly are removed from the pool; queued tasks are drained to remaining workers or trigger new worker spawns. The high-level `Worker` class supports `maxRetries` to automatically re-dispatch failed calls.
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

| Message | Format |
|---------|--------|
| INITIALIZE | `[0, false, workerPath, setupArgs]` |
| CALL | `[1, requestId, methodName, args]` |
| END | `[2]` |

### Child → Parent

| Message | Format |
|---------|--------|
| OK | `[0, requestId, result]` |
| CLIENT_ERROR | `[1, requestId, errorName, message, stack, properties]` |
| SETUP_ERROR | `[2, errorName, message, stack]` |
| CUSTOM | `[3, payload]` |
| READY | `[4]` |

Each CALL gets a unique `requestId` so responses can be correlated, enabling multiple concurrent calls per worker. The READY message is sent once per worker after the module is loaded and optional `setup()` completes, signaling the worker is fully initialized. If `setup()` fails, READY is not sent; the SETUP_ERROR handler frees the booting slot instead.

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
await worker.end()
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
await pool.end()
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

## Options

### WorkerPool Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workerPath` | string | required | Absolute path to worker module |
| `maxWorkers` | number | required | Maximum worker processes/threads |
| `concurrencyPerWorker` | number | 1 | Max concurrent calls per worker |
| `enableWorkerThreads` | boolean | false | Use worker_threads instead of child_process |
| `forkOptions.env` | object | {} | Environment variables for child processes |
| `forkOptions.execArgv` | string[] | [] | Node.js CLI flags for child processes |
| `setupArgs` | unknown[] | [] | Arguments for worker `setup()` function |
| `maxBootingWorkers` | number | ceil(maxWorkers/4) | Max workers starting up concurrently (must be >= 1). A worker is "booting" from spawn until it sends READY after module load + setup(). |
| `onWorkerExit` | function | undefined | `(code, signal) => void` — called when a worker exits unexpectedly (not during graceful shutdown) |
| `onCustomMessage` | function | undefined | `(message) => void` — called when a worker sends a CUSTOM message |

### WorkerPool Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `dispatch(method, args)` | `Promise<unknown>` | Call a method on a worker; spawns/queues as needed |
| `end()` | `Promise<{ forceExited: boolean }>` | Graceful shutdown: sends END to workers, waits for exit (500ms force-kill timeout) |
| `close()` | `void` | Immediate shutdown: force-kills all workers, rejects in-flight and queued tasks |
| `getStdout()` | `PassThrough` | Merged stdout stream from all workers |
| `getStderr()` | `PassThrough` | Merged stderr stream from all workers |
| `getWorkerCount()` | `number` | Number of currently alive workers |

### Worker Options (high-level)

The `Worker` class wraps `WorkerPool` and adds timeout/restart logic, NODE_OPTIONS management, and exposed method wiring.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `exposedMethods` | string[] | required | Methods to wire up from worker module (underscore-prefixed names are skipped) |
| `workerName` | string | undefined | Human-readable name for error messages (e.g. "Next.js build worker") |
| `debuggerPortOffset` | number \| undefined | undefined | Debugger port offset; `undefined` = not inspectable |
| `isolatedMemory` | boolean | false | If true, strips `--max-old-space-size` from NODE_OPTIONS |
| `maxWorkers` | number | cpus - 1 (min 1) | Maximum number of workers to spawn |
| `maxRetries` | number | 0 | Number of times to re-dispatch a call after a `WorkerExitError` (worker crash). Non-crash errors are never retried. |
| `onRestart` | function | undefined | `(method, args, attempt) => void` — called before each retry attempt |
| `maxBootingWorkers` | number | ceil(maxWorkers/4) | Passed through to WorkerPool |
| `concurrencyPerWorker` | number | 1 | Passed through to WorkerPool |
| `enableWorkerThreads` | boolean | false | Passed through to WorkerPool |
| `enableSourceMaps` | boolean | false | Adds `--enable-source-maps` to NODE_OPTIONS |
| `timeout` | number | undefined | Kill and recreate the pool if no activity within this duration (ms) |
| `forkOptions.env` | object | {} | Merged into worker environment |
| `onActivity` | function | undefined | Called when a task starts/completes (used for activity spinners) |
| `onActivityAbort` | function | undefined | Called when a worker produces stdout/stderr output |
| `logger` | object | console | Logger with `error`, `info`, `warn` methods |

### Worker Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `end()` | `Promise<{ forceExited: boolean }>` | Graceful shutdown; removes process exit handler; throws if called twice |
| `close()` | `void` | Immediate shutdown; idempotent |
| `setOnActivity(cb)` | `void` | Replace the activity callback |
| `setOnActivityAbort(cb)` | `void` | Replace the activity-abort callback |

The Worker class registers a `process.on('exit')` handler that calls `close()` to clean up workers when the parent exits. This handler is removed on `end()`/`close()` to prevent listener leaks.
