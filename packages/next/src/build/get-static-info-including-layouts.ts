import type { NextConfigComplete } from '../server/config-shared'
import type { PageStaticInfo } from './analysis/get-page-static-info'
import { join, dirname } from 'path'
import fs from 'fs'
import type { __ApiPreviewProps } from '../server/api-utils'
import { reduceAppConfig, isAppBuiltinPage, isMiddlewareFile } from './utils'
import {
  getAppPageStaticInfo,
  getPageStaticInfo,
} from './analysis/get-page-static-info'
import type { PageExtensions } from './page-extensions-type'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'

import { PAGE_TYPES } from '../lib/page-types'
import { isAppPageRoute } from '../lib/is-app-page-route'

import { UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY } from '../shared/lib/entry-constants'
import getAssetPathFromRoute from '../shared/lib/router/utils/get-asset-path-from-route'
import { Bundler } from '../lib/bundler'
import { wait } from '../lib/wait'

const DEV_STATIC_INFO_RETRY_TIMEOUT = 5_000
const DEV_STATIC_INFO_RETRY_INTERVAL = 100

export async function getStaticInfoIncludingLayouts({
  dir,
  isInsideAppDir,
  pageExtensions,
  pageFilePath,
  appDir,
  config: nextConfig,
  isDev,
  page,
  bundler,
}: {
  dir: string
  isInsideAppDir: boolean
  pageExtensions: PageExtensions
  pageFilePath: string
  appDir: string | undefined
  config: NextConfigComplete
  isDev: boolean
  page: string
  bundler: Bundler
}): Promise<Omit<PageStaticInfo, 'config'>> {
  let reference = await getStaticInfoIncludingLayoutsInner({
    isInsideAppDir,
    pageExtensions,
    pageFilePath,
    appDir,
    config: nextConfig,
    isDev,
    page,
  })

  if (bundler === Bundler.Turbopack) {
    const staticInfoPath = isMiddlewareFile(page)
      ? join(
          dir,
          nextConfig.distDir,
          'server',
          'middleware',
          'static-info.json'
        )
      : join(
          dir,
          nextConfig.distDir,
          'server',
          isInsideAppDir ? 'app' : 'pages',
          isInsideAppDir ? page : getAssetPathFromRoute(page),
          'static-info.json'
        )

    let baseline = { ...reference } as any
    // Excluded in Turbopack info. Already emitted as issue by Turbopack
    delete baseline.hadUnsupportedValue
    // Normalization
    if (!baseline.generateImageMetadata) delete baseline.generateImageMetadata
    if (!baseline.generateSitemaps) delete baseline.generateSitemaps
    if (!baseline.generateStaticParams) delete baseline.generateStaticParams
    if (
      baseline.middleware &&
      Object.entries(baseline.middleware).length === 0
    ) {
      delete baseline.middleware
    }
    if (baseline.runtime === 'experimental-edge') {
      baseline.runtime = 'edge'
    }
    // Return type is Omit<PageStaticInfo, 'config'> anyway
    delete baseline.config

    // TODO we do need this?
    delete baseline.rsc

    function sort(v: Record<string, any> | undefined): any {
      return v
        ? Object.keys(v)
            .sort()
            .reduce((acc, key) => {
              acc[key] = v[key]
              return acc
            }, {} as any)
        : v
    }
    baseline = sort(baseline)

    const retryUntil = Date.now() + DEV_STATIC_INFO_RETRY_TIMEOUT
    while (true) {
      let validationError: Error

      try {
        let turbopack = JSON.parse(
          fs.readFileSync(staticInfoPath, 'utf8')
        ) as PageStaticInfo

        if (turbopack.middleware?.matchers) {
          for (const matcher of turbopack.middleware.matchers) {
            // Turbopack emits the path, not a regex
            matcher.regexp = pathToRegexp(matcher.regexp).source
          }
        }

        delete turbopack.rsc
        turbopack = sort(turbopack) as PageStaticInfo

        if (JSON.stringify(baseline) === JSON.stringify(turbopack)) {
          return turbopack
        }

        validationError = new Error(
          `Static info mismatch for ${pageFilePath}: ` +
            JSON.stringify({ baseline, turbopack }, null, 2)
        )
      } catch (cause) {
        validationError = new Error(
          'Failed to read Turbopack static info from disk',
          { cause }
        )
      }

      if (!isDev || Date.now() >= retryUntil) {
        throw validationError
      }
      await wait(DEV_STATIC_INFO_RETRY_INTERVAL)
    }
  }

  return reference
}
async function getStaticInfoIncludingLayoutsInner({
  isInsideAppDir,
  pageExtensions,
  pageFilePath,
  appDir,
  config: nextConfig,
  isDev,
  page,
}: {
  isInsideAppDir: boolean
  pageExtensions: PageExtensions
  pageFilePath: string
  appDir: string | undefined
  config: NextConfigComplete
  isDev: boolean
  page: string
}): Promise<Omit<PageStaticInfo, 'config'>> {
  // TODO: sync types for pages: PAGE_TYPES, ROUTER_TYPE, 'app' | 'pages', etc.
  const pageType = isInsideAppDir ? PAGE_TYPES.APP : PAGE_TYPES.PAGES

  const pageStaticInfo = await getPageStaticInfo({
    nextConfig,
    pageFilePath,
    isDev,
    page,
    pageType,
  })

  if (pageStaticInfo.type === PAGE_TYPES.PAGES || !appDir) {
    return pageStaticInfo
  }

  // Skip inheritance for global-error pages - always use default config
  if (page === UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY) {
    return pageStaticInfo
  }

  const segments = [pageStaticInfo]

  // inherit from layout files only if it's a page route and not a builtin page
  if (isAppPageRoute(page) && !isAppBuiltinPage(pageFilePath)) {
    const layoutFiles = []
    const potentialLayoutFiles = pageExtensions.map((ext) => 'layout.' + ext)
    let dir = dirname(pageFilePath)

    // Uses startsWith to not include directories further up.
    while (dir.startsWith(appDir)) {
      for (const potentialLayoutFile of potentialLayoutFiles) {
        const layoutFile = join(dir, potentialLayoutFile)
        if (!fs.existsSync(layoutFile)) {
          continue
        }
        layoutFiles.push(layoutFile)
      }
      // Walk up the directory tree
      dir = join(dir, '..')
    }

    for (const layoutFile of layoutFiles) {
      const layoutStaticInfo = await getAppPageStaticInfo({
        nextConfig,
        pageFilePath: layoutFile,
        isDev,
        page,
        pageType: isInsideAppDir ? PAGE_TYPES.APP : PAGE_TYPES.PAGES,
      })

      segments.unshift(layoutStaticInfo)
    }
  }

  const config = reduceAppConfig(segments)

  return {
    ...pageStaticInfo,
    runtime: config.runtime,
    preferredRegion: config.preferredRegion,
    maxDuration: config.maxDuration,
  }
}
