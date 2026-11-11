const assert = require('node:assert/strict')
const { it } = require('node:test')
const { mkdtemp, readFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { runInThisContext } = require('node:vm')
const pristine = require('./browser-real-waits-pristine.json')
const mode = process.argv[2]

if (mode === 'node') {
  it('runs six literal wait callback algorithms in one genuine Node scope', async () => {
    const {
      initializeTestFile,
    } = require('next/dist/experimental/testing/runner')
    const common = require('next/dist/experimental/testing/vitest')
    const directory = await mkdtemp(join(tmpdir(), 'next-node-real-waits-'))
    let file
    const original = console.log
    const rows = {}
    const definitions = []
    const completed = []
    console.log = (...args) => {
      if (
        typeof args[0] === 'string' &&
        args[0].startsWith('BROWSER_WAITS_RAW ')
      ) {
        const entry = JSON.parse(args[0].slice('BROWSER_WAITS_RAW '.length))
        rows[entry.case] = entry.raw
      }
      Reflect.apply(original, console, args)
    }
    try {
      file = initializeTestFile({
        fileId: 'real-waits-node',
        filePath: join(directory, 'subject.mjs'),
      })
      const [imports, ...body] = (
        await readFile(
          join(__dirname, 'browser-real-waits-contract.mjs.txt'),
          'utf8'
        )
      ).split('\n')
      assert.equal(imports, "import { expect, test, vi } from 'vitest'")
      await file.collect(async () => {
        runInThisContext(
          `(function(expect, test, vi) {\n"use strict";\n${body.join('\n')}\n})`,
          { filename: 'browser-real-waits-contract.mjs.txt' }
        )(
          common.expect,
          (name, body) => definitions.push({ name, body }),
          common.vi
        )
        // Node assertion lifetime remains test-scoped. These Browser-authored
        // callback algorithms run in one actual Node test so their original
        // scheduled follow-ups do not request Browser lifetime in Node.
        common.test('six literal real-wait callback algorithms', async () => {
          for (const definition of definitions) {
            await definition.body()
            completed.push(definition.name)
          }
        })
      })
      const result = await file.run({
        runId: 'node-real-waits',
        signal: new AbortController().signal,
      })
      console.log(
        JSON.stringify({
          mode,
          actualCases: result.cases,
          actualRows: rows,
          completed,
        })
      )
      assert.deepEqual(completed, [
        'Browser real waits preserve immediate values and detached calls',
        'Browser real waits distinguish retrying throws from falsy values',
        'Browser real waits serialize pending async callbacks',
        'Browser real wait errors retain identity and synchronous rejection scheduling',
        'Browser real waits retain numeric timeout and falsy rejection diagnostics',
        'Browser real waits preserve synchronous thenable callback scheduling',
      ])
      assert.deepEqual(
        result.cases.map((test) => test.status),
        ['passed']
      )
      assert.deepEqual(result.errors, [])
      assert.deepEqual(
        rows,
        Object.fromEntries(
          [
            'immediate',
            'retry',
            'async',
            'errors',
            'timeouts',
            'thenables',
          ].map((key) => [key, pristine[key]])
        )
      )
    } finally {
      console.log = original
      try {
        await file?.dispose()
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  })
} else if (mode === 'browser') {
  // A fresh Node component selects the same real assertion-platform export
  // object as the native Browser map. It tests those APIs/frames, not native
  // code generation, Chromium or an actual Next CLI file lifecycle.
  const platform = require.resolve(
    'next/dist/experimental/testing/assertions/assertion-platform'
  )
  assert.equal(require(platform).fileAssertionLifetime, false)
  const client = require('next/dist/experimental/testing/client/async-context')
  const browserPlatform = require('next/dist/experimental/testing/client/assertion-platform')
  require.cache[platform] = {
    ...require.cache[platform],
    exports: browserPlatform,
  }
  const {
    createAssertionRuntime,
  } = require('next/dist/experimental/testing/assertions')
  const {
    createTimerWaits,
  } = require('next/dist/experimental/testing/assertions/wait')
  const { chai } = require('next/dist/compiled/next-test-primitives')

  it('uses actual Browser file assertions, live common state and explicit local state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'next-browser-real-waits-'))
    const late = []
    const rows = {}
    let runtime
    const scope = (kind, name, testId = name) => {
      const context = {
        id: name,
        fileId: 'file',
        name,
        ...(kind === 'attempt'
          ? { testId }
          : kind === 'hook'
            ? { hook: name === 'around' ? 'aroundAll' : 'afterAll' }
            : {}),
      }
      const boundary = client.createAsyncScope({ kind, context }, (error) =>
        late.push(error)
      )
      const token = boundary.run(() => client.captureCreatorScope())
      return { context, boundary, token }
    }
    const frame = async (owner, run) => {
      const leave = client.enterCreatorScope(owner.token)
      try {
        return await run()
      } finally {
        leave()
      }
    }
    const finish = async (owner, handle) => {
      await frame(owner, async () => {
        if (owner.context.testId) await handle.finishTest(false)
        await handle.finalize()
        await handle.dispose()
      })
      owner.boundary.close()
    }
    const options = {
      testPath: join(directory, 'subject.mjs'),
      resourceLifetime: 'file',
      getCurrentAttempt: client.getOriginatingAttempt,
      getCurrentHook: client.getOriginatingHook,
      getCurrentCollection: client.getOriginatingCollection,
      getCurrentScopeAncestors: client.getOriginatingScopeAncestors,
    }
    let collection
    try {
      await assert.rejects(
        createAssertionRuntime(options),
        /assertion file is not available/
      )
      collection = scope('collection', 'file')
      runtime = await collection.boundary.run(() =>
        createAssertionRuntime(options)
      )
      const collected = collection.boundary.run(() =>
        runtime.beginCollection(collection.context)
      )
      await finish(collection, collected)

      const a = scope('attempt', 'pending assertion')
      const aHandle = a.boundary.run(() => runtime.beginAttempt(a.context))
      let ready = false
      let calls = 0
      let pending
      await frame(a, async () => {
        runtime.expect.assertions(1)
        pending = runtime.getRealTimerWaits().waitFor(
          () => {
            const leave = client.enterCreatorScope(a.token)
            try {
              calls++
              runtime.expect(ready).toBe(true)
              return 'assertion-afterAll'
            } finally {
              leave()
            }
          },
          { interval: 1, timeout: 1000 }
        )
        rows['assert-pending-before'] = {
          calls,
          assertionCalls: runtime.expect.getState().assertionCalls,
        }
      })
      await finish(a, aHandle)
      const hook = scope('hook', 'after pending')
      const hookHandle = hook.boundary.run(() =>
        runtime.beginHook(hook.context)
      )
      await frame(hook, async () => {
        const before = runtime.expect.getState().assertionCalls
        ready = true
        const value = await pending
        rows['assert-pending-after'] = {
          calls,
          before,
          after: runtime.expect.getState().assertionCalls,
          value,
        }
      })
      await finish(hook, hookHandle)

      const aName =
        'Browser ordinary timer holds an extracted common and context expectation'
      const bName =
        'Browser ordinary timer updates live common state and its held local state independently'
      const localOwner = scope('attempt', aName)
      const localHandle = localOwner.boundary.run(() =>
        runtime.beginAttempt(localOwner.context)
      )
      let local, release, observed
      await frame(localOwner, async () => {
        local = localHandle.expect
        local.assertions(1)
        local(true).toBe(true)
        const extracted = runtime.expect
        pending = new Promise((resolve) => {
          release = () =>
            setTimeout(() => {
              const leave = client.enterCreatorScope(localOwner.token)
              try {
                extracted('common').toBe('common')
                local('local').toBe('local')
                observed = {
                  common: extracted.getState().assertionCalls,
                  local: local.getState().assertionCalls,
                  commonName: extracted.getState().currentTestName,
                  localName: local.getState().currentTestName,
                }
                resolve('timer-during-B')
              } finally {
                leave()
              }
            }, 0)
        })
        rows['timer-overlap-before'] = {
          common: runtime.expect.getState().assertionCalls,
          local: local.getState().assertionCalls,
        }
      })
      await finish(localOwner, localHandle)
      const b = scope('attempt', bName)
      const bHandle = b.boundary.run(() => runtime.beginAttempt(b.context))
      await frame(b, async () => {
        runtime.expect.assertions(3)
        runtime.expect('B').toBe('B')
        const before = {
          common: runtime.expect.getState().assertionCalls,
          local: local.getState().assertionCalls,
        }
        release()
        const value = await pending
        rows['timer-overlap-complete'] = {
          before,
          value,
          result: observed,
          after: {
            common: runtime.expect.getState().assertionCalls,
            local: local.getState().assertionCalls,
          },
        }
        runtime.expect(value).toBe('timer-during-B')
      })
      await finish(b, bHandle)

      const around = scope('hook', 'around')
      const aroundHandle = around.boundary.run(() =>
        runtime.beginHook(around.context)
      )
      await frame(around, async () => {
        await aroundHandle.suspend(async () => {
          const child = scope(
            'attempt',
            'Browser aroundAll keeps common state after its completed child'
          )
          const handle = child.boundary.run(() =>
            runtime.beginAttempt(child.context)
          )
          await frame(child, async () => {
            runtime.expect.assertions(1)
            runtime.expect('child').toBe('child')
          })
          await finish(child, handle)
        })
        rows['around-after'] = {
          assertionCalls: runtime.expect.getState().assertionCalls,
          currentTestName: runtime.expect.getState().currentTestName ?? null,
        }
      })
      await finish(around, aroundHandle)

      let heldRetry
      for (const name of ['retry first', 'retry second']) {
        const retry = scope('attempt', name, 'same-test')
        const handle = retry.boundary.run(() =>
          runtime.beginAttempt(retry.context)
        )
        await frame(retry, async () => {
          const explicit = handle.expect
          heldRetry ??= explicit
          assert.equal(explicit, heldRetry)
          const wanted = name === 'retry first' ? 1 : 2
          explicit.assertions(wanted)
          const assertion = explicit('value')
          assert.equal(
            chai.util.flag(assertion, 'vitest-test').fullTestName,
            name
          )
          assertion.toBe('value')
        })
        await finish(retry, handle)
      }

      const retryHook = scope('hook', 'after retry')
      const retryHookHandle = retryHook.boundary.run(() =>
        runtime.beginHook(retryHook.context)
      )
      await frame(retryHook, async () => {
        const before = heldRetry.getState().assertionCalls
        const assertion = heldRetry('late')
        const task = chai.util.flag(assertion, 'vitest-test').fullTestName
        assertion.toBe('late')
        rows['retry-local-after'] = {
          before,
          after: heldRetry.getState().assertionCalls,
          task,
        }
      })
      await finish(retryHook, retryHookHandle)

      const unused = scope('attempt', 'unused waits')
      const unusedHandle = unused.boundary.run(() =>
        runtime.beginAttempt(unused.context)
      )
      const settlements = []
      await frame(unused, async () => {
        const waits = runtime.getRealTimerWaits()
        for (const pending of [
          waits.waitFor(() => new Promise(() => {}), 60000),
          waits.waitUntil(() => false, 60000),
        ])
          pending.then(
            () => settlements.push('resolved'),
            () => settlements.push('rejected')
          )
      })
      await finish(unused, unusedHandle)
      await runtime.finishFile()
      await new Promise((resolve) => setImmediate(resolve))
      console.log(JSON.stringify({ mode, actualRows: rows, settlements, late }))
      assert.deepEqual(settlements, [])
      assert.deepEqual(late, [])
      assert.deepEqual(rows, {
        ...Object.fromEntries(
          [
            'assert-pending-before',
            'assert-pending-after',
            'timer-overlap-before',
            'timer-overlap-complete',
            'around-after',
          ].map((key) => [key, pristine[key]])
        ),
        'retry-local-after': { before: 2, after: 3, task: 'retry second' },
      })
      const leave = client.enterCreatorScope(a.token)
      try {
        assert.throws(() => runtime.expect(1), /closed.*scope|disposed/)
      } finally {
        leave()
      }

      const cancelled = createTimerWaits(
        { isFakeTimers: () => false, advanceTimersByTime() {} },
        () => {}
      )
      const stopped = cancelled.waitFor(() => new Promise(() => {}), 60000)
      const rejection = assert.rejects(stopped, /cancelled during file cleanup/)
      cancelled.dispose()
      await rejection
    } finally {
      try {
        await runtime?.finishFile()
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  })
} else {
  throw new Error('Expected node or browser component mode')
}
