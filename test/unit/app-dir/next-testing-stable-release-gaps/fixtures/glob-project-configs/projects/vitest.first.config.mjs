import { fileURLToPath } from 'node:url'
import { defineProject } from 'vitest/config'
export default defineProject(async () => ({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    name: 'first',
    include: ['first.case.mjs'],
    setupFiles: ['./first.setup.mjs'],
    provide: { project: 'first' },
  },
}))
