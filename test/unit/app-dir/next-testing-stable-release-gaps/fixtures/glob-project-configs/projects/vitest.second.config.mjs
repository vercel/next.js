import { fileURLToPath } from 'node:url'
import { defineProject } from 'vitest/config'
export default defineProject(async () => ({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    name: 'second',
    include: ['second.case.mjs'],
    setupFiles: ['./second.setup.mjs'],
    provide: { project: 'second' },
  },
}))
