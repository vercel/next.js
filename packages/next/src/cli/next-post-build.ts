#!/usr/bin/env node

import { existsSync } from 'fs'
import path from 'path'
import loadConfig from '../server/config'
import { PHASE_PRODUCTION_BUILD } from '../shared/lib/constants'
import { getProjectDir } from '../lib/get-project-dir'
import { printAndExit } from '../server/lib/utils'
import { loadBindings } from '../build/swc'

export type NextPostBuildOptions = {}

const nextPostBuild = async (
  _options: NextPostBuildOptions,
  directory?: string
) => {
  const dir = getProjectDir(directory)

  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  const config = await loadConfig(PHASE_PRODUCTION_BUILD, dir)
  const persistentCaching =
    config.experimental?.turbopackFileSystemCacheForBuild || false

  if (!persistentCaching) {
    console.log('Persistent caching for build is not enabled. Nothing to do.')
    return
  }

  const distDir = path.join(dir, config.distDir)
  const cachePath = path.join(distDir, 'cache', 'turbopack')

  if (!existsSync(cachePath)) {
    console.log('No Turbopack cache directory found. Nothing to do.')
    return
  }

  const bindings = await loadBindings(config.experimental?.useWasmBinary)
  await bindings.turbo.databaseCompact(
    cachePath,
    process.env.__NEXT_VERSION as string
  )
  console.log('Turbopack database compaction complete.')
}

export { nextPostBuild }
