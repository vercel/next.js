import { test as check } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeTestFile } from 'next/dist/experimental/testing/runner'
import { commitSnapshotUpdates } from 'next/dist/experimental/testing/assertions/snapshots'
import {
  test,
  beforeEach,
  afterEach,
  afterAll,
  onTestFinished,
  onTestFailed,
  expect,
  vi,
} from 'next/dist/experimental/testing/vitest'

async function fixture(fn: (path: string, snapshot: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'next-stage2-api-'))
  const path = join(directory, 'example.test.ts')
  const snapshot = join(directory, '__snapshots__', 'example.test.ts.snap')
  await mkdir(join(directory, '__snapshots__'))
  try {
    await fn(path, snapshot)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
function initial() {
  return '// Snapshot v1\n\nexports[`selected 1`] = `"old"`;\n\nexports[`skipped 1`] = `"keep"`;\n\nexports[`absent 1`] = `"also keep"`;\n\nexports[`legacy key`] = `"legacy"`;\n'
}
const options = () => ({ runId: 'run', signal: new AbortController().signal })

check(
  'public facade scopes soft, poll, stubs, timers, and serializers',
  async () => {
    await fixture(async (path) => {
      const previousEnv = process.env.NEXT_TEST_STAGE2_STUB
      const previousGlobal = Object.getOwnPropertyDescriptor(
        globalThis,
        '__nextStage2Stub'
      )
      const realDate = Date
      const file = initializeTestFile({ fileId: 'file', filePath: path })
      await file.collect(async () => {
        test('utilities', async () => {
          expect.soft(1).toBe(1)
          let value = 0
          setTimeout(() => value++, 5)
          await expect.poll(() => value, { interval: 1, timeout: 100 }).toBe(1)
          vi.stubGlobal('__nextStage2Stub', 42)
          vi.stubEnv('NEXT_TEST_STAGE2_STUB', 'owned')
          vi.useFakeTimers({ now: 100 })
          let fired = false
          setTimeout(() => {
            fired = true
          }, 10)
          vi.advanceTimersByTime(10)
          expect(fired).toBe(true)
          expect(Date.now()).toBe(110)
          expect.addSnapshotSerializer({
            test: () => false,
            serialize: () => 'unused',
          })
        })
      })
      const result = await file.run(options())
      await file.dispose()
      assert.equal(result.cases[0].status, 'passed')
      assert.equal(Date, realDate)
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(globalThis, '__nextStage2Stub'),
        previousGlobal
      )
      assert.equal(process.env.NEXT_TEST_STAGE2_STUB, previousEnv)
    })
  }
)

check(
  'ordered setup shares authoring, extension, spies and fixtures with spec',
  async () => {
    await fixture(async (path) => {
      const file = initializeTestFile({ fileId: 'file', filePath: path })
      const order: string[] = []
      const object = { value: () => 1 }
      await file.collect(async () => {
        order.push('setup one')
        beforeEach(() => {
          order.push('before')
        })
        vi.spyOn(object, 'value').mockReturnValue(2)
        expect.extend({
          toBeEven(value) {
            return { pass: value % 2 === 0, message: () => 'expected even' }
          },
        })
        const extended = test.extend({ value: 2 })
        await Promise.resolve()
        order.push('setup two')
        afterEach(() => {
          order.push('after')
        })
        extended('spec', ({ value }) => {
          order.push('spec')
          expect(object.value()).toBe(value)
          ;(expect(value) as any).toBeEven()
        })
      })
      const result = await file.run(options())
      await file.dispose()
      assert.deepEqual(
        result.cases.map((c) => c.status),
        ['passed']
      )
      assert.deepEqual(order, [
        'setup one',
        'setup two',
        'before',
        'spec',
        'after',
      ])
      assert.equal(object.value(), 1)
    })
  }
)

