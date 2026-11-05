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
    'normal',
    'file-error',
    'browser-error',
    'keyboard-error',
    'all-errors',
    'cancelled',
  ].includes(mode)
)
const trace = [],
  messages = []
let fileSettled = false,
  snapshotsTaken = false,
  started,
  release
const fileStarted = new Promise((resolve) => {
  started = resolve
})
const fileGate = new Promise((resolve) => {
  release = resolve
})
const throws = (stage) => mode === stage + '-error' || mode === 'all-errors'
const file = createRuntimeFile({
  run: async () => ({
    cases: [],
    errors: [],
    interrupted: mode === 'cancelled',
  }),
  async dispose() {
    trace.push('file-start')
    started()
    await fileGate
    fileSettled = true
    trace.push('file-end')
    if (throws('file')) throw new Error('actual file disposal failed')
  },
  takeSnapshotUpdates() {
    snapshotsTaken = true
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
    async cleanupBrowserContext() {
      assert(fileSettled)
      trace.push('browser')
      if (throws('browser')) throw new Error('actual browser cleanup failed')
    },
    async cleanupBrowserKeyboard() {
      assert(fileSettled)
      trace.push('keyboard')
      if (throws('keyboard')) throw new Error('actual keyboard cleanup failed')
    },
  },
})
const config = createRuntimeConfig('fixture-order', '/fixture-order.test.mjs')
const originalConsole = console
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
    await fileStarted
    assert.deepEqual(trace, ['load', 'file-start'])
    release()
    await running
  } finally {
    release()
    globalThis.console = originalConsole
  }
  assert.deepEqual(trace, [
    'load',
    'file-start',
    'file-end',
    'browser',
    'keyboard',
    'imports',
    'mocks',
    'context-dispose',
  ])
  const errors = messages
    .filter((message) => message.type === 'failure')
    .map((message) => message.error.message)
  assert.deepEqual(
    errors,
    ['file', 'browser', 'keyboard']
      .filter(throws)
      .map(
        (stage) =>
          'actual ' +
          (stage === 'file' ? 'file disposal' : stage + ' cleanup') +
          ' failed'
      )
  )
  const terminal = messages.at(-1)
  assert.equal(terminal.type, 'complete')
  assert.equal(terminal.status, mode === 'normal' ? 'passed' : 'failed')
  assert.equal(terminal.interrupted, mode === 'cancelled')
  assert.equal(snapshotsTaken, mode === 'normal')
  process.stdout.write(
    JSON.stringify({
      mode,
      fileDisposalAwaitedBeforeBrowserCleanup: true,
      allRemainingDisposalsAttempted: true,
      originalFailureOrderHeld: true,
      cancellationAndPublicationVetoHeld: true,
    }) + '\n'
  )
}
main().catch((error) => {
  globalThis.console = originalConsole
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
