import { defineConfig } from 'vitest/config'
import { value } from './value'
export default defineConfig(async (env) => ({
  test: {
    include: ['*.case.mjs'],
    provide: { value, mode: env.mode, command: env.command },
  },
}))
