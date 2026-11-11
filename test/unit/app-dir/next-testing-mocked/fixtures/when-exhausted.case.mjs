import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'

function record(label, value) {
  appendFileSync(
    process.env.NEXT_TESTING_WHEN_EXHAUSTED_EVIDENCE,
    JSON.stringify({ label, value }) + '\n'
  )
}
function capture(label, operation) {
  let returnedType = null
  let error = null
  try {
    returnedType = typeof operation()
  } catch (caught) {
    error = { name: caught.name, message: caught.message }
  }
  const row = {
    returnedType,
    error,
    assertionCalls: expect.getState().assertionCalls,
  }
  record(label, row)
  return row
}
async function captureAsync(label, operation) {
  let returnedType = null
  let error = null
  try {
    returnedType = typeof (await operation())
  } catch (caught) {
    error = { name: caught.name, message: caught.message }
  }
  const row = {
    returnedType,
    error,
    assertionCalls: expect.getState().assertionCalls,
  }
  record(label, row)
  return row
}

test('exhaustion supports positive and negated single-use behavior', () => {
  const spy = vi.fn()
  const chain = vi.when(spy).calledWith('one').thenReturnOnce(1)
  assert.equal(
    capture('one-before-negated', () => expect(chain).not.toHaveBeenExhausted())
      .error,
    null
  )
  assert.equal(
    capture('one-before-positive', () => expect(chain).toHaveBeenExhausted())
      .error.name,
    'AssertionError'
  )
  assert.equal(spy('one'), 1)
  assert.equal(
    capture('one-after-positive', () => expect(chain).toHaveBeenExhausted())
      .error,
    null
  )
  assert.equal(
    capture('one-after-negated', () => expect(chain).not.toHaveBeenExhausted())
      .error.name,
    'AssertionError'
  )
  assert.equal(expect.getState().assertionCalls, 4)
})

test('exhaustion keeps empty chains and behavior without actions unexhausted', () => {
  const spy = vi.fn()
  const empty = vi.when(spy)
  assert.equal(
    capture('empty-positive', () => expect(empty).toHaveBeenExhausted()).error
      .name,
    'AssertionError'
  )
  assert.equal(
    capture('empty-negated', () => expect(empty).not.toHaveBeenExhausted())
      .error,
    null
  )
  const noAction = empty.calledWith('missing', { nested: true })
  assert.equal(
    capture('no-action-positive', () => expect(noAction).toHaveBeenExhausted())
      .error.name,
    'AssertionError'
  )
  assert.equal(
    capture('no-action-negated', () =>
      expect(noAction).not.toHaveBeenExhausted()
    ).error,
    null
  )
  assert.equal(expect.getState().assertionCalls, 4)
})

test('exhaustion reports remaining finite actions and passes after their final call', () => {
  const spy = vi.fn()
  const chain = vi.when(spy).calledWith('finite').thenReturn(11, { times: 3 })
  const values = [spy('finite')]
  assert.equal(
    capture('finite-remaining', () => expect(chain).toHaveBeenExhausted()).error
      .name,
    'AssertionError'
  )
  values.push(spy('finite'), spy('finite'))
  assert.equal(
    capture('finite-exhausted', () => expect(chain).toHaveBeenExhausted())
      .error,
    null
  )
  record('finite-values', {
    values,
    calls: spy.mock.calls.length,
    assertionCalls: expect.getState().assertionCalls,
  })
  assert.deepEqual(values, [11, 11, 11])
})

test('exhaustion preserves infinite-action and unreachable-action diagnostics', () => {
  const spy = vi.fn()
  const unreachable = vi
    .when(spy)
    .calledWith('stack')
    .thenReturn('hidden', { times: 2 })
    .thenReturn('forever')
  assert.equal(
    capture('unreachable-before', () =>
      expect(unreachable).toHaveBeenExhausted()
    ).error.name,
    'AssertionError'
  )
  const value = spy('stack')
  assert.equal(
    capture('unreachable-after', () =>
      expect(unreachable).toHaveBeenExhausted()
    ).error.name,
    'AssertionError'
  )
  assert.equal(
    capture('unreachable-negated', () =>
      expect(unreachable).not.toHaveBeenExhausted()
    ).error,
    null
  )
  const infiniteSpy = vi.fn()
  const infinite = vi.when(infiniteSpy).calledWith('infinite').thenReturn(1)
  assert.equal(
    capture('infinite-before', () => expect(infinite).toHaveBeenExhausted())
      .error.name,
    'AssertionError'
  )
  assert.equal(infiniteSpy('infinite'), 1)
  assert.equal(
    capture('infinite-after', () => expect(infinite).toHaveBeenExhausted())
      .error,
    null
  )
  assert.equal(
    capture('infinite-after-negated', () =>
      expect(infinite).not.toHaveBeenExhausted()
    ).error.name,
    'AssertionError'
  )
  record('infinite-values', {
    value,
    assertionCalls: expect.getState().assertionCalls,
  })
  assert.equal(value, 'forever')
})

test('exhaustion rejects ordinary non-when inputs with the original diagnostic', () => {
  function regular() {}
  for (const [label, value] of [
    ['object', { value: 1 }],
    ['null', null],
    ['function', regular],
  ]) {
    assert.equal(
      capture('invalid-' + label, () => expect(value).toHaveBeenExhausted())
        .error.name,
      'TypeError'
    )
  }
  assert.equal(expect.getState().assertionCalls, 3)
})

test('exhaustion composes with promise chains and successful soft assertions', async () => {
  const spy = vi.fn()
  const chain = vi.when(spy).calledWith(1).thenReturnOnce(1)
  spy(1)
  assert.equal(
    (
      await captureAsync('promise-positive', () =>
        expect(Promise.resolve(chain)).resolves.toHaveBeenExhausted()
      )
    ).error,
    null
  )
  assert.equal(
    (
      await captureAsync('promise-negated', () =>
        expect(Promise.resolve(chain)).resolves.not.toHaveBeenExhausted()
      )
    ).error.name,
    'AssertionError'
  )
  const empty = vi.when(vi.fn())
  assert.equal(
    (
      await captureAsync('promise-empty', () =>
        expect(Promise.resolve(empty)).resolves.not.toHaveBeenExhausted()
      )
    ).error,
    null
  )
  assert.equal(
    (
      await captureAsync('promise-rejected', () =>
        expect(Promise.reject(chain)).rejects.toHaveBeenExhausted()
      )
    ).error,
    null
  )
  assert.equal(
    capture('soft-positive', () => expect.soft(chain).toHaveBeenExhausted())
      .error,
    null
  )
  assert.equal(expect.getState().assertionCalls, 5)
})
