const path= require('path')
const CopyPlugin = require('copy-webpack-plugin')
module.exports = {
    images: {
      deviceSizes: [320, 420, 768, 1024, 1200],
      iconSizes: [],
      domains: [],
      path: '/_next/image',
      loader: 'default',
    },
    webpack: (config) => {
      config.plugins.push(
        new CopyPlugin({
          patterns: [{
            from: path.join(__dirname, 'node_modules/ionicons/dist/ionicons/svg'),
            to: path.join(__dirname, 'public/svg')
          }]
        })
      )
      return config
    }
  }