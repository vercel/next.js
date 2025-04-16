/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    rules: {
      '*.mdx': {
        loaders: ['test-loader.js'],
        as: '*.js',
      },
    },
  },
}

module.exports = nextConfig
