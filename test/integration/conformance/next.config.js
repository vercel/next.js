module.exports = {
  experimental: {
    conformance: true,
  },
  webpack(cfg, { dev, isServer }) {
    if (!dev && !isServer) {
      cfg.optimization.splitChunks.cacheGroups.vendors = {
        chunks: 'initial',
        name: 'vendor',
        test: 'vendor',
        enforce: true,
      }
    }

    return cfg
  },
}
