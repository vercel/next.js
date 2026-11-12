// Controlled host seams retain the real inspector capture and native events.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const Module = require('node:module')
const base = process.env.NEXT_TEST_CAPTURE_RUNTIME
const mode = process.env.NEXT_TEST_CAPTURE_MODE
const record = (value) =>
  fs.appendFileSync(
    process.env.NEXT_TEST_CAPTURE_TRACE,
    JSON.stringify(value) + '\n'
  )
let firstReason
process.on('unhandledRejection', (reason) => {
  firstReason ??= reason
  record({
    event: 'native',
    sameError: reason === firstReason,
    message: reason?.message,
  })
})
const originalJavaScript = Module._extensions['.js']
Module._extensions['.js'] = function (loaded, filename) {
  originalJavaScript(loaded, filename)
  if (filename === path.join(base, 'coverage/collector.js')) {
    const original = loaded.exports.startCoverage
    loaded.exports = {
      ...loaded.exports,
      async startCoverage(...args) {
        const collector = await original(...args)
        return {
          ...collector,
          async stop() {
            const data = await collector.stop()
            record({
              event: 'captured',
              scripts: data.scripts.length,
              sha256: crypto
                .createHash('sha256')
                .update(JSON.stringify(data))
                .digest('hex'),
            })
            if (mode === 'during-capture') {
              Promise.reject(new Error('unknown during capture'))
              await new Promise((resolve) => setImmediate(resolve))
            }
            return data
          },
        }
      },
    }
  }
  if (filename === path.join(base, 'execution/console.js')) {
    const original = loaded.exports.installTestConsole
    loaded.exports = {
      ...loaded.exports,
      installTestConsole(...args) {
        const capture = original(...args)
        return {
          ...capture,
          async dispose() {
            await capture.dispose()
            record({ event: 'console-disposed' })
            if (
              mode === 'after-capture' ||
              mode === 'same-error-after-capture'
            ) {
              if (mode === 'same-error-after-capture' && !firstReason)
                throw new Error('Native BODY event was not observed')
              Promise.reject(
                mode === 'same-error-after-capture'
                  ? firstReason
                  : new Error('unknown after capture')
              )
              await new Promise((resolve) => setImmediate(resolve))
            }
          },
        }
      },
    }
  }
}
const originalSend = process.send
process.send = function (message, ...args) {
  if (message.type === 'complete') {
    record({ event: 'terminal', coverageComplete: message.coverage?.complete })
    if (mode === 'missing-receipt') delete message.coverage
    if (mode === 'incomplete-receipt') {
      const { data: _data, ...identity } = message.coverage
      message.coverage = {
        ...identity,
        complete: false,
        error: {
          phase: 'runtime',
          severity: 'error',
          message: 'Controlled incomplete capture',
        },
      }
    }
    if (mode === 'mismatched-receipt') message.coverage.revision = 'foreign'

    if (mode === 'post-receipt' && typeof args.at(-1) === 'function') {
      const callback = args.at(-1)
      args[args.length - 1] = (...values) => {
        Promise.reject(new Error('unknown after terminal IPC receipt'))
        setImmediate(() => callback(...values))
      }
    }
  }
  return Reflect.apply(originalSend, this, [message, ...args])
}
