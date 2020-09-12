module.exports = {
  webpack: (config) => {
    config.optimization.minimizer = []
    return config
  },
}
