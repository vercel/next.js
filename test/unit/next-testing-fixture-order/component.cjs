'use strict'
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module')
const consumer = path.resolve(
  process.argv[2] || path.join(__dirname, '../../..')
)
const load = Module.createRequire(path.join(consumer, 'package.json'))
const api = load('next/dist/experimental/testing/runner/fixtures')
const close = async (c) => {
  while (c.length) await c.pop()()
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
  async function execute(definitions, body, context = {}) {
    const worker = api.createFixtureWorker(),
      file = api.createFixtureFile((fn) => fn(), worker),
      attempt = file.attempt(
        api.extendFixtures(Object.create(null), definitions),
        context,
        undefined,
        true
      )
    try {
      await attempt.invoke(body)
    } finally {
      await close(attempt.cleanups)
      await close(file.cleanups)
      await worker.dispose()
    }
  }
  await check(
    'used fixture declared before auto starts before auto',
    async () => {
      const trace = []
      await execute(
        {
          first: async function ({}, use) {
            trace.push('first')
            await use(1)
          },
          auto: [
            async function ({}, use) {
              trace.push('auto')
              await use(2)
            },
            { auto: true },
          ],
        },
        function ({ first }) {}
      )
      assert.deepEqual(trace, ['first', 'auto'])
    }
  )
  await check(
    'registration order wins over reverse callback parameter order',
    async () => {
      const trace = []
      await execute(
        {
          first: async function ({}, use) {
            trace.push('first')
            await use(1)
          },
          second: async function ({}, use) {
            trace.push('second')
            await use(2)
          },
        },
        function ({ second, first }) {}
      )
      assert.deepEqual(trace, ['first', 'second'])
    }
  )
  await check(
    'existing DFS dependencies still precede their real consumer',
    async () => {
      const trace = []
      await execute(
        {
          first: async function ({}, use) {
            trace.push('first')
            await use(1)
          },
          auto: [
            async function ({ later }, use) {
              trace.push('auto')
              await use(later)
            },
            { auto: true },
          ],
          later: async function ({}, use) {
            trace.push('later')
            await use(2)
          },
        },
        function ({ first }) {}
      )
      assert.deepEqual(trace, ['first', 'later', 'auto'])
    }
  )
  await check(
    'actual scoped requested registrations precede later auto',
    async () => {
      const trace = []
      await execute(
        {
          workerValue: [
            async function ({}, use) {
              trace.push('worker')
              await use(1)
            },
            { scope: 'worker' },
          ],
          fileValue: [
            async function ({}, use) {
              trace.push('file')
              await use(2)
            },
            { scope: 'file' },
          ],
          auto: [
            async function ({}, use) {
              trace.push('auto')
              await use(3)
            },
            { auto: true },
          ],
        },
        function ({ fileValue, workerValue }) {}
      )
      assert.deepEqual(trace, ['worker', 'file', 'auto'])
    }
  )
  await check('unused non-auto fixture is never started', async () => {
    const trace = []
    await execute(
      {
        unused: async function ({}, use) {
          trace.push('unused')
          await use(1)
        },
        used: async function ({}, use) {
          trace.push('used')
          await use(2)
        },
      },
      function ({ used }) {}
    )
    assert.deepEqual(trace, ['used'])
  })
  await check(
    'first actual setup failure retains identity and never starts later auto',
    async () => {
      const trace = [],
        failure = Error('first actual setup')
      await assert.rejects(
        execute(
          {
            first: function ({}, use) {
              trace.push('first')
              throw failure
            },
            auto: [
              async function ({}, use) {
                trace.push('auto')
                await use(2)
              },
              { auto: true },
            ],
          },
          function ({ first }) {}
        ),
        (e) => e === failure
      )
      assert.deepEqual(trace, ['first'])
    }
  )
  await check(
    'builtin getters stay owned by the actual parameter read',
    async () => {
      let reads = 0
      const context = {}
      Object.defineProperty(context, 'task', {
        get() {
          reads++
          return 1
        },
        configurable: false,
      })
      await execute(
        {
          value: async function ({}, use) {
            await use(2)
          },
        },
        function ({ task, value }) {
          assert.equal(task, 1)
          assert.equal(value, 2)
        },
        context
      )
      assert.equal(reads, 1)
    }
  )
  await check(
    'auto requested explicitly resolves once and keeps LIFO cleanup',
    async () => {
      const trace = []
      await execute(
        {
          first: async function ({}, use) {
            trace.push('first-in')
            await use(1)
            trace.push('first-out')
          },
          auto: [
            async function ({}, use) {
              trace.push('auto-in')
              await use(2)
              trace.push('auto-out')
            },
            { auto: true },
          ],
        },
        function ({ auto, first }) {
          trace.push('body')
        }
      )
      assert.deepEqual(trace, [
        'first-in',
        'auto-in',
        'body',
        'auto-out',
        'first-out',
      ])
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
