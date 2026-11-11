import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { test, vi, expect } from 'vitest'

function record(label, value) {
  appendFileSync(
    process.env.NEXT_TESTING_WHEN_EVIDENCE,
    JSON.stringify({ label, value }) + '\n'
  )
}
function errorOf(fn) {
  try {
    fn()
    return null
  } catch (error) {
    return { name: error.name, message: error.message }
  }
}

test('when matches deep, iterable and asymmetric arguments', () => {
  const spy = vi.fn(() => 'fallback')
  const chain = vi.when(spy)
  const branch = chain
    .calledWith({ nested: [1, 2] }, new Set([3]))
    .thenReturn('deep')
  const sameBranch = branch.thenReturnOnce('first')
  chain
    .calledWith(expect.any(Number), expect.objectContaining({ key: 4 }))
    .thenReturn('asymmetric')
  const values = [
    spy({ nested: [1, 2] }, new Set([3])),
    spy({ nested: [1, 2] }, new Set([3])),
    spy(8, { key: 4, extra: true }),
    spy('other'),
  ]
  record('matching', {
    values,
    sameBranch: sameBranch === branch,
    chain: vi.isWhenChain(chain),
    branch: vi.isWhenChain(branch),
    plain: vi.isWhenChain({}),
    mock: vi.isWhenChain(spy),
  })
  assert.deepEqual(values, ['first', 'deep', 'asymmetric', 'fallback'])
})

test('when stacks once and times actions before their earlier fallback', () => {
  const spy = vi.fn(() => 'unmatched')
  const chain = vi
    .when(spy)
    .calledWith('key')
    .thenReturn('always')
    .thenReturn('twice', { times: 2 })
    .thenReturnOnce('once')
  const values = Array.from({ length: 5 }, () => spy('key'))
  const errors = [
    errorOf(() => chain.thenReturn('bad', { times: 0 })),
    errorOf(() => chain.thenReturn('bad', { times: -1 })),
  ]
  record('limits', { values, errors })
  assert.deepEqual(values, ['once', 'twice', 'twice', 'always', 'always'])
  assert.deepEqual(
    errors.map((error) => error.name),
    ['RangeError', 'RangeError']
  )
})

test('when returns, resolves, throws and rejects exact configured values', async () => {
  const spy = vi.fn(() => 'fallback')
  const thrown = new Error('sync')
  const rejected = new Error('async')
  const value = { answer: 42 }
  const chain = vi.when(spy)
  chain.calledWith('return').thenReturn(value)
  chain.calledWith('resolve').thenResolveOnce(value)
  chain.calledWith('throw').thenThrowOnce(thrown)
  chain.calledWith('reject').thenRejectOnce(rejected)
  const returned = spy('return')
  const resolved = await spy('resolve')
  let caughtSync, caughtAsync
  try {
    spy('throw')
  } catch (error) {
    caughtSync = error
  }
  try {
    await spy('reject')
  } catch (error) {
    caughtAsync = error
  }
  const rows = {
    returned: returned === value,
    resolved: resolved === value,
    thrown: caughtSync === thrown,
    rejected: caughtAsync === rejected,
    afterResolve: spy('resolve'),
    afterThrow: spy('throw'),
    afterReject: spy('reject'),
  }
  record('actions', rows)
  assert.deepEqual(rows, {
    returned: true,
    resolved: true,
    thrown: true,
    rejected: true,
    afterResolve: 'fallback',
    afterThrow: 'fallback',
    afterReject: 'fallback',
  })
})

test('when preserves default, custom and throwing unmatched behavior', () => {
  const original = (a, b) => a + b
  const fallback = vi.fn(original)
  vi.when(fallback).calledWith(1, 2).thenReturn(100)
  const empty = vi.fn()
  vi.when(empty)
  const custom = vi.fn(original)
  const calls = []
  vi.when(custom, {
    onUnmatched: (...args) => {
      calls.push(args)
      return args.join(':')
    },
  })
  const throwing = vi.fn()
  vi.when(throwing, { onUnmatched: 'throw' })
  const rows = {
    values: [fallback(1, 2), fallback(2, 3), custom('a', 'b')],
    empty: empty('none') === undefined,
    customCalls: calls,
    error: errorOf(() => throwing({ key: 1 }, 'x')),
    notMock: errorOf(() => vi.when(() => 1)),
  }
  const receiver = { marker: 'receiver' }
  const receiverSpy = vi.fn(function (value) {
    return { marker: this?.marker ?? null, value }
  })
  const before = receiverSpy.call(receiver, 1)
  const detachedWhen = vi.when
  const receiverChain = Reflect.apply(detachedWhen, { foreign: true }, [
    receiverSpy,
  ])
  const detachedCalledWith = receiverChain.calledWith
  const receiverBranch = Reflect.apply(detachedCalledWith, { foreign: true }, [
    2,
  ])
  const returnedBranch = Reflect.apply(
    receiverBranch.thenReturn,
    { foreign: true },
    ['matched']
  )
  record('receivers', {
    before,
    unmatched: receiverSpy.call(receiver, 3),
    matched: receiverSpy.call(receiver, 2),
    branchSame: returnedBranch === receiverBranch,
    detected: Reflect.apply(vi.isWhenChain, { foreign: true }, [receiverChain]),
  })
  assert.equal(returnedBranch, receiverBranch)
  record('unmatched', rows)
  assert.deepEqual(rows.values, [100, 5, 'a:b'])
  assert.equal(rows.empty, true)
  assert.equal(rows.error.name, 'Error')
  assert.equal(rows.notMock.name, 'TypeError')
})

test('when disposal restores the original mock implementation and ordinary resets still work', () => {
  const original = (value) => value * 2
  const spy = vi.fn(original)
  const chain = vi.when(spy).calledWith(2).thenReturn(100)
  const before = spy(2)
  chain[Symbol.dispose]()
  const after = spy(2)
  const restoredIdentity = spy.getMockImplementation() === original
  const blank = vi.fn()
  const blankChain = vi.when(blank).calledWith(1).thenReturn(9)
  blankChain[Symbol.dispose]()
  const blankUndefined = blank(1) === undefined
  vi.when(spy).calledWith(3).thenReturn(7)
  spy.mockClear()
  const afterClear = spy(3)
  spy.mockReset()
  const afterReset = spy(3)
  const object = { multiply: original }
  const method = vi.spyOn(object, 'multiply')
  vi.when(method).calledWith(4).thenReturn(12)
  const spied = object.multiply(4)
  vi.restoreAllMocks()
  const restored = object.multiply(4)
  record('cleanup', {
    before,
    after,
    restoredIdentity,
    blankUndefined,
    afterClear,
    afterReset,
    spied,
    restored,
    methodRestored: object.multiply === original,
  })
  assert.deepEqual(
    [before, after, afterClear, afterReset, spied, restored],
    [100, 4, 7, 6, 12, 8]
  )
  assert.equal(
    restoredIdentity && blankUndefined && object.multiply === original,
    true
  )
})

test('when uses the existing custom equality testers for argument matching', () => {
  expect.addEqualityTesters([
    (left, right) =>
      left?.kind === 'named' && right?.kind === 'named'
        ? left.name.toLowerCase() === right.name.toLowerCase()
        : undefined,
  ])
  const spy = vi.fn(() => 'fallback')
  vi.when(spy).calledWith({ kind: 'named', name: 'VALUE' }).thenReturn('equal')
  const value = spy({ kind: 'named', name: 'value' })
  record('testers', { value })
  assert.equal(value, 'equal')
})
