import type { OutgoingHttpHeaders } from 'http'
import type { CacheHandler, CacheHandlerContext, CacheHandlerValue } from './'

import LRUCache from 'next/dist/compiled/lru-cache'
import { CacheFs } from '../../../shared/lib/utils'
import path from '../../../shared/lib/isomorphic/path'
import { CachedFetchValue } from '../../response-cache'
import { NEXT_CACHE_TAGS_HEADER } from '../../../lib/constants'

type FileSystemCacheContext = Omit<
  CacheHandlerContext,
  'fs' | 'serverDistDir'
> & {
  fs: CacheFs
  serverDistDir: string
}

type TagsManifest = {
  version: 1
  items: { [tag: string]: { revalidatedAt: number } }
}
let memoryCache: LRUCache<string, CacheHandlerValue> | undefined
let tagsManifest: TagsManifest | undefined

export default class FileSystemCache implements CacheHandler {
  private fs: FileSystemCacheContext['fs']
  private flushToDisk?: FileSystemCacheContext['flushToDisk']
  private serverDistDir: FileSystemCacheContext['serverDistDir']
  private appDir: boolean
  private tagsManifestPath?: string
  private revalidatedTags: string[]

  constructor(ctx: FileSystemCacheContext) {
    this.fs = ctx.fs
    this.flushToDisk = ctx.flushToDisk
    this.serverDistDir = ctx.serverDistDir
    this.appDir = !!ctx._appDir
    this.revalidatedTags = ctx.revalidatedTags

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
    if (this.serverDistDir && this.fs) {
      this.tagsManifestPath = path.join(
        this.serverDistDir,
        '..',
        'cache',
        'fetch-cache',
        'tags-manifest.json'
      )
      this.loadTagsManifest()
    }
  }

  private loadTagsManifest() {
    if (!this.tagsManifestPath || !this.fs || tagsManifest) return
    try {
      tagsManifest = JSON.parse(
        this.fs.readFileSync(this.tagsManifestPath, 'utf8')
      )
    } catch (err: any) {
      tagsManifest = { version: 1, items: {} }
    }
  }

  public async revalidateTag(tag: string) {
    // we need to ensure the tagsManifest is refreshed
    // since separate workers can be updating it at the same
    // time and we can't flush out of sync data
    this.loadTagsManifest()
    if (!tagsManifest || !this.tagsManifestPath) {
      return
    }

    const data = tagsManifest.items[tag] || {}
    data.revalidatedAt = Date.now()
    tagsManifest.items[tag] = data

    try {
      await this.fs.mkdir(path.dirname(this.tagsManifestPath))
      await this.fs.writeFile(
        this.tagsManifestPath,
        JSON.stringify(tagsManifest || {})
      )
    } catch (err: any) {
      console.warn('Failed to update tags manifest.', err)
    }
  }

  public async get(
    key: string,
    {
      tags,
      softTags,
      fetchCache,
    }: {
      tags?: string[]
      softTags?: string[]
      fetchCache?: boolean
    } = {}
  ) {
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
          await this.fs.readFile(filePath.replace(/\.body$/, '.meta'), 'utf8')
        )

        const cacheEntry: CacheHandlerValue = {
          lastModified: mtime.getTime(),
          value: {
            kind: 'ROUTE',
            body: fileData,
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
        const fileData = await this.fs.readFile(filePath, 'utf8')
        const { mtime } = await this.fs.stat(filePath)

        if (fetchCache) {
          const lastModified = mtime.getTime()
          const parsedData: CachedFetchValue = JSON.parse(fileData)
          data = {
            lastModified,
            value: parsedData,
          }

          if (data.value?.kind === 'FETCH') {
            const storedTags = data.value?.data?.tags

            // update stored tags if a new one is being added
            // TODO: remove this when we can send the tags
            // via header on GET same as SET
            if (!tags?.every((tag) => storedTags?.includes(tag))) {
              await this.set(key, data.value, { tags })
            }
          }
        } else {
          const pageData = isAppPath
            ? await this.fs.readFile(
                (
                  await this.getFsPath({
                    pathname: `${key}.rsc`,
                    appDir: true,
                  })
                ).filePath,
                'utf8'
              )
            : JSON.parse(
                await this.fs.readFile(
                  (
                    await this.getFsPath({
                      pathname: `${key}.json`,
                      appDir: false,
                    })
                  ).filePath,
                  'utf8'
                )
              )

          let meta: { status?: number; headers?: OutgoingHttpHeaders } = {}

          if (isAppPath) {
            try {
              meta = JSON.parse(
                await this.fs.readFile(
                  filePath.replace(/\.html$/, '.meta'),
                  'utf8'
                )
              )
            } catch {}
          }

          data = {
            lastModified: mtime.getTime(),
            value: {
              kind: 'PAGE',
              html: fileData,
              pageData,
              headers: meta.headers,
              status: meta.status,
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

    if (data?.value?.kind === 'PAGE') {
      let cacheTags: undefined | string[]
      const tagsHeader = data.value.headers?.[NEXT_CACHE_TAGS_HEADER]

      if (typeof tagsHeader === 'string') {
        cacheTags = tagsHeader.split(',')
      }

      if (cacheTags?.length) {
        this.loadTagsManifest()

        const isStale = cacheTags.some((tag) => {
          return (
            tagsManifest?.items[tag]?.revalidatedAt &&
            tagsManifest?.items[tag].revalidatedAt >=
              (data?.lastModified || Date.now())
          )
        })

        // we trigger a blocking validation if an ISR page
        // had a tag revalidated, if we want to be a background
        // revalidation instead we return data.lastModified = -1
        if (isStale) {
          data = undefined
        }
      }
    }

    if (data && data?.value?.kind === 'FETCH') {
      this.loadTagsManifest()

      const combinedTags = [...(tags || []), ...(softTags || [])]

      const wasRevalidated = combinedTags.some((tag) => {
        if (this.revalidatedTags.includes(tag)) {
          return true
        }

        return (
          tagsManifest?.items[tag]?.revalidatedAt &&
          tagsManifest?.items[tag].revalidatedAt >=
            (data?.lastModified || Date.now())
        )
      })
      // When revalidate tag is called we don't return
      // stale data so it's updated right away
      if (wasRevalidated) {
        data = undefined
      }
    }

    return data || null
  }

  public async set(
    key: string,
    data: CacheHandlerValue['value'],
    ctx: {
      tags?: string[]
    }
  ) {
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

      if (data.headers || data.status) {
        await this.fs.writeFile(
          htmlPath.replace(/\.html$/, '.meta'),
          JSON.stringify({
            headers: data.headers,
            status: data.status,
          })
        )
      }
    } else if (data?.kind === 'FETCH') {
      const { filePath } = await this.getFsPath({
        pathname: key,
        fetchCache: true,
      })
      await this.fs.mkdir(path.dirname(filePath))
      await this.fs.writeFile(
        filePath,
        JSON.stringify({
          ...data,
          tags: ctx.tags,
        })
      )
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
