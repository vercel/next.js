const glob = require('glob-promise')
const { join } = require('path')

module.exports = {
  webpack: function (config, { dev }) {
    const entry = config.entry
    // Also bundle pages for server
    config.entry = async () => {
      const entries = await entry()
      const pages = await glob('pages/**/*.js', { cwd: config.context })
      const nextPages = await glob('node_modules/next/dist/pages/**/*.js', { cwd: config.context })
      nextPages.concat(pages).forEach((file) => {
        entries[join('dist', file.replace('node_modules/next/dist', ''))] = [`./${file}`]
      })
      entries['app.js'] = entries['main.js']
      delete entries['main.js']
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
            sourceMap: !!dev,
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

    // Remove emit-file-loader to bundle pages on server-side
    config.module.rules = config.module.rules.filter((rule) =>
      rule.loader !== 'emit-file-loader'
    )

    // Remove chunking plugins that cause problems
    config.plugins = config.plugins.filter((plugin) =>
      !/Chunk/.test(plugin.constructor.name)
    )

    config.module.rules.push(cssConfig)

    return config
  }
}
