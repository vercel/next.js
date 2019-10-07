import { process as minify } from 'cssnano-simple'
import webpack from 'webpack'
import { RawSource, SourceMapSource } from 'webpack-sources'

// https://github.com/NMFR/optimize-css-assets-webpack-plugin/blob/0a410a9bf28c7b0e81a3470a13748e68ca2f50aa/src/index.js#L20
const CSS_REGEX = /\.css(\?.*)?$/i

type CssMinimizerPluginOptions = {
  postcssOptions: {
    map: false | { prev?: string | false; inline: boolean; annotation: boolean }
  }
}

export class CssMinimizerPlugin {
  private options: CssMinimizerPluginOptions

  constructor(options: CssMinimizerPluginOptions) {
    this.options = options
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap('CssMinimizerPlugin', compilation => {
      compilation.hooks.optimizeChunkAssets.tapPromise(
        'CssMinimizerPlugin',
        chunks =>
          Promise.all(
            chunks
              .reduce(
                (acc, chunk) => acc.concat(chunk.files || []),
                [] as string[]
              )
              .filter(entry => CSS_REGEX.test(entry))
              .map(file => {
                const postcssOptions = {
                  ...this.options.postcssOptions,
                  to: file,
                  from: file,
                }

                const asset = compilation.assets[file]

                let input: string
                if (postcssOptions.map && asset.sourceAndMap) {
                  const { source, map } = asset.sourceAndMap()
                  input = source
                  postcssOptions.map.prev = map ? map : false
                } else {
                  input = asset.source()
                }

                return minify(input, postcssOptions).then(res => {
                  if (res.map) {
                    compilation.assets[file] = new SourceMapSource(
                      res.css,
                      file,
                      res.map.toJSON()
                    )
                  } else {
                    compilation.assets[file] = new RawSource(res.css)
                  }
                })
              })
          )
      )
    })
  }
}
