import path from 'node:path'

import semver from 'next/dist/compiled/semver'
import { CompileError } from '../compile-error'
import type { TypeCheckResult } from './runTypeCheck'
import {
  getTypeScriptConfigurationCli,
  runTypeScriptCli,
} from './runTypeScriptCli'

/**
 * Whether `tsc` accepts `--runExternalCode`. TypeScript 7.1 added the flag;
 * earlier versions refuse to start when they see it.
 */
export function supportsRunExternalCode(typescriptVersion: string): boolean {
  // `7.1.0-0` sorts before every 7.1 prerelease, so betas and nightlies count.
  return semver.gte(typescriptVersion, '7.1.0-0')
}

export async function runTypeCheckCli({
  baseDir,
  tsConfigPath,
  tscPath,
  typescriptVersion,
  cacheDir,
  onFirstOutput,
}: {
  baseDir: string
  tsConfigPath: string
  tscPath: string
  typescriptVersion: string
  cacheDir?: string
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
  const args = [
    '--project',
    tsConfigPath,
    '--noEmit',
    '--declarationMap',
    'false',
    '--emitDeclarationOnly',
    'false',
  ]

  // TypeScript 7.1 only runs the content mappers listed in a tsconfig when this
  // flag is set. Without them, imports of the files they handle (`.mdx`,
  // `.vue`, `.sql`, ...) fail to type-check.
  if (supportsRunExternalCode(typescriptVersion)) {
    args.push('--runExternalCode')
  }

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
    incremental,
  }
}
