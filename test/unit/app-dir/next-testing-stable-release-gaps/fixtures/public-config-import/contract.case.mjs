import { test, expect } from 'vitest'
test('config helper loads without a second controller', async () => {
  const { defineConfig } = await import('vitest/config')
  expect(defineConfig({ test: { globals: true } }).test.globals).toBe(true)
})
