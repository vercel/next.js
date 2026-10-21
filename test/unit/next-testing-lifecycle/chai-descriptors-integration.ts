import assert from 'node:assert/strict'
import { it } from 'node:test'
import {
  mkdtemp,
  rm,
  readFile,
  mkdir,
  writeFile,
  copyFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeTestFile } from 'next/dist/experimental/testing/runner'
import { test, chai } from 'next/dist/experimental/testing/vitest'
import { chai as primitiveChai } from 'next/dist/compiled/next-test-primitives'

async function withFile(
  body: (file: ReturnType<typeof initializeTestFile>) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-descriptors-'))
  const file = initializeTestFile({
    fileId: 'entry',
    filePath: join(directory, 'descriptors.test.ts'),
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

it('runs the literal nine-case descriptor contract against complete pristine rows', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'next-chai-descriptor-contract-')
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
      join(__dirname, 'chai-descriptors-contract.mjs.txt'),
      join(directory, 'contract.mjs')
    )
    await withFile(async (file) => {
      await file.collect(async () => {
        await import(join(directory, 'contract.mjs'))
      })
      const result = await file.run({
        runId: 'chai-descriptor-contract',
        signal: new AbortController().signal,
      })
      const rows = (await readFile(evidence, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      const pristine = JSON.parse(
        await readFile(
          join(__dirname, 'chai-descriptors-pristine.json'),
          'utf8'
        )
      )
      console.log(
        JSON.stringify({
          actualChaiDescriptorContract: result,
          actualRows: rows,
        })
      )
      assert.deepEqual(rows, pristine)
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        Array(9).fill('passed')
      )
      assert.deepEqual(result.errors, [])
    })
  } finally {
    if (previous === undefined) delete process.env.CONTRACT_ROWS
    else process.env.CONTRACT_ROWS = previous
    await rm(directory, { recursive: true, force: true })
  }
})

it('keeps actual getter and setter functions lazy, scoped and receiver-checked', async () => {
  const name = 'chai199DescriptorSetter'
  const original = Object.getOwnPropertyDescriptor(
    primitiveChai.Assertion.prototype,
    name
  )
  let gets = 0
  let sets = 0
  let actualReceiver: unknown
  Object.defineProperty(primitiveChai.Assertion.prototype, name, {
    configurable: true,
    enumerable: false,
    get() {
      gets++
      actualReceiver = this
      return this
    },
    set(value) {
      sets++
      primitiveChai.util.flag(this, 'object', value)
    },
  })
  let savedGet!: Function
  let savedSet!: Function
  try {
    await withFile(async (file) => {
      await file.collect(async () => {
        test('live accessor', () => {
          const first = Object.getOwnPropertyDescriptor(
            chai.Assertion.prototype,
            name
          )!
          const second = Object.getOwnPropertyDescriptor(
            chai.Assertion.prototype,
            name
          )!
          assert.notEqual(first, second)
          assert.equal(first.get, second.get)
          assert.equal(first.set, second.set)
          assert.equal(gets, 0)
          assert.equal(sets, 0)
          const value = chai.expect(1)
          const result = first.get!.call(value)
          assert.equal(result, value)
          assert.notEqual(result, actualReceiver)
          first.set!.call(value, 3)
          value.equal(3)
          assert.equal(gets, 1)
          assert.equal(sets, 1)
          savedGet = first.get!
          savedSet = first.set!
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
            () => first.get!.call(foreign),
            /require an admitted assertion receiver/
          )
          assert.throws(
            () => first.set!.call(foreign, 5),
            /require an admitted assertion receiver/
          )
          assert.deepEqual(reads, [])
          assert.throws(
            () => first.get!.call(primitiveChai.expect(1)),
            /require an admitted assertion receiver/
          )
        })
        test('foreign prior attempt', () => {
          assert.throws(
            () => savedGet.call(chai.expect(1)),
            /different Next assertion scope/
          )
          assert.throws(
            () => savedSet.call(chai.expect(1), 2),
            /different Next assertion scope/
          )
          const current = Object.getOwnPropertyDescriptor(
            chai.Assertion.prototype,
            name
          )!
          current.set!.call(chai.expect(1), 4)
        })
      })
      const result = await file.run({
        runId: 'chai-descriptor-setter',
        signal: new AbortController().signal,
      })
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        ['passed', 'passed']
      )
      assert.deepEqual(result.errors, [])
    })
    assert.throws(
      () => savedGet.call({}),
      /active Next test|test file|disposed/
    )
    assert.throws(
      () => savedSet.call({}, 1),
      /active Next test|test file|disposed/
    )
  } finally {
    if (original)
      Object.defineProperty(primitiveChai.Assertion.prototype, name, original)
    else Reflect.deleteProperty(primitiveChai.Assertion.prototype, name)
  }
})

