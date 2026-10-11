import { test, expect, beforeEach, describe } from 'vitest'
let attempts = 0
let failures = 0
let finished = 0
let repeatAttempts = 0
let expectedAttempts = 0
const values: string[] = []
beforeEach(({ onTestFailed, onTestFinished }) => {
  onTestFailed(() => {
    failures++
  })
  onTestFinished(() => {
    finished++
  })
})
test('retry listener', { retry: 1 }, () => {
  expect('stable').toMatchSnapshot()
  if (attempts++ === 0) throw new Error('expected first-attempt failure')
})

test.each([
  [1, 2, 3],
  [2, 4, 6],
])('adds %i and %i as case %#', (left, right, sum) => {
  values.push(`each:${left + right}:${sum}`)
})

test.for([{ label: 'answer', value: 42 }])('$label is $value', (item, ctx) => {
  values.push(`for:${item.value}:${ctx.signal.aborted}`)
})

test('repeat and retry', { repeats: 1, retry: 1 }, () => {
  values.push(`repeat:${repeatAttempts}`)
  if (repeatAttempts++ === 0) throw new Error('retry first repeat')
})

test.fails('expected failure retries', { retry: 1 }, ({ onTestFailed }) => {
  onTestFailed(() => values.push('expected-listener'))
  expectedAttempts++
  throw new Error('expected failure')
})

const extended = test.extend<{ value: string; derived: string }>({
  // eslint-disable-next-line no-empty-pattern
  value: async ({}, provide) => {
    values.push('base-setup')
    await provide('base')
    values.push('base-cleanup')
  },
  derived: async ({ value: renamed = 'default' }, provide) => {
    await provide(`${renamed}-derived`)
  },
})

extended('base fixture', ({ derived }) => values.push(derived))
describe('override', () => {
  extended.override({
    value: async ({ value }, provide) => {
      values.push(`override-from-${value}`)
      await provide('override')
      values.push('override-cleanup')
    },
  })
  extended('overridden fixture', ({ derived }) => values.push(derived))
})
extended('base fixture again', ({ derived }) => values.push(derived))

test('listener observation', () => {
  expect(failures).toBe(4)
  expect(finished).toBe(13)
  expect(expectedAttempts).toBe(2)
  expect(values).toEqual([
    'each:3:3',
    'each:6:6',
    'for:42:false',
    'repeat:0',
    'repeat:1',
    'repeat:2',
    'expected-listener',
    'expected-listener',
    'base-setup',
    'base-derived',
    'base-cleanup',
    'base-setup',
    'override-from-base',
    'override-derived',
    'override-cleanup',
    'base-cleanup',
    'base-setup',
    'base-derived',
    'base-cleanup',
  ])
})
