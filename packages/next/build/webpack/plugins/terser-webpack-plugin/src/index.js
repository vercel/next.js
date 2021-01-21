// @ts-nocheck
import * as path from 'path'
import {
  webpack,
  ModuleFilenameHelpers,
  isWebpack5,
  sources,
} from 'next/dist/compiled/webpack/webpack'
import pLimit from 'p-limit'
import jestWorker from 'jest-worker'
import crypto from 'crypto'
import cacache from 'next/dist/compiled/cacache'
import { tracer, traceAsyncFn } from '../../../../tracer'
import { spans } from '../../profiling-plugin'

function getEcmaVersion(environment) {
  // ES 6th
  if (
    environment.arrowFunction ||
    environment.const ||
    environment.destructuring ||
    environment.forOf ||
    environment.module
  ) {
    return 2015
  }

  // ES 11th
  if (environment.bigIntLiteral || environment.dynamicImport) {
    return 2020
  }

  return 5
}

function buildError(error, file) {
  if (error.line) {
    return new Error(
      `${file} from Terser\n${error.message} [${file}:${error.line},${
        error.col
      }]${
        error.stack ? `\n${error.stack.split('\n').slice(1).join('\n')}` : ''
      }`
    )
  }

  if (error.stack) {
    return new Error(`${file} from Terser\n${error.message}\n${error.stack}`)
  }

  return new Error(`${file} from Terser\n${error.message}`)
}

class Webpack4Cache {
  constructor(cacheDir, { SourceMapSource, RawSource }) {
    this.cacheDir = cacheDir
    this.sources = { SourceMapSource, RawSource }
  }
  getLazyHashedEtag(obj) {
    let str
    if (obj.source) {
      str = obj.source()
    }
    const hash = crypto.createHash('md4')
    hash.update(str ? str : obj)
    return hash.digest('base64')
  }

  async getPromise(identifier, etag) {
    let cachedResult

    try {
      cachedResult = await cacache.get(this.cacheDir, etag)
    } catch (ignoreError) {
      // eslint-disable-next-line no-undefined
      return undefined
    }

    cachedResult = JSON.parse(cachedResult.data)

    const { code, name, map, input, inputSourceMap } = cachedResult

    let source

    if (map) {
      source = new this.sources.SourceMapSource(
        code,
        name,
        map,
        input,
        inputSourceMap,
        true
      )
    } else {
      source = new this.sources.RawSource(code)
    }

    return { source }
  }

  async storePromise(identifier, etag, data) {
    await cacache.put(this.cacheDir, etag, JSON.stringify(data))
  }
}

class TerserPlugin {
  constructor(options = {}) {
    const { cacheDir, terserOptions = {}, parallel } = options

    this.options = {
      cacheDir,
      parallel,
      terserOptions,
    }
  }