it('preserves raw assertion, direct accessor and prototype mutation boundaries', async () => {
  let saved!: Function
  await withFile(async (file) => {
    await file.collect(async () => {
      test('live method', () => {
        const method = Object.getOwnPropertyDescriptor(
          chai.Assertion.prototype,
          'equal'
        )!
        const value = chai.expect(1)
        saved = method.value
        method.value.call(value, 1)
        assert.throws(
          () => Object.getOwnPropertyDescriptor(value, '__flags'),
          /reflection API/
        )
        assert.throws(
          () => Reflect.get(chai.Assertion.prototype, 'not'),
          /prototype accessors/
        )
        assert.throws(
          () =>
            Object.defineProperty(chai.Assertion.prototype, 'raw199Escape', {
              value() {},
            }),
          /reflection API/
        )
        assert.deepEqual(Reflect.ownKeys(chai.Assertion.prototype), [])
        assert.equal(
          Object.getOwnPropertyDescriptor(
            chai.Assertion.prototype,
            Symbol('absent')
          ),
          undefined
        )
        assert.equal(
          Object.getOwnPropertyDescriptor(
            chai.Assertion.prototype,
            'constructor'
          )!.value,
          chai.Assertion
        )
        assert.throws(
          () => Reflect.construct(chai.Assertion, [1], class Foreign {}),
          /reflection API/
        )
      })
      test('closed prior method', () => {
        assert.throws(
          () => saved.call(chai.expect(1), 1),
          /different Next assertion scope/
        )
      })
    })
    const result = await file.run({
      runId: 'chai-descriptor-boundaries',
      signal: new AbortController().signal,
    })
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
  })
  assert.throws(() => saved.call({}, 1), /active Next test|test file|disposed/)
})

it('does not admit object-valued or nonconfigurable primitive descriptors', async () => {
  const objectKey = 'chai199ObjectDescriptor'
  const fixedKey = 'chai199FixedDescriptor'
  // A fresh child process owns these raw primitive setup facts. Public prototype
  // mutation stays refused; the existing raw object value never escapes.
  Object.defineProperty(primitiveChai.Assertion.prototype, objectKey, {
    configurable: true,
    value: {},
  })
  Object.defineProperty(primitiveChai.Assertion.prototype, fixedKey, {
    configurable: false,
    value() {},
  })
  try {
    await withFile(async (file) => {
      await file.collect(async () => {
        test('refused fields', () => {
          assert.throws(
            () =>
              Object.getOwnPropertyDescriptor(
                chai.Assertion.prototype,
                objectKey
              ),
            /prototype descriptor value/
          )
          assert.throws(
            () =>
              Object.getOwnPropertyDescriptor(
                chai.Assertion.prototype,
                fixedKey
              ),
            /Nonconfigurable/
          )
        })
      })
      const result = await file.run({
        runId: 'chai-descriptor-refusals',
        signal: new AbortController().signal,
      })
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        ['passed']
      )
      assert.deepEqual(result.errors, [])
    })
  } finally {
    Reflect.deleteProperty(primitiveChai.Assertion.prototype, objectKey)
  }
})
