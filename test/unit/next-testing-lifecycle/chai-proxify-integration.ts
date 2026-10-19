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
import { initializeTestFile } from 'next/dist/experimental/testing/runner'
import { chai, expect, test } from 'next/dist/experimental/testing/vitest'
import { chai as primitiveChai } from 'next/dist/compiled/next-test-primitives'

// The pinned Chai utility declaration returns object and requires the optional
// runtime name. Keep this runtime-only test adapter local to the fixture.
function proxify<T extends object>(value: T, ...name: [] | [string]): T {
  return Reflect.apply(chai.util.proxify, chai.util, [value, ...name]) as T
}

async function withFile(
  body: (file: ReturnType<typeof initializeTestFile>) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-proxify-'))
  const file = initializeTestFile({
    fileId: 'entry',
    filePath: join(directory, 'proxify.test.ts'),
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

it('matches the complete genuine pristine proxify dictionary from the original utility fixture', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-proxify-contract-'))
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
        runId: 'proxify-contract',
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
          actualProxifyResult: result,
          completeActualUtilityRows: rows,
          completePristineUtilityRows: pristine,
        })
      )
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        ['passed', 'passed', 'passed']
      )
      assert.deepEqual(result.errors, [])
      assert.deepEqual(
        rows.find((row) => row.label === 'proxify'),
        pristine.find((row: { label: string }) => row.label === 'proxify')
      )
    })
  } finally {
    if (previous === undefined) delete process.env.NEXT_TESTING_CHAI141_EVIDENCE
    else process.env.NEXT_TESTING_CHAI141_EVIDENCE = previous
    await rm(directory, { recursive: true, force: true })
  }
})

