const glob = require('glob-promise')
const { join } = require('path')

module.exports = {
  webpack: function (config, { dev }) {
    const entry = async () => {
      const entries = {}
      const cssFiles = await glob('**/*.css', { cwd: config.context, ignore: 'node_modules/**/*' })
      cssFiles.forEach((file) => { entries[join('dist', file)] = [`./${file}?entry`] })
      return entries
    }
    const cssConfig = {
      test: /\.css$/,
      use: [
        'isomorphic-style-loader',
        {
          loader: 'css-loader',
          options: {
            importLoaders: 1,
            modules: true,
            minimize: !dev,
            localIdentName: '[name]-[local]-[hash:base64:5]'
          }
        },
        {
          loader: 'postcss-loader',
          options: {
            config: './postcss.config.js'
          }
        }
      ]
    }

    // Add to next config for client-side bundles
    config.module.rules.push(cssConfig)
    return [config, {
      // Server config
      // Target is Node-only
      target: 'async-node',
      entry,
      context: config.context,
      output: config.output,
      devtool: config.devtool,
      module: {
        rules: [cssConfig]
      }
    }]
  }
}
