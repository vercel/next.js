module.exports = {
  experimental: {
    turbopackPluginRuntimeStrategy:
      process.env.NEXT_TEST_PLUGIN_RUNTIME || 'childProcesses',
  },
  serverExternalPackages: ['next-testing-external-probe'],
  turbopack: {
    resolveAlias: { 'test-project-alias': './lib/aliased.ts' },
    rules: { '*.test-data': { loaders: ['./value.loader.cjs'], as: '*.js' } },
  },
}
