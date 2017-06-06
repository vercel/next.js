const path = require('path')
const fs = require('fs')
const requireHacker = require('require-hacker')

function setupRequireHacker () {
  requireHacker.resolver((filename, module) => {
    if (filename.endsWith('/style/css')) {
      return requireHacker.resolve(`${filename}.web.js`, module)
    }
  })

  requireHacker.hook('js', filename => {
    if (
      filename.endsWith('.web.js') ||
      !filename.includes('/node_modules/') ||
      ['antd-mobile', 'rc-swipeout', 'rmc-picker'].every(p => !filename.includes(p))
    ) return

    const webjs = filename.replace(/\.js$/, '.web.js')
    if (!fs.existsSync(webjs)) return

    return fs.readFileSync(webjs, { encoding: 'utf8' })
  })

  requireHacker.hook('css', () => '')

  requireHacker.hook('svg', filename => {
    return requireHacker.to_javascript_module_source(fs.readFileSync(filename, { encoding: 'utf8' }))
  })
}

setupRequireHacker()

function moduleDir (m) {
  return path.dirname(require.resolve(`${m}/package.json`))
}

module.exports = {
  webpack: (config, { dev }) => {
    config.resolve.extensions = ['.web.js', '.js', '.json']

    config.module.rules.push(
      {
        test: /\.(svg)$/i,
        loader: 'svg-sprite-loader',
        include: [
          moduleDir('antd-mobile')
        ]
      }
    )

    return config
  }
}
