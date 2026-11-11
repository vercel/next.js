module.exports = {
  distDir: '.watch-output-first',
  experimental: { turbopackPluginRuntimeStrategy: 'childProcesses' },
  turbopack: {
    resolveAlias: { 'watch-subject': './lib/first.ts' },
    rules: { '*.test-data': { loaders: ['./value.loader.cjs'], as: '*.js' } },
  },
}
