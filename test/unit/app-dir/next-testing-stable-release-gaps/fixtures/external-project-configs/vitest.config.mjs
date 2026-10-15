import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    projects: [
      './projects/vitest.first.config.mjs',
      './projects/vitest.second.config.mjs',
    ],
  },
})
