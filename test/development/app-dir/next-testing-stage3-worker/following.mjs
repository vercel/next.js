import { test, expect } from 'vitest'
import { retryAttempt } from './subject'

test('following file is clean', () => {
  expect(process.exitCode).not.toBe(7)
  expect(retryAttempt()).toBe('retry')
})
