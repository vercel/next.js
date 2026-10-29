const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { EventEmitter } = require('node:events')
const [mode, executePath] = process.argv.slice(2),
  req = createRequire(executePath)
assert(
  ['success', 'native-error', 'invalid-target', 'legacy', 'cancel'].includes(
    mode
  )
)
const invalid = mode === 'invalid-target',
  legacy = mode === 'legacy'
const controller = new AbortController(),
  cancel = new Error('cancel owned native selection'),
  original = Object.assign(new Error('actual native selection rejection'), {
    name: 'TimeoutError',
  }),
  trace = [],
  selectors = [],
  selections = [],
  failures = []
let dispatch,
  operation,
  complete,
  admissions = 0,
  rejectNative,
  nativeJoined = false
const completion = new Promise((resolve) => {
    complete = resolve
  }),
  page = new EventEmitter()
page.mainFrame = () => page
page.dragAndDrop = async (source, target, options) => {
  selections.push({ source, target, options })
  if (mode === 'native-error') throw original
  if (mode === 'cancel')
    return new Promise((resolve, reject) => {
      rejectNative = reject
    }).finally(() => {
      nativeJoined = true
    })
}
page.locator = (selector) => {
  selectors.push(selector)
  return {
    click: async () => {
      trace.push('following-native-click')
    },
  }
}
page.goto = async () => {
  operation = dispatch(
    {
      method: 'dragAndDrop',
      ...(legacy
        ? { element: 'next-test-element-7' }
        : { locator: { selector: '#drag-source' } }),
      args: [
        legacy
          ? 'next-test-element-8'
          : { selector: invalid ? 1 : '#drag-target' },
        { timeout: 50 },
      ],
    },
    () => {
      admissions++
    }
  )
  if (invalid) {
    await assert.rejects(operation, /Invalid Browser Mode element command/)
    assert.equal(admissions, 0)
    assert.equal(selections.length, 0)
  } else if (mode === 'native-error') {
    await assert.rejects(operation, (error) => {
      assert.equal(error.cause, original)
      assert.equal(error.actionError.name, 'TimeoutError')
      return true
    })
    await dispatch(
      { method: 'click', element: 'next-test-element-0', args: [] },
      () => {
        admissions++
      }
    )
  } else if (mode === 'cancel') {
    operation.catch(() => {})
    await new Promise(setImmediate)
    assert.equal(admissions, 1)
    assert.equal(selections.length, 1)
    controller.abort(cancel)
    return
  } else assert.equal(await operation, null)
  complete({})
}
const context = {
  newPage: async () => page,
  close: async () => {
    trace.push('context-close')
    page.emit('close')
    if (mode === 'cancel') rejectNative(cancel)
  },
}
const browser = {
  newContext: async () => {
    trace.push('new-context')
    return context
  },
  close: async () => {
    trace.push('browser-close')
  },
}
const host = {
  wsEndpoint: 'ws://unit',
  dispose: async () => {
    trace.push('host-close')
  },
}
const server = {
  url: 'http://unit/',
  completion,
  verify: async () => {},
  assertClean() {},
  mapStack: () => [],
  fail() {},
  dispose: async () => {
    trace.push('server-close')
    await operation?.catch(() => {})
  },
}
const collector = {
  events: [],
  accept() {},
  fail(error) {
    failures.push(error)
  },
  hasFailure: () => failures.length > 0,
  result: () => ({
    status: failures.length ? 'failed' : 'passed',
    updates: [],
  }),
}
function replace(name, exports) {
  const filename = req.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
replace('../browser/host', {
  createBrowserHost: async () => host,
  connectBrowserHost: async (options) => {
    await options.beforeConnect({
      selectors: {
        register: async () => {
          trace.push('register')
        },
      },
    })
    trace.push('connect')
    return browser
  },
})
replace('./server', {
  createClientServer: async (options) => {
    dispatch = options.onBrowserCommand
    return server
  },
})
replace('./results', { createClientResultCollector: () => collector })
replace('./engine-brand', {
  createClientEngineBrand: () => ({
    start: async () => {},
    fact: () => ({}),
    close() {},
    afterOwnersClosed: async () => {},
  }),
})
const profile = {
    id: 'unit-selection',
    environment: 'browser',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
    browserClient: true,
  },
  entry = { id: 'entry', file: '/project/select.test.mjs', profile },
  artifact = {
    version: 2,
    kind: 'browser',
    entryId: entry.id,
    revision: 'revision',
    profile,
    client: {
      sourceFile: entry.file,
      asyncScope: 'promise-continuations-v1',
      creatorScope: 'synchronous-source-v1',
      creatorPromiseRoute: 'native-engine-v1',
    },
  }
;(async () => {
  const result = await require(executePath).executeClient(artifact, {
    entry,
    runId: 'run',
    projectDir: '/project',
    setupFiles: [],
    signal: controller.signal,
    updateSnapshots: false,
    testTimeout: 1000,
    hookTimeout: 1000,
    fileTimeout: 5000,
    onEvent() {},
  })
  assert.equal(result.status, mode === 'cancel' ? 'cancelled' : 'passed')
  assert.equal(page.listenerCount('console'), 0)
  assert.equal(admissions, invalid ? 0 : mode === 'native-error' ? 2 : 1)
  assert.deepEqual(
    selectors,
    legacy
      ? ['[data-next-test-element="next-test-element-7"]']
      : mode === 'native-error'
        ? ['[data-next-test-element="next-test-element-0"]']
        : []
  )
  assert.equal(selections.length, invalid ? 0 : 1)
  if (!invalid)
    assert.deepEqual(selections[0], {
      source: legacy
        ? '[data-next-test-element="next-test-element-7"]'
        : '#drag-source',
      target: legacy
        ? '[data-next-test-element="next-test-element-8"]'
        : '#drag-target',
      options: { timeout: 50 },
    })
  if (mode === 'native-error') assert(trace.includes('following-native-click'))
  if (mode === 'cancel') {
    assert(nativeJoined)
    await assert.rejects(operation, (error) => {
      assert.equal(error.cause, cancel)
      return true
    })
  }
  assert.deepEqual(
    trace.filter((value) => value.endsWith('-close')),
    ['context-close', 'browser-close', 'host-close', 'server-close']
  )
  assert.deepEqual(failures, [])
  console.log(
    JSON.stringify({
      mode,
      admissions,
      nativeDrags: selections.length,
      actualNativeOptionsPreserved: true,
      legacyAndNoUnusedLocatorDescription: true,
      originalErrorIdentityRetained: true,
      cleanupJoined: true,
    })
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
