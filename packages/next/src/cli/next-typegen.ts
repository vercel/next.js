#!/usr/bin/env node

import { existsSync } from 'fs'
import { join } from 'path'
import { mkdir } from 'fs/promises'

import loadConfig from '../server/config'
import { printAndExit } from '../server/lib/utils'
import { PHASE_PRODUCTION_BUILD } from '../shared/lib/constants'
import { getProjectDir } from '../lib/get-project-dir'
import { findPagesDir } from '../lib/find-pages-dir'
import { verifyTypeScriptSetup } from '../lib/verify-typescript-setup'
import { createPagesMapping } from '../build/entries'
import { PAGE_TYPES } from '../lib/page-types'
import { recursiveReadDir } from '../lib/recursive-readdir'
import { isReservedPage } from '../build/utils'
import { isParallelRouteSegment } from '../shared/lib/segment'
import { ensureLeadingSlash } from '../shared/lib/page-path/ensure-leading-slash'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import { normalizePathSep } from '../shared/lib/page-path/normalize-path-sep'
import {
  createRouteTypesManifest,
  writeRouteTypesManifest,
  writeValidatorFile,
  writeServerTypesFile,
  writeCacheLifeTypesFile,
} from '../server/lib/router-utils/route-types-utils'
import { createValidFileMatcher } from '../server/lib/find-page-file'

export type NextTypegenOptions = {
  dir?: string
}

