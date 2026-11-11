if (process.send && process.argv[1]?.endsWith('/watch-worker.js')) {
  const path = require('node:path')
  const file = path.join(
    process.env.QUEUED_WORKER_DIST,
    'experimental/testing/orchestrator.js'
  )
  const mode = process.env.QUEUED_FAULT_MODE || 'both'
  const failure = new Error('owned independent execution disposal failure')
  const queuedFailure = new Error('owned queued IPC write failure', {
    cause: new Error('owned actual write cause'),
  })
  let writes = 0
  require.cache[file] = {
    id: file,
    filename: file,
    loaded: true,
    exports: {
      async runTests(root, projects, options) {
        options.onModuleQueued(projects[0].entries[0])
        if (mode === 'two-writes')
          options.onModuleQueued({
            ...projects[0].entries[0],
            id: 'owned:other',
          })
        await new Promise((resolve) => setImmediate(resolve))
        if (mode === 'same-value') throw queuedFailure
        if (mode === 'undefined-run') throw undefined
        if (mode === 'echo') throw options.signal.reason
        if (mode !== 'two-writes') throw failure
        return { status: 'passed' }
      },
    },
  }
  const send = process.send.bind(process)
  process.send = function (message, ...args) {
    if (message?.type === 'module-queued') {
      writes++
      const occurrence = writes
      if (mode === 'undefined-write') throw undefined
      const callback = args.at(-1)
      process.nextTick(() =>
        callback(
          mode === 'two-writes'
            ? new Error('owned queued write ' + occurrence)
            : queuedFailure
        )
      )
      return false
    }
    return send(message, ...args)
  }
}
