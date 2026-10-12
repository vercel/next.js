#!/usr/bin/env node

import '../server/lib/cpu-profile'
import { saveCpuProfile } from '../server/lib/cpu-profile'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { italic } from '../lib/picocolors'
import analyze from '../build/analyze'
import { warn } from '../build/output/log'
import { printAndExit } from '../server/lib/utils'
import { getProjectDir } from '../lib/get-project-dir'
import { warnMissingReactDependencies } from '../lib/warn-missing-react-dependencies'
import { dumpAnalyzeGraph } from '../build/analyze/graph-dump'
import {
  historyIndexSchema,
  snapshotNameSchema,
  snapshotDirectory,
} from '../build/analyze/snapshot'

export type NextAnalyzeOptions = {
  experimentalAnalyze?: boolean
  profile?: boolean
  mangling: boolean
  port: number
  output: boolean
  experimentalAppOnly?: boolean
  snapshot?: string
}

export type NextAnalyzeExportOptions = {
  distDir?: string
  snapshot?: string
  route?: string
}

function nextAnalyzeExport(
  options: NextAnalyzeExportOptions,
  directory?: string
): void {
  // Replay does not load next.config, acquire the capture lock, or write artifacts.
  const analyzeDir = join(
    resolve(directory ?? '.', options.distDir ?? '.next'),
    'diagnostics/analyze'
  )
  const { snapshots } = historyIndexSchema.parse(
    JSON.parse(readFileSync(join(analyzeDir, 'history/history.json'), 'utf8'))
  )
  const name =
    options.snapshot === undefined
      ? snapshots[0]?.name
      : snapshotNameSchema.parse(options.snapshot)
  if (
    name === undefined ||
    !snapshots.some((snapshot) => snapshot.name === name)
  ) {
    throw new Error(`Analyzer snapshot not found: ${name ?? '(none)'}`)
  }
  dumpAnalyzeGraph(
    join(analyzeDir, 'history', snapshotDirectory(name)),
    name,
    options.route
  )
}

const nextAnalyze = async (options: NextAnalyzeOptions, directory?: string) => {
  process.on('SIGTERM', () => {
    saveCpuProfile()
    process.exit(143)
  })
  process.on('SIGINT', () => {
    saveCpuProfile()
    process.exit(130)
  })

  const { profile, mangling, experimentalAppOnly, output, port, snapshot } =
    options
  if (snapshot !== undefined) snapshotNameSchema.parse(snapshot)

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
  warnMissingReactDependencies(dir)

  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  await analyze({
    dir,
    reactProductionProfiling: profile,
    noMangling: !mangling,
    appDirOnly: experimentalAppOnly,
    output,
    port,
    snapshot,
  })
}

export { nextAnalyze, nextAnalyzeExport }
