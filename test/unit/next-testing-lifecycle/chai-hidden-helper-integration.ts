import assert from 'node:assert/strict'
import { it } from 'node:test'
import {
  mkdtemp,
  mkdir,
  writeFile,
  copyFile,
  readFile,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  initializeTestFile,
  getAssertionRuntime,
} from 'next/dist/experimental/testing/runner'
import { chai, expect, test } from 'next/dist/experimental/testing/vitest'
import {
  chai as primitiveChai,
  createChaiAssertInterface,
} from 'next/dist/compiled/next-test-primitives'

type ChaiAssertion = ReturnType<typeof primitiveChai.expect>

async function withFile(
  body: (file: ReturnType<typeof initializeTestFile>) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-hidden-helper-'))
  const file = initializeTestFile({
    fileId: 'entry',
    filePath: join(directory, 'helper.test.ts'),
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

it('matches both literal pristine hidden-helper callback dictionaries without adding counts or tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-hidden-contract-'))
  const prior = process.env.NEXT_TESTING_CHAI141_EVIDENCE
  const originalEqual = Object.getOwnPropertyDescriptor(
    primitiveChai.Assertion.prototype,
    'equal'
  )!
  const evidence = join(directory, 'observations.jsonl')
  process.env.NEXT_TESTING_CHAI141_EVIDENCE = evidence
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
      join(__dirname, 'chai-hidden-helper-contract.mjs.txt'),
      join(directory, 'chai-hidden-helper-contract.mjs')
    )
    await withFile(async (file) => {
      await file.collect(
        () => import(join(directory, 'chai-hidden-helper-contract.mjs'))
      )
      const result = await file.run({
        runId: 'hidden-helper-contract',
        signal: new AbortController().signal,
      })
      const rows = (await readFile(evidence, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      console.log(
        JSON.stringify({
          hiddenHelperActualResult: result,
          hiddenHelperActualRows: rows,
        })
      )
      const expected = JSON.parse(
        await readFile(
          join(__dirname, 'chai-hidden-helper-expected.json'),
          'utf8'
        )
      )
      assert.deepEqual(rows, expected)
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        ['passed', 'passed']
      )
      assert.deepEqual(result.errors, [])
    })
  } finally {
    // The literal discovery plugin records to its fixture-local evidence path.
    // Restore its real overwritten method before this process runs another file.
    Object.defineProperty(
      primitiveChai.Assertion.prototype,
      'equal',
      originalEqual
    )
    if (prior === undefined) delete process.env.NEXT_TESTING_CHAI141_EVIDENCE
    else process.env.NEXT_TESTING_CHAI141_EVIDENCE = prior
    await rm(directory, { recursive: true, force: true })
  }
})

