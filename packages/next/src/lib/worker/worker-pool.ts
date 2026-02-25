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
  type ParentMessage,
  type ChildMessageInitialize,
} from './types'

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
   * Maximum times a worker process is respawned after a non-zero exit.
   * Note: in-flight requests on the crashed worker are always rejected;
   * this only controls whether a replacement process is pre-spawned so the
   * next dispatch doesn't pay the startup cost. (default: 0)
   */
  maxRespawns?: number
  /** Called when a worker process exits unexpectedly */
  onWorkerExit?: (code: number | null, signal: string | null) => void
  /** Called when a worker sends a custom message */
  onCustomMessage?: (message: unknown) => void
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

interface QueuedTask {
  method: string
  args: unknown[]
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

interface PoolWorker {
  /** The underlying child process or worker thread */
  process: ChildProcess | NodeWorker
  /** Map of in-flight request IDs to their resolve/reject callbacks */
  activeRequests: Map<number, PendingRequest>
  /** Worker index (for JEST_WORKER_ID) */
  workerId: number
  /** Number of times this worker slot has been respawned after crashes */
  respawnCount: number
  /** Whether this worker is being terminated (graceful or forced) */
  ending: boolean
}

const FORCE_EXIT_DELAY = 500

/**
 * A worker abstraction that wraps `ChildProcess` and `NodeWorker`,
 * exposing a uniform interface for message passing, exit handling, and
 * lifecycle management. This avoids repeated `instanceof` checks
 * throughout the pool logic.
 */
class WorkerHandle {
  private _isThread: boolean
  private _proc: ChildProcess | NodeWorker

  constructor(proc: ChildProcess | NodeWorker) {
    this._isThread = proc instanceof NodeWorker
    this._proc = proc
  }

  /** Send a message to the worker */
  send(message: unknown[]): void {
    if (this._isThread) {
      ;(this._proc as NodeWorker).postMessage(message)
    } else {
      ;(this._proc as ChildProcess).send(message, () => {})
    }
  }

  /** Listen for messages from the worker */
  onMessage(callback: (message: ParentMessage) => void): void {
    this._proc.on('message', callback as (...args: unknown[]) => void)
  }

  /** Listen for exit events. worker_threads only emits a code; signal is null. */
  onExit(callback: (code: number | null, signal: string | null) => void): void {
    if (this._isThread) {
      ;(this._proc as NodeWorker).on('exit', (code) => callback(code, null))
    } else {
      ;(this._proc as ChildProcess).on('exit', callback)
    }
  }

  /** Wait for the worker to exit */
  waitForExit(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this._isThread) {
        ;(this._proc as NodeWorker).once('exit', () => resolve())
      } else {
        ;(this._proc as ChildProcess).once('exit', () => resolve())
      }
    })
  }

  /**
   * Listen for spawn/communication errors. Without this, errors like
   * "failed to fork" would surface as unhandled 'error' events.
   */
  onError(callback: (error: Error) => void): void {
    this._proc.on('error', callback)
  }

  /** Get a readable stream (stdout or stderr) from the worker */
  getOutputStream(type: 'stdout' | 'stderr'): NodeJS.ReadableStream | null {
    if (this._isThread) {
      return (this._proc as NodeWorker)[type]
    }
    return (this._proc as ChildProcess)[type] ?? null
  }

  /** Gracefully kill (SIGINT for processes, terminate for threads) */
  kill(): void {
    if (this._isThread) {
      ;(this._proc as NodeWorker).terminate()
    } else {
      ;(this._proc as ChildProcess).kill('SIGINT')
    }
  }

  /** Force-kill (SIGKILL for processes, terminate for threads) */
  forceKill(): void {
    if (this._isThread) {
      ;(this._proc as NodeWorker).terminate()
    } else {
      ;(this._proc as ChildProcess).kill('SIGKILL')
    }
  }
}

export class WorkerPool {
  private _options: Required<
    Pick<
      WorkerPoolOptions,
      | 'workerPath'
      | 'maxWorkers'
      | 'concurrencyPerWorker'
      | 'enableWorkerThreads'
      | 'maxRespawns'
    >
  > &
    WorkerPoolOptions

  private _workers: PoolWorker[] = []
  /** Handles keyed by PoolWorker identity for uniform process operations */
  private _handles = new WeakMap<PoolWorker, WorkerHandle>()
  private _taskQueue: QueuedTask[] = []
  private _nextRequestId = 1
  private _nextWorkerId = 0
  private _ending = false
  private _stdout: PassThrough
  private _stderr: PassThrough

