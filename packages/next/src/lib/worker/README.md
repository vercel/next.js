# Worker Pool

Custom worker pool implementation for Next.js, replacing `jest-worker`.

## Key Features

- **Lazy spawning**: Workers are created on-demand when jobs are dispatched, not at construction time
- **Dynamic scaling**: Worker count grows as concurrent jobs increase, up to `maxWorkers`
- **Per-worker concurrency**: Configurable concurrent calls per worker via `concurrencyPerWorker`
- **Boot throttling**: `maxBootingWorkers` limits how many workers start concurrently, preventing resource contention when many tasks arrive at once
- **Individual worker restart**: Hung or crashed workers are restarted without affecting others

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
| INITIALIZE | `[0, false, workerPath, setupArgs, workerId?]` |
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

Each CALL gets a unique `requestId` so responses can be correlated, enabling multiple concurrent calls per worker. The READY message is sent once per worker after the module is loaded and optional `setup()` completes, signaling the worker is fully initialized.

## Usage

### High-level (Worker class)

Used by build, export, type-check, and dev server:

```typescript
import { Worker } from '../lib/worker'

const worker = new Worker(require.resolve('./my-worker'), {
  exposedMethods: ['doWork'],
  numWorkers: 4,
  debuggerPortOffset: -1,
  isolatedMemory: false,
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

// Optional: called once before first method invocation
export async function setup(...setupArgs: unknown[]): Promise<void> { ... }

// Optional: called on END message
export async function teardown(): Promise<void> { ... }
```

## Options

### WorkerPool Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workerPath` | string | required | Absolute path to worker module |
| `maxWorkers` | number | required | Maximum worker processes/threads |
| `concurrencyPerWorker` | number | 1 | Max concurrent calls per worker |
| `enableWorkerThreads` | boolean | false | Use worker_threads instead of child_process |
| `forkOptions` | object | {} | env, execArgv for child processes |
| `setupArgs` | unknown[] | [] | Arguments for worker setup() function |
| `maxRespawns` | number | 0 | Max times a worker slot is respawned after a crash (in-flight requests are always rejected; this only pre-spawns a replacement) |
| `maxBootingWorkers` | number | ceil(maxWorkers/4) | Max workers that can be starting up concurrently. A worker is "booting" from spawn until it sends READY after loading its module and running setup(). Prevents resource contention when many tasks arrive simultaneously. |

### Worker Options (high-level)

Inherits all WorkerPool options plus:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `numWorkers` | number | 1 | Maps to maxWorkers |
| `debuggerPortOffset` | number | required | Debugger port offset (-1 = not inspectable) |
| `isolatedMemory` | boolean | required | Don't forward --max-old-space-size |
| `enableSourceMaps` | boolean | false | Add --enable-source-maps to NODE_OPTIONS |
| `timeout` | number | undefined | Kill and replace pool if no activity within this duration (ms) |
| `exposedMethods` | string[] | required | Methods to wire up from worker module |
| `onActivity` | () => void | undefined | Called on task start/complete |
| `onActivityAbort` | () => void | undefined | Called when worker produces output |
