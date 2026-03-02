import { Worker } from 'worker_threads'

const loaderWorkers: Record<string, Map<number, Worker>> = {}

function getPoolId(cwd: string, filename: string) {
  return `${cwd}:${filename}`
}

export async function runLoaderWorkerPool(
  bindings: typeof import('./generated-native'),
  bindingPath: string
) {
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
    (termination) => {
      const {
        options: { filename, cwd },
        workerId,
      } = termination

      const poolId = getPoolId(cwd, filename)
      const workers = loaderWorkers[poolId]
      workers.get(workerId)?.terminate()
      workers.delete(workerId)
    }
  )
}
