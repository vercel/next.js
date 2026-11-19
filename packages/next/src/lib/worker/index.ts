import { Transform } from 'stream'
import { finished } from 'stream/promises'
import os from 'os'
import {
  formatDebugAddress,
  formatNodeOptions,
  getEffectiveDebugOptions,
  getParsedNodeOptionsWithoutInspect,
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
  /**
   * Options for the worker processes/threads. Workers always inherit the
   * parent's environment and flags the way Node.js passes them to a child
   * (CLI flags as CLI flags, `NODE_OPTIONS` as `NODE_OPTIONS`), without
   * debugger flags. These are added on top.
   */
  forkOptions?: {
    /**
     * Environment variables merged into the worker environment. A
     * `NODE_OPTIONS` here replaces the inherited one (debugger flags are still
     * removed); `NODE_OPTIONS: undefined` removes it.
     */
    env?: Partial<NodeJS.ProcessEnv> | undefined
    /**
     * Extra Node.js flags appended to the worker's `execArgv`. Worker threads
     * reject V8 and per-process flags here (ERR_WORKER_INVALID_EXEC_ARGV).
     */
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
   * Offset added to the parent's debugger port for child-process workers.
   * When set (including 0) and the parent is debugged with `--inspect` or
   * `--inspect-brk`, workers get the same flag at
   * `parentPort + 1 + debuggerPortOffset` (the command-line address wins over
   * `NODE_OPTIONS`, as in Node.js), plus the parent's `--inspect-publish-uid`.
   * Worker threads never get a debugger flag; they're debugged through the
   * parent's inspector. When `undefined`, workers do not attach a debugger.
   * (default: undefined)
   */
  debuggerPortOffset?: number
  /**
   * If true, passes `--enable-source-maps` to workers, overriding an
   * inherited `--no-enable-source-maps` (default: false)
   */
  enableSourceMaps?: boolean
  /**
   * If true, child-process workers don't inherit the parent's
   * `--max-old-space-size` (from NODE_OPTIONS or the CLI). Has no effect on
   * worker threads, which share the parent's V8 flags. (default: false)
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
}

interface BuildWorkerEnvOptions {
  debuggerPortOffset?: number
  enableSourceMaps?: boolean
  isolatedMemory?: boolean
  enableWorkerThreads?: boolean
  forkOptions?: { env?: Partial<NodeJS.ProcessEnv>; execArgv?: string[] }
}

/** Debugger flags (`--inspect*`, `--debug*`); workers never inherit them. */
const DEBUGGER_FLAG = /^--(debug|inspect)/
/** Debugger flags that can take their value as a separate argument. */
const DEBUGGER_FLAG_WITH_VALUE =
  /^--(inspect[-_]port|debug[-_]port|inspect[-_]publish[-_]uid)$/
const MAX_OLD_SPACE_SIZE_FLAG = /^--max[-_]old[-_]space[-_]size(=|$)/
const NO_SOURCE_MAPS_FLAG = /^--no[-_]enable[-_]source[-_]maps$/

/**
 * Remove flags from an argv array. A removed flag written as `--flag value`
 * (no `=`) also loses its value when `takesValue` says it has one. (V8 flags
 * such as `--max-old-space-size` only accept the `=` form.)
 */
function removeFlags(
  argv: readonly string[],
  shouldRemove: (arg: string) => boolean,
  takesValue: (arg: string) => boolean
): string[] {
  const result: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!shouldRemove(arg)) {
      result.push(arg)
    } else if (
      !arg.includes('=') &&
      takesValue(arg) &&
      i + 1 < argv.length &&
      !argv[i + 1].startsWith('-')
    ) {
      i++
    }
  }
  return result
}

