module.exports = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      const optimization = config.optimization || {}
      const splitChunks = optimization.splitChunks || {}
      const cacheGroups = splitChunks.cacheGroups || {}

      config.optimization = {
        ...optimization,
        splitChunks: {
          ...splitChunks,
          cacheGroups: {
            ...cacheGroups,
            requiredByApp: {
              test: /requiredByApp.js/,
              name: 'requiredByApp',
              enforce: true,
              priority: 10,
              chunks: 'all',
            },
            requiredByPage: {
              test: /requiredByPage.js/,
              name: 'requiredByPage',
              enforce: true,
              priority: 10,
              chunks: 'all',
            },
          },
        },
      }
    }

    return config
  },
}
