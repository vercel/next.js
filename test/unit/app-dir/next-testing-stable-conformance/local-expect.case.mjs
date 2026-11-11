/* eslint-disable react-hooks/rules-of-hooks, no-empty-pattern -- use is a fixture continuation; dependencies are destructured. */
import { test, expect, createExpect, afterAll } from 'vitest'
const trace = []
const manual = createExpect()
let tries = 0
test(
  'local retry retains assertion state',
  { retry: 1 },
  ({ expect: local }) => {
    local.assertions(1)
    local(true).toBe(true)
    trace.push(['retry', ++tries, local.getState().assertionCalls])
    if (tries === 1) throw new Error('retry body')
  }
)
test(
  'local repeats retain assertion state',
  { repeats: 1 },
  ({ expect: local }) => {
    local.assertions(1)
    local(true).toBe(true)
    trace.push(['repeat', local.getState().assertionCalls])
  }
)
test('manual counts are independent from runner counts', () => {
  manual.assertions(20)
  manual(1).toBe(1)
  expect.assertions(1)
  expect(1).toBe(1)
  trace.push(['manual', manual.getState().assertionCalls])
})
test('local counts take precedence over global counts', ({ expect: local }) => {
  expect.assertions(20)
  local.assertions(1)
  local(true).toBe(true)
  trace.push([
    'local',
    local.getState().assertionCalls,
    expect.getState().assertionCalls,
  ])
})
test('local missing assertion is a failure', ({ expect: local }) => {
  local.assertions(1)
})
test('local soft failures retain count failures', ({ expect: local }) => {
  local.assertions(2)
  local.soft(1).toBe(2)
})
test('local awaited assertions are observed', async ({ expect: local }) => {
  local.assertions(1)
  await local(Promise.resolve(1)).resolves.toBe(2)
})
test('separate instances have separate state', () => {
  const first = createExpect()
  const second = createExpect()
  first.setState({ assertionCalls: 12 })
  second(2).toBe(2)
  expect(first.getState().assertionCalls).toBe(12)
  expect(second.getState().assertionCalls).toBe(1)
  trace.push([
    'instances',
    first.getState().assertionCalls,
    second.getState().assertionCalls,
  ])
})
const extended = test.extend({ value: 42 })
extended(
  'fixture context does not eagerly create a local expect',
  ({ value }) => {
    expect.assertions(2)
    expect(value).toBe(42)
  }
)
extended('fixture can use a local expect', ({ expect: local, value }) => {
  local.assertions(1)
  local(value).toBe(42)
})
const dependent = test.extend({
  value: async ({}, use) => {
    expect(42).toBe(42)
    await use(42)
  },
})
dependent(
  'local counts take precedence over fixture setup assertions',
  ({ expect: local, value }) => {
    local.assertions(1)
    local(value).toBe(42)
  }
)
afterAll(() => console.log('LOCAL_EXPECT_TRACE=' + JSON.stringify(trace)))
