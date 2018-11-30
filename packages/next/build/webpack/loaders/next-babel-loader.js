import babelLoader from 'babel-loader'

module.exports = babelLoader.custom(babel => {
  const presetItem = babel.createConfigItem(require('../../babel/preset'), {type: 'preset'})
  const commonJsItem = babel.createConfigItem(require('@babel/plugin-transform-modules-commonjs'), {type: 'plugin'})

  const configs = new Set()

  return {
    customOptions (opts) {
      const custom = {
        isServer: opts.isServer,
        dev: opts.dev
      }
      const loader = Object.assign({
        cacheCompression: false,
        cacheDirectory: true
      }, opts)
      delete loader.isServer
      delete loader.dev

      return { loader, custom }
    },
    config (cfg, {source, customOptions: {isServer, dev}}) {
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

      if (source.match(/module\.exports/)) {
        options.plugins = options.plugins || []
        options.plugins.push(commonJsItem)
      }

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
