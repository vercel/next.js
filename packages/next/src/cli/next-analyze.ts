#!/usr/bin/env node

import '../server/lib/cpu-profile'
import { existsSync } from 'fs'
import { italic } from '../lib/picocolors'
import analyze from '../build/analyze'
import { warn } from '../build/output/log'
import { printAndExit } from '../server/lib/utils'
import { getProjectDir } from '../lib/get-project-dir'

export type NextAnalyzeOptions = {
  experimentalAnalyze?: boolean
  profile?: boolean
  mangling: boolean
  port: number
  serve: boolean
  experimentalAppOnly?: boolean
}

const nextAnalyze = async (options: NextAnalyzeOptions, directory?: string) => {
  process.on('SIGTERM', () => process.exit(143))
  process.on('SIGINT', () => process.exit(130))

  const { profile, mangling, experimentalAppOnly, serve, port } = options

  if (!mangling) {
    warn(
      `Mangling is disabled. ${italic('Note: This may affect performance and should only be used for debugging purposes.')}`
    )
  }

  if (profile) {
    warn(
      `Profiling is enabled. ${italic('Note: This may affect performance.')}`
    )
  }

  const dir = getProjectDir(directory)

  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  return analyze({
    dir,
    reactProductionProfiling: profile,
    noMangling: !mangling,
    appDirOnly: experimentalAppOnly,
    serve,
    port,
  })
}

export { nextAnalyze }
