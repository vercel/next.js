import { transform } from 'next/dist/compiled/lightningcss'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { spans } from './profiling-plugin'

// https://github.com/NMFR/optimize-css-assets-webpack-plugin/blob/0a410a9bf28c7b0e81a3470a13748e68ca2f50aa/src/index.js#L20
const CSS_REGEX = /\.css(\?.*)?$/i

type CssMinimizerPluginOptions = {
  sourceMap: boolean
  inputSourceMap?: string
}

export class CssMinimizerPlugin {
  __next_css_remove = true

  private options: CssMinimizerPluginOptions

  constructor(options: CssMinimizerPluginOptions) {
    this.options = options
  }

  optimizeAsset(file: string, asset: any) {
    const lightningcssOptions = {
      ...this.options,
      filename: file,
    }

    let input: string
    if (lightningcssOptions.sourceMap && asset.sourceAndMap) {
      const { source, map } = asset.sourceAndMap()
      input = source
      if (map) lightningcssOptions.inputSourceMap = map
    } else {
      input = asset.source()
    }

    let { code, map } = transform({
      code: Buffer.from(input),
      minify: true,
      ...lightningcssOptions,
    })

    return !!map
      ? new sources.SourceMapSource(
          code.toString(),
          file,
          JSON.parse(map.toString())
        )
      : new sources.RawSource(code.toString())
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap('CssMinimizerPlugin', (compilation: any) => {
      const cache = compilation.getCache('CssMinimizerPlugin')
      compilation.hooks.processAssets.tapPromise(
        {
          name: 'CssMinimizerPlugin',
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
        },
        async (assets: any) => {
          const compilationSpan = spans.get(compilation) || spans.get(compiler)
          const cssMinimizerSpan = compilationSpan!.traceChild(
            'css-minimizer-plugin'
          )

          return cssMinimizerSpan.traceAsyncFn(async () => {
            const files = Object.keys(assets)
            await Promise.all(
              files
                .filter((file) => CSS_REGEX.test(file))
                .map(async (file) => {
                  const assetSpan = cssMinimizerSpan.traceChild('minify-css')
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

                    const result = this.optimizeAsset(file, asset)
                    await cache.storePromise(file, etag, result)
                    assets[file] = result
                  })
                })
            )
          })
        }
      )
    })
  }
}
