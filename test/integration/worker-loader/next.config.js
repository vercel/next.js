module.exports = {
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
