import hash from 'string-hash'
import { join, basename } from 'path'
import babelLoader from 'babel-loader'

// increment 'c' to invalidate cache
const cacheKey = 'babel-cache-' + 'c' + '-'

module.exports = babelLoader.custom(babel => {
  const presetItem = babel.createConfigItem(require('../../babel/preset'), {
    type: 'preset'
  })
  const applyCommonJs = babel.createConfigItem(
    require('../../babel/plugins/commonjs'),
    { type: 'plugin' }
  )
  const commonJsItem = babel.createConfigItem(
    require('@babel/plugin-transform-modules-commonjs'),
    { type: 'plugin' }
  )

  const configs = new Set()

  return {
    customOptions (opts) {
      const custom = {
        isServer: opts.isServer,
        asyncToPromises: opts.asyncToPromises
      }
      const filename = join(opts.cwd, 'noop.js')
      const loader = Object.assign(
        opts.cache
          ? {
            cacheCompression: false,
            cacheDirectory: join(opts.distDir, 'cache', 'next-babel-loader'),
            cacheIdentifier:
                cacheKey +
                JSON.stringify(
                  babel.loadPartialConfig({
                    filename,
                    cwd: opts.cwd,
                    sourceFileName: filename
                  }).options
                )
          }
          : {
            cacheDirectory: false
          },
        opts
      )

      delete loader.isServer
      delete loader.asyncToPromises
      delete loader.cache
      delete loader.distDir
      return { loader, custom }
    },
    config (
      cfg,
      {
        source,
        customOptions: { isServer, asyncToPromises }
      }
    ) {
      const filename = this.resourcePath
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

      if (!isServer && filename.indexOf('pages') !== -1) {
        const pageConfigPlugin = babel.createConfigItem(
          [require('../../babel/plugins/next-page-config')],
          { type: 'plugin' }
        )
        options.plugins = options.plugins || []
        options.plugins.push(pageConfigPlugin)
      }

      if (isServer && source.indexOf('next/data') !== -1) {
        const nextDataPlugin = babel.createConfigItem(
          [
            require('../../babel/plugins/next-data'),
            { key: basename(filename) + '-' + hash(filename) }
          ],
          { type: 'plugin' }
        )
        options.plugins = options.plugins || []
        options.plugins.push(nextDataPlugin)
      }

      if (asyncToPromises) {
        const asyncToPromisesPlugin = babel.createConfigItem(
          [
            'babel-plugin-transform-async-to-promises',
            {
              inlineHelpers: true
            }
          ],
          { type: 'plugin' }
        )
        options.plugins = options.plugins || []
        options.plugins.push(asyncToPromisesPlugin)

        const regeneratorPlugin = options.plugins.find(plugin => {
          return plugin[0] === require('@babel/plugin-transform-runtime')
        })
        if (regeneratorPlugin) {
          regeneratorPlugin[1].regenerator = false
        }

        const babelPresetEnv = (options.presets || []).find((preset = []) => {
          return preset[0] === require('@babel/preset-env').default
        })
        if (babelPresetEnv) {
          babelPresetEnv[1].exclude = (options.presets[0][1].exclude || [])
            .concat([
              'transform-typeof-symbol',
              'transform-regenerator',
              'transform-async-to-generator'
            ])
            .filter('transform-typeof-symbol')
        }
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
          test: [
            /next-server[\\/]dist[\\/]lib/,
            /next[\\/]dist[\\/]client/,
            /next[\\/]dist[\\/]pages/
          ],
          plugins: [commonJsItem]
        }
      ]

      return options
    }
  }
})
