import LRUCache from 'next/dist/compiled/lru-cache'
import path from '../../../shared/lib/isomorphic/path'
import type { CacheHandler, CacheHandlerContext, CacheHandlerValue } from './'

export default class FileSystemCache implements CacheHandler {
  private fs: CacheHandlerContext['fs']
  private flushToDisk?: CacheHandlerContext['flushToDisk']
  private serverDistDir: CacheHandlerContext['serverDistDir']
  private memoryCache?: LRUCache<string, CacheHandlerValue>
  private appDir: boolean

  constructor(ctx: CacheHandlerContext) {
    this.fs = ctx.fs
    this.flushToDisk = ctx.flushToDisk
    this.serverDistDir = ctx.serverDistDir
    this.appDir = !!ctx._appDir

    if (ctx.maxMemoryCacheSize) {
      this.memoryCache = new LRUCache({
        max: ctx.maxMemoryCacheSize,
        length({ value }) {
          if (!value) {
            return 25
          } else if (value.kind === 'REDIRECT') {
            return JSON.stringify(value.props).length
          } else if (value.kind === 'IMAGE') {
            throw new Error('invariant image should not be incremental-cache')
          }
          // rough estimate of size of cache value
          return (
            value.html.length + (JSON.stringify(value.pageData)?.length || 0)
          )
        },
      })
    }
  }

  public async get(key: string) {
    let data = this.memoryCache?.get(key)

    // let's check the disk for seed data
    if (!data) {
      try {
        const { filePath: htmlPath, isAppPath } = await this.getFsPath(
          `${key}.html`
        )
        const html = await this.fs.readFile(htmlPath)
        const pageData = isAppPath
          ? await this.fs.readFile(
              (
                await this.getFsPath(`${key}.rsc`, true)
              ).filePath
            )
          : JSON.parse(
              await this.fs.readFile(
                await (
                  await this.getFsPath(`${key}.json`, false)
                ).filePath
              )
            )
        const { mtime } = await this.fs.stat(htmlPath)

        data = {
          lastModified: mtime.getTime(),
          value: {
            kind: 'PAGE',
            html,
            pageData,
          },
        }
        this.memoryCache?.set(key, data)
      } catch (_) {
        // unable to get data from disk
      }
    }
    return data || null
  }

  public async set(key: string, data: CacheHandlerValue['value']) {
    if (!this.flushToDisk) return

    this.memoryCache?.set(key, {
      value: data,
      lastModified: Date.now(),
    })

    if (data?.kind === 'PAGE') {
      const isAppPath = typeof data.pageData === 'string'
      const { filePath: htmlPath } = await this.getFsPath(
        `${key}.html`,
        isAppPath
      )
      await this.fs.mkdir(path.dirname(htmlPath))
      await this.fs.writeFile(htmlPath, data.html)

      await this.fs.writeFile(
        (
          await this.getFsPath(
            `${key}.${isAppPath ? 'rsc' : 'json'}`,
            isAppPath
          )
        ).filePath,
        isAppPath ? data.pageData : JSON.stringify(data.pageData)
      )
    }
  }

  private async getFsPath(
    pathname: string,
    appDir?: boolean
  ): Promise<{
    filePath: string
    isAppPath: boolean
  }> {
    let isAppPath = false
    let filePath = path.join(this.serverDistDir, 'pages', pathname)

    if (!this.appDir || appDir === false)
      return {
        filePath,
        isAppPath,
      }
    try {
      await this.fs.readFile(filePath)
      return {
        filePath,
        isAppPath,
      }
    } catch (err) {
      return {
        filePath: path.join(this.serverDistDir, 'app', pathname),
        isAppPath: true,
      }
    }
  }
}
