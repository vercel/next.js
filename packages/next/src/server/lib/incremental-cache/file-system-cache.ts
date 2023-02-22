import LRUCache from 'next/dist/compiled/lru-cache'
import path from '../../../shared/lib/isomorphic/path'
import { CacheFs } from '../../../shared/lib/utils'
import type { CacheHandler, CacheHandlerContext, CacheHandlerValue } from './'

type FileSystemCacheContext = Omit<
  CacheHandlerContext,
  'fs' | 'serverDistDir'
> & {
  fs: CacheFs
  serverDistDir: string
}

let memoryCache: LRUCache<string, CacheHandlerValue> | undefined

export default class FileSystemCache implements CacheHandler {
  private fs: FileSystemCacheContext['fs']
  private flushToDisk?: FileSystemCacheContext['flushToDisk']
  private serverDistDir: FileSystemCacheContext['serverDistDir']
  private appDir: boolean

  constructor(ctx: FileSystemCacheContext) {
    this.fs = ctx.fs
    this.flushToDisk = ctx.flushToDisk
    this.serverDistDir = ctx.serverDistDir
    this.appDir = !!ctx._appDir

    if (ctx.maxMemoryCacheSize && !memoryCache) {
      memoryCache = new LRUCache({
        max: ctx.maxMemoryCacheSize,
        length({ value }) {
          if (!value) {
            return 25
          } else if (value.kind === 'REDIRECT') {
            return JSON.stringify(value.props).length
          } else if (value.kind === 'IMAGE') {
            throw new Error('invariant image should not be incremental-cache')
          } else if (value.kind === 'FETCH') {
            return JSON.stringify(value.data || '').length
          } else if (value.kind === 'ROUTE') {
            return value.body.length
          }
          // rough estimate of size of cache value
          return (
            value.html.length + (JSON.stringify(value.pageData)?.length || 0)
          )
        },
      })
    }
  }

  public async get(key: string, fetchCache?: boolean) {
    let data = memoryCache?.get(key)

    // let's check the disk for seed data
    if (!data && process.env.NEXT_RUNTIME !== 'edge') {
      try {
        const { filePath } = await this.getFsPath({
          pathname: `${key}.body`,
          appDir: true,
        })
        const fileData = await this.fs.readFile(filePath)
        const { mtime } = await this.fs.stat(filePath)

        const meta = JSON.parse(
          await this.fs.readFile(filePath.replace(/\.body$/, '.meta'))
        )

        const cacheEntry: CacheHandlerValue = {
          lastModified: mtime.getTime(),
          value: {
            kind: 'ROUTE',
            body: Buffer.from(fileData),
            headers: meta.headers,
            status: meta.status,
          },
        }
        return cacheEntry
      } catch (_) {
        // no .meta data for the related key
      }

      try {
        const { filePath, isAppPath } = await this.getFsPath({
          pathname: fetchCache ? key : `${key}.html`,
          fetchCache,
        })
        const fileData = await this.fs.readFile(filePath)
        const { mtime } = await this.fs.stat(filePath)

        if (fetchCache) {
          const lastModified = mtime.getTime()
          data = {
            lastModified,
            value: JSON.parse(fileData),
          }
        } else {
          const pageData = isAppPath
            ? await this.fs.readFile(
                (
                  await this.getFsPath({ pathname: `${key}.rsc`, appDir: true })
                ).filePath
              )
            : JSON.parse(
                await this.fs.readFile(
                  await (
                    await this.getFsPath({
                      pathname: `${key}.json`,
                      appDir: false,
                    })
                  ).filePath
                )
              )
          data = {
            lastModified: mtime.getTime(),
            value: {
              kind: 'PAGE',
              html: fileData,
              pageData,
            },
          }
        }

        if (data) {
          memoryCache?.set(key, data)
        }
      } catch (_) {
        // unable to get data from disk
      }
    }
    return data || null
  }

  public async set(key: string, data: CacheHandlerValue['value']) {
    memoryCache?.set(key, {
      value: data,
      lastModified: Date.now(),
    })
    if (!this.flushToDisk) return

    if (data?.kind === 'ROUTE') {
      const { filePath } = await this.getFsPath({
        pathname: `${key}.body`,
        appDir: true,
      })
      await this.fs.mkdir(path.dirname(filePath))
      await this.fs.writeFile(filePath, data.body)
      await this.fs.writeFile(
        filePath.replace(/\.body$/, '.meta'),
        JSON.stringify({ headers: data.headers, status: data.status })
      )
      return
    }

    if (data?.kind === 'PAGE') {
      const isAppPath = typeof data.pageData === 'string'
      const { filePath: htmlPath } = await this.getFsPath({
        pathname: `${key}.html`,
        appDir: isAppPath,
      })
      await this.fs.mkdir(path.dirname(htmlPath))
      await this.fs.writeFile(htmlPath, data.html)

      await this.fs.writeFile(
        (
          await this.getFsPath({
            pathname: `${key}.${isAppPath ? 'rsc' : 'json'}`,
            appDir: isAppPath,
          })
        ).filePath,
        isAppPath ? data.pageData : JSON.stringify(data.pageData)
      )
    } else if (data?.kind === 'FETCH') {
      const { filePath } = await this.getFsPath({
        pathname: key,
        fetchCache: true,
      })
      await this.fs.mkdir(path.dirname(filePath))
      await this.fs.writeFile(filePath, JSON.stringify(data))
    }
  }

  private async getFsPath({
    pathname,
    appDir,
    fetchCache,
  }: {
    pathname: string
    appDir?: boolean
    fetchCache?: boolean
  }): Promise<{
    filePath: string
    isAppPath: boolean
  }> {
    if (fetchCache) {
      // we store in .next/cache/fetch-cache so it can be persisted
      // across deploys
      return {
        filePath: path.join(
          this.serverDistDir,
          '..',
          'cache',
          'fetch-cache',
          pathname
        ),
        isAppPath: false,
      }
    }
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
