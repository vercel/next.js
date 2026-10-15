import { test, expect } from 'vitest'
test('cooperative timeout', { timeout: 25 }, async ({ signal }) => {
  await new Promise((resolve) =>
    signal.addEventListener('abort', resolve, { once: true })
  )
})
test('case after timeout still executes', () => expect(42).toBe(42))
