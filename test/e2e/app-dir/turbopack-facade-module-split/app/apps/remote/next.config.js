/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the remote's static chunks off the host's asset namespace; server.js
  // routes this prefix to the remote app.
  assetPrefix: '/remote-assets',
  // Push remote module tables to a dedicated chunk-loading global so the
  // host-side scope loader can capture them, mirroring the build-time scoped
  // global remote-components' config plugin sets.
  turbopack: {
    chunkLoadingGlobal: 'TURBOPACK_remote',
  },
  webpack: (config) => {
    config.output.chunkLoadingGlobal = 'remoteWebpackChunk'
    return config
  },
}

module.exports = nextConfig
