const { Worker, isMainThread, parentPort } = require('node:worker_threads')

it('should run a worker thread and receive a message', async () => {
  if (isMainThread) {
    const worker = new Worker(__filename)

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
  } else {
    // Worker thread
    parentPort.on('message', (msg) => {
      if (msg === 'ping') {
        parentPort.postMessage('pong')
      }
    })
  }
})

it('should handle worker with computation', async () => {
  if (isMainThread) {
    const worker = new Worker(__filename)

    const result = await new Promise((resolve, reject) => {
      worker.on('message', (msg) => {
        if (msg.type === 'result') {
          resolve(msg.value)
        }
      })
      worker.on('error', reject)

      worker.postMessage({ type: 'compute', a: 10, b: 32 })
    })

    expect(result).toBe(42)
    await worker.terminate()
  } else {
    // Worker thread
    parentPort.on('message', (msg) => {
      if (msg.type === 'compute') {
        const result = msg.a + msg.b
        parentPort.postMessage({ type: 'result', value: result })
      }
    })
  }
})
