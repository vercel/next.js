/** @type {import('next').NextConfig} */
module.exports = {
  typedLinks: true,
  experimental: {
    parallelServerBuildTraces: true,
    webpackBuildWorker: true,
  },
}
