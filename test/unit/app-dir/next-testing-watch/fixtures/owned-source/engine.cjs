const { parentPort, workerData } = require('node:worker_threads')
const fs = require('node:fs')
const path = require('node:path')
const { createWatchSourceErrorEncoder } = require(
  path.join(path.dirname(workerData.engine), 'watch-source-errors.js')
)
const encode = createWatchSourceErrorEncoder()
const scenario = workerData.scenario
function block() {
  fs.writeFileSync(
    process.env.OWNED_SOURCE_BLOCKED,
    JSON.stringify({ pid: process.pid, scenario })
  )
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
}
parentPort.on('message', (request) => {
  if (request.type === 'watch-source-open') {
    if (scenario === 'open-cancel') return block()
    if (scenario === 'death-before-open') process.exit(23)
    if (scenario === 'opening-snapshot')
      fs.writeFileSync(
        process.env.OWNED_SOURCE_SNAPSHOT,
        JSON.stringify(request.directories)
      )
    if (scenario === 'early-change')
      parentPort.postMessage({
        type: 'watch-source-change',
        change: { changed: ['/owned/early.test.mjs'], removed: [] },
      })
    parentPort.postMessage({ type: 'watch-source-ready', id: request.id })
  } else if (request.type === 'watch-source-update') {
    if (scenario === 'update-death') process.exit(31)
    if (scenario === 'update-cancel') return block()
    if (scenario === 'backpressure') {
      for (let index = 0; index < 512; index++)
        parentPort.postMessage({
          type: 'watch-source-change',
          change: {
            changed: ['/owned/input-' + index + '.test.mjs'],
            removed:
              index % 3 === 0 ? ['/owned/removed-' + index + '.test.mjs'] : [],
          },
        })
      parentPort.postMessage({ type: 'watch-source-updated', id: request.id })
      return
    }
    if (scenario === 'occurrences' || scenario === 'callback-error') {
      const error = new TypeError('Owned source occurrence')
      error.code = 'EOWNED'
      error.path = '/owned/input.mjs'
      error.cause = error
      const snapshot = encode(error)
      const first = {
        type: 'watch-source-error',
        failure: { occurrence: 1, error: snapshot },
      }
      parentPort.postMessage(first)
      if (scenario === 'occurrences') {
        parentPort.postMessage(first)
        parentPort.postMessage({
          type: 'watch-source-error',
          failure: { occurrence: 2, error: snapshot },
        })
      }
    } else {
      fs.writeFileSync(
        process.env.OWNED_SOURCE_SNAPSHOT,
        JSON.stringify(request.directories)
      )
      parentPort.postMessage({ type: 'watch-source-updated', id: request.id })
    }
  } else if (request.type === 'cancel') {
    if (scenario === 'blocked-close' || scenario === 'parent-death')
      return block()
    parentPort.postMessage({ type: 'watch-source-closed' })
    parentPort.close()
  }
})
