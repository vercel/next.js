import { Transform } from 'stream'
import os from 'os'
import {
  formatDebugAddress,
  formatNodeOptions,
  getNodeDebugType,
  getParsedDebugAddress,
  getParsedNodeOptions,
  type DebugAddress,
} from '../../server/lib/utils'
import { WorkerPool, WorkerExitError } from './worker-pool'

export { WorkerPool, WorkerExitError } from './worker-pool'

export interface WorkerOptions {
  /**
   * Human-readable name for this worker, used in error messages.
   * e.g. "Next.js build worker" produces "Next.js build worker exited with code: ..."
   */
  workerName?: string
  /** Extra environment variables to merge into the worker process environment */
  forkOptions?: {
    env?: Partial<NodeJS.ProcessEnv> | undefined
  }
  /**
   * Maximum number of workers to spawn (default: os.cpus().length - 1, minimum 1)
   */
  maxWorkers?: number
  /**
   * Maximum concurrent calls per worker (default: 1).
   * When all existing workers are at this limit a new worker is spawned
   * (up to `maxWorkers`). Tasks that arrive after all workers are at
   * capacity are placed in a FIFO queue.
   */
  concurrencyPerWorker?: number
  /**
   * Offset added to the parent's debugger port for worker processes.
   * When set (including 0), workers attach a debugger at
   * `parentPort + 1 + debuggerPortOffset`. When `undefined`, workers
   * do not attach a debugger. (default: undefined)
   */
  debuggerPortOffset?: number
  /** If true, passes `--enable-source-maps` to worker processes (default: false) */
  enableSourceMaps?: boolean
  /**
   * If true, strips `--max-old-space-size` from NODE_OPTIONS (default: false)
   */
  isolatedMemory?: boolean
  /**
   * Per-worker inactivity timeout in milliseconds. Workers with in-flight
   * requests that don't report activity within this window are killed and
   * replaced individually. Passed through to WorkerPool. (default: no timeout)
   */
  timeout?: number
  /** Called when a worker reports activity (heartbeat for progress indicators) */
  onActivity?: () => void
  /** Called to abort the activity indicator (e.g. when workers write to stdout/stderr) */
  onActivityAbort?: () => void
  /** Called before retrying a method call after a WorkerExitError */
  onRestart?: (method: string, args: any[], attempts: number) => void
  /** Method names exported by the worker module to expose on this Worker instance */
  exposedMethods: ReadonlyArray<string>
  /** Use worker_threads instead of child_process (default: false) */
  enableWorkerThreads?: boolean
  /** Number of times to retry a call that fails with WorkerExitError (default: 0) */
  maxRetries?: number
  /**
   * Maximum number of workers booting simultaneously.
   * Passed through to WorkerPool. (default: Math.ceil(maxWorkers / 4))
   */
  maxBootingWorkers?: number
}

interface BuildWorkerEnvOptions {
  debuggerPortOffset?: number
  enableSourceMaps?: boolean
  isolatedMemory?: boolean
  forkOptions?: { env?: Partial<NodeJS.ProcessEnv> }
}

/**
 * Build the environment variables for worker processes. This handles:
 * - Forwarding NODE_OPTIONS (stripping debugger flags and --max-old-space-size)
 * - Re-attaching the debugger on a different port when inspectable
 * - Enabling source maps
 * - Propagating color support (mirroring picocolors' heuristic)
 */
function buildWorkerEnv(options: BuildWorkerEnvOptions): {
  env: Record<string, string | undefined>
  execArgv: string[]
} {
  const { debuggerPortOffset, enableSourceMaps, isolatedMemory, forkOptions } =
    options

  const nodeOptions = getParsedNodeOptions()
  const originalOptions = { ...nodeOptions }
  delete nodeOptions.inspect
  delete nodeOptions['inspect-brk']
  delete nodeOptions['inspect_brk']

  if (debuggerPortOffset != null) {
    const nodeDebugType = getNodeDebugType(originalOptions)
    if (nodeDebugType) {
      const debuggerAddress = getParsedDebugAddress(
        originalOptions[nodeDebugType]
      )
      const address: DebugAddress = {
        host: debuggerAddress.host,
        port:
          debuggerAddress.port === 0
            ? 0
            : // +1 reserves the base debug port for the parent process;
              // debuggerPortOffset separates different worker roles
              // (e.g. export-page = 0, so the first worker gets base + 1 + 0).
              debuggerAddress.port + 1 + debuggerPortOffset,
      }
      nodeOptions[nodeDebugType] = formatDebugAddress(address)
    }
  }

  if (enableSourceMaps) {
    nodeOptions['enable-source-maps'] = true
  }

  if (isolatedMemory === true) {
    delete nodeOptions['max-old-space-size']
    delete nodeOptions['max_old_space_size']
  }

  const { nodeOptions: formattedNodeOptions, execArgv } =
    formatNodeOptions(nodeOptions)

  const env: Record<string, string | undefined> = {
    ...process.env,
    ...((forkOptions?.env || {}) as Record<string, string | undefined>),
    IS_NEXT_WORKER: 'true',
    NODE_OPTIONS: formattedNodeOptions,
  }

  // Propagate color support to workers.
  // Picocolors snapshots process.env/stdout.isTTY at module load time.
  // Since worker stdio is piped, the worker's own check would disable colors.
  // We re-evaluate the parent's conditions here to opt the worker into color
  // output, while still respecting explicit opt-outs like NO_COLOR.
  if (env.FORCE_COLOR === undefined) {
    const supportsColors =
      !env.NO_COLOR &&
      !env.CI &&
      env.TERM !== 'dumb' &&
      (process.stdout.isTTY || process.stderr?.isTTY)

    if (supportsColors) {
      env.FORCE_COLOR = '1'
    }
  }

  return { env, execArgv }
}

