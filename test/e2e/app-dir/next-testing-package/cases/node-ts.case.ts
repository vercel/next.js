import { expect, test, vi } from 'next/experimental/testing/vitest'

test('TypeScript authoring uses Next', () => {
  const add = vi.fn((a: number, b: number) => a + b)
  expect(add(2, 3)).toBe(5)
  expect(add).toHaveBeenCalledWith(2, 3)
})