check(
  'failure listeners follow teardown and finished listeners, retain errors and forbid recursive registration',
  async () => {
    await fixture(async (path) => {
      const file = initializeTestFile({ fileId: 'file', filePath: path })
      const order: string[] = []
      await file.collect(async () => {
        beforeEach(({ onTestFailed }) => {
          onTestFailed(() => {
            order.push('setup failed listener')
          })
          return () => {
            order.push('returned cleanup')
            throw new Error('returned cleanup error')
          }
        })
        afterEach(() => {
          order.push('after each')
          throw new Error('after each error')
        })
        test('failure', (context) => {
          onTestFinished(() => {
            order.push('finished first')
          })
          onTestFinished(() => {
            order.push('finished second')
            throw new Error('finished error')
          })
          onTestFailed((received) => {
            assert.equal(received, context)
            order.push('failed first')
            expect(1).toBe(1)
            assert.throws(
              () => onTestFinished(() => {}),
              /inside a test listener/
            )
          })
          onTestFailed(() => {
            order.push('failed second')
            throw new Error('failed listener error')
          })
          throw new Error('body error')
        })
      })
      const result = await file.run(options())
      await file.dispose()
      assert.equal(result.cases[0].status, 'failed')
      assert.deepEqual(order, [
        'after each',
        'returned cleanup',
        'finished second',
        'finished first',
        'failed second',
        'failed first',
        'setup failed listener',
      ])
      assert.equal(result.cases[0].errors.length, 5)
    })
  }
)

check(
  'assertion failures trigger listeners and listener asynchronous assertions finalize once',
  async () => {
    await fixture(async (path) => {
      const file = initializeTestFile({ fileId: 'file', filePath: path })
      let calls = 0
      await file.collect(async () => {
        test('assertion failure', () => {
          expect.assertions(1)
          onTestFailed(() => {
            calls++
            expect(1).toBe(1)
            void expect(Promise.resolve(1)).resolves.toBe(2)
          })
        })
      })
      const result = await file.run(options())
      await file.dispose()
      assert.equal(calls, 1)
      assert.equal(result.cases[0].status, 'failed')
      assert.deepEqual(
        result.cases[0].errors.map((e) => e.phase),
        ['assertion', 'assertion']
      )
    })
  }
)

check(
  'failure callbacks belong to each retry and do not run for passing or skipped cases',
  async () => {
    await fixture(async (path) => {
      const file = initializeTestFile({ fileId: 'file', filePath: path })
      let attempts = 0
      let failures = 0
      await file.collect(async () => {
        test.skip('skip', () => {
          throw new Error('must not run')
        })
        test('retry', { retry: 1 }, ({ onTestFailed }) => {
          onTestFailed(() => {
            failures++
          })
          if (attempts++ === 0) throw new Error('retry me')
        })
      })
      const result = await file.run(options())
      await file.dispose()
      assert.equal(failures, 1)
      assert.deepEqual(
        result.cases.map((c) => c.status),
        ['skipped', 'failed', 'passed']
      )
    })
  }
)

check(
  'listener timeout poisons the realm, cancels following cases and prevents retry',
  async () => {
    await fixture(async (path) => {
      const file = initializeTestFile({ fileId: 'file', filePath: path })
      await file.collect(async () => {
        test('timeout', { retry: 1 }, () => {
          onTestFailed(() => new Promise<void>(() => {}), 1)
          throw new Error('body')
        })
        test('following', () => {
          throw new Error('must not run')
        })
      })
      const result = await file.run(options())
      await file.dispose()
      assert.deepEqual(
        result.cases.map((c) => c.status),
        ['failed', 'cancelled']
      )
      assert.match(String(result.cases[0].errors[1].error), /timed out/)
    })
  }
)

check(
  'default snapshots remain byte-identical on mismatch and never stage writes',
  async () => {
    await fixture(async (path, snapshot) => {
      await writeFile(snapshot, initial())
      const file = initializeTestFile({ fileId: 'file', filePath: path })
      await file.collect(async () => {
        test('selected', () => expect('new').toMatchSnapshot())
      })
      const result = await file.run(options())
      await file.dispose()
      assert.equal(result.cases[0].status, 'failed')
      assert.deepEqual(file.takeSnapshotUpdates(), [])
      assert.equal(await readFile(snapshot, 'utf8'), initial())
    })
  }
)

