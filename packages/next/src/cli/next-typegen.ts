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
import { discoverRoutes } from '../build/route-discovery'

import {
  createRouteTypesManifest,
  writeRouteTypesManifest,
  writeValidatorFile,
  writeRouteTypesEntryFile,
} from '../server/lib/router-utils/route-types-utils'
import { writeCacheLifeTypes } from '../server/lib/router-utils/cache-life-type-utils'
import { installBindings } from '../build/swc/install-bindings'

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
  await installBindings(nextConfig.experimental?.useWasmBinary)
  const distDir = join(baseDir, nextConfig.distDir)
  const { pagesDir, appDir } = findPagesDir(baseDir)

  const strictRouteTypes = Boolean(nextConfig.experimental.strictRouteTypes)

  await verifyTypeScriptSetup({
    dir: baseDir,
    distDir: nextConfig.distDir,
    distDirRoot: nextConfig.distDirRoot,
    strictRouteTypes,
    typeCheckPreflight: false,
    tsconfigPath: nextConfig.typescript.tsconfigPath,
    disableStaticImages: nextConfig.images.disableStaticImages,
    hasAppDir: !!appDir,
    hasPagesDir: !!pagesDir,
    appDir: appDir || undefined,
    pagesDir: pagesDir || undefined,
  })

  console.log('Generating route types...')

  // Actual type files go to route-types.d.ts (not routes.d.ts)
  // routes.d.ts is reserved for the entry file
  const routeTypesFilePath = join(distDir, 'types', 'route-types.d.ts')
  const validatorFilePath = join(distDir, 'types', 'validator.ts')
  await mkdir(join(distDir, 'types'), { recursive: true })

  const isSrcDir = path
    .relative(baseDir, pagesDir || appDir || '')
    .startsWith('src')

  // Build all routes (pages + app + slots)
  const {
    pageRoutes,
    pageApiRoutes,
    appRoutes,
    appRouteHandlers,
    layoutRoutes,
    slots,
  } = await discoverRoutes({
    appDir: appDir || undefined,
    pagesDir: pagesDir || undefined,
    pageExtensions: nextConfig.pageExtensions,
    isDev: false,
    baseDir,
    isSrcDir,
  })

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

  await writeValidatorFile(
    routeTypesManifest,
    validatorFilePath,
    strictRouteTypes
  )

  // Generate cache-life types if cacheLife config exists
  const cacheLifeFilePath = join(distDir, 'types', 'cache-life.d.ts')
  writeCacheLifeTypes(nextConfig.cacheLife, cacheLifeFilePath)

  // Write the entry file at {distDirRoot}/types/routes.d.ts
  // This ensures next-env.d.ts has a consistent import path
  const entryFilePath = join(
    baseDir,
    nextConfig.distDirRoot,
    'types',
    'routes.d.ts'
  )
  const actualTypesDir = join(distDir, 'types')
  await writeRouteTypesEntryFile(entryFilePath, actualTypesDir, {
    strictRouteTypes,
    typedRoutes: Boolean(nextConfig.typedRoutes),
  })

  console.log('✓ Types generated successfully')
}

export { nextTypegen }
