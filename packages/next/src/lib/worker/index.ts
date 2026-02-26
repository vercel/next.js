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

export function getNextBuildDebuggerPortOffset(_: {
  kind: 'export-page'
}): number {
  // 0: export worker
  return 0
}

export interface WorkerOptions {
  /**
   * Human-readable name for this worker, used in error messages.
   * e.g. "Next.js build worker" produces "Next.js build worker exited with code: ..."
   */
  workerName?: string
  forkOptions?: {
    env?: Partial<NodeJS.ProcessEnv> | undefined
  }
  /**
   * Maximum number of workers to spawn (default: os.cpus().length - 1, minimum 1)
   */
  maxWorkers?: number
  /**
   * Maximum concurrent calls per worker (default: 1)
   */
  concurrencyPerWorker?: number
  /**
   * Debugger port offset, or `undefined` if not inspectable (default: undefined)
   */
  debuggerPortOffset?: number
  enableSourceMaps?: boolean
  /**
   * If true, strips `--max-old-space-size` from NODE_OPTIONS (default: false)
   */
  isolatedMemory?: boolean
  timeout?: number
  onActivity?: () => void
  onActivityAbort?: () => void
  onRestart?: (method: string, args: any[], attempts: number) => void
  logger?: Pick<typeof console, 'error' | 'info' | 'warn'>
  exposedMethods: ReadonlyArray<string>
  enableWorkerThreads?: boolean
  maxRetries?: number
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
      logger = console,
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

    let activeTasks = 0

    // Register an exit handler to ensure workers are cleaned up.
    // We keep a reference so it can be removed when end()/close() is called.
    this._exitHandler = () => {
      this.close()
    }
    process.on('exit', this._exitHandler)

    const { env: workerEnv, execArgv } = buildWorkerEnv({
      debuggerPortOffset,
      enableSourceMaps,
      isolatedMemory,
      forkOptions,
    })

    const createPool = () => {
      const pool = new WorkerPool({
        workerPath,
        maxWorkers: maxWorkersOption ?? Math.max(os.cpus().length - 1, 1),
        concurrencyPerWorker: concurrencyPerWorker ?? 1,
        enableWorkerThreads: enableWorkerThreads ?? false,
        maxBootingWorkers,
        forkOptions: {
          env: workerEnv,
          execArgv: [
            ...execArgv,
            ...process.execArgv.filter(
              (arg) => !/^--(debug|inspect)/.test(arg)
            ),
          ],
        },
        onCustomMessage: (data) => {
          if (
            data &&
            typeof data === 'object' &&
            'type' in data &&
            (data as any).type === 'activity'
          ) {
            onActivityImpl()
          }
        },
      })

      this._pool = pool

      let aborted = false
      const onActivityAbortImpl = () => {
        if (!aborted) {
          this._onActivityAbort?.()
          aborted = true
        }
      }

      // Listen to the worker's stdout and stderr;
      // if anything is logged, abort the activity spinner first
      const abortActivityStreamOnLog = new Transform({
        transform(_chunk, _encoding, callback) {
          onActivityAbortImpl()
          callback()
        },
      })
      pool.getStdout().pipe(abortActivityStreamOnLog)
      pool.getStderr().pipe(abortActivityStreamOnLog)

      // Pipe the worker's stdout and stderr to the parent process
      pool.getStdout().pipe(process.stdout)
      pool.getStderr().pipe(process.stderr)

      return pool
    }

    createPool()

    // Timeout / restart logic
    let hangingTimer: ReturnType<typeof setTimeout> | false = false

    const onActivityImpl = () => {
      if (hangingTimer) clearTimeout(hangingTimer)
      if (this._onActivity) this._onActivity()
      hangingTimer =
        activeTasks > 0 && timeout ? setTimeout(onHanging, timeout) : false
    }

    const onHanging = () => {
      if (!this._pool) return
      logger.warn(
        `Sending SIGTERM signal to static worker due to timeout${
          timeout ? ` of ${timeout / 1000} seconds` : ''
        }. Subsequent errors may be a result of the worker exiting.`
      )
      // End the current pool and create a fresh one
      const oldPool = this._pool
      createPool()
      oldPool.end()
    }

    // TODO: Remove this once callers stop passing non-serializable values
    // (e.g. functions) in worker method arguments. The structured clone
    // algorithm used by worker_threads rejects functions, unlike
    // child_process which silently drops them via JSON serialization.
    const sanitizeArgs = enableWorkerThreads
      ? (args: any[]) => JSON.parse(JSON.stringify(args))
      : (args: any[]) => args

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
      ;(this as any)[method] = timeout
        ? // eslint-disable-next-line no-loop-func
          async (...args: any[]) => {
            activeTasks++
            const sanitizedArgs = sanitizeArgs(args)
            try {
              onActivityImpl()
              return await dispatchWithRetry(method, sanitizedArgs)
            } finally {
              activeTasks--
              onActivityImpl()
            }
          }
        : (...args: any[]) => {
            return dispatchWithRetry(method, sanitizeArgs(args))
          }
    }
  }

  setOnActivity(onActivity: (() => void) | undefined): void {
    this._onActivity = onActivity
  }
  setOnActivityAbort(onActivityAbort: (() => void) | undefined): void {
    this._onActivityAbort = onActivityAbort
  }

  /** Remove the `process.on('exit')` handler to prevent listener leaks */
  private _removeExitHandler(): void {
    if (this._exitHandler) {
      process.removeListener('exit', this._exitHandler)
      this._exitHandler = undefined
    }
  }

  end(): Promise<{ forceExited: boolean }> {
    const pool = this._pool
    if (!pool) {
      throw new Error('Worker is ended, no more calls can be done to it')
    }
    this._pool = undefined
    this._removeExitHandler()
    return pool.end()
  }

  /**
   * Quietly end the worker if it exists
   */
  close(): void {
    if (this._pool) {
      this._pool.close()
      this._pool = undefined
    }
    this._removeExitHandler()
  }
}