it('preserves builtin helper algorithms, exact return payloads and genuine construction before nested callbacks', async () => {
  await withFile(async (file) => {
    const callbacks: {
      subject: unknown
      publicPrototype: boolean
      calls: number
      task: unknown
    }[] = []
    await file.collect(async () => {
      chai.use((_chai, util) => {
        _chai.Assertion.overwriteMethod(
          'equal',
          (original) =>
            function (this: ChaiAssertion, ...args: unknown[]) {
              const subject = util.flag(this, 'object')
              callbacks.push({
                subject,
                publicPrototype:
                  Object.getPrototypeOf(this) === chai.Assertion.prototype,
                calls: expect.getState().assertionCalls,
                task: util.flag(this, 'vitest-test'),
              })
              if (subject === 'outer')
                _chai.assert.strictEqual('inner', 'inner')
              return original.apply(this, args)
            }
        )
      })
      test('real helpers construct owned zero-count assertions', () => {
        assert.equal(chai.assert.strictEqual('outer', 'outer'), undefined)
        const helpers = chai.should()
        assert.equal(helpers.equal('should', 'should'), undefined)
        chai.assert(true)
        Reflect.apply(chai.assert.equal, chai.assert, [1, '1'])
        chai.assert.notEqual(1, 2)
        chai.assert.operator(3, '>', 2)
        const error = new Error('exact helper payload')
        assert.equal(
          chai.assert.throws(() => {
            throw error
          }, /exact helper/),
          error
        )
        chai.assert.deepEqual({ value: [1] }, { value: [1] })
        let failure: unknown
        try {
          chai.assert.strictEqual(1, 2)
        } catch (error) {
          failure = error
        }
        assert.equal((failure as Error).name, 'AssertionError')
        assert.equal((failure as { actual: unknown }).actual, 1)
        assert.equal((failure as { expected: unknown }).expected, 2)
        assert.equal((failure as { operator: unknown }).operator, 'strictEqual')
        assert.equal((failure as { showDiff: unknown }).showDiff, true)
        assert.equal(expect.getState().assertionCalls, 0)
        assert.deepEqual(
          callbacks.map(({ subject, publicPrototype, calls, task }) => ({
            subject,
            publicPrototype,
            calls,
            taskIsNull: task == null,
          })),
          [
            {
              subject: 'outer',
              publicPrototype: true,
              calls: 0,
              taskIsNull: true,
            },
            {
              subject: 'inner',
              publicPrototype: true,
              calls: 0,
              taskIsNull: true,
            },
            {
              subject: 'should',
              publicPrototype: true,
              calls: 0,
              taskIsNull: true,
            },
            { subject: 1, publicPrototype: true, calls: 0, taskIsNull: true },
          ]
        )
        console.log(
          JSON.stringify({
            actualHelperCallbacks: callbacks.map(({ task, ...row }) => ({
              ...row,
              taskIsNull: task == null,
            })),
            actualHelperFailure: {
              name: (failure as Error).name,
              actual: (failure as { actual: unknown }).actual,
              expected: (failure as { expected: unknown }).expected,
              operator: (failure as { operator: unknown }).operator,
              showDiff: (failure as { showDiff: unknown }).showDiff,
            },
          })
        )
      })
    })
    const result = await file.run({
      runId: 'helper-algorithms',
      signal: new AbortController().signal,
    })
    console.log(
      JSON.stringify({ actualHelperAlgorithms: result }, (_key, value) =>
        value instanceof Error
          ? {
              name: value.name,
              message: value.message,
              stack: value.stack,
              ...value,
            }
          : value
      )
    )
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})

it('does not let pure factories grant unknown receivers or let closed owners borrow a new file', async () => {
  let retainedAssertion: ChaiAssertion | undefined
  let retainedMethod: (() => unknown) | undefined
  let retainedAssert: (() => unknown) | undefined
  let retainedShould: (() => unknown) | undefined
  let retainedGetter: (() => unknown) | undefined
  let callbacks = 0
  await withFile(async (file) => {
    await file.collect(async () => {
      chai.use((_chai, util) => {
        _chai.Assertion.overwriteMethod(
          'equal',
          (original) =>
            function (this: ChaiAssertion, ...args: unknown[]) {
              callbacks++
              if (util.flag(this, 'object') === 'owner-a') {
                retainedAssertion = this
                retainedMethod = () => this.equal('owner-a')
              }
              return original.apply(this, args)
            }
        )
      })
      test('owner A explicitly constructs every helper receiver', () => {
        const runtime = getAssertionRuntime()
        retainedAssert = () =>
          runtime.assert.strictEqual('retained', 'retained')
        const helpers = chai.should()
        retainedShould = () => helpers.equal('retained', 'retained')
        retainedGetter = Object.getOwnPropertyDescriptor(
          Object.prototype,
          'should'
        )!.get!
        chai.assert.strictEqual('owner-a', 'owner-a')
        assert.ok(retainedAssertion)
        const before = callbacks
        const foreign = createChaiAssertInterface(
          primitiveChai.Assertion,
          primitiveChai.util.flag
        )
        assert.throws(
          () => foreign.strictEqual('foreign', 'foreign'),
          /Unrecognized Chai plugin assertion receiver/
        )
        assert.equal(callbacks, before)
      })
    })
    const result = await file.run({
      runId: 'helper-owner-a',
      signal: new AbortController().signal,
    })
    console.log(
      JSON.stringify({ actualHelperOwnerA: result }, (_key, value) =>
        value instanceof Error
          ? {
              name: value.name,
              message: value.message,
              stack: value.stack,
              ...value,
            }
          : value
      )
    )
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
  await withFile(async (file) => {
    await file.collect(async () => {
      test('owner B cannot revive original A helper/assertion/getter', () => {
        const before = callbacks
        for (const action of [
          retainedMethod!,
          retainedAssert!,
          retainedShould!,
          () => retainedGetter!.call('retained'),
        ])
          assert.throws(action, /active Next|disposed|different Next/)
        assert.equal(callbacks, before)
        chai.assert.strictEqual('owner-b', 'owner-b')
        assert.equal(callbacks, before + 1)
        assert.equal(expect.getState().assertionCalls, 0)
      })
    })
    const result = await file.run({
      runId: 'helper-owner-b',
      signal: new AbortController().signal,
    })
    console.log(
      JSON.stringify({ actualHelperOwnerB: result }, (_key, value) =>
        value instanceof Error
          ? {
              name: value.name,
              message: value.message,
              stack: value.stack,
              ...value,
            }
          : value
      )
    )
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})