  constructor(options: WorkerPoolOptions) {
    this._options = {
      concurrencyPerWorker: 1,
      enableWorkerThreads: false,
      maxRespawns: options.maxRespawns ?? 0,
      ...options,
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
      return Promise.reject(
        new Error('Worker pool is ending, no more calls can be made')
      )
    }

    return new Promise<unknown>((resolve, reject) => {
      // Try to find a worker with available concurrency slots
      const worker = this._findAvailableWorker()
      if (worker) {
        this._sendCall(worker, method, args, resolve, reject)
        return
      }

      // If we can spawn more workers, do so
      if (this._workers.length < this._options.maxWorkers) {
        const newWorker = this._spawnWorker()
        this._sendCall(newWorker, method, args, resolve, reject)
        return
      }

      // All workers busy and at max capacity — queue the task
      this._taskQueue.push({ method, args, resolve, reject })
    })
  }

  getStdout(): PassThrough {
    return this._stdout
  }

  getStderr(): PassThrough {
    return this._stderr
  }

  getWorkerCount(): number {
    return this._workers.length
  }

  /**
   * Gracefully shut down all workers.
   *
   * Sends CHILD_MESSAGE_END to each worker, waits for exit (with a
   * FORCE_EXIT_DELAY safety timeout), and rejects any queued or in-flight
   * requests that haven't completed.
   */
  async end(): Promise<{ forceExited: boolean }> {
    this._ending = true

    // Reject queued tasks that will never be dispatched
    for (const task of this._taskQueue) {
      task.reject(new Error('Worker pool ended before task could be processed'))
    }
    this._taskQueue = []

    if (this._workers.length === 0) {
      this._stdout.end()
      this._stderr.end()
      return { forceExited: false }
    }

    const results = await Promise.all(
      this._workers.map(async (worker) => {
        worker.ending = true

        const handle = this._handles.get(worker)!

        // Send END message to trigger teardown in the child
        handle.send([CHILD_MESSAGE_END])

        // Wait for exit with timeout — if the child doesn't exit within
        // FORCE_EXIT_DELAY we SIGKILL it
        let forceExited = false
        const exitPromise = handle.waitForExit()
        const timeout = setTimeout(() => {
          handle.forceKill()
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

    this._workers = []
    this._stdout.end()
    this._stderr.end()

    return { forceExited: results.some(Boolean) }
  }

  /**
   * Force-kill all workers immediately.
   * All in-flight requests and queued tasks are rejected.
   */
  close(): void {
    this._ending = true
    for (const task of this._taskQueue) {
      task.reject(new Error('Worker pool closed'))
    }
    this._taskQueue = []

    for (const worker of this._workers) {
      worker.ending = true
      this._rejectActiveRequests(worker, new Error('Worker pool closed'))
      this._handles.get(worker)?.forceKill()
    }
    this._workers = []
  }

  // ---------------------------------------------------------------------------
  // Internal: worker lifecycle
  // ---------------------------------------------------------------------------

  private _findAvailableWorker(): PoolWorker | null {
    for (const worker of this._workers) {
      if (
        !worker.ending &&
        worker.activeRequests.size < this._options.concurrencyPerWorker
      ) {
        return worker
      }
    }
    return null
  }

  private _spawnWorker(): PoolWorker {
    const workerId = this._nextWorkerId++
    return this._spawnWorkerProcess(workerId)
  }

  /**
   * Spawn a new worker process/thread and register it with the pool.
   *
   * If `existingRespawnCount` is provided (from a crashed worker being
   * replaced), the new PoolWorker inherits that count so the
   * maxRespawns limit is correctly enforced across respawns.
   */
  private _spawnWorkerProcess(
    workerId: number,
    existingRespawnCount: number = 0
  ): PoolWorker {
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
          JEST_WORKER_ID: String(workerId + 1),
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
      activeRequests: new Map(),
      workerId,
      respawnCount: existingRespawnCount,
      ending: false,
    }
    this._handles.set(worker, handle)

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
    const initMessage: ChildMessageInitialize = [
      CHILD_MESSAGE_INITIALIZE,
      false,
      workerPath,
      setupArgs ?? [],
    ]
    if (enableWorkerThreads) {
      initMessage.push(String(workerId + 1))
    }
    handle.send(initMessage)

    this._workers.push(worker)
    return worker
  }

  // ---------------------------------------------------------------------------
  // Internal: request dispatch
  // ---------------------------------------------------------------------------

  private _sendCall(
    worker: PoolWorker,
    method: string,
    args: unknown[],
    resolve: (value: unknown) => void,
    reject: (error: unknown) => void
  ): void {
    const requestId = this._nextRequestId++
    worker.activeRequests.set(requestId, { resolve, reject })
    this._handles
      .get(worker)!
      .send([CHILD_MESSAGE_CALL, requestId, method, args])
  }

  // ---------------------------------------------------------------------------
  // Internal: message handling
  // ---------------------------------------------------------------------------

  private _handleMessage(worker: PoolWorker, message: ParentMessage): void {
    switch (message[0]) {
      case PARENT_MESSAGE_OK: {
        const requestId = message[1]
        const result = message[2]
        const pending = worker.activeRequests.get(requestId)
        if (pending) {
          worker.activeRequests.delete(requestId)
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
          pending.reject(error)
          this._dequeueTask(worker)
        }
        break
      }
      case PARENT_MESSAGE_SETUP_ERROR: {
        const error = new Error('Error when calling setup: ' + message[2])
        ;(error as any).type = message[1]
        error.stack = message[3]
        // Setup errors affect all in-flight requests on this worker
        this._rejectActiveRequests(worker, error)
        break
      }
      case PARENT_MESSAGE_CUSTOM: {
        this._options.onCustomMessage?.(message[1])
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
    const errorProperties = message[5]
    let error: Error
    if (errorProperties != null && typeof errorProperties === 'object') {
      const ErrorConstructor =
        typeof (globalThis as any)[message[2]] === 'function'
          ? (globalThis as any)[message[2]]
          : Error
      error = new ErrorConstructor(message[3])
      ;(error as any).type = message[2]
      error.stack = message[4]
      for (const key in errorProperties as Record<string, unknown>) {
        ;(error as any)[key] = (errorProperties as Record<string, unknown>)[key]
      }
    } else {
      error = new Error(message[3])
      ;(error as any).type = message[2]
      error.stack = message[4]
    }
    return error
  }

  // ---------------------------------------------------------------------------
  // Internal: exit and error handling
  // ---------------------------------------------------------------------------

  private _handleExit(
    worker: PoolWorker,
    code: number | null,
    signal: string | null
  ): void {
    // During graceful shutdown, exit is expected — reject any lingering
    // in-flight requests that the child didn't respond to before exiting.
    if (worker.ending) {
      this._rejectActiveRequests(
        worker,
        new Error('Worker exited during shutdown')
      )
      return
    }

    const hasInFlightRequests = worker.activeRequests.size > 0

    // Notify the caller about the unexpected exit
    this._options.onWorkerExit?.(code, signal)

    if (
      code !== 0 &&
      code !== null &&
      worker.respawnCount < this._options.maxRespawns
    ) {
      // Respawn a replacement worker in this slot. We reject in-flight
      // requests because we don't have the original method/args to retry.
      const pendingRequests = new Map(worker.activeRequests)
      worker.activeRequests.clear()

      const idx = this._workers.indexOf(worker)
      this._spawnWorkerProcess(worker.workerId, worker.respawnCount + 1)
      // Remove the old entry (spawnWorkerProcess pushed the new one)
      if (idx !== -1) {
        this._workers.splice(idx, 1)
      }

      for (const [, pending] of pendingRequests) {
        pending.reject(
          new Error(
            `Worker exited unexpectedly with code ${code}, signal ${signal}`
          )
        )
      }
    } else {
      // No respawn — reject all in-flight requests and remove from pool
      this._rejectActiveRequests(
        worker,
        new Error(
          `Worker exited with code ${code}${signal ? `, signal ${signal}` : ''}`
        )
      )

      const idx = this._workers.indexOf(worker)
      if (idx !== -1) {
        this._workers.splice(idx, 1)
      }

      // If there are queued tasks, spawn a replacement worker
      if (this._taskQueue.length > 0 && !this._ending) {
        const newWorker = this._spawnWorker()
        this._drainQueue(newWorker)
      }
    }

    if (hasInFlightRequests && !this._ending) {
      // Drain queue to any workers that now have capacity
      this._drainQueueToAvailable()
    }
  }

  /**
   * Handle errors on the child process itself (e.g. ENOMEM, EMFILE, failed
   * to spawn). These are distinct from errors thrown by worker code.
   */
  private _handleSpawnError(worker: PoolWorker, error: Error): void {
    this._rejectActiveRequests(worker, error)
  }

  // ---------------------------------------------------------------------------
  // Internal: task queue
  // ---------------------------------------------------------------------------

  /** Dequeue one task into a worker that has capacity */
  private _dequeueTask(worker: PoolWorker): void {
    if (
      worker.ending ||
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
      !worker.ending &&
      worker.activeRequests.size < this._options.concurrencyPerWorker
    ) {
      const task = this._taskQueue.shift()!
      this._sendCall(worker, task.method, task.args, task.resolve, task.reject)
    }
  }

  /** Drain queued tasks across all workers that have capacity */
  private _drainQueueToAvailable(): void {
    while (this._taskQueue.length > 0) {
      const worker = this._findAvailableWorker()
      if (!worker) break
      const task = this._taskQueue.shift()!
      this._sendCall(worker, task.method, task.args, task.resolve, task.reject)
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: helpers
  // ---------------------------------------------------------------------------

  /** Reject all in-flight requests on a worker and clear the map */
  private _rejectActiveRequests(worker: PoolWorker, error: Error): void {
    for (const [, pending] of worker.activeRequests) {
      pending.reject(error)
    }
    worker.activeRequests.clear()
  }
}
