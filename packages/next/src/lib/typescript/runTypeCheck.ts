import path from 'path'
import { getFormattedDiagnostic } from './diagnosticFormatter'
import { getTypeScriptConfiguration } from './getTypeScriptConfiguration'
import { getRequiredConfiguration } from './writeConfigurationDefaults'

import { CompileError } from '../compile-error'
import { warn } from '../../build/output/log'

export interface TypeCheckResult {
  hasWarnings: boolean
  warnings?: string[]
  inputFilesCount: number
  totalFilesCount: number
  incremental: boolean
}

export async function runTypeCheck(
  typescript: typeof import('typescript'),
  baseDir: string,
  distDir: string,
  tsConfigPath: string,
  cacheDir?: string,
  isAppDirEnabled?: boolean
): Promise<TypeCheckResult> {
  const effectiveConfiguration = await getTypeScriptConfiguration(
    typescript,
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
  const requiredConfig = getRequiredConfiguration(typescript)

  const options = {
    ...requiredConfig,
    ...effectiveConfiguration.options,
    declarationMap: false,
    emitDeclarationOnly: false,
    noEmit: true,
  }

  let program:
    | import('typescript').Program
    | import('typescript').BuilderProgram
  let incremental = false
  if ((options.incremental || options.composite) && cacheDir) {
    if (options.composite) {
      warn(
        'TypeScript project references are not fully supported. Attempting to build in incremental mode.'
      )
    }
    incremental = true
    program = typescript.createIncrementalProgram({
      rootNames: effectiveConfiguration.fileNames,
      options: {
        ...options,
        composite: false,
        incremental: true,
        tsBuildInfoFile: path.join(cacheDir, '.tsbuildinfo'),
      },
    })
  } else {
    program = typescript.createProgram(
      effectiveConfiguration.fileNames,
      options
    )
  }

  const result = program.emit()

  const ignoreRegex = [
    // matches **/__(tests|mocks)__/**
    /[\\/]__(?:tests|mocks)__[\\/]/,
    // matches **/*.(spec|test).*
    /(?<=[\\/.])(?:spec|test)\.[^\\/]+$/,
  ]
  const regexIgnoredFile = new RegExp(
    ignoreRegex.map((r) => r.source).join('|')
  )

  const allDiagnostics = typescript
    .getPreEmitDiagnostics(program as import('typescript').Program)
    .concat(result.diagnostics)
    .filter((d) => !(d.file && regexIgnoredFile.test(d.file.fileName)))

  const firstError =
    allDiagnostics.find(
      (d) =>
        d.category === typescript.DiagnosticCategory.Error && Boolean(d.file)
    ) ??
    allDiagnostics.find(
      (d) => d.category === typescript.DiagnosticCategory.Error
    )

  // In test mode, we want to check all diagnostics, not just the first one.
  if (process.env.__NEXT_TEST_MODE) {
    if (firstError) {
      const allErrors = allDiagnostics
        .filter((d) => d.category === typescript.DiagnosticCategory.Error)
        .map(
          (d) =>
            '[Test Mode] ' +
            getFormattedDiagnostic(
              typescript,
              baseDir,
              distDir,
              d,
              isAppDirEnabled
            )
        )

      console.error(
        '\n\n===== TS errors =====\n\n' +
          allErrors.join('\n\n') +
          '\n\n===== TS errors =====\n\n'
      )

      // Make sure all stdout is flushed before we exit.
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  if (firstError) {
    throw new CompileError(
      getFormattedDiagnostic(
        typescript,
        baseDir,
        distDir,
        firstError,
        isAppDirEnabled
      )
    )
  }

  const warnings = allDiagnostics
    .filter((d) => d.category === typescript.DiagnosticCategory.Warning)
    .map((d) =>
      getFormattedDiagnostic(typescript, baseDir, distDir, d, isAppDirEnabled)
    )

  return {
    hasWarnings: true,
    warnings,
    inputFilesCount: effectiveConfiguration.fileNames.length,
    totalFilesCount: program.getSourceFiles().length,
    incremental,
  }
}
