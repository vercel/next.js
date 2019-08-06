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
  compilation,
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

const PLUGIN_NAME = 'NextEsmPlugin'

export default class NextEsmPlugin implements Plugin {
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
      {
        excludedPlugins: [PLUGIN_NAME],
        additionalPlugins: [],
      },
      options
    )
  }

  apply(compiler: Compiler) {
    compiler.hooks.make.tapAsync(
      PLUGIN_NAME,
      (compilation: compilation.Compilation, callback) => {
        this.runBuild(compiler, compilation).then(callback)
      }
    )
  }

  getBabelLoader(rules: RuleSetRule[]) {
    for (let rule of rules) {
      if (!rule.use) continue

      if (Array.isArray(rule.use)) {
        return (rule.use as RuleSetLoader[]).find(
          r => r.loader && r.loader.includes('next-babel-loader')
        )
      }

      const ruleUse = rule.use as RuleSetLoader
      const ruleLoader = rule.loader as string
      if (
        (ruleUse.loader && ruleUse.loader.includes('next-babel-loader')) ||
        (ruleLoader && ruleLoader.includes('next-babel-loader'))
      ) {
        return ruleUse || rule
      }
    }
  }

  updateOptions(childCompiler: Compiler) {
    if (!childCompiler.options.module) {
      throw new Error('Webpack.options.module not found!')
    }

    let babelLoader = this.getBabelLoader(childCompiler.options.module.rules)

    if (!babelLoader) {
      throw new Error('Babel-loader config not found!')
    }

    babelLoader.options = Object.assign({}, babelLoader.options, {
      isModern: true,
    })
  }

  updateAssets(
    compilation: compilation.Compilation,
    childCompilation: compilation.Compilation
  ) {
    compilation.assets = Object.assign(
      childCompilation.assets,
      compilation.assets
    )

    compilation.namedChunkGroups = Object.assign(
      childCompilation.namedChunkGroups,
      compilation.namedChunkGroups
    )

    const childChunkFileMap = childCompilation.chunks.reduce(
      (
        chunkMap: { [key: string]: compilation.Chunk },
        chunk: compilation.Chunk
      ) => {
        chunkMap[chunk.name] = chunk
        return chunkMap
      },
      {}
    )

    // Merge files from similar chunks
    compilation.chunks.forEach((chunk: compilation.Chunk) => {
      const childChunk = childChunkFileMap[chunk.name]

      if (childChunk && childChunk.files) {
        delete childChunkFileMap[chunk.name]
        chunk.files.push(
          ...childChunk.files.filter((v: any) => !chunk.files.includes(v))
        )
      }
    })

    // Add modern only chunks
    compilation.chunks.push(...Object.values(childChunkFileMap))

    // Place modern only chunk inside the right entry point
    compilation.entrypoints.forEach((entryPoint, entryPointName) => {
      const childEntryPoint = childCompilation.entrypoints.get(entryPointName)

      childEntryPoint.chunks.forEach((chunk: compilation.Chunk) => {
        if (childChunkFileMap.hasOwnProperty(chunk.name)) {
          entryPoint.chunks.push(chunk)
        }
      })
    })
  }

  async runBuild(compiler: Compiler, compilation: compilation.Compilation) {
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
      c => !this.options.excludedPlugins.includes(c.constructor.name)
    )

    // Add the additionalPlugins
    plugins = plugins.concat(this.options.additionalPlugins)

    /**
     * We are deliberatly not passing plugins in createChildCompiler.
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

    Object.keys(compilerEntries).forEach(entry => {
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

    compilation.hooks.additionalAssets.tapAsync(
      PLUGIN_NAME,
      childProcessDone => {
        this.updateOptions(childCompiler)

        childCompiler.runAsChild((err, entries, childCompilation) => {
          if (err) {
            return childProcessDone(err)
          }

          if (childCompilation.errors.length > 0) {
            return childProcessDone(childCompilation.errors[0])
          }

          this.updateAssets(compilation, childCompilation)
          childProcessDone()
        })
      }
    )
  }
}
