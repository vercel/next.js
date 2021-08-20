import { Worker as JestWorker } from 'jest-worker'

type FarmOptions = ConstructorParameters<typeof JestWorker>[1]

const RESTARTED = Symbol('restarted')

export class Worker {
  private _worker: JestWorker | undefined

  constructor(
    workerPath: string,
    options: FarmOptions & {
      timeout?: number
      onRestart?: (method: string, args: any[], attempts: number) => void
      exposedMethods: ReadonlyArray<string>
    }
  ) {
    let { timeout, onRestart, ...farmOptions } = options

    let restartPromise: Promise<typeof RESTARTED>
    let resolveRestartPromise: (arg: typeof RESTARTED) => void
    let activeTasks = 0

    this._worker = undefined

    const createWorker = () => {
      this._worker = new JestWorker(workerPath, farmOptions) as JestWorker
      restartPromise = new Promise(
        (resolve) => (resolveRestartPromise = resolve)
      )

      this._worker.getStdout().pipe(process.stdout)
      this._worker.getStderr().pipe(process.stderr)
    }
    createWorker()

    const onHanging = () => {
      const worker = this._worker
      if (!worker) return
      const resolve = resolveRestartPromise
      createWorker()
      worker.end().then(() => {
        resolve(RESTARTED)
      })
    }

    let hangingTimer: number | false = false

    const onActivity = () => {
      if (hangingTimer) clearTimeout(hangingTimer)
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
    this._worker = undefined
    return worker.end()
  }
}
