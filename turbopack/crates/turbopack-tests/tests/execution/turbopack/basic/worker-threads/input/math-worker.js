const { parentPort } = require('node:worker_threads')

if (parentPort) {
  parentPort.on('message', (data) => {
    const result = data.a + data.b
    parentPort.postMessage({ type: 'math', result })
  })
}
