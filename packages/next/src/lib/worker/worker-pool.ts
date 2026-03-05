import type { ChildProcess } from 'child_process'
import { fork } from 'child_process'
import { Worker as NodeWorker } from 'worker_threads'
import { PassThrough } from 'stream'
import path from 'path'
import {
  CHILD_MESSAGE_INITIALIZE,
  CHILD_MESSAGE_CALL,
  CHILD_MESSAGE_END,
  PARENT_MESSAGE_OK,
  PARENT_MESSAGE_CLIENT_ERROR,
  PARENT_MESSAGE_SETUP_ERROR,
  PARENT_MESSAGE_CUSTOM,
  PARENT_MESSAGE_READY,
  type ParentMessage,
  type ChildMessageInitialize,
} from './types'

/**
 * Error thrown when a worker process exits unexpectedly (non-zero exit code
 * or signal). Callers can use `instanceof WorkerExitError` to distinguish
 * worker crashes from errors thrown by worker methods.
 */
export class WorkerExitError extends Error {
  code: number | null
  signal: string | null

  constructor(code: number | null, signal: string | null, workerName?: string) {
    super(
      `${workerName ?? 'Worker'} exited with code: ${code} and signal: ${signal}`
    )
    this.name = 'WorkerExitError'
    this.code = code
    this.signal = signal
  }
}

export interface WorkerPoolOptions {
  /** Absolute path to the worker module */
  workerPath: string
  /** Maximum number of workers to spawn */
  maxWorkers: number
  /** Maximum concurrent calls per worker (default: 1) */
  concurrencyPerWorker?: number
  /** Use worker_threads instead of child_process (default: false) */
  enableWorkerThreads?: boolean
  /** Options for child_process.fork() or worker_threads.Worker */
  forkOptions?: {
    env?: Partial<NodeJS.ProcessEnv>
    execArgv?: string[]
  }
  /** Arguments passed to the optional setup() function in the worker module */
  setupArgs?: unknown[]
  /**
   * Maximum number of workers that can be in the "booting" state at once.
   * A worker is booting from the moment it is spawned until it sends a
   * PARENT_MESSAGE_READY after loading its module and running setup().
   * This prevents resource contention when many tasks arrive simultaneously.
   * (default: Math.ceil(maxWorkers / 4))
   */
  maxBootingWorkers?: number
  /** Called when a worker process exits unexpectedly */
  onWorkerExit?: (code: number | null, signal: string | null) => void
  /** Called when a worker sends a custom message */
  onCustomMessage?: (message: unknown) => void
}

/** Resolve/reject callbacks stored for an in-flight request sent to a worker */
interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

/** A task waiting in the FIFO queue until a worker has capacity to accept it */
interface QueuedTask {
  method: string
  args: unknown[]
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

const enum WorkerState {
  /** Worker has been spawned but hasn't sent PARENT_MESSAGE_READY yet */
  BOOTING = 0,
  /** Worker is ready to accept calls */
  RUNNING = 1,
  /** Worker is being shut down (graceful or forced) */
  SHUTTING_DOWN = 2,
}

interface PoolWorker {
  /** The underlying child process or worker thread */
  process: ChildProcess | NodeWorker
  /** Uniform handle for message passing and lifecycle management */
  handle: WorkerHandle
  /** Map of in-flight request IDs to their resolve/reject callbacks */
  activeRequests: Map<number, PendingRequest>
  /** Current lifecycle state of this worker */
  state: WorkerState
}

/** Milliseconds to wait for a worker to exit gracefully before force-killing it */
const FORCE_EXIT_DELAY = 5000

/**
 * A worker abstraction that wraps `ChildProcess` and `NodeWorker`,
 * exposing a uniform interface for message passing, exit handling, and
 * lifecycle management. This avoids repeated `instanceof` checks
 * throughout the pool logic.
 */
class WorkerHandle {
  private _thread: NodeWorker | null
  private _process: ChildProcess | null

