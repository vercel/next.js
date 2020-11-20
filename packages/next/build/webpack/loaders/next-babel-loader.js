import babelLoader from 'next/dist/compiled/babel-loader'
import hash from 'next/dist/compiled/string-hash'
import { basename, join } from 'path'
import * as Log from '../../output/log'

// increment 'n' to invalidate cache
// eslint-disable-next-line no-useless-concat
const cacheKey = 'babel-cache-' + 'n' + '-'
const nextBabelPreset = require('../../babel/preset')

module.exports = babelLoader.custom((babel) => {
  const presetItem = babel.createConfigItem(nextBabelPreset, {
    type: 'preset',
  })
  const applyCommonJs = babel.createConfigItem(
    require('../../babel/plugins/commonjs'),
    { type: 'plugin' }
  )
  const commonJsItem = babel.createConfigItem(
    require('next/dist/compiled/babel/plugin-transform-modules-commonjs'),
    { type: 'plugin' }
  )

  const configs = new Set()

  return {
    customOptions(opts) {
      const custom = {
        isServer: opts.isServer,
        pagesDir: opts.pagesDir,
        babelPresetPlugins: opts.babelPresetPlugins,
        development: opts.development,
        hasReactRefresh: opts.hasReactRefresh,
        hasJsxRuntime: opts.hasJsxRuntime,
      }
      const filename = join(opts.cwd, 'noop.js')
      const loader = Object.assign(
        opts.cache
          ? {
              cacheCompression: false,
              cacheDirectory: join(opts.distDir, 'cache', 'next-babel-loader'),
              cacheIdentifier:
                cacheKey +
                (opts.isServer ? '-server' : '') +
                '-new-polyfills' +
                (opts.development ? '-development' : '-production') +
                (opts.hasReactRefresh ? '-react-refresh' : '') +
                (opts.hasJsxRuntime ? '-jsx-runtime' : '') +
                JSON.stringify(
                  babel.loadPartialConfig({
                    filename,
                    cwd: opts.cwd,
                    sourceFileName: filename,
                  }).options
                ),
            }
          : {
              cacheDirectory: false,
            },
        opts
      )

      delete loader.isServer
      delete loader.cache
      delete loader.distDir
      delete loader.pagesDir
      delete loader.babelPresetPlugins
      delete loader.development
      delete loader.hasReactRefresh
      delete loader.hasJsxRuntime
      return { loader, custom }
    },
    config(
      cfg,
      {
        source,
        customOptions: {
          isServer,
          pagesDir,
          babelPresetPlugins,
          development,
          hasReactRefresh,
          hasJsxRuntime,
        },
      }
    ) {
      const filename = this.resourcePath
      const options = Object.assign({}, cfg.options)
      const isPageFile = filename.startsWith(pagesDir)

      if (cfg.hasFilesystemConfig()) {
        for (const file of [cfg.babelrc, cfg.config]) {
          // We only log for client compilation otherwise there will be double output
          if (file && !isServer && !configs.has(file)) {
            configs.add(file)
            Log.info(`Using external babel configuration from ${file}`)
          }
        }
      } else {
        // Add our default preset if the no "babelrc" found.
        options.presets = [...options.presets, presetItem]
      }

      options.caller.isServer = isServer
      options.caller.isDev = development
      options.caller.hasJsxRuntime = hasJsxRuntime

      const emitWarning = this.emitWarning.bind(this)
      Object.defineProperty(options.caller, 'onWarning', {
        enumerable: false,
        writable: false,
        value: (options.caller.onWarning = function (reason) {
          if (!(reason instanceof Error)) {
            reason = new Error(reason)
          }
          emitWarning(reason)
        }),
      })

      options.plugins = options.plugins || []

      if (hasReactRefresh) {
        const reactRefreshPlugin = babel.createConfigItem(
          [require('react-refresh/babel'), { skipEnvCheck: true }],
          { type: 'plugin' }
        )
        options.plugins.unshift(reactRefreshPlugin)
        if (!isServer) {
          const noAnonymousDefaultExportPlugin = babel.createConfigItem(
            [require('../../babel/plugins/no-anonymous-default-export'), {}],
            { type: 'plugin' }
          )
          options.plugins.unshift(noAnonymousDefaultExportPlugin)
        }
      }

      if (!isServer && isPageFile) {
        const pageConfigPlugin = babel.createConfigItem(
          [require('../../babel/plugins/next-page-config')],
          { type: 'plugin' }
        )
        options.plugins.push(pageConfigPlugin)

        const diallowExportAll = babel.createConfigItem(
          [
            require('../../babel/plugins/next-page-disallow-re-export-all-exports'),
          ],
          { type: 'plugin' }
        )
        options.plugins.push(diallowExportAll)
      }

      if (isServer && source.indexOf('next/data') !== -1) {
        const nextDataPlugin = babel.createConfigItem(
          [
            require('../../babel/plugins/next-data'),
            { key: basename(filename) + '-' + hash(filename) },
          ],
          { type: 'plugin' }
        )
        options.plugins.push(nextDataPlugin)
      }

      // If the file has `module.exports` we have to transpile commonjs because Babel adds `import` statements
      // That break webpack, since webpack doesn't support combining commonjs and esmodules
      if (source.indexOf('module.exports') !== -1) {
        options.plugins.push(applyCommonJs)
      }

      options.plugins.push([
        require.resolve('babel-plugin-transform-define'),
        {
          'process.env.NODE_ENV': development ? 'development' : 'production',
          'typeof window': isServer ? 'undefined' : 'object',
          'process.browser': isServer ? false : true,
        },
        'next-js-transform-define-instance',
      ])

      if (isPageFile) {
        if (!isServer) {
          options.plugins.push([
            require.resolve('../../babel/plugins/next-ssg-transform'),
            {},
          ])
        }
      }

      // As next-server/lib has stateful modules we have to transpile commonjs
      options.overrides = [
        ...(options.overrides || []),
        {
          test: [
            /next[\\/]dist[\\/]next-server[\\/]lib/,
            /next[\\/]dist[\\/]client/,
            /next[\\/]dist[\\/]pages/,
          ],
          plugins: [commonJsItem],
        },
      ]

      for (const plugin of babelPresetPlugins) {
        require(join(plugin.dir, 'src', 'babel-preset-build.js'))(
          options,
          plugin.config || {}
        )
      }

      return options
    },
  }
})
