process.env.RSPACK_BINDING = require('node:path').dirname(
  require.resolve('@next/rspack-binding')
)

const binding = require('@next/rspack-binding')

// Register the plugins exported by `crates/binding/src/lib.rs`.
binding.registerNextExternalsPlugin()
binding.registerForceCompleteRuntimePlugin()

const core = require('@rspack/core')

const NextExternalsPlugin = core.experiments.createNativePlugin(
  'NextExternalsPlugin',
  function (options) {
    return options
  }
)

const ForceCompleteRuntimePlugin = core.experiments.createNativePlugin(
  'ForceCompleteRuntimePlugin',
  function () {
    return {}
  }
)

Object.defineProperty(core, 'NextExternalsPlugin', {
  value: NextExternalsPlugin,
})

Object.defineProperty(core, 'ForceCompleteRuntimePlugin', {
  value: ForceCompleteRuntimePlugin,
})

module.exports = core
