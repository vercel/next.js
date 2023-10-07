import { ChildProcess } from 'child_process'
import { Worker as JestWorker } from 'next/dist/compiled/jest-worker'
import { getNodeOptionsWithoutInspect } from '../server/lib/utils'

// We need this as we're using `Promise.withResolvers` which is not available in the node typings
import '../lib/polyfill-promise-with-resolvers'

type FarmOptions = ConstructorParameters<typeof JestWorker>[1]

const RESTARTED = Symbol('restarted')

const cleanupWorkers = (worker: JestWorker) => {
  for (const curWorker of ((worker as any)._workerPool?._workers || []) as {
    _child?: ChildProcess
  }[]) {
    curWorker._child?.kill('SIGINT')
  }
}

type Options<T extends object = object> = FarmOptions & {
  timeout?: number
  onRestart?: (method: string, args: any[], attempts: number) => void
  exposedMethods: ReadonlyArray<keyof T>
  enableWorkerThreads?: boolean
}

export class Worker<T extends object = object> {
  private _worker?: JestWorker

  /**
   * Creates a new worker with the correct typings associated with the selected
   * methods.
   */
  public static create<T extends object>(
    workerPath: string,
    options: Options<T>
  ): Worker<T> & T {
    return new Worker(workerPath, options) as Worker<T> & T
  }

  constructor(workerPath: string, options: Options<T>) {
    let { timeout, onRestart, ...farmOptions } = options

    let restartPromise: Promise<typeof RESTARTED>
    let resolveRestartPromise: (arg: typeof RESTARTED) => void
    let activeTasks = 0

    const createWorker = () => {
      const worker = new JestWorker(workerPath, {
        ...farmOptions,
        forkOptions: {
          ...farmOptions.forkOptions,
          env: {
            ...farmOptions.forkOptions?.env,
            ...process.env,
            // We don't pass down NODE_OPTIONS as it can lead to extra memory
            // usage,
            NODE_OPTIONS: getNodeOptionsWithoutInspect()
              .replace(/--max-old-space-size=[\d]{1,}/, '')
              .trim(),
          },
          stdio: 'inherit',
        },
      })

      const { promise, resolve } = Promise.withResolvers<typeof RESTARTED>()
      restartPromise = promise
      resolveRestartPromise = resolve

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
        const poolWorkers: { _child?: ChildProcess }[] =
          // @ts-expect-error - we're accessing a private property
          worker._workerPool?._workers ?? []

        for (const poolWorker of poolWorkers) {
          if (!poolWorker._child) continue

          poolWorker._child.once('exit', (code, signal) => {
            // log unexpected exit if .end() wasn't called
            if ((code || (signal && signal !== 'SIGINT')) && this._worker) {
              console.error(
                `Static worker unexpectedly exited with code: ${code} and signal: ${signal}`
              )
            }
          })
        }
      }

      return worker
    }

    // Create the first worker.
    this._worker = createWorker()

    const onHanging = () => {
      const worker = this._worker
      if (!worker) return

      // Grab the current restart promise, and create a new worker.
      const resolve = resolveRestartPromise
      this._worker = createWorker()

      // Once the old worker is ended, resolve the restart promise to signal to
      // any active tasks that the worker had to be restarted.
      worker.end().then(() => {
        resolve(RESTARTED)
      })
    }

    let hangingTimer: NodeJS.Timeout | false = false

    const onActivity = () => {
      // If there was an active hanging timer, clear it.
      if (hangingTimer) clearTimeout(hangingTimer)

      // If there are no active tasks, we don't need to start a new hanging
      // timer.
      if (activeTasks === 0) return

      hangingTimer = setTimeout(onHanging, timeout)
    }

    const wrapMethodWithTimeout =
      <M extends (...args: unknown[]) => Promise<unknown> | unknown>(
        method: M
      ) =>
      async (...args: Parameters<M>) => {
        activeTasks++

        try {
          let attempts = 0
          for (;;) {
            // Mark that we're doing work, we want to ensure that if the worker
            // halts for any reason, we restart it.
            onActivity()

            const result = await Promise.race([
              // Either we'll get the result from the worker, or we'll get the
              // restart promise to fire.
              method(...args),
              restartPromise,
            ])

            // If the result anything besides `RESTARTED`, we can return it, as
            // it's the actual result from the worker.
            if (result !== RESTARTED) {
              return result
            }

            // Otherwise, we'll need to restart the worker, and try again.
            if (onRestart) onRestart(method.name, args, ++attempts)
          }
        } finally {
          activeTasks--
          onActivity()
        }
      }

    for (const name of farmOptions.exposedMethods) {
      if (name.startsWith('_')) continue

      // @ts-expect-error - we're grabbing a dynamic method on the worker
      let method = this._worker[name].bind(this._worker)
      if (timeout) {
        method = wrapMethodWithTimeout(method)
      }

      // @ts-expect-error - we're dynamically creating methods
      this[name] = method
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
