const assert = require('node:assert/strict')
const {
  createRuntimeFile,
  installClientRuntime,
  createRuntimeConfig,
  installRuntimeEnvironment,
} = require('./runtime-fixtures.cjs')
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

const shared = Object.assign(new Error('same actual cleanup failure'), {
    name: 'FixtureCleanupError',
    stack: '',
  }),
  messages = [],
  trace = []
let snapshots = false,
  workerJoined = false,
  workerTaken = false
const file = createRuntimeFile({
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
  takeSnapshotUpdates() {
    snapshots = true
    return []
  },
})
const runtimePath = installClientRuntime({
  file,
  browserContext: {
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
  },
})
const originalConsole = console,
  config = createRuntimeConfig('context-unit', '/context.test.mjs')
async function main() {
  installRuntimeEnvironment(config, messages, originalConsole)
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
