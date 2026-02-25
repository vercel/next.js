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
  /** Maximum retries when a worker crashes (default: 0) */
  maxRetries?: number
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
  /** Number of times this worker has been restarted after crashes */
  restartCount: number
  /** Whether this worker is being terminated */
  ending: boolean
}

const FORCE_EXIT_DELAY = 500

export class WorkerPool {
  private _options: Required<
    Pick<
      WorkerPoolOptions,
      | 'workerPath'
      | 'maxWorkers'
      | 'concurrencyPerWorker'
      | 'enableWorkerThreads'
      | 'maxRetries'
    >
  > &
    WorkerPoolOptions

  private _workers: PoolWorker[] = []
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
      maxRetries: 0,
      ...options,
    }

    if (!path.isAbsolute(this._options.workerPath)) {
      this._options.workerPath = require.resolve(this._options.workerPath)
    }

    this._stdout = new PassThrough()
    this._stderr = new PassThrough()
  }

  /**
   * Dispatch a method call to a worker. Workers are spawned lazily.
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

  /**
   * Restart a specific worker (kill and respawn).
   * In-flight requests on this worker will be rejected.
   */
  async restartWorker(worker: PoolWorker): Promise<PoolWorker> {
    // Reject all in-flight requests
    for (const [, pending] of worker.activeRequests) {
      pending.reject(new Error('Worker restarted due to timeout'))
    }
    worker.activeRequests.clear()

    // Kill the old process
    this._killWorkerProcess(worker)

    // Spawn a replacement
    const idx = this._workers.indexOf(worker)
    const newWorker = this._spawnWorkerProcess(worker.workerId)
    if (idx !== -1) {
      this._workers[idx] = newWorker
    }

    return newWorker
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
   */
  async end(): Promise<{ forceExited: boolean }> {
    this._ending = true

    // Reject queued tasks
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

        // Send END message
        this._sendMessage(worker, [CHILD_MESSAGE_END])

        // Wait for exit with timeout
        let forceExited = false
        const exitPromise = this._waitForExit(worker)
        const timeout = setTimeout(() => {
          this._forceKill(worker)
          forceExited = true
        }, FORCE_EXIT_DELAY)

        await exitPromise
        clearTimeout(timeout)
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
   */
  close(): void {
    this._ending = true
    for (const task of this._taskQueue) {
      task.reject(new Error('Worker pool closed'))
    }
    this._taskQueue = []

    for (const worker of this._workers) {
      worker.ending = true
      // Reject in-flight requests
      for (const [, pending] of worker.activeRequests) {
        pending.reject(new Error('Worker pool closed'))
      }
      worker.activeRequests.clear()
      this._forceKill(worker)
    }
    this._workers = []
  }

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

  private _spawnWorkerProcess(workerId: number): PoolWorker {
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

    const worker: PoolWorker = {
      process: proc,
      activeRequests: new Map(),
      workerId,
      restartCount: 0,
      ending: false,
    }

    // Pipe stdout/stderr
    const stdout = this._getOutputStream(proc, 'stdout')
    const stderr = this._getOutputStream(proc, 'stderr')
    if (stdout) {
      stdout.pipe(this._stdout, { end: false })
    }
    if (stderr) {
      stderr.pipe(this._stderr, { end: false })
    }

    // Handle messages from child
    this._onMessage(proc, (message: ParentMessage) => {
      this._handleMessage(worker, message)
    })

    // Handle exit
    this._onExit(proc, (code: number | null, signal: string | null) => {
      this._handleExit(worker, code, signal)
    })

    // Send INITIALIZE message
    const initMessage: ChildMessageInitialize = [
      CHILD_MESSAGE_INITIALIZE,
      false,
      workerPath,
      setupArgs ?? [],
    ]
    if (enableWorkerThreads) {
      initMessage.push(String(workerId + 1))
    }
    this._sendMessage(worker, initMessage)

    this._workers.push(worker)
    return worker
  }

  private _sendCall(
    worker: PoolWorker,
    method: string,
    args: unknown[],
    resolve: (value: unknown) => void,
    reject: (error: unknown) => void
  ): void {
    const requestId = this._nextRequestId++
    worker.activeRequests.set(requestId, { resolve, reject })
    this._sendMessage(worker, [CHILD_MESSAGE_CALL, requestId, method, args])
  }

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
            ;(error as any)[key] = (errorProperties as Record<string, unknown>)[
              key
            ]
          }
        } else {
          error = new Error(message[3])
          ;(error as any).type = message[2]
          error.stack = message[4]
        }
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
        for (const [, pending] of worker.activeRequests) {
          pending.reject(error)
        }
        worker.activeRequests.clear()
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

  private _handleExit(
    worker: PoolWorker,
    code: number | null,
    signal: string | null
  ): void {
    if (worker.ending) {
      return
    }

    const hasInFlightRequests = worker.activeRequests.size > 0

    // Notify about unexpected exit
    this._options.onWorkerExit?.(code, signal)

    if (
      code !== 0 &&
      code !== null &&
      worker.restartCount < this._options.maxRetries
    ) {
      // Respawn the worker
      worker.restartCount++
      const pendingRequests = new Map(worker.activeRequests)
      worker.activeRequests.clear()

      const idx = this._workers.indexOf(worker)
      this._spawnWorkerProcess(worker.workerId)
      // Remove the old entry (spawnWorkerProcess pushed a new one)
      if (idx !== -1) {
        this._workers.splice(idx, 1)
      }

      // Re-dispatch pending requests to new worker
      for (const [, pending] of pendingRequests) {
        // We don't know the original method/args, so reject and let caller retry
        pending.reject(
          new Error(
            `Worker exited unexpectedly with code ${code}, signal ${signal}`
          )
        )
      }
    } else {
      // Reject all in-flight requests
      for (const [, pending] of worker.activeRequests) {
        pending.reject(
          new Error(
            `Worker exited with code ${code}${signal ? `, signal ${signal}` : ''}`
          )
        )
      }
      worker.activeRequests.clear()

      // Remove from pool
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
      // Drain queue to any available workers
      this._drainQueueToAvailable()
    }
  }

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

  private _drainQueueToAvailable(): void {
    while (this._taskQueue.length > 0) {
      const worker = this._findAvailableWorker()
      if (!worker) break
      const task = this._taskQueue.shift()!
      this._sendCall(worker, task.method, task.args, task.resolve, task.reject)
    }
  }

  private _sendMessage(worker: PoolWorker, message: unknown[]): void {
    if (worker.process instanceof NodeWorker) {
      worker.process.postMessage(message)
    } else {
      ;(worker.process as ChildProcess).send(message, () => {})
    }
  }

  private _onMessage(
    proc: ChildProcess | NodeWorker,
    callback: (message: ParentMessage) => void
  ): void {
    if (proc instanceof NodeWorker) {
      proc.on('message', callback)
    } else {
      proc.on('message', callback)
    }
  }

  private _onExit(
    proc: ChildProcess | NodeWorker,
    callback: (code: number | null, signal: string | null) => void
  ): void {
    if (proc instanceof NodeWorker) {
      proc.on('exit', (code) => callback(code, null))
    } else {
      proc.on('exit', callback)
    }
  }

  private _waitForExit(worker: PoolWorker): Promise<void> {
    return new Promise<void>((resolve) => {
      if (worker.process instanceof NodeWorker) {
        worker.process.once('exit', () => resolve())
      } else {
        ;(worker.process as ChildProcess).once('exit', () => resolve())
      }
    })
  }

  private _killWorkerProcess(worker: PoolWorker): void {
    if (worker.process instanceof NodeWorker) {
      worker.process.terminate()
    } else {
      ;(worker.process as ChildProcess).kill('SIGINT')
    }
  }

  private _forceKill(worker: PoolWorker): void {
    if (worker.process instanceof NodeWorker) {
      worker.process.terminate()
    } else {
      ;(worker.process as ChildProcess).kill('SIGKILL')
    }
  }

  private _getOutputStream(
    proc: ChildProcess | NodeWorker,
    type: 'stdout' | 'stderr'
  ): NodeJS.ReadableStream | null {
    if (proc instanceof NodeWorker) {
      return proc[type]
    } else {
      return (proc as ChildProcess)[type]
    }
  }
}
