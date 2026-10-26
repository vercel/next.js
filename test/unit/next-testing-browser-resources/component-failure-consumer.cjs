const assert = require('node:assert/strict'),
  { createRequire } = require('node:module')
const mode = process.argv[2]
assert(
  [
    'normal',
    'component',
    'component-worker',
    'file-component-worker-same',
    'legacy',
    'aggregate-same',
    'getter-values',
  ].includes(mode)
)
const runtimePath = require.resolve(
    'next/dist/experimental/testing/client/runtime'
  ),
  local = createRequire(runtimePath)
const replace = (name, exports) => {
  const filename = local.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
const trace = [],
  messages = [],
  shared = new Error('same actual cleanup failure')
shared.name = 'FixtureCleanupError'
shared.stack = ''
const reads = [],
  fields = {
    name: 'FixtureCleanupError',
    message: 'original component getter failure',
    stack: '',
  },
  getterError = {}
for (const key of ['name', 'message', 'stack'])
  Object.defineProperty(getterError, key, {
    get() {
      assert.equal(this, getterError)
      reads.push(key)
      return fields[key]
    },
  })
const component = mode === 'getter-values' ? getterError : shared
const workerFails = ['component-worker', 'file-component-worker-same'].includes(
    mode
  ),
  fileFails = mode === 'file-component-worker-same'
let snapshots = false,
  workerJoined = false,
  workerTaken = false
const file = {
  enableBrowserPublicTaskQueues() {},
  collect: async (load) => load(),
  validateBrowserClient: () => [],
  run: async () => ({
    cases: [],
    errors: fileFails ? [{ phase: 'cleanup', error: shared }] : [],
    interrupted: false,
  }),
  async dispose(options) {
    trace.push('file-start')
    await options?.beforeOwnedWorkerDispose?.()
    trace.push('worker')
    workerJoined = true
    if (workerFails) throw shared
  },
  takeOwnedWorkerDisposalFailure(error) {
    assert(workerJoined)
    if (!workerFails || workerTaken || error !== shared) return undefined
    workerTaken = true
    return Object.freeze({ error })
  },
  getSnapshotSummary: () => ({}),
  takeSnapshotUpdates() {
    snapshots = true
    return []
  },
}
replace('../runner', {
  getConsoleTask: () => undefined,
  getCurrentConsoleTask: () => undefined,
  initializeTestFile: () => file,
})
replace('./snapshot-environment', { installBrowserSnapshotBridge() {} })
replace('./source-maps', {
  createClientSourceMapResolver: () => ({ mapLocation: (value) => value }),
})
replace('./browser-context', {
  initializeBrowserContext: () => ({
    install() {},
    dispose: () => trace.push('context-dispose'),
  }),
  async cleanupBrowserContext(observation) {
    trace.push('component')
    if (mode === 'normal') return
    if (mode === 'legacy') throw shared
    observation?.onComponentFailure?.(Object.freeze({ error: component }))
    if (mode === 'getter-values') {
      fields.name = 'LaterName'
      fields.message = 'later component mutation'
      fields.stack = 'later stack'
    }
    if (mode === 'aggregate-same')
      throw new AggregateError([shared, shared], 'actual mixed cleanup')
    throw component
  },
  async cleanupBrowserKeyboard() {
    trace.push('keyboard')
  },
})
const config = {
    version: 1,
    ownerToken: 'component-occurrence',
    authorization: 'component-occurrence',
    sourceHash: 'a'.repeat(64),
    rpcURL: 'http://unit/rpc',
    runId: 'component-occurrence',
    entryId: 'component-occurrence',
    revision: 'component-occurrence',
    filePath: '/component.test.mjs',
    sourceMaps: [],
  },
  originalConsole = console
async function main() {
  globalThis.location = { href: 'http://unit/' }
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  globalThis.fetch = async (_url, request) => {
    if (!request?.method) return { ok: true, json: async () => config }
    messages.push(JSON.parse(request.body))
    return { ok: true, json: async () => ({ value: null }) }
  }
  globalThis.console = { ...originalConsole, debug() {} }
  try {
    await require(runtimePath).startClientTest(
      () => trace.push('load'),
      {
        initialize: () => ({ dispose: () => trace.push('mocks') }),
        register() {},
      },
      () => ({
        waitForImports: async () => {},
        dispose: () => trace.push('imports'),
      })
    )
  } finally {
    globalThis.console = originalConsole
  }
  assert.deepEqual(trace, [
    'load',
    'file-start',
    'component',
    'keyboard',
    'worker',
    'imports',
    'mocks',
    'context-dispose',
  ])
  const failures = messages.filter((message) => message.type === 'failure')
  const expectedOrigins =
    mode === 'normal'
      ? []
      : mode === 'legacy' || mode === 'aggregate-same'
        ? [undefined]
        : [
            ...(fileFails ? [undefined] : []),
            'component-cleanup',
            ...(workerFails ? ['worker-fixture-cleanup'] : []),
          ]
  assert.deepEqual(
    failures.map((value) => value.origin),
    expectedOrigins
  )
  if (mode === 'getter-values') {
    assert.deepEqual(reads, ['name', 'message', 'stack'])
    assert.deepEqual(failures[0].error, {
      name: 'FixtureCleanupError',
      message: 'original component getter failure',
      stack: '',
    })
  }
  if (mode === 'file-component-worker-same') assert.equal(failures.length, 3)
  const terminal = messages.at(-1)
  assert.equal(terminal.type, 'complete')
  assert.equal(terminal.status, mode === 'normal' ? 'passed' : 'failed')
  assert.equal(snapshots, mode === 'normal')
  assert.deepEqual(terminal.updates, [])
  process.stdout.write(
    JSON.stringify({
      mode,
      onlyJoinedSoleComponentClassified: true,
      legacyAndMixedFallbackHeld: true,
      perStageSameErrorOrderHeld: true,
      fieldReadOrderAndSnapshotVetoHeld: true,
    }) + '\n'
  )
}
main().catch((error) => {
  globalThis.console = originalConsole
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
