/**
 * Webpack/Rspack config for bundling dev server startup modules.
 *
 * This bundles start-server.ts, router-server.ts, and their dependencies
 * into a single file to reduce module loading overhead during dev server boot.
 */

/* eslint-disable import/no-extraneous-dependencies */
const rspack = require('@rspack/core')
const path = require('path')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const DevToolsIgnorePlugin =
  require('./dist/build/webpack/plugins/devtools-ignore-list-plugin').default
/* eslint-enable import/no-extraneous-dependencies */

// Shared externals with the server runtime bundle
const sharedExternals = [
  'styled-jsx',
  'styled-jsx/style',
  '@opentelemetry/api',
  'next/dist/compiled/@ampproject/toolbox-optimizer',
  'next/dist/compiled/edge-runtime',
  'next/dist/compiled/@edge-runtime/ponyfill',
  'next/dist/compiled/undici',
  'next/dist/compiled/raw-body',
  'next/dist/server/capsize-font-metrics.json',
  'critters',
  'next/dist/compiled/node-html-parser',
  'next/dist/compiled/compression',
  'next/dist/compiled/jsonwebtoken',
  'next/dist/compiled/@opentelemetry/api',
  'next/dist/compiled/@mswjs/interceptors/ClientRequest',
  'next/dist/compiled/ws',
  'next/dist/compiled/tar',
  'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp',
]

// Dev server specific externals
const devServerExternals = [
  // Native bindings - cannot be bundled
  '@next/swc',
  // User-facing packages
  '@next/env',
  // Optional/native image dependencies
  'sharp',
]

// Patterns to externalize
const externalPatterns = [
  // Pre-compiled dependencies
  /^next\/dist\/compiled\//,
  // Telemetry - lazy loaded
  /telemetry\/storage/,
  // Hot reloaders - dynamically loaded based on bundler choice
  /hot-reloader-turbopack/,
  /hot-reloader-webpack/,
  /hot-reloader-rspack/,
  // MCP server - only needed when clients connect
  /\/mcp\//,
  // Turbopack internals - native bindings
  /turbopack/,
  // SWC bindings - native (matches ./swc, build/swc, etc.)
  /\/swc($|\/)/,
  // Download SWC - only needed for fallback, loads tar
  /download-swc/,
  // Sandbox - manipulates require.cache
  /web\/sandbox/,
  // Require hook - uses require.resolve with user-facing packages
  /require-hook/,
  // Config utils - uses require.resolve with dynamic webpack paths
  /config-utils/,
  // Config loading - uses dynamic import() for user config files
  /\/config$/,
  // Node environment extensions - sets up global handlers, avoid duplication
  /node-environment-extensions/,
  // TypeScript setup verification - uses dynamic require.resolve
  /verify-typescript-setup/,
  // Sharp image processing
  /@img\/sharp/,
]

// Map relative paths to proper external paths
// Note: Most mappings are now handled dynamically by toNextDistPath() in the externalHandler
const externalsMap = {
  // render-server pulls in next-server which has heavy dependencies (react-dom/server)
  // It's lazy-loaded at runtime when handling requests, not at startup
  './render-server': 'next/dist/server/lib/render-server',
  '../render-server': 'next/dist/server/lib/render-server',
  // next/dist/server/next (the main Next.js server) - heavy, only needed for request handling
  '../next': 'next/dist/server/next',
}

// Regex-based externals mapping
const externalsRegexMap = {
  '(.*)trace/tracer$': 'next/dist/server/lib/trace/tracer',
}

/**
 * Convert an absolute path within dist/ to a next/dist/... style import
 * @param {string} absolutePath
 * @returns {string|null}
 */
function toNextDistPath(absolutePath) {
  const normalizedPath = absolutePath.replace(/\\/g, '/')
  const distIndex = normalizedPath.indexOf('/dist/')
  if (distIndex === -1) return null

  // Get the path after /dist/ and convert to next/dist/...
  const relativePath = normalizedPath.substring(distIndex + 1) // removes leading /
  return `next/${relativePath.replace(/\.js$/, '')}`
}

