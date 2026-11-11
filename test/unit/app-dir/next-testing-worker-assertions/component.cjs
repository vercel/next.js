const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const consumer = fs.realpathSync(process.argv[2])
const load = createRequire(path.join(consumer, 'package.json'))
const runner = load('next/dist/experimental/testing/runner')
const { expect, chai } = load('next/dist/experimental/testing/vitest')
const { SnapshotClient } = load('next/dist/experimental/testing/primitives')
const directory = fs.mkdtempSync(
  path.join(consumer, '.next-worker-assertion-controls-')
)
const rows = []
const lateErrors = []
let sequence = 0
const options = () => ({
  runId: 'worker-assertions',
  signal: new AbortController().signal,
})
function file(extra = {}) {
  const filePath = path.join(directory, 'suite-' + sequence++ + '.test.mjs')
  fs.writeFileSync(filePath, '// real worker assertion owner control\n')
  return runner.initializeTestFile({
    fileId: filePath,
    filePath,
    publicTaskSelection: true,
    resourceLifetime: 'file',
    updateSnapshots: false,
    ...extra,
  })
}
async function check(name, action) {
  await action()
  rows.push({ name, passed: true })
}
async function run() {
  await check(
    'actual first and last case counters share a real worker assertion owner',
    async () => {
      const owned = file(),
        trace = []
      let setupTask, cleanupTask, firstTask
      const record = (phase) => {
        const state = expect.getState()
        trace.push([phase, state.currentTestName, state.assertionCalls])
      }
      await owned.collect(() => {
        const test = owned.api.test.extend({
          value: [
            async ({}, use) => {
              record('setup-before')
              const assertion = expect(1)
              setupTask = chai.util.flag(assertion, 'vitest-test')
              assertion.toBe(1)
              record('setup-after')
              await use('worker')
              record('cleanup-before')
              const cleanup = expect(1)
              cleanupTask = chai.util.flag(cleanup, 'vitest-test')
              cleanup.toBe(1)
              record('cleanup-after')
            },
            { scope: 'worker' },
          ],
        })
        for (const name of ['first', 'second'])
          test(name, ({ value, task }) => {
            if (name === 'first') firstTask = task
            record(name + '-before')
            expect(value).toBe('worker')
            record(name + '-after')
          })
      })
      const result = await owned.run(options())
      assert.deepEqual(
        result.cases.map((test) => test.status),
        ['passed', 'passed']
      )
      assert.deepEqual(result.errors, [])
      await owned.dispose()
      assert.equal(setupTask, firstTask)
      assert.equal(cleanupTask, undefined)
      assert.deepEqual(trace, [
        ['setup-before', 'first', 0],
        ['setup-after', 'first', 1],
        ['first-before', 'first', 1],
        ['first-after', 'first', 2],
        ['second-before', 'second', 0],
        ['second-after', 'second', 1],
        ['cleanup-before', 'second', 1],
        ['cleanup-after', 'second', 2],
      ])
    }
  )
  await check(
    'private workers never publish their bookkeeping task as a real Test',
    async () => {
      const owned = file({ publicTaskSelection: undefined })
      let setupTask, cleanupTask, bodyTask, actualTask
      await owned.collect(() => {
        const test = owned.api.test.extend({
          value: [
            async ({}, use) => {
              const assertion = expect(1)
              setupTask = chai.util.flag(assertion, 'vitest-test')
              assertion.toBe(1)
              await use(1)
              const cleanup = expect(1)
              cleanupTask = chai.util.flag(cleanup, 'vitest-test')
              cleanup.toBe(1)
            },
            { scope: 'worker' },
          ],
        })
        test('private', ({ value, task }) => {
          actualTask = task
          const assertion = expect(value)
          bodyTask = chai.util.flag(assertion, 'vitest-test')
          assertion.toBe(1)
        })
      })
      const result = await owned.run(options())
      assert.equal(result.cases[0].status, 'passed')
      assert.deepEqual(result.errors, [])
      await owned.dispose()
      assert.equal(setupTask, undefined)
      assert.equal(cleanupTask, undefined)
      assert.equal(bodyTask, actualTask)
    }
  )
  await check(
    'failed hard worker setup retains its actual errors and retries the cache entry',
    async () => {
      const owned = file(),
        errors = [],
        starts = []
      await owned.collect(() => {
        const test = owned.api.test.extend({
          value: [
            async ({}, use) => {
              starts.push([
                expect.getState().currentTestName,
                expect.getState().assertionCalls,
              ])
              try {
                expect(1).toBe(2)
              } catch (error) {
                errors.push(error)
                throw error
              }
              await use('unreachable')
            },
            { scope: 'worker' },
          ],
        })
        test('first', ({ value }) => value)
        test('second', ({ value }) => value)
      })
      const result = await owned.run(options())
      assert.deepEqual(
        result.cases.map((test) => test.status),
        ['failed', 'failed']
      )
      assert.deepEqual(starts, [
        ['first', 0],
        ['second', 0],
      ])
      assert.equal(errors.length, 2)
      result.cases.forEach((test, index) =>
        assert.equal(test.errors[0].error, errors[index])
      )
      await owned.dispose()
    }
  )
  await check(
    'worker cleanup drains and retains the original Error object and fields',
    async () => {
      const owned = file(),
        raw = new Error('actual worker cleanup'),
        fields = Object.getOwnPropertyDescriptors(raw),
        trace = []
      await owned.collect(() => {
        const test = owned.api.test.extend({
          outer: [
            async ({}, use) => {
              await use(1)
              trace.push('outer')
            },
            { scope: 'worker' },
          ],
          inner: [
            async ({ outer }, use) => {
              await use(outer)
              trace.push('inner')
              throw raw
            },
            { scope: 'worker' },
          ],
        })
        test('first', ({ inner }) => expect(inner).toBe(1))
      })
      const result = await owned.run(options())
      assert.equal(result.cases[0].status, 'passed')
      await assert.rejects(owned.dispose(), (error) => error === raw)
      assert.deepEqual(trace, ['inner', 'outer'])
      assert.deepEqual(Object.getOwnPropertyDescriptors(raw), fields)
      assert.equal(owned.canPublishSnapshots(), false)
    }
  )
  await check(
    'closed worker continuations retain their first file origin during another case',
    async () => {
      const first = file(),
        late = []
      let release, continuation
      const gate = new Promise((resolve) => {
        release = resolve
      })
      await first.collect(() => {
        const test = first.api.test.extend({
          value: [
            async ({}, use) => {
              continuation = gate.then(() => {
                try {
                  expect.getState()
                } catch (error) {
                  late.push(error)
                  return error
                }
              })
              await use(1)
            },
            { scope: 'worker' },
          ],
        })
        test('old', ({ value }) => expect(value).toBe(1))
      })
      await first.run({
        ...options(),
        onLateFailure: (error) => lateErrors.push(error),
      })
      await first.dispose()
      const second = file()
      await second.collect(() =>
        second.api.test('new', async ({ expect: local }) => {
          const before = local.getState().assertionCalls
          release()
          const error = await continuation
          assert.match(error.message, /closed worker-fixtures scope/)
          assert.equal(local.getState().assertionCalls, before)
          local(1).toBe(1)
        })
      )
      const result = await second.run(options())
      assert.equal(result.cases[0].status, 'passed')
      assert.equal(late.length, 1)
      assert.equal(lateErrors.length, 1)
      assert.equal(lateErrors[0], late[0])
      await second.dispose()
    }
  )
  await check(
    'read-only SDK finish stays before root and assertion-free worker cleanup',
    async () => {
      const trace = [],
        descriptor = Object.getOwnPropertyDescriptor(
          SnapshotClient.prototype,
          'finish'
        )
      Object.defineProperty(SnapshotClient.prototype, 'finish', {
        ...descriptor,
        value: function (...args) {
          trace.push('finish')
          return Reflect.apply(descriptor.value, this, args)
        },
      })
      const owned = file({
        finishReadOnlySnapshots: true,
        snapshotBodyFailures: true,
        snapshotUpdateMode: 'none',
      })
      try {
        await owned.collect(() => {
          const test = owned.api.test.extend({
            value: [
              async ({}, use) => {
                await use(1)
                trace.push('worker-cleanup')
              },
              { scope: 'worker' },
            ],
          })
          test('first', ({ value }) => expect(value).toBe(1))
        })
        const result = await owned.run({
          ...options(),
          onSuiteEnd(suite) {
            trace.push('root')
          },
        })
        assert.equal(result.cases[0].status, 'passed')
        assert.deepEqual(result.errors, [])
        assert.deepEqual(trace, ['finish', 'root'])
        await owned.dispose()
        assert.deepEqual(trace, ['finish', 'root', 'worker-cleanup'])
      } finally {
        Object.defineProperty(SnapshotClient.prototype, 'finish', descriptor)
      }
    }
  )
  await check(
    'failed worker cleanup still vetoes actual staged snapshot publication',
    async () => {
      const owned = file({ updateSnapshots: true, snapshotUpdateMode: 'all' }),
        raw = new Error('snapshot worker cleanup')
      await owned.collect(() => {
        const test = owned.api.test.extend({
          value: [
            async ({}, use) => {
              await use(1)
              throw raw
            },
            { scope: 'worker' },
          ],
        })
        test('first', ({ value }) => expect(value).toMatchSnapshot())
      })
      const result = await owned.run(options())
      assert.equal(result.cases[0].status, 'passed')
      await assert.rejects(owned.dispose(), (error) => error === raw)
      assert.equal(owned.canPublishSnapshots(), false)
      assert.equal(
        fs.existsSync(
          path.join(
            directory,
            '__snapshots__',
            path.basename(owned.filePath) + '.snap'
          )
        ),
        false
      )
    }
  )
  await check(
    'hook-first worker assertions keep the real resource without a fabricated Test',
    async () => {
      const owned = file(),
        states = []
      let setupTask, cleanupTask
      await owned.collect(() => {
        const test = owned.api.test.extend({
          value: [
            async ({}, use) => {
              const state = expect.getState()
              states.push([state.currentTestName, state.assertionCalls])
              const assertion = expect(1)
              setupTask = chai.util.flag(assertion, 'vitest-test')
              assertion.toBe(1)
              await use(1)
              const cleanup = expect(1)
              cleanupTask = chai.util.flag(cleanup, 'vitest-test')
              cleanup.toBe(1)
            },
            { scope: 'worker' },
          ],
        })
        test.beforeAll(({ value }) => value)
        test('first', ({ value }) => {
          const state = expect.getState()
          states.push([state.currentTestName, state.assertionCalls])
          expect(value).toBe(1)
        })
      })
      const result = await owned.run(options())
      assert.equal(result.cases[0].status, 'passed')
      assert.deepEqual(result.errors, [])
      await owned.dispose()
      assert.deepEqual(states, [
        [undefined, 0],
        ['first', 0],
      ])
      assert.equal(setupTask, undefined)
      assert.equal(cleanupTask, undefined)
    }
  )
}
run().then(
  () => {
    fs.rmSync(directory, { recursive: true, force: true })
    console.log(
      JSON.stringify({
        controls: rows.length,
        allPassed: true,
        rows,
        componentOnlyNotPublicQualification: true,
      })
    )
  },
  (error) => {
    console.error(error)
    console.error('Evidence fixture retained at ' + directory)
    process.exitCode = 1
  }
)
