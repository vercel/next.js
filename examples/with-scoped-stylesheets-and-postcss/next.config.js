module.exports = {
  webpack: (config) => {
    config.module.rules.push(
      {
        test: /\.css$/,
        use: [
          {
            loader: 'emit-file-loader',
            options: {
              name: 'dist/[path][name].[ext]'
            }
          },
          'raw-loader',
          'val-loader',
          {
            loader: 'skeleton-loader',
            options: {
              procedure: (content) => (
                `${content} \n` + ['module.exports = {',
                  'stylesheet: module.exports.toString(),',
                  'classNames: exports.locals',
                  '}'
                ].join('')
              )
            }
          },
          {
            loader: 'css-loader',
            options: {
              modules: true,
              minimize: true,
              importLoaders: 1,
              localIdentName: '[local]-[hash:base64:5]'
            }
          },
          'postcss-loader'
        ]
      }
    )

    return config
  }
}
