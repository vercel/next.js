import { test, expect } from 'vitest'
test('portable error and property snapshots', () => {
  expect(() => {
    throw new Error('release error')
  }).toThrowErrorMatchingSnapshot()
  expect({ id: 'dynamic-id', nested: { number: 42 } }).toMatchSnapshot({
    id: expect.any(String),
  })
})
