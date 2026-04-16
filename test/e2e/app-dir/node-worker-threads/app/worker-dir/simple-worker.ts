import { parentPort } from 'node:worker_threads'

if (parentPort) {
  parentPort.on('message', (msg) => {
    if (msg === 'ping') {
      parentPort!.postMessage('pong from simple worker')
    }
  })
}
