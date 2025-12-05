import { Worker } from 'worker_threads'

const loaderWorkers: Record<string, Array<Worker>> = {}

const KillMsg = '__kill__'

export async function runLoaderWorkerPool(
  binding: typeof import('./generated-native'),
  bindingPath: string
) {
  await Promise.all([
    runPoolScaler(binding, bindingPath),
    runWorkerTerminator(binding),
  ])
}

async function runPoolScaler(
  binding: typeof import('./generated-native'),
  bindingPath: string
) {
  while (true) {
    try {
      console.log('[loaderWorkerPool] waiting for pool request')
      let poolOptions = await binding.recvPoolRequest()
      console.log('[loaderWorkerPool] received pool request', {
        ...poolOptions,
        env: 'omitted',
      })
      const { filename, concurrency, env, cwd } = poolOptions
      // Wildcard of "*" meaning to scale all of pools even with different poolId
      const workers =
        filename === '*'
          ? Object.values(loaderWorkers).flat()
          : loaderWorkers[filename] || (loaderWorkers[filename] = [])
      if (workers.length < concurrency) {
        for (let i = workers.length; i < concurrency; i++) {
          const worker = new Worker(filename, {
            workerData: {
              poolId: filename,
              bindingPath,
              cwd,
            },
            env,
          })
          workers.push(worker)
        }
      } else if (workers.length > concurrency) {
        const workersToKill = workers.splice(0, workers.length - concurrency)
        workersToKill.forEach(terminateWorker)
      }
    } catch (_) {
      // rust channel closed, do nothing
      return
    }
  }
}

async function runWorkerTerminator(
  binding: typeof import('./generated-native')
) {
  while (true) {
    try {
      console.log('[loaderWorkerPool] waiting for worker termination')
      const { filename, workerId } = await binding.recvWorkerTermination()
      console.log('[loaderWorkerPool] received worker termination', {
        filename,
        workerId,
      })
      const workers = loaderWorkers[filename]
      const workerIdx = workers.findIndex(
        (worker) => worker.threadId === workerId
      )
      if (workerIdx > -1) {
        const workersToKill = workers.splice(workerIdx, 1)
        workersToKill.forEach(terminateWorker)
      }
    } catch (_) {
      // rust channel closed, do nothing
      return
    }
  }
}

async function terminateWorker(worker: Worker) {
  await new Promise<void>((resolve) => {
    const onMessage = (msg: any) => {
      if (msg === KillMsg) {
        worker.off('message', onMessage)
        resolve()
      }
    }
    worker.on('message', onMessage)
    worker.postMessage(KillMsg)
  })
  await worker.terminate()
}
