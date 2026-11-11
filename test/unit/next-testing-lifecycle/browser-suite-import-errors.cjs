const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const path = require('node:path')
const [consumer, group] = process.argv.slice(2)
const load = createRequire(path.join(path.resolve(consumer), 'package.json'))
const runtimePath = load.resolve(
  'next/dist/experimental/testing/client/runtime'
)
const local = createRequire(runtimePath)
const failure =
  group === 'load-undefined'
    ? undefined
    : group === 'load-false'
      ? false
      : new Error('actual ' + group + ' failure')
const before =
  failure instanceof Error
    ? Object.getOwnPropertyDescriptors(failure)
    : undefined
const messages = []
const cleanup = []
const processed = []
const globals = new Map()
const hostConsole = console
let caught
let caughtCause
let calls = 0
const config = {
  version: 1,
  ownerToken: 'unit',
  authorization: 'unit',
  sourceHash: 'a'.repeat(64),
  rpcURL: 'http://unit/rpc',
  runId: 'run',
  entryId: 'entry',
  revision: 'revision',
  filePath: '/actual-authored.test.mjs',
  sourceMaps: [],
  snapshotUpdateMode: 'none',
}
const file = {
  enableBrowserPublicTaskQueues() {},
  async collect(loader) {
    try {
      await loader()
      if (group === 'declaration-error') throw failure
    } catch (error) {
      caught = error
      caughtCause = Object.getOwnPropertyDescriptor(Object(error), 'cause')
      throw error
    }
  },
  validateBrowserClient() {
    assert.fail('failed collection must not validate declarations')
  },
  run() {
    assert.fail('failed collection must not run cases')
  },
  dispose() {
    cleanup.push('file')
  },
  getSnapshotSummary() {
    return {}
  },
  takeSnapshotUpdates() {
    return []
  },
}
function replace(name, exports) {
  const filename = local.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
replace('../runner', {
  getConsoleTask: () => undefined,
  initializeTestFile: () => file,
})
replace('./snapshot-environment', { installBrowserSnapshotBridge() {} })
replace('./source-maps', {
  createClientSourceMapResolver: () => ({ mapLocation: (value) => value }),
})
replace('./browser-context', {
  cleanupBrowserKeyboard() {},
  initializeBrowserContext: () => ({
    install() {},
    dispose() {
      cleanup.push('context')
    },
  }),
  cleanupBrowserContext() {
    cleanup.push('browser')
  },
})
const errorPath = local.resolve('../../../compiled/next-test-primitives/error')
const primitive = require(errorPath)
require.cache[errorPath].exports = {
  ...primitive,
  processError(error, ...args) {
    processed.push(error)
    return primitive.processError(error, ...args)
  },
}
function setGlobal(name, value) {
  globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  })
}
setGlobal('console', { log() {}, info() {}, debug() {}, warn() {}, error() {} })
setGlobal('location', { href: 'http://unit/' })
setGlobal('addEventListener', () => {})
setGlobal('fetch', async (_url, options) => {
  if (!options?.method) return { ok: true, json: async () => config }
  messages.push(JSON.parse(options.body))
  return { ok: true, json: async () => ({ value: null }) }
})
async function main() {
  try {
    await require(runtimePath).startClientTest(
      () => {
        calls++
        if (group === 'load-async') return Promise.reject(failure)
        if (group.startsWith('load-')) throw failure
      },
      {
        initialize: () => ({
          dispose() {
            cleanup.push('mocks')
          },
        }),
        register() {
          if (group === 'mock-error') throw failure
        },
      },
      undefined,
      undefined,
      async () => {
        if (group === 'setup-error') throw failure
      }
    )
  } finally {
    for (const [name, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  }
  const imported = group.startsWith('load-')
  assert.equal(calls, ['setup-error', 'mock-error'].includes(group) ? 0 : 1)
  if (imported) {
    assert(caught instanceof Error)
    assert.equal(
      caught.message,
      'Failed to import test file /actual-authored.test.mjs'
    )
    assert(Object.hasOwn(caught, 'cause'))
    assert(caughtCause && 'value' in caughtCause)
    assert.equal(caughtCause.value, failure)
  } else assert.equal(caught, failure)
  assert.deepEqual(processed, [caught])
  const failures = messages.filter((row) => row.type === 'failure')
  assert.equal(failures.length, 1)
  assert.equal(
    failures[0].error.message,
    imported
      ? 'Failed to import test file /actual-authored.test.mjs'
      : failure.message
  )
  assert.equal(messages.find((row) => row.type === 'complete').status, 'failed')
  assert.deepEqual(cleanup, ['file', 'browser', 'mocks', 'context'])
  if (before)
    assert.deepEqual(Object.getOwnPropertyDescriptors(failure), before)
  hostConsole.log(
    JSON.stringify({
      group,
      exactLoadWrapperAndCause: true,
      otherCollectionPhasesUnwrapped: true,
      actualErrorFieldsHeld: true,
      originalCleanupJoined: true,
    })
  )
}
main().catch((error) => {
  hostConsole.error(error)
  process.exitCode = 1
})
