/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  webpack(config) {
    if (process.env.NEXT_RSPACK) {
      // Disable persistent cache when using Rspack.
      // Rspack's persistent cache may reuse the previously compiled pages.
      // This differs from webpack in dev mode, which typically builds only the page being requested.
      config.cache = false
    }
    return config
  },
}

module.exports = nextConfig
