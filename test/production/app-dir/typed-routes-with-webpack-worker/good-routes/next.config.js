/** @type {import('next').NextConfig} */
module.exports = {
  typedRoutes: true,
  experimental: {
    parallelServerBuildTraces: true,
    webpackBuildWorker: true,
  },
}
