const { defineConfig } = require('vitest/config')
const { value } = require('./value.cjs')
module.exports = defineConfig(async (env) => ({
  test: {
    include: ['*.case.mjs'],
    provide: { value, mode: env.mode, command: env.command },
  },
}))
