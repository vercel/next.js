import { test, expect } from 'vitest'
test('regular-run benchmark access has the reference diagnostic', async ({
  bench,
}) => {
  expect(typeof bench).toBe('function')
  expect(() => bench('addition', () => 1 + 1)).toThrow(
    'Cannot use the `bench` test-context fixture within a regular test run'
  )
})
