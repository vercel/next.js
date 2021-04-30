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
}

export async function runTypeCheck(
  ts: typeof import('typescript'),
  baseDir: string,
  tsConfigPath: string
): Promise<TypeCheckResult> {
  const effectiveConfiguration = await getTypeScriptConfiguration(
    ts,
    tsConfigPath
  )

  if (effectiveConfiguration.fileNames.length < 1) {
    return { hasWarnings: false }
  }
  const requiredConfig = getRequiredConfiguration(ts)

  const program = ts.createProgram(effectiveConfiguration.fileNames, {
    ...effectiveConfiguration.options,
    ...requiredConfig,
    noEmit: true,
  })
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
    .getPreEmitDiagnostics(program)
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
  return { hasWarnings: true, warnings }
}
