const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const childProcess = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

async function main() {
  const settings = JSON.parse(process.argv[3])
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'next-watch-coverage-cancel-'))
  )
  await fs.writeFile(path.join(root, 'next.config.mjs'), 'export default {}\n')
  const file = path.join(root, 'contract.test.mjs')
  await fs.writeFile(file, 'export {}\n')
  const profile = {
    id: 'node',
    environment: 'node',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const entry = { id: 'node:contract.test.mjs', file, profile }
  const project = {
    profile,
    include: ['*.test.mjs'],
    exclude: [],
    setupFiles: [],
    entries: [entry],
    testTimeout: 1000,
    hookTimeout: 1000,
    fileTimeout: 5000,
  }
  const sent = []
  let started
  const startup = new Promise((resolve) => {
    started = resolve
  })
  const child = Object.assign(new EventEmitter(), {
    connected: true,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    send(message, callback) {
      sent.push(message)
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
  const reason = new Error('Test run superseded by a change.')
  reason.name = 'SupersededTestRun'
  const events = []
  let settled = false
  const completion = runWatchProcess(
    {
      operation: 'run',
      projectDir: root,
      projects: [project],
      maxWorkers: 1,
      watchCoverage: true,
      coverage: true,
      standardCoverageOptions: {
        reporter: ['json'],
        exclude: [],
        reportsDirectory: 'coverage',
        reportOnFailure: false,
        thresholds: {},
      },
    },
    {
      signal: controller.signal,
      write() {},
      report: false,
      onEvent(event) {
        events.push(event)
      },
    }
  ).then(
    (value) => {
      settled = true
      return { value }
    },
    (error) => {
      settled = true
      return { error }
    }
  )
  let closed = false
  function close() {
    if (closed) return
    closed = true
    child.connected = false
    child.emit('exit', 0, null)
    child.emit('close', 0, null)
  }
  try {
    await Promise.race([
      startup,
      completion.then((result) => {
        throw (
          result.error ??
          new Error('Coordinator completed before transport startup')
        )
      }),
    ])
    assert.equal(forks, 1)
    const envelope = {
      version: 1,
      runId: 'cancelled-watch-coverage',
      timestamp: 1,
    }
    const event = (value) =>
      child.emit('message', { type: 'event', event: { ...envelope, ...value } })
    event({ type: 'run-start' })
    event({ type: 'file-start', entry, revision: 'compilation-revision' })
    if (settings.abort) controller.abort(reason)
    event({
      type: 'diagnostic',
      entryId: entry.id,
      diagnostic: {
        phase: 'compilation',
        severity: 'error',
        name: 'SupersededTestRun',
        message: reason.message,
      },
    })
    event({
      type: 'file-end',
      entryId: entry.id,
      status: 'cancelled',
      durationMs: 1,
    })
    event({ type: 'run-end', status: 'cancelled', durationMs: 1 })
    const counts = { passed: 0, failed: 0, skipped: 0, cancelled: 0 }
    child.emit('message', {
      type: 'result',
      value: {
        operation: 'run',
        result: {
          runId: envelope.runId,
          status: settings.status,
          files: { ...counts, cancelled: 1 },
          cases: counts,
          attempts: counts,
          errors: 0,
          warnings: 0,
          attachments: 0,
          unsafeCleanup: settings.unsafeCleanup,
          standardCoverage: [],
        },
      },
    })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(
      settled,
      false,
      'Original coordinator must retain completion until transport close'
    )
    close()
    const result = await completion
    assert.equal(result.value, undefined)
    assert.ok(result.error instanceof Error)
    child.stdout.destroy()
    child.stderr.destroy()
    console.log(
      JSON.stringify({
        scenario: settings.scenario,
        expected: settings.expected,
        originalReasonPreserved: result.error === reason,
        rawError: { name: result.error.name, message: result.error.message },
        completionWaitedForClose: true,
        noCoveragePublished:
          result.value === undefined &&
          !events.some((event) => event.type === 'attachment'),
        streamsClosed: child.stdout.destroyed && child.stderr.destroyed,
      })
    )
    if (settings.expected === 'cancellation') {
      assert.equal(result.error, reason)
      assert.ok(sent.some((message) => message.type === 'cancel'))
      assert.ok(
        !events.some(
          (event) =>
            event.type === 'diagnostic' && event.diagnostic.phase === 'runtime'
        )
      )
    } else if (settings.expected === 'coverage-error') {
      assert.match(
        result.error.message,
        /Standard coverage omitted an expected test entry/
      )
    } else {
      assert.match(
        result.error.message,
        /Standard coverage generation cleanup failed/
      )
    }
    assert.ok(!events.some((event) => event.type === 'attachment'))
  } finally {
    close()
    controller.abort(reason)
    await completion
    childProcess.fork = originalFork
    child.stdout.destroy()
    child.stderr.destroy()
    await fs.rm(root, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
