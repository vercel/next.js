/** @type {import('next').NextConfig} */
module.exports = {
  typedRoutes: true,
  experimental: {
    parallelServerBuildTraces: true,
    useTypeScriptCli: false,
    webpackBuildWorker: true,
  },
}
