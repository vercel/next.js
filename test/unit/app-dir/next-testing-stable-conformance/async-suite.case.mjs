import { beforeEach, describe, expect, test } from 'vitest'

describe('asynchronous parent', async () => {
  await Promise.resolve()
  let prepared = 0
  beforeEach(() => {
    prepared++
  })
  test('collected after await', () => {
    expect(prepared).toBe(1)
  })
  describe('nested asynchronous suite', async () => {
    await Promise.resolve()
    test('retains nested ownership', () => {
      expect(prepared).toBe(2)
    })
  })
})

describe('synchronous sibling', () => {
  test('does not inherit asynchronous hooks', () => {
    expect(true).toBe(true)
  })
})

describe.each([1, 2])('asynchronous row %s', async (value) => {
  await Promise.resolve()
  test('retains row value', () => {
    expect(value).toBeGreaterThan(0)
  })
})

describe.skip('asynchronous skipped suite', async () => {
  await Promise.resolve()
  test('is collected but skipped', () => {
    throw new Error('Skipped suite body must not execute')
  })
})
