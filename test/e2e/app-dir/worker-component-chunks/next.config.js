/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbopackChunking: {
      generateComponentChunks: true,
      // The defaults (50 KB / 20 KB) would require much bigger fixture modules. These
      // thresholds keep the generated `lib/shared-with-*.js` modules (see
      // `sharedModule()` in the test file) small while still being big enough to each
      // become a component chunk of the chunk they get merged into.
      minChunkSize: 8000,
      minComponentChunkSize: 1000,
    },
  },
}

module.exports = nextConfig
