const threads = require('node:worker_threads')
const fs = require('node:fs')
const path = require('node:path')
if (
  threads.isMainThread &&
  process.argv[1]?.endsWith('/watch-source-worker.js')
) {
  if (process.env.OWNED_SOURCE_HOST_PIDFILE)
    fs.writeFileSync(
      process.env.OWNED_SOURCE_HOST_PIDFILE,
      JSON.stringify({ pid: process.pid, ppid: process.ppid })
    )
  const OriginalWorker = threads.Worker
  threads.Worker = class extends OriginalWorker {
    constructor(filename, options) {
      if (String(filename).endsWith('/watch-source-engine.js'))
        super(
          path.join(
            __dirname,
            process.env.OWNED_SOURCE_SCENARIO === 'operation-cleanup-error'
              ? 'actual-engine.cjs'
              : 'engine.cjs'
          ),
          {
            ...options,
            workerData: {
              engine: filename,
              scenario: process.env.OWNED_SOURCE_SCENARIO,
            },
          }
        )
      else super(filename, options)
    }
  }
}
