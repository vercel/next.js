module.exports = {
  webpack(config) {
    config.plugins.push(function MyPlugin(compiler) {
      console.log('COMPILER')
    })

    return config
  },
}
