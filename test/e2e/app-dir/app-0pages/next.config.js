/**
 * @type import('next').NextConfig
 */
module.exports = {
  env: {
    LEGACY_ENV_KEY: '1',
  },
  experimental: {
    clientRouterFilterRedirects: true,
    parallelServerCompiles: true,
    parallelServerBuildTraces: true,
    webpackBuildWorker: true,
    turbopackMinify: false,
  },
  distDir: process.env.TURBOPACK ? '.next-turbopack' : '.next',
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    moduleIds: 'named',
  },
  webpack(config) {
    config.optimization.moduleIds = 'named'
    config.optimization.minimize = false
    return config
  },
}
