/**
 * MIT License
 *
 * Copyright (c) 2018 Prateek Bhatnagar
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Webpack plugin for NextJs that runs a child compiler to generate a second (modern) JS bundle
 *
 * @author: Janicklas Ralph (https://github.com/janickals-ralph)
 *
 * Original source from which this was built upon - https://github.com/prateekbh/babel-esm-plugin
 */
import {
  Compiler,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  compilation as CompilationType,
  Plugin,
  RuleSetRule,
  RuleSetLoader,
  Output,
} from 'webpack'

const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin')
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin')
const JsonpTemplatePlugin = require('webpack/lib/web/JsonpTemplatePlugin')
const SplitChunksPlugin = require('webpack/lib/optimize/SplitChunksPlugin')
const RuntimeChunkPlugin = require('webpack/lib/optimize/RuntimeChunkPlugin')

type BabelConfigItem = string | [string] | [string, any]

const PLUGIN_NAME = 'NextEsmPlugin'

// Matches all variations of preset-env as a filepath.
// Example: /project/foo/node_modules/babel-preset-react-app/dependencies.js
const IS_PRESET_ENV = /(^|[\\/])(babel-preset-react-app\/dependencies(\.js)?|@babel\/(preset-)?env)([\\/]|$)/

// Matches Babel preset paths that support the useBuiltIns option
const PRESETS_WITH_USEBUILTINS = /(^|[\\/])(@babel\/(preset-)?react)([\\/]|$)/

// Matches Babel plugin paths that support the useBuiltIns option
const PLUGINS_WITH_USEBUILTINS = /(^|[\\/])(@babel\/(plugin-)?transform-react-jsx)([\\/]|$)/

export class NextEsmPlugin implements Plugin {
  options: {
    filename: any
    chunkFilename: any
    excludedPlugins: string[]
    additionalPlugins: Plugin[]
  }

  constructor(options: {
    filename: any
    chunkFilename: any
    excludedPlugins?: string[]
    additionalPlugins?: any
  }) {
    this.options = Object.assign(
      { excludedPlugins: [], additionalPlugins: [] },
      options
    )
  }

  apply(compiler: Compiler) {
    compiler.hooks.make.tapAsync(PLUGIN_NAME, (compilation, callback) => {
      this.runBuild(compiler, compilation).then(callback)
    })
  }

  getLoaders(rules: RuleSetRule[], predicate: (loader: string) => boolean) {
    const results = []
    for (let rule of rules) {
      if (Array.isArray(rule.use)) {
        const matches = (rule.use as RuleSetLoader[]).filter(
          (r) => r.loader && predicate(r.loader)
        )
        if (matches.length > 0) {
          results.push(...matches)
        }
      }

      const ruleUse = rule.use as RuleSetLoader
      let ruleLoader = rule.loader
      if (typeof ruleLoader === 'object' && 'loader' in ruleLoader) {
        ruleLoader = ruleLoader.loader
      }
      if (
        (ruleUse?.loader && predicate(ruleUse.loader)) ||
        (ruleLoader && predicate(ruleLoader as string))
      ) {
        results.push(ruleUse || rule)
      }
    }
    return results
  }

  updateOptions(childCompiler: Compiler) {
    if (!childCompiler.options.module) {
      throw new Error('Webpack.options.module not found!')
    }

    let babelLoader = this.getLoaders(
      childCompiler.options.module.rules,
      (loader) => loader.includes('next-babel-loader')
    )[0]

    if (!babelLoader) {
      throw new Error('Babel-loader config not found!')
    }

    babelLoader.options = Object.assign({}, babelLoader.options, {
      isModern: true,
    })
    if (typeof babelLoader.options !== 'string') {
      this.ensureModernBabelOptions(babelLoader.options)
    }

    const additionalBabelLoaders = this.getLoaders(
      childCompiler.options.module.rules,
      (loader) => /(^|[\\/])babel-loader([\\/]|$)/.test(loader)
    )
    for (const loader of additionalBabelLoaders) {
      // @TODO support string options?
      if (!loader.options || typeof loader.options === 'string') continue
      this.ensureModernBabelOptions(loader.options)
    }
  }

  ensureModernBabelOptions(options: {
    presets?: BabelConfigItem[]
    plugins?: BabelConfigItem[]
  }) {
    // find and remove known ES2017-to-ES5 transforms
    if (options.presets) {
      options.presets = options.presets.reduce(
        (presets: BabelConfigItem[], preset) => {
          const name = Array.isArray(preset) ? preset[0] : preset
          const opts = Object.assign(
            {},
            (Array.isArray(preset) && preset[1]) || {}
          )

          if (PRESETS_WITH_USEBUILTINS.test(name)) {
            opts.useBuiltIns = true
          }

          if (IS_PRESET_ENV.test(name)) {
            presets.push([
              require.resolve('@babel/preset-modules'),
              { loose: true },
            ])
          } else {
            presets.push([name, opts])
          }
          return presets
        },
        []
      )
    }

    if (options.plugins) {
      options.plugins = options.plugins.map((plugin) => {
        const name = Array.isArray(plugin) ? plugin[0] : plugin
        const opts = Object.assign(
          {},
          (Array.isArray(plugin) && plugin[1]) || {}
        )

        if (PLUGINS_WITH_USEBUILTINS.test(name)) {
          opts.useBuiltIns = true
        }

        return [name, opts]
      })
    }
  }

