import path from 'path'
import {
  DiagnosticCategory,
  getFormattedDiagnostic,
} from './diagnosticFormatter'
import { getTypeScriptConfiguration } from './getTypeScriptConfiguration'
import { getRequiredConfiguration } from './writeConfigurationDefaults'

import { CompileError } from '../compile-error'

export interface TypeCheckResult {
  hasWarnings: boolean
  warnings?: string[]
  inputFilesCount: number
  totalFilesCount: number
  incremental: boolean
}

export async function runTypeCheck(
  ts: typeof import('typescript'),
  baseDir: string,
  tsConfigPath: string,
  cacheDir?: string
): Promise<TypeCheckResult> {
  const effectiveConfiguration = await getTypeScriptConfiguration(
    ts,
    tsConfigPath
  )

  if (effectiveConfiguration.fileNames.length < 1) {
    return {
      hasWarnings: false,
      inputFilesCount: 0,
      totalFilesCount: 0,
      incremental: false,
    }
  }
  const requiredConfig = getRequiredConfiguration(ts)

  const options = {
    ...effectiveConfiguration.options,
    ...requiredConfig,
    noEmit: true,
  }

  let program:
    | import('typescript').Program
    | import('typescript').BuilderProgram
  let incremental = false
  if (options.incremental && cacheDir) {
    incremental = true
    program = ts.createIncrementalProgram({
      rootNames: effectiveConfiguration.fileNames,
      options: {
        ...options,
        incremental: true,
        tsBuildInfoFile: path.join(cacheDir, '.tsbuildinfo'),
      },
    })
  } else {
    program = ts.createProgram(effectiveConfiguration.fileNames, options)
  }
  const result = program.emit()

  // Intended to match:
  // - pages/test.js
  // - pages/apples.test.js
  // - pages/__tests__/a.js
  //
  // But not:
  // - pages/contest.js
  // - pages/other.js
  // - pages/test/a.js
  //
  const regexIgnoredFile = /[\\/]__(?:tests|mocks)__[\\/]|(?<=[\\/.])(?:spec|test)\.[^\\/]+$/
  const allDiagnostics = ts
    .getPreEmitDiagnostics(program as import('typescript').Program)
    .concat(result.diagnostics)
    .filter((d) => !(d.file && regexIgnoredFile.test(d.file.fileName)))

  const firstError =
    allDiagnostics.find(
      (d) => d.category === DiagnosticCategory.Error && Boolean(d.file)
    ) ?? allDiagnostics.find((d) => d.category === DiagnosticCategory.Error)

  if (firstError) {
    throw new CompileError(
      await getFormattedDiagnostic(ts, baseDir, firstError)
    )
  }

  const warnings = await Promise.all(
    allDiagnostics
      .filter((d) => d.category === DiagnosticCategory.Warning)
      .map((d) => getFormattedDiagnostic(ts, baseDir, d))
  )
  return {
    hasWarnings: true,
    warnings,
    inputFilesCount: effectiveConfiguration.fileNames.length,
    totalFilesCount: program.getSourceFiles().length,
    incremental,
  }
}
