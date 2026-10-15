const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const childProcess = require('node:child_process')

async function main() {
  const { scenario, accepted, request, collections } = JSON.parse(
    process.argv[3]
  )
  let started
  const startup = new Promise((resolve) => {
    started = resolve
  })
  const sent = []
  const child = Object.assign(new EventEmitter(), {
    connected: true,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    send(message, callback) {
      sent.push({ message, callback })
      callback?.(null)
      if (message.type === 'start') started()
      return true
    },
  })
  const originalFork = childProcess.fork
  let forks = 0
  childProcess.fork = () => {
    forks++
    return child
  }
  const { runWatchProcess } = require(process.argv[2])
  const controller = new AbortController()
  const completion = runWatchProcess(request, {
    signal: controller.signal,
    write() {},
    report: false,
  }).then(
    (value) => ({ value, error: undefined }),
    (error) => ({ value: undefined, error })
  )
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    child.emit('exit', 0, null)
    child.emit('close', 0, null)
  }
  try {
    // Startup errors must fail every control, including negative payload cases.
    // Native Node loads the unchanged dist module's real dynamic broker import.
    await Promise.race([
      startup,
      completion.then((result) => {
        if (result.error) throw result.error
        throw new Error('Coordinator completed before starting transport.')
      }),
    ])
    assert.equal(forks, 1)
    assert.ok(
      sent.some(
        ({ message, callback }) =>
          message.type === 'start' && typeof callback === 'function'
      )
    )
    const entry = request.projects[0].entries[0]
    const revision = 'observed-collection-revision'
    const envelope = {
      version: 1,
      runId: 'coordinator-collection',
      timestamp: 1,
    }
    const event = (payload) =>
      child.emit('message', {
        type: 'event',
        event: { ...envelope, ...payload },
      })
    event({ type: 'run-start' })
    if (scenario !== 'missing file start')
      event({
        type: 'file-start',
        entry,
        ...(scenario === 'missing start revision' ? {} : { revision }),
      })
    event({
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 1,
    })
    event({ type: 'run-end', status: 'passed', durationMs: 1 })
    const counts = { passed: 0, failed: 0, skipped: 0, cancelled: 0 }
    child.emit('message', {
      type: 'result',
      value: {
        operation: 'run',
        result: {
          runId: envelope.runId,
          status: 'passed',
          files: { ...counts, passed: 1 },
          cases: counts,
          attempts: counts,
          errors: 0,
          warnings: 0,
          attachments: 0,
          unsafeCleanup: false,
          ...(scenario === 'missing facts' ? {} : { collections }),
        },
      },
    })
    close()
    const result = await completion
    if (accepted) {
      assert.equal(result.error, undefined)
      assert.equal(result.value.operation, 'run')
      assert.equal(result.value.result.status, 'passed')
      assert.deepEqual(result.value.result.collections, collections)
    } else {
      assert.ok(result.error instanceof Error)
      assert.equal(result.value, undefined)
    }
    console.log(JSON.stringify({ scenario, accepted }))
  } finally {
    close()
    controller.abort()
    await completion
    childProcess.fork = originalFork
    child.stdout.destroy()
    child.stderr.destroy()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
