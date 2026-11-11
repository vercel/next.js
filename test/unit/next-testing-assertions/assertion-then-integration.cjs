const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { createRequire } = Module
const [repo, mode, emitted, resultFile] = process.argv.slice(2)
const load = createRequire(path.join(repo, 'package.json'))
const assertionPath = load.resolve('next/dist/experimental/testing/assertions')
if (emitted !== '-') {
  const original = Module._extensions['.js']
  Module._extensions['.js'] = (module, filename) => {
    if (filename === assertionPath) {
      Module._extensions['.js'] = original
      return module._compile(fs.readFileSync(emitted, 'utf8'), filename)
    }
    return original(module, filename)
  }
}
const observed = { mode, rows: [] }
function record(label, value) {
  observed.rows.push({ label, ...value })
}
function errorValue(error) {
  return { name: error.name, message: error.message, stack: error.stack }
}
const guard = /Browser Mode API access requires its originating/
async function browser() {
  const platformPath = load.resolve(
    'next/dist/experimental/testing/assertions/assertion-platform'
  )
  assert.equal(load(platformPath).fileAssertionLifetime, false)
  const client = load('next/dist/experimental/testing/client/async-context')
  const browserPlatform = load(
    'next/dist/experimental/testing/client/assertion-platform'
  )
  load.cache[platformPath] = {
    ...load.cache[platformPath],
    exports: browserPlatform,
  }
  const { createAssertionRuntime } = load(assertionPath)
  const late = []
  function owner(kind, id) {
    const context = {
      id,
      fileId: 'assertion-then',
      name: id,
      ...(kind === 'attempt' ? { testId: id } : {}),
    }
    const boundary = client.createAsyncScope({ kind, context }, (error) =>
      late.push(errorValue(error))
    )
    const token = boundary.run(() => client.captureCreatorScope())
    return { context, boundary, token }
  }
  async function frame(owner, run) {
    const leave = client.enterCreatorScope(owner.token)
    try {
      return await run()
    } finally {
      leave()
    }
  }
  async function finish(owner, handle) {
    const errors = []
    try {
      await frame(owner, async () => {
        for (const operation of [
          ...(owner.context.testId ? [() => handle.finishTest(false)] : []),
          () => handle.finalize(),
          () => handle.dispose(),
        ]) {
          try {
            await operation()
          } catch (error) {
            errors.push(error)
          }
        }
      })
    } finally {
      owner.boundary.close()
    }
    if (errors.length)
      throw new AggregateError(errors, 'Component scope cleanup failed')
  }
  const collection = owner('collection', 'file')
  let runtime
  let attempt
  let handle
  let primaryError
  try {
    runtime = await collection.boundary.run(() =>
      createAssertionRuntime({
        testPath: path.join(path.dirname(resultFile), 'subject.mjs'),
        resourceLifetime: 'file',
        getCurrentAttempt: client.getOriginatingAttempt,
        getCurrentHook: client.getOriginatingHook,
        getCurrentCollection: client.getOriginatingCollection,
        getCurrentScopeAncestors: client.getOriginatingScopeAncestors,
      })
    )
    const collected = collection.boundary.run(() =>
      runtime.beginCollection(collection.context)
    )
    await finish(collection, collected)
    attempt = owner('attempt', 'assertion protocol')
    handle = attempt.boundary.run(() => runtime.beginAttempt(attempt.context))
    let assertion
    let accessor
    let callable
    let valueProperty
    let chain
    let inheritedData
    let inheritedAccessor
    let inheritedReads = 0
    let getterReads = 0
    let thenCalls = 0
    await frame(attempt, async () => {
      assertion = runtime.expect(1).toBe(1)
      chain = runtime.expect([1]).include
      assert.equal(typeof chain, 'function')
      assert.equal(Reflect.get(chain, 'then'), undefined)
      assert.equal(Reflect.get(assertion, 'then'), undefined)
      accessor = runtime.expect(2)
      Object.defineProperty(accessor, 'then', {
        configurable: true,
        get() {
          getterReads++
          return undefined
        },
      })
      callable = runtime.expect(3)
      Object.defineProperty(callable, 'then', {
        configurable: true,
        value(resolve) {
          thenCalls++
          resolve('real then result')
        },
      })
      valueProperty = runtime.expect(4)
      Object.defineProperty(valueProperty, 'then', { value: 7 })
      assert.equal(Reflect.get(accessor, 'then'), undefined)
      assert.equal(Reflect.get(valueProperty, 'then'), 7)
      Reflect.get(
        callable,
        'then'
      )((value) => assert.equal(value, 'real then result'))
      inheritedData = runtime.expect(5)
      Object.setPrototypeOf(
        inheritedData,
        Object.create(Object.getPrototypeOf(inheritedData), {
          then: { value: 11 },
        })
      )
      inheritedAccessor = runtime.expect(6)
      Object.setPrototypeOf(
        inheritedAccessor,
        Object.create(Object.getPrototypeOf(inheritedAccessor), {
          then: {
            get() {
              inheritedReads++
              return undefined
            },
          },
        })
      )
      assert.equal(Reflect.get(inheritedData, 'then'), 11)
      assert.equal(Reflect.get(inheritedAccessor, 'then'), undefined)
      await runtime.expect(Promise.resolve(7)).resolves.toBe(7)
    })
    record('present protocol in scope', {
      getterReads,
      thenCalls,
      inheritedReads,
    })
    let callableGuarded = false
    try {
      Reflect.get(chain, 'then')
    } catch (error) {
      callableGuarded = guard.test(error.message)
    }
    record('callable chain outside scope', { guarded: callableGuarded })
    for (const [label, target] of [
      ['accessor', accessor],
      ['callable', callable],
      ['value', valueProperty],
      ['inherited data', inheritedData],
      ['inherited accessor', inheritedAccessor],
    ]) {
      let error
      try {
        Reflect.get(target, 'then')
      } catch (caught) {
        error = errorValue(caught)
      }
      record(`present ${label} outside scope`, {
        guarded: !!error && guard.test(error.message),
        error,
      })
    }
    record('present protocol after refused reads', {
      getterReads,
      thenCalls,
      inheritedReads,
    })
    let protocolError
    let samePayload = false
    try {
      const adopted = await Promise.resolve().then(() =>
        attempt.boundary.run(() => assertion)
      )
      samePayload = adopted === assertion
    } catch (error) {
      protocolError = errorValue(error)
    }
    record('native reaction assertion result', { samePayload, protocolError })
    assert.throws(() => Reflect.get(assertion, 'toBe'), guard)
    let unknownReads = 0
    const unknown = new Proxy(
      {},
      {
        get(target, property, receiver) {
          if (property === 'then') unknownReads++
          return Reflect.get(target, property, receiver)
        },
      }
    )
    assert.equal(await Promise.resolve().then(() => unknown), unknown)
    const rejection = new Error('ordinary thenable getter')
    const throwing = Object.defineProperty({}, 'then', {
      get() {
        throw rejection
      },
    })
    await assert.rejects(
      Promise.resolve().then(() => throwing),
      (error) => error === rejection
    )
    let ordinaryGets = 0
    let ordinaryCalls = 0
    const ordinary = {
      get then() {
        ordinaryGets++
        return function (resolve) {
          ordinaryCalls++
          resolve(unknown)
        }
      },
    }
    assert.equal(await Promise.resolve().then(() => ordinary), unknown)
    record('ordinary payload and thenables', {
      unknownReads,
      ordinaryGets,
      ordinaryCalls,
      rejectionIdentity: true,
    })
    await finish(attempt, handle)
    handle = undefined
    await runtime.finishFile()
    record('disposed absent protocol', {
      guarded: (() => {
        try {
          Reflect.get(assertion, 'then')
          return false
        } catch (error) {
          return guard.test(error.message)
        }
      })(),
    })
    record('late errors', { errors: late })
    fs.writeFileSync(resultFile, JSON.stringify(observed, null, 2) + '\n')
    assert.equal(getterReads, 1)
    assert.equal(thenCalls, 1)
    assert.ok(
      observed.rows
        .filter(
          (row) =>
            row.label.startsWith('present ') && row.label.includes('outside')
        )
        .every((row) => row.guarded)
    )
    assert.equal(samePayload, true)
    assert.equal(protocolError, undefined)
    assert.equal(ordinaryGets, 1)
    assert.equal(ordinaryCalls, 1)
    assert.equal(
      observed.rows.find((row) => row.label === 'disposed absent protocol')
        .guarded,
      true
    )
    assert.equal(late.length, protocolError ? 9 : 8)
    assert.equal(inheritedReads, 1)
    assert.equal(callableGuarded, true)
    assert.ok(late.every((error) => guard.test(error.message)))
  } catch (error) {
    primaryError = error
    observed.primaryError = errorValue(error)
    if (error instanceof AggregateError)
      observed.primaryErrors = error.errors.map(errorValue)
    fs.writeFileSync(resultFile, JSON.stringify(observed, null, 2) + '\n')
    throw error
  } finally {
    const cleanupErrors = []
    if (handle) {
      try {
        await finish(attempt, handle)
      } catch (error) {
        cleanupErrors.push(errorValue(error))
      }
    }
    try {
      await runtime?.finishFile()
    } catch (error) {
      cleanupErrors.push(errorValue(error))
    }
    collection.boundary.close()
    observed.cleanupErrors = cleanupErrors
    fs.writeFileSync(resultFile, JSON.stringify(observed, null, 2) + '\n')
    if (!primaryError && cleanupErrors.length)
      throw new Error(
        'Component cleanup failed: ' + JSON.stringify(cleanupErrors)
      )
  }
}
async function node() {
  const { initializeTestFile } = load('next/dist/experimental/testing/runner')
  const common = load('next/dist/experimental/testing/vitest')
  const file = initializeTestFile({
    fileId: 'assertion-then-node',
    filePath: path.join(path.dirname(resultFile), 'node-subject.mjs'),
  })
  let held
  try {
    await file.collect(async () => {
      common.test(
        'Node reaction result keeps its assertion payload',
        async () => {
          held = common.expect(1).toBe(1)
          assert.equal(await Promise.resolve().then(() => held), held)
          record('Node payload', { samePayload: true })
        }
      )
    })
    const result = await file.run({
      runId: 'node',
      signal: new AbortController().signal,
    })
    record('Node results', {
      statuses: result.cases.map((test) => test.status),
      errors: result.errors,
    })
    assert.deepEqual(
      result.cases.map((test) => test.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
    assert.throws(
      () => Reflect.get(held, 'then'),
      /expect\(\) requires an active/
    )
    record('Node ended scope', { guarded: true })
    fs.writeFileSync(resultFile, JSON.stringify(observed, null, 2) + '\n')
  } finally {
    await file.dispose()
  }
}
;(mode === 'browser' ? browser() : node()).catch((error) => {
  observed.failure = errorValue(error)
  fs.writeFileSync(resultFile, JSON.stringify(observed, null, 2) + '\n')
  console.error(error)
  process.exitCode = 1
})
