module.exports = {
  webpack: function (cfg) {
    const originalEntry = cfg.entry
    cfg.entry = async () => {
      const entries = await originalEntry()
      entries['main.js'].unshift('./client/polyfills.js')
      return entries
    }

    return cfg
  }
}
