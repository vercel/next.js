const { Worker, isMainThread, parentPort } = require('node:worker_threads')
const path = require('path')

if (isMainThread) {
  it('should run a worker thread with separate file', async () => {
    const worker = new Worker(path.join(__dirname, 'worker.js'))

    const message = await new Promise((resolve, reject) => {
      worker.on('message', resolve)
      worker.on('error', reject)
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`))
        }
      })

      worker.postMessage('ping')
    })

    expect(message).toBe('pong')
    await worker.terminate()
  })

  it('should handle self-referencing worker (__filename)', async () => {
    const worker = new Worker(__filename)

    const message = await new Promise((resolve, reject) => {
      worker.on('message', resolve)
      worker.on('error', reject)
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`))
        }
      })

      worker.postMessage('self-ref-ping')
    })

    expect(message).toBe('self-ref-pong')
    await worker.terminate()
  })
} else {
  // Worker thread - handle self-referencing worker messages
  parentPort.on('message', (msg) => {
    if (msg === 'self-ref-ping') {
      parentPort.postMessage('self-ref-pong')
    }
  })
}
