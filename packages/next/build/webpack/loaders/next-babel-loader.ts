import hash from 'string-hash'
import * as babel from '@babel/core'
import { loader } from 'webpack'
import { join, basename } from 'path'
import loaderUtils from 'loader-utils'
import cache from './next-babel-loader/cache'
import injectCaller from './next-babel-loader/injectCaller'
import transform, { version as transformVersion } from './next-babel-loader/transform'

// increment 'a' to invalidate cache
const cacheKey = 'babel-cache-' + 'b' + '-'
const configs = new Set()

const presetItem = babel.createConfigItem(require('../../babel/preset'), { type: 'preset' })
const applyCommonJs = babel.createConfigItem(require('../../babel/plugins/commonjs'), { type: 'plugin' })
const commonJsItem = babel.createConfigItem(require('@babel/plugin-transform-modules-commonjs'), { type: 'plugin' })

const nextBabelLoader: loader.Loader = function (source, inputSourceMap)  {
  const callback = this.async()!
  const filename = this.resourcePath;
  let loaderOptions = loaderUtils.getOptions(this) || {};
  const { isServer, asyncToPromises, distDir } = loaderOptions

  // Standardize on 'sourceMaps' as the key passed through to Webpack, so that
  // users may safely use either one alongside our default use of
  // 'this.sourceMap' below without getting error about conflicting aliases.
  if (
    Object.prototype.hasOwnProperty.call(loaderOptions, "sourceMap") &&
    !Object.prototype.hasOwnProperty.call(loaderOptions, "sourceMaps")
  ) {
    loaderOptions = Object.assign({}, loaderOptions, {
      sourceMaps: loaderOptions.sourceMap,
    });
    delete loaderOptions.sourceMap;
  }

  const programmaticOptions = Object.assign({}, loaderOptions, {
    filename,
    inputSourceMap: inputSourceMap || undefined,

    // Set the default sourcemap behavior based on Webpack's mapping flag,
    // but allow users to override if they want.
    sourceMaps:
      loaderOptions.sourceMaps === undefined
        ? this.sourceMap
        : loaderOptions.sourceMaps,

    // Ensure that Webpack will get a full absolute path in the sourcemap
    // so that it can properly map the module back to its internal cached
    // modules.
    sourceFileName: filename,
  });
  // Remove loader related options
  delete programmaticOptions.cacheDirectory;
  delete programmaticOptions.cacheIdentifier;
  delete programmaticOptions.cacheCompression;
  delete programmaticOptions.isServer
  delete programmaticOptions.asyncToPromises
  delete programmaticOptions.distDir

  const config: any = babel.loadPartialConfig(injectCaller(programmaticOptions));
  if (config) {
    let options = config.options;

    if (config.hasFilesystemConfig()) {
      for (const file of [config.babelrc, config.config]) {
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

    if (!isServer && source.toString().indexOf('next/amp')) {
      const dropClientPlugin = babel.createConfigItem([require('../../babel/plugins/next-drop-client-page'), {}], { type: 'plugin' })
      options.plugins = options.plugins || []
      options.plugins.push(dropClientPlugin)
    }

    if (isServer && source.toString().indexOf('next/data') !== -1) {
      const nextDataPlugin = babel.createConfigItem([require('../../babel/plugins/next-data'), { key: basename(filename) + '-' + hash(filename) }], { type: 'plugin' })
      options.plugins = options.plugins || []
      options.plugins.push(nextDataPlugin)
    }

    if (asyncToPromises) {
      const asyncToPromisesPlugin = babel.createConfigItem(['babel-plugin-transform-async-to-promises', {
        inlineHelpers: true
      }], { type: 'plugin' })
      options.plugins = options.plugins || []
      options.plugins.push(asyncToPromisesPlugin)

      const regeneratorPlugin = options.plugins.find((plugin: any) => {
        return plugin[0] === require('@babel/plugin-transform-runtime')
      })
      if (regeneratorPlugin) {
        regeneratorPlugin[1].regenerator = false
      }

      const babelPresetEnv = (options.presets || []).find((preset: any = []) => {
        return preset[0] === require('@babel/preset-env').default
      })
      if (babelPresetEnv) {
        babelPresetEnv[1].exclude = (options.presets[0][1].exclude || []).concat([
          'transform-typeof-symbol',
          'transform-regenerator',
          'transform-async-to-generator'
        ])
          .filter('transform-typeof-symbol')
      }
    }

    // If the file has `module.exports` we have to transpile commonjs because Babel adds `import` statements
    // That break webpack, since webpack doesn't support combining commonjs and esmodules
    if (source.toString().indexOf('module.exports') !== -1) {
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
        plugins: [
          commonJsItem
        ]
      }
    ]

    if (options.sourceMaps === "inline") {
      // Babel has this weird behavior where if you set "inline", we
      // inline the sourcemap, and set 'result.map = null'. This results
      // in bad behavior from Babel since the maps get put into the code,
      // which Webpack does not expect, and because the map we return to
      // Webpack is null, which is also bad. To avoid that, we override the
      // behavior here so "inline" just behaves like 'true'.
      options.sourceMaps = true;
    }

    const {
      cacheDirectory = join(distDir, 'cache', 'next-babel-loader'),
      cacheIdentifier = JSON.stringify({
        options,
        cacheKey,
        "@babel/core": transformVersion,
      })
    } = loaderOptions;

    const addDependency = (dep: string) => this.addDependency(dep)

    async function getResult() {
      let result;
      if (cacheDirectory) {
        result = await cache({
          source,
          options,
          transform,
          cacheDirectory,
          cacheIdentifier,
        });
      } else {
        result = await transform(source.toString(), options);
      }

      // TODO: Babel should really provide the full list of config files that
      // were used so that this can also handle files loaded with 'extends'.
      if (typeof config.babelrc === "string") {
        addDependency(config.babelrc);
      }

      if (result) {
        const { code, map } = result;
        callback(null, code, map)
        return
      }
    }
    getResult.bind(this)().catch((err: any) => callback(err))
    return
  }

  // If the file was ignored, pass through the original content.
  callback(null, source, inputSourceMap);
  return
}

export default nextBabelLoader
