const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { tmpdir } = require('node:os')
const { createCustomReporterRuntime } = require(path.resolve(process.argv[2]))
const output = path.resolve(process.argv[3])
const mode = process.argv[4] || 'all'
const fixture =
  process.argv[5] || path.join(__dirname, 'fixtures/watch-close-owner.mjs')
const models = []
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function setup(watch, name, gated = false) {
  const root = await fs.mkdtemp(
    path.join(tmpdir(), 'next-watch-close-component-')
  )
  await fs.cp(fixture, path.join(root, 'reporter.mjs'))
  const state = {
    trace: [],
    gated,
    closeEntered: deferred(),
    releaseClose: deferred(),
  }
  globalThis[Symbol.for('next-test.watch-close-component')] = state
  const initialized = deferred(),
    closed = deferred(),
    sent = [],
    closes = []
  const runtime = createCustomReporterRuntime({
    send(message) {
      sent.push(message)
      if (message.type === 'custom-reporter-failed')
        initialized.reject(message.error)
      else if (message.type === 'custom-reporter-result') initialized.resolve()
      return Promise.resolve()
    },
    closeTransport(code) {
      closes.push(code)
      closed.resolve(code)
    },
  })
  runtime.receive({
    type: 'run',
    input: {
      projectDir: root,
      files: [path.join(root, 'reporter.mjs')],
      ...(watch ? { watch: true } : {}),
    },
  })
  await initialized.promise
  return { root, state, runtime, closed, sent, closes, name }
}
async function cancellation(watch, delivery) {
  const owner = await setup(
    watch,
    `${watch ? 'watch' : 'one-shot'}-${delivery}`
  )
  try {
    if (delivery === 'disconnect') await owner.runtime.disconnect()
    else {
      owner.runtime.receive({ type: 'cancel' })
      await owner.closed.promise
    }
    assert.deepEqual(owner.closes, [1])
    assert.deepEqual(
      owner.state.trace,
      watch ? ['init'] : ['init', 'close-start', 'close-end']
    )
    await owner.runtime.disconnect()
    assert.deepEqual(owner.closes, [1])
    models.push({
      name: owner.name,
      trace: owner.state.trace,
      closes: owner.closes,
      sentTypes: owner.sent.map((x) => x.type),
      passed: true,
    })
  } finally {
    await fs.rm(owner.root, { recursive: true, force: true })
  }
}
async function graceful() {
  const owner = await setup(true, 'watch-graceful-gated', true)
  try {
    owner.runtime.receive({ type: 'shutdown' })
    await owner.state.closeEntered.promise
    assert.deepEqual(owner.state.trace, ['init', 'close-start'])
    assert.deepEqual(owner.closes, [])
    owner.state.releaseClose.resolve()
    assert.equal(await owner.closed.promise, 0)
    assert.deepEqual(owner.state.trace, ['init', 'close-start', 'close-end'])
    await owner.runtime.disconnect()
    assert.deepEqual(owner.closes, [0])
    models.push({
      name: owner.name,
      trace: owner.state.trace,
      closes: owner.closes,
      sentTypes: owner.sent.map((x) => x.type),
      waitedForActualCloseRelease: true,
      passed: true,
    })
  } finally {
    owner.state.releaseClose.resolve()
    await fs.rm(owner.root, { recursive: true, force: true })
  }
}
async function main() {
  await fs.mkdir(output, { recursive: true })
  if (mode === 'all' || mode === 'cancel-policy')
    for (const watch of [true, false])
      for (const delivery of ['disconnect', 'cancel'])
        await cancellation(watch, delivery)
  if (mode === 'all' || mode === 'graceful') await graceful()
  await fs.writeFile(
    path.join(output, 'RESULT.json'),
    JSON.stringify(
      {
        status: 'passed',
        actualNode: process.version,
        models,
        actualTaskEntitiesCreated: 0,
        nextNativeCalls: 0,
      },
      null,
      2
    ) + '\n'
  )
  console.log(JSON.stringify({ status: 'passed', models: models.length }))
}
main().catch(async (error) => {
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(
    path.join(output, 'RESULT.json'),
    JSON.stringify(
      {
        status: 'failed',
        actualNode: process.version,
        models,
        error: { name: error.name, message: error.message, stack: error.stack },
      },
      null,
      2
    ) + '\n'
  )
  console.error(error)
  process.exitCode = 1
})
