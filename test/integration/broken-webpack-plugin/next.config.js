class BrokenPlugin {
  apply(compiler) {
    compiler.hooks.watchRun.tapPromise('BrokenPlugin', async () => {
      throw new Error('oops')
    })
  }
}

module.exports = {
  webpack(config, { isServer }) {
    if (!isServer) {
      config.plugins.push(new BrokenPlugin())
    }
    return config
  },
}
