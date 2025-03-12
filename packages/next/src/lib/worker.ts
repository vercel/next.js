import type { ChildProcess } from 'child_process'
import { Worker as JestWorker } from 'next/dist/compiled/jest-worker'
import { Transform } from 'stream'

type FarmOptions = ConstructorParameters<typeof JestWorker>[1]

const RESTARTED = Symbol('restarted')

const cleanupWorkers = (worker: JestWorker) => {
  for (const curWorker of ((worker as any)._workerPool?._workers || []) as {
    _child?: ChildProcess
  }[]) {
    curWorker._child?.kill('SIGINT')
  }
}

export class Worker {
  private _worker: JestWorker | undefined

  constructor(
    workerPath: string,
    options: FarmOptions & {
      timeout?: number
      onActivity?: () => void
      onActivityAbort?: () => void
      onRestart?: (method: string, args: any[], attempts: number) => void
      logger?: Pick<typeof console, 'error' | 'info' | 'warn'>
      exposedMethods: ReadonlyArray<string>
      enableWorkerThreads?: boolean
    }
  ) {
    let { timeout, onRestart, logger = console, ...farmOptions } = options

    let restartPromise: Promise<typeof RESTARTED>
    let resolveRestartPromise: (arg: typeof RESTARTED) => void
    let activeTasks = 0

    this._worker = undefined

    // ensure we end workers if they weren't before exit
    process.on('exit', () => {
      this.close()
    })

    const createWorker = () => {
      this._worker = new JestWorker(workerPath, {
        ...farmOptions,
        forkOptions: {
          ...farmOptions.forkOptions,
          env: {
            ...((farmOptions.forkOptions?.env || {}) as any),
            ...process.env,
            IS_NEXT_WORKER: 'true',
          } as any,
        },
        maxRetries: 0,
      }) as JestWorker
      restartPromise = new Promise(
        (resolve) => (resolveRestartPromise = resolve)
      )

      /**
       * Jest Worker has two worker types, ChildProcessWorker (uses child_process) and NodeThreadWorker (uses worker_threads)
       * Next.js uses ChildProcessWorker by default, but it can be switched to NodeThreadWorker with an experimental flag
       *
       * We only want to handle ChildProcessWorker's orphan process issue, so we access the private property "_child":
       * https://github.com/facebook/jest/blob/b38d7d345a81d97d1dc3b68b8458b1837fbf19be/packages/jest-worker/src/workers/ChildProcessWorker.ts
       *
       * But this property is not available in NodeThreadWorker, so we need to check if we are using ChildProcessWorker
       */
      if (!farmOptions.enableWorkerThreads) {
        for (const worker of ((this._worker as any)._workerPool?._workers ||
          []) as {
          _child?: ChildProcess
        }[]) {
          worker._child?.on('exit', (code, signal) => {
            if ((code || (signal && signal !== 'SIGINT')) && this._worker) {
              logger.error(
                `Next.js build worker exited with code: ${code} and signal: ${signal}`
              )

              // if a child process doesn't exit gracefully, we want to bubble up the exit code to the parent process
              process.exit(code ?? 1)
            }
          })

          // if a child process emits a particular message, we track that as activity
          // so the parent process can keep track of progress
          worker._child?.on('message', ([, data]: [number, unknown]) => {
            if (
              data &&
              typeof data === 'object' &&
              'type' in data &&
              data.type === 'activity'
            ) {
              onActivity()
            }
          })
        }
      }

      let aborted = false
      const onActivityAbort = () => {
        if (!aborted) {
          options.onActivityAbort?.()
          aborted = true
        }
      }

      // Listen to the worker's stdout and stderr, if there's any thing logged, abort the activity first
      const abortActivityStreamOnLog = new Transform({
        transform(_chunk, _encoding, callback) {
          onActivityAbort()
          callback()
        },
      })
      // Stop the activity if there's any output from the worker
      this._worker.getStdout().pipe(abortActivityStreamOnLog)
      this._worker.getStderr().pipe(abortActivityStreamOnLog)

      // Pipe the worker's stdout and stderr to the parent process
      this._worker.getStdout().pipe(process.stdout)
      this._worker.getStderr().pipe(process.stderr)
    }
    createWorker()

    const onHanging = () => {
      const worker = this._worker
      if (!worker) return
      const resolve = resolveRestartPromise
      createWorker()
      logger.warn(
        `Sending SIGTERM signal to static worker due to timeout${
          timeout ? ` of ${timeout / 1000} seconds` : ''
        }. Subsequent errors may be a result of the worker exiting.`
      )
      worker.end().then(() => {
        resolve(RESTARTED)
      })
    }

    let hangingTimer: NodeJS.Timeout | false = false

    const onActivity = () => {
      if (hangingTimer) clearTimeout(hangingTimer)
      if (options.onActivity) options.onActivity()

      hangingTimer = activeTasks > 0 && setTimeout(onHanging, timeout)
    }

    for (const method of farmOptions.exposedMethods) {
      if (method.startsWith('_')) continue
      ;(this as any)[method] = timeout
        ? // eslint-disable-next-line no-loop-func
          async (...args: any[]) => {
            activeTasks++
            try {
              let attempts = 0
              for (;;) {
                onActivity()
                const result = await Promise.race([
                  (this._worker as any)[method](...args),
                  restartPromise,
                ])
                if (result !== RESTARTED) return result
                if (onRestart) onRestart(method, args, ++attempts)
              }
            } finally {
              activeTasks--
              onActivity()
            }
          }
        : (this._worker as any)[method].bind(this._worker)
    }
  }

  end(): ReturnType<JestWorker['end']> {
    const worker = this._worker
    if (!worker) {
      throw new Error('Farm is ended, no more calls can be done to it')
    }
    cleanupWorkers(worker)
    this._worker = undefined
    return worker.end()
  }

  /**
   * Quietly end the worker if it exists
   */
  close(): void {
    if (this._worker) {
      cleanupWorkers(this._worker)
      this._worker.end()
    }
  }
}
