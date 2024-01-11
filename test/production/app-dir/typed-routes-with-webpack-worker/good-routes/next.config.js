/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    typedRoutes: true,
    parallelServerBuildTraces: true,
    webpackBuildWorker: true,
  },
}
