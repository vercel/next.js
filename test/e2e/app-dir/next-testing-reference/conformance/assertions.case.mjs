import { expect, it, vi } from 'vitest'

it('awaits promise assertions and tracks mock calls and results', async () => {
  await expect(Promise.resolve({ total: 10 })).resolves.toEqual({ total: 10 })
  await expect(Promise.reject(new Error('reference failure'))).rejects.toThrow(
    'reference failure'
  )
  const add = vi.fn((a, b) => a + b)
  expect(add(2, 3)).toBe(5)
  expect(add).toHaveBeenCalledExactlyOnceWith(2, 3)
  expect(add.mock.results).toEqual([{ type: 'return', value: 5 }])
  add.mockClear()
  expect(add).not.toHaveBeenCalled()
  expect(add(3, 4)).toBe(7)
})
