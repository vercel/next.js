import { promises as fs } from 'fs'
import loaderUtils from 'next/dist/compiled/loader-utils3'
import { sources, webpack } from 'next/dist/compiled/webpack/webpack'

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
      const cache = compilation.getCache('CopyFilePlugin')
      const hook = compilation.hooks.processAssets
      hook.tapPromise(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
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

          compilation.emitAsset(file, source, {
            ...this.info,
          })
        }
      )
    })
  }
}
