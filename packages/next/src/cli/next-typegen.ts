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
import {
  createPagesMapping,
  collectAppFiles,
  collectPagesFiles,
  processPageRoutes,
  processAppRoutes,
  processLayoutRoutes,
  extractSlotsFromAppRoutes,
  type RouteInfo,
  type SlotInfo,
} from '../build/entries'
import { PAGE_TYPES } from '../lib/page-types'

import {
  createRouteTypesManifest,
  writeRouteTypesManifest,
} from '../server/lib/router-utils/route-types-utils'

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
  await mkdir(join(distDir, 'types'), { recursive: true })

  let pageRoutes: RouteInfo[] = []
  let appRoutes: RouteInfo[] = []
  let layoutRoutes: RouteInfo[] = []
  let slots: SlotInfo[] = []

  let _pageApiRoutes: RouteInfo[] = []

  let mappedPages: { [page: string]: string } = {}
  let mappedAppPages: { [page: string]: string } = {}
  let mappedAppLayouts: { [page: string]: string } = {}

  // Helper function to reduce createPagesMapping duplication
  const createMapping = (pagePaths: string[], pagesType: any) =>
    createPagesMapping({
      pagePaths,
      isDev: false,
      pagesType,
      pageExtensions: nextConfig.pageExtensions,
      pagesDir,
      appDir,
    })

  // Build pages routes
  if (pagesDir) {
    const pagePaths = await collectPagesFiles(
      pagesDir,
      nextConfig.pageExtensions
    )

    mappedPages = await createMapping(pagePaths, PAGE_TYPES.PAGES)

    // Process pages routes
    const processedPages = processPageRoutes(mappedPages, baseDir)
    pageRoutes = processedPages.pageRoutes
    _pageApiRoutes = processedPages.pageApiRoutes
  }

  // Build app routes
  if (appDir) {
    // Collect both app pages and layouts in a single directory traversal
    const { appPaths, layoutPaths } = await collectAppFiles(
      appDir,
      nextConfig.pageExtensions
    )

    mappedAppPages = await createMapping(appPaths, PAGE_TYPES.APP)
    mappedAppLayouts = await createMapping(layoutPaths, PAGE_TYPES.APP)

    // Process app routes and extract slots
    slots = extractSlotsFromAppRoutes(mappedAppPages)
    appRoutes = processAppRoutes(mappedAppPages, baseDir)

    // Process layout routes
    layoutRoutes = processLayoutRoutes(mappedAppLayouts, baseDir)
  }

  const routeTypesManifest = await createRouteTypesManifest({
    dir: baseDir,
    pageRoutes,
    appRoutes,
    layoutRoutes,
    slots,
    redirects: nextConfig.redirects,
    rewrites: nextConfig.rewrites,
  })

  await writeRouteTypesManifest(routeTypesManifest, routeTypesFilePath)

  console.log('✓ Route types generated successfully')
}

export { nextTypegen }
