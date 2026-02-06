import { parentPort, workerData } from 'node:worker_threads'

if (parentPort) {
  // Check if any __turbopack prefixed keys are visible in workerData
  const turbopackKeys = Object.keys(workerData || {}).filter((key) =>
    key.startsWith('__turbopack')
  )

  parentPort.postMessage({
    workerDataKeys: Object.keys(workerData || {}),
    hasTurbopackKeys: turbopackKeys.length > 0,
    turbopackKeys,
  })
}
