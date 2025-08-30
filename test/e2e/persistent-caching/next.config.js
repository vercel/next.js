/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      './app/page.tsx': {
        loaders: ['./my-loader.js'],
      },
      './app/**/page.tsx': {
        loaders: ['./my-loader.js'],
      },
      './pages/pages.tsx': {
        loaders: ['./my-loader.js'],
      },
    },
  },
  experimental: {
    turbopackPersistentCaching: true,
  },
  env: {
    NEXT_PUBLIC_CONFIG_ENV: 'hello world',
  },
  webpack(config, { dev }) {
    config.module.rules.push({
      test: /app\/.*\/page\.tsx|pages\/pages\.tsx/,
      use: ['./my-loader.js'],
    })
    if (dev) {
      // Make webpack consider the build as large change which makes it persistent cache it sooner
      config.plugins.push((compiler) => {
        compiler.__extra_delay = true
      })
    }

    return config
  },
}

module.exports = nextConfig
