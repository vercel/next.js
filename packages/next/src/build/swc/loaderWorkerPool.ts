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
          // The worker reports these exact options when it has booted:
          // process.argv is inherited from the parent and cannot be used to
          // identify the entrypoint.
          filename,
        },
      })

      // This will cause handing when run in jest worker, but not as a first level thread of nodejs thread
      // worker.unref()

      const workers =
        loaderWorkers[poolId] || (loaderWorkers[poolId] = new Map())

      // The thread id must be captured up-front: by the time the 'error' and
      // 'exit' events fire, `worker.threadId` has already reset to -1.
      const threadId = worker.threadId
      workers.set(threadId, worker)

      const reportWorkerDeath = () => {
        // Intentional terminations remove the worker from the map before
        // terminating it, so a worker that is no longer registered died on
        // purpose and must not be reported again. Any exit while still
        // registered is unexpected, including a clean `process.exit(0)`.
        // `workerDied` may also be absent when the loaded native binding
        // predates it; in that case there is nothing to notify.
        if (!workers.has(threadId) || typeof bindings.workerDied !== 'function') {
          return
        }
        workers.delete(threadId)
        bindings.workerDied({
          options: { filename, cwd },
          workerId: threadId,
        })
      }

      worker.once('error', reportWorkerDeath)
      worker.once('exit', reportWorkerDeath)
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
