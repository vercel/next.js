module.exports = {
  // worker-loader is webpack 4 specific, new Worker should be used
  // in webpack 5
  webpack5: false,
  webpack: (config, { isServer }) => {
    config.module.rules.unshift({
      test: /\.worker\.(js|ts|tsx)$/,
      loader: 'worker-loader',
      options: {
        filename: 'static/[hash].worker.js',
        publicPath: '/_next/',
      },
    })

    if (!isServer) {
      config.output.globalObject = 'self'
    }

    return config
  },
}
