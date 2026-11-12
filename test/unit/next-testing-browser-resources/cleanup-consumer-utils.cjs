const assert = require('node:assert/strict')
const {
  createRuntimeFile,
  installClientRuntime,
  createRuntimeConfig,
  installRuntimeEnvironment,
} = require('./runtime-fixtures.cjs')

function createCleanupError(message, checkReceiver = true) {
  const reads = [],
    fields = { name: 'FixtureCleanupError', message, stack: '' },
    error = {}
  for (const key of ['name', 'message', 'stack'])
    Object.defineProperty(error, key, {
      get() {
        if (checkReceiver) assert.equal(this, error)
        reads.push(key)
        return fields[key]
      },
    })
  return { reads, fields, error }
}

function createCleanupFile({
  trace,
  shared,
  workerFails = true,
  fileFails = false,
  fileStage = 'file-start',
  onRun,
}) {
  let snapshots = false,
    workerJoined = false,
    workerTaken = false
  const file = createRuntimeFile({
    run: async (options) => {
      onRun?.(options)
      return {
        cases: [],
        errors: fileFails ? [{ phase: 'cleanup', error: shared }] : [],
        interrupted: false,
      }
    },
    async dispose(options) {
      trace.push(fileStage)
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
    takeSnapshotUpdates() {
      snapshots = true
      return []
    },
  })
  return {
    file,
    get snapshots() {
      return snapshots
    },
  }
}

function installCleanupRuntime({ trace, browserContext, ...options }) {
  return installClientRuntime({
    ...options,
    browserContext: {
      initializeBrowserContext: () => ({
        install() {},
        dispose: () => trace.push('context-dispose'),
      }),
      ...browserContext,
    },
  })
}

function startCleanupRuntime({
  runtimePath,
  config,
  messages,
  trace,
  originalConsole,
  onImports,
}) {
  installRuntimeEnvironment(config, messages, originalConsole)
  return require(runtimePath).startClientTest(
    () => trace.push('load'),
    {
      initialize: () => ({ dispose: () => trace.push('mocks') }),
      register() {},
    },
    () => ({
      waitForImports: async () => {},
      dispose: () => {
        trace.push('imports')
        onImports?.()
      },
    })
  )
}

function runKeyboardCleanupConsumer(publicCleanup) {
  const mode = process.argv[2]
  assert(
    [
      'normal',
      'keyboard',
      'keyboard-undefined',
      'keyboard-worker',
      'file-keyboard-worker-same',
      'legacy',
      'aggregate-same',
      'getter-values',
      'fulfilled-then-failure',
      ...(publicCleanup
        ? ['call-failure', 'joined-captured', 'late-owned']
        : []),
    ].includes(mode)
  )
  const trace = [],
    messages = [],
    shared = Object.assign(new Error('same actual keyboard failure'), {
      name: 'FixtureCleanupError',
      stack: '',
    }),
    {
      reads,
      fields,
      error: getterError,
    } = createCleanupError('original keyboard getter failure')
  const keyboard =
    mode === 'keyboard-undefined'
      ? undefined
      : ['getter-values', 'joined-captured'].includes(mode)
        ? getterError
        : shared
  const workerFails = ['keyboard-worker', 'file-keyboard-worker-same'].includes(
      mode
    ),
    fileFails = mode === 'file-keyboard-worker-same'
  let runtimeOptions
  const state = createCleanupFile({
    trace,
    shared,
    workerFails,
    fileFails,
    onRun: publicCleanup
      ? (options) => {
          runtimeOptions = options
        }
      : undefined,
  })
  const { file } = state
  const runtimePath = installCleanupRuntime({
    trace,
    file,
    initializeTestFile: publicCleanup
      ? (options) => {
          runtimeOptions = options
          return file
        }
      : undefined,
    browserContext: {
      async cleanupBrowserContext(observation) {
        trace.push('context')
        if (mode === 'legacy') throw shared
        trace.push('actual-keyboard')
        if (mode === 'late-owned')
          runtimeOptions.onLateFailure(
            new Error('actual independent late failure')
          )
        if (mode === 'joined-captured') {
          const captured = Object.freeze({
            value: observation.captureKeyboardError(keyboard),
          })
          fields.name = 'LaterName'
          fields.message = 'later keyboard mutation'
          fields.stack = 'later stack'
          observation.onKeyboardCleanup(
            Object.freeze({
              status: 'rejected',
              error: keyboard,
              ownership: 'cleanup',
              captured,
            })
          )
          throw keyboard
        }
        if (mode === 'call-failure') {
          observation.onKeyboardCleanup(
            Object.freeze({
              status: 'rejected',
              error: keyboard,
              ownership: 'call',
            })
          )
          throw keyboard
        }
        if (mode === 'normal' || mode === 'fulfilled-then-failure') {
          observation?.onKeyboardCleanup?.(
            Object.freeze({ status: 'fulfilled' })
          )
          if (mode !== 'normal') throw shared
          return
        }
        if (mode === 'aggregate-same')
          observation?.onComponentFailure?.(Object.freeze({ error: shared }))
        observation?.onKeyboardCleanup?.(
          Object.freeze({ status: 'rejected', error: keyboard })
        )
        if (['getter-values', 'joined-captured'].includes(mode)) {
          fields.name = 'LaterName'
          fields.message = 'later keyboard mutation'
          fields.stack = 'later stack'
        }
        if (mode === 'aggregate-same')
          throw new AggregateError([shared, shared], 'actual mixed cleanup')
        throw keyboard
      },
      async cleanupBrowserKeyboard() {
        trace.push('fallback-keyboard')
      },
    },
  })
  const config = createRuntimeConfig(
      'keyboard-occurrence',
      '/keyboard.test.mjs'
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
      'context',
      mode === 'legacy' ? 'fallback-keyboard' : 'actual-keyboard',
      'worker',
      'imports',
      'mocks',
      'context-dispose',
    ])
    const failures = messages.filter((message) => message.type === 'failure')
    const expectedOrigins =
      mode === 'normal'
        ? []
        : [
              'legacy',
              'aggregate-same',
              'fulfilled-then-failure',
              'call-failure',
            ].includes(mode)
          ? [undefined]
          : [
              ...(fileFails || mode === 'late-owned' ? [undefined] : []),
              'keyboard-cleanup',
              ...(workerFails ? ['worker-fixture-cleanup'] : []),
            ]
    assert.deepEqual(
      failures.map((value) => value.origin),
      expectedOrigins
    )
    if (['getter-values', 'joined-captured'].includes(mode)) {
      assert.deepEqual(reads, ['name', 'message', 'stack'])
      assert.deepEqual(failures[0].error, {
        name: 'FixtureCleanupError',
        message: 'original keyboard getter failure',
        stack: '',
      })
    }
    if (mode === 'keyboard-undefined') assert.deepEqual(failures[0].error, {})
    assert.equal(messages.at(-1).type, 'complete')
    assert.equal(
      messages.at(-1).status,
      mode === 'normal' ? 'passed' : 'failed'
    )
    assert.equal(state.snapshots, mode === 'normal')
    assert.deepEqual(messages.at(-1).updates, [])
    process.stdout.write(
      JSON.stringify({
        mode,
        onlyJoinedSoleKeyboardClassified: true,
        noDuplicateAfterActualOutcome: true,
        oldDoubleFallbackHeld: true,
        undefinedRejectionDistinct: true,
        mixedAndIndependentFailureVetoHeld: true,
        originalFieldReadsAndSnapshotsHeld: true,
      }) + '\n'
    )
  }
  main().catch((error) => {
    globalThis.console = originalConsole
    process.stderr.write(String(error?.stack ?? error) + '\n')
    process.exitCode = 1
  })
}

module.exports = {
  createCleanupError,
  createCleanupFile,
  installCleanupRuntime,
  startCleanupRuntime,
  runKeyboardCleanupConsumer,
}
