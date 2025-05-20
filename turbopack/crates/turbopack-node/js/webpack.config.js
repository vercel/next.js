const nodeExternals = require('webpack-node-externals')
const path = require('path')

module.exports = {
  mode: 'production',
  entry: {
    'transforms/postcss': './src/transforms/postcss.ts',
    'transforms/webpack-loaders': './src/transforms/webpack-loaders.ts',
    'ipc/evaluate': './src/ipc/evaluate.ts',
    globals: './src/globals.ts',
  },
  output: {
    path: path.resolve(__dirname, 'src'),
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
