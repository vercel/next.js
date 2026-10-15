import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { CompileError } from '../compile-error'
import type { TypeCheckResult } from './runTypeCheck'
import {
  filterTypeScriptFiles,
  type DebugBuildPaths,
  type TypeCheckDirs,
} from './filterTypeScriptFiles'
import {
  getTypeScriptConfigurationCli,
  runTypeScriptCli,
} from './runTypeScriptCli'

export async function runTypeCheckCli({
  baseDir,
  tsConfigPath,
  tscPath,
  cacheDir,
  dirs,
  debugBuildPaths,
  onFirstOutput,
}: {
  baseDir: string
  tsConfigPath: string
  tscPath: string
  cacheDir?: string
  dirs?: TypeCheckDirs
  debugBuildPaths?: DebugBuildPaths
  /**
   * Called once when `tsc` first produces output. Used to stop the build
   * spinner so it does not sit above the diagnostics.
   */
  onFirstOutput?: () => void
}): Promise<TypeCheckResult> {
  const configuration = await getTypeScriptConfigurationCli({
    baseDir,
    tsConfigPath,
    tscPath,
  })
  const incremental = Boolean(
    configuration.compilerOptions.incremental ||
      configuration.compilerOptions.composite
  )
  let projectPath = tsConfigPath
  let cleanup: (() => void) | undefined

  if (dirs && debugBuildPaths) {
    const configDir = path.dirname(path.resolve(baseDir, tsConfigPath))
    const fileNames = filterTypeScriptFiles(
      (configuration.files ?? []).map((file) => path.resolve(configDir, file)),
      dirs,
      debugBuildPaths
    )
    if (fileNames.length === 0) {
      return { incremental: false }
    }

    // Keep the config alongside the original so config-relative options (and
    // TypeScript 7's default rootDir) retain their meaning. Extending the original
    // preserves inherited options without loading the TypeScript compiler API.
    projectPath = path.join(
      configDir,
      `.next-debug-tsconfig-${randomUUID()}.json`
    )
    await writeFile(
      projectPath,
      JSON.stringify({
        extends: `./${path.basename(tsConfigPath)}`,
        files: fileNames,
        include: [],
        // Unlike compiler options, project references are not inherited.
        references: configuration.references,
      }),
      { flag: 'wx', mode: 0o600 }
    )
    cleanup = () => rmSync(projectPath, { force: true })
    // runTypeScriptCli exits directly on termination signals, bypassing finally.
    process.once('exit', cleanup)
  }

  try {
    const args = [
      '--project',
      projectPath,
      '--noEmit',
      '--declarationMap',
      'false',
      '--emitDeclarationOnly',
      'false',
    ]

    if (incremental && cacheDir) {
      args.push('--tsBuildInfoFile', path.join(cacheDir, '.tsbuildinfo'))
    }

    const result = await runTypeScriptCli({
      cwd: baseDir,
      tscPath,
      args,
      onFirstOutput,
    })

    if (result.exitCode !== 0) {
      throw new CompileError()
    }

    return { incremental }
  } finally {
    if (cleanup) {
      process.off('exit', cleanup)
      cleanup()
    }
  }
}
