#!/usr/bin/env node

import '../server/lib/cpu-profile'
import { saveCpuProfile } from '../server/lib/cpu-profile'
import { existsSync, readFileSync } from 'node:fs'
import { italic } from '../lib/picocolors'
import analyze from '../build/analyze'
import { warn } from '../build/output/log'
import { printAndExit } from '../server/lib/utils'
import { getProjectDir } from '../lib/get-project-dir'
import { warnMissingReactDependencies } from '../lib/warn-missing-react-dependencies'
import { isAbsolute, join, win32 } from 'node:path'
import { dumpAnalyzeGraph } from '../build/analyze/graph-dump'

export type NextAnalyzeOptions = {
  experimentalAnalyze?: boolean
  profile?: boolean
  mangling: boolean
  port: number
  output: boolean
  experimentalAppOnly?: boolean
  snapshotName?: string
}

export type NextAnalyzeExportOptions = {
  distDir?: string
  snapshot?: string
  route?: string
  snapshotName?: string
}

// Replay must not load next.config: user config can write to stdout and corrupt NDJSON.
function replayDistDir(distDir: string | undefined): string {
  const name = distDir ?? '.next'
  if (
    !name ||
    isAbsolute(name) ||
    win32.isAbsolute(name) ||
    /^[A-Za-z]:/.test(name) ||
    name.includes('\\') ||
    name.includes('\0') ||
    name
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Invalid --dist-dir: ${name}`)
  }
  return name
}

async function nextAnalyzeExport(
  options: NextAnalyzeExportOptions,
  directory?: string
): Promise<void> {
  const { snapshotName } = options
  if (options.snapshot !== undefined && snapshotName !== undefined) {
    throw new Error('--snapshot and --snapshot-name cannot be used together')
  }
  const dir = getProjectDir(directory)
  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }
  const analyzeDir = join(
    dir,
    replayDistDir(options.distDir),
    'diagnostics/analyze'
  )
  const index: unknown = JSON.parse(
    readFileSync(join(analyzeDir, 'history/history.json'), 'utf8')
  )
  if (
    !index ||
    typeof index !== 'object' ||
    !('snapshots' in index) ||
    !Array.isArray(index.snapshots) ||
    index.snapshots.some(
      (snapshot) =>
        !snapshot ||
        typeof snapshot.id !== 'string' ||
        (snapshot.snapshotName !== undefined &&
          typeof snapshot.snapshotName !== 'string')
    )
  ) {
    throw new Error('Invalid analyzer snapshot history')
  }
  const snapshots = index.snapshots as Array<{
    id: string
    snapshotName?: string
  }>
  let id = options.snapshot
  if (snapshotName !== undefined) {
    const matches = snapshots.filter(
      (snapshot) => snapshot.snapshotName === snapshotName
    )
    if (matches.length === 0) {
      throw new Error(`Analyzer snapshot name not found: ${snapshotName}`)
    }
    if (matches.length !== 1) {
      throw new Error(`Multiple analyzer snapshots are named: ${snapshotName}`)
    }
    id = matches[0].id
  } else {
    // Bare replay is convenient but a concurrent capture can change "latest".
    id ??= snapshots[0]?.id
  }
  if (!id || !snapshots.some((snapshot) => snapshot.id === id)) {
    throw new Error(`Analyzer snapshot not found: ${id ?? '(none)'}`)
  }
  await dumpAnalyzeGraph(analyzeDir, id, options.route, process.stdout)
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

  const { profile, mangling, experimentalAppOnly, output, port, snapshotName } =
    options

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
    snapshotName,
  })
}

export { nextAnalyze, nextAnalyzeExport }
