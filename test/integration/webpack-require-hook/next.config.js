module.exports = {
  future: {
    webpack5: true,
  },
  webpack(config, options) {
    console.log('Initialized config')
    if (
      require('webpack/lib/node/NodeTargetPlugin') !==
      require('next/dist/compiled/webpack/NodeTargetPlugin')
    )
      throw new Error('Webpack require hook not applying')
    return config
  },
}
