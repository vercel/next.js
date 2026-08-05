/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    turbopackPluginRuntimeStrategy: 'workerThreads',
  },
  turbopack: {
    rules: {
      '*.probe': {
        as: '*.js',
        loaders: [
          {
            loader: require.resolve('./exit-loader.js'),
          },
        ],
      },
    },
  },
}
