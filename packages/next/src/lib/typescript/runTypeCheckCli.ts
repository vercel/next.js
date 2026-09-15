import path from 'node:path'

import { CompileError } from '../compile-error'
import type { TypeCheckResult } from './runTypeCheck'
import { runTypeScriptCli } from './runTypeScriptCli'
import { loadTsConfigOptions } from './loadTsConfig'

export async function runTypeCheckCli({
  baseDir,
  tsConfigPath,
  tscPath,
  cacheDir,
  onFirstOutput,
}: {
  baseDir: string
  tsConfigPath: string
  tscPath: string
  cacheDir?: string
  /**
   * Called once when `tsc` first produces output. Used to stop the build
   * spinner so it does not sit above the diagnostics.
   */
  onFirstOutput?: () => void
}): Promise<TypeCheckResult> {
  // Read from the tsconfig directly to avoid the overhead of launching a subprocess.
  const compilerOptions = loadTsConfigOptions(tsConfigPath)
  const incremental = Boolean(
    compilerOptions.incremental || compilerOptions.composite
  )
  const args = [
    '--project',
    tsConfigPath,
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

  return {
    hasWarnings: false,
    incremental,
  }
}
