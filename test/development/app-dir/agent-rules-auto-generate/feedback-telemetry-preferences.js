const confPath = require.resolve('next/dist/compiled/conf', {
  paths: [process.cwd()],
})
const Conf = require(confPath)
const Module = require('module')

// Model Linux's XDG preference lookup independently of the host OS or container.
class TelemetryPreferences extends Conf {
  constructor(options) {
    super({
      ...options,
      cwd:
        process.env.XDG_CONFIG_HOME ||
        process.env.NEXT_TEST_TELEMETRY_CONFIG_DIR,
    })
  }
}

// Match the import rather than its resolved filename: Windows' short and long
// paths can give this preload and the CLI different cache keys for the same file.
const originalRequire = Module.prototype.require
Module.prototype.require = function (request) {
  if (request === 'next/dist/compiled/conf') {
    return TelemetryPreferences
  }
  return originalRequire.apply(this, arguments)
}

const blockedFetch = globalThis.fetch
globalThis.fetch = (...args) => {
  process.stderr.write(
    process.env.XDG_CONFIG_HOME
      ? 'Redirected telemetry environment\n'
      : 'Original telemetry environment\n'
  )
  return blockedFetch(...args)
}
