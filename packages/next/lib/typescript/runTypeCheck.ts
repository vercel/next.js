import {
  DiagnosticCategory,
  getFormattedDiagnostic,
} from './diagnosticFormatter'
import { getTypeScriptConfiguration } from './getTypeScriptConfiguration'
import { TypeScriptCompileError } from './TypeScriptCompileError'
import { getRequiredConfiguration } from './writeConfigurationDefaults'

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

  const regexIgnoredFile = /[\\/]__(?:tests|mocks)__[\\/]|(?:spec|test)\.[^\\/]+$/
  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(result.diagnostics)
    .filter((d) => !(d.file && regexIgnoredFile.test(d.file.fileName)))

  const firstError =
    allDiagnostics.find(
      (d) => d.category === DiagnosticCategory.Error && Boolean(d.file)
    ) ?? allDiagnostics.find((d) => d.category === DiagnosticCategory.Error)

  if (firstError) {
    throw new TypeScriptCompileError(
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
