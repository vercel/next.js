import { Transform } from 'stream'
import {
  formatDebugAddress,
  formatNodeOptions,
  getNodeDebugType,
  getParsedDebugAddress,
  getParsedNodeOptions,
  type DebugAddress,
} from '../../server/lib/utils'
import { WorkerPool } from './worker-pool'

export { WorkerPool } from './worker-pool'

export function getNextBuildDebuggerPortOffset(_: {
  kind: 'export-page'
}): number {
  // 0: export worker
  return 0
}

export interface WorkerOptions {
  forkOptions?: {
    env?: Partial<NodeJS.ProcessEnv> | undefined
  }
  numWorkers?: number
  /**
   * Maximum concurrent calls per worker (default: 1)
   */
  concurrencyPerWorker?: number
  /**
   * `-1` if not inspectable
   */
  debuggerPortOffset: number
  enableSourceMaps?: boolean
  /**
   * True if `--max-old-space-size` should not be forwarded to the worker.
   */
  isolatedMemory: boolean
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
      enableSourceMaps,
      timeout,
      onRestart: _onRestart,
      logger = console,
      debuggerPortOffset,
      isolatedMemory,
      onActivity,
      onActivityAbort,
      exposedMethods,
      enableWorkerThreads,
      numWorkers,
      maxRetries,
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

    // Build NODE_OPTIONS for worker processes
    const nodeOptions = getParsedNodeOptions()
    const originalOptions = { ...nodeOptions }
    delete nodeOptions.inspect
    delete nodeOptions['inspect-brk']
    delete nodeOptions['inspect_brk']
    if (debuggerPortOffset !== -1) {
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
              : debuggerAddress.port + 1 + debuggerPortOffset,
        }
        nodeOptions[nodeDebugType] = formatDebugAddress(address)
      }
    }

    if (enableSourceMaps) {
      nodeOptions['enable-source-maps'] = true
    }

    if (isolatedMemory) {
      delete nodeOptions['max-old-space-size']
      delete nodeOptions['max_old_space_size']
    }

    const { nodeOptions: formattedNodeOptions, execArgv } =
      formatNodeOptions(nodeOptions)

    const workerEnv: Record<string, string | undefined> = {
      ...process.env,
      ...((forkOptions?.env || {}) as Record<string, string | undefined>),
      IS_NEXT_WORKER: 'true',
      NODE_OPTIONS: formattedNodeOptions,
    }

    if (workerEnv.FORCE_COLOR === undefined) {
      // Mirror the enablement heuristic from picocolors.
      // Picocolors snapshots `process.env`/`stdout.isTTY` at module load time,
      // so when the worker process bootstraps with piped stdio its own check
      // would disable colors. Re-evaluating the same conditions here lets us
      // opt the worker into color output only when the parent would have seen
      // colors, while still respecting explicit opt-outs like NO_COLOR.
      const supportsColors =
        !workerEnv.NO_COLOR &&
        !workerEnv.CI &&
        workerEnv.TERM !== 'dumb' &&
        (process.stdout.isTTY || process.stderr?.isTTY)

      if (supportsColors) {
        workerEnv.FORCE_COLOR = '1'
      }
    }

    const createPool = () => {
      const pool = new WorkerPool({
        workerPath,
        maxWorkers: numWorkers ?? 1,
        concurrencyPerWorker: concurrencyPerWorker ?? 1,
        enableWorkerThreads: enableWorkerThreads ?? false,
        maxRespawns: maxRetries ?? 0,
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
        onWorkerExit: (code, signal) => {
          if ((code || (signal && signal !== 'SIGINT')) && this._pool) {
            logger.error(
              `Next.js build worker exited with code: ${code} and signal: ${signal}`
            )
            process.exit(code ?? 1)
          }
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

    for (const method of exposedMethods) {
      if (method.startsWith('_')) continue
      ;(this as any)[method] = timeout
        ? // eslint-disable-next-line no-loop-func
          async (...args: any[]) => {
            activeTasks++
            const sanitizedArgs = sanitizeArgs(args)
            try {
              onActivityImpl()
              return await this._pool!.dispatch(method, sanitizedArgs)
            } finally {
              activeTasks--
              onActivityImpl()
            }
          }
        : (...args: any[]) => {
            return this._pool!.dispatch(method, sanitizeArgs(args))
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
      throw new Error('Farm is ended, no more calls can be done to it')
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