check(
  'explicit partial updates preserve skipped and absent snapshots and only parent commit writes',
  async () => {
    await fixture(async (path, snapshot) => {
      await writeFile(snapshot, initial())
      const file = initializeTestFile({
        fileId: 'file',
        filePath: path,
        updateSnapshots: true,
      })
      await file.collect(async () => {
        test.only('selected', () => expect('new').toMatchSnapshot())
        test('skipped', () => {
          throw new Error('must not run')
        })
      })
      assert.throws(() => file.takeSnapshotUpdates(), /successful execution/)
      const result = await file.run(options())
      await file.dispose()
      assert.deepEqual(
        result.cases.map((c) => c.status),
        ['passed', 'skipped']
      )
      assert.equal(await readFile(snapshot, 'utf8'), initial())
      const updates = file.takeSnapshotUpdates()
      assert.equal(updates.length, 1)
      await commitSnapshotUpdates(path, updates)
      const content = await readFile(snapshot, 'utf8')
      assert.match(content, /"new"/)
      assert.match(content, /"keep"/)
      assert.match(content, /"also keep"/)
      assert.deepEqual(file.takeSnapshotUpdates(), [])
    })
  }
)

check(
  'failed file, suite cleanup and cancellation cannot release snapshot writes',
  async () => {
    for (const reason of ['body', 'cleanup', 'abort'])
      await fixture(async (path, snapshot) => {
        await writeFile(snapshot, initial())
        const controller = new AbortController()
        const file = initializeTestFile({
          fileId: 'file',
          filePath: path,
          updateSnapshots: true,
        })
        await file.collect(async () => {
          if (reason === 'cleanup')
            afterAll(() => {
              throw new Error('cleanup failure')
            })
          test('selected', () => {
            expect('new').toMatchSnapshot()
            if (reason === 'body') throw new Error('body failure')
            if (reason === 'abort') controller.abort()
          })
        })
        await file.run({ runId: 'run', signal: controller.signal })
        await file.dispose()
        assert.throws(() => file.takeSnapshotUpdates(), /successful execution/)
        assert.equal(await readFile(snapshot, 'utf8'), initial())
      })
  }
)

check(
  'parent commit refuses edited originals and unrelated target paths',
  async () => {
    await fixture(async (path, snapshot) => {
      await writeFile(snapshot, initial())
      const file = initializeTestFile({
        fileId: 'file',
        filePath: path,
        updateSnapshots: true,
      })
      await file.collect(async () => {
        test('selected', () => expect('new').toMatchSnapshot())
      })
      await file.run(options())
      await file.dispose()
      const updates = file.takeSnapshotUpdates()
      await assert.rejects(
        commitSnapshotUpdates(path, [
          { ...updates[0], path: join(tmpdir(), 'unrelated-next-test.snap') },
        ]),
        /original test file/
      )
      const controller = new AbortController()
      controller.abort(new Error('cancelled update'))
      await assert.rejects(
        commitSnapshotUpdates(path, updates, { signal: controller.signal }),
        /cancelled update/
      )
      assert.equal(await readFile(snapshot, 'utf8'), initial())
      await writeFile(snapshot, 'user edit')
      await assert.rejects(
        commitSnapshotUpdates(path, updates),
        /changed during/
      )
      assert.equal(await readFile(snapshot, 'utf8'), 'user edit')
    })
  }
)

check(
  'setup failure restores spies, releases the realm and never releases snapshot writes',
  async () => {
    await fixture(async (path, snapshot) => {
      await writeFile(snapshot, initial())
      const object = { value: () => 1 }
      const file = initializeTestFile({
        fileId: 'setup-original',
        filePath: path,
        updateSnapshots: true,
      })
      await assert.rejects(
        file.collect(async () => {
          vi.spyOn(object, 'value').mockReturnValue(2)
          beforeEach(() => {})
          await Promise.resolve()
          throw new Error('setup failure')
        }),
        /setup failure/
      )
      await file.dispose()
      assert.equal(object.value(), 1)
      assert.throws(() => file.takeSnapshotUpdates(), /successful execution/)
      assert.equal(await readFile(snapshot, 'utf8'), initial())
    })
  }
)