/**
 * Build the environment and flags for workers, the way Node.js itself would
 * pass them on to a child, minus what must not be inherited:
 * - The parent's CLI flags (`process.execArgv`) stay CLI flags, so they keep
 *   precedence over NODE_OPTIONS and flags NODE_OPTIONS rejects (e.g.
 *   `--prof`) keep working.
 * - NODE_OPTIONS is the one the worker would inherit (`forkOptions.env`
 *   included).
 * - Debugger flags are removed from both, and re-added on another port for
 *   child processes when `debuggerPortOffset` is set.
 * - `isolatedMemory` removes `--max-old-space-size` from both.
 * - `enableSourceMaps` overrides an inherited `--no-enable-source-maps`.
 * - Propagates color support (mirroring picocolors' heuristic).
 *
 * `inheritedExecArgv` is the part of `execArgv` inherited from the parent; the
 * rest was requested by the options. WorkerPool uses it to decide which flags
 * rejected by a worker thread can be dropped (see `_createThread`).
 */
function buildWorkerEnv(options: BuildWorkerEnvOptions): {
  env: Record<string, string | undefined>
  execArgv: string[]
  inheritedExecArgv: string[]
} {
  const {
    debuggerPortOffset,
    enableSourceMaps,
    isolatedMemory,
    enableWorkerThreads,
    forkOptions,
  } = options

  const env: Record<string, string | undefined> = {
    ...process.env,
    ...(forkOptions?.env || {}),
    IS_NEXT_WORKER: 'true',
  }

  // `?? ''`: an explicit `NODE_OPTIONS: undefined` in forkOptions.env removes
  // the parent's value instead of falling back to it.
  const nodeOptions = getParsedNodeOptionsWithoutInspect(env.NODE_OPTIONS ?? '')
  // Also drop the other debugger options (`--inspect-port`, `--debug-port`,
  // `--inspect-publish-uid`, ...): a stale address must not outlive the one
  // re-attached below.
  for (const key of Object.keys(nodeOptions)) {
    if (/^(debug|inspect)/.test(key)) {
      delete nodeOptions[key]
    }
  }
  const inheritedExecArgv = removeFlags(
    process.execArgv,
    (arg) =>
      DEBUGGER_FLAG.test(arg) ||
      (isolatedMemory === true && MAX_OLD_SPACE_SIZE_FLAG.test(arg)) ||
      // An inherited CLI flag would outrank the NODE_OPTIONS added below.
      (enableSourceMaps === true && NO_SOURCE_MAPS_FLAG.test(arg)),
    (arg) => DEBUGGER_FLAG_WITH_VALUE.test(arg)
  )

  // Worker threads can't have their own debugger port; they're debuggable
  // through the parent's inspector.
  if (debuggerPortOffset != null && !enableWorkerThreads) {
    const parentDebugger = getEffectiveDebugOptions()
    const nodeDebugType = parentDebugger.type
    if (nodeDebugType && parentDebugger.address) {
      const debuggerAddress = parentDebugger.address
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
      // Keep the parent's restriction on where the inspector URL is published.
      if (parentDebugger.publishUid !== undefined) {
        nodeOptions['inspect-publish-uid'] = parentDebugger.publishUid
      }
    }
  }

  if (enableSourceMaps) {
    nodeOptions['enable-source-maps'] = true
  }

  if (isolatedMemory === true) {
    delete nodeOptions['max-old-space-size']
    delete nodeOptions['max_old_space_size']
  }

  const formatted = formatNodeOptions(nodeOptions)
  env.NODE_OPTIONS = formatted.nodeOptions
  const execArgv = [
    ...inheritedExecArgv,
    ...formatted.execArgv,
    ...(forkOptions?.execArgv ?? []),
  ]

  return { env: withColorSupport(env), execArgv, inheritedExecArgv }
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
    } = options

    this._onActivity = onActivity
    this._onActivityAbort = onActivityAbort

    const {
      env: workerEnv,
      execArgv,
      inheritedExecArgv,
    } = buildWorkerEnv({
      debuggerPortOffset,
      enableSourceMaps,
      isolatedMemory,
      enableWorkerThreads,
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
      inheritedExecArgv,
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
