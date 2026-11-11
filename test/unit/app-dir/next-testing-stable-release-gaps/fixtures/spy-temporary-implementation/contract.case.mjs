import { test, expect, vi } from 'vitest'
test('temporary implementation retains queue and restores after awaited callback', async () => {
  const mock = vi.fn(() => 1).mockImplementationOnce(() => 2)
  await mock.withImplementation(
    () => 3,
    async () => {
      await Promise.resolve()
      expect(mock()).toBe(3)
      expect(mock()).toBe(3)
    }
  )
  expect(mock()).toBe(2)
  expect(mock()).toBe(1)
  expect(mock.mock.results.map((result) => result.value)).toEqual([3, 3, 2, 1])
})