it('preserves ordinary payload identity, function calls, excluded keys and mutable Proxy observations', async () => {
  await withFile(async (file) => {
    await file.collect(async () => {
      test('payloads', () => {
        const oldUseProxy = chai.config.useProxy
        const oldExcluded = chai.config.proxyExcludedKeys
        const OriginalProxy = globalThis.Proxy
        const calls: unknown[] = []
        try {
          chai.config.useProxy = true
          const payload = { marker: 1 }
          const first = proxify(payload)
          const second = proxify(payload)
          assert.notEqual(first, payload)
          assert.notEqual(first, second)
          assert.equal(first.marker, 1)
          chai.config.proxyExcludedKeys = [...oldExcluded, 'notPresent']
          assert.equal(Reflect.get(first, 'notPresent'), undefined)
          assert.throws(
            () => Reflect.get(first, 'mraker'),
            /Did you mean "marker"/
          )
          const callable = proxify(function sum(a: number, b: number) {
            return a + b
          })
          assert.equal(callable(2, 3), 5)
          globalThis.Proxy = new OriginalProxy(OriginalProxy, {
            construct(target, args) {
              calls.push(args[0])
              return Reflect.construct(target, args)
            },
          })
          const observable = proxify(payload)
          assert.equal(observable.marker, 1)
          assert.equal(calls.length, 1)
          assert.equal(calls[0], payload)
          globalThis.Proxy = OriginalProxy
          chai.config.useProxy = false
          assert.equal(proxify(payload), payload)
          assert.equal(proxify(callable), callable)
          assert.equal(expect.getState().assertionCalls, 0)
        } finally {
          globalThis.Proxy = OriginalProxy
          chai.config.useProxy = oldUseProxy
          chai.config.proxyExcludedKeys = oldExcluded
        }
      })
    })
    const result = await file.run({
      runId: 'payloads',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ proxifyPayloadResult: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})

it('keeps raw and wrapped assertion chains, methods and async assertions usable with their original counts', async () => {
  await withFile(async (file) => {
    await file.collect(async () => {
      test('assertions', async () => {
        const original = chai.expect(3)
        const proxied = proxify(original)
        assert.notEqual(proxied, original)
        proxied.to.equal(3)
        const method = proxify(original.equal, 'equal')
        method(3)
        const prototypeMethod = proxify(
          Reflect.get(
            chai.Assertion.prototype,
            'equal'
          ) as typeof original.equal,
          'equal'
        )
        prototypeMethod.call(original, 3)
        await (
          proxify(chai.expect(Promise.resolve(4))) as unknown as {
            resolves: { equal(value: number): Promise<unknown> }
          }
        ).resolves.equal(4)
        await proxify(expect(Promise.resolve(5))).resolves.equal(5)
        await proxify(
          expect(Promise.reject(new Error('rejected')))
        ).rejects.toThrow('rejected')
        assert.equal(expect.getState().assertionCalls, 2)
        const before = expect.getState().assertionCalls
        const oldUseProxy = chai.config.useProxy
        try {
          chai.config.useProxy = false
          assert.equal(proxify(original), original)
          const wrapped = expect(6)
          assert.equal(proxify(wrapped), wrapped)
          wrapped.to.equal(6)
        } finally {
          chai.config.useProxy = oldUseProxy
        }
        assert.equal(expect.getState().assertionCalls, before + 1)
      })
    })
    const result = await file.run({
      runId: 'assertions',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ proxifyAssertionResult: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})

it('keeps the original assertion lifecycle for proxified assertions and methods across files', async () => {
  let assertion: ReturnType<typeof chai.expect> | undefined
  let method: ReturnType<typeof chai.expect>['equal'] | undefined
  await withFile(async (file) => {
    await file.collect(async () => {
      test('origin', () => {
        assertion = proxify(chai.expect(1))
        method = proxify(assertion.equal, 'equal')
        assertion.equal(1)
        method(1)
      })
    })
    const result = await file.run({
      runId: 'origin',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ proxifyOriginResult: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
  assert.throws(
    () => assertion!.equal(1),
    /scope|closed|finished|active|operation/i
  )
  assert.throws(() => method!(1), /scope|closed|finished|active|operation/i)
  await withFile(async (file) => {
    await file.collect(async () => {
      test('later', () => {
        assert.throws(
          () => proxify(assertion!).equal(1),
          /scope|closed|finished|active|operation/i
        )
        assert.throws(
          () => proxify(method!)(1),
          /scope|closed|finished|active|operation/i
        )
        proxify(chai.expect(2)).equal(2)
        // Raw ordinary library objects still follow the actual library behavior.
        const raw = primitiveChai.expect(3)
        Reflect.apply(primitiveChai.util.proxify, primitiveChai.util, [
          raw,
        ]).equal(3)
      })
    })
    const result = await file.run({
      runId: 'later',
      signal: new AbortController().signal,
    })
    console.log(JSON.stringify({ proxifyLaterResult: result }))
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})

it('matches genuine pristine resolves and rejects proxies used as proxify inputs', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'next-chai-proxify-async-contract-')
  )
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
      join(__dirname, 'chai-proxify-async-contract.mjs.txt'),
      join(directory, 'chai-proxify-async-contract.mjs')
    )
    await withFile(async (file) => {
      await file.collect(
        () => import(join(directory, 'chai-proxify-async-contract.mjs'))
      )
      const result = await file.run({
        runId: 'proxify-contract',
        signal: new AbortController().signal,
      })
      const rows = (await readFile(evidence, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      const pristine = JSON.parse(
        await readFile(
          join(__dirname, 'chai-proxify-async-pristine.json'),
          'utf8'
        )
      )
      console.log(
        JSON.stringify({
          actualProxifyAsyncInputResult: result,
          completeActualAsyncInputRows: rows,
          completePristineAsyncInputRows: pristine,
        })
      )
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        ['passed', 'passed']
      )
      assert.deepEqual(result.errors, [])
      assert.deepEqual(rows, pristine)
    })
  } finally {
    if (previous === undefined) delete process.env.NEXT_TESTING_CHAI141_EVIDENCE
    else process.env.NEXT_TESTING_CHAI141_EVIDENCE = previous
    await rm(directory, { recursive: true, force: true })
  }
})
