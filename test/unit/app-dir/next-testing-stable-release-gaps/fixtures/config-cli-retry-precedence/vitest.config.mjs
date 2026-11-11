import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['*.case.mjs'], retry: 1 } })
