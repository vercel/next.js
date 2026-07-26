#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { nextTypegen } from './next-typegen'
import { getProjectDir } from '../lib/get-project-dir'
import {
  getTypeScriptPackageInfo,
  getTypeScriptApiMissingError,
} from '../lib/typescript/runTypeScriptCli'
import { writeTypeCheckResult } from '../lib/typescript/typeCheckResult'
import { verifyAndRunTypeScript } from '../lib/verify-typescript-setup'
import loadConfig from '../server/config'
import { printAndExit } from '../server/lib/utils'
import { findPagesDir } from '../lib/find-pages-dir'
import { PHASE_PRODUCTION_BUILD } from '../shared/lib/constants'

export type NextTypeCheckOptions = {
  dir?: string
  webpack?: boolean
  writeResult?: string
}

const nextTypeCheck = async (
  options: NextTypeCheckOptions,
  directory?: string
) => {
  const baseDir = getProjectDir(directory)
  if (!existsSync(baseDir)) {
    printAndExit(`> No such directory exists as the project root: ${baseDir}`)
  }

  await nextTypegen(options, directory)

  const nextConfig = await loadConfig(PHASE_PRODUCTION_BUILD, baseDir)
  if (!nextConfig.experimental.useTypeScriptCli) {
    throw new Error(
      '`next typecheck` requires `experimental.useTypeScriptCli` to be enabled.'
    )
  }

  const typeScriptPackage = getTypeScriptPackageInfo(baseDir)
  if (!typeScriptPackage?.tscPath) {
    throw getTypeScriptApiMissingError(typeScriptPackage?.version ?? 'unknown')
  }

  const { appDir, pagesDir } = findPagesDir(baseDir)
  const cacheDir = path.join(baseDir, nextConfig.distDir, 'cache')
  await mkdir(cacheDir, { recursive: true })

  await verifyAndRunTypeScript({
    dir: baseDir,
    distDir: nextConfig.distDir,
    cacheDir,
    strictRouteTypes: Boolean(nextConfig.experimental.strictRouteTypes),
    shouldRunTypeCheck: true,
    tsconfigPath: nextConfig.typescript.tsconfigPath,
    typedRoutes: Boolean(nextConfig.typedRoutes),
    disableStaticImages: nextConfig.images.disableStaticImages,
    hasAppDir: !!appDir,
    hasPagesDir: !!pagesDir,
    appDir: appDir || undefined,
    pagesDir: pagesDir || undefined,
    useTypeScriptCli: true,
  })

  const resultPath =
    options.writeResult || nextConfig.experimental.typeScriptBuildResultPath
  if (resultPath) {
    await writeTypeCheckResult({
      baseDir,
      resultPath,
      tsConfigPath: path.join(
        baseDir,
        nextConfig.typescript.tsconfigPath || 'tsconfig.json'
      ),
      tscPath: typeScriptPackage.tscPath,
      typescriptVersion: typeScriptPackage.version,
    })
    console.log(`✓ TypeScript result written to ${resultPath}`)
  }
}

export { nextTypeCheck }
