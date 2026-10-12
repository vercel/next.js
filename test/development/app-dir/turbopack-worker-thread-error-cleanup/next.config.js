const path = require('node:path')

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
            loader: require.resolve('./error-loader.js'),
            options: {
              marker: path.join(__dirname, 'worker-survived.txt'),
            },
          },
        ],
      },
    },
  },
}
