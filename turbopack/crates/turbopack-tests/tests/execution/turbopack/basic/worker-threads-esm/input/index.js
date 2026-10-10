import {
  startWorker,
  startWorkerFromUrl,
  startWorkerWithDefault,
} from './pkg/lib/start-worker.js'

async function receiveMessage(worker) {
  try {
    return await new Promise((resolve, reject) => {
      worker.once('message', resolve)
      worker.once('error', reject)
    })
  } finally {
    await worker.terminate()
  }
}

it('should start a worker from a path next to import.meta.url', async () => {
  expect(await receiveMessage(startWorker())).toBe('ready')
})

it('should start a worker from a default parameter path next to import.meta.url', async () => {
  expect(await receiveMessage(startWorkerWithDefault())).toBe('ready')
})

it('should start a worker from new URL(..., import.meta.url)', async () => {
  expect(await receiveMessage(startWorkerFromUrl())).toBe('ready')
})
