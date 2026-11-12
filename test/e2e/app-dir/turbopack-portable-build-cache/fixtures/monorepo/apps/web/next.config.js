const path = require('path')

// The workspace root (two levels up) is the project root, so that the shared
// packages outside of the app directory are part of the build.
const workspaceRoot = path.join(__dirname, '..', '..')

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ['@portable/ui'],
  turbopack: {
    root: workspaceRoot,
    resolveAlias: {
      'resolve-alias-target': './lib/resolve-alias-target.js',
    },
    rules: {
      '*.marker.js': {
        loaders: ['./loaders/marker-loader.js'],
        as: '*.js',
      },
    },
  },
}

module.exports = nextConfig
