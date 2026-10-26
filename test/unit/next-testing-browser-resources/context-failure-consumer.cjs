const assert = require('node:assert/strict'),
  { createRequire } = require('node:module')
const mode = process.argv[2]
assert(
  [
    'good',
    'file-error',
    'missing',
    'clone-component',
    'swapped',
    'different-aggregate',
    'call',
    'observer',
  ].includes(mode)
)
const runtimePath = require.resolve(
    'next/dist/experimental/testing/client/runtime'
  ),
  local = createRequire(runtimePath)
function replace(name, exports) {
  const filename = local.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
const shared = Object.assign(new Error('same actual cleanup failure'), {
    name: 'FixtureCleanupError',
    stack: '',
  }),
  messages = [],
  trace = []
let snapshots = false,
  workerJoined = false,
  workerTaken = false
const file = {
  enableBrowserPublicTaskQueues() {},
  collect: async (load) => load(),
  validateBrowserClient: () => [],
  run: async () => ({
    cases: [],
    errors: mode === 'file-error' ? [{ phase: 'cleanup', error: shared }] : [],
    interrupted: false,
  }),
  async dispose(options) {
    trace.push('file')
    await options?.beforeOwnedWorkerDispose?.()
    trace.push('worker')
    workerJoined = true
    throw shared
  },
  takeOwnedWorkerDisposalFailure(error) {
    assert(workerJoined)
    if (workerTaken || error !== shared) return
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
    trace.push('context')
    const component = Object.freeze({ error: shared })
    observation.onComponentFailure(component)
    const captured = observation.captureKeyboardError(shared),
      keyboard = Object.freeze({
        status: 'rejected',
        error: shared,
        ownership: mode === 'call' ? 'call' : 'cleanup',
        captured: Object.freeze({ value: captured }),
      })
    observation.onKeyboardCleanup(keyboard)
    const aggregate = new AggregateError(
      [shared, shared],
      'actual context pair'
    )
    if (mode !== 'missing')
      observation.onContextCleanupFailure(
        Object.freeze({
          error:
            mode === 'different-aggregate'
              ? new AggregateError([shared, shared])
              : aggregate,
          component:
            mode === 'clone-component'
              ? Object.freeze({ error: shared })
              : mode === 'swapped'
                ? keyboard
                : component,
          keyboard: mode === 'swapped' ? component : keyboard,
        })
      )
    if (mode === 'observer')
      throw new AggregateError(
        [shared, shared, shared],
        'actual pair and independent observer'
      )
    throw aggregate
  },
  async cleanupBrowserKeyboard() {
    trace.push('fallback')
  },
})
const originalConsole = console,
  config = {
    version: 1,
    ownerToken: 'context-unit',
    authorization: 'context-unit',
    sourceHash: 'a'.repeat(64),
    rpcURL: 'http://unit/rpc',
    runId: 'context-unit',
    entryId: 'context-unit',
    revision: 'context-unit',
    filePath: '/context.test.mjs',
    sourceMaps: [],
  }
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
    'file',
    'context',
    'worker',
    'imports',
    'mocks',
    'context-dispose',
  ])
  const failures = messages.filter((x) => x.type === 'failure')
  const paired = mode === 'good' || mode === 'file-error'
  assert.deepEqual(
    failures.map((x) => x.origin),
    [
      ...(mode === 'file-error' ? [undefined] : []),
      ...(paired ? ['component-cleanup', 'keyboard-cleanup'] : [undefined]),
      'worker-fixture-cleanup',
    ]
  )
  assert.equal(messages.at(-1).status, 'failed')
  assert.equal(snapshots, false)
  assert.deepEqual(messages.at(-1).updates, [])
  console.log(
    JSON.stringify({
      mode,
      exactActualTokenPairRequired: true,
      sharedValuesCannotReplaceOccurrences: true,
      workerRemainsIndependentThird: true,
      internalFailureAndSnapshotVetoHeld: true,
    })
  )
}
main().catch((error) => {
  globalThis.console = originalConsole
  console.error(error)
  process.exitCode = 1
})
