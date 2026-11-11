const assert = require('node:assert/strict')
const { createRuntimeConfig } = require('./runtime-fixtures.cjs')
const {
  createCleanupError,
  createCleanupFile,
  installCleanupRuntime,
  startCleanupRuntime,
} = require('./cleanup-consumer-utils.cjs')
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

const trace = [],
  messages = [],
  shared = new Error('same actual cleanup failure')
shared.name = 'FixtureCleanupError'
shared.stack = ''
const {
  reads,
  fields,
  error: getterError,
} = createCleanupError('original component getter failure')
const component = mode === 'getter-values' ? getterError : shared
const workerFails = ['component-worker', 'file-component-worker-same'].includes(
    mode
  ),
  fileFails = mode === 'file-component-worker-same'
const state = createCleanupFile({ trace, shared, workerFails, fileFails })
const { file } = state
const runtimePath = installCleanupRuntime({
  trace,
  file,
  browserContext: {
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
  },
})
const config = createRuntimeConfig(
    'component-occurrence',
    '/component.test.mjs'
  ),
  originalConsole = console
async function main() {
  try {
    await startCleanupRuntime({
      runtimePath,
      config,
      messages,
      trace,
      originalConsole,
    })
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
  assert.equal(state.snapshots, mode === 'normal')
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
