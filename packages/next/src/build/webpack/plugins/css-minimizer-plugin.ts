import cssnanoSimple from 'next/dist/compiled/cssnano-simple'
import postcssScss from 'next/dist/compiled/postcss-scss'
import postcss from 'postcss'
import type { Parser } from 'postcss'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { getCompilationSpan } from '../utils'

// https://github.com/NMFR/optimize-css-assets-webpack-plugin/blob/0a410a9bf28c7b0e81a3470a13748e68ca2f50aa/src/index.js#L20
const CSS_REGEX = /\.css(\?.*)?$/i

// When postcss-scss (or mini-css-extract-plugin) concatenates adjacent
// `@layer` statements, the separating `;` is lost and postcss-scss
// produces a single AtRule whose `params` contains the full merged text,
// e.g. `"reset, tokens, base, components, utilities\n@layer reset"`.
// lightningcss cannot parse this and crashes. The fix detects these
// merged nodes by looking for an embedded `@layer` keyword inside
// `params`, splits them into individual `@layer` nodes, and inserts
// them as siblings so each node has well-formed params.
const SPLIT_LAYER_RE = /\n\s*@layer\b/

export const splitMergedLayerNodesPlugin: postcss.Plugin = {
  postcssPlugin: 'split-merged-layer-nodes',
  AtRule: {
    layer(atRule) {
      if (!atRule.params) return
      if (!SPLIT_LAYER_RE.test(atRule.params)) return

      // Split on embedded @layer keywords (with optional surrounding whitespace).
      // Pattern: "\n @layer " or "\n@layer " — the newline + @layer is the separator.
      const parts = atRule.params.split(/\n\s*@layer\s*/)

      // Build individual @layer nodes. The first part inherits the
      // original node's position so source maps stay reasonable.
      const parent = atRule.parent!
      const originalNodes = atRule.nodes
      const newNodes: postcss.AtRule[] = []

      for (const part of parts) {
        const name = part.trim()
        if (!name) continue
        const node = atRule.clone({
          params: name,
          nodes: undefined,
          raws: { between: '' },
        })
        newNodes.push(node)
      }

      // If the original merged node had children (e.g. postcss-scss merged
      // `@layer reset, tokens, base;\n@layer reset { ... }` into one node),
      // attach those children to the LAST split node.
      if (originalNodes && originalNodes.length > 0 && newNodes.length > 0) {
        const lastNode = newNodes[newNodes.length - 1]
        for (const child of originalNodes) {
          lastNode.append(child)
        }
      }

      // Replace the original merged node with the split nodes.
      for (let i = 0; i < newNodes.length; i++) {
        parent.insertBefore(atRule, newNodes[i])
      }
      atRule.remove()
    },
  },
}

// Ensure @layer statement at-rules (e.g. `@layer reset, tokens, base;`)
// always keep their trailing semicolon. PostCSS's Stringifier (line 52)
// outputs `;` only when the `semicolon` param is true — for the last
// child in a root this depends on `root.raws.semicolon`, which can be
// lost when the CSS is re-parsed by cssnano's internal pipeline. This
// causes `@layer` ordering statements to merge with the following
// `@layer` block, producing invalid CSS. The fix embeds the semicolon
// into `node.raws.between` which the Stringifier reads directly for
// childless at-rules (line 52: `node.raws.between || ''`).
export const preserveLayerSemicolonPlugin: postcss.Plugin = {
  postcssPlugin: 'preserve-atrule-statement-semicolon',
  AtRule: {
    layer(atRule) {
      if (atRule.nodes || !atRule.params) return
      // Only fix the last child. For non-last children the Stringifier
      // already passes `semicolon=true` from `body()`, so `;` is emitted
      // via the `semicolon` parameter. For the last child, `semicolon`
      // depends on `root.raws.semicolon` which may be `false`, so we
      // embed the `;` into `between` which is always emitted for
      // childless at-rules (stringifier.js line 52).
      if (atRule.next()) return
      // If the parent root already tracks a trailing semicolon
      // (root.raws.semicolon = true), the Stringifier will emit `;`
      // via the `semicolon` param — don't double it.
      if (atRule.parent?.raws?.semicolon) return
      const between = atRule.raws.between || ''
      if (!between.endsWith(';')) {
        atRule.raws.between = between + ';'
      }
    },
  },
}

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
      parser: postcssScss as any as Parser,
    }

    let input: string
    if (postcssOptions.map && asset.sourceAndMap) {
      const { source, map } = asset.sourceAndMap()
      input = source
      postcssOptions.map.prev = map ? map : false
    } else {
      input = asset.source()
    }

    return postcss([
      splitMergedLayerNodesPlugin,
      preserveLayerSemicolonPlugin,
      cssnanoSimple({ colormin: false }, postcss),
    ])
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
      const cache = compilation.getCache('CssMinimizerPlugin')
      compilation.hooks.processAssets.tapPromise(
        {
          name: 'CssMinimizerPlugin',
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
        },
        async (assets: any) => {
          const compilationSpan =
            getCompilationSpan(compilation) || getCompilationSpan(compiler)
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
                    const assetSource = compilation.getAsset(file).source
                    const etag = cache.getLazyHashedEtag(assetSource)
                    const cachedResult = await cache.getPromise(file, etag)

                    assetSpan.setAttribute(
                      'cache',
                      cachedResult ? 'HIT' : 'MISS'
                    )
                    if (cachedResult) {
                      compilation.updateAsset(file, cachedResult)
                      return
                    }

                    const result = await this.optimizeAsset(file, assetSource)
                    await cache.storePromise(file, etag, result)
                    compilation.updateAsset(file, result)
                  })
                })
            )
          })
        }
      )
    })
  }
}
