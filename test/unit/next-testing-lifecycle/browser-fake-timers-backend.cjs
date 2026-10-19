const assert = require('node:assert/strict')
const { it } = require('node:test')
const { mkdtemp, readFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, dirname, basename, resolve } = require('node:path')
const { runInThisContext } = require('node:vm')
const mode = process.argv[2]
const isResetConfig = mode.startsWith('browser-reset-config-')
const resetScenario = isResetConfig
  ? mode.slice('browser-reset-config-'.length)
  : undefined
const resetPristine = isResetConfig
  ? require('./browser-mock-reset-config-pristine.json').scenarios[
      resetScenario
    ]
  : undefined
const isRuntimeConfig = mode === 'browser-runtime-config'
const isProject = mode === 'browser-project' || isRuntimeConfig
const isLate = mode === 'browser-late'
const pristine =
  resetPristine ??
  require(
    isRuntimeConfig
      ? './browser-runtime-clock-config-pristine.json'
      : isProject
        ? './browser-project-fake-timers-pristine.json'
        : isLate
          ? './browser-fake-timers-late-pristine.json'
          : './browser-fake-timers-pristine.json'
  )

const commonPrimitive = require.resolve(
  'next/dist/compiled/next-test-primitives'
)
const browserPrimitive = require('next/dist/compiled/next-test-primitives/browser')
assert.equal(typeof browserPrimitive.createTimerContext, 'function')
require.cache[commonPrimitive] = {
  id: commonPrimitive,
  filename: commonPrimitive,
  loaded: true,
  exports: browserPrimitive,
}
const clockModule = require.resolve(
  'next/dist/experimental/testing/assertions/fake-timers'
)
require.cache[clockModule] = {
  id: clockModule,
  filename: clockModule,
  loaded: true,
  exports: require('next/dist/experimental/testing/client/fake-timers'),
}
const client = require('next/dist/experimental/testing/client/async-context')
const platform = require.resolve(
  'next/dist/experimental/testing/assertions/assertion-platform'
)
assert.equal(require(platform).fileAssertionLifetime, false)
const browserPlatform = require('next/dist/experimental/testing/client/assertion-platform')
assert.equal(browserPlatform.fileAssertionLifetime, true)
require.cache[platform] = {
  ...require.cache[platform],
  exports: browserPlatform,
}
const snapshotModule = require.resolve(
  'next/dist/experimental/testing/assertions/snapshot-environment'
)
const browserSnapshots = require('next/dist/experimental/testing/client/snapshot-environment')
require.cache[snapshotModule] = {
  id: snapshotModule,
  filename: snapshotModule,
  loaded: true,
  exports: browserSnapshots,
}
browserSnapshots.installBrowserSnapshotBridge({
  async request(method, args) {
    if (method === 'resolvePath')
      return join(
        dirname(args[0]),
        '__snapshots__',
        basename(args[0]) + '.snap'
      )
    if (method === 'resolveRawPath') return resolve(dirname(args[0]), args[1])
    if (method === 'readSnapshotFile') {
      try {
        return await readFile(args[0], 'utf8')
      } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
      }
    }
    throw new Error('Unexpected snapshot request ' + method)
  },
  // No subject uses snapshots; actual source-map behavior is outside this clock component.
  mapLocation: (frame) => frame,
})
const {
  createAssertionRuntime,
} = require('next/dist/experimental/testing/assertions')

// A private exports facade selects this component's genuine Browser assertion
// runtime. Unused runner exports retain their original function identities.
let runtime
const runnerModule = require.resolve('next/dist/experimental/testing/runner')
const originalRunner = require(runnerModule)
const activeRuntime = () => {
  browserPlatform.assertAssertionRuntimeAccess()
  assert.ok(runtime)
  return runtime
}
require.cache[runnerModule] = {
  ...require.cache[runnerModule],
  exports: {
    ...originalRunner,
    getAssertionRuntime: activeRuntime,
    getAssertionRuntimeForAssertions: activeRuntime,
  },
}
const browser = require('next/dist/experimental/testing/client/vitest')
let serial = 0

