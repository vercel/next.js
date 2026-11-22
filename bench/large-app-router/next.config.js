/** @type {import('next').NextConfig} */
module.exports = {
  typescript: {
    // Type checking runs `tsc` in a separate process and would dominate the
    // build time. This benchmark measures the bundler, so skip it.
    ignoreBuildErrors: true,
  },
  // The Turbopack persistent cache is on by default. Set TURBO_CACHE=0 to
  // measure builds without writing (or reading) it.
  ...(process.env.TURBO_CACHE === '0'
    ? {
        experimental: {
          turbopackFileSystemCacheForBuild: false,
          turbopackFileSystemCacheForDev: false,
        },
      }
    : {}),
}
