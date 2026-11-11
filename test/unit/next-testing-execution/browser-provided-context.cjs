const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInThisContext } = require('node:vm')
const [executePath, runtimePath, commonPath, browserPath] =
  process.argv.slice(2)
const localRequire = createRequire(executePath)
const replace = (name, exports) => {
  const filename = localRequire.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
const profile = {
  id: 'provided-profile',
  environment: 'browser',
  mode: 'development',
  runtime: 'nodejs',
  bundler: 'turbopack',
  browserClient: true,
}
const entry = { id: 'provided-entry', file: '/provided.test.mjs', profile }
const artifact = {
  version: 2,
  kind: 'browser',
  entryId: entry.id,
  revision: 'provided-revision',
  profile,
  client: {
    sourceFile: entry.file,
    asyncScope: 'promise-continuations-v1',
    creatorScope: 'synchronous-source-v1',
    creatorPromiseRoute: 'native-engine-v1',
  },
}
const configurations = []
const failures = []
const events = []
const stop = new Error('controlled stop after configuration capture')
replace('./server', {
  createClientServer: async ({ configuration }) => {
    configurations.push(configuration)
    throw stop
  },
})
replace('./results', {
  createClientResultCollector: () => ({
    events: [],
    fail: (error) => failures.push(error),
    hasFailure: () => failures.length > 0,
  }),
})
const options = (provide) => ({
  entry,
  runId: 'provided-run',
  projectDir: '/',
  setupFiles: [],
  provide,
  signal: new AbortController().signal,
  testTimeout: 1000,
  hookTimeout: 1000,
  fileTimeout: 5000,
  onEvent: (event) => events.push(event),
})
const nativeConsole = console
const messages = []
const config = {
  version: 1,
  ownerToken: 'provided-owner',
  authorization: 'provided-auth',
  sourceHash: 'a'.repeat(64),
  rpcURL: 'http://unit/rpc',
  runId: 'provided-run',
  entryId: entry.id,
  revision: artifact.revision,
  filePath: entry.file,
  sourceMaps: [],
  provide: {
    answer: 42,
    label: 'browser-data',
    enabled: false,
    empty: null,
    data: { count: 1, list: ['a', 'b'] },
  },
}
async function main() {
  const { executeClient } = require(executePath)
  const shared = { value: 7 }
  const projected = await executeClient(
    artifact,
    options({
      date: new Date('2026-01-02T03:04:05.000Z'),
      map: new Map([['key', 42]]),
      set: new Set(['one', 'two']),
      regex: /hello/gi,
      missingValue: undefined,
      first: shared,
      second: shared,
    })
  )
  assert.equal(projected.status, 'failed')
  assert.deepEqual(failures, [stop])
  const projectedProvide = configurations[0].provide
  assert.deepEqual(projectedProvide, {
    date: '2026-01-02T03:04:05.000Z',
    map: {},
    set: {},
    regex: {},
    first: { value: 7 },
    second: { value: 7 },
  })
  assert.notEqual(projectedProvide.first, projectedProvide.second)
  assert.deepEqual(shared, { value: 7 })
  const cycle = {}
  cycle.self = cycle
  for (const [provide, heading] of [
    [{ big: 42n }, 'Do not know how to serialize a BigInt'],
    [cycle, 'Converting circular structure to JSON'],
  ]) {
    const resourceCount = configurations.length
    const eventCount = events.length
    await assert.rejects(executeClient(artifact, options(provide)), (error) => {
      assert.equal(error.constructor, TypeError)
      assert.ok(error.message.startsWith(heading))
      assert.equal(error.cause, undefined)
      return true
    })
    assert.equal(configurations.length, resourceCount)
    assert.equal(events.length, eventCount)
  }
  // The real runner and named Browser export are used; only page transport,
  // snapshots and browser context resources are supplied by this Node component.
  replace('./snapshot-environment', { installBrowserSnapshotBridge() {} })
  replace('./source-maps', {
    createClientSourceMapResolver: () => ({ mapLocation: (value) => value }),
  })
  replace('./browser-context', {
    cleanupBrowserKeyboard() {},
    initializeBrowserContext: () => ({ install() {}, dispose() {} }),
    cleanupBrowserContext() {},
  })
  globalThis.location = { href: 'http://unit/' }
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  globalThis.fetch = async (_url, request) => {
    if (!request?.method) return { ok: true, json: async () => config }
    messages.push(JSON.parse(request.body))
    return { ok: true, json: async () => ({ value: null }) }
  }
  const common = require(commonPath)
  const browser = require(browserPath)
  assert.equal(browser.inject, common.inject)
  const source = readFileSync(
    join(__dirname, 'browser-provided-context-contract.mjs.txt'),
    'utf8'
  )
  const [imports, ...body] = source.split('\n')
  assert.equal(
    imports,
    "import { afterAll, beforeAll, expect, inject, test } from 'vitest'"
  )
  try {
    await require(runtimePath).startClientTest(() => {
      runInThisContext(
        `(function(afterAll,beforeAll,expect,inject,test){\n${body.join('\n')}\n})`,
        {
          filename: 'browser-provided-context-contract.mjs.txt',
        }
      )(
        common.afterAll,
        common.beforeAll,
        common.expect,
        browser.inject,
        common.test
      )
    })
  } finally {
    globalThis.console = nativeConsole
  }
  const rows = messages
    .filter((message) => message.type === 'output')
    .flatMap((message) =>
      message.text
        .split('\n')
        .filter((line) => line.startsWith('BROWSER_PROVIDED_RAW '))
        .map((line) => JSON.parse(line.slice('BROWSER_PROVIDED_RAW '.length)))
    )
  const expected = JSON.parse(
    readFileSync(
      join(__dirname, 'browser-provided-context-pristine.json'),
      'utf8'
    )
  )
  process.stdout.write(
    JSON.stringify({ projectedProvide, rows, messages }) + '\n'
  )
  assert.deepEqual(rows, expected.rows)
  const cases = messages.filter((message) => message.type === 'case-end')
  assert.deepEqual(
    cases
      .map(({ result }) => ({ name: result.name, status: result.status }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    expected.cases.map((entry) => ({ name: entry.name, status: entry.status }))
  )
  assert.equal(messages.at(-1).type, 'complete')
  assert.equal(messages.at(-1).status, 'passed')
  assert.equal(messages.at(-1).caseCount, 3)
  assert.throws(() => browser.inject('data'), /explicit Next test mode/)
}
main().catch((error) => {
  globalThis.console = nativeConsole
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
