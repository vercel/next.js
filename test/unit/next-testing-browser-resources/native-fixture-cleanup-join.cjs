const assert = require('node:assert/strict')
const {
  createRuntimeFile,
  installClientRuntime,
  createRuntimeConfig,
  installRuntimeEnvironment,
} = require('./runtime-fixtures.cjs')
const mode = process.argv[2]
assert(['awaited', 'unawaited', 'missing-file'].includes(mode))
const trace = [],
  messages = [],
  originalConsole = console
const initializationError = new Error('actual initialization failed')
let release,
  entered,
  componentCalls = 0,
  keyboardCalls = 0,
  callbackCalls = 0
const gate = new Promise((resolve) => {
  release = resolve
})
const started = new Promise((resolve) => {
  entered = resolve
})
const file = createRuntimeFile({
  run: async () => ({ cases: [], errors: [], interrupted: false }),
  async dispose(options) {
    trace.push('file-start')
    const first = options.beforeOwnedWorkerDispose(),
      second = options.beforeOwnedWorkerDispose()
    callbackCalls += 2
    assert.equal(first, second)
    if (mode === 'awaited') await first
    trace.push('file-end')
  },
  takeSnapshotUpdates() {
    assert.equal(componentCalls, 1)
    assert.equal(keyboardCalls, 1)
    trace.push('snapshot-read')
    return []
  },
})
const runtimePath = installClientRuntime({
  file,
  initializeTestFile() {
    if (mode === 'missing-file') throw initializationError
    return file
  },
  browserContext: {
    initializeBrowserContext: () => ({
      install() {},
      dispose: () => trace.push('context-dispose'),
    }),
    async cleanupBrowserContext() {
      componentCalls++
      trace.push('component-start')
      entered()
      await gate
      trace.push('component-end')
    },
    cleanupBrowserKeyboard() {
      keyboardCalls++
      trace.push('keyboard')
    },
  },
})
const config = createRuntimeConfig('joined-cleanup', '/joined-cleanup.test.mjs')
async function main() {
  installRuntimeEnvironment(config, messages, originalConsole)
  const running = require(runtimePath).startClientTest(
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
  try {
    await started
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(trace.includes('imports'), false)
    assert.equal(trace.includes('mocks'), false)
    assert.equal(trace.includes('context-dispose'), false)
    assert.equal(
      messages.some((message) => message.type === 'complete'),
      false
    )
    release()
    await running
  } finally {
    release()
    globalThis.console = originalConsole
  }
  assert.equal(componentCalls, 1)
  assert.equal(keyboardCalls, 1)
  assert.equal(callbackCalls, mode === 'missing-file' ? 0 : 2)
  assert(trace.indexOf('component-end') < trace.indexOf('keyboard'))
  assert(trace.indexOf('keyboard') < trace.indexOf('imports'))
  if (mode === 'missing-file') assert.equal(trace.includes('mocks'), false)
  else assert(trace.indexOf('imports') < trace.indexOf('mocks'))
  assert.equal(
    trace.at(-1),
    mode === 'missing-file' ? 'context-dispose' : 'snapshot-read'
  )
  const terminal = messages.at(-1)
  assert.equal(terminal.type, 'complete')
  assert.equal(terminal.status, mode === 'missing-file' ? 'failed' : 'passed')
  assert.deepEqual(
    messages
      .filter((message) => message.type === 'failure')
      .map((message) => message.error.message),
    mode === 'missing-file' ? [initializationError.message] : []
  )
  process.stdout.write(
    JSON.stringify({
      mode,
      callbackPromiseShared: true,
      fallbackJoinedBeforeRemainingDisposals: true,
      cleanupExactlyOnce: true,
      originalInitializationFailureRetained: true,
    }) + '\n'
  )
}
main().catch((error) => {
  globalThis.console = originalConsole
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
