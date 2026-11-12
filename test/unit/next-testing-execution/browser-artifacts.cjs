const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInThisContext } = require('node:vm')
const [mode, runtimePath, serverPath, resultsPath, commonPath, browserPath] =
  process.argv.slice(2)
assert.ok(
  [
    'contract',
    'mutation',
    'error-shape',
    'transport-error',
    'record-drain',
    'default-record-drain',
  ].includes(mode)
)
const recordDrain = mode === 'record-drain' || mode === 'default-record-drain'
const subject =
  mode === 'transport-error' ? 'contract' : recordDrain ? 'mutation' : mode
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
let releaseTaskUpdate
const taskUpdateGate = new Promise((resolve) => {
  releaseTaskUpdate = resolve
})
let taskUpdateHeld = false
let retainedFile
if (mode === 'mutation' || recordDrain) {
  const { clientConsoleBoundary } = local('./protocol')
  nativeConsole.debug = function (...args) {
    if (args[0] === clientConsoleBoundary.stop) consoleStopped = true
    return Reflect.apply(originalDebug, this, args)
  }
  nativeConsole.log = function (...args) {
    if (
      (recordDrain || mode === 'mutation') &&
      typeof args[0] === 'string' &&
      args[0].startsWith('BROWSER_ARTIFACT_RAW ') &&
      JSON.parse(args[0].slice('BROWSER_ARTIFACT_RAW '.length)).name ===
        'afterAll'
    ) {
      trace.push('native-afterAll')
      releaseTaskUpdate()
      releaseArtifact()
    }
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
  cleanupBrowserKeyboard() {},
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
  ...(mode === 'record-drain' ? { captureTaskResults: true } : {}),
}
const messages = [],
  failures = [],
  trace = []
const collector = require(resultsPath).createClientResultCollector(artifact, {
  runId: 'run',
  ...(mode === 'record-drain' ? { captureTaskResults: true } : {}),
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
    if (recordDrain) {
      const run = file.run
      file.run = function (options) {
        const onCollected = options.onCollected
        return Reflect.apply(run, this, [
          {
            ...options,
            onCollected(actualFile) {
              retainedFile = actualFile
              return onCollected?.(actualFile)
            },
          },
        ])
      }
    }
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
          if (recordDrain || mode === 'mutation')
            trace.push('unawaited-artifact-fetch')
          await artifactGate
          trace.push(
            recordDrain || mode === 'mutation'
              ? 'artifact-after-native-afterAll'
              : 'artifact-after-file-disposed'
          )
        }
      }
      const response = nativeFetch(url, {
        ...options,
        headers: { ...options.headers, Cookie: cookie, Origin: origin },
      })
      if (!recordDrain) return response
      const nativeResponse = await response
      if (
        !taskUpdateHeld &&
        message?.type === 'task-update' &&
        message.taskUpdateIds.includes('entry/1')
      ) {
        taskUpdateHeld = true
        trace.push('task-update-reply-held')
        await taskUpdateGate
        trace.push('task-update-reply-released')
      }
      return nativeResponse
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
    releaseTaskUpdate()
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
    ...(recordDrain
      ? {
          retainedArtifacts: retainedFile.tasks.map((task) => ({
            id: task.id,
            artifacts: task.artifacts,
          })),
        }
      : {}),
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
  if (mode === 'mutation') {
    const artifactIndex = messages.findIndex(
      (message) =>
        message.type === 'artifact' &&
        message.artifact.type === 'probe:unawaited'
    )
    assert.ok(artifactIndex >= 0)
    const afterAll = trace.indexOf('native-afterAll')
    const artifactSent = trace.indexOf('unawaited-artifact-fetch')
    assert.ok(afterAll >= 0 && afterAll < artifactSent)
    for (const caseId of ['entry/1', 'entry/2']) {
      const caseEndIndex = messages.findIndex(
        (message) =>
          message.type === 'case-end' && message.result.caseId === caseId
      )
      assert.ok(caseEndIndex >= 0 && caseEndIndex < artifactIndex)
    }
    const taskUpdateIndex = messages.findIndex(
      (message) =>
        message.type === 'task-update' &&
        message.taskUpdateIds.includes('entry/1')
    )
    assert.ok(taskUpdateIndex >= 0 && taskUpdateIndex < artifactIndex)
  }
  if (recordDrain) {
    assert.equal(taskUpdateHeld, true)
    const held = trace.indexOf('task-update-reply-held')
    const afterAll = trace.indexOf('native-afterAll')
    const released = trace.indexOf('task-update-reply-released')
    const sent = trace.indexOf('unawaited-artifact-fetch')
    assert.ok(held >= 0 && held < released)
    assert.ok(afterAll >= 0 && afterAll < released && released < sent)
    assert.ok(afterAll < trace.indexOf('artifact-after-native-afterAll'))
    const artifactIndex = messages.findIndex(
      (message) =>
        message.type === 'artifact' &&
        message.artifact.type === 'probe:unawaited'
    )
    const updateIndex = messages.findIndex(
      (message) =>
        message.type === 'task-update' &&
        message.taskUpdateIds.includes('entry/1')
    )
    assert.ok(updateIndex >= 0 && updateIndex < artifactIndex)
    for (const caseId of ['entry/1', 'entry/2']) {
      const endIndex = messages.findIndex(
        (message) =>
          message.type === 'case-end' && message.result.caseId === caseId
      )
      assert.ok(endIndex >= 0 && endIndex < artifactIndex)
    }
    const late = events.filter(
      (event) =>
        event.type === 'test-artifact' &&
        event.artifact.type === 'probe:unawaited'
    )
    assert.equal(late.length, 1)
    assert.equal(late[0].caseId, 'entry/1')
    assert.equal(late[0].attempt.id, 'run/entry/1/0/0')
    const caseB = retainedFile.tasks.find((task) => task.id === 'entry/1')
    const caseC = retainedFile.tasks.find((task) => task.id === 'entry/2')
    assert.deepEqual(caseB.artifacts, [messages[artifactIndex].artifact])
    assert.deepEqual(caseC.artifacts, [])
    const publicTaskEvents = events.filter(
      (event) => event.type === 'file-collected' || event.type === 'task-update'
    )
    const collected = messages.find((message) => message.type === 'collected')
    if (mode === 'default-record-drain') {
      assert.equal(Object.hasOwn(configuration, 'captureTaskResults'), false)
      assert.equal(Object.hasOwn(collected, 'taskTree'), false)
      assert.deepEqual(publicTaskEvents, [])
    } else {
      assert.equal(configuration.captureTaskResults, true)
      assert.ok(Object.hasOwn(collected, 'taskTree'))
      assert.ok(
        publicTaskEvents.some((event) => event.type === 'file-collected')
      )
      assert.ok(publicTaskEvents.some((event) => event.type === 'task-update'))
    }
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
  releaseTaskUpdate()
  releaseArtifact()
  globalThis.fetch = nativeFetch
  globalThis.console = nativeConsole
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