export class Worker {
  private _pool: WorkerPool | undefined

  private _onActivity: (() => void) | undefined
  private _onActivityAbort: (() => void) | undefined
  /**
   * Tracks whether onActivityAbort has already fired since the last
   * setOnActivityAbort() call. Reset when the caller re-registers the callback
   * so that each new progress spinner gets exactly one abort notification.
   */
  private _activityAborted = false

  /**
   * Bound exit handler registered on `process`. Stored so it can be removed
   * when the worker is ended/closed, preventing listener leaks when many
   * Worker instances are created and destroyed during a build.
   */
  private _exitHandler: (() => void) | undefined

  constructor(workerPath: string, options: WorkerOptions) {
    const {
      workerName,
      enableSourceMaps,
      timeout,
      onRestart,
      debuggerPortOffset,
      isolatedMemory,
      onActivity,
      onActivityAbort,
      exposedMethods,
      enableWorkerThreads,
      maxWorkers: maxWorkersOption,
      maxRetries = 0,
      concurrencyPerWorker,
      forkOptions,
      maxBootingWorkers,
    } = options

    this._onActivity = onActivity
    this._onActivityAbort = onActivityAbort

    // Register an exit handler to ensure workers are cleaned up.
    // We keep a reference so it can be removed when shutdown()/shutdownNow() is called.
    this._exitHandler = () => {
      this.shutdownNow()
    }
    process.on('exit', this._exitHandler)

    const { env: workerEnv, execArgv } = buildWorkerEnv({
      debuggerPortOffset,
      enableSourceMaps,
      isolatedMemory,
      forkOptions,
    })

    const onActivityAbortImpl = () => {
      if (!this._activityAborted) {
        this._activityAborted = true
        this._onActivityAbort?.()
      }
    }

    const pool = new WorkerPool({
      workerPath,
      maxWorkers: maxWorkersOption ?? Math.max(os.cpus().length - 1, 1),
      concurrencyPerWorker: concurrencyPerWorker ?? 1,
      enableWorkerThreads: enableWorkerThreads ?? false,
      maxBootingWorkers,
      timeout,
      forkOptions: {
        env: workerEnv,
        execArgv: [
          ...execArgv,
          ...process.execArgv.filter((arg) => !/^--(debug|inspect)/.test(arg)),
        ],
      },
      onCustomMessage: (data) => {
        if (
          data &&
          typeof data === 'object' &&
          'type' in data &&
          (data as any).type === 'activity'
        ) {
          this._onActivity?.()
        }
      },
    })

    this._pool = pool

    // Pipe stdout/stderr through a Transform that aborts the activity
    // spinner on first output, then forwards data to the parent process.
    const createAbortTransform = () =>
      new Transform({
        transform(chunk, _encoding, callback) {
          onActivityAbortImpl()
          callback(null, chunk)
        },
      })
    pool.getStdout().pipe(createAbortTransform()).pipe(process.stdout)
    pool.getStderr().pipe(createAbortTransform()).pipe(process.stderr)

    const dispatchWithRetry = async (
      method: string,
      args: unknown[]
    ): Promise<unknown> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this._pool!.dispatch(method, args)
        } catch (error) {
          if (error instanceof WorkerExitError) {
            if (attempt < maxRetries) {
              onRestart?.(method, args, attempt)
              continue
            }
            // Re-throw with workerName for a user-friendly message
            if (workerName) {
              throw new WorkerExitError(error.code, error.signal, workerName)
            }
          }
          throw error
        }
      }
    }

    for (const method of exposedMethods) {
      if (method.startsWith('_')) continue
      ;(this as any)[method] = (...args: any[]) => {
        return dispatchWithRetry(method, args)
      }
    }
  }

  setOnActivity(onActivity: (() => void) | undefined): void {
    this._onActivity = onActivity
  }
  setOnActivityAbort(onActivityAbort: (() => void) | undefined): void {
    this._onActivityAbort = onActivityAbort
    // Reset the guard so the new callback fires on the next stdout/stderr output.
    this._activityAborted = false
  }

  /** Remove the `process.on('exit')` handler to prevent listener leaks */
  private _removeExitHandler(): void {
    if (this._exitHandler) {
      process.removeListener('exit', this._exitHandler)
      this._exitHandler = undefined
    }
  }

  shutdown(): Promise<{ forceExited: boolean }> {
    const pool = this._pool
    if (!pool) {
      throw new Error('Worker is ended, no more calls can be done to it')
    }
    this._pool = undefined
    this._removeExitHandler()
    return pool.shutdown()
  }

  /**
   * Quietly end the worker if it exists
   */
  shutdownNow(): void {
    if (this._pool) {
      this._pool.shutdownNow()
      this._pool = undefined
    }
    this._removeExitHandler()
  }
}
