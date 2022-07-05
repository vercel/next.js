import LRUCache from 'next/dist/compiled/lru-cache'
import path from '../../../shared/lib/isomorphic/path'
import type { CacheHandler, CacheHandlerContext, CacheHandlerValue } from './'

export default class FileSystemCache implements CacheHandler {
  private fs: CacheHandlerContext['fs']
  private flushToDisk?: CacheHandlerContext['flushToDisk']
  private serverDistDir: CacheHandlerContext['serverDistDir']
  private memoryCache?: LRUCache<string, CacheHandlerValue>

  constructor(ctx: CacheHandlerContext) {
    this.fs = ctx.fs
    this.flushToDisk = ctx.flushToDisk
    this.serverDistDir = ctx.serverDistDir

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
          return value.html.length + JSON.stringify(value.pageData).length
        },
      })
    }
  }

  public async get(key: string) {
    let data = this.memoryCache?.get(key)

    // let's check the disk for seed data
    if (!data) {
      try {
        const htmlPath = this.getFsPath(`${key}.html`)
        const html = await this.fs.readFile(htmlPath)
        const pageData = JSON.parse(
          await this.fs.readFile(this.getFsPath(`${key}.json`))
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
      const htmlPath = this.getFsPath(`${key}.html`)
      await this.fs.mkdir(path.dirname(htmlPath))
      await this.fs.writeFile(htmlPath, data.html)
      await this.fs.writeFile(
        this.getFsPath(`${key}.json`),
        JSON.stringify(data.pageData)
      )
    }
  }

  private getFsPath(pathname: string): string {
    return path.join(this.serverDistDir, 'pages', pathname)
  }
}
