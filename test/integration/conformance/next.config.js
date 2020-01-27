module.exports = {
  experimental: {
    conformance: true,
  },
  webpack: config => {
    console.log(config.optimization.minimize)
    return config
  },
}
