const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    rules: {
      '*.mdx': {
        loaders: [require.resolve('./test-file-loader.js')],
        as: '*.js',
      },
      '*.txt': [
        {
          condition: { query: '?reverse' },
          loaders: [require.resolve('./reverse-loader.js')],
          as: '*.js',
        },
        {
          condition: { query: /\?upper/ },
          loaders: [require.resolve('./upper-loader.js')],
          as: '*.js',
        },
      ],
    },
    resolveAlias: {
      '@/*': './app/*',
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.mdx/,
      use: require.resolve('./test-file-loader.js'),
    })
    config.module.rules.push({
      resourceQuery: '?reverse',
      use: require.resolve('./reverse-loader.js'),
    })
    config.module.rules.push({
      resourceQuery: /\?upper/,
      use: require.resolve('./upper-loader.js'),
    })
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'app'),
    }
    return config
  },
}

module.exports = nextConfig
