/* eslint-disable no-empty-pattern -- Suite hooks require an explicit fixture context. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const Module = require('node:module')
const { fileURLToPath } = require('node:url')
const nativeExtension = Module._extensions['.node']
let nativeLoads = 0
Module._extensions['.node'] = () => {
  nativeLoads++
  throw new Error(
    'No native addon belongs to parsed-origin component verification'
  )
}
const {
  restoreNodeStackTrace,
} = require('next/dist/experimental/testing/execution/node-stack-trace')
require('next/dist/server/node-environment-baseline')
const {
  createArtifactSourceMapLookup,
} = require('next/dist/experimental/testing/execution/source-maps')
const {
  createArtifactRegistrationOriginMapper,
} = require('next/dist/experimental/testing/execution/registration-origin')
const {
  createCapturedStackMapper,
  createSuiteErrorResultProjection,
} = require('next/dist/experimental/testing/execution/suite-error-projection')
const {
  captureSuiteTaskErrors,
  runCollected,
} = require('next/dist/experimental/testing/runner/lifecycle')
const {
  createCollector,
} = require('next/dist/experimental/testing/runner/collector')
const {
  getCollectionTaskView,
  serializeTaskError,
} = require('next/dist/experimental/testing/runner/tasks')
const {
  captureReporterTaskTree,
} = require('next/dist/experimental/testing/reporting/live-tasks')
const {
  setBundlerFindSourceMapImplementation,
} = require('next/dist/server/patch-error-inspect')
const mode = process.argv[2]
const directory = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'next-parsed-origins-'))
)
const fixture = path.join(__dirname, 'fixtures/registration-origin')
const facts = JSON.parse(
  fs.readFileSync(path.join(fixture, 'native-around.facts.json'))
)
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex')
const code = fs.readFileSync(path.join(fixture, 'native-around.js.txt'))
const map = fs.readFileSync(path.join(fixture, 'native-around.js.map'))
const hostMap = fs.readFileSync(path.join(fixture, 'native-host.js.map'))
assert.equal(sha(code), facts.codeHash)
assert.equal(sha(map), facts.mapHash)
assert.equal(sha(hostMap), facts.hostMapHash)
fs.writeFileSync(path.join(directory, 'entry.js'), code)
fs.writeFileSync(path.join(directory, 'entry.js.map'), map)
const artifact = {
  kind: 'node',
  profile: { environment: 'node' },
  rootDir: directory,
  files: ['entry.js', 'entry.js.map'],
  sourceHash: facts.sourceHash,
}
let checks = 0
function equal(actual, expected) {
  assert.deepEqual(actual, expected)
  checks++
}
const lookup = (host) =>
  createArtifactSourceMapLookup(artifact, facts.entry, host)
const registration = () => {
  const error = new Error(facts.around.message)
  error.stack = facts.around.stack
  return error
}
function timeout() {
  const error = new Error(facts.around.message)
  error.name = facts.around.name
  error.stack = facts.around.stack
  return error
}
function setupProjection(failures) {
  const c = createCollector('actual-owner')
  const owner = getCollectionTaskView(c.root, c.root, {
    filePath: facts.entry,
    testTimeout: 5000,
  })
  const captured = captureSuiteTaskErrors(failures)
  owner.result = { state: 'fail', errors: captured.errors }
  const capture = { result: owner.result, ...captured }
  const origin = createArtifactRegistrationOriginMapper(artifact, facts.entry)
  const mapper = createCapturedStackMapper((stack) => origin(stack))
  const projection = createSuiteErrorResultProjection(
    owner,
    mapper,
    capture,
    (error) => origin(error, 'registration')
  )
  const pack = {
    result: owner.result,
    meta: owner.meta,
    projectResult: projection,
  }
  return {
    c,
    owner,
    capture,
    origin,
    mapper,
    projection,
    pack,
    snapshot: () => captureReporterTaskTree(owner, new Map([[owner.id, pack]])),
  }
}
function assertRawHeld(error, descriptors) {
  equal(Object.getOwnPropertyDescriptors(error), descriptors)
}
async function main() {
  if (mode === 'registration') {
    setBundlerFindSourceMapImplementation(lookup())
    const origin = createArtifactRegistrationOriginMapper(artifact, facts.entry)
    const raw = registration()
    const before = Object.getOwnPropertyDescriptors(raw)
    equal(origin(raw).location, { file: facts.entry, line: 9, column: 11 })
    equal(Object.hasOwn(origin(raw), 'methodName'), false)
    equal(origin(raw, 'registration').location, {
      file: facts.entry,
      line: 9,
      column: 2,
    })
    equal(origin(raw, 'registration').methodName, '')
    const named = raw.stack.replace(
      'at <anonymous> (',
      'at actualNamedFactory ('
    )
    equal(origin(named, 'registration').methodName, undefined)
    const user = new Error('literal user method')
    user.stack = `Error: literal user method\n    at <anonymous> (${facts.entry}:9:11)`
    const generic = createCapturedStackMapper((stack) => origin(stack))
    equal(generic(user.stack)[0], {
      method: '<anonymous>',
      file: facts.entry,
      line: 9,
      column: 11,
    })
    const example = timeout(),
      descriptors = Object.getOwnPropertyDescriptors(example)
    const state = setupProjection([
      { phase: 'aroundAll', error: example, registrationError: raw },
    ])
    equal(
      state
        .snapshot()
        .result.errors[0].stacks.filter((frame) => frame.file === facts.entry),
      [{ method: '', file: facts.entry, line: 9, column: 2 }]
    )
    equal(Object.hasOwn(state.owner.result.errors[0], 'stacks'), false)
    assertRawHeld(example, descriptors)
    assertRawHeld(raw, before)
    await state.c.settle()
    state.c.close()
  } else if (mode === 'scopes') {
    for (const [input, output] of [
      ['native-scopes.ts.txt', 'native-scopes.ts'],
      ['native-scopes.js.txt', 'native-scopes.js'],
      ['native-scopes.js.map', 'native-scopes.js.map'],
    ])
      fs.copyFileSync(path.join(fixture, input), path.join(directory, output))
    const file = path.join(directory, 'native-scopes.ts')
    const source = fs.readFileSync(file, 'utf8')
    restoreNodeStackTrace()
    const original = Error.prepareStackTrace
    // The compiler-produced map is consumed by actual enabled Node stack support.
    const records = require(path.join(directory, 'native-scopes.js')).results
    const scopeArtifact = {
      ...artifact,
      files: ['native-scopes.js', 'native-scopes.js.map'],
      sourceHash: sha(source),
    }
    setBundlerFindSourceMapImplementation(
      createArtifactSourceMapLookup(scopeArtifact, file)
    )
    const origin = createArtifactRegistrationOriginMapper(scopeArtifact, file)
    const expectedAnonymous = new Set([
      'anonymous',
      'functionArgument',
      'module',
    ])
    for (const [name, error] of Object.entries(records)) {
      const raw = error.stack
      const selected = origin(error)
      assert(selected, name + '\n' + raw)
      checks++
      const actual = origin(error, 'registration')
      const line = source.split('\n')[selected.location.line - 1]
      equal(actual.location, {
        file,
        line: selected.location.line,
        column: line.indexOf('aroundAll(') + 1,
      })
      const literal = `Error: actual lexical registration\n    at <anonymous> (${file}:${selected.location.line}:${selected.location.column})`
      equal(
        origin(literal, 'registration').methodName,
        expectedAnonymous.has(name) ? '' : undefined
      )
      equal(error.stack, raw)
    }
    equal(Object.keys(records).length, 10)
    equal(Error.prepareStackTrace, original)
  } else if (mode === 'occurrences') {
    const trace = []
    const first = new Error('first'),
      registered = new Error('registered'),
      last = new Error('last')
    for (const error of [first, registered, last])
      Object.defineProperty(error, 'stack', {
        configurable: true,
        enumerable: false,
        get() {
          trace.push('stack:' + error.message)
          return 'Error: ' + error.message
        },
      })
    const array = [first, , last]
    const proxied = new Proxy(array, {
      get(target, key, receiver) {
        trace.push('get:' + String(key))
        if (key === '0' || key === '2') assert.equal(receiver, proxied)
        return Reflect.get(target, key, receiver)
      },
      has(target, key) {
        trace.push('has:' + String(key))
        return Reflect.has(target, key)
      },
    })
    const aggregate = new AggregateError([], 'aggregate')
    Object.defineProperty(aggregate, 'errors', {
      configurable: true,
      get() {
        trace.push('aggregate-errors')
        return proxied
      },
    })
    const originA = new Error('registration A'),
      originB = new Error('registration B')
    const failures = [
      { phase: 'afterAll', error: aggregate },
      { phase: 'aroundAll', error: registered, registrationError: originA },
      { phase: 'aroundAll', error: registered, registrationError: originB },
    ]
    const baseline = failures
      .flatMap(({ error }) =>
        error instanceof AggregateError ? error.errors : [error]
      )
      .map((error) => serializeTaskError(error))
    const baselineTrace = trace.splice(0)
    const observed = captureSuiteTaskErrors(failures)
    equal(trace, baselineTrace)
    equal(observed.errors, baseline)
    equal(
      observed.origins.map((x) => x.index),
      [2, 3]
    )
    equal(
      observed.origins.map((x) => x.registrationError),
      [originA, originB]
    )
    equal(
      observed.origins.map((x) => x.serializedError),
      observed.errors.slice(2)
    )
    equal(trace.filter((x) => x === 'aggregate-errors').length, 1)
    const nonarray = new AggregateError([], 'nonarray')
    nonarray.errors = 'literal error member'
    equal(
      captureSuiteTaskErrors([{ phase: 'afterAll', error: nonarray }]).errors,
      [serializeTaskError('literal error member')]
    )
    const thrown = new Error('actual getter fault')
    Object.defineProperty(aggregate, 'errors', {
      configurable: true,
      get() {
        throw thrown
      },
    })
    assert.throws(
      () => captureSuiteTaskErrors([{ phase: 'afterAll', error: aggregate }]),
      (error) => error === thrown
    )
    checks++
  } else if (mode === 'slots') {
    setBundlerFindSourceMapImplementation(lookup())
    const raw = timeout(),
      reg = registration(),
      state = setupProjection([
        { phase: 'aroundAll', error: raw, registrationError: reg },
      ])
    const good = state.snapshot()
    equal(
      good.result.errors[0].stacks.find((frame) => frame.file === facts.entry)
        .column,
      2
    )
    const foreign = { ...state.owner }
    const copy = structuredClone(state.owner.result)
    state.projection(foreign, copy, state.owner.result)
    equal(Object.hasOwn(copy.errors[0], 'stacks'), false)
    const wrongResult = structuredClone(state.owner.result)
    state.projection(state.owner, wrongResult, { ...state.owner.result })
    equal(
      wrongResult.errors[0].stacks.find((frame) => frame.file === facts.entry)
        .column,
      11
    )
    const originalErrors = state.owner.result.errors
    state.owner.result.errors = [serializeTaskError(raw)]
    equal(
      state
        .snapshot()
        .result.errors[0].stacks.find((frame) => frame.file === facts.entry)
        .column,
      11
    )
    state.owner.result.errors = originalErrors
    const originalSlot = originalErrors[0]
    originalErrors[0] = serializeTaskError(raw)
    equal(
      state
        .snapshot()
        .result.errors[0].stacks.find((frame) => frame.file === facts.entry)
        .column,
      11
    )
    originalErrors[0] = originalSlot
    let descriptorReads = 0
    const proxy = new Proxy(state.owner.result, {
      getOwnPropertyDescriptor() {
        descriptorReads++
        throw new Error('must not inspect authored result proxy')
      },
    })
    state.projection(state.owner, structuredClone(state.owner.result), proxy)
    equal(descriptorReads, 0)
    await state.c.settle()
    state.c.close()
  } else if (mode === 'host') {
    const payload = JSON.parse(hostMap)
    equal(payload.ignoreList, [0])
    equal(sha(payload.sourcesContent[0]), facts.hostSourceHash)
    const historicalHost = { compiledFile: facts.hostCompiledFile, payload }
    setBundlerFindSourceMapImplementation(lookup(historicalHost))
    const origin = createArtifactRegistrationOriginMapper(artifact, facts.entry)
    const mapper = createCapturedStackMapper((stack) => origin(stack))
    const residualHostFrame = facts.empty.stack
      .split('\n')
      .find((line) => line.includes('/execution/worker.ts:'))
    assert(residualHostFrame)
    checks++
    const residualStack =
      facts.empty.stack.split('\n')[0] + '\n' + residualHostFrame
    equal(mapper(residualStack), [])
    equal(
      mapper(facts.late.stack)
        .filter((x) => x.file === facts.entry)
        .map((x) => ({ line: x.line, column: x.column })),
      [{ line: 14, column: 15 }]
    )
    const userPath = path.join(directory, 'user/worker.ts')
    equal(
      mapper(
        `Error: authored worker name\n    at actualUser (${userPath}:13:7)`
      ),
      [{ method: 'actualUser', file: userPath, line: 13, column: 7 }]
    )
    const unignored = structuredClone(payload)
    delete unignored.ignoreList
    setBundlerFindSourceMapImplementation(
      lookup({ compiledFile: facts.hostCompiledFile, payload: unignored })
    )
    equal(
      mapper(residualStack).some((x) =>
        x.file.endsWith('/execution/worker.ts')
      ),
      true
    )
    // The real Node loader also retains this exact published module's map.
    const workerFile =
      process.argv[3] ||
      require.resolve('next/dist/experimental/testing/execution/worker')
    require(workerFile)
    const actualMap = Module.findSourceMap(workerFile)
    assert(actualMap)
    checks++
    equal(actualMap.payload.ignoreList, [0])
    const actual = lookup({
      compiledFile: workerFile,
      payload: actualMap.payload,
    })
    const source = fileURLToPath(actualMap.payload.sources[0])
    equal(actual.originalSource(source).ignored, true)
    equal(
      actual.originalSource(source).sha256,
      sha(actualMap.payload.sourcesContent[0])
    )
  } else if (mode === 'globals') {
    const sample = new Error('actual global-stub error')
    const baseline = [serializeTaskError(sample)]
    const oldNumber = global.Number,
      oldString = global.String
    let numberReads = 0,
      stringReads = 0,
      captured
    try {
      global.Number = () => {
        numberReads++
        throw new Error('authored Number')
      }
      global.String = () => {
        stringReads++
        throw new Error('authored String')
      }
      captured = captureSuiteTaskErrors([{ phase: 'afterAll', error: sample }])
    } finally {
      global.Number = oldNumber
      global.String = oldString
    }
    equal(captured.errors, baseline)
    equal([numberReads, stringReads], [0, 0])
    let inheritedOrigins = 0,
      ordinary
    try {
      Object.defineProperty(Object.prototype, 'registrationError', {
        configurable: true,
        get() {
          inheritedOrigins++
          throw new Error('inherited registration intent')
        },
      })
      ordinary = captureSuiteTaskErrors([{ phase: 'afterAll', error: sample }])
    } finally {
      delete Object.prototype.registrationError
    }
    equal(ordinary.origins, [])
    equal(inheritedOrigins, 0)

    const c = createCollector('prototype-capability')
    const owner = getCollectionTaskView(c.root, c.root, {
      filePath: facts.entry,
      testTimeout: 5000,
    })
    owner.result = { state: 'pass' }
    let calls = 0,
      arity,
      reads = 0
    const generic = function () {
      calls++
      arity = arguments.length
    }
    try {
      Object.defineProperty(Object.prototype, 'captureOriginalResult', {
        configurable: true,
        get() {
          reads++
          throw new Error('authored inherited capability')
        },
      })
      captureReporterTaskTree(
        owner,
        new Map([
          [
            owner.id,
            { result: owner.result, meta: owner.meta, projectResult: generic },
          ],
        ])
      )
    } finally {
      delete Object.prototype.captureOriginalResult
    }
    equal([calls, arity, reads], [1, 2, 0])
    await c.settle()
    c.close()
    setBundlerFindSourceMapImplementation(lookup())
    const state = setupProjection([
      {
        phase: 'aroundAll',
        error: timeout(),
        registrationError: registration(),
      },
    ])
    const descriptor = Object.getOwnPropertyDescriptor
    let unexpected = 0,
      snapshot
    try {
      Object.getOwnPropertyDescriptor = () => {
        unexpected++
        throw new Error('authored descriptor utility')
      }
      snapshot = state.snapshot()
    } finally {
      Object.getOwnPropertyDescriptor = descriptor
    }
    equal(unexpected, 0)
    equal(
      snapshot.result.errors[0].stacks.find(
        (frame) => frame.file === facts.entry
      ).column,
      2
    )
    await state.c.settle()
    state.c.close()
  } else if (mode === 'file-lifecycle') {
    const {
      initializeTestFile,
    } = require('next/dist/experimental/testing/runner')
    for (const complete of [false, true])
      for (const capture of [false, true]) {
        const file = initializeTestFile({
          fileId: 'real-file-producer',
          filePath: path.join(directory, 'actual.test.mjs'),
        })
        let release, settled, observed
        const gate = new Promise((resolve) => {
          release = resolve
        })
        const done = new Promise((resolve) => {
          settled = resolve
        })
        try {
          await file.collect(async () => {
            file.api.describe('affected', () => {
              file.api.aroundAll(async (run) => {
                try {
                  await gate
                  await run()
                } finally {
                  settled()
                }
              }, 20)
              file.api.test('blocked', () => {
                throw new Error('blocked body must not run')
              })
            })
            file.api.afterAll(async () => {
              release()
              await done
            })
          })
          const result = await file.run({
            runId: 'actual-file-origin',
            signal: new AbortController().signal,
            ...(complete ? { captureCompletedModuleResult: true } : {}),
            ...(capture ? { captureSuiteErrorOrigins: true } : {}),
            onSuiteEnd: function (value, task, origin) {
              equal(arguments.length, capture ? 3 : 2)
              if (value.name !== 'affected') return
              observed = true
              if (capture) {
                equal(origin.result, task.result)
                equal(origin.origins.length, 1)
                equal(origin.origins[0].serializedError, task.result.errors[0])
                equal(
                  origin.origins[0].registrationError,
                  value.errors[0].registrationError
                )
              } else equal(origin, undefined)
            },
          })
          equal(observed, true)
          equal(
            result.cases.map((x) => x.status),
            ['skipped']
          )
        } finally {
          await file.dispose()
        }
      }
  } else if (mode === 'lifecycle') {
    for (const capture of [false, true]) {
      const c = createCollector('real-suite-producer')
      let release, settled
      const gate = new Promise((resolve) => {
        release = resolve
      })
      const done = new Promise((resolve) => {
        settled = resolve
      })
      c.api.describe('affected', () => {
        c.api.aroundAll(async (run) => {
          try {
            await gate
            await run()
          } finally {
            settled()
          }
        }, 20)
        c.api.test('blocked', () => {
          throw new Error('blocked body must not run')
        })
      })
      c.api.afterAll(async () => {
        release()
        await done
      })
      await c.settle()
      let observed
      const result = await runCollected(
        c.close(),
        {
          runId: 'origin-capture',
          signal: new AbortController().signal,
          ...(capture ? { captureSuiteErrorOrigins: true } : {}),
          onSuiteEnd: function (value, task, origin) {
            equal(arguments.length, capture ? 3 : 2)
            if (value.name !== 'affected') return
            observed = { value, task, origin }
            if (capture) {
              equal(origin.result, task.result)
              equal(origin.errors, task.result.errors)
              equal(origin.origins.length, 1)
              equal(origin.origins[0].index, 0)
              equal(origin.origins[0].serializedError, task.result.errors[0])
              equal(
                origin.origins[0].registrationError,
                value.errors[0].registrationError
              )
              equal(
                Object.keys(value.errors[0]).includes('registrationError'),
                false
              )
            } else equal(origin, undefined)
          },
        },
        () => {}
      )
      assert(observed)
      checks++
      equal(
        result.cases.map((x) => x.status),
        ['skipped']
      )
      equal(result.errors.length, 1)
    }
  } else throw new Error('Unknown parsed-origin mode ' + mode)
  equal(nativeLoads, 0)
  process.stdout.write(
    JSON.stringify({
      mode,
      checks,
      actualNode: process.version,
      actualExecutable: process.execPath,
      nativeAddonLoads: 0,
      nativeProjectCalls: 0,
      privateComponentOnly: true,
    })
  )
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    setBundlerFindSourceMapImplementation(() => undefined)
    Module._extensions['.node'] = nativeExtension
    fs.rmSync(directory, { recursive: true, force: true })
  })
