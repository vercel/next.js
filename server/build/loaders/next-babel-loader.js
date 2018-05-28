import babelLoader from 'babel-loader'

module.exports = babelLoader.custom(babel => {
  const presetItem = babel.createConfigItem(require('../babel/preset'), {type: 'preset'})
  const hotLoaderItem = babel.createConfigItem(require('react-hot-loader/babel'), {type: 'plugin'})
  const reactJsxSourceItem = babel.createConfigItem(require('@babel/plugin-transform-react-jsx-source'), {type: 'plugin'})

  const configs = new Set()

  return {
    customOptions (opts) {
      const custom = {
        isServer: opts.isServer,
        dev: opts.dev
      }
      const loader = Object.assign({
        cacheDirectory: true
      }, opts)
      delete loader.isServer
      delete loader.dev

      return { loader, custom }
    },
    config (cfg, {customOptions: {isServer, dev}}) {
      const options = Object.assign({}, cfg.options)
      if (cfg.hasFilesystemConfig()) {
        for (const file of [cfg.babelrc, cfg.config]) {
          if (file && !configs.has(file)) {
            configs.add(file)
            console.log(`> Using external babel configuration`)
            console.log(`> Location: "${file}"`)
          }
        }
      } else {
        // Add our default preset if the no "babelrc" found.
        options.presets = [...options.presets, presetItem]
      }

      options.plugins = [
        ...options.plugins,
        dev && !isServer && hotLoaderItem,
        dev && reactJsxSourceItem
      ].filter(Boolean)

      return options
    }
  }
})