  updateAssets(
    compilation: CompilationType.Compilation,
    childCompilation: CompilationType.Compilation
  ) {
    compilation.assets = Object.assign(
      childCompilation.assets,
      compilation.assets
    )

    compilation.namedChunkGroups = Object.assign(
      childCompilation.namedChunkGroups,
      compilation.namedChunkGroups
    )

    const unnamedChunks: CompilationType.Chunk[] = []
    const childChunkFileMap = childCompilation.chunks.reduce(
      (
        chunkMap: { [key: string]: CompilationType.Chunk },
        chunk: CompilationType.Chunk
      ) => {
        // Dynamic chunks may not have a name. It'll be null in such cases
        if (chunk.name === null) {
          unnamedChunks.push(chunk)
        } else {
          chunkMap[chunk.name] = chunk
        }

        return chunkMap
      },
      {}
    )

    // Merge chunks - merge the files of chunks with the same name
    compilation.chunks.forEach((chunk: CompilationType.Chunk) => {
      const childChunk = childChunkFileMap[chunk.name]

      // Do not merge null named chunks since they are different
      if (chunk.name !== null && childChunk?.files) {
        delete childChunkFileMap[chunk.name]
        chunk.files.push(
          ...childChunk.files.filter((v: any) => !chunk.files.includes(v))
        )
      }
    })

    // Add modern only chunks into the main compilation
    compilation.chunks.push(
      ...Object.values(childChunkFileMap),
      ...unnamedChunks
    )

    // Place modern only (unmerged) chunks inside the right entry point
    compilation.entrypoints.forEach((entryPoint, entryPointName) => {
      const childEntryPoint = childCompilation.entrypoints.get(entryPointName)

      childEntryPoint.chunks.forEach((chunk: CompilationType.Chunk) => {
        if (
          // Add null named dynamic chunks since they weren't merged
          chunk.name === null ||
          childChunkFileMap.hasOwnProperty(chunk.name)
        ) {
          entryPoint.chunks.push(chunk)
        }
      })
    })
  }

  async runBuild(compiler: Compiler, compilation: CompilationType.Compilation) {
    const outputOptions: Output = { ...compiler.options.output }

    if (typeof this.options.filename === 'function') {
      outputOptions.filename = this.options.filename(outputOptions.filename)
    } else {
      outputOptions.filename = this.options.filename
    }

    if (typeof this.options.chunkFilename === 'function') {
      outputOptions.chunkFilename = this.options.chunkFilename(
        outputOptions.chunkFilename
      )
    } else {
      outputOptions.chunkFilename = this.options.chunkFilename
    }

    let plugins = (compiler.options.plugins || []).filter(
      (c) =>
        !(
          this.options.excludedPlugins.includes(c.constructor.name) ||
          c.constructor.name === PLUGIN_NAME
        )
    )

    // Add the additionalPlugins
    plugins = plugins.concat(this.options.additionalPlugins)

    /**
     * We are deliberately not passing plugins in createChildCompiler.
     * All webpack does with plugins is to call `apply` method on them
     * with the childCompiler.
     * But by then we haven't given childCompiler a fileSystem or other options
     * which a few plugins might expect while execution the apply method.
     * We do call the `apply` method of all plugins by ourselves later in the code
     */
    const childCompiler = compilation.createChildCompiler(
      PLUGIN_NAME,
      outputOptions
    )

    childCompiler.context = compiler.context
    childCompiler.inputFileSystem = compiler.inputFileSystem
    childCompiler.outputFileSystem = compiler.outputFileSystem

    // Call the `apply` method of all plugins by ourselves.
    if (Array.isArray(plugins)) {
      for (const plugin of plugins) {
        plugin.apply(childCompiler)
      }
    }

    let compilerEntries: any = compiler.options.entry
    if (typeof compilerEntries === 'function') {
      compilerEntries = await compilerEntries()
    }
    if (typeof compilerEntries === 'string') {
      compilerEntries = { index: compilerEntries }
    }

    Object.keys(compilerEntries).forEach((entry) => {
      const entryFiles = compilerEntries[entry]
      if (Array.isArray(entryFiles)) {
        new MultiEntryPlugin(compiler.context, entryFiles, entry).apply(
          childCompiler
        )
      } else {
        new SingleEntryPlugin(compiler.context, entryFiles, entry).apply(
          childCompiler
        )
      }
    })

    // Convert entry chunk to entry file
    new JsonpTemplatePlugin().apply(childCompiler)

    const optimization = compiler.options.optimization
    if (optimization) {
      if (optimization.splitChunks) {
        new SplitChunksPlugin(
          Object.assign({}, optimization.splitChunks)
        ).apply(childCompiler)
      }

      if (optimization.runtimeChunk) {
        new RuntimeChunkPlugin(
          Object.assign({}, optimization.runtimeChunk)
        ).apply(childCompiler)
      }
    }

    // Hold back the main compilation until our Child Compiler has completed so its assets get optimized
    const child = new Promise((resolve, reject) => {
      // Defer the child compiler until known main thread "dead time" (while Terser is doing minification in the background)
      let started = false
      compilation.hooks.optimizeChunkAssets.intercept({
        call: () => {
          // only run the first time optimizeChunkAssets is called
          if (started) return
          started = true

          // Delay the Child Compiler until optimizeChunkAssets has had time to send work to the Terser pool
          setTimeout(() => {
            this.updateOptions(childCompiler)

            childCompiler.runAsChild((err, _entries, childCompilation) => {
              if (err) {
                return reject(err)
              }

              if (childCompilation.errors.length > 0) {
                return reject(childCompilation.errors[0])
              }

              this.updateAssets(compilation, childCompilation)
              resolve()
            })
          }, 500)
        },
      })
    })
    compilation.hooks.optimizeAssets.tapPromise(PLUGIN_NAME, () => child)
  }
}
