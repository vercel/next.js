const runtimeStrategy = process.env.TEST_TURBOPACK_PLUGIN_RUNTIME_STRATEGY

module.exports = {
  experimental: {
    turbopackPluginRuntimeStrategy: runtimeStrategy,
    // `buildPid` below is the pid of the process that evaluates this config.
    // With the Turbopack build worker, Turbopack (and so `workerThreads`
    // loaders) runs in a separate process that doesn't evaluate the config,
    // so compile in the main build process to compare against it.
    turbopackBuildWorker: false,
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
