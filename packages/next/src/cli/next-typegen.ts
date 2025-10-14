#!/usr/bin/env node

import { existsSync } from 'fs'
import path, { join } from 'path'
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
  extractSlotsFromDefaultFiles,
  combineSlots,
  type RouteInfo,
  type SlotInfo,
} from '../build/entries'
import { PAGE_TYPES } from '../lib/page-types'

import {
  createRouteTypesManifest,
  writeRouteTypesManifest,
  writeValidatorFile,
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
    isolatedDevBuild: nextConfig.experimental.isolatedDevBuild,
  })

  console.log('Generating route types...')

  const routeTypesFilePath = join(distDir, 'types', 'routes.d.ts')
  const validatorFilePath = join(distDir, 'types', 'validator.ts')
  await mkdir(join(distDir, 'types'), { recursive: true })

  let pageRoutes: RouteInfo[] = []
  let appRoutes: RouteInfo[] = []
  let appRouteHandlers: RouteInfo[] = []
  let layoutRoutes: RouteInfo[] = []
  let slots: SlotInfo[] = []

  let pageApiRoutes: RouteInfo[] = []

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
      appDirOnly: !!appDir && !pagesDir,
    })

  const validFileMatcher = createValidFileMatcher(
    nextConfig.pageExtensions,
    appDir
  )

  const isSrcDir = path
    .relative(baseDir, pagesDir || appDir || '')
    .startsWith('src')

  // Build pages routes
  if (pagesDir) {
    const pagePaths = await collectPagesFiles(pagesDir, validFileMatcher)

    mappedPages = await createMapping(pagePaths, PAGE_TYPES.PAGES)

    // Process pages routes
    const processedPages = processPageRoutes(mappedPages, baseDir, isSrcDir)
    pageRoutes = processedPages.pageRoutes
    pageApiRoutes = processedPages.pageApiRoutes
  }

  // Build app routes
  if (appDir) {
    // Collect app pages, layouts, and default files in a single directory traversal
    const { appPaths, layoutPaths, defaultPaths } = await collectAppFiles(
      appDir,
      validFileMatcher
    )

    mappedAppPages = await createMapping(appPaths, PAGE_TYPES.APP)
    mappedAppLayouts = await createMapping(layoutPaths, PAGE_TYPES.APP)
    const mappedDefaultFiles = await createMapping(defaultPaths, PAGE_TYPES.APP)

    // Process app routes and extract slots from both pages and default files
    const slotsFromPages = extractSlotsFromAppRoutes(mappedAppPages)
    const slotsFromDefaults = extractSlotsFromDefaultFiles(mappedDefaultFiles)

    // Combine slots and deduplicate using Set
    slots = combineSlots(slotsFromPages, slotsFromDefaults)

    const result = processAppRoutes(
      mappedAppPages,
      validFileMatcher,
      baseDir,
      isSrcDir
    )
    appRoutes = result.appRoutes
    appRouteHandlers = result.appRouteHandlers

    // Process layout routes
    layoutRoutes = processLayoutRoutes(mappedAppLayouts, baseDir, isSrcDir)
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
    validatorFilePath,
  })

  await writeRouteTypesManifest(
    routeTypesManifest,
    routeTypesFilePath,
    nextConfig
  )

  await writeValidatorFile(routeTypesManifest, validatorFilePath)

  console.log('✓ Route types generated successfully')
}

export { nextTypegen }