const nextTypegen = async (
  _options: NextTypegenOptions,
  directory?: string
) => {
  const baseDir = getProjectDir(directory)

  // Check if the provided directory exists
  if (!existsSync(baseDir)) {
    printAndExit(`> No such directory exists as the project root: ${baseDir}`)
  }

  const nextConfig = await loadConfig(PHASE_PRODUCTION_BUILD, baseDir)
  const distDir = join(baseDir, nextConfig.distDir)
  const { pagesDir, appDir } = findPagesDir(baseDir)

  await verifyTypeScriptSetup({
    dir: baseDir,
    distDir: nextConfig.distDir,
    intentDirs: [pagesDir, appDir].filter(Boolean) as string[],
    typeCheckPreflight: false,
    tsconfigPath: nextConfig.typescript.tsconfigPath,
    disableStaticImages: nextConfig.images.disableStaticImages,
    hasAppDir: !!appDir,
    hasPagesDir: !!pagesDir,
  })

  console.log('Generating route types...')

  const routeTypesFilePath = join(distDir, 'types', 'routes.d.ts')
  const validatorFilePath = join(distDir, 'types', 'validator.ts')
  await mkdir(join(distDir, 'types'), { recursive: true })

  const pageRoutes: Array<{ route: string; filePath: string }> = []
  const appRoutes: Array<{ route: string; filePath: string }> = []
  const layoutRoutes: Array<{ route: string; filePath: string }> = []
  const slots: Array<{ name: string; parent: string }> = []

  const pageApiRoutes: Array<{ route: string; filePath: string }> = []
  const appRouteHandlers: Array<{ route: string; filePath: string }> = []

  let mappedPages: { [page: string]: string } = {}
  let mappedAppPages: { [page: string]: string } = {}
  let mappedAppLayouts: { [page: string]: string } = {}

  // Build pages routes
  if (pagesDir) {
    const pagePaths = await recursiveReadDir(pagesDir, {
      pathnameFilter: (absolutePath) => {
        const relativePath = absolutePath.replace(pagesDir + '/', '')
        return nextConfig.pageExtensions.some((ext) =>
          relativePath.endsWith(`.${ext}`)
        )
      },
      ignorePartFilter: (part) => part.startsWith('_'),
    })

    mappedPages = await createPagesMapping({
      pagePaths,
      isDev: false,
      pagesType: PAGE_TYPES.PAGES,
      pageExtensions: nextConfig.pageExtensions,
      pagesDir,
      appDir,
    })
  }

  // Build app routes
  if (appDir) {
    const validFileMatcher = createValidFileMatcher(
      nextConfig.pageExtensions,
      appDir
    )

    const appPaths = await recursiveReadDir(appDir, {
      pathnameFilter: (absolutePath) =>
        validFileMatcher.isAppRouterPage(absolutePath) ||
        validFileMatcher.isAppRouterRoute(absolutePath),
      ignorePartFilter: (part) => part.startsWith('_'),
    })

    const layoutPaths = await recursiveReadDir(appDir, {
      pathnameFilter: (absolutePath) =>
        validFileMatcher.isAppLayoutPage(absolutePath),
      ignorePartFilter: (part) => part.startsWith('_'),
    })

    mappedAppPages = await createPagesMapping({
      pagePaths: appPaths,
      isDev: false,
      pagesType: PAGE_TYPES.APP,
      pageExtensions: nextConfig.pageExtensions,
      pagesDir,
      appDir,
    })

    mappedAppLayouts = await createPagesMapping({
      pagePaths: layoutPaths,
      isDev: false,
      pagesType: PAGE_TYPES.APP,
      pageExtensions: nextConfig.pageExtensions,
      pagesDir,
      appDir,
    })
  }

  // Process pages routes
  for (const [route, filePath] of Object.entries(mappedPages)) {
    const relativeFilePath = join(
      baseDir,
      filePath.replace(/^private-next-pages\//, 'pages/')
    )

    if (route.startsWith('/api/')) {
      pageApiRoutes.push({
        route: normalizePathSep(route),
        filePath: relativeFilePath,
      })
    } else {
      // Filter out _app, _error, _document
      if (isReservedPage(route)) continue

      pageRoutes.push({
        route: normalizePathSep(route),
        filePath: relativeFilePath,
      })
    }
  }

  // Process app routes
  if (appDir && mappedAppPages) {
    const validFileMatcher = createValidFileMatcher(
      nextConfig.pageExtensions,
      appDir
    )

    for (const [route, filePath] of Object.entries(mappedAppPages)) {
      if (route === '/_not-found/page') continue

      const segments = route.split('/')
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i]
        if (isParallelRouteSegment(segment)) {
          const parentPath = normalizeAppPath(segments.slice(0, i).join('/'))

          const slotName = segment.slice(1)
          // check if the slot already exists
          if (slots.some((s) => s.name === slotName && s.parent === parentPath))
            continue

          slots.push({
            name: slotName,
            parent: parentPath,
          })
          break
        }
      }

      const relativeFilePath = join(
        baseDir,
        filePath.replace(/^private-next-app-dir\//, 'app/')
      )

      if (validFileMatcher.isAppRouterRoute(filePath)) {
        appRouteHandlers.push({
          route: normalizeAppPath(normalizePathSep(route)),
          filePath: relativeFilePath,
        })
      } else {
        appRoutes.push({
          route: normalizeAppPath(normalizePathSep(route)),
          filePath: relativeFilePath,
        })
      }
    }
  }

  // Process app layouts
  if (appDir && mappedAppLayouts) {
    for (const [route, filePath] of Object.entries(mappedAppLayouts)) {
      const relativeFilePath = join(
        baseDir,
        filePath.replace(/^private-next-app-dir\//, 'app/')
      )
      layoutRoutes.push({
        route: ensureLeadingSlash(
          normalizeAppPath(normalizePathSep(route)).replace(/\/layout$/, '')
        ),
        filePath: relativeFilePath,
      })
    }
  }

  // Collect layout parameters for root params extraction
  // Find the root layout (shortest path with dynamic segments)
  const collectedRootParams: Record<string, string[]> = {}

  // Find layouts that could be root layouts (have dynamic segments)
  const layoutsWithParams = layoutRoutes
    .map(({ route }) => {
      const foundParams = Array.from(
        route.matchAll(/\[(.*?)\]/g),
        (match) => match[1]
      )
      return { route, params: foundParams }
    })
    .filter(({ params }) => params.length > 0)

  // Sort by path depth (ascending) to find the shallowest layout with params
  layoutsWithParams.sort((a, b) => {
    const aDepth = a.route.split('/').length
    const bDepth = b.route.split('/').length
    return aDepth - bDepth
  })

  // The root layout is the shallowest layout with dynamic segments
  if (layoutsWithParams.length > 0) {
    const rootLayout = layoutsWithParams[0]
    collectedRootParams[rootLayout.route] = rootLayout.params
  }

  const routeTypesManifest = await createRouteTypesManifest({
    dir: baseDir,
    pageRoutes,
    appRoutes,
    appRouteHandlers,
    pageApiRoutes,
    layoutRoutes,
    slots,
    redirects: nextConfig.redirects,
    rewrites: nextConfig.rewrites,
  })

  // Add collected root params and cache life config to manifest
  routeTypesManifest.collectedRootParams = collectedRootParams
  routeTypesManifest.cacheLifeConfig = nextConfig.experimental?.cacheLife

  await writeRouteTypesManifest(routeTypesManifest, routeTypesFilePath)
  await writeValidatorFile(routeTypesManifest, validatorFilePath)

  // Generate server types if we have root params
  if (Object.keys(collectedRootParams).length > 0) {
    const serverTypesFilePath = join(distDir, 'types', 'server.d.ts')
    await writeServerTypesFile(routeTypesManifest, serverTypesFilePath)
  }

  // Generate cache life types if we have cache life config
  if (nextConfig.experimental?.cacheLife) {
    const cacheLifeTypesFilePath = join(distDir, 'types', 'cache-life.d.ts')
    await writeCacheLifeTypesFile(routeTypesManifest, cacheLifeTypesFilePath)
  }

  console.log('✓ Route types generated successfully')
}

export { nextTypegen }
