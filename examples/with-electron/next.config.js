module.exports = {
  webpack(config) {
    // set webpack target as electron-rendered to support electron and node modules in our client
    config.target = 'electron-renderer'
    return config
  }
}
