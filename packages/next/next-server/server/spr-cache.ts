import fs from 'fs'
import path from 'path'
import LRUCache from 'lru-cache'
import { promisify } from 'util'
import { PrerenderManifest } from '../../build'
import { PRERENDER_MANIFEST } from '../lib/constants'
import { normalizePagePath } from './normalize-page-path'

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)

/*
  TODO:
    - update prerenderManifest with revalidation values returned during render for non-seeded dynamic routes. Could add an optional revalidate arg to setSprCache that updates the in memory manifest and flushes to disk if enabled

    - implement copying data files during export / investigate whether we want to allow falling back to calling `getStaticProps` client-side for dynamic routes that weren't seeded during export
 */

type SprCacheValue = {
  html: string
  pageData: any
  // UTC in milliseconds to revalidate after
  revalidateAfter: number | false
}

let cache: LRUCache<string, SprCacheValue>
let prerenderManifest: PrerenderManifest
let sprOptions: {
  flushToDisk?: boolean
  pagesDir?: string
  distDir?: string
  dev?: boolean
} = {}

// since serverless bundles this file into each page
// we need to use a global for `next start` or else we can't
// initialize and share a cache
const curOpts = () => {
  return (global as any).__SPR_OPTS || sprOptions
}

const curCache = () => {
  return (global as any).__SPR_CACHE || cache
}

const curManifest = () => {
  return (global as any).__SPR_MANIFEST || prerenderManifest
}

const getSeedPath = (pathname: string, ext: string): string => {
  return path.join(curOpts().pagesDir!, `${pathname}.${ext}`)
}

export const calculateRevalidate = (pathname: string): number | false => {
  // in development we don't have a prerender-manifest
  // and default to always revalidating to allow easier debugging
  const { revalidate } = curManifest().routes[pathname] || { revalidate: 0 }
  const revalidateAfter =
    typeof revalidate === 'number'
      ? revalidate + new Date().getTime()
      : revalidate

  return revalidateAfter
}

// initialize the SPR cache
export function initializeSprCache({
  max,
  dev,
  distDir,
  pagesDir,
  flushToDisk,
}: {
  dev: boolean
  max?: number
  distDir: string
  pagesDir: string
  flushToDisk?: boolean
}) {
  sprOptions = {
    dev,
    distDir,
    pagesDir,
    flushToDisk:
      !dev && (typeof flushToDisk !== 'undefined' ? flushToDisk : true),
  }

  try {
    prerenderManifest = dev
      ? { routes: {} }
      : JSON.parse(
          fs.readFileSync(path.join(distDir, PRERENDER_MANIFEST), 'utf8')
        )
  } catch (_) {
    prerenderManifest = { version: 1, routes: {} }
  }

  cache = new LRUCache({
    // default to 50MB limit
    max: max || 50 * 1024 * 1024,
    length(val) {
      // rough estimate of size of cache value
      return val.html.length + JSON.stringify(val.pageData).length
    },
  })
  ;(global as any).__SPR_CACHE = cache
  ;(global as any).__SPR_OPTS = sprOptions
  ;(global as any).__SPR_MANIFEST = prerenderManifest
}

// get data from SPR cache if available
export async function getSprCache(
  pathname: string
): Promise<SprCacheValue | undefined> {
  const cache = curCache()
  if (!cache) return
  pathname = normalizePagePath(pathname)
  let data: SprCacheValue | undefined = cache.get(pathname)

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
      cache.set(pathname, data)
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
  }
) {
  const cache = curCache()
  if (!cache) return
  pathname = normalizePagePath(pathname)
  cache.set(pathname, {
    ...data,
    revalidateAfter: calculateRevalidate(pathname),
  })

  if (curOpts().flushToDisk) {
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
