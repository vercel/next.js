import { expect, test } from 'vitest'

test('uses the fresh compiler child environment in its parent-owned worker', () => {
  expect(process.env.NEXT_TEST_BROKER_ENV_PROBE).toBe('resolved-child')
  console.log('BROKER_FILE_PID=' + process.pid)
})
