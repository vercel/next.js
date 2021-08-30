import { promises as fs } from 'fs'
import loaderUtils from 'next/dist/compiled/loader-utils'
import {
  isWebpack5,
  sources,
  webpack,
} from 'next/dist/compiled/webpack/webpack'

const PLUGIN_NAME = 'CopyFilePlugin'

export class CopyFilePlugin {
  private filePath: string
  private name: string
  private cacheKey: string
  private info?: object

  constructor({
    filePath,
    cacheKey,
    name,
    info,
  }: {
    filePath: string
    cacheKey: string
    name: string
    minimize: boolean
    info?: object
  }) {
    this.filePath = filePath
    this.cacheKey = cacheKey
    this.name = name
    this.info = info
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: any) => {
      const cache = isWebpack5 ? compilation.getCache('CopyFilePlugin') : null
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
          if (cache) {
            const cachedResult = await cache.getPromise(
              this.filePath,
              this.cacheKey
            )
            if (cachedResult) {
              const { file, source } = cachedResult
              compilation.emitAsset(file, source, {
                ...this.info,
              })
              return
            }
          }
          const content = await fs.readFile(this.filePath, 'utf8')

          const file = loaderUtils.interpolateName(
            { resourcePath: this.filePath },
            this.name,
            { content, context: compiler.context }
          )

          const source = new sources.RawSource(content)

          if (cache) {
            await cache.storePromise(this.filePath, this.cacheKey, {
              file,
              source,
            })
          }

          // @ts-ignore
          compilation.emitAsset(file, source, {
            ...this.info,
          })
        }
      )
    })
  }
}
