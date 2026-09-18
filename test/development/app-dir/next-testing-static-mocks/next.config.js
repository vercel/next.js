/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  transpilePackages: ['next-testing-cycle-package'],
  experimental: { turbopackModuleFragments: true },
  turbopack: {
    resolveAlias: { '@raw': './dependency.js?raw' },
    rules: {
      '*loader-factory.js': { loaders: ['./factory-loader.cjs'] },
      '*loaded-client-target.js': { loaders: ['./directive-loader.cjs'] },
    },
  },
}

module.exports = nextConfig
