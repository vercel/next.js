const assert = require('node:assert/strict')
const { it } = require('node:test')
const { mkdtemp, readFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { runInThisContext } = require('node:vm')
const pristine = require('./browser-fake-timers-pristine.json')
const mode = process.argv[2]
assert.ok(
  mode === 'node' ||
    mode === 'browser' ||
    mode === 'browser-late' ||
    mode === 'browser-project' ||
    mode === 'browser-runtime-config' ||
    mode.startsWith('browser-reset-config-')
)

if (
  mode === 'browser' ||
  mode === 'browser-late' ||
  mode === 'browser-project' ||
  mode === 'browser-runtime-config' ||
  mode.startsWith('browser-reset-config-')
) {
  require('./browser-fake-timers-backend.cjs')
} else {
  if (mode === 'browser') {
    // Use the genuine built Browser primitive once in this fresh process. All
    // shared assertion imports see that same exports object, as in native output.
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
    const nodeClock = require.resolve(
      'next/dist/experimental/testing/assertions/fake-timers'
    )
    const browserClock = require('next/dist/experimental/testing/client/fake-timers')
    require.cache[nodeClock] = {
      id: nodeClock,
      filename: nodeClock,
      loaded: true,
      exports: browserClock,
    }
  }

  const runner = require('next/dist/experimental/testing/runner')
  const common = require('next/dist/experimental/testing/vitest')
  const client =
    mode === 'browser'
      ? require('next/dist/experimental/testing/client/async-context')
      : undefined
  const browser =
    mode === 'browser'
      ? require('next/dist/experimental/testing/client/vitest')
      : undefined
  const nodeContext = require('next/dist/experimental/testing/runner/async-context')

  it(`preserves the six literal fake-clock subjects in the ${mode} component`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `next-${mode}-fake-clock-`))
    const originalDate = globalThis.Date
    const originalTimeout = globalThis.setTimeout
    const rows = []
    const definitions = []
    const hooks = []
    const late = []
    const originalLog = console.log
    let file, collection, retained
    const inBrowserScope = async (kind, context, fn) => {
      const scope = client.createAsyncScope({ kind, context }, (error) =>
        late.push(error)
      )
      const token = scope.run(() => client.captureCreatorScope())
      const leave = client.enterCreatorScope(token)
      try {
        return await fn()
      } finally {
        leave()
        scope.close()
      }
    }
    try {
      console.log = (...args) => {
        if (
          typeof args[0] === 'string' &&
          args[0].startsWith('BROWSER_FAKE_TIMERS_RAW ')
        )
          rows.push(
            JSON.parse(args[0].slice('BROWSER_FAKE_TIMERS_RAW '.length))
          )
        Reflect.apply(originalLog, console, args)
      }
      file = runner.initializeTestFile({
        fileId: `fake-clock-${mode}`,
        filePath: join(directory, 'subject.mjs'),
        resourceLifetime: 'file',
      })
      const source = await readFile(
        join(__dirname, 'browser-fake-timers-contract.mjs.txt'),
        'utf8'
      )
      const [imports, ...lines] = source.split('\n')
      assert.equal(
        imports,
        "import { afterAll, expect, test, vi } from 'vitest'"
      )
      await file.collect(async () => {
        const install = () => {
          const vi = browser?.vi ?? common.vi
          const expect = browser?.expect ?? common.expect
          if (browser) {
            retained = vi.advanceTimersByTime
            assert.equal(retained, vi.advanceTimersByTime)
            assert.equal(
              vi.advanceTimersByTimeAsync,
              vi.advanceTimersByTimeAsync
            )
            assert.equal(Reflect.get(vi, 'then'), undefined)
            assert.equal(typeof vi.stubEnv, 'function')
            assert.equal(vi.stubEnv, vi.stubEnv)
          }
          const test = (name, body) => definitions.push({ name, body })
          const afterAll = (body) => hooks.push(body)
          runInThisContext(
            `(function(afterAll, expect, test, vi) {\n"use strict";\n${lines.join('\n')}\n})`,
            {
              filename: 'browser-fake-timers-contract.mjs.txt',
            }
          )(afterAll, expect, test, vi)
        }
        if (browser) {
          const context = nodeContext.getOriginatingCollection()
          assert.ok(context)
          collection = client.createAsyncScope(
            { kind: 'collection', context },
            (error) => late.push(error)
          )
          collection.run(install)
          for (const definition of definitions) {
            common.test(definition.name, () => {
              const owner = runner.getActiveAttempt()
              assert.ok(owner)
              return inBrowserScope('attempt', owner, definition.body)
            })
          }
          common.afterAll(() => {
            const hook = nodeContext.getOriginatingHook()
            assert.ok(hook)
            return inBrowserScope('hook', hook, async () => {
              for (const callback of hooks) await callback()
            })
          })
        } else {
          install()
          // This is an algorithm regression under one genuine Node test scope;
          // Browser-style serial persistence is not claimed for Node lifetimes.
          common.test(
            'six literal clock algorithms in one actual Node scope',
            async () => {
              for (const definition of definitions) await definition.body()
              for (const callback of hooks) await callback()
            }
          )
        }
      })
      collection?.close()
      const result = await file.run({
        runId: `fake-clock-${mode}`,
        signal: new AbortController().signal,
      })
      originalLog(
        JSON.stringify({
          mode,
          actualCases: result.cases,
          actualRows: rows,
          completePristineRows: pristine.rows,
        })
      )
      assert.deepEqual(result.errors, [])
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        Array(mode === 'browser' ? 6 : 1).fill('passed')
      )
      if (mode === 'browser')
        assert.deepEqual(
          result.cases.map((entry) => entry.name),
          pristine.cases.map((entry) => entry.name)
        )
      assert.deepEqual(rows, pristine.rows)
      assert.deepEqual(late, [])
      assert.equal(globalThis.Date, originalDate)
      assert.equal(globalThis.setTimeout, originalTimeout)
      if (browser) {
        assert.throws(() => retained(1), /Browser Mode API access requires/)
        assert.equal(late.length, 1)
      }
    } finally {
      console.log = originalLog
      try {
        await file?.dispose()
      } finally {
        collection?.close()
        await rm(directory, { recursive: true, force: true })
        assert.equal(globalThis.Date, originalDate)
        assert.equal(globalThis.setTimeout, originalTimeout)
      }
    }
  })

  if (mode === 'browser')
    it('restores genuine globals when a body throws with a pending fake timeout', async () => {
      const directory = await mkdtemp(
        join(tmpdir(), 'next-browser-fake-cleanup-')
      )
      const originalDate = globalThis.Date
      const originalTimeout = globalThis.setTimeout
      const bodyError = new Error('actual fake-clock body failure')
      let callbackRan = false
      let file
      try {
        file = runner.initializeTestFile({
          fileId: 'fake-cleanup',
          filePath: join(directory, 'subject.mjs'),
          resourceLifetime: 'file',
        })
        await file.collect(async () => {
          common.test('actual clock body failure', () => {
            common.vi.useFakeTimers({ now: 5000 })
            setTimeout(() => {
              callbackRan = true
            }, 20)
            assert.equal(common.vi.getTimerCount(), 1)
            throw bodyError
          })
        })
        const result = await file.run({
          runId: 'fake-cleanup',
          signal: new AbortController().signal,
        })
        assert.deepEqual(
          result.cases.map((entry) => entry.status),
          ['failed']
        )
        assert.ok(
          result.cases[0].errors.some((failure) => failure.error === bodyError)
        )
        assert.notEqual(globalThis.Date, originalDate)
        await file.dispose()
        file = undefined
        assert.equal(globalThis.Date, originalDate)
        assert.equal(globalThis.setTimeout, originalTimeout)
        assert.equal(callbackRan, false)
        console.log(
          JSON.stringify({
            mode,
            failedBodyPreserved: true,
            restoredDate: true,
            restoredTimeout: true,
            callbackRan,
          })
        )
      } finally {
        try {
          await file?.dispose()
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
      }
    })
}