  constructor(proc: ChildProcess | NodeWorker) {
    if (proc instanceof NodeWorker) {
      this._thread = proc
      this._process = null
    } else {
      this._thread = null
      this._process = proc
    }
  }

  /** Send a message to the worker */
  send(message: unknown[]): void {
    if (this._thread) {
      this._thread.postMessage(message)
    } else {
      this._process!.send(message, () => {})
    }
  }

  /** Listen for messages from the worker */
  onMessage(callback: (message: ParentMessage) => void): void {
    const target = (this._thread ?? this._process)!
    target.on('message', callback as (...args: unknown[]) => void)
  }

  /** Listen for exit events. worker_threads only emits a code; signal is null. */
  onExit(callback: (code: number | null, signal: string | null) => void): void {
    if (this._thread) {
      this._thread.on('exit', (code) => callback(code, null))
    } else {
      this._process!.on('exit', callback)
    }
  }

  /** Wait for the worker to exit */
  waitForExit(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this._thread) {
        this._thread.once('exit', () => resolve())
      } else {
        this._process!.once('exit', () => resolve())
      }
    })
  }

  /**
   * Listen for spawn/communication errors. Without this, errors like
   * "failed to fork" would surface as unhandled 'error' events.
   */
  onError(callback: (error: Error) => void): void {
    const target = (this._thread ?? this._process)!
    target.on('error', callback)
  }

  /** Get a readable stream (stdout or stderr) from the worker */
  getOutputStream(type: 'stdout' | 'stderr'): NodeJS.ReadableStream | null {
    if (this._thread) {
      return this._thread[type]
    }
    return this._process![type] ?? null
  }

  /** Force-kill (SIGKILL for processes, terminate for threads) */
  forceKill(): void {
    if (this._thread) {
      this._thread.terminate()
    } else {
      this._process!.kill('SIGKILL')
    }
  }
}

/**
 * Low-level worker pool that manages process/thread lifecycle, task dispatch,
 * and queue draining. Workers are spawned lazily on the first dispatch and
 * scale up to `maxWorkers`. Use `dispatch()` to call exported functions in the
 * worker module and `shutdown()` or `shutdownNow()` to shut down.
 */
export class WorkerPool {
  private _options: Required<
    Pick<
      WorkerPoolOptions,
      | 'workerPath'
      | 'maxWorkers'
      | 'concurrencyPerWorker'
      | 'enableWorkerThreads'
      | 'maxBootingWorkers'
    >
  > &
    WorkerPoolOptions

  /** All workers currently alive (booting, running, or shutting down) */
  private _allWorkers = new Set<PoolWorker>()
  /** Workers in RUNNING state with available concurrency slots */
  private _availableWorkers = new Set<PoolWorker>()
  /** FIFO queue of tasks waiting for a worker with available capacity */
  private _taskQueue: QueuedTask[] = []
  /** Monotonically increasing counter for correlating requests to responses */
  private _nextRequestId = 1
  /** Set to true once `shutdown()` or `shutdownNow()` is called; prevents new dispatches */
  private _ending = false
  /** Number of workers currently in the booting state */
  private _bootingCount = 0
  /** Merged stdout from all workers, piped through a PassThrough stream */
  private _stdout: PassThrough
  /** Merged stderr from all workers, piped through a PassThrough stream */
  private _stderr: PassThrough

