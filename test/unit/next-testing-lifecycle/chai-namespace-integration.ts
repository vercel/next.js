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
import { test, expect, chai } from 'next/dist/experimental/testing/vitest'
import {
  chai as primitiveChai,
  getChaiAssertionIdentity,
} from 'next/dist/compiled/next-test-primitives'

async function withFile(
  body: (file: ReturnType<typeof initializeTestFile>) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-namespace-'))
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

it('runs all three literal original Chai contract bodies through the actual runner', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'next-chai-contract-evidence-')
  )
  const prior = process.env.NEXT_TESTING_CHAI141_EVIDENCE
  const evidence = join(directory, 'observations.jsonl')
  process.env.NEXT_TESTING_CHAI141_EVIDENCE = evidence
  try {
    // This maintained component maps the literal contract's Vitest specifier
    // to the same genuine Next module already imported by this Node process.
    // It does not qualify public package alias/editor resolution.
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
      join(__dirname, 'chai-original-contract.mjs.txt'),
      join(directory, 'chai-original-contract.mjs')
    )
    await copyFile(
      join(__dirname, 'same-api.mjs'),
      join(directory, 'same-api.mjs')
    )
    await withFile(async (file) => {
      await file.collect(async () => {
        await import(join(directory, 'chai-original-contract.mjs'))
      })
      const result = await file.run({
        runId: 'original-contract',
        signal: new AbortController().signal,
      })
      console.log(JSON.stringify({ actualOriginalContract: result }))
      const rows = (await readFile(evidence, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      console.log(JSON.stringify({ actualOriginalObservations: rows }))
      const expectedRows = JSON.parse(
        await readFile(join(__dirname, 'chai-original-expected.json'), 'utf8')
      )
      assert.deepEqual(rows, expectedRows)
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        ['passed', 'passed', 'passed']
      )
      assert.deepEqual(result.errors, [])
      const observation = (label: string) =>
        rows.filter((row) => row.label === label).map((row) => row.value)
      assert.deepEqual(observation('counts-raw-expect'), [0])
      assert.deepEqual(observation('counts-raw-custom'), [0])
      assert.deepEqual(observation('counts-wrapper-custom'), [1])
      assert.deepEqual(observation('counts-raw-resolves'), [1])
      assert.deepEqual(observation('counts-raw-async-custom'), [1])
      assert.deepEqual(observation('counts-wrapper-resolves'), [2])
      assert.deepEqual(observation('plugin-callback'), [
        {
          calls: 1,
          argumentIsNamespace: false,
          util: true,
          utilMember: true,
          Assertion: true,
          expect: true,
          assert: true,
          should: true,
          use: true,
        },
      ])
      assert.deepEqual(observation('throwing-plugin'), [
        {
          attempts: 2,
          errors: [
            { name: 'Error', message: 'chai141 plugin refusal' },
            { name: 'Error', message: 'chai141 plugin refusal' },
          ],
          counts: 0,
        },
      ])
    })
  } finally {
    try {
      // Persist any partial genuine records even if collection or a later
      // assertion failed. Recorder/read failures remain fatal to this child.
      const actualRaw = await readFile(evidence, 'utf8').catch((error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
        throw error
      })
      console.log(JSON.stringify({ actualRawOriginalObservations: actualRaw }))
    } finally {
      if (prior === undefined) delete process.env.NEXT_TESTING_CHAI141_EVIDENCE
      else process.env.NEXT_TESTING_CHAI141_EVIDENCE = prior
      await rm(directory, { recursive: true, force: true })
    }
  }
})

