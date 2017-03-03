module.exports = {
  webpack: (config, { dev }) => {
    config.module.loaders = (config.module.loaders || []).concat({
        test: /\.js$/,
        loaders: [
          'babel-loader'
        ]
    });

    return config
  }
}
