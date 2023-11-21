// @ts-ignore
import { matchObject } from 'webpack/lib/ModuleFilenameHelpers'
import { RawSource, SourceMapSource } from 'webpack-sources'
import { transformCss } from '../../../../swc'
import {
  ECacheKey,
  type IMinifyPluginOpts,
  type IPackageJson,
  type TransformType,
} from './interface'
import type { Compilation, Compiler } from 'webpack'
import { join } from 'path'
import { getTargets, isWebpack5 } from './utils'
import { Buffer } from 'buffer'

const pkgPath = join(__dirname, '../package.json')
const pkg = require(pkgPath) as IPackageJson

const PLUGIN_NAME = 'lightning-css-minify'
const CSS_FILE_REG = /\.css(?:\?.*)?$/i

export class LightningCssMinifyPlugin {
  private readonly options: Omit<IMinifyPluginOpts, 'implementation'>
  private readonly transform: TransformType

  constructor(opts: IMinifyPluginOpts = {}) {
    const { implementation, ...otherOpts } = opts
    if (implementation && typeof implementation.transformCss !== 'function') {
      throw new TypeError(
        `[LightningCssMinifyPlugin]: implementation.transformCss must be an 'lightningcss' transform function. Received ${typeof implementation.transformCss}`
      )
    }

    this.transform = implementation?.transformCss ?? transformCss
    this.options = otherOpts
  }

  apply(compiler: Compiler) {
    const meta = JSON.stringify({
      name: pkg.name,
      version: pkg.version,
      options: this.options,
    })

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.chunkHash.tap(PLUGIN_NAME, (_, hash) =>
        hash.update(meta)
      )

      if (isWebpack5(compilation)) {
        compilation.hooks.processAssets.tapPromise(
          {
            name: PLUGIN_NAME,
            stage: compilation.constructor.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
            additionalAssets: true,
          },
          async () => await this.transformAssets(compilation)
        )

        compilation.hooks.statsPrinter.tap(PLUGIN_NAME, (statsPrinter) => {
          statsPrinter.hooks.print
            .for('asset.info.minimized')
            // @ts-ignore
            .tap(PLUGIN_NAME, (minimized, { green, formatFlag }) => {
              // @ts-ignore
              return minimized ? green(formatFlag('minimized')) : undefined
            })
        })
      } else {
        compilation.hooks.optimizeChunkAssets.tapPromise(
          PLUGIN_NAME,
          async () => await this.transformAssets(compilation)
        )
      }
    })
  }

  private async transformAssets(compilation: Compilation): Promise<void> {
    const {
      options: { devtool },
    } = compilation.compiler

    const sourcemap =
      this.options.sourceMap === undefined
        ? ((devtool && (devtool as string).includes('source-map')) as boolean)
        : this.options.sourceMap

    const {
      include,
      exclude,
      test: testRegExp,
      targets: userTargets,
      ...transformOptions
    } = this.options

    const assets = compilation.getAssets().filter(
      (asset) =>
        // Filter out already minimized
        !asset.info.minimized &&
        // Filter out by file type
        (testRegExp || CSS_FILE_REG).test(asset.name) &&
        matchObject({ include, exclude }, asset.name)
    )

    await Promise.all(
      assets.map(async (asset) => {
        const { source, map } = asset.source.sourceAndMap()
        const sourceAsString = source.toString()
        const code = typeof source === 'string' ? Buffer.from(source) : source
        const targets = getTargets({
          default: userTargets,
          key: ECacheKey.minify,
        })

        const result = await this.transform({
          filename: asset.name,
          code,
          minify: true,
          sourceMap: sourcemap,
          targets,
          ...transformOptions,
        })
        const codeString = result.code.toString()

        compilation.updateAsset(
          asset.name,
          // @ts-ignore
          sourcemap
            ? new SourceMapSource(
                codeString,
                asset.name,
                JSON.parse(result.map!.toString()),
                sourceAsString,
                map as any,
                true
              )
            : new RawSource(codeString),
          {
            ...asset.info,
            minimized: true,
          }
        )
      })
    )
  }
}
