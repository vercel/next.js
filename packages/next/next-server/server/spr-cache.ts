import fs from 'fs'
import path from 'path'
import LRUCache from 'lru-cache'
import { promisify } from 'util'
import { PrerenderManifest } from '../../build'
import { PRERENDER_MANIFEST } from '../lib/constants'

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)

let prerenderManifest: PrerenderManifest

let cache: LRUCache<string, any>
let sprOptions: {
  flushToDisk?: boolean
  pagesDir?: string
  distDir?: string
} = {}

type sprCacheValue = {
  html: string
  pageData: any
  // UTC in milliseconds to revalidate after Date.getTime
  revalidateAfter: number | false
}

const getSeedPath = (pathname: string, ext: string): string => {
  return path.join(sprOptions.pagesDir!, `${pathname}.${ext}`)
}

export const calculateRevalidate = (pathname: string): number | false => {
  const { revalidate } = prerenderManifest.routes[pathname]
  const revalidateAfter =
    typeof revalidate === 'number'
      ? revalidate + new Date().getTime()
      : revalidate

  return revalidateAfter
}

// initialize the SPR cache
export function initializeSprCache({
  max,
  distDir,
  pagesDir,
  flushToDisk,
}: {
  max?: number
  distDir: string
  pagesDir: string
  flushToDisk?: boolean
}) {
  sprOptions = {
    distDir,
    pagesDir,
    flushToDisk: typeof flushToDisk !== 'undefined' ? flushToDisk : true,
  }

  prerenderManifest = JSON.parse(
    fs.readFileSync(path.join(distDir, PRERENDER_MANIFEST), 'utf8')
  )

  cache = new LRUCache({
    // default to 50MB limit
    max: max || 50 * 1024 * 1024,
    length(val) {
      // rough estimate of size of cache value
      return val.html.length + JSON.stringify(val.pageData).length
    },
  })
}

// get data from SPR cache if available
export async function getSprCache(pathname: string) {
  let data: sprCacheValue | undefined = cache.get(pathname)

  // let's check the disk for seed data
  if (!data) {
    try {
      const html = await readFile(getSeedPath(pathname, 'html'), 'utf8')
      const pageData = JSON.parse(
        await readFile(getSeedPath(pathname, 'json'), 'utf8')
      )

      data = {
        html,
        pageData,
        revalidateAfter: calculateRevalidate(pathname),
      }
    } catch (_) {
      // unable to get data from disk
    }
  }
  return data
}

// populate the SPR cache with new data
export async function setSprCache(
  pathname: string,
  data: {
    html: string
    pageData: any
    revalidateAfter?: number | false
  }
) {
  if (typeof data.revalidateAfter === 'undefined') {
    data.revalidateAfter = calculateRevalidate(pathname)
  }
  cache.set(pathname, data)

  if (sprOptions.flushToDisk) {
    try {
      await writeFile(getSeedPath(pathname, 'html'), data.html, 'utf8')
      await writeFile(
        getSeedPath(pathname, 'json'),
        JSON.stringify(data.pageData),
        'utf8'
      )
    } catch (error) {
      // failed to flush to disk
      console.warn('Failed to update prerender files for', pathname, error)
    }
  }
}
