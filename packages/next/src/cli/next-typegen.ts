#!/usr/bin/env node

import { existsSync } from 'fs'
import { join } from 'path'

import loadConfig from '../server/config'
import { printAndExit } from '../server/lib/utils'
import { PHASE_PRODUCTION_BUILD } from '../shared/lib/constants'
import { getProjectDir } from '../lib/get-project-dir'
import { warnMissingReactDependencies } from '../lib/warn-missing-react-dependencies'
import { findPagesDir } from '../lib/find-pages-dir'
import { verifyAndRunTypeScript } from '../lib/verify-typescript-setup'
import { parseBundlerArgs } from '../lib/bundler'
import { generateSharedTypes } from '../lib/typescript/shared-types'
import { getSharedTypesDistDir } from '../lib/typescript/shared-types-dir'
import { installBindings } from '../build/swc/install-bindings'
import { removeStaleDevTypes } from '../lib/typescript/remove-stale-dev-types'

export type NextTypegenOptions = {
  dir?: string
  webpack?: boolean
}

const nextTypegen = async (options: NextTypegenOptions, directory?: string) => {
  parseBundlerArgs(options)

  const baseDir = getProjectDir(directory)
  warnMissingReactDependencies(baseDir)

  // Check if the provided directory exists
  if (!existsSync(baseDir)) {
    printAndExit(`> No such directory exists as the project root: ${baseDir}`)
  }

  const nextConfig = await loadConfig(PHASE_PRODUCTION_BUILD, baseDir)
  await installBindings(nextConfig.experimental?.useWasmBinary)
  const distDir = join(baseDir, nextConfig.distDir)
  const { pagesDir, appDir } = findPagesDir(baseDir)

  const strictRouteTypes = Boolean(nextConfig.experimental.strictRouteTypes)

  await verifyAndRunTypeScript({
    dir: baseDir,
    distDir: nextConfig.distDir,
    typesDistDir: getSharedTypesDistDir(nextConfig),
    strictRouteTypes,
    shouldRunTypeCheck: false,
    tsconfigPath: nextConfig.typescript.tsconfigPath,
    typedRoutes: Boolean(nextConfig.typedRoutes),
    disableStaticImages: nextConfig.images.disableStaticImages,
    hasAppDir: !!appDir,
    hasPagesDir: !!pagesDir,
    appDir: appDir || undefined,
    pagesDir: pagesDir || undefined,
    useTypeScriptCli: Boolean(nextConfig.experimental.useTypeScriptCli),
  })

  console.log('Generating route types...')

  await generateSharedTypes({
    dir: baseDir,
    config: nextConfig,
    appDir: appDir || undefined,
    pagesDir: pagesDir || undefined,
  })

  // Types left behind by a stopped `next dev` would otherwise fail type checking
  // after routes are moved or deleted.
  await removeStaleDevTypes({
    distDirRoot: distDir,
    lockDistDir: Boolean(nextConfig.experimental.lockDistDir),
  })

  console.log('✓ Types generated successfully')
}

export { nextTypegen }
