'use strict'
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { EventEmitter } = require('node:events')
const {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
} = require('node:fs')
const { join, dirname } = require('node:path')
const { tmpdir } = require('node:os')
const [mode, executePath] = process.argv.slice(2),
  req = createRequire(executePath)
assert(
  [
    'path',
    'base64',
    'unsaved',
    'default',
    'backslash',
    'mask',
    'native-error',
    'path-number',
    'invalid-options',
    'legacy',
    'cancel',
  ].includes(mode)
)
const root = mkdtempSync(join(tmpdir(), 'next-screenshot-consumer-')),
  sourceDir = join(root, 'tests', 'nested'),
  controller = new AbortController(),
  trace = [],
  selectors = [],
  native = [],
  failures = [],
  buffer = Buffer.from([0, 255, 17, 66]),
  original = Object.assign(new Error('actual screenshot failure'), {
    name: 'TimeoutError',
  }),
  cancel = new Error('cancel screenshot')
let dispatch,
  complete,
  operation,
  admissions = 0,
  rejectNative,
  nativeJoined = false,
  startNative
const started = new Promise((resolve) => {
    startNative = resolve
  }),
  completion = new Promise((resolve) => {
    complete = resolve
  }),
  page = new EventEmitter()
page.locator = (selector) => {
  selectors.push(selector)
  const value = {
    selector,
    describe(description) {
      trace.push(['describe', selector, description])
      return value
    },
    async screenshot(options) {
      native.push({ selector, options })
      startNative()
      if (mode === 'native-error' && native.length === 1) throw original
      if (mode === 'cancel')
        return new Promise((_, reject) => {
          rejectNative = reject
        }).finally(() => {
          nativeJoined = true
        })
      return buffer
    },
  }
  return value
}
const options =
  mode === 'invalid-options'
    ? []
    : {
        ...(mode === 'default'
          ? {}
          : {
              path:
                mode === 'path-number'
                  ? 17
                  : mode === 'backslash'
                    ? 'shots\\nested\\picture.png'
                    : 'shots/picture.png',
            }),
        ...(mode === 'base64' || mode === 'mask' ? { base64: true } : {}),
        ...(mode === 'unsaved' ? { save: false, base64: false } : {}),
        ...(mode === 'mask'
          ? {
              mask: [{ selector: '#mask', locator: 'mask description' }],
              style: 'div { outline: none }',
              omitBackground: true,
            }
          : {}),
      }
const command = {
  method: 'screenshot',
  ...(mode === 'legacy'
    ? { element: 'next-test-element-0' }
    : { locator: { selector: '#shot', locator: 'screenshot description' } }),
  args: ['provided-name.png', options],
}
const recovery = {
  method: 'screenshot',
  locator: { selector: '#recovery', locator: 'recovery description' },
  args: ['recovered.png', { path: 'shots/recovered.png', base64: true }],
}
page.goto = async () => {
  operation = dispatch(command, () => {
    admissions++
  })
  if (mode === 'legacy' || mode === 'invalid-options')
    await assert.rejects(
      operation,
      /Invalid Browser Mode (element|screenshot) command/
    )
  else if (mode === 'native-error' || mode === 'path-number') {
    await assert.rejects(operation, (error) => {
      assert.equal(
        error.actionError.name,
        mode === 'native-error' ? 'TimeoutError' : 'TypeError'
      )
      if (mode === 'native-error') assert.equal(error.cause, original)
      else {
        assert(error.cause instanceof TypeError)
        assert.match(
          error.actionError.message,
          /input\.replace is not a function/
        )
      }
      return true
    })
    const result = await dispatch(recovery, () => {
      admissions++
    })
    assert.deepEqual(result, {
      path: join(sourceDir, 'shots/recovered.png'),
      base64: buffer.toString('base64'),
    })
  } else if (mode === 'cancel') {
    operation.catch(() => {})
    await started
    assert.equal(admissions, 1)
    controller.abort(cancel)
    return
  } else {
    const result = await operation,
      path =
        mode === 'default'
          ? join(
              sourceDir,
              '__screenshots__',
              'component.test.mjs',
              'provided-name.png'
            )
          : mode === 'backslash'
            ? join(sourceDir, 'shots/nested/picture.png')
            : join(sourceDir, 'shots/picture.png')
    if (mode === 'unsaved') assert.equal(result, buffer.toString('base64'))
    else if (mode === 'base64' || mode === 'mask')
      assert.deepEqual(result, { path, base64: buffer.toString('base64') })
    else assert.equal(result, path)
  }
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
  newContext: async () => context,
  close: async () => trace.push('browser-close'),
}
const host = {
  wsEndpoint: 'ws://unit',
  dispose: async () => trace.push('host-close'),
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
  connectBrowserHost: async (opts) => {
    await opts.beforeConnect({ selectors: { register: async () => {} } })
    return browser
  },
})
replace('./server', {
  createClientServer: async (opts) => {
    dispatch = opts.onBrowserCommand
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
    id: 'screenshot',
    environment: 'browser',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
    browserClient: true,
  },
  entry = { id: 'entry', file: join(sourceDir, 'component.test.mjs'), profile },
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
mkdirSync(sourceDir, { recursive: true })
writeFileSync(
  entry.file,
  '// retained actual source directory for native screenshot paths\n'
)
;(async () => {
  try {
    const result = await require(executePath).executeClient(artifact, {
      entry,
      runId: 'run',
      projectDir: root,
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
    const invalid = mode === 'legacy' || mode === 'invalid-options'
    assert.equal(
      admissions,
      invalid ? 0 : mode === 'native-error' || mode === 'path-number' ? 2 : 1
    )
    assert.equal(native.length, invalid ? 0 : mode === 'native-error' ? 2 : 1)
    if (!invalid) {
      const first = native[0],
        path =
          mode === 'path-number'
            ? join(sourceDir, 'shots/recovered.png')
            : mode === 'default'
              ? join(
                  sourceDir,
                  '__screenshots__/component.test.mjs/provided-name.png'
                )
              : mode === 'backslash'
                ? join(sourceDir, 'shots/nested/picture.png')
                : join(sourceDir, 'shots/picture.png')
      assert.equal(
        first.selector,
        mode === 'path-number' ? '#recovery' : '#shot'
      )
      assert.equal(first.options.path, mode === 'unsaved' ? undefined : path)
      assert.equal(first.options.save, mode !== 'unsaved')
      assert.equal(existsSync(dirname(path)), mode !== 'unsaved')
      if (mode === 'unsaved') assert.equal(first.options.base64, true)
      if (mode === 'mask') {
        assert.equal(first.options.mask[0].selector, '#mask')
        assert.equal(first.options.style, 'div { outline: none }')
        assert.equal(first.options.omitBackground, true)
      }
    }
    if (mode === 'cancel') {
      assert(nativeJoined)
      await assert.rejects(operation, (error) => error.cause === cancel)
    }
    assert.deepEqual(
      trace.filter((x) => typeof x === 'string' && x.endsWith('-close')),
      ['context-close', 'browser-close', 'host-close', 'server-close']
    )
    assert.deepEqual(failures, [])
    console.log(
      JSON.stringify({
        mode,
        actualNativeScreenshotBufferAndOptions: true,
        sourceBasedPathAndSaveSemantics: true,
        naturalErrorsAndAdmissionPreserved: true,
        allOwnedCleanupJoined: true,
        componentOnlyNoRealBrowserClaim: true,
      })
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
