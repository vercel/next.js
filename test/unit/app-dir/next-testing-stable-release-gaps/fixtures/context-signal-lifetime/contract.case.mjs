import { test, expect } from 'vitest'
let saved
test('signal stays live on successful completion', ({ signal }) => {
  saved = signal
  expect(signal.aborted).toBe(false)
})
test('successful test did not claim cancellation', () =>
  expect(saved.aborted).toBe(false))
