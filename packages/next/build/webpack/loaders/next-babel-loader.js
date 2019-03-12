import babelLoader from 'babel-loader'

module.exports = babelLoader.custom(babel => {
  const presetItem = babel.createConfigItem(require('../../babel/preset'), { type: 'preset' })
  const applyCommonJs = babel.createConfigItem(require('../../babel/plugins/commonjs'), { type: 'plugin' })
  const commonJsItem = babel.createConfigItem(require('@babel/plugin-transform-modules-commonjs'), { type: 'plugin' })

  const configs = new Set()

  return {
    customOptions (opts) {
      const custom = {
        isServer: opts.isServer
      }
      const loader = Object.assign({
        cacheCompression: false,
        cacheDirectory: true
      }, opts)
      delete loader.isServer

      return { loader, custom }
    },
    config (cfg, { source, customOptions: { isServer } }) {
      const options = Object.assign({}, cfg.options)
      if (cfg.hasFilesystemConfig()) {
        for (const file of [cfg.babelrc, cfg.config]) {
          // We only log for client compilation otherwise there will be double output
          if (file && !isServer && !configs.has(file)) {
            configs.add(file)
            console.log(`> Using external babel configuration`)
            console.log(`> Location: "${file}"`)
          }
        }
      } else {
        // Add our default preset if the no "babelrc" found.
        options.presets = [...options.presets, presetItem]
      }

      // If the file has `module.exports` we have to transpile commonjs because Babel adds `import` statements
      // That break webpack, since webpack doesn't support combining commonjs and esmodules
      if (source.indexOf('module.exports') !== -1) {
        options.plugins = options.plugins || []
        options.plugins.push(applyCommonJs)
      }

      // As next-server/lib has stateful modules we have to transpile commonjs
      options.overrides = [
        ...(options.overrides || []),
        {
          test: /next-server[\\/]dist[\\/]lib/,
          plugins: [
            commonJsItem
          ]
        }
      ]

      return options
    }
  }
})
