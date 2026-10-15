import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { projects: ['./projects/vitest.*.config.mjs'] },
})
