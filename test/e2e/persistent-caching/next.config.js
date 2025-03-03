/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // TODO workaround for missing content hashing on output static files
  // Browser caching would break this test case, but we want to test persistent caching.
  deploymentId: true,
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
