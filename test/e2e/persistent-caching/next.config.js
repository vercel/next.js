/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      'app/page.tsx': {
        loaders: ['./my-loader.js'],
      },
      'pages/pages.tsx': {
        loaders: ['./my-loader.js'],
      },
    },
  },
  experimental: {
    turbopackPersistentCaching: true,
  },
  webpack(config) {
    config.module.rules.push({
      test: /app\/page\.tsx|pages\/pages.tsx/,
      use: ['./my-loader.js'],
    })

    return config
  },
}

module.exports = nextConfig
