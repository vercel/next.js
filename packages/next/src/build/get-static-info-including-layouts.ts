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
import { getBuildDistDir } from '../export/utils'

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
  if (bundler === Bundler.Turbopack) {
    // With a custom static-export destination, production build artifacts still live in .next.
    const buildDistDir = isDev
      ? nextConfig.distDir
      : getBuildDistDir(nextConfig)
    const staticInfoPath = isMiddlewareFile(page)
      ? join(dir, buildDistDir, 'server', 'middleware', 'static-info.json')
      : join(
          dir,
          buildDistDir,
          'server',
          isInsideAppDir ? 'app' : 'pages',
          isInsideAppDir ? page : getAssetPathFromRoute(page),
          'static-info.json'
        )

    function readStaticInfo(): PageStaticInfo {
      const staticInfo = JSON.parse(
        fs.readFileSync(staticInfoPath, 'utf8')
      ) as PageStaticInfo

      if (staticInfo.middleware?.matchers) {
        for (const matcher of staticInfo.middleware.matchers) {
          // Turbopack emits the path, not a regex.
          matcher.regexp = pathToRegexp(matcher.regexp).source
        }
      }

      return staticInfo
    }

    if (process.env.__NEXT_TEST_MODE && process.env.IS_TURBOPACK_TEST) {
      /// In the e2e tests, ensure parity between webpack and Turbopack static info

      let reference = await getStaticInfoIncludingLayoutsFromSource({
        isInsideAppDir,
        pageExtensions,
        pageFilePath,
        appDir,
        config: nextConfig,
        isDev,
        page,
      })

      let baseline = { ...reference } as any
      // Excluded in Turbopack info. Already emitted as issue by Turbopack
      delete baseline.hadUnsupportedValue
      // Normalization
      // The baseline may skip parsing, so false and missing metadata-export flags
      // are equivalent. Turbopack omits false flags.
      if (!baseline.generateImageMetadata) delete baseline.generateImageMetadata
      if (!baseline.generateSitemaps) delete baseline.generateSitemaps
      // Empty and missing middleware configurations are equivalent.
      if (
        baseline.middleware &&
        Object.entries(baseline.middleware).length === 0
      ) {
        delete baseline.middleware
      }
      // Downstream runtime selection treats both aliases as Edge; Turbopack emits the canonical
      // 'edge'.
      if (baseline.runtime === 'experimental-edge') {
        baseline.runtime = 'edge'
      }
      // Return type is Omit<PageStaticInfo, 'config'> anyway
      delete baseline.config

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

      let turbopack: PageStaticInfo
      try {
        turbopack = readStaticInfo()
      } catch (cause) {
        throw new Error('Failed to read Turbopack static info from disk', {
          cause,
        })
      }

      if (JSON.stringify(baseline) !== JSON.stringify(sort(turbopack))) {
        throw new Error(
          `Static info mismatch for ${pageFilePath}: ` +
            JSON.stringify({ baseline, turbopack }, null, 2)
        )
      }

      return turbopack
    } else {
      return readStaticInfo()
    }
  } else {
    return getStaticInfoIncludingLayoutsFromSource({
      isInsideAppDir,
      pageExtensions,
      pageFilePath,
      appDir,
      config: nextConfig,
      isDev,
      page,
    })
  }
}

export async function getStaticInfoIncludingLayoutsFromSource({
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
