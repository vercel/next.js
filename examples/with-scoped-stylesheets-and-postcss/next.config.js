const fs = require('fs')
const trash = require('trash')

module.exports = {
  webpack: (config) => {
    config.plugins = config.plugins.filter(
      (plugin) => (plugin.constructor.name !== 'UglifyJsPlugin')
    )

    config.module.rules.push(
      {
        test: /\.css$/,
        use: [
          {
            loader: 'emit-file-loader',
            options: {
              name: 'dist/[path][name].[ext]'
            }
          },
          {
            loader: 'skeleton-loader',
            options: {
              procedure: function (content) {
                const fileName = `${this._module.userRequest}.json`
                const classNames = fs.readFileSync(fileName, 'utf8')

                trash(fileName)

                return ['module.exports = {',
                  `classNames: ${classNames},`,
                  `stylesheet: \`${content}\``,
                  '}'
                ].join('')
              }
            }
          },
          'postcss-loader'
        ]
      }
    )

    return config
  }
}
