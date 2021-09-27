module.exports = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack(config) {
    config.module.unsafeCache = true
    return config
  },
  experimental: {
    swcLoader: true,
    swcMinify: true,
  },
}
