const { parentPort } = require('node:worker_threads')

// Worker thread code
parentPort.on('message', (msg) => {
  if (msg === 'ping') {
    parentPort.postMessage('pong')
  } else if (msg.type === 'compute') {
    const result = msg.a + msg.b
    parentPort.postMessage({ type: 'result', value: result })
  }
})
