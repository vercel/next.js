import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Run with the pinned Vitest reference and, independently, Next's API adapter.
// This is intentionally not discovered by the repository's Jest runner.
let active = 0
let attempts = 0

describe('cleanup and retries', () => {
  beforeAll(() => {
    active += 10
    return () => {
      active -= 10
    }
  })
  beforeEach(() => {
    active += 1
    return () => {
      active -= 1
    }
  })
  it('retries with cleanup between attempts', { retry: 2 }, () => {
    expect(active).toBe(11)
    attempts += 1
    expect(attempts).toBe(3)
  })
})

afterAll(() => {
  expect(active).toBe(0)
  expect(attempts).toBe(3)
})
