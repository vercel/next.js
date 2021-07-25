import cssnanoSimple from 'cssnano-simple'
import postcssScss from 'next/dist/compiled/postcss-scss'
import postcss, { Parser } from 'postcss'
import {
  webpack,
  isWebpack5,
  sources,
} from 'next/dist/compiled/webpack/webpack'
import { trace } from '../../../telemetry/trace'
import { spans } from './profiling-plugin'

// https://github.com/NMFR/optimize-css-assets-webpack-plugin/blob/0a410a9bf28c7b0e81a3470a13748e68ca2f50aa/src/index.js#L20
const CSS_REGEX = /\.css(\?.*)?$/i

type CssMinimizerPluginOptions = {
  postcssOptions: {
    map: false | { prev?: string | false; inline: boolean; annotation: boolean }
  }
}

export class CssMinimizerPlugin {
  __next_css_remove = true

  private options: CssMinimizerPluginOptions

  constructor(options: CssMinimizerPluginOptions) {
    this.options = options
  }

  optimizeAsset(file: string, asset: any) {
    const postcssOptions = {
      ...this.options.postcssOptions,
      to: file,
      from: file,

      // We don't actually add this parser to support Sass. It can also be used
      // for inline comment support. See the README:
      // https://github.com/postcss/postcss-scss/blob/master/README.md#2-inline-comments-for-postcss
      parser: (postcssScss as any) as Parser,
    }

    let input: string
    if (postcssOptions.map && asset.sourceAndMap) {
      const { source, map } = asset.sourceAndMap()
      input = source
      postcssOptions.map.prev = map ? map : false
    } else {
      input = asset.source()
    }

    return postcss([cssnanoSimple({}, postcss)])
      .process(input, postcssOptions)
      .then((res) => {
        if (res.map) {
          return new sources.SourceMapSource(res.css, file, res.map.toJSON())
        } else {
          return new sources.RawSource(res.css)
        }
      })
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap('CssMinimizerPlugin', (compilation: any) => {
      if (isWebpack5) {
        const cache = compilation.getCache('CssMinimizerPlugin')
        compilation.hooks.processAssets.tapPromise(
          {
            name: 'CssMinimizerPlugin',
            // @ts-ignore TODO: Remove ignore when webpack 5 is stable
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
          },
          async (assets: any) => {
            const compilerSpan = spans.get(compiler)
            const cssMinimizerSpan = trace(
              'css-minimizer-plugin',
              compilerSpan?.id
            )
            cssMinimizerSpan.setAttribute('webpackVersion', 5)

            return cssMinimizerSpan.traceAsyncFn(async () => {
              const files = Object.keys(assets)
              await Promise.all(
                files
                  .filter((file) => CSS_REGEX.test(file))
                  .map(async (file) => {
                    const assetSpan = trace('minify-css', cssMinimizerSpan.id)
                    assetSpan.setAttribute('file', file)

                    return assetSpan.traceAsyncFn(async () => {
                      const asset = assets[file]

                      const etag = cache.getLazyHashedEtag(asset)

                      const cachedResult = await cache.getPromise(file, etag)

                      assetSpan.setAttribute(
                        'cache',
                        cachedResult ? 'HIT' : 'MISS'
                      )
                      if (cachedResult) {
                        assets[file] = cachedResult
                        return
                      }

                      const result = await this.optimizeAsset(file, asset)
                      await cache.storePromise(file, etag, result)
                      assets[file] = result
                    })
                  })
              )
            })
          }
        )
        return
      }
      compilation.hooks.optimizeChunkAssets.tapPromise(
        'CssMinimizerPlugin',
        (chunks: webpack.compilation.Chunk[]) => {
          const compilerSpan = spans.get(compiler)
          const cssMinimizerSpan = trace(
            'css-minimizer-plugin',
            compilerSpan?.id
          )
          cssMinimizerSpan.setAttribute('webpackVersion', 4)
          cssMinimizerSpan.setAttribute('compilationName', compilation.name)

          return cssMinimizerSpan.traceAsyncFn(async () => {
            return await Promise.all(
              chunks
                .reduce(
                  (acc, chunk) => acc.concat(chunk.files || []),
                  [] as string[]
                )
                .filter((entry) => CSS_REGEX.test(entry))
                .map(async (file) => {
                  const assetSpan = trace('minify-css', cssMinimizerSpan.id)
                  assetSpan.setAttribute('file', file)

                  return assetSpan.traceAsyncFn(async () => {
                    const asset = compilation.assets[file]
                    // Makes trace attributes the same as webpack 5
                    // When using webpack 4 the result is not cached
                    assetSpan.setAttribute('cache', 'MISS')
                    compilation.assets[file] = await this.optimizeAsset(
                      file,
                      asset
                    )
                  })
                })
            )
          })
        }
      )
    })
  }
}
