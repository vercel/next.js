const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module')
const consumer = path.resolve(
  process.argv[2] || path.join(__dirname, '../../..')
)
const load = Module.createRequire(path.join(consumer, 'package.json'))
const api = load('next/dist/experimental/testing/runner/fixtures')
const close = async (callbacks) => {
  while (callbacks.length) await callbacks.pop()()
}
async function run(api) {
  const rows = []
  async function check(name, fn) {
    try {
      await fn()
      rows.push({ name, passed: true })
    } catch (error) {
      rows.push({
        name,
        passed: false,
        error: { name: error.name, message: error.message },
      })
    }
  }
  await check(
    'actual shared fixture context carries live setup body and cleanup values',
    async () => {
      const context = { task: { name: 'actual-task' } }
      const worker = api.createFixtureWorker()
      const file = api.createFixtureFile((fn) => fn(), worker)
      let setup, cleanup, derived
      const definitions = api.extendFixtures(Object.create(null), {
        primary: async function ({ task }, use) {
          setup = arguments[0]
          setup.setup = 'setup'
          await use({ task, context: setup })
          cleanup = { body: setup.body, after: setup.after }
        },
        derived: async function ({ primary }, use) {
          derived = arguments[0]
          await use({ context: derived, primary })
        },
      })
      const attempt = file.attempt(definitions, context, undefined, true)
      await attempt.invoke(function ({ primary, derived }) {
        const actual = arguments[0]
        assert.equal(primary.context, actual)
        assert.equal(derived.context, actual)
        assert.equal(actual.setup, 'setup')
        actual.body = 'body'
        actual.after = 'after'
      })
      await close(attempt.cleanups)
      assert.equal(setup, context)
      assert.equal(derived, context)
      assert.deepEqual(cleanup, { body: 'body', after: 'after' })
      await worker.dispose()
    }
  )
  await check(
    'builtin getters are read only by authored fixture and body parameters',
    async () => {
      let reads = 0,
        expectReads = 0
      const task = { name: 'task' },
        context = {}
      Object.defineProperties(context, {
        task: {
          get() {
            reads++
            return task
          },
          configurable: false,
          enumerable: true,
        },
        expect: {
          get() {
            expectReads++
            throw Error('eager expect read')
          },
          configurable: false,
          enumerable: true,
        },
      })
      const worker = api.createFixtureWorker(),
        file = api.createFixtureFile((fn) => fn(), worker)
      let captured
      const definitions = api.extendFixtures(Object.create(null), {
        value: async function ({ task }, use) {
          captured = arguments[0]
          await use(task)
        },
      })
      const attempt = file.attempt(definitions, context, undefined, true)
      await attempt.invoke(function ({ value, task }) {
        assert.equal(value, task)
      })
      assert.equal(captured, context)
      assert.equal(reads, 2)
      assert.equal(expectReads, 0)
      assert.equal(
        Object.getOwnPropertyDescriptor(context, 'task').configurable,
        false
      )
      await close(attempt.cleanups)
      await worker.dispose()
    }
  )
  await check(
    'same-name parent fixture publishes parent before child and child remains live in cleanup',
    async () => {
      const context = {},
        worker = api.createFixtureWorker(),
        file = api.createFixtureFile((fn) => fn(), worker),
        trace = []
      const base = api.extendFixtures(Object.create(null), {
        value: async function ({}, use) {
          const ctx = arguments[0]
          await use(1)
          trace.push(['base', ctx.value])
        },
      })
      const definitions = api.extendFixtures(
        base,
        {
          value: async function ({ value }, use) {
            const ctx = arguments[0]
            trace.push(['child', value, ctx.value])
            await use(value + 1)
            trace.push(['child-cleanup', ctx.value])
          },
        },
        true
      )
      const attempt = file.attempt(definitions, context, undefined, true)
      await attempt.invoke(function ({ value }) {
        assert.equal(value, 2)
      })
      await close(attempt.cleanups)
      assert.deepEqual(trace, [
        ['child', 1, 1],
        ['child-cleanup', 2],
        ['base', 2],
      ])
      await worker.dispose()
    }
  )
  await check(
    'automatic test fixture uses the real context before body setup',
    async () => {
      const context = {},
        worker = api.createFixtureWorker(),
        file = api.createFixtureFile((fn) => fn(), worker)
      let captured
      const definitions = api.extendFixtures(Object.create(null), {
        auto: [
          async function ({}, use) {
            captured = arguments[0]
            captured.mark = 'auto'
            await use(9)
          },
          { auto: true },
        ],
      })
      const attempt = file.attempt(definitions, context, undefined, true)
      await attempt.invoke(function ({}) {
        assert.equal(arguments[0], captured)
        assert.equal(arguments[0].mark, 'auto')
        assert.equal(arguments[0].auto, 9)
      })
      await close(attempt.cleanups)
      await worker.dispose()
    }
  )
  await check(
    'independent attempts retain distinct actual public contexts',
    async () => {
      const worker = api.createFixtureWorker(),
        file = api.createFixtureFile((fn) => fn(), worker),
        contexts = []
      const definitions = api.extendFixtures(Object.create(null), {
        value: async function ({}, use) {
          contexts.push(arguments[0])
          await use(1)
        },
      })
      for (let i = 0; i < 2; i++) {
        const context = { index: i }
        const attempt = file.attempt(definitions, context, undefined, true)
        await attempt.invoke(function ({ value }) {
          assert.equal(arguments[0], contexts[i])
          assert.equal(value, 1)
        })
        await close(attempt.cleanups)
      }
      assert.notEqual(contexts[0], contexts[1])
      await worker.dispose()
    }
  )
  await check(
    'private legacy clone path stays separate from fixture dependency bag',
    async () => {
      const context = { task: { name: 'task' } },
        worker = api.createFixtureWorker(),
        file = api.createFixtureFile((fn) => fn(), worker)
      let captured, body
      const definitions = api.extendFixtures(Object.create(null), {
        value: async function ({ task }, use) {
          captured = arguments[0]
          await use(task)
        },
      })
      const attempt = file.attempt(definitions, context)
      await attempt.invoke(function ({ value }) {
        body = arguments[0]
        assert.equal(value, context.task)
      })
      assert.notEqual(captured, context)
      assert.notEqual(body, context)
      assert.notEqual(body, captured)
      await close(attempt.cleanups)
      await worker.dispose()
    }
  )
  await check(
    'file-scoped fixture dependency context remains unchanged',
    async () => {
      const context = {},
        worker = api.createFixtureWorker(),
        file = api.createFixtureFile((fn) => fn(), worker)
      let captured
      const definitions = api.extendFixtures(Object.create(null), {
        value: [
          async function ({}, use) {
            captured = arguments[0]
            await use(1)
          },
          { scope: 'file' },
        ],
      })
      const attempt = file.attempt(definitions, context, undefined, true)
      await attempt.invoke(function ({ value }) {
        assert.equal(value, 1)
      })
      assert.notEqual(captured, context)
      assert.deepEqual(Object.keys(captured), [])
      await close(attempt.cleanups)
      await close(file.cleanups)
      await worker.dispose()
    }
  )
  await check(
    'a real throwing builtin getter preserves error identity and one read',
    async () => {
      const failure = Error('actual getter'),
        context = {}
      let reads = 0
      Object.defineProperty(context, 'task', {
        get() {
          reads++
          throw failure
        },
        configurable: false,
      })
      const worker = api.createFixtureWorker(),
        file = api.createFixtureFile((fn) => fn(), worker)
      const definitions = api.extendFixtures(Object.create(null), {
        value: async function ({ task }, use) {
          await use(task)
        },
      })
      const attempt = file.attempt(definitions, context, undefined, true)
      await assert.rejects(
        attempt.invoke(function ({ value }) {}),
        (error) => error === failure
      )
      assert.equal(reads, 1)
      assert.equal(attempt.cleanups.length, 0)
      await worker.dispose()
    }
  )
  return rows
}
;(async () => {
  const rows = await run(api)
  for (const row of rows) assert(row.passed, row.error?.message)
  console.log(
    JSON.stringify({
      runtime: process.version,
      controls: rows.length,
      allPassed: true,
      componentOnlyNotPublicQualification: true,
    })
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
