/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbo: {
      rules: {
        '*.mdx': {
          loaders: ['test-loader.js'],
          as: '*.js',
        },
      },
    },
  },
}

module.exports = nextConfig
