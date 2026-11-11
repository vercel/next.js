const fs = require('node:fs')
const path = require('node:path')
const processes = require('child_process')
const originalFork = processes.fork
const controller = new AbortController()
process.on('message', (message) => {
  if (message.type === 'cancel') {
    controller.abort(new Error('custom supervisor cancelled'))
    return
  }
  if (message.type !== 'run') return
  const { request, runtime, producer } = message.input
  let producerPid
  let retainedCache
  if (message.input.uncertainCancellation) {
    const promises = require('node:fs/promises')
    const originalRemove = promises.rm
    promises.rm = async (file, options) => {
      if (String(file).includes('next-test-cache-') && !retainedCache) {
        retainedCache = String(file)
        throw new Error('uncertain cancelled file-cache lease')
      }
      return originalRemove(file, options)
    }
  }
  processes.fork = (file, ...args) => {
    const child = originalFork(
      String(file).endsWith('/watch-worker.js') ? producer : file,
      ...args
    )
    if (String(file).endsWith('/watch-worker.js')) producerPid = child.pid
    return child
  }
  void (async () => {
    const { runWatchProcess, WatchOwnershipError } = require(
      runtime + '/watch-process'
    )
    let diagnostics = ''
    let outcome
    try {
      outcome = {
        value: await runWatchProcess(request, {
          signal: controller.signal,
          write(text) {
            diagnostics += text
          },
          report: false,
        }),
      }
    } catch (error) {
      outcome = {
        error: error.message,
        uncertain: error instanceof WatchOwnershipError,
        cancelled:
          controller.signal.aborted && error === controller.signal.reason,
        retainedCache,
      }
    }
    if (outcome.error && diagnostics) outcome.error += '\n' + diagnostics
    fs.writeFileSync(
      path.join(request.projectDir, 'producer-pid.json'),
      JSON.stringify(producerPid)
    )
    process.send(outcome, () => {
      process.disconnect()
      process.exit(0)
    })
  })().catch((error) => {
    console.error(error)
    process.exitCode = 1
    process.disconnect?.()
  })
})
