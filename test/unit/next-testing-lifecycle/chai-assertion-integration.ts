import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  initializeTestFile,
  getAssertionRuntime,
} from 'next/dist/experimental/testing/runner'
import {
  test,
  expect,
  assert as namedAssert,
} from 'next/dist/experimental/testing/vitest'

// Actual collector, ALS admission and assertion runtime in a fresh Node process.
// No worker globals, flags/tasks, counters, origin token or matcher are supplied
// by a mock. This internal component boundary does not export public chai.
async function withFile(
  body: (file: ReturnType<typeof initializeTestFile>) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-assertions-'))
  const file = initializeTestFile({
    fileId: 'entry',
    filePath: join(directory, 'chai.test.ts'),
  })
  try {
    await body(file)
  } finally {
    try {
      await file.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}

it('keeps raw construction zero-count/task-free and the wrapped path counted', async () => {
  await withFile(async (file) => {
    await file.collect(async () => {
      test('counter and matcher state', async () => {
        const runtime = getAssertionRuntime()
        const states: unknown[] = []
        expect.extend({
          chai145State(received) {
            const task = (
              this as typeof this & {
                task?: { type: string; fullTestName: string }
              }
            ).task
            states.push({
              currentTestName: this.currentTestName,
              taskType: task?.type ?? null,
              taskName: task?.fullTestName ?? null,
              assertionCalls: this.assertionCalls,
            })
            return { pass: received === 'ok', message: () => 'expected ok' }
          },
          async chai145Async(received) {
            return {
              pass: (await received) === 'ok',
              message: () => 'expected ok',
            }
          },
        })
        const raw = (value: unknown) =>
          runtime.createChaiAssertion(value) as any
        assert.equal(expect.getState().assertionCalls, 0)
        raw(1).equal(1)
        namedAssert.equal(1, 1)
        assert.equal(expect.getState().assertionCalls, 0)
        raw('ok').chai145State()
        ;(expect('ok') as any).chai145State()
        assert.deepEqual(states, [
          {
            currentTestName: '',
            taskType: null,
            taskName: null,
            assertionCalls: 0,
          },
          {
            currentTestName: 'counter and matcher state',
            taskType: 'test',
            taskName: 'counter and matcher state',
            assertionCalls: 1,
          },
        ])
        await raw(Promise.resolve('ok')).resolves.equal('ok')
        await raw('ok').chai145Async()
        assert.equal(expect.getState().assertionCalls, 1)
        await expect(Promise.resolve('ok')).resolves.toBe('ok')
        assert.equal(expect.getState().assertionCalls, 2)
        assert.equal(expect.assert, namedAssert)
        assert.equal(expect.assert, expect.assert)
        expect.assert.equal(1, 1)
        assert.equal(expect.getState().assertionCalls, 2)
      })
    })
    const result = await file.run({
      runId: 'raw-state',
      signal: new AbortController().signal,
    })
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})

it('does not turn a raw async matcher into a tracked wrapped expectation', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let pending: Promise<unknown> | undefined
  try {
    await withFile(async (file) => {
      await file.collect(async () => {
        test('raw pending', { timeout: 1000 }, () => {
          const runtime = getAssertionRuntime()
          expect.extend({
            async chai145Pending(received) {
              assert.equal(
                (this as typeof this & { task?: unknown }).task,
                undefined
              )
              await gate
              return { pass: received === 'ok', message: () => 'expected ok' }
            },
          })
          pending = (runtime.createChaiAssertion('ok') as any).chai145Pending()
          assert.equal(expect.getState().assertionCalls, 0)
        })
      })
      const result = await file.run({
        runId: 'raw-untracked',
        signal: new AbortController().signal,
      })
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        ['passed']
      )
      assert.deepEqual(result.errors, [])
      assert.ok(pending)
      release()
      await pending
    })
  } finally {
    release()
    await pending
  }
})

it('retains original assertion/file tombstones across a live later owner', async () => {
  let oldCreate!: ReturnType<typeof getAssertionRuntime>['createChaiAssertion']
  let retained: any
  let retainedEqual: (...args: unknown[]) => unknown
  await withFile(async (file) => {
    await file.collect(async () => {
      test('A', () => {
        oldCreate = getAssertionRuntime().createChaiAssertion
        retained = oldCreate(1)
        retainedEqual = retained.equal
        retainedEqual(1)
      })
      test('B', () => {
        assert.throws(() => retained.equal(1), /different Next assertion scope/)
        assert.throws(() => retainedEqual(1), /different Next assertion scope/)
        getAssertionRuntime().createChaiAssertion(1).equal(1)
      })
    })
    const result = await file.run({
      runId: 'retained',
      signal: new AbortController().signal,
    })
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
  })
  assert.throws(() => oldCreate(1), /active Next test attempt/)
  await withFile(async (file) => {
    await file.collect(async () => {
      test('A', () => {
        assert.throws(() => oldCreate(1), /active Next test attempt/)
        assert.throws(() => retainedEqual(1), /active Next test attempt/)
        getAssertionRuntime().createChaiAssertion(1).equal(1)
      })
    })
    const result = await file.run({
      runId: 'new-file',
      signal: new AbortController().signal,
    })
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})
