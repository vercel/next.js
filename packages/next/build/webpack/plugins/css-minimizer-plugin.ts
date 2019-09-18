import webpack from 'webpack'
import { SourceMapSource, RawSource } from 'webpack-sources'
import { process as minify } from 'cssnano-simple'

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
                let inputSourceMap: string | undefined

                if (postcssOptions.map && asset.sourceAndMap) {
                  const { source, map } = asset.sourceAndMap()
                  input = source
                  inputSourceMap = map

                  postcssOptions.map.prev = inputSourceMap
                    ? postcssOptions.map.prev
                    : false
                } else {
                  input = asset.source()
                }

                return minify(input, postcssOptions).then(res => {
                  if (res.map) {
                    compilation.assets[file] = new (SourceMapSource as any)(
                      res.css, // sourceCode: String
                      file, // name: String
                      res.map.toJSON(), // sourceMap: Object | String
                      input, // originalSource?: String
                      inputSourceMap, // innerSourceMap?: Object | String
                      true // removeOriginalSource?: boolean
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
