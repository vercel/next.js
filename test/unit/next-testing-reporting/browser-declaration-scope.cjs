const assert = require('node:assert/strict')
const root = 'next/dist/experimental/testing/'
const asyncPath = require.resolve(root + 'client/async-context')
const calls = []
let open = true
const closed = new Error('private closed declaration scope')
require.cache[asyncPath] = {
  id: asyncPath,
  filename: asyncPath,
  loaded: true,
  exports: {
    assertBrowserApiScope(kind) {
      calls.push(kind)
      if (!open) throw closed
    },
  },
}
const { guardedDeclaration } = require(root + 'client/api-scope')
const common = require(root + 'vitest')
const { initializeTestFile } = require(root + 'runner')
const file = initializeTestFile({
  fileId: 'fn-private',
  filePath: '/unit/fn-private.test.mjs',
})
const flags = {
  concurrent: false,
  only: false,
  skip: false,
  todo: false,
  shuffle: false,
}
const trace = []
;(async () => {
  let raw,
    suiteRaw,
    heldUnknown,
    frozenReached = 0
  try {
    await file.collect(async () => {
      const guarded = guardedDeclaration(common.test, true),
        suite = guardedDeclaration(common.describe, true)
      raw = guarded.fn
      suiteRaw = suite.fn
      assert.equal(raw, common.test.fn)
      assert.equal(suiteRaw, common.describe.fn)
      assert.equal(guarded.fn, raw)
      assert.equal(suite.fn, suiteRaw)
      for (const [target, view] of [
        [common.test, guarded],
        [common.describe, suite],
      ]) {
        const descriptor = Object.getOwnPropertyDescriptor(target, 'fn')
        assert.equal(descriptor.value, view.fn)
        assert.equal(descriptor.writable, false)
        assert.equal(descriptor.configurable, false)
      }
      raw.call(flags, 'raw', {}, () => {
        trace.push('raw')
      })
      raw.each.call(common.test, [[1], [2]])('each %i', (value) =>
        trace.push(value)
      )
      raw.for.call(common.test, [3])('for %i', (value) => trace.push(value))
      const collector = suiteRaw.call(flags, 'raw suite', {}, (provided) =>
        provided('child', () => trace.push('child'))
      )
      assert.equal(collector.type, 'collector')
      function unknown() {}
      function authored() {
        frozenReached++
      }
      Object.defineProperty(unknown, 'fn', {
        value: authored,
        configurable: true,
        writable: true,
      })
      heldUnknown = guardedDeclaration(unknown).fn
      assert.notEqual(heldUnknown, authored)
      open = false
      assert.throws(
        () => guarded.fn,
        (error) => error === closed
      )
      assert.throws(
        () => heldUnknown(),
        (error) => error === closed
      )
      assert.equal(frozenReached, 0)
      open = true
      function frozenUnknown() {}
      Object.defineProperty(frozenUnknown, 'fn', { value: authored })
      open = false
      assert.throws(
        () => guardedDeclaration(frozenUnknown).fn,
        (error) => error === closed
      )
      assert.equal(frozenReached, 0)
      open = true
    })
    const result = await file.run({
      runId: 'private',
      signal: new AbortController().signal,
    })
    assert.equal(result.interrupted, false)
    assert.deepEqual(
      result.cases.map((value) => value.status),
      ['passed', 'passed', 'passed', 'passed', 'passed']
    )
    assert.deepEqual(trace, ['raw', 1, 2, 3, 'child'])
    open = false
    assert.throws(
      () => heldUnknown(),
      (error) => error === closed
    )
    console.log(
      JSON.stringify({
        cases: result.cases.length,
        trace,
        exactIntrinsicIdentity: true,
        realEachForAndSuite: true,
        privateClosedGetApplyHeld: true,
        frozenUnknownTargetGuarded: true,
        guardCalls: calls.length,
      })
    )
  } finally {
    await file.dispose()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
