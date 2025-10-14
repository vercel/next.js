import type { NextConfigComplete } from '../server/config-shared'
import type { PageStaticInfo } from './analysis/get-page-static-info'
import { join, dirname } from 'path'
import fs from 'fs'
import type { __ApiPreviewProps } from '../server/api-utils'
import { reduceAppConfig, isAppBuiltinPage } from './utils'
import {
  getAppPageStaticInfo,
  getPageStaticInfo,
} from './analysis/get-page-static-info'
import type { PageExtensions } from './page-extensions-type'

import { PAGE_TYPES } from '../lib/page-types'
import { isAppPageRoute } from '../lib/is-app-page-route'

import { UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY } from '../shared/lib/entry-constants'

export async function getStaticInfoIncludingLayouts({
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
  isDev: boolean | undefined
  page: string
}): Promise<PageStaticInfo> {
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
    config,
    runtime: config.runtime,
    preferredRegion: config.preferredRegion,
    maxDuration: config.maxDuration,
  }
}
