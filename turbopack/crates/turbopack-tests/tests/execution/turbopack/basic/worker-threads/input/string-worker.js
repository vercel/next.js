const { parentPort } = require('node:worker_threads')

if (parentPort) {
  parentPort.on('message', (data) => {
    const result = data.text.toUpperCase()
    parentPort.postMessage({ type: 'string', result })
  })
}
