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
        nonce,
      } = creation

      const poolId = getPoolId(cwd, filename)

      const worker = new Worker(/* turbopackIgnore: true*/ filename, {
        workerData: {
          bindingPath,
          cwd,
          filename,
          creationNonce: nonce,
        },
      })

      // This will cause handing when run in jest worker, but not as a first level thread of nodejs thread
      // worker.unref()

      const workers =
        loaderWorkers[poolId] || (loaderWorkers[poolId] = new Map())

      // Capture the id now: `worker.threadId` is -1 after the worker exits,
      // so it cannot be read in the exit handler.
      const workerId = worker.threadId
      workers.set(workerId, worker)

      // An 'error' without a listener would become an uncaughtException in
      // the parent; 'exit' always follows and performs the reap.
      worker.on('error', () => {})
      worker.on('exit', () => {
        // First deleter wins: the Rust-initiated terminator below removes the
        // entry first when tearing this worker down intentionally, so reaching
        // the Rust side here means the exit was unexpected (boot failure,
        // crash, OOM, a loader calling process.exit).
        if (!workers.delete(workerId)) {
          return
        }
        bindings.workerExited(
          {
            options: { filename, cwd },
            workerId,
          },
          nonce
        )
      })
    },
    (termination) => {
      const {
        options: { filename, cwd },
        workerId,
      } = termination

      const poolId = getPoolId(cwd, filename)
      const workers = loaderWorkers[poolId]
      workers?.get(workerId)?.terminate()
      workers?.delete(workerId)
    }
  )
}
