// Regression guard for the napi-rs v2 worker-pool custom_gc crash. Runs a custom
// loader under workerThreads with enough getResolve() round-trips to exercise the
// napi Buffer/reference churn that used to crash the build. See:
// turbopack/crates/turbopack-node/src/worker_pool/worker_thread.rs
module.exports = {
  experimental: {
    turbopackPluginRuntimeStrategy:
      process.env.TEST_TURBOPACK_PLUGIN_RUNTIME_STRATEGY || 'workerThreads',
  },
  turbopack: {
    rules: { '*.stress': { as: '*.js', loaders: ['./resolve-loader.js'] } },
  },
}
