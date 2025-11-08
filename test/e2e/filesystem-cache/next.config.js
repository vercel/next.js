const enableCaching = !!process.env.ENABLE_CACHING

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      './app/**/page.{jsx,tsx}': {
        loaders: ['./my-timestamp-loader.js'],
      },
      './app/loader/page.tsx': {
        loaders: ['./my-loader.js'],
      },
      './pages/pages.tsx': {
        loaders: ['./my-timestamp-loader.js'],
      },
    },
  },
  experimental: {
    turbopackFileSystemCacheForDev: enableCaching,
    turbopackFileSystemCacheForBuild: enableCaching,
  },
  env: {
    NEXT_PUBLIC_CONFIG_ENV: 'hello world',
  },
  webpack(config, { dev }) {
    config.module.rules.push({
      test: /app(?:\/.*)?\/page\.[tj]sx|pages\/pages\.tsx/,
      use: ['./my-timestamp-loader.js'],
    })
    config.module.rules.push({
      test: /app\/loader(?:\/client)?\/page\.tsx/,
      use: ['./my-loader.js'],
    })
    config.cache = Object.freeze({
      type: enableCaching ? 'filesystem' : 'memory',
    })
    if (dev) {
      // Make webpack consider the build as large change which makes it filesystem cache it sooner
      config.plugins.push((compiler) => {
        compiler.__extra_delay = true
      })
    }

    return config
  },
}

module.exports = nextConfig
