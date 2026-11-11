import { defineConfig } from 'vitest/config'
const value = await Promise.resolve(42)
export default defineConfig(
  Promise.resolve({ test: { include: ['*.case.mjs'], provide: { value } } })
)