  /**
   * Create a new pool. No workers are spawned until the first `dispatch()` call.
   * Validates options and applies defaults for optional fields.
   */
  constructor(options: WorkerPoolOptions) {
    this._options = {
      ...options,
      concurrencyPerWorker: options.concurrencyPerWorker ?? 1,
      enableWorkerThreads: options.enableWorkerThreads ?? false,
      maxBootingWorkers:
        options.maxBootingWorkers ?? Math.ceil(options.maxWorkers / 4),
    }

    if (this._options.maxBootingWorkers < 1) {
      throw new Error('maxBootingWorkers must be at least 1')
    }

    if (!path.isAbsolute(this._options.workerPath)) {
      this._options.workerPath = require.resolve(this._options.workerPath)
    }

    this._stdout = new PassThrough()
    this._stderr = new PassThrough()
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a method call to a worker.
   *
   * Workers are spawned lazily: the first dispatch creates the first worker,
   * subsequent dispatches reuse existing workers or spawn new ones up to
   * `maxWorkers`. When every worker is at its `concurrencyPerWorker` limit
   * the task is placed in a FIFO queue and drained as workers complete calls.
   */
  dispatch(method: string, args: unknown[]): Promise<unknown> {
    if (this._ending) {
      return Promise.resolve().then(() => {
        throw new Error('Worker pool is ending, no more calls can be made')
      })
    }

    return new Promise<unknown>((resolve, reject) => {
      // Try to find a ready worker with available concurrency slots
      const worker = this._findAvailableWorker()
      if (worker) {
        this._sendCall(worker, method, args, resolve, reject)
        return
      }

      // If we can spawn more workers and haven't hit the booting limit,
      // start one but enqueue the task — the worker may take a while to
      // spawn and another worker could become ready first.
      if (this._canSpawnWorker()) {
        this._spawnWorker()
      }

      // Queue the task; it will be dispatched when a worker becomes ready
      // or finishes a previous call.
      this._taskQueue.push({ method, args, resolve, reject })
    })
  }

  /** Returns the merged stdout stream from all worker processes */
  getStdout(): PassThrough {
    return this._stdout
  }

  /** Returns the merged stderr stream from all worker processes */
  getStderr(): PassThrough {
    return this._stderr
  }

  /** Returns the number of currently alive workers (including booting ones) */
  getWorkerCount(): number {
    return this._allWorkers.size
  }

  /**
   * Gracefully shut down all workers.
   *
   * Sends CHILD_MESSAGE_END to each worker, waits for exit (with a
   * FORCE_EXIT_DELAY safety timeout), and rejects any queued or in-flight
   * requests that haven't completed.
   */
  async shutdown(): Promise<{ forceExited: boolean }> {
    this._ending = true

    // Reject queued tasks that will never be dispatched
    for (const task of this._taskQueue) {
      task.reject(new Error('Worker pool ended before task could be processed'))
    }
    this._taskQueue = []

    const results = await Promise.all(
      [...this._allWorkers].map(async (worker) => {
        worker.state = WorkerState.SHUTTING_DOWN

        // Send END message to trigger teardown in the child
        worker.handle.send([CHILD_MESSAGE_END])

        // Wait for exit with timeout — if the child doesn't exit within
        // FORCE_EXIT_DELAY we SIGKILL it
        let forceExited = false
        const exitPromise = worker.handle.waitForExit()
        const timeout = setTimeout(() => {
          worker.handle.forceKill()
          forceExited = true
        }, FORCE_EXIT_DELAY)

        await exitPromise
        clearTimeout(timeout)

        // Reject any requests that were still in-flight when the worker
        // exited. This prevents Promises from hanging forever (issue #11).
        this._rejectActiveRequests(
          worker,
          new Error('Worker pool ended while requests were in-flight')
        )

        return forceExited
      })
    )

    this._allWorkers.clear()
    this._availableWorkers.clear()
    this._stdout.end()
    this._stderr.end()

    return { forceExited: results.some(Boolean) }
  }

  /**
   * Force-kill all workers immediately.
   * All in-flight requests and queued tasks are rejected.
   * Sends an END message first to allow graceful cleanup, then force-kills.
   */
  shutdownNow(): void {
    this._ending = true
    for (const task of this._taskQueue) {
      task.reject(new Error('Worker pool closed'))
    }
    this._taskQueue = []

    for (const worker of this._allWorkers) {
      worker.state = WorkerState.SHUTTING_DOWN
      this._rejectActiveRequests(worker, new Error('Worker pool closed'))
      // Send END message to allow the child to clean up, then force-kill
      worker.handle.send([CHILD_MESSAGE_END])
      worker.handle.forceKill()
    }
    this._allWorkers.clear()
    this._availableWorkers.clear()
  }

  // ---------------------------------------------------------------------------
  // Internal: worker lifecycle
  // ---------------------------------------------------------------------------

  /** Pick a RUNNING worker with available concurrency slots (O(1) from set) */
  private _findAvailableWorker(): PoolWorker | null {
    const first = this._availableWorkers.values().next()
    return first.done ? null : first.value
  }

  /** Spawn a new worker process/thread and register it with the pool. */
  private _spawnWorker(): PoolWorker {
    const { workerPath, enableWorkerThreads, forkOptions, setupArgs } =
      this._options

    let proc: ChildProcess | NodeWorker

    if (enableWorkerThreads) {
      const threadChildPath = path.resolve(__dirname, 'worker-thread-child.js')
      proc = new NodeWorker(threadChildPath, {
        eval: false,
        stderr: true,
        stdout: true,
        ...forkOptions,
      })
    } else {
      const processChildPath = path.resolve(
        __dirname,
        'worker-process-child.js'
      )
      proc = fork(processChildPath, [], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...(forkOptions?.env as NodeJS.ProcessEnv),
        },
        execArgv:
          forkOptions?.execArgv ??
          process.execArgv.filter((arg) => !/^--(debug|inspect)/.test(arg)),
        silent: true,
      })
    }