  async optimize(
    compiler,
    compilation,
    assets,
    optimizeOptions,
    cache,
    { SourceMapSource, RawSource }
  ) {
    const compilerSpan = spans.get(compiler)

    return tracer.withSpan(compilerSpan, () => {
      const span = tracer.startSpan('terser-webpack-plugin-optimize', {
        attributes: {
          webpackVersion: isWebpack5 ? 5 : 4,
          compilationName: compilation.name,
        },
      })

      return traceAsyncFn(span, async () => {
        let numberOfAssetsForMinify = 0
        const assetsList = isWebpack5
          ? Object.keys(assets)
          : [
              ...Array.from(compilation.additionalChunkAssets || []),
              ...Array.from(assets).reduce((acc, chunk) => {
                return acc.concat(Array.from(chunk.files || []))
              }, []),
            ]

        const assetsForMinify = await Promise.all(
          assetsList
            .filter((name) => {
              if (
                !ModuleFilenameHelpers.matchObject.bind(
                  // eslint-disable-next-line no-undefined
                  undefined,
                  { test: /\.[cm]?js(\?.*)?$/i }
                )(name)
              ) {
                return false
              }

              const res = compilation.getAsset(name)
              if (!res) {
                console.log(name)
                return false
              }

              const { info } = res

              // Skip double minimize assets from child compilation
              if (info.minimized) {
                return false
              }

              return true
            })
            .map(async (name) => {
              const { info, source } = compilation.getAsset(name)

              const eTag = cache.getLazyHashedEtag(source)
              const output = await cache.getPromise(name, eTag)

              if (!output) {
                numberOfAssetsForMinify += 1
              }

              return { name, info, inputSource: source, output, eTag }
            })
        )

        const numberOfWorkers = Math.min(
          numberOfAssetsForMinify,
          optimizeOptions.availableNumberOfCores
        )

        let initializedWorker

        // eslint-disable-next-line consistent-return
        const getWorker = () => {
          if (initializedWorker) {
            return initializedWorker
          }

          initializedWorker = new jestWorker(
            path.join(__dirname, './minify.js'),
            {
              numWorkers: numberOfWorkers,
              enableWorkerThreads: true,
            }
          )

          initializedWorker.getStdout().pipe(process.stdout)
          initializedWorker.getStderr().pipe(process.stderr)

          return initializedWorker
        }

        const limit = pLimit(
          numberOfAssetsForMinify > 0 ? numberOfWorkers : Infinity
        )
        const scheduledTasks = []

        for (const asset of assetsForMinify) {
          scheduledTasks.push(
            limit(async () => {
              const { name, inputSource, info, eTag } = asset
              let { output } = asset

              const assetSpan = tracer.startSpan('minify-js', {
                attributes: {
                  name,
                  cache: typeof output === 'undefined' ? 'MISS' : 'HIT',
                },
              })

              return traceAsyncFn(assetSpan, async () => {
                if (!output) {
                  const {
                    source: sourceFromInputSource,
                    map: inputSourceMap,
                  } = inputSource.sourceAndMap()

                  const input = Buffer.isBuffer(sourceFromInputSource)
                    ? sourceFromInputSource.toString()
                    : sourceFromInputSource

                  const options = {
                    name,
                    input,
                    inputSourceMap,
                    terserOptions: { ...this.options.terserOptions },
                  }

                  if (typeof options.terserOptions.module === 'undefined') {
                    if (typeof info.javascriptModule !== 'undefined') {
                      options.terserOptions.module = info.javascriptModule
                    } else if (/\.mjs(\?.*)?$/i.test(name)) {
                      options.terserOptions.module = true
                    } else if (/\.cjs(\?.*)?$/i.test(name)) {
                      options.terserOptions.module = false
                    }
                  }

                  try {
                    output = await getWorker().minify(options)
                  } catch (error) {
                    compilation.errors.push(buildError(error, name))

                    return
                  }

                  if (output.map) {
                    output.source = new SourceMapSource(
                      output.code,
                      name,
                      output.map,
                      input,
                      /** @type {SourceMapRawSourceMap} */ (inputSourceMap),
                      true
                    )
                  } else {
                    output.source = new RawSource(output.code)
                  }

                  if (isWebpack5) {
                    await cache.storePromise(name, eTag, {
                      source: output.source,
                    })
                  } else {
                    await cache.storePromise(name, eTag, {
                      code: output.code,
                      map: output.map,
                      name,
                      input,
                      inputSourceMap,
                    })
                  }
                }

                /** @type {AssetInfo} */
                const newInfo = { minimized: true }
                const { source } = output

                compilation.updateAsset(name, source, newInfo)
              })
            })
          )
        }

        await Promise.all(scheduledTasks)

        if (initializedWorker) {
          await initializedWorker.end()
        }
      })
    })
  }

  /**
   * @param {Compiler} compiler
   * @returns {void}
   */
  apply(compiler) {
    const { SourceMapSource, RawSource } = compiler?.webpack?.sources || sources
    const { output } = compiler.options

    if (typeof this.options.terserOptions.ecma === 'undefined') {
      this.options.terserOptions.ecma = getEcmaVersion(output.environment || {})
    }

    const pluginName = this.constructor.name
    const availableNumberOfCores = this.options.parallel

    compiler.hooks.compilation.tap(pluginName, (compilation) => {
      // Don't run minifier against mini-css-extract-plugin
      if (compilation.name !== 'client' && compilation.name !== 'server') {
        return
      }

      const cache = isWebpack5
        ? compilation.getCache('TerserWebpackPlugin')
        : new Webpack4Cache(this.options.cacheDir, {
            SourceMapSource,
            RawSource,
          })

      const handleHashForChunk = (hash, chunk) => {
        // increment 'c' to invalidate cache
        hash.update('c')
      }

      if (isWebpack5) {
        const JSModulesHooks = webpack.javascript.JavascriptModulesPlugin.getCompilationHooks(
          compilation
        )
        JSModulesHooks.chunkHash.tap(pluginName, (chunk, hash) => {
          if (!chunk.hasRuntime()) return
          return handleHashForChunk(hash, chunk)
        })

        compilation.hooks.processAssets.tapPromise(
          {
            name: pluginName,
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
          },
          (assets) =>
            this.optimize(
              compiler,
              compilation,
              assets,
              {
                availableNumberOfCores,
              },
              cache,
              { SourceMapSource, RawSource }
            )
        )

        compilation.hooks.statsPrinter.tap(pluginName, (stats) => {
          stats.hooks.print
            .for('asset.info.minimized')
            .tap('terser-webpack-plugin', (minimized, { green, formatFlag }) =>
              // eslint-disable-next-line no-undefined
              minimized ? green(formatFlag('minimized')) : undefined
            )
        })
      } else {
        compilation.mainTemplate.hooks.hashForChunk.tap(
          pluginName,
          handleHashForChunk
        )
        compilation.chunkTemplate.hooks.hashForChunk.tap(
          pluginName,
          handleHashForChunk
        )

        compilation.hooks.optimizeChunkAssets.tapPromise(
          pluginName,
          async (assets) => {
            return await this.optimize(
              compiler,
              compilation,
              assets,
              {
                availableNumberOfCores,
              },
              cache,
              { SourceMapSource, RawSource }
            )
          }
        )
      }
    })
  }
}

export default TerserPlugin
