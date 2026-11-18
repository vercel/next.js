import { Transform } from 'stream'
import { finished } from 'stream/promises'
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
    /** Extra Node.js flags appended to the worker's `execArgv` */
    execArgv?: string[]
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
  /**
   * JSON round-trip call arguments for worker_threads. Passed through to
   * WorkerPool. (default: true)
   */
  sanitizeArgs?: boolean
  /** Number of times to retry a call that fails with WorkerExitError (default: 0) */
  maxRetries?: number
  /**
   * Maximum number of workers booting simultaneously.
   * Passed through to WorkerPool. (default: Math.ceil(maxWorkers / 4))
   */
  maxBootingWorkers?: number
  /**
   * If true, don't rewrite NODE_OPTIONS: workers get the environment as is
   * (including `forkOptions.env.NODE_OPTIONS`), and the parent's own CLI
   * flags are forwarded separately, like `jest-worker` did. Child processes
   * get `process.execArgv` without `--inspect`/`--debug` flags; worker
   * threads inherit the parent's flags. CLI flags therefore keep precedence
   * over NODE_OPTIONS, and flags that NODE_OPTIONS doesn't allow (e.g.
   * `--prof`) keep working. Can't be combined with `debuggerPortOffset`,
   * `enableSourceMaps` or `isolatedMemory`, which work by rewriting
   * NODE_OPTIONS. (default: false)
   */
  inheritParentExecArgv?: boolean
}

interface BuildWorkerEnvOptions {
  debuggerPortOffset?: number
  enableSourceMaps?: boolean
  isolatedMemory?: boolean
  inheritParentExecArgv?: boolean
  forkOptions?: { env?: Partial<NodeJS.ProcessEnv>; execArgv?: string[] }
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
  /** `undefined` lets WorkerPool apply the parent's flags (see `inheritParentExecArgv`) */
  execArgv: string[] | undefined
} {
  const {
    debuggerPortOffset,
    enableSourceMaps,
    isolatedMemory,
    inheritParentExecArgv,
    forkOptions,
  } = options

  if (inheritParentExecArgv) {
    if (
      debuggerPortOffset != null ||
      enableSourceMaps ||
      isolatedMemory === true
    ) {
      throw new Error(
        '`inheritParentExecArgv` cannot be combined with `debuggerPortOffset`, `enableSourceMaps` or `isolatedMemory`'
      )
    }
    return {
      env: withColorSupport({
        ...process.env,
        ...(forkOptions?.env || {}),
        IS_NEXT_WORKER: 'true',
      }),
      execArgv: forkOptions?.execArgv,
    }
  }

  const nodeOptions = getParsedNodeOptions()
  const originalOptions = { ...nodeOptions }
  delete nodeOptions.inspect
  delete nodeOptions['inspect-brk']
  delete nodeOptions['inspect_brk']
  // Not re-attached on another port below, so workers never inherit it.
  delete nodeOptions['inspect-wait']
  delete nodeOptions['inspect_wait']

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

  const env = withColorSupport({
    ...process.env,
    ...(forkOptions?.env || {}),
    IS_NEXT_WORKER: 'true',
    NODE_OPTIONS: formattedNodeOptions,
  })

  // Don't append the parent's `process.execArgv`: those flags are already in
  // NODE_OPTIONS (without `--inspect`, and without `--max-old-space-size` when
  // `isolatedMemory` is set). Passing them again would undo those filters, and
  // worker_threads reject per-process flags in `execArgv`.
  return { env, execArgv: [...execArgv, ...(forkOptions?.execArgv ?? [])] }
}

function withColorSupport(
  env: Record<string, string | undefined>
): Record<string, string | undefined> {
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

  return env
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

  /**
   * Transforms forwarding the pool's stdout/stderr to the parent process.
   * `shutdown()` waits for them so all worker output has been written when
   * it resolves.
   */
  private _outputForwarders: Transform[] = []

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
      sanitizeArgs,
      maxWorkers: maxWorkersOption,
      maxRetries = 0,
      concurrencyPerWorker,
      forkOptions,
      maxBootingWorkers,
      inheritParentExecArgv,
    } = options

    this._onActivity = onActivity
    this._onActivityAbort = onActivityAbort

    // Built first: it validates the options and may throw.
    const { env: workerEnv, execArgv } = buildWorkerEnv({
      debuggerPortOffset,
      enableSourceMaps,
      isolatedMemory,
      inheritParentExecArgv,
      forkOptions,
    })

    // Register an exit handler to ensure workers are cleaned up.
    // We keep a reference so it can be removed when shutdown()/shutdownNow() is called.
    this._exitHandler = () => {
      this.shutdownNow()
    }
    process.on('exit', this._exitHandler)

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
      sanitizeArgs,
      maxBootingWorkers,
      timeout,
      forkOptions: {
        env: workerEnv,
        execArgv,
      },
      onCustomMessage: (data) => {
        if (
          data &&
          typeof data === 'object' &&
          'type' in data &&
          data.type === 'activity'
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
    const stdoutForwarder = createAbortTransform()
    const stderrForwarder = createAbortTransform()
    pool.getStdout().pipe(stdoutForwarder).pipe(process.stdout)
    pool.getStderr().pipe(stderrForwarder).pipe(process.stderr)
    this._outputForwarders = [stdoutForwarder, stderrForwarder]

    const dispatchWithRetry = async (
      method: string,
      args: unknown[]
    ): Promise<unknown> => {
      for (let attempt = 0; ; attempt++) {
        const currentPool = this._pool
        if (!currentPool) {
          throw new Error(
            'Worker is shut down, no more calls can be done to it'
          )
        }
        try {
          return await currentPool.dispatch(method, args)
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
      if (method.startsWith('_'))
        continue
        // Exposed methods are added dynamically, one per entry.
      ;(this as Worker & Record<string, unknown>)[method] = (
        ...args: any[]
      ) => {
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

  async shutdown(): Promise<{ forceExited: boolean }> {
    const pool = this._pool
    if (!pool) {
      throw new Error('Worker is ended, no more calls can be done to it')
    }
    this._pool = undefined
    this._removeExitHandler()
    const forwarders = this._outputForwarders
    this._outputForwarders = []
    const result = await pool.shutdown()
    // The pool has ended its streams; wait until everything they carried
    // has been written to the parent's stdout/stderr, so the build doesn't
    // exit before printing the workers' last diagnostics.
    await Promise.all(
      forwarders.map((forwarder) =>
        finished(forwarder, { writable: false }).catch(() => {})
      )
    )
    return result
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