/**
 * @param {Object} options
 * @param {boolean} options.dev - Development mode
 * @returns {import('@rspack/core').Configuration}
 */
module.exports = ({ dev }) => {
  const externalHandler = ({ context, request, getResolve }, callback) => {
    ;(async () => {
      // Handle compiled dependencies with complex paths
      if (
        request.match(
          /next[/\\]dist[/\\]compiled[/\\](babel|webpack|source-map|semver|jest-worker|stacktrace-parser|@ampproject\/toolbox-optimizer)/
        )
      ) {
        callback(null, 'commonjs ' + request)
        return
      }

      // Handle image optimizer and test mode
      if (request.match(/(server\/image-optimizer|experimental\/testmode)/)) {
        callback(null, 'commonjs ' + request)
        return
      }

      // Handle .external.js files
      if (request.match(/\.external(\.js)?$/)) {
        try {
          const resolve = getResolve()
          const resolved = await resolve(context, request)
          const nextDistPath = toNextDistPath(resolved)
          if (nextDistPath) {
            callback(null, `commonjs ${nextDistPath}`)
            return
          }
        } catch {
          // Resolution failed, use request as-is
        }
        callback(null, `commonjs ${request}`)
        return
      }

      // Handle pattern-based externals - resolve and convert to next/dist/... paths
      for (const pattern of externalPatterns) {
        if (pattern.test(request)) {
          // Try to resolve and get proper next/dist/... path
          try {
            const resolve = getResolve()
            const resolved = await resolve(context, request)
            const nextDistPath = toNextDistPath(resolved)
            if (nextDistPath) {
              callback(null, `commonjs ${nextDistPath}`)
              return
            }
          } catch {
            // Resolution failed, use request as-is
          }
          callback(null, 'commonjs ' + request)
          return
        }
      }

      // Handle regex map externals
      const regexMatch = Object.keys(externalsRegexMap).find((regex) =>
        new RegExp(regex).test(request)
      )
      if (regexMatch) {
        callback(null, 'commonjs ' + externalsRegexMap[regexMatch])
        return
      }

      callback()
    })()
  }

  return {
    entry: {
      'start-server': path.join(__dirname, 'dist/server/lib/start-server.js'),
    },
    target: 'node',
    mode: dev ? 'development' : 'production',
    output: {
      path: path.join(__dirname, 'dist/compiled/dev-server'),
      filename: '[name].js',
      libraryTarget: 'commonjs2',
    },
    devtool: 'source-map',
    optimization: {
      moduleIds: 'named',
      minimize: !dev,
      ...(dev
        ? {}
        : {
            minimizer: [
              new rspack.SwcJsMinimizerRspackPlugin({
                minimizerOptions: {
                  mangle: false, // Keep readable for debugging
                },
              }),
            ],
          }),
    },
    plugins: [
      new rspack.DefinePlugin({
        'typeof window': JSON.stringify('undefined'),
        // Replace process.env.NODE_ENV with 'development' since this bundle
        // is only used by the dev server. This ensures loadEnvConfig gets
        // the correct value for loading .env.development files.
        'process.env.NODE_ENV': JSON.stringify('development'),
      }),
      new rspack.BannerPlugin({
        banner: '/* Bundled dev server - reduces module loading overhead */',
        raw: true,
      }),
      process.env.ANALYZE &&
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: path.join(
            __dirname,
            'dist/compiled/dev-server/bundle-report.html'
          ),
          openAnalyzer: false,
        }),
      // Add ignoreList to source maps so internal frames are hidden in error stacks
      new DevToolsIgnorePlugin({
        shouldIgnorePath: () => true, // All sources in this bundle are internal
      }),
    ].filter(Boolean),
    resolve: {
      extensions: ['.js', '.json'],
    },
    externals: [
      ...sharedExternals,
      ...devServerExternals,
      externalsMap,
      externalHandler,
    ],
    externalsPresets: {
      node: true,
    },
    stats: process.env.ANALYZE_REASONS
      ? {
          preset: 'verbose',
          reasons: true,
          modulesSpace: Infinity,
        }
      : {
          preset: 'errors-warnings',
          assets: true,
        },
  }
}