check(
  'late setup continuation keeps original collection identity and cannot register into a case',
  async () => {
    await fixture(async (path) => {
      const file = initializeTestFile({
        fileId: 'setup-origin',
        filePath: path,
      })
      let resume!: () => void
      const barrier = new Promise<void>((resolve) => {
        resume = resolve
      })
      let continuation!: Promise<void>
      await file.collect(async () => {
        continuation = (async () => {
          await barrier
          test('must not register', () => {})
        })()
        test('case', async () => {
          resume()
          await assert.rejects(
            continuation,
            /closed collection scope.*setup-origin/
          )
        })
      })
      const result = await file.run(options())
      await file.dispose()
      assert.equal(result.cases.length, 1)
      assert.equal(result.errors.length, 1)
      assert.match(String(result.errors[0].error), /setup-origin/)
    })
  }
)

check(
  'retry snapshot rollback preserves unchecked originals and uses only final values',
  async () => {
    await fixture(async (path, snapshot) => {
      await writeFile(snapshot, initial())
      const file = initializeTestFile({
        fileId: 'file',
        filePath: path,
        updateSnapshots: true,
      })
      let attempts = 0
      await file.collect(async () => {
        test('selected', { retry: 1 }, () => {
          expect(
            attempts === 0 ? 'failed value' : 'final value'
          ).toMatchSnapshot()
          if (attempts++ === 0) {
            expect('failed extra').toMatchSnapshot('extra')
            throw new Error('retry')
          }
        })
      })
      const result = await file.run(options())
      await file.dispose()
      assert.deepEqual(
        result.cases.map((c) => c.status),
        ['failed', 'passed']
      )
      await commitSnapshotUpdates(path, file.takeSnapshotUpdates())
      const content = await readFile(snapshot, 'utf8')
      assert.match(content, /final value/)
      assert.doesNotMatch(content, /failed value|failed extra/)
      assert.match(content, /also keep/)
      assert.match(content, /legacy/)
    })
  }
)

check(
  'retained failure registration reports the original attempt even when a later case catches it',
  async () => {
    await fixture(async (path) => {
      const file = initializeTestFile({
        fileId: 'original-file',
        filePath: path,
      })
      let retained!: typeof onTestFailed
      await file.collect(async () => {
        test('original', (context) => {
          retained = context.onTestFailed
        })
        test('later', () => {
          assert.throws(
            () => retained(() => {}),
            /finished.*run\/original-file\/0\/0\/0/
          )
        })
      })
      const result = await file.run(options())
      await file.dispose()
      assert.equal(result.errors.length, 1)
      assert.match(String(result.errors[0].error), /original-file\/0\/0\/0/)
    })
  }
)

check(
  'explicit update does not normalize files with no snapshots in final selected attempts',
  async () => {
    await fixture(async (path, snapshot) => {
      await writeFile(snapshot, initial())
      const file = initializeTestFile({
        fileId: 'file',
        filePath: path,
        updateSnapshots: true,
      })
      let attempts = 0
      await file.collect(async () => {
        test.skip('skipped', () => expect('skip').toMatchSnapshot())
        test('selected', { retry: 1 }, () => {
          if (attempts++ === 0) {
            expect('failed change').toMatchSnapshot()
            throw new Error('retry without snapshots')
          }
        })
      })
      await file.run(options())
      await file.dispose()
      assert.deepEqual(file.takeSnapshotUpdates(), [])
      assert.equal(await readFile(snapshot, 'utf8'), initial())
    })
  }
)

check(
  'snapshot finish rereads cannot replace the original comparison baseline',
  async () => {
    await fixture(async (path, snapshot) => {
      await writeFile(snapshot, initial())
      const file = initializeTestFile({
        fileId: 'file',
        filePath: path,
        updateSnapshots: true,
      })
      await file.collect(async () => {
        test('selected', () => expect('new').toMatchSnapshot())
      })
      await file.run(options())
      await writeFile(snapshot, '// user edit during test\n')
      await file.dispose()
      const updates = file.takeSnapshotUpdates()
      assert.equal(updates[0].previousContent, initial())
      await assert.rejects(
        commitSnapshotUpdates(path, updates),
        /changed during/
      )
      assert.equal(
        await readFile(snapshot, 'utf8'),
        '// user edit during test\n'
      )
    })
  }
)
