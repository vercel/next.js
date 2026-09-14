const runtimeStrategy = process.env.TEST_TURBOPACK_PLUGIN_RUNTIME_STRATEGY

module.exports = {
  experimental: {
    turbopackPluginRuntimeStrategy: runtimeStrategy,
  },
  compiler: {
    defineServer: {
      'process.env.__TEST_BUILD_PID': String(process.pid),
    },
  },
  turbopack: {
    rules: {
      '*.pid': {
        as: '*.js',
        loaders: ['./pid-loader.js'],
      },
    },
  },
}
