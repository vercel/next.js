import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  resolve: {
    alias: {
      '@source': fileURLToPath(new URL('./subject.mjs', import.meta.url)),
      '@source-extra': fileURLToPath(new URL('./extra.mjs', import.meta.url)),
      '@folder': fileURLToPath(new URL('./lib', import.meta.url)),
    },
  },
  test: { include: ['*.case.mjs'] },
})
