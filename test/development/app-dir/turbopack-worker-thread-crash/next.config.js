/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    turbopackPluginRuntimeStrategy: 'workerThreads',
  },
  turbopack: {
    rules: {
      '*.crashprobe': {
        as: '*.js',
        loaders: [
          {
            loader: require.resolve('./crash-loader.js'),
          },
        ],
      },
    },
  },
}
