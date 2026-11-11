import { test, expect } from 'vitest'
let attempts = 0
test('stable retry counters', { retry: 1 }, () => {
  expect({ value: 42 }).toMatchSnapshot()
  if (attempts++ === 0) throw new Error('retry snapshot')
})
