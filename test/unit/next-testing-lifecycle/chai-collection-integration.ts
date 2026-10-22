import assert from 'node:assert/strict'
import { it } from 'node:test'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeTestFile } from 'next/dist/experimental/testing/runner'
import { chai, test } from 'next/dist/experimental/testing/vitest'
import { chai as primitiveChai } from 'next/dist/compiled/next-test-primitives'

async function withFile(
  body: (file: ReturnType<typeof initializeTestFile>) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-collection-'))
  const file = initializeTestFile({
    fileId: 'entry',
    filePath: join(directory, 'collection.test.ts'),
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

it('matches the unchanged collection-created plugin corpus and complete pristine rows', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'next-chai-collection-corpus-')
  )
  const previous = process.env.CONTRACT_ROWS
  const evidence = join(directory, 'observations.jsonl')
  process.env.CONTRACT_ROWS = evidence
  try {
    await mkdir(join(directory, 'node_modules/vitest'), { recursive: true })
    await writeFile(
      join(directory, 'node_modules/vitest/package.json'),
      JSON.stringify({ name: 'vitest', main: 'index.cjs' })
    )
    await writeFile(
      join(directory, 'node_modules/vitest/index.cjs'),
      `module.exports = require(${JSON.stringify(require.resolve('next/dist/experimental/testing/vitest'))})\n`
    )
    await copyFile(
      join(__dirname, 'chai-collection-contract.mjs.txt'),
      join(directory, 'contract.mjs')
    )
    await withFile(async (file) => {
      await file.collect(async () => {
        await import(join(directory, 'contract.mjs'))
      })
      const result = await file.run({
        runId: 'chai-collection-corpus',
        signal: new AbortController().signal,
      })
      const rows = (await readFile(evidence, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      const pristine = JSON.parse(
        await readFile(join(__dirname, 'chai-collection-pristine.json'), 'utf8')
      )
      assert.deepEqual(rows, pristine)
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        ['passed', 'passed']
      )
      assert.deepEqual(result.errors, [])
    })
  } finally {
    if (previous === undefined) delete process.env.CONTRACT_ROWS
    else process.env.CONTRACT_ROWS = previous
    await rm(directory, { recursive: true, force: true })
  }
})

it('uses live receivers for collection methods and lazy accessors while retaining case guards', async () => {
  const name = 'collection202Accessor'
  const original = Object.getOwnPropertyDescriptor(
    primitiveChai.Assertion.prototype,
    name
  )
  let gets = 0
  let sets = 0
  Object.defineProperty(primitiveChai.Assertion.prototype, name, {
    configurable: true,
    get() {
      gets++
      return this
    },
    set(value) {
      sets++
      primitiveChai.util.flag(this, 'object', value)
    },
  })
  let equal!: Function
  let proxified!: Function
  let getter!: Function
  let setter!: Function
  let firstCaseMethod!: Function
  try {
    await withFile(async (file) => {
      await file.collect(async () => {
        equal = Object.getOwnPropertyDescriptor(
          chai.Assertion.prototype,
          'equal'
        )!.value
        proxified = chai.util.proxify(equal)
        const descriptor = Object.getOwnPropertyDescriptor(
          chai.Assertion.prototype,
          name
        )!
        getter = descriptor.get!
        setter = descriptor.set!
        assert.equal(equal, chai.Assertion.prototype.equal)
        assert.equal(
          equal,
          Object.getOwnPropertyDescriptor(chai.Assertion.prototype, 'equal')!
            .value
        )
        assert.equal(gets, 0)
        assert.equal(sets, 0)
        const collected = chai.expect(1)
        test('first live receiver', () => {
          const value = chai.expect(1)
          equal.call(value, 1)
          proxified.call(value, 1)
          assert.equal(getter.call(value), value)
          setter.call(value, 2)
          value.equal(2)
          firstCaseMethod = Object.getOwnPropertyDescriptor(
            chai.Assertion.prototype,
            'equal'
          )!.value
          assert.throws(
            () => equal.call(collected, 1),
            /different Next assertion scope/
          )
        })
        test('second live receiver', () => {
          const value = chai.expect(3)
          equal.call(value, 3)
          proxified.call(value, 3)
          assert.equal(getter.call(value), value)
          setter.call(value, 4)
          value.equal(4)
          assert.throws(
            () => firstCaseMethod.call(value, 4),
            /different Next assertion scope/
          )
          assert.throws(
            () => equal.call(primitiveChai.expect(4), 4),
            /require an admitted assertion receiver/
          )
          const reads: PropertyKey[] = []
          const foreign = new Proxy(
            {},
            {
              get(_target, key) {
                reads.push(key)
                return undefined
              },
              getPrototypeOf() {
                reads.push('prototype')
                return null
              },
            }
          )
          assert.throws(
            () => getter.call(foreign),
            /require an admitted assertion receiver/
          )
          assert.throws(
            () => setter.call(foreign, 4),
            /require an admitted assertion receiver/
          )
          assert.deepEqual(reads, [])
        })
      })
      const result = await file.run({
        runId: 'chai-collection-accessors',
        signal: new AbortController().signal,
      })
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        ['passed', 'passed']
      )
      assert.deepEqual(result.errors, [])
    })
    assert.equal(gets, 2)
    assert.equal(sets, 2)
    assert.throws(() => equal.call({}, 1), /active Next test|disposed/)
    assert.throws(() => proxified.call({}, 1), /active Next test|disposed/)
    assert.throws(() => getter.call({}), /active Next test|disposed/)
    assert.throws(() => setter.call({}, 1), /active Next test|disposed/)
  } finally {
    if (original)
      Object.defineProperty(primitiveChai.Assertion.prototype, name, original)
    else Reflect.deleteProperty(primitiveChai.Assertion.prototype, name)
  }
})

it('keeps overlapping invocation owners separate for a shared collection callable', async () => {
  await withFile(async (file) => {
    let release!: () => void
    const both = new Promise<void>((resolve) => {
      release = resolve
    })
    const releaseBoth = release
    const assertions = new Map<number, unknown>()
    await file.collect(async () => {
      const equal = Object.getOwnPropertyDescriptor(
        chai.Assertion.prototype,
        'equal'
      )!.value
      for (const value of [1, 2]) {
        test.concurrent(`owner ${value}`, async () => {
          const assertion = chai.expect(value)
          assertions.set(value, assertion)
          if (assertions.size === 2) releaseBoth()
          await both
          equal.call(assertion, value)
          assert.throws(
            () => equal.call(assertions.get(value === 1 ? 2 : 1), value),
            /different Next assertion scope/
          )
        })
      }
    })
    const result = await file.run({
      runId: 'chai-collection-concurrent',
      signal: new AbortController().signal,
    })
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
  })
})

it('does not let a disposed collection callable borrow a later file owner', async () => {
  let equal!: Function
  await withFile(async (file) => {
    await file.collect(async () => {
      equal = Object.getOwnPropertyDescriptor(
        chai.Assertion.prototype,
        'equal'
      )!.value
      test('original file', () => equal.call(chai.expect(1), 1))
    })
    const result = await file.run({
      runId: 'chai-collection-first-file',
      signal: new AbortController().signal,
    })
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
  await withFile(async (file) => {
    await file.collect(async () => {
      test('later file', () => {
        assert.throws(
          () => equal.call(chai.expect(1), 1),
          /active Next test|disposed/
        )
      })
    })
    const result = await file.run({
      runId: 'chai-collection-later-file',
      signal: new AbortController().signal,
    })
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})
