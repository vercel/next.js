import { test, expect, beforeEach } from 'vitest'
let attempts = 0
let failures = 0
let finished = 0
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
test('listener observation', () => {
  expect(failures).toBe(1)
  expect(finished).toBe(2)
})
