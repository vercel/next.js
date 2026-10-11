import { test, expect } from 'vitest'
import value from 'watch-subject'
import loaderValue from '../value.test-data'
import { setupValue, setupCalls } from '../setup'

test(`fresh ${value}`, async () => {
  console.log(`WATCH_FILE_PID=${process.pid}`)
  if (process.env.NEXT_TEST_WATCH_CRASH === '1') {
    console.log('WATCH_FILE_STARTED')
    await new Promise(() => {})
  }
  expect(value).toBe(process.env.NEXT_TEST_WATCH_VALUE)
  expect(setupValue).toBe(value)
  expect(setupCalls).toBe(1)
  expect(loaderValue).toBe('loader-value')
})
