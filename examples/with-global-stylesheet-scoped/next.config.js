const path = require('path')

module.exports = {
  webpack: (config, { dev }) => {
    config.module.rules.push(
      {
        test: /\.(css|scss)/,
        loader: 'emit-file-loader',
        options: {
          name: 'dist/[path][name].[ext]',
        },
      },
      {
        test: /\.css$/,
        use: [
          'babel-loader', // babel wrap-in-js for hot reload
          'raw-loader',
          {
            loader: 'postcss-loader',
            options: {
              sourceMap: 'inline',
            },
          },
        ],
      },
      {
        test: /\.s(a|c)ss$/,
        use: [
          'babel-loader', // babel wrap-in-js for hot reload
          'raw-loader',
          {
            loader: 'postcss-loader',
            options: {
              sourceMap: 'inline',
            },
          },
          {
            loader: 'sass-loader',
            options: {
              sourceMap: true,
              includePaths: ['styles', 'node_modules']
                .map(d => require('path').join(__dirname, d))
                .map(g => require('glob').sync(g))
                .reduce((a, c) => a.concat(c), []),
            },
          },
        ],
      }
    )

    return config
  },
}
