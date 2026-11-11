import { test, expect } from 'vitest'

test('alpha snapshot', () => {
  console.log(`WATCH_FILE_PID=${process.pid}`)
  console.log('PTY_ALPHA_LOG')
  expect('interactive snapshot').toMatchSnapshot()
})

test('alpha secondary', () => {
  console.error('PTY_STDERR_LOG')
  expect(true).toBe(true)
})
