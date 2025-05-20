const nodeExternals = require('webpack-node-externals')

module.exports = {
  mode: 'production',
  entry: {
    postcss: './src/transforms/postcss.ts',
    transforms: './src/transforms/transforms.ts',
    'webpack-loaders': './src/transforms/webpack-loaders.ts',
  },
  output: {
    filename: '[name].js',
    module: true,
    library: {
      type: 'module',
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  target: 'node',
  externals: [
    nodeExternals({}),
    '@vercel/turbopack/postcss',
    '@vercel/turbopack/loader-runner',
    'CONFIG',
  ],
  experiments: {
    outputModule: true,
  },
}
