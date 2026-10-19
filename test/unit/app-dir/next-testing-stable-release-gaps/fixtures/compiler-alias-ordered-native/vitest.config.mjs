import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
const target = (path) => fileURLToPath(new URL(path, import.meta.url))
export default defineConfig({
  resolve: {
    alias: [
      { find: '@root/specific', replacement: target('./specific') },
      { find: '@root', replacement: target('./broad') },
      { find: '@root/shadow', replacement: target('./never') },
    ],
  },
  test: { include: ['*.case.mjs'] },
})
