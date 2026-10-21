const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const [mode, runtimePath] = process.argv.slice(2)
assert.ok(['ordered', 'transport-error', 'serialization-error'].includes(mode))
const requireRuntime = createRequire(runtimePath)
const trace = []
const messages = []
const callbacks = []
let concurrent = 0
let maximumConcurrent = 0
let releaseProgress
let progressStarted
const progressGate = new Promise((resolve) => {
  releaseProgress = resolve
})
const progressReached = new Promise((resolve) => {
  progressStarted = resolve
})
const transportError = new Error('controlled progress transport failure')
const serializationError = new Error(
  'controlled progress serialization failure'
)
const nativeConsole = console
const consoleMethods = ['log', 'info', 'debug', 'warn', 'error']
const targetConsole = Object.fromEntries(
  consoleMethods.map((method) => [
    method,
    function () {
      assert.equal(this, targetConsole)
    },
  ])
)
const originals = { ...targetConsole }
const config = {
  version: 1,
  ownerToken: 'unit',
  authorization: 'unit',
  sourceHash: 'a'.repeat(64),
  rpcURL: 'http://unit/rpc',
  runId: 'run',
  entryId: 'entry',
  revision: 'rev',
  filePath: '/case.mjs',
  sourceMaps: [],
}
const context = (name, index) => ({
  id: `run/entry/${index}/0/0`,
  fileId: 'entry',
  testId: `entry/${index}`,
  name,
  retry: 0,
  repeat: 0,
})
const result = (name, index) => ({
  entryId: 'entry',
  caseId: `entry/${index}`,
  name,
  status: 'passed',
  durationMs: 0,
  errors: [],
  ancestors: ['saved'],
  attempt: { id: `run/entry/${index}/0/0`, retry: 0, repeat: 0 },
})
const file = {
  collect: async (load) => load(),
  validateBrowserClient: () => [],
  async run(options) {
    for (const [index, name] of ['A', 'B'].entries()) {
      const started = options.onCaseStart(context(name, index))
      callbacks.push({
        event: name + '-start',
        synchronous: started === undefined,
      })
      await started
      trace.push('body-' + name)
      const completed = result(name, index)
      if (mode === 'serialization-error' && name === 'A')
        completed.note = {
          toJSON() {
            throw serializationError
          },
        }
      const ended = options.onCaseEnd(completed)
      callbacks.push({ event: name + '-end', synchronous: ended === undefined })
      await ended
      completed.ancestors.push('changed after enqueue')
    }
    trace.push('afterAll')
    const suite = {
      entryId: 'entry',
      suiteId: 'entry',
      name: '',
      status: 'passed',
      durationMs: 0,
      errors: [],
      ancestors: ['suite-saved'],
    }
    const ended = options.onSuiteEnd(suite)
    callbacks.push({ event: 'suite-end', synchronous: ended === undefined })
    await ended
    suite.ancestors.push('changed after enqueue')
    trace.push('run-finished')
    return {
      cases: [result('A', 0), result('B', 1)],
      errors: [],
      interrupted: false,
    }
  },
  dispose() {
    trace.push('file-cleanup')
  },
  getSnapshotSummary: () => ({}),
  takeSnapshotUpdates: () => [],
}
function replace(name, exports) {
  const filename = requireRuntime.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
replace('../runner', { initializeTestFile: () => file })
replace('./snapshot-environment', { installBrowserSnapshotBridge() {} })
replace('./source-maps', {
  createClientSourceMapResolver: () => ({ mapLocation: (value) => value }),
})
replace('./browser-context', {
  cleanupBrowserKeyboard() {},
  initializeBrowserContext: () => ({
    install() {},
    dispose() {
      trace.push('context-cleanup')
    },
  }),
  cleanupBrowserContext() {
    trace.push('browser-cleanup')
  },
})
globalThis.location = { href: 'http://unit/' }
globalThis.addEventListener = () => {}
globalThis.fetch = async (_url, options) => {
  if (!options?.method) return { ok: true, json: async () => config }
  const message = JSON.parse(options.body)
  messages.push(message)
  maximumConcurrent = Math.max(maximumConcurrent, ++concurrent)
  try {
    if (
      mode === 'ordered' &&
      message.type === 'case-end' &&
      message.result.name === 'A'
    ) {
      progressStarted()
      await progressGate
    }
    await new Promise((resolve) => setImmediate(resolve))
    if (mode === 'transport-error' && message.type === 'case-end')
      throw transportError
    return { ok: true, json: async () => ({ value: null }) }
  } finally {
    concurrent--
  }
}
async function main() {
  let failure, beforeRelease
  let settled = false
  globalThis.console = targetConsole
  const running = require(runtimePath).startClientTest(() => {}, {
    initialize: () => ({
      dispose() {
        trace.push('mocks-cleanup')
      },
    }),
    register() {},
  })
  running.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    }
  )
  try {
    if (mode === 'ordered') {
      await Promise.race([
        progressReached,
        running.then(() => {
          throw new Error(
            'Runtime completed before controlled progress request'
          )
        }),
      ])
      await new Promise((resolve) => setImmediate(resolve))
      beforeRelease = {
        runFinished: trace.includes('run-finished'),
        afterAll: trace.includes('afterAll'),
        terminalPending: !settled,
        maximumConcurrent,
      }
      releaseProgress()
    }
    try {
      await running
    } catch (error) {
      failure = error
    }
  } finally {
    releaseProgress()
    globalThis.console = nativeConsole
  }
  const observed = {
    mode,
    callbacks,
    messages,
    trace,
    beforeRelease,
    maximumConcurrent,
    restored: consoleMethods.every(
      (method) => targetConsole[method] === originals[method]
    ),
    failure: failure && { name: failure.name, message: failure.message },
  }
  // Retain genuine runtime observations before this component's comparisons.
  process.stdout.write(JSON.stringify(observed) + '\n')
  assert.deepEqual(targetConsole, originals)
  assert.deepEqual(trace, [
    'body-A',
    'body-B',
    'afterAll',
    'run-finished',
    'browser-cleanup',
    'file-cleanup',
    'mocks-cleanup',
    'context-cleanup',
  ])
  assert.equal(callbacks.length, 5)
  assert.ok(callbacks.every((row) => row.synchronous))
  assert.equal(maximumConcurrent, 1)
  if (mode === 'ordered') {
    assert.equal(failure, undefined)
    assert.deepEqual(beforeRelease, {
      runFinished: true,
      afterAll: true,
      terminalPending: true,
      maximumConcurrent: 1,
    })
    assert.deepEqual(
      messages.map((message) => message.type),
      [
        'collected',
        'case-start',
        'case-end',
        'case-start',
        'case-end',
        'suite-end',
        'complete',
      ]
    )
    assert.deepEqual(
      messages.map((message) => message.sequence),
      messages.map((_, index) => index)
    )
    for (const message of messages.filter(
      (message) => message.type === 'case-end'
    ))
      assert.deepEqual(message.result.ancestors, ['saved'])
    assert.deepEqual(
      messages.find((message) => message.type === 'suite-end').result.ancestors,
      ['suite-saved']
    )
    assert.equal(messages.at(-1).status, 'passed')
    assert.equal(messages.at(-1).caseCount, 2)
  } else {
    assert.equal(
      failure,
      mode === 'transport-error' ? transportError : serializationError
    )
    assert.ok(!messages.some((message) => message.type === 'complete'))
    assert.equal(
      messages.at(-1).type,
      mode === 'transport-error' ? 'case-end' : 'case-start'
    )
  }
}
main().catch((error) => {
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
