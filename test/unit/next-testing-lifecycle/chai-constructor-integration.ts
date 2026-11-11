import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  initializeTestFile,
  getAssertionRuntime,
} from 'next/dist/experimental/testing/runner'
import { test, expect } from 'next/dist/experimental/testing/vitest'

async function withFile(
  body: (file: ReturnType<typeof initializeTestFile>) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-constructor-'))
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

type AssertionConstructor = new (actual: unknown) => any

it('constructs assertions through the actual constructor without a wrapper count', async () => {
  await withFile(async (file) => {
    await file.collect(async () => {
      test('live constructor', () => {
        const raw = getAssertionRuntime().createChaiAssertion(1)
        const Constructor = raw.constructor as AssertionConstructor
        const constructed = new Constructor(2)
        constructed.equal(2)
        constructed.not.equal(3)
        assert.equal(expect.getState().assertionCalls, 0)
        assert.ok(constructed instanceof Constructor)
      })
    })
    const result = await file.run({
      runId: 'constructor-live',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ actualResult: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})

it('keeps constructor and constructed assertions bound to the original scope and file', async () => {
  let Constructor!: AssertionConstructor
  let constructed: any
  let retainedEqual!: (...args: unknown[]) => unknown
  await withFile(async (file) => {
    await file.collect(async () => {
      test('A', () => {
        Constructor = getAssertionRuntime().createChaiAssertion(1)
          .constructor as AssertionConstructor
        constructed = new Constructor(1)
        retainedEqual = constructed.equal
        retainedEqual.call(constructed, 1)
      })
      test('B', () => {
        assert.throws(
          () => new Constructor(1),
          /different Next assertion scope/
        )
        assert.throws(
          () => constructed.equal(1),
          /different Next assertion scope/
        )
        assert.throws(
          () => retainedEqual.call(constructed, 1),
          /different Next assertion scope/
        )
        const Current = getAssertionRuntime().createChaiAssertion(2)
          .constructor as AssertionConstructor
        new Current(2).equal(2)
        assert.equal(expect.getState().assertionCalls, 0)
      })
    })
    const result = await file.run({
      runId: 'constructor-retained',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ actualResult: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
  })
  assert.throws(() => new Constructor(1), /active Next test attempt/)
  await withFile(async (file) => {
    await file.collect(async () => {
      test('A', () => {
        assert.throws(() => new Constructor(1), /active Next test attempt/)
        assert.throws(
          () => retainedEqual.call(constructed, 1),
          /active Next test attempt/
        )
        const Current = getAssertionRuntime().createChaiAssertion(2)
          .constructor as AssertionConstructor
        new Current(2).equal(2)
      })
    })
    const result = await file.run({
      runId: 'constructor-new-file',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ actualResult: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})
