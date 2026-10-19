const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInThisContext } = require('node:vm')
const [mode, runtimePath, serverPath, resultsPath, commonPath, browserPath] =
  process.argv.slice(2)
assert.ok(
  ['contract', 'mutation', 'error-shape', 'transport-error'].includes(mode)
)
const subject = mode === 'transport-error' ? 'contract' : mode
const source = readFileSync(
  join(__dirname, `browser-artifacts-${subject}.mjs.txt`),
  'utf8'
)
const local = createRequire(runtimePath)
function replace(from, name, exports) {
  const filename = createRequire(from).resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
const nativeFetch = fetch
const nativeConsole = console
const originalLog = nativeConsole.log
const originalDebug = nativeConsole.debug
const nativeAfterStop = []
let consoleStopped = false
if (mode === 'mutation') {
  const { clientConsoleBoundary } = local('./protocol')
  nativeConsole.debug = function (...args) {
    if (args[0] === clientConsoleBoundary.stop) consoleStopped = true
    return Reflect.apply(originalDebug, this, args)
  }
  nativeConsole.log = function (...args) {
    if (consoleStopped && typeof args[0] === 'string')
      nativeAfterStop.push(args[0])
    return Reflect.apply(originalLog, this, args)
  }
}
const filePath = '/project/artifacts.test.mjs'
const sourceName = 'artifacts.test.mjs'
const { SourceMapGenerator } = local('next/dist/compiled/source-map')
const map = new SourceMapGenerator({ file: 'subject.js' })
for (const [index, line] of source.split('\n').entries())
  for (let column = 0; column <= line.length; column++)
    map.addMapping({
      generated: { line: index + 1, column },
      original: { line: index + 1, column },
      source: sourceName,
    })
map.setSourceContent(sourceName, source)
replace(serverPath, './assets', {
  createClientAssetReader: async () => ({
    sourceMaps: async (origin) => [
      {
        url: origin + '/subject.js',
        map: map.toJSON(),
        originalSources: [sourceName],
      },
    ],
    verify: async () => {},
  }),
})
replace(serverPath, './snapshot-access', {
  createClientSnapshotAccess: async () => ({
    verifySource: async () => {},
    verify: async () => {},
  }),
})
replace(runtimePath, './snapshot-environment', {
  installBrowserSnapshotBridge() {},
})
replace(runtimePath, './browser-context', {
  initializeBrowserContext: () => ({ install() {}, dispose() {} }),
  cleanupBrowserContext() {},
})
const profile = {
  id: 'artifact-browser',
  environment: 'browser',
  mode: 'development',
  runtime: 'nodejs',
  bundler: 'turbopack',
  browserClient: true,
}
const artifact = {
  version: 2,
  kind: 'browser',
  entryId: 'entry',
  revision: 'revision',
  sourceHash: 'a'.repeat(64),
  profile,
  client: { sourceFile: filePath, scripts: [], styles: [] },
  files: [],
}
const configuration = {
  version: 1,
  runId: 'run',
  entryId: artifact.entryId,
  revision: artifact.revision,
  sourceHash: artifact.sourceHash,
  ownerToken: 'artifact-component',
  filePath,
  projectDir: '/project',
  testTimeout: 1000,
  hookTimeout: 1000,
  snapshotUpdateMode: 'none',
}
const messages = [],
  failures = [],
  trace = []
const collector = require(resultsPath).createClientResultCollector(artifact, {
  runId: 'run',
})
let releaseArtifact
const artifactGate = new Promise((resolve) => {
  releaseArtifact = resolve
})
const commonRunner = local('../runner')
const initializeTestFile = commonRunner.initializeTestFile
replace(runtimePath, '../runner', {
  ...commonRunner,
  initializeTestFile(options) {
    const file = initializeTestFile(options)
    const dispose = file.dispose
    file.dispose = async () => {
      try {
        await dispose()
      } finally {
        trace.push('file-disposed')
        releaseArtifact()
      }
    }
    return file
  },
})
const transportError = new Error('controlled artifact fetch failure')
let server,
  cookie,
  origin,
  running,
  failure,
  cleaned = false
async function main() {
  try {
    server = await require(serverPath).createClientServer({
      artifact,
      configuration,
      onMessage(message) {
        messages.push(message)
        if (message.type !== 'output') return collector.accept(message)
      },
      onFailure(error) {
        failures.push(error)
      },
    })
    const document = await nativeFetch(server.url)
    cookie = document.headers.get('set-cookie').split(';')[0]
    await document.text()
    origin = new URL(server.url).origin
    globalThis.location = { href: server.url }
    globalThis.addEventListener = () => {}
    globalThis.fetch = async (url, options = {}) => {
      const message = options.body && JSON.parse(options.body)
      if (message?.type === 'artifact') {
        if (mode === 'transport-error') throw transportError
        if (message.artifact.type === 'probe:unawaited') {
          await artifactGate
          trace.push('artifact-after-file-disposed')
        }
      }
      return nativeFetch(url, {
        ...options,
        headers: { ...options.headers, Cookie: cookie, Origin: origin },
      })
    }
    const common = require(commonPath),
      browser = require(browserPath)
    assert.equal(browser.recordArtifact, common.recordArtifact)
    const [imports, ...body] = source.split('\n')
    assert.ok(imports.startsWith('import { '))
    const names = imports
      .slice('import { '.length, imports.indexOf(' }'))
      .split(', ')
    const values = names.map((name) =>
      name === 'recordArtifact'
        ? browser.recordArtifact
        : name === 'vi'
          ? browser.vi
          : common[name]
    )
    running = require(runtimePath).startClientTest(() => {
      runInThisContext(
        `(function(${names.join(',')}){\n${body.join('\n')}\n})`,
        { filename: origin + '/subject.js' }
      )(...values)
    })
    try {
      await running
    } catch (error) {
      failure = error
    }
    if (mode !== 'transport-error') {
      await server.completion
      server.assertClean()
      assert.deepEqual(failures, [])
    }
  } finally {
    releaseArtifact()
    globalThis.fetch = nativeFetch
    globalThis.console = nativeConsole
    nativeConsole.log = originalLog
    nativeConsole.debug = originalDebug
    await server?.dispose()
    cleaned = true
  }
  const rows = messages
    .filter((message) => message.type === 'output')
    .flatMap((message) =>
      message.text
        .split('\n')
        .filter((line) => line.startsWith('BROWSER_ARTIFACT_RAW '))
        .map((line) => JSON.parse(line.slice('BROWSER_ARTIFACT_RAW '.length)))
    )
  // Real executeClient also retains native post-stop output through context.close.
  // This HTTP component observes those original native calls separately from RPC.
  for (const line of nativeAfterStop)
    if (line.startsWith('BROWSER_ARTIFACT_RAW '))
      rows.push(JSON.parse(line.slice('BROWSER_ARTIFACT_RAW '.length)))
  const events = collector.events
  const observed = {
    mode,
    rows,
    messages,
    events,
    trace,
    failure: failure && { name: failure.name, message: failure.message },
    cleaned,
  }
  process.stdout.write(JSON.stringify(observed) + '\n')
  if (mode === 'transport-error') {
    assert.equal(failure, transportError)
    assert.ok(trace.includes('file-disposed'))
    assert.ok(!messages.some((message) => message.type === 'complete'))
    return
  }
  assert.equal(failure, undefined)
  const expected = JSON.parse(
    readFileSync(
      join(__dirname, `browser-artifacts-${subject}-pristine.json`),
      'utf8'
    )
  ).rows
  // The component selects one explicit source file; genuine absolute paths remain
  // untouched in the saved oracle and are projected only at location.file fields.
  const selectFile = (value) => {
    if (Array.isArray(value)) return value.map(selectFile)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        key === 'file' &&
        typeof child === 'string' &&
        child.endsWith('/fixture/artifacts.test.mjs')
          ? filePath
          : selectFile(child),
      ])
    )
  }
  assert.deepEqual(rows, selectFile(expected))
  assert.equal(messages.at(-1).type, 'complete')
  assert.equal(messages.at(-1).status, 'passed')
  assert.equal(messages.at(-1).caseCount, subject === 'error-shape' ? 1 : 3)
  assert.deepEqual(
    messages.map((message) => message.sequence),
    messages.map((_, index) => index)
  )
  if (subject === 'contract') {
    const records = events.filter((event) => event.type === 'test-artifact')
    assert.equal(records.length, 4)
    assert.ok(
      records.every(
        (event) =>
          event.caseId === 'entry/0' && event.attempt.id === 'run/entry/0/0/0'
      )
    )
    const lastRecord = events.indexOf(records.at(-1))
    assert.ok(
      lastRecord >
        events.findIndex(
          (event) => event.type === 'case-end' && event.caseId === 'entry/2'
        )
    )
  }
  if (subject === 'mutation') {
    assert.deepEqual(trace, ['file-disposed', 'artifact-after-file-disposed'])
    assert.equal(
      nativeAfterStop.filter((line) => line.startsWith('BROWSER_ARTIFACT_RAW '))
        .length,
      1
    )
    const artifactIndex = messages.findIndex(
      (message) =>
        message.type === 'artifact' &&
        message.artifact.type === 'probe:unawaited'
    )
    assert.ok(
      artifactIndex <
        messages.findIndex(
          (message) =>
            message.type === 'case-end' && message.result.caseId === 'entry/1'
        )
    )
  }
  // A captured earlier retry remains addressable even after another attempt ends.
  const prior = require(resultsPath).createClientResultCollector(artifact, {
    runId: 'run',
  })
  prior.accept({
    type: 'collected',
    declarations: [
      { type: 'suite', id: 'entry', parentId: null, name: '', mode: 'run' },
      {
        type: 'test',
        id: 'entry/0',
        parentId: 'entry',
        name: 'retry',
        mode: 'run',
      },
    ],
  })
  for (const retry of [0, 1]) {
    const attempt = { id: `run/entry/0/${retry}/0`, retry, repeat: 0 }
    prior.accept({
      type: 'case-start',
      context: {
        ...attempt,
        fileId: 'entry',
        testId: 'entry/0',
        name: 'retry',
      },
    })
    prior.accept({
      type: 'case-end',
      result: {
        entryId: 'entry',
        caseId: 'entry/0',
        name: 'retry',
        attempt,
        status: retry ? 'passed' : 'failed',
        durationMs: 0,
        errors: [],
      },
    })
  }
  const emptyType = { type: '', data: { ordinary: true } }
  assert.equal(
    prior.accept({
      type: 'artifact',
      taskId: 'entry/0',
      attempt: { id: 'run/entry/0/0/0', retry: 0, repeat: 0 },
      artifact: emptyType,
    }),
    emptyType
  )
  assert.equal(prior.events.at(-1).attempt.retry, 0)
}
main().catch((error) => {
  releaseArtifact()
  globalThis.fetch = nativeFetch
  globalThis.console = nativeConsole
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