it('guards plugin receivers and strict reflection without replacing user subjects', async () => {
  let retained: any
  let retainedReceiver: any
  let retainedMethod: any
  const subject = () => 'user subject'
  const plugin: Parameters<typeof chai.use>[0] = (c, utils) => {
    utils.addMethod(
      c.Assertion.prototype,
      'chai145Owner',
      function (this: any, expected: unknown) {
        retainedReceiver = this
        this.assert(
          Object.is(utils.flag(this, 'object'), expected),
          'subject differs',
          'subject matches'
        )
      }
    )
  }
  await withFile(async (file) => {
    await file.collect(async () => {
      chai.use(plugin)
      test('A', () => {
        retained = chai.expect(subject)
        assert.equal(retained._obj, subject)
        retained.chai145Owner(subject)
        retainedMethod = retainedReceiver.equal
        assert.equal(Object.getPrototypeOf(retained), chai.Assertion.prototype)
        assert.throws(() => retained.__flags, /flags are not exposed/)
        assert.throws(
          () => Object.getOwnPropertyDescriptor(retained, '__flags'),
          /reflection API/
        )
        const events = Reflect.get(chai.util, 'events')
        assert.ok(events instanceof EventTarget)
        assert.equal(events, Reflect.get(chai.util, 'events'))
        assert.equal(expect.getState().assertionCalls, 0)
      })
      test('B', () => {
        assert.throws(
          () => retained.equal(subject),
          /different Next assertion scope/
        )
        assert.throws(
          () => retainedReceiver.equal(subject),
          /different Next assertion scope/
        )
        assert.throws(
          () => retainedMethod(subject),
          /different Next assertion scope/
        )
        chai.expect(subject).equal(subject)
        assert.equal(expect.getState().assertionCalls, 0)
      })
    })
    const result = await file.run({
      runId: 'plugin-owner',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ actualPluginOwner: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
  })
  assert.throws(
    () => retained.equal(subject),
    /active Next test attempt|test file/
  )
})

it('deduplicates the original plugin across files without lending the old assertion owner', async () => {
  let calls = 0
  let oldReceiver: any
  const plugin: Parameters<typeof chai.use>[0] = (c, utils) => {
    calls++
    c.Assertion.addMethod(
      'chai145AcrossFiles',
      function (this: any, expected: unknown) {
        oldReceiver ??= this
        this.assert(
          Object.is(utils.flag(this, 'object'), expected),
          'wrong subject',
          'same subject'
        )
      }
    )
  }
  await withFile(async (file) => {
    await file.collect(async () => {
      chai.use(plugin)
      chai.use(plugin)
      test('A', () => {
        ;(chai.expect('A') as any).chai145AcrossFiles('A')
      })
    })
    const result = await file.run({
      runId: 'plugin-file-A',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ actualPluginFileA: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
  await withFile(async (file) => {
    await file.collect(async () => {
      chai.use(plugin)
      test('A', () => {
        assert.equal(calls, 1)
        assert.throws(
          () => oldReceiver.equal('A'),
          /active Next test attempt|test file/
        )
        ;(chai.expect('B') as any).chai145AcrossFiles('B')
        assert.equal(expect.getState().assertionCalls, 0)
      })
    })
    const result = await file.run({
      runId: 'plugin-file-B',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ actualPluginFileB: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})

it('adapts registration callbacks, preserves fresh member reads and refuses flag leakage', async () => {
  await withFile(async (file) => {
    const seen: string[] = []
    let retainedSuper: Function
    await file.collect(async () => {
      chai.Assertion.addMethod(
        'chai145Overwrite',
        function (this: any, expected: unknown) {
          seen.push('original')
          this.assert(
            Object.is(chai.util.flag(this, 'object'), expected),
            'wrong subject',
            'same subject'
          )
        }
      )
      chai.Assertion.addProperty('chai145Property', function (this: any) {
        seen.push('property')
        return this
      })
      chai.Assertion.addChainableMethod(
        'chai145Chain',
        function (this: any, expected: unknown) {
          this.assert(
            Object.is(chai.util.flag(this, 'object'), expected),
            'wrong subject',
            'same subject'
          )
          seen.push('chain-method')
        },
        function (this: any) {
          seen.push('chain-getter')
        }
      )
      test('A', () => {
        const value = chai.expect('ok') as any
        value.chai145Overwrite('ok')
        chai.Assertion.overwriteMethod('chai145Overwrite', (original) => {
          retainedSuper = original
          return function (this: any, expected: unknown) {
            original.call(this, expected)
            seen.push('overwrite')
          }
        })
        value.chai145Overwrite('ok')
        value.chai145Property.equal('ok')
        value.chai145Chain('ok').equal('ok')
        assert.deepEqual(seen, [
          'original',
          'original',
          'overwrite',
          'property',
          'chain-getter',
          'chain-method',
        ])
        const target = chai.expect('other')
        chai.util.transferFlags(value, target)
        target.equal('ok')
        assert.throws(
          () => chai.util.transferFlags(value, {}),
          /only transfer between admitted assertions/
        )
        assert.throws(
          () =>
            Object.defineProperty(chai.Assertion.prototype, 'rawEscape', {
              value() {},
            }),
          /reflection API/
        )
        assert.equal(expect.getState().assertionCalls, 0)
      })
      test('B', () => {
        assert.throws(
          () => retainedSuper.call(chai.expect('ok'), 'ok'),
          /different Next assertion scope/
        )
        assert.equal(expect.getState().assertionCalls, 0)
      })
    })
    const result = await file.run({
      runId: 'plugin-registration',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ actualPluginRegistration: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
  })
})

it('preserves proxy payloads and closes observed prototype/should constructor escapes', async () => {
  let shouldConstructor: any
  let shouldEqual: any
  let assertConstructor: any
  let prototypeGetterCalls = 0
  let leakedPrototype: unknown
  let reads = 0
  const subject = new Proxy(
    {},
    {
      getPrototypeOf() {
        reads++
        throw new Error('payload prototype read')
      },
    }
  )
  const revoked = Proxy.revocable({}, {})
  revoked.revoke()
  await withFile(async (file) => {
    await file.collect(async () => {
      chai.Assertion.addProperty(
        'chai145PrototypeAccessor',
        function (this: unknown) {
          prototypeGetterCalls++
          leakedPrototype = this
        }
      )
      chai.Assertion.addMethod('chai145UserResult', function () {
        return revoked.proxy
      })
      chai.Assertion.addMethod('chai145Receiver', function (this: any) {
        this.assert(
          chai.util.flag(this, 'object') === 1,
          'wrong receiver',
          'same receiver'
        )
      })
      const functionPayload = () => 'payload'
      chai.Assertion.addProperty('chai145FunctionPayload', function () {
        return functionPayload
      })
      test('A', () => {
        const actual = Reflect.get(chai.util, 'getActual')(
          chai.expect(subject),
          [true, '', '']
        )
        const same = Object.is(actual, subject)
        const observedReads = reads
        assert.equal(same, true)
        assert.equal(observedReads, 0)
        const receiverReads: string[] = []
        const hostileReceiver = new Proxy(
          {},
          {
            get() {
              receiverReads.push('get')
              return undefined
            },
            getPrototypeOf() {
              receiverReads.push('getPrototypeOf')
              return null
            },
          }
        )
        const prototypeMethod = Reflect.get(
          chai.Assertion.prototype,
          'chai145Receiver'
        )
        assert.throws(
          () => prototypeMethod.call(hostileReceiver),
          /require an admitted assertion receiver/
        )
        assert.deepEqual(receiverReads, [])
        assert.equal(getChaiAssertionIdentity(hostileReceiver), undefined)
        assert.equal(getChaiAssertionIdentity(revoked.proxy), undefined)
        assert.deepEqual(receiverReads, [])
        let actualHiddenTarget: object
        primitiveChai.Assertion.addProperty(
          'chai145IdentityProbe',
          function () {
            actualHiddenTarget = this
            return this
          }
        )
        const unclaimed = primitiveChai.expect(1)
        Reflect.get(unclaimed, 'chai145IdentityProbe')
        const identity = getChaiAssertionIdentity(unclaimed)!
        assert.equal(typeof identity, 'object')
        assert.equal(Object.getPrototypeOf(identity), null)
        assert.equal(Object.isFrozen(identity), true)
        assert.deepEqual(Reflect.ownKeys(identity), [])
        assert.equal(Object.is(identity, actualHiddenTarget!), false)
        assert.equal(getChaiAssertionIdentity(actualHiddenTarget!), identity)
        assert.notEqual(
          getChaiAssertionIdentity(primitiveChai.expect(1)),
          identity
        )
        const resolvesOrigin = primitiveChai.expect(Promise.resolve(1))
        assert.equal(
          getChaiAssertionIdentity(Reflect.get(resolvesOrigin, 'resolves')),
          getChaiAssertionIdentity(resolvesOrigin)
        )
        const rejectsOrigin = primitiveChai.expect(Promise.resolve(1))
        assert.equal(
          getChaiAssertionIdentity(Reflect.get(rejectsOrigin, 'rejects')),
          getChaiAssertionIdentity(rejectsOrigin)
        )
        assert.throws(
          () => prototypeMethod.call(unclaimed),
          /require an admitted assertion receiver/
        )
        prototypeMethod.call(chai.expect(1))

        assert.equal(Reflect.get(chai.util, 'then'), undefined)
        assert.equal(
          Reflect.get(Reflect.get(chai.util, 'checkError'), 'then'),
          undefined
        )
        const returned = (chai.expect(1) as any).chai145UserResult()
        assert.equal(Object.is(returned, revoked.proxy), true)
        assert.equal(
          Object.is(
            (chai.expect(1) as any).chai145FunctionPayload,
            functionPayload
          ),
          true
        )
        assert.throws(
          () =>
            Reflect.get(chai.Assertion.prototype, 'chai145PrototypeAccessor'),
          /prototype accessors/
        )
        assert.equal(prototypeGetterCalls, 0)
        assert.equal(leakedPrototype, undefined)
        const helpers = chai.should()
        const shouldAssertion = Reflect.get(Object(1), 'should')
        shouldConstructor = Object.getPrototypeOf(shouldAssertion).constructor
        shouldEqual = Object.getOwnPropertyDescriptor(helpers, 'equal')!.value
        shouldEqual(1, 1)
        assertConstructor = Reflect.get(chai.assert, 'prototype').constructor
        assertConstructor(true)
        assert.equal(expect.getState().assertionCalls, 0)
        prototypeMethod.call(expect(1))
        assert.equal(expect.getState().assertionCalls, 1)
      })
    })
    const result = await file.run({
      runId: 'prototype-payload-regressions',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ actualPrototypePayloadRegressions: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
  assert.throws(() => new shouldConstructor(1).equal(1), /Next test|test file/)
  assert.throws(() => shouldEqual(1, 1), /disposed|Next test|test file/)
  assert.throws(() => assertConstructor(true), /Next test|test file/)
})
