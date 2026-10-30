import type { NextConfig } from 'next'
import type { TurbopackLoaderItem } from 'next/dist/server/config-shared'

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

const moduleTypes = ['json', 'text', 'raw', 'bytes', 'asset'] as const

function postcssLoaders(
  outputPath: string
): Exclude<TurbopackLoaderItem, string>[] {
  return [
    { loader: './loaders/css-to-js.js', options: {} },
    {
      loader: 'postcss-loader',
      options: {
        postcssOptions: {
          config: false,
          plugins: [
            [require.resolve('./loaders/postcss-assets.js'), { outputPath }],
          ],
        },
      },
    },
  ]
}

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  cacheComponents: false,
  experimental: {
    cachedNavigations: false,
    serverSourceMaps: true,
    turbopackModuleFragments: process.env.__NEXT_TEST_AXIS === 'A',
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
      '*.copy': {
        loaders: [
          {
            loader: 'emit-file-loader',
            options: { output: `${nodeOutputPath}/distributed-template.js` },
          },
        ],
        as: '*.js',
      },
      '*.auto': {
        loaders: [
          {
            loader: 'auto-import-x-loader',
            options: {
              imports: { react: ['useState'] },
              dts: `${nodeOutputPath}/auto-imports.d.ts`,
            },
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
      '*.postcss': { loaders: postcssLoaders(nodeOutputPath), as: '*.js' },
      '*.emit-transitive': {
        loaders: [
          {
            loader: './loaders/sidecar.js',
            options: { outputPath: nodeOutputPath, kind: 'transitive' },
          },
        ],
        as: '*.js',
      },
      '*.minify': {
        loaders: [
          {
            loader: './loaders/minify.js',
            options: { outputPath: 'static/media' },
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
      '*.emit-cjs': {
        loaders: [
          {
            loader: './loaders/sidecar.js',
            options: { outputPath: nodeOutputPath, kind: 'commonjs' },
          },
        ],
        as: '*.js',
      },
    },
  },
  webpack(config, { isServer, nextRuntime, dev, webpack }) {
    // Webpack's dev devtool emits no maps for emitted files, so add them like Turbopack does.
    if (dev) {
      config.plugins.push(
        new webpack.SourceMapDevToolPlugin({
          filename: '[file].map',
          test: /(?:mapped-asset\.js|original-name\.js|mapped-styles\.css|postcss-emitted\.css|root-.*\.js)$/,
        })
      )
    }
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
        test: /\.copy$/,
        use: [
          {
            loader: 'emit-file-loader',
            options: { output: `${outputPath}/distributed-template.js` },
          },
        ],
      },
      {
        test: /\.auto$/,
        use: [
          {
            loader: 'auto-import-x-loader',
            options: {
              imports: { react: ['useState'] },
              dts: `${outputPath}/auto-imports.d.ts`,
            },
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
      },
      {
        test: /\.postcss$/,
        use: postcssLoaders(outputPath).map(({ loader, options }) => ({
          loader: loader.startsWith('./') ? require.resolve(loader) : loader,
          options,
        })),
      }
    )
    for (const kind of moduleTypes) {
      config.module.rules.push({
        test: new RegExp(`\\.emit-${kind}$`),
        type: {
          json: 'json',
          text: 'asset/source',
          raw: 'asset/source',
          bytes: 'javascript/auto',
          asset: 'asset/resource',
        }[kind],
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
          ...(kind === 'bytes'
            ? [{ loader: require.resolve('./loaders/bytes.js') }]
            : []),
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
        test: /\.minify$/,
        use: [
          {
            loader: require.resolve('./loaders/minify.js'),
            options: { outputPath },
          },
        ],
      },
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
    config.module.rules.push({
      test: /\.emit-cjs$/,
      use: [
        {
          loader: require.resolve('./loaders/sidecar.js'),
          options: { outputPath, kind: 'commonjs' },
        },
      ],
    })
    return config
  },
}

export default nextConfig
