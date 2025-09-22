process.env.RSPACK_BINDING = require('node:path').dirname(
  require.resolve('@next/rspack-binding')
)

const binding = require('@next/rspack-binding')

// Register the plugin `NextExternalsPlugin` exported by `crates/binding/src/lib.rs`.
binding.registerNextExternalsPlugin()

const core = require('@rspack/core')

const NextExternalsPlugin = core.experiments.createNativePlugin(
  'NextExternalsPlugin',
  function (options) {
    return options
  }
)

Object.defineProperty(core, 'NextExternalsPlugin', {
  value: NextExternalsPlugin,
})

module.exports = core
