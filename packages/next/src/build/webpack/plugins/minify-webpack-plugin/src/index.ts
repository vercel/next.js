import {
  webpack,
  ModuleFilenameHelpers,
  sources,
} from 'next/dist/compiled/webpack/webpack'
import pLimit from 'next/dist/compiled/p-limit'
import { spans } from '../../profiling-plugin'

function buildError(error: any, file: string) {
  if (error.line) {
    return new Error(
      `${file} from Minifier\n${error.message} [${file}:${error.line},${
        error.col
      }]${
        error.stack ? `\n${error.stack.split('\n').slice(1).join('\n')}` : ''
      }`
    )
  }

  if (error.stack) {
    return new Error(`${file} from Minifier\n${error.message}\n${error.stack}`)
  }

  return new Error(`${file} from Minifier\n${error.message}`)
}

const debugMinify = process.env.NEXT_DEBUG_MINIFY

export class MinifyPlugin {
  async optimize(
    compiler: any,
    compilation: any,
    assets: any,
    cache: any,
    { SourceMapSource, RawSource }: any
  ) {
    const compilationSpan = spans.get(compilation)! || spans.get(compiler)
    const MinifierSpan = compilationSpan.traceChild(
      'minify-webpack-plugin-optimize'
    )
    MinifierSpan.setAttribute('compilationName', compilation.name)

    return MinifierSpan.traceAsyncFn(async () => {
      const assetsList = Object.keys(assets)

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

            if (debugMinify && debugMinify === '1') {
              console.log(
                JSON.stringify({
                  name,
                  source: source.source().toString(),
                }),
                {
                  breakLength: Infinity,
                  maxStringLength: Infinity,
                }
              )
            }
            return { name, info, inputSource: source, output, eTag }
          })
      )

      let initializedWorker: any

      // eslint-disable-next-line consistent-return
      const getWorker = () => {
        return {
          minify: async (options: any) => {
            const result = await require('../../../../swc').minify(
              options.input,
              {
                ...(options.inputSourceMap
                  ? {
                      sourceMap: {
                        content: JSON.stringify(options.inputSourceMap),
                      },
                    }
                  : {}),
                compress: true,
                mangle: true,
                module: 'unknown',
                output: {
                  comments: false,
                },
              }
            )

            return result
          },
        }
      }

      // The limit in the SWC minifier will be handled by Node.js
      const limit = pLimit(Infinity)
      const scheduledTasks = []

      for (const asset of assetsForMinify) {
        scheduledTasks.push(
          limit(async () => {
            const { name, inputSource, eTag } = asset
            let { output } = asset

            const minifySpan = MinifierSpan.traceChild('minify-js')
            minifySpan.setAttribute('name', name)
            minifySpan.setAttribute(
              'cache',
              typeof output === 'undefined' ? 'MISS' : 'HIT'
            )

            return minifySpan.traceAsyncFn(async () => {
              if (!output) {
                const { source: sourceFromInputSource, map: inputSourceMap } =
                  inputSource.sourceAndMap()

                const input = Buffer.isBuffer(sourceFromInputSource)
                  ? sourceFromInputSource.toString()
                  : sourceFromInputSource

                const options = {
                  name,
                  input,
                  inputSourceMap,
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
                    inputSourceMap,
                    true
                  )
                } else {
                  output.source = new RawSource(output.code)
                }

                await cache.storePromise(name, eTag, {
                  source: output.source,
                })
              }

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
  }

  apply(compiler: any) {
    const { SourceMapSource, RawSource } = compiler?.webpack?.sources || sources
    const pluginName = this.constructor.name

    compiler.hooks.thisCompilation.tap(pluginName, (compilation: any) => {
      const cache = compilation.getCache('MinifierWebpackPlugin')

      const handleHashForChunk = (hash: any, _chunk: any) => {
        // increment 'c' to invalidate cache
        hash.update('c')
      }

      const JSModulesHooks =
        webpack.javascript.JavascriptModulesPlugin.getCompilationHooks(
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
        (assets: any) =>
          this.optimize(compiler, compilation, assets, cache, {
            SourceMapSource,
            RawSource,
          })
      )

      compilation.hooks.statsPrinter.tap(pluginName, (stats: any) => {
        stats.hooks.print
          .for('asset.info.minimized')
          .tap(
            'minify-webpack-plugin',
            (minimized: any, { green, formatFlag }: any) =>
              // eslint-disable-next-line no-undefined
              minimized ? green(formatFlag('minimized')) : undefined
          )
      })
    })
  }
}