it('uses actual Browser assertion lifetime and the same genuine file clock for literal subjects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-browser-fake-clock-'))
  const originalDate = globalThis.Date
  const originalTimeout = globalThis.setTimeout
  const originalLog = console.log
  const late = [],
    rows = [],
    definitions = [],
    hooks = [],
    completed = []
  const rowPrefix = isResetConfig
    ? 'BROWSER_RESET_CONFIG_RAW '
    : isRuntimeConfig
      ? 'BROWSER_RUNTIME_CONFIG_RAW '
      : isProject
        ? 'BROWSER_PROJECT_CLOCK_RAW '
        : 'BROWSER_FAKE_TIMERS_RAW '
  const scopes = []
  const makeScope = (kind, name) => {
    const context = {
      id: `fake-${++serial}`,
      name,
      ...(kind === 'attempt'
        ? { testId: name }
        : kind === 'hook'
          ? { hook: 'afterAll' }
          : {}),
    }
    const boundary = client.createAsyncScope({ kind, context }, (error) =>
      late.push(error)
    )
    const token = boundary.run(() => client.captureCreatorScope())
    const scope = { context, boundary, token }
    scopes.push(scope)
    return scope
  }
  const frame = async (scope, fn) => {
    const leave = client.enterCreatorScope(scope.token)
    try {
      return await scope.boundary.run(fn)
    } finally {
      leave()
    }
  }
  const finish = async (scope, handle, failed = false) => {
    await frame(scope, async () => {
      if (scope.context.testId) await handle.finishTest(failed)
      await handle.finalize()
      await handle.dispose()
    })
    scope.boundary.close()
  }
  let collection, collectionHandle, active, activeHandle
  let retained
  try {
    console.log = (...args) => {
      if (typeof args[0] === 'string' && args[0].startsWith(rowPrefix))
        rows.push(JSON.parse(args[0].slice(rowPrefix.length)))
      Reflect.apply(originalLog, console, args)
    }
    collection = makeScope('collection', 'fake-clock-browser')
    runtime = await collection.boundary.run(() =>
      createAssertionRuntime({
        testPath: join(directory, 'subject.mjs'),
        resourceLifetime: 'file',
        ...resetPristine?.flags,
        ...(isProject
          ? {
              fakeTimers: {
                now: 1234,
                toFake: ['Date', 'setTimeout', 'clearTimeout'],
                loopLimit: 3,
                shouldClearNativeTimers: true,
              },
            }
          : {}),
        getCurrentAttempt: client.getOriginatingAttempt,
        getCurrentHook: client.getOriginatingHook,
        getCurrentCollection: client.getOriginatingCollection,
        getCurrentScopeAncestors: client.getOriginatingScopeAncestors,
      })
    )
    collectionHandle = collection.boundary.run(() =>
      runtime.beginCollection(collection.context)
    )
    const source = await readFile(
      join(
        __dirname,
        isResetConfig
          ? 'browser-mock-reset-config-contract.mjs.txt'
          : isRuntimeConfig
            ? 'browser-runtime-clock-config-contract.mjs.txt'
            : isProject
              ? 'browser-project-fake-timers-contract.mjs.txt'
              : isLate
                ? 'browser-fake-timers-late-contract.mjs.txt'
                : 'browser-fake-timers-contract.mjs.txt'
      ),
      'utf8'
    )
    const [imports, ...lines] = source.split('\n')
    assert.equal(
      imports,
      isProject || isResetConfig
        ? "import { expect, test, vi } from 'vitest'"
        : "import { afterAll, expect, test, vi } from 'vitest'"
    )
    collection.boundary.run(() => {
      retained = browser.vi.advanceTimersByTime
      assert.equal(retained, browser.vi.advanceTimersByTime)
      assert.equal(
        browser.vi.advanceTimersByTimeAsync,
        browser.vi.advanceTimersByTimeAsync
      )
      assert.equal(Reflect.get(browser.vi, 'then'), undefined)
      assert.equal(typeof browser.vi.stubEnv, 'function')
      assert.equal(browser.vi.stubEnv, browser.vi.stubEnv)
      runInThisContext(
        `(function(afterAll, expect, test, vi) {\n"use strict";\n${lines.join('\n')}\n})`,
        {
          filename: 'browser-fake-timers-contract.mjs.txt',
        }
      )(
        (body) => hooks.push(body),
        browser.expect,
        (name, body) => definitions.push({ name, body }),
        browser.vi
      )
    })
    await finish(collection, collectionHandle)
    collectionHandle = undefined
    for (const definition of definitions) {
      active = makeScope('attempt', definition.name)
      activeHandle = active.boundary.run(() =>
        runtime.beginAttempt(active.context)
      )
      await frame(active, () =>
        definition.body({ ...active.context, expect: activeHandle.expect })
      )
      await finish(active, activeHandle)
      activeHandle = undefined
      completed.push(definition.name)
    }
    active = makeScope('hook', 'afterAll')
    activeHandle = active.boundary.run(() => runtime.beginHook(active.context))
    await frame(active, async () => {
      for (const hook of hooks) await hook()
    })
    await finish(active, activeHandle)
    activeHandle = undefined
    originalLog(
      JSON.stringify({
        mode,
        actualCompletedSubjects: completed,
        actualRows: rows,
        completePristineRows: pristine.rows,
      })
    )
    assert.deepEqual(
      completed,
      pristine.cases.map((entry) => entry.name)
    )
    assert.deepEqual(
      rows,
      isProject || isResetConfig
        ? Object.entries(pristine.observations).map(([name, raw]) => ({
            name,
            raw,
          }))
        : pristine.rows
    )
    assert.deepEqual(late, [])
    assert.equal(globalThis.Date, originalDate)
    assert.equal(globalThis.setTimeout, originalTimeout)

    // The original failure remains the actual thrown object. Finalize this real
    // Browser assertion attempt as failed, then finish its owning file.
    const bodyError = new Error('actual fake-clock body failure')
    let callbackRan = false
    active = makeScope('attempt', 'actual clock body failure')
    activeHandle = active.boundary.run(() =>
      runtime.beginAttempt(active.context)
    )
    await assert.rejects(
      frame(active, () => {
        browser.vi.useFakeTimers({ now: 5000 })
        setTimeout(() => {
          callbackRan = true
        }, 20)
        assert.equal(browser.vi.getTimerCount(), 1)
        throw bodyError
      }),
      (error) => error === bodyError
    )
    await finish(active, activeHandle, true)
    activeHandle = undefined
    assert.notEqual(globalThis.Date, originalDate)
    await runtime.finishFile()
    runtime = undefined
    assert.equal(globalThis.Date, originalDate)
    assert.equal(globalThis.setTimeout, originalTimeout)
    assert.equal(callbackRan, false)
    originalLog(
      JSON.stringify({
        mode,
        failedBodyPreserved: true,
        restoredDate: true,
        restoredTimeout: true,
        callbackRan,
      })
    )
    assert.throws(() => retained(1), /Browser Mode API access requires/)
    assert.equal(late.length, 1)
  } finally {
    console.log = originalLog
    try {
      if (activeHandle) await finish(active, activeHandle, true)
      if (collectionHandle) await finish(collection, collectionHandle)
    } finally {
      try {
        await runtime?.finishFile()
      } finally {
        runtime = undefined
        for (const scope of scopes) scope.boundary.close()
        await rm(directory, { recursive: true, force: true })
      }
    }
  }
})
