module.exports = {
  webpack(config, { dev, isServer, defaultLoaders }) {
    const originalEntry = config.entry
    config.entry = async () => {
      const entries = await originalEntry()
      if (dev && !isServer) {
        if (
          entries['main.js'] &&
          !entries['main.js'].includes('./whyDidYouRender.js')
        ) {
          entries['main.js'].unshift('./whyDidYouRender.js')
        }
      }
      return entries
    }
    return config
  },
}
