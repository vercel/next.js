import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { createExpect, expect, test } from 'vitest'

function record(label, value) {
  appendFileSync(
    process.env.NEXT_TESTING_UNREACHABLE_EVIDENCE,
    JSON.stringify({ label, value }) + '\n'
  )
}
function capture(label, check, operation) {
  let returned = false
  let error = null
  try {
    operation()
    returned = true
  } catch (caught) {
    error = {
      name: caught.name,
      message: caught.message,
      showDiff: caught.showDiff,
      actualOwn: Object.hasOwn(caught, 'actual'),
      actualType: typeof caught.actual,
      expectedOwn: Object.hasOwn(caught, 'expected'),
      expectedType: typeof caught.expected,
      operatorOwn: Object.hasOwn(caught, 'operator'),
      operatorType: typeof caught.operator,
    }
  }
  const value = {
    returned,
    error,
    assertionCalls: check.getState().assertionCalls,
  }
  record(label, value)
  assert.equal(returned, false)
  assert.equal(error.name, 'AssertionError')
  return error
}

test('unreachable preserves default, undefined and empty diagnostics without assertion calls', () => {
  expect.assertions(0)
  for (const [label, args] of [
    ['default', []],
    ['undefined', [undefined]],
    ['empty', ['']],
  ]) {
    const error = capture(label, expect, () => expect.unreachable(...args))
    assert.equal(error.message, 'expected not to be reached')
  }
  assert.equal(expect.getState().assertionCalls, 0)
})

test('unreachable preserves custom diagnostics and detached invocation', () => {
  expect.assertions(0)
  const fail = expect.unreachable
  for (const message of ['branch', 'quotes " and\nline', 'λ 😀']) {
    const error = capture(message, expect, () =>
      Reflect.apply(fail, { unrelated: true }, [message])
    )
    assert.equal(error.message, `expected "${message}" not to be reached`)
  }
  assert.equal(expect.getState().assertionCalls, 0)
})

test('unreachable is available on local and context expectations with independent counts', ({
  expect: scoped,
}) => {
  scoped.assertions(0)
  const local = createExpect()
  local.assertions(0)
  const failLocal = local.unreachable
  const failScoped = scoped.unreachable
  const localError = capture('local', local, () => failLocal('local'))
  const scopedError = capture('context', scoped, () => failScoped('context'))
  assert.equal(localError.message, 'expected "local" not to be reached')
  assert.equal(scopedError.message, 'expected "context" not to be reached')
  record('independent-counts', {
    global: expect.getState().assertionCalls,
    local: local.getState().assertionCalls,
    context: scoped.getState().assertionCalls,
  })
})
