import type { NextConfig } from 'next'

const nodeOutputPath =
  process.env.NODE_ENV === 'production'
    ? '../../static/media'
    : '../static/media'

function emitLoaders(outputPath: string) {
  return [
    { loader: './loaders/chain.js', options: { outputPath } },
    { loader: './loaders/emit.js', options: { outputPath } },
  ]
}

const fileLoader = {
  loader: 'file-loader',
  options: { name: '[name].[ext]', outputPath: 'static/media' },
}

const moduleTypes = ['json', 'asset'] as const

const nextConfig: NextConfig = {
  cacheComponents: false,
  experimental: {
    cachedNavigations: false,
  },
  turbopack: {
    rules: {
      '*.emit': [
        {
          condition: 'browser',
          loaders: emitLoaders('static/media'),
          as: '*.js',
        },
        { condition: 'node', loaders: emitLoaders(nodeOutputPath), as: '*.js' },
        {
          condition: { not: { any: ['browser', 'node'] } },
          loaders: emitLoaders('../static/media'),
          as: '*.js',
        },
      ],
      '*.pitch': {
        loaders: [
          {
            loader: './loaders/pitch.js',
            options: { outputPath: nodeOutputPath },
          },
        ],
        as: '*.js',
      },
      'server.emit.js': {
        loaders: [
          {
            loader: './loaders/extra.js',
            options: { outputPath: nodeOutputPath },
          },
        ],
        as: '*.js',
      },
      '*.file': { loaders: [fileLoader], as: '*.js' },
      'styles.css': {
        loaders: ['./loaders/css.js'],
        as: '*.css',
      },
      '*.pure': {
        loaders: [
          {
            loader: './loaders/pure.js',
            options: { outputPath: nodeOutputPath },
          },
        ],
        as: '*.js',
      },
      '*.mapped': [
        {
          condition: 'browser',
          loaders: [
            {
              loader: './loaders/mapped.js',
              options: { outputPath: 'static/media', turbopackOnlyMaps: true },
            },
          ],
          as: '*.js',
        },
        {
          condition: 'node',
          loaders: [
            {
              loader: './loaders/mapped.js',
              options: { outputPath: nodeOutputPath, turbopackOnlyMaps: true },
            },
          ],
          as: '*.js',
        },
        {
          condition: { not: { any: ['browser', 'node'] } },
          loaders: [
            {
              loader: './loaders/mapped.js',
              options: {
                outputPath: '../static/media',
                turbopackOnlyMaps: true,
              },
            },
          ],
          as: '*.js',
        },
      ],
      ...Object.fromEntries(
        moduleTypes.map((kind) => [
          `*.emit-${kind}`,
          {
            loaders: [
              {
                loader: './loaders/sidecar.js',
                options: { outputPath: nodeOutputPath, kind },
              },
            ],
            type: kind,
          },
        ])
      ),
      '*.emit-transitive': {
        loaders: [
          {
            loader: './loaders/sidecar.js',
            options: { outputPath: nodeOutputPath, kind: 'transitive' },
          },
        ],
        as: '*.js',
      },
      '*.importer': { loaders: ['./loaders/importer.js'], as: '*.js' },
      '*.emit-imported': {
        loaders: [
          {
            loader: './loaders/sidecar.js',
            options: { outputPath: nodeOutputPath, kind: 'imported' },
          },
        ],
        as: '*.js',
      },
    },
  },
  webpack(config, { isServer, nextRuntime }) {
    const outputPath = isServer
      ? nextRuntime === 'nodejs'
        ? nodeOutputPath
        : '../static/media'
      : 'static/media'
    config.module.rules.push(
      {
        test: /\.emit$/,
        use: [
          {
            loader: require.resolve('./loaders/extra.js'),
            options: { outputPath },
          },
          ...emitLoaders(outputPath).map(({ loader, options }) => ({
            loader: require.resolve(loader),
            options,
          })),
        ],
      },
      {
        test: /\.pitch$/,
        use: [
          {
            loader: require.resolve('./loaders/pitch.js'),
            options: { outputPath },
          },
        ],
      },
      { test: /\.file$/, use: [fileLoader] },
      {
        test: /styles\.css$/,
        use: [
          {
            loader: require.resolve('./loaders/css.js'),
            options: { outputPath },
          },
        ],
      },
      {
        test: /\.pure$/,
        use: [
          {
            loader: require.resolve('./loaders/pure.js'),
            options: { outputPath },
          },
        ],
      },
      {
        test: /\.mapped$/,
        use: [
          {
            loader: require.resolve('./loaders/mapped.js'),
            options: { outputPath },
          },
        ],
      }
    )
    for (const kind of moduleTypes) {
      config.module.rules.push({
        test: new RegExp(`\\.emit-${kind}$`),
        type: { json: 'json', asset: 'asset/resource' }[kind],
        ...(kind === 'asset'
          ? {
              generator: {
                filename: '[name].[contenthash][ext]',
                outputPath,
                publicPath: '/_next/static/media/',
              },
            }
          : {}),
        use: [
          {
            loader: require.resolve('./loaders/sidecar.js'),
            options: { outputPath, kind },
          },
        ],
      })
    }
    config.module.rules.push({
      test: /\.emit-transitive$/,
      use: [
        {
          loader: require.resolve('./loaders/sidecar.js'),
          options: { outputPath, kind: 'transitive' },
        },
      ],
    })
    config.module.rules.push(
      {
        test: /\.importer$/,
        use: [{ loader: require.resolve('./loaders/importer.js') }],
      },
      {
        test: /\.emit-imported$/,
        use: [
          {
            loader: require.resolve('./loaders/sidecar.js'),
            options: { outputPath, kind: 'imported' },
          },
        ],
      }
    )
    return config
  },
}

export default nextConfig
