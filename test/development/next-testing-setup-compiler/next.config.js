module.exports = {
  distDir: '.configured-output',
  experimental: {
    turbopackPluginRuntimeStrategy:
      process.env.NEXT_TEST_PLUGIN_RUNTIME || 'childProcesses',
  },
  turbopack: {
    resolveAlias: { 'setup-project-alias': './lib/value.ts' },
    rules: { '*.test-data': { loaders: ['./value.loader.cjs'], as: '*.js' } },
  },
}
