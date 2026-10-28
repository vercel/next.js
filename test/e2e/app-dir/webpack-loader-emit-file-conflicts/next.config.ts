import type { NextConfig } from 'next'

const outputPath =
  process.env.NODE_ENV === 'production'
    ? '../../static/media'
    : '../static/media'

const loaderNames: Record<string, string> = {
  'per-compiler': 'compiler',
  'same-map': 'map',
}

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  turbopack: {
    rules: {
      '*.first': {
        loaders: [{ loader: './first-loader.js', options: { outputPath } }],
        as: '*.js',
      },
      '*.second': {
        loaders: [{ loader: './second-loader.js', options: { outputPath } }],
        as: '*.js',
      },
      '*.same-map': {
        loaders: [{ loader: './map-loader.js', options: { outputPath } }],
        as: '*.js',
      },
      '*.name': {
        loaders: [{ loader: './name-loader.js', options: { outputPath } }],
        as: '*.js',
      },
      '*.route': {
        loaders: [{ loader: './route-loader.js', options: { outputPath } }],
        as: '*.js',
      },
      '*.per-compiler': [
        {
          condition: 'browser',
          loaders: [
            {
              loader: './compiler-loader.js',
              options: { outputPath: 'static/media' },
            },
          ],
          as: '*.js',
        },
        {
          condition: 'node',
          loaders: [
            { loader: './compiler-loader.js', options: { outputPath } },
          ],
          as: '*.js',
        },
      ],
    },
  },
  webpack(config, { isServer }) {
    for (const extension of [
      'first',
      'second',
      'per-compiler',
      'route',
      'same-map',
      'name',
    ]) {
      config.module.rules.push({
        test: new RegExp(`\\.${extension}$`),
        use: [
          {
            loader: require.resolve(
              `./${loaderNames[extension] ?? extension}-loader.js`
            ),
            options: {
              outputPath: isServer ? outputPath : 'static/media',
            },
          },
        ],
      })
    }
    return config
  },
}

export default nextConfig
