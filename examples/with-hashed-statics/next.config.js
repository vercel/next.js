module.exports = {
  webpack: config => {
    config.module.rules.push({
      test: /\.(txt|jpg|png|svg)$/,
      use: [
        {
          loader: 'file-loader',
          options: {
            context: '',
            emitFile: true,
            name: '[path][name].[hash].[ext]'
          }
        }
      ]
    })

    return config
  }
}
