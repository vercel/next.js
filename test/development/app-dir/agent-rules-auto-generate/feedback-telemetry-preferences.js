const confPath = require.resolve('next/dist/compiled/conf', {
  paths: [process.cwd()],
})
const Conf = require(confPath)
const { Module } = require('module')

// Model Linux's XDG preference lookup independently of the host OS or container.
// Conf removes itself from the cache, so install a replacement module explicitly.
const preferencesModule = new Module(confPath)
preferencesModule.exports = class extends Conf {
  constructor(options) {
    super({
      ...options,
      cwd:
        process.env.XDG_CONFIG_HOME ||
        process.env.NEXT_TEST_TELEMETRY_CONFIG_DIR,
    })
  }
}
require.cache[confPath] = preferencesModule

const blockedFetch = globalThis.fetch
globalThis.fetch = (...args) => {
  process.stderr.write(
    process.env.XDG_CONFIG_HOME
      ? 'Redirected telemetry environment\n'
      : 'Original telemetry environment\n'
  )
  return blockedFetch(...args)
}
