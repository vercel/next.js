import { promises as fs } from 'fs'
import loaderUtils from 'next/dist/compiled/loader-utils'
import {
  isWebpack5,
  sources,
  webpack,
} from 'next/dist/compiled/webpack/webpack'

const PLUGIN_NAME = 'CopyFilePlugin'

export class CopyFilePlugin {
  private source: string
  private name: string
  private minimize: boolean
  private info?: object

  constructor({
    source,
    name,
    minimize,
    info,
  }: {
    source: string
    name: string
    minimize: boolean
    info?: object
  }) {
    this.source = source
    this.name = name
    this.minimize = minimize
    this.info = info
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      const hook = isWebpack5
        ? // @ts-ignore
          compilation.hooks.processAssets
        : compilation.hooks.additionalAssets
      hook.tapPromise(
        isWebpack5
          ? {
              name: PLUGIN_NAME,
              // @ts-ignore TODO: Remove ignore when webpack 5 is stable
              stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
            }
          : PLUGIN_NAME,
        async () => {
          const content = await fs.readFile(this.source, 'utf8')

          const file = loaderUtils.interpolateName(
            { resourcePath: this.source },
            this.name,
            { content, context: compiler.context }
          )

          // @ts-ignore
          compilation.emitAsset(file, new sources.RawSource(content), {
            ...this.info,
          })
        }
      )
    })
  }
}
