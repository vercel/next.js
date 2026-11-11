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
import { chai as primitiveChai } from 'next/dist/compiled/next-test-primitives'

async function withFile(
  body: (file: ReturnType<typeof initializeTestFile>) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-utility-'))
  const file = initializeTestFile({
    fileId: 'entry',
    filePath: join(directory, 'utility.test.ts'),
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

it('matches the complete pristine length-guard dictionary and retains complete utility discovery rows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-utility-contract-'))
  const previous = process.env.NEXT_TESTING_CHAI141_EVIDENCE
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
      join(__dirname, 'chai-utility-contract.mjs.txt'),
      join(directory, 'chai-utility-contract.mjs')
    )
    await withFile(async (file) => {
      await file.collect(
        () => import(join(directory, 'chai-utility-contract.mjs'))
      )
      const result = await file.run({
        runId: 'utility-contract',
        signal: new AbortController().signal,
      })
      const rows = (await readFile(evidence, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      const pristine = JSON.parse(
        await readFile(join(__dirname, 'chai-utility-pristine.json'), 'utf8')
      )
      console.log(
        JSON.stringify({
          actualUtilityObservationalResult: result,
          actualUtilityRows: rows,
          completePristineUtilityRows: pristine,
        })
      )
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        ['passed', 'passed', 'passed']
      )
      assert.deepEqual(result.errors, [])
      assert.equal(pristine.length, 6)
      assert.deepEqual(rows[0], pristine[0])
      assert.deepEqual(rows, pristine)
    })
  } finally {
    if (previous === undefined) delete process.env.NEXT_TESTING_CHAI141_EVIDENCE
    else process.env.NEXT_TESTING_CHAI141_EVIDENCE = previous
    await rm(directory, { recursive: true, force: true })
  }
})

it('preserves user payload identity without granting an unadmitted assertion producer', async () => {
  await withFile(async (file) => {
    let effects = 0
    await file.collect(async () => {
      function collectionPayload(value: unknown) {
        return value
      }
      assert.equal(
        chai.util.addLengthGuard(collectionPayload, 'collection', false),
        collectionPayload
      )
      chai.use((_chai) => {
        _chai.Assertion.overwriteMethod(
          'equal',
          (original) =>
            function (
              this: ReturnType<typeof primitiveChai.expect>,
              ...args: unknown[]
            ) {
              effects++
              return original.apply(this, args)
            }
        )
      })
      test('a length guard changes a user function property, never its origin', () => {
        function unadmittedProducer() {
          return primitiveChai.expect('unadmitted')
        }
        const returned = chai.util.addLengthGuard(
          unadmittedProducer,
          'producer',
          false
        )
        assert.equal(returned, unadmittedProducer)
        const before = effects
        assert.throws(
          () => unadmittedProducer().equal('unadmitted'),
          /Unrecognized Chai plugin assertion receiver/
        )
        assert.equal(effects, before)
        chai.expect('admitted').equal('admitted')
        assert.equal(effects, before + 1)
        const trace: string[] = []
        const failure = new Error('real defineProperty refusal')
        const payload = new Proxy(function payload() {}, {
          defineProperty() {
            trace.push('defineProperty')
            throw failure
          },
          get() {
            trace.push('get')
            throw new Error('unexpected get')
          },
          getPrototypeOf() {
            trace.push('getPrototypeOf')
            throw new Error('unexpected getPrototypeOf')
          },
        })
        assert.throws(
          () => chai.util.addLengthGuard(payload, 'payload', false),
          (error) => error === failure
        )
        assert.deepEqual(trace, ['defineProperty'])
        assert.equal(expect.getState().assertionCalls, 0)
      })
    })
    const result = await file.run({
      runId: 'length-payload-origin',
      signal: new AbortController().signal,
    })
    console.log(
      JSON.stringify({ actualLengthPayloadOrigin: result }, (_key, value) =>
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

it('keeps original runtime and assertion tombstones while leaving user functions as payloads', async () => {
  let retainedUtility: (() => unknown) | undefined
  let retainedAssertionMethod: Function | undefined
  let userFunction: Function | undefined
  let mutations = 0
  const payload = new Proxy(function payload() {}, {
    defineProperty(target, key, descriptor) {
      mutations++
      return Reflect.defineProperty(target, key, descriptor)
    },
  })
  await withFile(async (file) => {
    await file.collect(async () => {
      const runtime = getAssertionRuntime()
      retainedUtility = () =>
        runtime.callChaiUtility(
          'addLengthGuard',
          [payload, 'retained', false],
          Object.create(null)
        )
      test('owner A produces a guarded assertion method and mutates a caller function', () => {
        retainedAssertionMethod = chai.expect(1).equal
        assert.equal(
          chai.util.addLengthGuard(retainedAssertionMethod, 'equal', false),
          retainedAssertionMethod
        )
        function userPayload() {
          return 17
        }
        const returned = chai.util.addLengthGuard(
          userPayload,
          'userPayload',
          false
        )
        assert.equal(returned, userPayload)
        userFunction = userPayload
      })
    })
    const result = await file.run({
      runId: 'length-owner-a',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ actualLengthOwnerA: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
  await withFile(async (file) => {
    await file.collect(async () => {
      test('owner B cannot revive A before any mutation or assertion effect', () => {
        const before = mutations
        assert.throws(retainedUtility!, /active Next|disposed|different Next/)
        assert.equal(mutations, before)
        assert.throws(
          () => retainedAssertionMethod!.length,
          /active Next|disposed|different Next/
        )
        assert.equal(userFunction!(), 17)
        assert.throws(
          () => userFunction!.length,
          /Invalid Chai property: userPayload.length/
        )
        assert.equal(chai.util.addLengthGuard(payload, 'fresh', false), payload)
        assert.equal(mutations, before + 1)
        assert.equal(expect.getState().assertionCalls, 0)
      })
    })
    const result = await file.run({
      runId: 'length-owner-b',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ actualLengthOwnerB: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})
