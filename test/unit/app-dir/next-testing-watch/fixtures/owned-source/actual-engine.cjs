const { parentPort, workerData } = require('node:worker_threads')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const send = parentPort.postMessage.bind(parentPort)
parentPort.postMessage = (message) => {
  if (message.type === 'watch-source-updated')
    throw new Error('operation response delivery failed')
  if (message.type === 'watch-source-operation-failed')
    throw new Error('operation failure delivery failed')
  return send(message)
}
fs.watch = () => {
  const watcher = new EventEmitter()
  watcher.close = () => {
    fs.writeFileSync(
      path.join(
        path.dirname(process.env.OWNED_SOURCE_BLOCKED),
        'close-attempted'
      ),
      'attempted'
    )
    throw new Error('distinct native close failure')
  }
  return watcher
}
require(workerData.engine)
