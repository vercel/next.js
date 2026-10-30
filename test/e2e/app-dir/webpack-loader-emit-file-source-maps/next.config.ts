import type { NextConfig } from 'next'

const browserMaps = process.env.TEST_BROWSER_SOURCE_MAPS === 'true'
const nodeOutputPath =
  process.env.NODE_ENV === 'production'
    ? '../../static/media'
    : '../static/media'
const loaders = (outputPath: string) => [
  { loader: './loader.js', options: { outputPath } },
]

const nextConfig: NextConfig = {
  cacheComponents: false,
  productionBrowserSourceMaps: browserMaps,
  experimental: {
    cachedNavigations: false,
    turbopackModuleFragments: process.env.__NEXT_TEST_AXIS === 'A',
    serverSourceMaps:
      process.env.TEST_SERVER_SOURCE_MAPS === 'default'
        ? undefined
        : process.env.TEST_SERVER_SOURCE_MAPS === 'true',
  },
  turbopack: {
    rules: {
      '*.mapped': [
        { condition: 'browser', loaders: loaders('static/media'), as: '*.js' },
        { condition: 'node', loaders: loaders(nodeOutputPath), as: '*.js' },
        {
          condition: { not: { any: ['browser', 'node'] } },
          loaders: loaders('../static/media'),
          as: '*.js',
        },
      ],
    },
  },
  webpack(config, { isServer, nextRuntime, dev, webpack }) {
    // Webpack's dev devtool emits no maps for emitted files, so add them like Turbopack does.
    if (dev) {
      config.plugins.push(
        new webpack.SourceMapDevToolPlugin({
          filename: '[file].map',
          test: /shared\.js$/,
        })
      )
    } else {
      // Every compiler writes this public file, so give them the browser setting, like Turbopack.
      config.devtool = browserMaps ? 'source-map' : false
    }
    config.module.rules.push({
      test: /\.mapped$/,
      use: [
        {
          loader: require.resolve('./loader.js'),
          options: {
            outputPath: isServer
              ? nextRuntime === 'edge'
                ? '../static/media'
                : nodeOutputPath
              : 'static/media',
          },
        },
      ],
    })
    return config
  },
}

export default nextConfig
