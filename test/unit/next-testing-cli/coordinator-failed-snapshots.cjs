const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const childProcess = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

async function main() {
  const scenario = process.argv[3]
  const root = await fs.realpath(
    await fs.mkdtemp(
      path.join(os.tmpdir(), 'next-failed-snapshot-coordinator-')
    )
  )
  const profile = {
    id: 'node',
    environment: 'node',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const entries = [1, 2].map((number) => ({
    id: 'node:' + number,
    file: path.join(root, number + '.test.mjs'),
    profile,
  }))
  for (const entry of entries) await fs.writeFile(entry.file, 'export {}\n')
  const snapshot = path.join(root, '1.test.mjs.snap')
  await fs.writeFile(snapshot, 'original')
  const project = {
    profile,
    include: ['*.test.mjs'],
    exclude: [],
    setupFiles: [],
    entries,
    testTimeout: 1000,
    hookTimeout: 1000,
    fileTimeout: 5000,
  }
  const projects =
    scenario === 'mixed-profile'
      ? [
          { ...project, entries: [entries[0]] },
          {
            ...project,
            profile: { ...profile, id: 'rsc', environment: 'rsc' },
            entries: [
              {
                ...entries[1],
                profile: { ...profile, id: 'rsc', environment: 'rsc' },
              },
            ],
          },
        ]
      : [project]
  let started
  const startup = new Promise((resolve) => {
    started = resolve
  })
  const child = Object.assign(new EventEmitter(), {
    connected: true,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    send(message, callback) {
      callback?.(null)
      if (message.type === 'start') started()
      return true
    },
  })
  const originalFork = childProcess.fork
  childProcess.fork = () => child
  const brokerPath = require.resolve(
    path.join(path.dirname(process.argv[2]), 'execution/broker.js')
  )
  const originalJavaScript = Module._extensions['.js']
  let brokerOptions
  let brokerClosing = false
  let brokerClosed = false
  let releaseBroker
  const brokerGate = new Promise((resolve) => {
    releaseBroker = resolve
  })
  const brokerStub = {
    createExecutionBrokerHost(options) {
      brokerOptions = options
      return {
        handle() {
          return false
        },
        async close() {
          brokerClosing = true
          await brokerGate
          brokerClosed = true
        },
      }
    },
  }
  // The native dynamic import must first load this controlled transport seam.
  // Replacing an already required CommonJS namespace does not replace its native
  // import namespace on current Node versions.
  Module._extensions['.js'] = function (loaded, filename) {
    if (filename === brokerPath) {
      loaded.exports = brokerStub
      return
    }
    return originalJavaScript(loaded, filename)
  }
  const { runWatchProcess } = require(process.argv[2])
  const controller = new AbortController()
  let settled = false
  let commits = 0
  const completion = runWatchProcess(
    {
      operation: 'run',
      isolatedProfile: scenario !== 'real-watch',
      projectDir: root,
      projects,
      maxWorkers: 1,
      updateSnapshots: true,
    },
    {
      signal: controller.signal,
      write() {},
      report: false,
      onSnapshotCommitStart() {
        assert.equal(brokerClosed, true)
        assert.equal(child.connected, false)
        commits++
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
    child.emit('exit', scenario === 'nonzero-exit' ? 1 : 0, null)
    child.emit('close', scenario === 'nonzero-exit' ? 1 : 0, null)
  }
  try {
    await Promise.race([
      startup,
      completion.then((result) => {
        throw result.error ?? new Error('Completed before coordinator startup')
      }),
    ])
    const envelope = {
      version: 1,
      runId: 'failed-body-snapshots',
      timestamp: 1,
    }
    const event = (value) =>
      child.emit('message', { type: 'event', event: { ...envelope, ...value } })
    event({ type: 'run-start' })
    for (const entry of projects.flatMap((value) => value.entries))
      event({ type: 'file-start', entry, revision: 'snapshot-revision' })
    const hash = createHash('sha256')
      .update(await fs.readFile(entries[0].file))
      .digest('hex')
    const updates = [
      { path: snapshot, previousContent: 'original', content: 'updated' },
    ]
    if (scenario === 'edited-source')
      updates.push({
        path: entries[0].file,
        previousContent: 'export {}\n',
        content: 'export const inline = "snapshot"\n',
      })
    await brokerOptions.onSnapshotUpdates(
      entries[0].id,
      entries[0].file,
      updates,
      hash
    )
    if (scenario !== 'missing-plan')
      await brokerOptions.onSnapshotUpdates(
        entries[1].id,
        entries[1].file,
        [],
        hash
      )
    if (scenario === 'edited-source')
      await fs.writeFile(entries[0].file, 'export const changed = true\n')
    if (scenario === 'run-diagnostic')
      event({
        type: 'diagnostic',
        diagnostic: {
          name: 'Error',
          message: 'project teardown after qualified file plans',
          phase: 'cleanup',
          severity: 'error',
        },
      })
    const status = scenario === 'cancelled-seal' ? 'cancelled' : 'failed'
    for (const [index, entry] of projects
      .flatMap((value) => value.entries)
      .entries())
      event({
        type: 'file-end',
        entryId: entry.id,
        status: index === 0 ? status : 'passed',
        durationMs: 1,
      })
    event({ type: 'run-end', status, durationMs: 1 })
    const counts = { passed: 0, failed: 0, skipped: 0, cancelled: 0 }
    child.emit('message', {
      type: 'result',
      value: {
        operation: 'run',
        result: {
          runId: envelope.runId,
          status,
          files: { ...counts, failed: 1, passed: 1 },
          cases: counts,
          attempts: counts,
          errors: 0,
          warnings: 0,
          attachments: 0,
          unsafeCleanup: scenario === 'unsafe-cleanup',
        },
      },
    })
    if (scenario === 'aborted')
      controller.abort(new Error('cancel publication'))
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(settled, false)
    assert.equal(await fs.readFile(snapshot, 'utf8'), 'original')
    close()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(brokerClosing, true)
    assert.equal(brokerClosed, false)
    assert.equal(settled, false)
    assert.equal(await fs.readFile(snapshot, 'utf8'), 'original')
    releaseBroker()
    const result = await completion
    if (['edited-source', 'nonzero-exit', 'aborted'].includes(scenario))
      assert(result.error instanceof Error)
    else {
      assert.equal(result.error, undefined)
      assert.equal(result.value.operation, 'run')
    }
    const accepted = scenario === 'complete'
    assert.equal(
      await fs.readFile(snapshot, 'utf8'),
      accepted ? 'updated' : 'original'
    )
    assert.equal(commits, accepted || scenario === 'edited-source' ? 1 : 0)
    console.log(
      JSON.stringify({
        scenario,
        accepted,
        waitedForProcessAndBrokerClose: true,
        sourceAndExistingByteFencesHeld: true,
      })
    )
  } finally {
    releaseBroker()
    close()
    await completion
    childProcess.fork = originalFork
    Module._extensions['.js'] = originalJavaScript
    child.stdout.destroy()
    child.stderr.destroy()
    await fs.rm(root, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
