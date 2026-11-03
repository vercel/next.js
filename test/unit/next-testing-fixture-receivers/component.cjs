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
  for (const scope of ['test', 'file', 'worker'])
    await check(
      'strict async ' +
        scope +
        ' factory keeps undefined receiver through actual cleanup',
      async () => {
        const receiver = [],
          worker = api.createFixtureWorker(),
          file = api.createFixtureFile((fn) => fn(), worker),
          definitions = api.extendFixtures(Object.create(null), {
            value: [
              async function ({}, use) {
                receiver.push(this)
                await use(1)
                receiver.push(this)
              },
              { scope },
            ],
          })
        const attempt = file.attempt(definitions, {}, undefined, true)
        await attempt.invoke(function ({ value }) {
          assert.equal(value, 1)
        })
        await close(attempt.cleanups)
        await close(file.cleanups)
        await worker.dispose()
        assert.deepEqual(receiver, [undefined, undefined])
      }
    )
  await check(
    'strict normal Promise-returning factory preserves actual continuation',
    async () => {
      const receiver = [],
        worker = api.createFixtureWorker(),
        file = api.createFixtureFile((fn) => fn(), worker),
        definitions = api.extendFixtures(Object.create(null), {
          value: function ({}, use) {
            receiver.push(this)
            return use(2).then(() => receiver.push(this))
          },
        })
      const attempt = file.attempt(definitions, {}, undefined, true)
      await attempt.invoke(function ({ value }) {
        assert.equal(value, 2)
      })
      await close(attempt.cleanups)
      await worker.dispose()
      assert.deepEqual(receiver, [undefined, undefined])
    }
  )
  await check('automatic strict factory keeps undefined receiver', async () => {
    const receiver = [],
      worker = api.createFixtureWorker(),
      file = api.createFixtureFile((fn) => fn(), worker),
      definitions = api.extendFixtures(Object.create(null), {
        value: [
          async function ({}, use) {
            receiver.push(this)
            await use(3)
            receiver.push(this)
          },
          { auto: true },
        ],
      })
    const attempt = file.attempt(definitions, {}, undefined, true)
    await attempt.invoke(function ({}) {})
    await close(attempt.cleanups)
    await worker.dispose()
    assert.deepEqual(receiver, [undefined, undefined])
  })
  await check(
    'sloppy function keeps actual ordinary-call global receiver',
    async () => {
      const receiver = [],
        factory = Function(
          'receiver',
          'return async function ({},use) {receiver.push(this); await use(4); receiver.push(this)}'
        )(receiver),
        worker = api.createFixtureWorker(),
        file = api.createFixtureFile((fn) => fn(), worker),
        definitions = api.extendFixtures(Object.create(null), {
          value: factory,
        })
      const attempt = file.attempt(definitions, {}, undefined, true)
      await attempt.invoke(function ({ value }) {
        assert.equal(value, 4)
      })
      await close(attempt.cleanups)
      await worker.dispose()
      assert.deepEqual(receiver, [globalThis, globalThis])
    }
  )
  await check(
    'lexical arrow receiver remains its actual creator receiver',
    async () => {
      const receiver = [],
        owner = {},
        factory = function () {
          return async ({}, use) => {
            receiver.push(this)
            await use(5)
            receiver.push(this)
          }
        }.call(owner),
        worker = api.createFixtureWorker(),
        file = api.createFixtureFile((fn) => fn(), worker),
        definitions = api.extendFixtures(Object.create(null), {
          value: factory,
        })
      const attempt = file.attempt(definitions, {}, undefined, true)
      await attempt.invoke(function ({ value }) {
        assert.equal(value, 5)
      })
      await close(attempt.cleanups)
      await worker.dispose()
      assert.deepEqual(receiver, [owner, owner])
    }
  )
  await check(
    'original strict setup failure identity and no-use cleanup remain actual',
    async () => {
      const failure = Error('actual fixture setup'),
        worker = api.createFixtureWorker(),
        file = api.createFixtureFile((fn) => fn(), worker),
        definitions = api.extendFixtures(Object.create(null), {
          value: function ({}, use) {
            assert.equal(this, undefined)
            throw failure
          },
        })
      const attempt = file.attempt(definitions, {}, undefined, true)
      await assert.rejects(
        attempt.invoke(function ({ value }) {}),
        (error) => error === failure
      )
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
