module.exports = {
  mode: 'production',
  entry: {
    postcss: './src/transforms/postcss.ts',
    transforms: './src/transforms/transforms.ts',
    'webpack-loaders': './src/transforms/webpack-loaders.ts',
  },
  output: {
    filename: '[name].bundle.js',
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
  externals: /^(node:|\$)$/i,
}
