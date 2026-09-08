module.exports = {
  webpack(config) {
    console.log('Initialized config')
    if (
      require('webpack/lib/node/NodeTargetPlugin') !==
      require('next/dist/compiled/webpack/NodeTargetPlugin')
    )
      throw new Error('Webpack require hook not applying')

    for (const experiment of [
      'asyncWebAssembly',
      'css',
      'html',
      'typescript',
    ]) {
      if (config.experiments[experiment] !== false) {
        throw new Error(`Unexpected webpack experiment: ${experiment}`)
      }
    }

    return config
  },
}
