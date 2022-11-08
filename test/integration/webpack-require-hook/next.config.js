module.exports = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack(config) {
    console.log('Initialized config')
    if (
      require('webpack/lib/node/NodeTargetPlugin') !==
      require('next/dist/compiled/webpack/NodeTargetPlugin')
    )
      throw new Error('Webpack require hook not applying')
    return config
  },
}
