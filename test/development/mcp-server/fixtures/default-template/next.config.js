module.exports = {
  webpack(config) {
    if (process.env.NEXT_RSPACK) {
      // Disable persistent cache when using Rspack.
      // Rspack may reuse previously compiled pages from its persistent cache.
      // In development, webpack typically compiles only the page being requested.
      // Keeping Rspack's persistent cache enabled can cause tests to surface errors
      // from previously compiled pages, making it hard to assert errors for the
      // currently requested page only.
      config.cache = false
    }
    return config
  },
}