    const handle = new WorkerHandle(proc)

    const worker: PoolWorker = {
      process: proc,
      handle,
      activeRequests: new Map(),
      state: WorkerState.BOOTING,
    }

    // Pipe stdout/stderr from the child into the pool-level streams
    const stdout = handle.getOutputStream('stdout')
    const stderr = handle.getOutputStream('stderr')
    if (stdout) {
      stdout.pipe(this._stdout, { end: false })
    }
    if (stderr) {
      stderr.pipe(this._stderr, { end: false })
    }

    // Handle IPC messages from child
    handle.onMessage((message: ParentMessage) => {
      this._handleMessage(worker, message)
    })

    // Handle unexpected exits (crashes, signals)
    handle.onExit((code: number | null, signal: string | null) => {
      this._handleExit(worker, code, signal)
    })

    // Handle spawn/communication errors so they don't become unhandled
    // 'error' events. Common causes: ENOMEM, EMFILE, invalid execPath.
    handle.onError((error: Error) => {
      this._handleSpawnError(worker, error)
    })

    // Send INITIALIZE message so the child knows which module to load
    handle.send([
      CHILD_MESSAGE_INITIALIZE,
      false,
      workerPath,
      setupArgs ?? [],
    ] satisfies ChildMessageInitialize)

    this._allWorkers.add(worker)
    this._bootingCount++
    return worker
  }

  // ---------------------------------------------------------------------------
  // Internal: request dispatch
  // ---------------------------------------------------------------------------

  /** Assign a unique request ID, store the promise callbacks, and send a CALL message to the worker */
  private _sendCall(
    worker: PoolWorker,
    method: string,
    args: unknown[],
    resolve: (value: unknown) => void,
    reject: (error: unknown) => void
  ): void {
    const requestId = this._nextRequestId++
    worker.activeRequests.set(requestId, { resolve, reject })
    // If this worker is now at capacity, remove it from the available set
    if (worker.activeRequests.size >= this._options.concurrencyPerWorker) {
      this._availableWorkers.delete(worker)
    }
    // worker_threads uses structured clone which rejects non-serializable
    // values (e.g. functions). JSON round-trip strips them, matching the
    // child_process JSON serialization behaviour.
    // TODO: Remove once callers stop passing functions in args.
    const sanitizedArgs = this._options.enableWorkerThreads
      ? JSON.parse(JSON.stringify(args))
      : args
    worker.handle.send([CHILD_MESSAGE_CALL, requestId, method, sanitizedArgs])
  }

  // ---------------------------------------------------------------------------
  // Internal: message handling
  // ---------------------------------------------------------------------------

  /** Route an incoming IPC message from a worker to the appropriate handler (OK, CLIENT_ERROR, SETUP_ERROR, CUSTOM, READY) */
  private _handleMessage(worker: PoolWorker, message: ParentMessage): void {
    switch (message[0]) {
      case PARENT_MESSAGE_OK: {
        const requestId = message[1]
        const result = message[2]
        const pending = worker.activeRequests.get(requestId)
        if (pending) {
          worker.activeRequests.delete(requestId)
          this._markAvailableIfRunning(worker)
          pending.resolve(result)
          this._dequeueTask(worker)
        }
        break
      }
      case PARENT_MESSAGE_CLIENT_ERROR: {
        const requestId = message[1]
        const error = this._deserializeError(message)
        const pending = worker.activeRequests.get(requestId)
        if (pending) {
          worker.activeRequests.delete(requestId)
          this._markAvailableIfRunning(worker)
          pending.reject(error)
          this._dequeueTask(worker)
        }
        break
      }
      case PARENT_MESSAGE_SETUP_ERROR: {
        const error = new Error('Error when calling setup: ' + message[2])
        ;(error as any).type = message[1]
        error.stack = message[3]
        // Setup errors affect all in-flight requests on this worker.
        // Reject them first, then clear booting so queued tasks can be
        // dispatched to this (now available) worker and new workers can spawn.
        this._rejectActiveRequests(worker, error)
        if (worker.state === WorkerState.BOOTING) {
          worker.state = WorkerState.RUNNING
          this._bootingCount--
          this._onWorkerReady(worker)
        }
        break
      }
      case PARENT_MESSAGE_CUSTOM: {
        this._options.onCustomMessage?.(message[1])
        break
      }
      case PARENT_MESSAGE_READY: {
        worker.state = WorkerState.RUNNING
        this._bootingCount--
        this._onWorkerReady(worker)
        break
      }
      default:
        break
    }
  }

  /**
   * Reconstruct an Error from a CLIENT_ERROR message.
   * If the child sent errorProperties (extra fields like `code`), they are
   * copied onto the error instance.
   */
  private _deserializeError(
    message: Extract<
      ParentMessage,
      [typeof PARENT_MESSAGE_CLIENT_ERROR, ...any]
    >
  ): Error {
    const [, , errorName, errorMessage, errorStack, errorProperties] = message

    // Use the named global constructor (e.g. TypeError, RangeError) when available
    const ErrorConstructor =
      errorProperties != null &&
      typeof errorProperties === 'object' &&
      typeof (globalThis as any)[errorName] === 'function'
        ? (globalThis as any)[errorName]
        : Error

    const error = new ErrorConstructor(errorMessage)
    ;(error as any).type = errorName
    error.stack = errorStack

    // Copy extra properties (e.g. `code`, `digest`) onto the error
    if (errorProperties != null && typeof errorProperties === 'object') {
      Object.assign(error, errorProperties)
    }

    return error
  }

  // ---------------------------------------------------------------------------
  // Internal: exit and error handling
  // ---------------------------------------------------------------------------

  /**
   * Handle a worker exit. During graceful shutdown, just reject lingering
   * requests. Otherwise, reject in-flight requests with WorkerExitError,
   * remove the worker, and drain queued tasks to remaining workers.
   */
  private _handleExit(
    worker: PoolWorker,
    code: number | null,
    signal: string | null
  ): void {
    if (worker.state === WorkerState.BOOTING) {
      this._bootingCount--
    }

    // During graceful shutdown, exit is expected — reject any lingering
    // in-flight requests that the child didn't respond to before exiting.
    if (worker.state === WorkerState.SHUTTING_DOWN) {
      this._rejectActiveRequests(
        worker,
        new Error('Worker exited during shutdown')
      )
      return
    }

    // Notify the caller about the unexpected exit
    this._options.onWorkerExit?.(code, signal)

    // Reject all in-flight requests and remove from pool
    this._rejectActiveRequests(worker, new WorkerExitError(code, signal))

    this._allWorkers.delete(worker)
    this._availableWorkers.delete(worker)

    // A slot freed up — try to spawn replacements for queued tasks
    if (!this._ending) {
      this._spawnForQueuedTasks()
    }
  }

  /**
   * Handle errors on the child process itself (e.g. ENOMEM, EMFILE, failed
   * to spawn). These are distinct from errors thrown by worker code.
   * Rejects in-flight requests and also rejects any queued tasks since the
   * spawn failure likely indicates a system-level problem (ENOMEM, EMFILE).
   */
  private _handleSpawnError(worker: PoolWorker, error: Error): void {
    this._rejectActiveRequests(worker, error)

    // Also reject all queued tasks — spawn errors typically indicate a
    // system-level problem that would affect new workers too.
    for (const task of this._taskQueue) {
      task.reject(error)
    }
    this._taskQueue = []
  }

  // ---------------------------------------------------------------------------
  // Internal: task queue
  // ---------------------------------------------------------------------------

  /** Dequeue one task into a worker that has capacity */
  private _dequeueTask(worker: PoolWorker): void {
    if (
      worker.state !== WorkerState.RUNNING ||
      worker.activeRequests.size >= this._options.concurrencyPerWorker
    ) {
      return
    }

    const task = this._taskQueue.shift()
    if (task) {
      this._sendCall(worker, task.method, task.args, task.resolve, task.reject)
    }
  }

  /** Drain as many queued tasks as a single worker can accept */
  private _drainQueue(worker: PoolWorker): void {
    while (
      this._taskQueue.length > 0 &&
      worker.state === WorkerState.RUNNING &&
      worker.activeRequests.size < this._options.concurrencyPerWorker
    ) {
      const task = this._taskQueue.shift()!
      this._sendCall(worker, task.method, task.args, task.resolve, task.reject)
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: booting management
  // ---------------------------------------------------------------------------

  /** Whether the pool has capacity to spawn another worker (under both maxWorkers and maxBootingWorkers limits) */
  private _canSpawnWorker(): boolean {
    return (
      this._allWorkers.size < this._options.maxWorkers &&
      this._bootingCount < this._options.maxBootingWorkers
    )
  }

  /**
   * Called when a worker transitions from booting to ready.
   * Adds it to the available set, drains queued tasks into it, then spawns
   * additional workers for remaining queued tasks (now that a booting slot freed up).
   */
  private _onWorkerReady(worker: PoolWorker): void {
    this._availableWorkers.add(worker)
    this._drainQueue(worker)
    this._spawnForQueuedTasks()
  }

  /**
   * Spawn new workers for queued tasks, respecting both maxWorkers and
   * maxBootingWorkers limits. Workers start in booting state; queued tasks
   * will be dispatched to them once they send PARENT_MESSAGE_READY.
   */
  private _spawnForQueuedTasks(): void {
    while (
      this._taskQueue.length > 0 &&
      !this._ending &&
      this._canSpawnWorker()
    ) {
      this._spawnWorker()
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: helpers
  // ---------------------------------------------------------------------------

  /** Add a worker to the available set if it is RUNNING and has capacity */
  private _markAvailableIfRunning(worker: PoolWorker): void {
    if (
      worker.state === WorkerState.RUNNING &&
      worker.activeRequests.size < this._options.concurrencyPerWorker
    ) {
      this._availableWorkers.add(worker)
    }
  }

  /** Reject all in-flight requests on a worker and clear the map */
  private _rejectActiveRequests(worker: PoolWorker, error: Error): void {
    for (const [, pending] of worker.activeRequests) {
      pending.reject(error)
    }
    worker.activeRequests.clear()
  }
}
