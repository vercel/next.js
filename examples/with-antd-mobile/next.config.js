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
    if (filename.endsWith('/node_modules/hammerjs/hammer.js')) {
      return `
        module.exports = {}
      `
    }

    if (
      filename.endsWith('.web.js') ||
      !filename.includes('/node_modules/') ||
      ['antd-mobile', 'rmc-picker'].every(p => !filename.includes(p))
    ) return

    const webjs = filename.replace(/\.js$/, '.web.js')
    if (!fs.existsSync(webjs)) return

    return fs.readFileSync(webjs, { encoding: 'utf8' })
  })

  requireHacker.hook('svg', filename => {
    const id = path.basename(filename).replace(/\.svg$/, '')
    return requireHacker.to_javascript_module_source(`#${id}`)
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
        loader: 'emit-file-loader',
        options: {
          name: 'dist/[path][name].[ext]'
        },
        include: [
          moduleDir('antd-mobile'),
          __dirname
        ]
      },
      {
        test: /\.(svg)$/i,
        loader: 'svg-sprite-loader',
        include: [
          moduleDir('antd-mobile'),
          __dirname
        ]
      }
    )

    return config
  }
}
