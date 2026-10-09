import { Worker } from 'worker_threads'

const registeredBindings = new WeakSet<typeof import('./generated-native')>()

const loaderWorkers: Record<string, Map<number, Worker>> = {}

function getPoolId(cwd: string, filename: string) {
  return `${cwd}:${filename}`
}

export function runLoaderWorkerPool(
  bindings: typeof import('./generated-native'),
  bindingPath: string
) {
  if (registeredBindings.has(bindings)) return

  bindings.registerWorkerScheduler(
    (creation) => {
      const {
        options: { filename, cwd },
      } = creation

      const poolId = getPoolId(cwd, filename)

      const worker = new Worker(/* turbopackIgnore: true*/ filename, {
        workerData: {
          bindingPath,
          cwd,
        },
      })

      // This will cause handing when run in jest worker, but not as a first level thread of nodejs thread
      // worker.unref()

      const workers =
        loaderWorkers[poolId] || (loaderWorkers[poolId] = new Map())

      workers.set(worker.threadId, worker)
    },
    async (termination) => {
      const {
        options: { filename, cwd },
        workerId,
      } = termination

      const poolId = getPoolId(cwd, filename)
      const workers = loaderWorkers[poolId]
      const worker = workers?.get(workerId)
      if (worker) {
        await worker.terminate()
        workers.delete(workerId)
      }
    }
  )
  registeredBindings.add(bindings)
}
